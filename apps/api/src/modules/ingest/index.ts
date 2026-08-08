/**
 * Módulo `ingest`: la única puerta por la que entran movimientos al sistema.
 *
 * Esto es todo lo que el resto de `apps/api` puede ver del módulo —lo demás son
 * internals y `dependency-cruiser` lo hace cumplir en `pnpm lint`—. Quien
 * importe una fuente nueva no toca nada de aquí: escribe un adaptador, lo
 * registra abajo y añade su literal a `IMPORT_SOURCES` (regla 5 de CLAUDE.md).
 */
import type { ImportSource } from '@finanzas/shared'
import { norma43Adapter } from './adapters/norma43/index'
import { revolutCsvAdapter } from './adapters/revolut-csv/index'
import type { TransactionSource } from './ports/transaction-source'

export { Norma43FormatError } from './adapters/norma43/errors'
export { norma43Adapter } from './adapters/norma43/index'
export { RevolutCsvFormatError } from './adapters/revolut-csv/errors'
export { revolutCsvAdapter } from './adapters/revolut-csv/index'
export type { SourceReadResult, TransactionSource } from './ports/transaction-source'

/**
 * El selector de fuentes.
 *
 * El mapa es completo, no `Partial`: mientras `revolut_csv` tuvo literal en los
 * contratos pero no adaptador hubo que admitir el hueco, y ya no lo hay. La
 * diferencia no es cosmética —con el `Record` cerrado, **añadir un literal a
 * `IMPORT_SOURCES` sin escribir su adaptador no compila**—, así que la regla 5
 * de CLAUDE.md pasa de ser una convención a comprobarla el compilador, que es
 * lo que ADR-006 pide de este tipo de reglas.
 */
const ADAPTERS: Record<ImportSource, TransactionSource> = {
  norma43: norma43Adapter,
  revolut_csv: revolutCsvAdapter,
}

export function sourceFor(source: ImportSource): TransactionSource {
  return ADAPTERS[source]
}
