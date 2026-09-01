/**
 * Puebla la base de desarrollo desde la línea de comandos: `pnpm seed`.
 *
 * Vive aparte de `run.ts` para que ese módulo siga siendo importable sin efectos
 * secundarios, igual que `db/migrate-cli.ts` respecto a `db/migrate.ts`.
 *
 * Migra antes de sembrar por el mismo motivo que lo hace el arranque de la API:
 * es idempotente y evita el fallo más tonto posible, que es sembrar contra una
 * base sin el esquema al día.
 *
 * Tres formas de invocarlo:
 *
 * - `pnpm seed` — siembra encima de lo que haya.
 * - `pnpm seed --reset` — borra la base y la vuelve a sembrar entera.
 * - `pnpm seed --empty` — borra la base y deja **solo** categorías y reglas, sin
 *   cuentas ni movimientos: el punto de partida para importar extractos reales.
 */
import { createDb, databasePath } from '../db/client'
import { runMigrations } from '../db/migrate'
import { resetDevDatabase, UnsafeResetError } from './reset'
import { runEmptySeed, runSeed } from './run'

/** Hoy en la zona horaria local: una fecha de calendario, no un instante. */
function today(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

const args = process.argv.slice(2)

const KNOWN_FLAGS = ['--reset', '--empty']

/**
 * Una bandera que no se reconoce **para la ejecución** en vez de ignorarse.
 *
 * No es quisquillosidad: sin esto, `pnpm seed --emty` no avisa de nada y hace
 * una siembra sintética completa —tres meses de movimientos inventados— sobre
 * la base que se quería dejar limpia para datos reales. Desde la app eso es
 * indistinguible de datos buenos, y separarlos después es justo el trabajo que
 * `--empty` viene a ahorrar.
 */
const unknown = args.filter((arg) => !KNOWN_FLAGS.includes(arg))
if (unknown.length > 0) {
  console.error(`No reconozco ${unknown.map((arg) => `«${arg}»`).join(', ')}.

Uso:
  pnpm seed            siembra datos sintéticos encima de lo que haya
  pnpm seed --reset    borra la base y la vuelve a sembrar entera
  pnpm seed --empty    borra la base y deja solo categorías y reglas
`)
  process.exit(1)
}

/**
 * Dejar la base vacía **implica** borrarla: vaciar una base ya poblada no se
 * consigue sembrando menos, hay que empezar de cero. Pedir además `--reset`
 * solo abriría la puerta a ejecutar media operación, así que `--empty` lo hace
 * por su cuenta. La guarda de `resetDevDatabase` sigue siendo la misma: no
 * borra nada que no cuelgue de `.dev/`.
 */
const empty = args.includes('--empty')
const reset = empty || args.includes('--reset')
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

if (empty) {
  const vacia = runEmptySeed(db)
  console.log(`
Base de desarrollo vacía y lista para datos reales: ${path}

  Categorías   ${vacia.categories.created} nuevas, ${vacia.categories.existing} ya estaban
  Reglas       ${vacia.rules.created} nuevas, ${vacia.rules.existing} ya estaban

  Sin cuentas, sin movimientos, sin importaciones, sin traspasos y sin objetivos.

Las reglas sembradas son de EJEMPLO, escritas contra movimientos inventados.
Algunas casarán con tus extractos («ALQUILER», «FARMACIA») y otras no; si alguna
molesta, se borra desde la app. Las tuyas créalas ahí también, mirando la bandeja
de «sin categorizar»: escribirlas en el código metería datos reales en git.

Siguiente paso, con \`pnpm dev\` levantado:
  1. Crea cada cuenta en /ajustes/cuentas/nueva, con su saldo inicial —el que
     declara la cabecera del extracto, justo antes del primer movimiento—.
  2. Importa los ficheros en /ajustes/importar.
`)
  process.exit(0)
}

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
