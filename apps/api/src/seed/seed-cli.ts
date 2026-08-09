/**
 * Puebla la base de desarrollo desde la línea de comandos: `pnpm seed`.
 *
 * Vive aparte de `run.ts` para que ese módulo siga siendo importable sin efectos
 * secundarios, igual que `db/migrate-cli.ts` respecto a `db/migrate.ts`.
 *
 * Migra antes de sembrar por el mismo motivo que lo hace el arranque de la API:
 * es idempotente y evita el fallo más tonto posible, que es sembrar contra una
 * base sin el esquema al día.
 */
import { createDb, databasePath } from '../db/client'
import { runMigrations } from '../db/migrate'
import { resetDevDatabase, UnsafeResetError } from './reset'
import { runSeed } from './run'

/** Hoy en la zona horaria local: una fecha de calendario, no un instante. */
function today(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

const reset = process.argv.slice(2).includes('--reset')
const path = databasePath()

if (reset) {
  try {
    resetDevDatabase(path)
    console.log(`Base de desarrollo borrada: ${path}`)
  } catch (error) {
    if (error instanceof UnsafeResetError) {
      console.error(error.message)
      process.exit(1)
    }
    throw error
  }
}

const db = createDb({ path })
runMigrations(db)

const outcome = runSeed(db, { endDate: today() })

console.log(`
Base de desarrollo sembrada: ${path}
Periodo: ${outcome.period.from} → ${outcome.period.to}

  Categorías   ${outcome.categories.created} nuevas, ${outcome.categories.existing} ya estaban
  Cuentas      ${outcome.accounts.created} nuevas, ${outcome.accounts.existing} ya estaban
  Reglas       ${outcome.rules.created} nuevas, ${outcome.rules.existing} ya estaban
  Objetivos    ${outcome.goals.created} nuevos, ${outcome.goals.existing} ya estaban
`)

for (const result of outcome.imports) {
  const { read, inserted, duplicated, errors } = result.stats
  console.log(
    `  ${result.source.padEnd(12)} ${read} leídos, ${inserted} insertados, ${duplicated} duplicados, ${errors} con error`,
  )
}

const pending = outcome.transactions.total - outcome.transactions.categorized
console.log(`
  Movimientos  ${outcome.transactions.total} vivos: ${outcome.transactions.categorized} categorizados, ${pending} en la bandeja
  Traspasos    ${outcome.transfers.created} transferencias internas nuevas, ${outcome.transfers.unresolved} ambiguas
               (las nuevas quedan en estado 'auto', para revisarlas en la app)
`)

if (outcome.imports.some((result) => result.stats.errors > 0)) {
  console.error('Algún movimiento sintético no se pudo importar. Revisa el generador.')
  process.exit(1)
}
