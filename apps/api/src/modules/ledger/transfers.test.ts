/**
 * Todos los datos de este fichero son inventados.
 *
 * Lo que se prueba aquí no es la heurística —eso ya tiene sus tests en
 * `packages/core`— sino lo que este módulo añade encima: que persistir cumple
 * los invariantes 2 y 3, que volver a pasar no duplica, que deshacer devuelve
 * las dos patas al montón, y qué acepta y qué rechaza el emparejado manual.
 */
import { eq, isNotNull } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../../db/client'
import {
  INTERNAL_TRANSFER_SLUG,
  type NewTransaction,
  transactions,
  transfers,
} from '../../db/schema'
import { createTestDb, insertAccount, insertCategory, insertImport } from '../../db/testing'
import {
  InvalidTransferPairError,
  TransactionAlreadyPairedError,
  TransactionNotFoundError,
  TransferNotFoundError,
} from './errors'
import {
  confirmTransfer,
  createManualTransfer,
  findTransfer,
  listTransfers,
  matchSignalsOf,
  recordInternalTransfers,
  undoTransfer,
} from './transfers'

const HOLDER = ['Titular Ejemplo']

let db: Db
let unicaja: number
let revolut: number
let internalTransferId: number

/** Contador para que cada movimiento tenga su `source_hash`. */
let counter = 0

function insertTransaction(accountId: number, overrides: Partial<NewTransaction> = {}): number {
  counter += 1
  const importId = insertImport(db, { accountId })
  const row = db
    .insert(transactions)
    .values({
      accountId,
      importId,
      bookedAt: '2026-03-15',
      amountCents: -20000,
      currency: 'EUR',
      counterparty: null,
      description: 'Traspaso',
      sourceHash: `hash-transfers-${counter}`,
      raw: {},
      ...overrides,
    })
    .returning({ id: transactions.id })
    .get()
  if (row === undefined) throw new Error('No se pudo insertar el movimiento de prueba')
  return row.id
}

/** Un traspaso completo: el cargo en Unicaja y el abono en Revolut. */
function traspaso(amountCents = 20000, bookedAt = '2026-03-15'): { out: number; in: number } {
  return {
    out: insertTransaction(unicaja, {
      amountCents: -amountCents,
      bookedAt,
      description: 'TRANSF A REVOLUT',
    }),
    in: insertTransaction(revolut, {
      amountCents,
      bookedAt,
      counterparty: 'Titular Ejemplo',
      description: 'Ingreso',
    }),
  }
}

function categoryOf(id: number) {
  return db
    .select({ categoryId: transactions.categoryId, categorySource: transactions.categorySource })
    .from(transactions)
    .where(eq(transactions.id, id))
    .get()
}

beforeEach(() => {
  db = createTestDb()
  unicaja = insertAccount(db, { name: 'Unicaja nómina', provider: 'unicaja' })
  revolut = insertAccount(db, { name: 'Revolut', provider: 'revolut', type: 'card' })
  internalTransferId = insertCategory(db, {
    slug: INTERNAL_TRANSFER_SLUG,
    name: 'Transferencia interna',
    kind: 'internal',
  })
})

