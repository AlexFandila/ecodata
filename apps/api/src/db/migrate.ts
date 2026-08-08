import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import type { Db } from './client'

/** Carpeta con el SQL que genera `pnpm db:generate`. */
const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url))

/**
 * Aplica las migraciones pendientes. Es idempotente: drizzle lleva su propia
 * tabla de control, así que llamarla en cada arranque no cuesta nada.
 */
export function runMigrations(db: Db): void {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
}
