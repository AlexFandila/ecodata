import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

export type Db = ReturnType<typeof createDb>

export type CreateDbOptions = {
  /** Ruta del fichero SQLite, o `:memory:` para una base efímera (tests). */
  path: string
}

/**
 * Abre la base y deja los PRAGMA en su sitio.
 *
 * `foreign_keys` **no** está activo por defecto en SQLite: sin esta línea, las
 * claves foráneas del esquema serían decorativas. Va aquí, en el único punto de
 * apertura, para que no dependa de que cada llamante se acuerde.
 */
export function createDb({ path }: CreateDbOptions) {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true })
  }

  const sqlite = new Database(path)
  sqlite.pragma('foreign_keys = ON')
  // WAL: lecturas concurrentes sin bloquear la escritura. En memoria no aplica.
  if (path !== ':memory:') {
    sqlite.pragma('journal_mode = WAL')
  }
  // Espera en vez de fallar si otra conexión tiene la base ocupada.
  sqlite.pragma('busy_timeout = 5000')

  return drizzle(sqlite, { schema })
}

/** Ruta de la base a partir del entorno. Ver env.example. */
export function databasePath(): string {
  return process.env.DB_PATH ?? '.dev/dev.db'
}
