/**
 * Utilidades para tests que necesitan una base real: SQLite en memoria con las
 * migraciones ya aplicadas. Sin ficheros, sin estado compartido entre tests.
 *
 * Los datos son siempre sintéticos (CLAUDE.md): nombres, IBANs e importes
 * inventados.
 */
import { createDb, type Db } from './client'
import { runMigrations } from './migrate'
import type { NewAccount, NewCategory, NewImport, NewTransaction } from './schema'
import { accounts, categories, imports } from './schema'

/** Base efímera con el esquema al día. */
export function createTestDb(): Db {
  const db = createDb({ path: ':memory:' })
  runMigrations(db)
  return db
}

export function insertAccount(db: Db, overrides: Partial<NewAccount> = {}): number {
  const row = db
    .insert(accounts)
    .values({
      name: 'Cuenta de prueba',
      provider: 'unicaja',
      type: 'checking',
      currency: 'EUR',
      ...overrides,
    })
    .returning({ id: accounts.id })
    .get()
  if (row === undefined) throw new Error('No se pudo crear la cuenta de prueba')
  return row.id
}

export function insertCategory(db: Db, overrides: Partial<NewCategory> = {}): number {
  const row = db
    .insert(categories)
    .values({
      slug: 'supermercado',
      name: 'Supermercado',
      kind: 'expense',
      ...overrides,
    })
    .returning({ id: categories.id })
    .get()
  if (row === undefined) throw new Error('No se pudo crear la categoría de prueba')
  return row.id
}

/** Un import necesita cuenta: la elige el usuario al subir el fichero. */
export function insertImport(
  db: Db,
  overrides: Partial<NewImport> & Pick<NewImport, 'accountId'>,
): number {
  const row = db
    .insert(imports)
    .values({ source: 'norma43', fileName: 'ejemplo.n43', ...overrides })
    .returning({ id: imports.id })
    .get()
  if (row === undefined) throw new Error('No se pudo crear el import de prueba')
  return row.id
}

/** Contexto mínimo para insertar movimientos: una cuenta y un import suyo. */
export function seedContext(db: Db): { accountId: number; importId: number } {
  const accountId = insertAccount(db)
  return { accountId, importId: insertImport(db, { accountId }) }
}

/** Contador para hashes únicos: determinista, a diferencia de un aleatorio. */
let hashCounter = 0

/** Movimiento sintético válido; `overrides` cambia lo que interese al test. */
export function transactionValues(
  context: { accountId: number; importId: number },
  overrides: Partial<NewTransaction> = {},
): NewTransaction {
  hashCounter += 1
  return {
    accountId: context.accountId,
    importId: context.importId,
    bookedAt: '2026-03-15',
    amountCents: -4550,
    currency: 'EUR',
    counterparty: 'SUPERMERCADO EJEMPLO',
    description: 'Compra semanal',
    sourceHash: `hash-${hashCounter}`,
    raw: { fecha: '15/03/2026', importe: '-45,50' },
    ...overrides,
  }
}
