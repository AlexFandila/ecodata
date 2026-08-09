/**
 * Todos los datos de este fichero son inventados: ni conceptos bancarios, ni
 * titulares, ni importes corresponden a nada real.
 *
 * Lo que se prueba aquí es el borde HTTP: qué código de estado y qué `code` de
 * error sale en cada caso, y que las respuestas caben en su contrato. La lógica
 * está probada en `modules/ledger/transfers.test.ts`.
 */
import {
  errorResponseSchema,
  listTransfersResponseSchema,
  matchTransfersResponseSchema,
  transferWithLegsSchema,
  undoTransferResponseSchema,
} from '@finanzas/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../../db/client'
import { INTERNAL_TRANSFER_SLUG, type NewTransaction, transactions } from '../../db/schema'
import { createTestDb, insertAccount, insertCategory, insertImport } from '../../db/testing'
import { createApp } from '../app'

const HOLDER_NAMES = ['Titular Ejemplo']

let db: Db
let app: ReturnType<typeof createApp>
let unicaja: number
let revolut: number
let counter = 0

function insertTransaction(accountId: number, overrides: Partial<NewTransaction> = {}): number {
  counter += 1
  const row = db
    .insert(transactions)
    .values({
      accountId,
      importId: insertImport(db, { accountId }),
      bookedAt: '2026-03-15',
      amountCents: -20000,
      currency: 'EUR',
      counterparty: null,
      description: 'Traspaso',
      sourceHash: `hash-ruta-transfers-${counter}`,
      raw: {},
      ...overrides,
    })
    .returning({ id: transactions.id })
    .get()
  if (row === undefined) throw new Error('No se pudo crear el movimiento de prueba')
  return row.id
}

function traspaso(amountCents = 20000, bookedAt = '2026-03-15') {
  return {
    out: insertTransaction(unicaja, {
      amountCents: -amountCents,
      bookedAt,
      description: 'TRANSF A REVOLUT',
    }),
    in: insertTransaction(revolut, { amountCents, bookedAt, counterparty: 'Titular Ejemplo' }),
  }
}

/** Empareja lo que haya y devuelve el id de la primera transferencia. */
async function match(): Promise<number> {
  const response = await app.request('/transfers/match', { method: 'POST' })
  matchTransfersResponseSchema.parse(await response.json())

  const listed = listTransfersResponseSchema.parse(await (await app.request('/transfers')).json())
  const first = listed.transfers[0]
  if (first === undefined) throw new Error('No se ha emparejado ninguna transferencia')
  return first.id
}

beforeEach(() => {
  db = createTestDb()
  app = createApp(db, { holderNames: HOLDER_NAMES })
  unicaja = insertAccount(db, { name: 'Unicaja nómina', provider: 'unicaja' })
  revolut = insertAccount(db, { name: 'Revolut', provider: 'revolut', type: 'card' })
  insertCategory(db, {
    slug: INTERNAL_TRANSFER_SLUG,
    name: 'Transferencia interna',
    kind: 'internal',
  })
})

describe('GET /transfers', () => {
  it('devuelve la lista vacía con su paginación, no un array pelado', async () => {
    const response = await app.request('/transfers')

    expect(response.status).toBe(200)
    expect(listTransfersResponseSchema.parse(await response.json())).toEqual({
      transfers: [],
      total: 0,
      limit: 50,
      offset: 0,
    })
  })

  it('trae las dos patas dentro de cada transferencia', async () => {
    const par = traspaso()
    await match()

    const body = listTransfersResponseSchema.parse(await (await app.request('/transfers')).json())

    expect(body.total).toBe(1)
    expect(body.transfers[0]?.out.id).toBe(par.out)
    expect(body.transfers[0]?.in.id).toBe(par.in)
    expect(body.transfers[0]?.status).toBe('auto')
    expect(body.transfers[0]?.matchedBy).toContain('close_dates')
  })

  it('rechaza un estado que no existe', async () => {
    const response = await app.request('/transfers?status=rechazada')

    expect(response.status).toBe(400)
    expect(errorResponseSchema.parse(await response.json()).error.code).toBe('validation_error')
  })
})

describe('POST /transfers/match', () => {
  it('cuenta lo que ha emparejado y lo que ha quedado ambiguo', async () => {
    traspaso()
    const response = await app.request('/transfers/match', { method: 'POST' })

    expect(response.status).toBe(200)
    expect(matchTransfersResponseSchema.parse(await response.json())).toEqual({
      created: 1,
      unresolved: 0,
    })
  })

  it('volver a pulsarlo no crea nada nuevo', async () => {
    traspaso()
    await app.request('/transfers/match', { method: 'POST' })

    const second = await app.request('/transfers/match', { method: 'POST' })
    expect(matchTransfersResponseSchema.parse(await second.json()).created).toBe(0)
  })
})

