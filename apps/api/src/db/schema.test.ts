/**
 * Los invariantes de docs/DATA_MODEL.md, probados **fallando**.
 *
 * Un test que solo comprueba que una fila entra no demuestra nada: lo que hay
 * que demostrar es que la fila mala NO entra. Cada bloque de aquí intenta
 * violar un invariante y exige que la base lo rechace.
 */
import { CURRENCY_CODES as coreCurrencies } from '@finanzas/core'
import { CURRENCY_CODES as sharedCurrencies } from '@finanzas/shared'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from './client'
import type { NewRule, NewTransaction } from './schema'
import { accounts, categories, rules, transactions, transfers } from './schema'
import {
  createTestDb,
  insertAccount,
  insertCategory,
  insertImport,
  seedContext,
  transactionValues,
} from './testing'

let db: Db
let context: { accountId: number; importId: number }

beforeEach(() => {
  db = createTestDb()
  context = seedContext(db)
})

/**
 * Salta los tipos a propósito.
 *
 * Varios de estos tests comprueban que la base rechaza un valor que TypeScript
 * ya rechazaría. No es redundante: los `CHECK` existen para el dato que llega
 * sin pasar por el compilador —SQL directo, una migración, un `JSON.parse` de
 * un CSV— y son la garantía que sigue en pie cuando los tipos no están.
 */
function sinTipar<T>(value: unknown): T {
  return value as T
}

/** Inserta un movimiento y devuelve su id. */
function insertTransaction(overrides: Partial<NewTransaction> = {}): number {
  const row = db
    .insert(transactions)
    .values(transactionValues(context, overrides))
    .returning({ id: transactions.id })
    .get()
  if (row === undefined) throw new Error('No se pudo insertar el movimiento')
  return row.id
}

describe('invariante 1 — source_hash único (deduplicación)', () => {
  it('rechaza reimportar el mismo movimiento', () => {
    insertTransaction({ sourceHash: 'hash-repetido' })

    expect(() => insertTransaction({ sourceHash: 'hash-repetido' })).toThrow(/UNIQUE/i)
  })

  it('admite el mismo importe y fecha si el hash difiere', () => {
    insertTransaction({ sourceHash: 'hash-a' })
    insertTransaction({ sourceHash: 'hash-b' })

    const rows = db.select().from(transactions).all()
    expect(rows).toHaveLength(2)
  })
})

describe('invariante 2 — un movimiento en una sola transferencia', () => {
  it('rechaza reutilizar la pata de salida en otra transferencia', () => {
    const salida = insertTransaction({ amountCents: -20_000 })
    const entrada = insertTransaction({ amountCents: 20_000 })
    const otra = insertTransaction({ amountCents: 20_000 })
    db.insert(transfers).values({ outTxnId: salida, inTxnId: entrada, status: 'auto' }).run()

    expect(() =>
      db.insert(transfers).values({ outTxnId: salida, inTxnId: otra, status: 'auto' }).run(),
    ).toThrow(/UNIQUE/i)
  })

  it('rechaza una transferencia cuyas dos patas son el mismo movimiento', () => {
    const movimiento = insertTransaction()

    expect(() =>
      db
        .insert(transfers)
        .values({ outTxnId: movimiento, inTxnId: movimiento, status: 'auto' })
        .run(),
    ).toThrow(/CHECK/i)
  })
})

describe('invariante 7 — categoría y su origen van juntos', () => {
  it('rechaza una categoría sin origen', () => {
    const categoryId = insertCategory(db)

    expect(() => insertTransaction({ categoryId })).toThrow(/CHECK/i)
  })

  it('rechaza un origen sin categoría', () => {
    expect(() => insertTransaction({ categorySource: 'manual' })).toThrow(/CHECK/i)
  })

  it('rechaza un origen que no existe', () => {
    const categoryId = insertCategory(db)

    expect(() => insertTransaction({ categoryId, categorySource: sinTipar('inventado') })).toThrow(
      /CHECK/i,
    )
  })

  it('admite categoría con origen', () => {
    const categoryId = insertCategory(db)
    const id = insertTransaction({ categoryId, categorySource: 'rule' })

    expect(id).toBeGreaterThan(0)
  })
})

describe('invariante 6 — saldo = apertura + movimientos no borrados', () => {
  it('excluye los movimientos con deleted_at del saldo', () => {
    const accountId = insertAccount(db, { openingBalanceCents: 100_000 })
    const importId = insertImport(db)
    const propio = { accountId, importId }

    db.insert(transactions)
      .values(transactionValues(propio, { amountCents: -30_000 }))
      .run()
    db.insert(transactions)
      .values(transactionValues(propio, { amountCents: 5_000 }))
      .run()
    // Un movimiento borrado: no debe contar.
    db.insert(transactions)
      .values(transactionValues(propio, { amountCents: -50_000, deletedAt: new Date() }))
      .run()

    const [movimientos] = db
      .select({ total: sql<number>`coalesce(sum(${transactions.amountCents}), 0)` })
      .from(transactions)
      .where(and(eq(transactions.accountId, accountId), isNull(transactions.deletedAt)))
      .all()

    const [cuenta] = db
      .select({ apertura: accounts.openingBalanceCents })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .all()

    expect(movimientos?.total).toBe(-25_000)
    expect((cuenta?.apertura ?? 0) + (movimientos?.total ?? 0)).toBe(75_000)
  })

  it('un movimiento borrado se puede restaurar poniendo deleted_at a null', () => {
    const id = insertTransaction({ deletedAt: new Date() })
    db.update(transactions).set({ deletedAt: null }).where(eq(transactions.id, id)).run()

    const vivos = db.select().from(transactions).where(isNull(transactions.deletedAt)).all()
    expect(vivos).toHaveLength(1)
  })
})