describe('recordInternalTransfers', () => {
  it('escribe la transferencia y marca las dos patas (invariantes 2 y 3)', () => {
    const par = traspaso()

    expect(recordInternalTransfers(db, { holderNames: HOLDER })).toEqual({
      created: 1,
      unresolved: 0,
    })

    const row = db.select().from(transfers).get()
    expect(row?.outTxnId).toBe(par.out)
    expect(row?.inTxnId).toBe(par.in)
    expect(row?.status).toBe('auto')

    for (const legId of [par.out, par.in]) {
      const leg = db.select().from(transactions).where(eq(transactions.id, legId)).get()
      expect(leg?.transferId).toBe(row?.id)
      // Invariante 3, y con el origen que dice de dónde viene esa categoría.
      expect(leg?.categoryId).toBe(internalTransferId)
      expect(leg?.categorySource).toBe('transfer')
    }
  })

  it('anota las señales que dispararon el emparejamiento', () => {
    traspaso()
    recordInternalTransfers(db, { holderNames: HOLDER })

    const row = db.select().from(transfers).get()
    if (row === undefined) throw new Error('No se ha escrito la transferencia')

    // El cargo nombra a Revolut, el abono al titular, y las fechas son la misma.
    expect(matchSignalsOf(row)).toEqual(['other_provider_named', 'holder_named', 'close_dates'])
  })

  it('es idempotente: lo ya emparejado no vuelve a ser candidato', () => {
    traspaso()

    expect(recordInternalTransfers(db, { holderNames: HOLDER }).created).toBe(1)
    expect(recordInternalTransfers(db, { holderNames: HOLDER }).created).toBe(0)
    expect(db.select().from(transfers).all()).toHaveLength(1)
  })

  it('empareja un traspaso nuevo sin tocar los anteriores', () => {
    traspaso(20000, '2026-03-15')
    recordInternalTransfers(db, { holderNames: HOLDER })

    traspaso(31000, '2026-04-15')
    expect(recordInternalTransfers(db, { holderNames: HOLDER }).created).toBe(1)
    expect(db.select().from(transfers).all()).toHaveLength(2)
  })

  it('no empareja movimientos de una cuenta ajena (criterio (a))', () => {
    const ajena = insertAccount(db, {
      name: 'Cuenta de un amigo',
      provider: 'manual',
      isOwn: false,
    })
    insertTransaction(unicaja, { amountCents: -20000 })
    insertTransaction(ajena, { amountCents: 20000 })

    expect(recordInternalTransfers(db, { holderNames: HOLDER }).created).toBe(0)
  })

  it('deja sin emparejar —y avisa— cuando hay empate', () => {
    // Dos abonos idénticos: ninguno es el mejor inequívoco del cargo.
    insertTransaction(unicaja, { amountCents: -20000, description: 'Traspaso' })
    insertTransaction(revolut, { amountCents: 20000, description: 'Ingreso' })
    insertTransaction(revolut, { amountCents: 20000, description: 'Ingreso' })

    const outcome = recordInternalTransfers(db, { holderNames: HOLDER })
    expect(outcome.created).toBe(0)
    expect(outcome.unresolved).toBeGreaterThan(0)
  })

  it('ignora los movimientos borrados (invariante 5)', () => {
    const par = traspaso()
    db.update(transactions).set({ deletedAt: new Date() }).where(eq(transactions.id, par.in)).run()

    expect(recordInternalTransfers(db, { holderNames: HOLDER }).created).toBe(0)
  })

  it('sin nombres de titular sigue emparejando: la puntuación desempata, no acepta', () => {
    traspaso()

    expect(recordInternalTransfers(db, { holderNames: [] }).created).toBe(1)
  })
})

describe('listTransfers', () => {
  it('devuelve las dos patas dentro de cada transferencia', () => {
    const par = traspaso()
    recordInternalTransfers(db, { holderNames: HOLDER })

    const { rows, total } = listTransfers(db, { limit: 50, offset: 0 })
    expect(total).toBe(1)
    expect(rows[0]?.out.id).toBe(par.out)
    expect(rows[0]?.in.id).toBe(par.in)
  })

  it('filtra por estado, que es de donde sale la bandeja de «sin revisar»', () => {
    traspaso(20000, '2026-03-15')
    traspaso(31000, '2026-04-15')
    recordInternalTransfers(db, { holderNames: HOLDER })

    const [primera] = db.select().from(transfers).all()
    if (primera === undefined) throw new Error('No se han escrito las transferencias')
    confirmTransfer(db, primera.id)

    expect(listTransfers(db, { status: 'auto', limit: 50, offset: 0 }).total).toBe(1)
    expect(listTransfers(db, { status: 'confirmed', limit: 50, offset: 0 }).total).toBe(1)
    expect(listTransfers(db, { limit: 50, offset: 0 }).total).toBe(2)
  })
})

describe('confirmTransfer', () => {
  it('pasa de auto a confirmed', () => {
    traspaso()
    recordInternalTransfers(db, { holderNames: HOLDER })
    const id = db.select().from(transfers).get()?.id
    if (id === undefined) throw new Error('No se ha escrito la transferencia')

    expect(confirmTransfer(db, id).transfer.status).toBe('confirmed')
  })

  it('confirmar dos veces no es un error', () => {
    traspaso()
    recordInternalTransfers(db, { holderNames: HOLDER })
    const id = db.select().from(transfers).get()?.id
    if (id === undefined) throw new Error('No se ha escrito la transferencia')

    confirmTransfer(db, id)
    expect(confirmTransfer(db, id).transfer.status).toBe('confirmed')
  })

  it('una que no existe es un error del que la pide', () => {
    expect(() => confirmTransfer(db, 999)).toThrow(TransferNotFoundError)
  })
})