describe('PATCH /transfers/:id/status', () => {
  function confirm(id: number | string, body: unknown = { status: 'confirmed' }) {
    return app.request(`/transfers/${id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  }

  it('confirma una transferencia emparejada por la heurística', async () => {
    traspaso()
    const id = await match()

    const response = await confirm(id)

    expect(response.status).toBe(200)
    expect(transferWithLegsSchema.parse(await response.json()).status).toBe('confirmed')
  })

  it('una que no existe es un 404', async () => {
    const response = await confirm(999)

    expect(response.status).toBe(404)
    expect(errorResponseSchema.parse(await response.json()).error.code).toBe('not_found')
  })

  it('un identificador que no es un entero positivo no llega a la consulta', async () => {
    const response = await confirm('mañana')

    expect(response.status).toBe(400)
    expect(errorResponseSchema.parse(await response.json()).error.code).toBe('validation_error')
  })

  it('no admite ningún otro estado: deshacer es un DELETE', async () => {
    traspaso()
    const id = await match()

    const response = await confirm(id, { status: 'auto' })

    expect(response.status).toBe(400)
    expect(errorResponseSchema.parse(await response.json()).error.code).toBe('validation_error')
  })
})

describe('DELETE /transfers/:id', () => {
  it('deshace y devuelve las dos patas ya liberadas', async () => {
    const par = traspaso()
    const id = await match()

    const response = await app.request(`/transfers/${id}`, { method: 'DELETE' })

    expect(response.status).toBe(200)
    const body = undoTransferResponseSchema.parse(await response.json())
    expect(body.transactions.map((row) => row.id).sort()).toEqual([par.out, par.in].sort())
    expect(body.transactions.every((row) => row.transferId === null)).toBe(true)

    // Y desaparece de la lista, que es lo que la pantalla espera ver.
    const listed = listTransfersResponseSchema.parse(await (await app.request('/transfers')).json())
    expect(listed.total).toBe(0)
  })

  it('las patas liberadas vuelven a la bandeja si ninguna regla las reclama', async () => {
    traspaso()
    const id = await match()

    const response = await app.request(`/transfers/${id}`, { method: 'DELETE' })
    const body = undoTransferResponseSchema.parse(await response.json())

    expect(body.transactions.every((row) => row.categoryId === null)).toBe(true)
    expect(body.transactions.every((row) => row.categorySource === null)).toBe(true)
  })

  it('una que no existe es un 404', async () => {
    const response = await app.request('/transfers/999', { method: 'DELETE' })

    expect(response.status).toBe(404)
    expect(errorResponseSchema.parse(await response.json()).error.code).toBe('not_found')
  })
})

describe('POST /transfers · emparejar a mano', () => {
  function create(body: unknown) {
    return app.request('/transfers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  }

  it('empareja dos movimientos cuyos importes no cuadran', async () => {
    const out = insertTransaction(unicaja, { amountCents: -5012, description: 'PAGO TARJETA' })
    const into = insertTransaction(revolut, { amountCents: 5000, description: 'Recarga' })

    const response = await create({ outTxnId: out, inTxnId: into })

    expect(response.status).toBe(201)
    const body = transferWithLegsSchema.parse(await response.json())
    expect(body.status).toBe('manual')
    expect(body.matchedBy).toEqual([])
  })

  it('un movimiento que no existe es un 404', async () => {
    const into = insertTransaction(revolut, { amountCents: 10000 })

    const response = await create({ outTxnId: 999, inTxnId: into })

    expect(response.status).toBe(404)
    expect(errorResponseSchema.parse(await response.json()).error.code).toBe('not_found')
  })

  it('una pata ya emparejada es un conflicto de estado, no de la petición', async () => {
    const par = traspaso()
    await match()
    const suelto = insertTransaction(revolut, { amountCents: 20000 })

    const response = await create({ outTxnId: par.out, inTxnId: suelto })

    expect(response.status).toBe(409)
    expect(errorResponseSchema.parse(await response.json()).error.code).toBe('conflict')
  })

  it('dos cargos también son un conflicto de estado', async () => {
    const out = insertTransaction(unicaja, { amountCents: -10000 })
    const otro = insertTransaction(revolut, { amountCents: -10000 })

    const response = await create({ outTxnId: out, inTxnId: otro })

    expect(response.status).toBe(409)
    expect(errorResponseSchema.parse(await response.json()).error.code).toBe('conflict')
  })

  it('un cuerpo sin los dos ids no pasa del contrato', async () => {
    const response = await create({ outTxnId: 1 })

    expect(response.status).toBe(400)
    expect(errorResponseSchema.parse(await response.json()).error.code).toBe('validation_error')
  })

  it('un cuerpo que no es JSON tampoco', async () => {
    const response = await create('{')

    expect(response.status).toBe(400)
    expect(errorResponseSchema.parse(await response.json()).error.code).toBe('validation_error')
  })
})

describe('las patas no salen del listado normal de movimientos (invariante 3)', () => {
  it('desaparecen al emparejarse y vuelven al deshacer', async () => {
    traspaso()

    const visibles = async () => {
      const response = await app.request('/transactions')
      const body = (await response.json()) as { total: number }
      return body.total
    }

    expect(await visibles()).toBe(2)

    const id = await match()
    expect(await visibles()).toBe(0)

    await app.request(`/transfers/${id}`, { method: 'DELETE' })
    expect(await visibles()).toBe(2)
  })
})
