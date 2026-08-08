/**
 * Aplica las migraciones desde la línea de comandos: `pnpm db:migrate`.
 *
 * Vive aparte de `migrate.ts` para que ese módulo siga siendo importable sin
 * efectos secundarios (el arranque de la API también lo usa).
 */
import { createDb, databasePath } from './client'
import { runMigrations } from './migrate'

const path = databasePath()
runMigrations(createDb({ path }))
console.log(`Migraciones aplicadas sobre ${path}`)