describe('undoTransfer', () => {
  it('borra la fila y devuelve las dos patas al montón', () => {
    const par = traspaso()
    recordInternalTransfers(db, { holderNames: HOLDER })
    const id = db.select().from(transfers).get()?.id
    if (id === undefined) throw new Error('No se ha escrito la transferencia')

    const freed = undoTransfer(db, id)

    expect(freed.map((row) => row.id).sort()).toEqual([par.out, par.in].sort())
    expect(db.select().from(transfers).all()).toHaveLength(0)
    for (const legId of [par.out, par.in]) {
      expect(categoryOf(legId)).toEqual({ categoryId: null, categorySource: null })
    }
    expect(
      db.select().from(transactions).where(isNotNull(transactions.transferId)).all(),
    ).toHaveLength(0)
  })

  it('las patas liberadas vuelven a ser candidatas', () => {
    traspaso()
    recordInternalTransfers(db, { holderNames: HOLDER })
    const id = db.select().from(transfers).get()?.id
    if (id === undefined) throw new Error('No se ha escrito la transferencia')

    undoTransfer(db, id)

    // Si el criterio (d) no se hubiera limpiado, esto emparejaría 0.
    expect(recordInternalTransfers(db, { holderNames: HOLDER }).created).toBe(1)
  })

  it('una que no existe es un error del que la pide', () => {
    expect(() => undoTransfer(db, 999)).toThrow(TransferNotFoundError)
  })
})

describe('createManualTransfer', () => {
  it('empareja dos movimientos cuyos importes no cuadran', () => {
    // El caso borde de DATA_MODEL.md: la recarga de Revolut con tarjeta llega a
    // Unicaja con otro importe, así que la heurística no la ve.
    const out = insertTransaction(unicaja, { amountCents: -5012, description: 'PAGO TARJETA' })
    const into = insertTransaction(revolut, { amountCents: 5000, description: 'Recarga' })

    const record = createManualTransfer(db, { outTxnId: out, inTxnId: into })

    expect(record.transfer.status).toBe('manual')
    expect(matchSignalsOf(record.transfer)).toEqual([])
    expect(categoryOf(out)).toEqual({
      categoryId: internalTransferId,
      categorySource: 'transfer',
    })
  })

  it('empareja dos movimientos en divisas distintas', () => {
    const out = insertTransaction(unicaja, { amountCents: -10000, currency: 'EUR' })
    const into = insertTransaction(revolut, { amountCents: 8500, currency: 'GBP' })

    expect(() => createManualTransfer(db, { outTxnId: out, inTxnId: into })).not.toThrow()
  })

  it('rechaza dos cargos', () => {
    const out = insertTransaction(unicaja, { amountCents: -10000 })
    const otro = insertTransaction(revolut, { amountCents: -10000 })

    expect(() => createManualTransfer(db, { outTxnId: out, inTxnId: otro })).toThrow(
      InvalidTransferPairError,
    )
  })

  it('rechaza dos movimientos de la misma cuenta', () => {
    const out = insertTransaction(unicaja, { amountCents: -10000 })
    const into = insertTransaction(unicaja, { amountCents: 10000 })

    expect(() => createManualTransfer(db, { outTxnId: out, inTxnId: into })).toThrow(
      InvalidTransferPairError,
    )
  })

  it('rechaza una cuenta que no es propia', () => {
    const ajena = insertAccount(db, {
      name: 'Cuenta de un amigo',
      provider: 'manual',
      isOwn: false,
    })
    const out = insertTransaction(unicaja, { amountCents: -10000 })
    const into = insertTransaction(ajena, { amountCents: 10000 })

    expect(() => createManualTransfer(db, { outTxnId: out, inTxnId: into })).toThrow(
      InvalidTransferPairError,
    )
  })

  it('rechaza una pata que ya está emparejada (invariante 2)', () => {
    const par = traspaso()
    recordInternalTransfers(db, { holderNames: HOLDER })
    const suelto = insertTransaction(revolut, { amountCents: 20000 })

    expect(() => createManualTransfer(db, { outTxnId: par.out, inTxnId: suelto })).toThrow(
      TransactionAlreadyPairedError,
    )
  })

  it('rechaza un movimiento que no existe o está borrado', () => {
    const into = insertTransaction(revolut, { amountCents: 10000 })

    expect(() => createManualTransfer(db, { outTxnId: 999, inTxnId: into })).toThrow(
      TransactionNotFoundError,
    )
  })
})

describe('findTransfer', () => {
  it('devuelve undefined si no existe', () => {
    expect(findTransfer(db, 999)).toBeUndefined()
  })
})

describe('matchSignalsOf', () => {
  it('tolera una columna vacía o con basura sin tumbar la lectura', () => {
    const base = {
      id: 1,
      outTxnId: 1,
      inTxnId: 2,
      status: 'manual' as const,
      createdAt: new Date(),
    }

    expect(matchSignalsOf({ ...base, matchedBy: null })).toEqual([])
    expect(matchSignalsOf({ ...base, matchedBy: 'no soy json' })).toEqual([])
    expect(matchSignalsOf({ ...base, matchedBy: '["señal_inventada"]' })).toEqual([])
    expect(matchSignalsOf({ ...base, matchedBy: '["close_dates"]' })).toEqual(['close_dates'])
  })
})