describe('fechas de calendario', () => {
  it('rechaza una fecha que no es ISO', () => {
    expect(() => insertTransaction({ bookedAt: '15/03/2026' })).toThrow(/CHECK/i)
  })

  it('rechaza una fecha valor mal formada', () => {
    expect(() => insertTransaction({ valueDate: '2026-3-5' })).toThrow(/CHECK/i)
  })

  it('admite fecha valor ausente', () => {
    expect(insertTransaction({ valueDate: null })).toBeGreaterThan(0)
  })
})

describe('divisas', () => {
  it('rechaza una divisa fuera de la lista', () => {
    expect(() => insertTransaction({ currency: sinTipar('XXX') })).toThrow(/CHECK/i)
  })

  it('rechaza una cuenta con divisa desconocida', () => {
    expect(() => insertAccount(db, { currency: sinTipar('BTC') })).toThrow(/CHECK/i)
  })
})

describe('claves foráneas', () => {
  it('están activas: rechaza un movimiento de una cuenta inexistente', () => {
    expect(() => insertTransaction({ accountId: 9999 })).toThrow(/FOREIGN KEY/i)
  })

  it('rechaza una regla que apunta a una categoría inexistente', () => {
    expect(() =>
      db
        .insert(rules)
        .values({
          priority: 10,
          field: 'counterparty',
          matchType: 'contains',
          pattern: 'MERCADONA',
          categoryId: 9999,
        })
        .run(),
    ).toThrow(/FOREIGN KEY/i)
  })
})

describe('categorías', () => {
  it('rechaza dos categorías con el mismo slug', () => {
    insertCategory(db, { slug: 'ocio' })

    expect(() => insertCategory(db, { slug: 'ocio' })).toThrow(/UNIQUE/i)
  })

  it('rechaza una categoría que es su propia madre', () => {
    const id = insertCategory(db, { slug: 'vivienda' })

    expect(() =>
      db.update(categories).set({ parentId: id }).where(eq(categories.id, id)).run(),
    ).toThrow(/CHECK/i)
  })

  it('rechaza un kind inventado', () => {
    expect(() => insertCategory(db, { slug: 'raro', kind: sinTipar('gasto') })).toThrow(/CHECK/i)
  })
})

describe('reglas', () => {
  it('rechaza un patrón vacío', () => {
    const categoryId = insertCategory(db)

    expect(() =>
      db
        .insert(rules)
        .values({
          priority: 1,
          field: 'counterparty',
          matchType: 'contains',
          pattern: '',
          categoryId,
        })
        .run(),
    ).toThrow(/CHECK/i)
  })

  it('rechaza un match_type desconocido', () => {
    const categoryId = insertCategory(db)

    expect(() =>
      db
        .insert(rules)
        .values(
          sinTipar<NewRule>({
            priority: 1,
            field: 'counterparty',
            matchType: 'empieza_por',
            pattern: 'X',
            categoryId,
          }),
        )
        .run(),
    ).toThrow(/CHECK/i)
  })
})

describe('raw', () => {
  it('se conserva tal cual para poder re-normalizar (invariante 4)', () => {
    const original = { fecha: '15/03/2026', concepto: 'COMPRA', importe: '-45,50' }
    const id = insertTransaction({ raw: original })

    const [row] = db
      .select({ raw: transactions.raw })
      .from(transactions)
      .where(eq(transactions.id, id))
      .all()

    expect(row?.raw).toEqual(original)
  })
})

/**
 * La lista de divisas está en dos sitios y no puede estarlo en uno solo:
 * `packages/core` la necesita con sus decimales (ADR-008) y `packages/shared`
 * la necesita para los contratos, pero shared no puede importar de core (regla
 * `shared-is-leaf`). `apps/api` es el único paquete que depende de los dos, así
 * que es aquí donde se puede comprobar que no se han separado.
 *
 * Este test es lo que convierte «acuérdate de tocar las dos» en un error.
 */
describe('divisas — coherencia entre paquetes', () => {
  it('shared y core admiten exactamente las mismas', () => {
    expect([...sharedCurrencies].sort()).toEqual([...coreCurrencies].sort())
  })

  it('el CHECK de la base las acepta todas', () => {
    for (const currency of sharedCurrencies) {
      expect(() =>
        db
          .insert(accounts)
          .values({ name: `Cuenta ${currency}`, provider: 'manual', type: 'checking', currency })
          .run(),
      ).not.toThrow()
    }
  })
})
