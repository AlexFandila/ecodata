/**
 * La rama de fichero de `createDb`: crear el directorio, dejar los PRAGMA en su
 * sitio y aplicar las migraciones de forma idempotente. Los tests de esquema
 * usan `:memory:`, así que esto es lo único que ejercita el camino real de
 * `apps/api/.dev/dev.db`.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from './client'
import { runMigrations } from './migrate'
import { accounts } from './schema'

let directory: string

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'finanzas-db-'))
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

describe('createDb sobre fichero', () => {
  it('crea el directorio que falte', () => {
    const db = createDb({ path: join(directory, 'anidado', 'dev.db') })
    runMigrations(db)

    expect(db.select().from(accounts).all()).toEqual([])
  })

  it('deja las claves foráneas activas y el journal en WAL', () => {
    const db = createDb({ path: join(directory, 'dev.db') })

    // Drizzle no expone el driver, así que se consulta con SQL directo.
    expect(db.$client.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(db.$client.pragma('journal_mode', { simple: true })).toBe('wal')
  })

  it('aplicar las migraciones dos veces no rompe ni duplica', () => {
    const path = join(directory, 'dev.db')
    const db = createDb({ path })
    runMigrations(db)
    runMigrations(db)

    const tablas = db.$client
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((row) => (row as { name: string }).name)

    expect(tablas).toEqual(
      expect.arrayContaining([
        'accounts',
        'categories',
        'imports',
        'rules',
        'transactions',
        'transfers',
      ]),
    )
  })

  it('los datos sobreviven a cerrar y reabrir el fichero', () => {
    const path = join(directory, 'dev.db')
    const primera = createDb({ path })
    runMigrations(primera)
    primera
      .insert(accounts)
      .values({ name: 'Unicaja nómina', provider: 'unicaja', type: 'checking', currency: 'EUR' })
      .run()
    primera.$client.close()

    const segunda = createDb({ path })
    const filas = segunda.select({ name: accounts.name }).from(accounts).all()

    expect(filas).toEqual([{ name: 'Unicaja nómina' }])
  })
})
