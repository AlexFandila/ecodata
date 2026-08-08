/**
 * Módulo `ingest`: la única puerta por la que entran movimientos al sistema.
 *
 * Esto es todo lo que el resto de `apps/api` puede ver del módulo —lo demás son
 * internals y `dependency-cruiser` lo hace cumplir en `pnpm lint`—. Quien
 * importe una fuente nueva no toca nada de aquí: escribe un adaptador, lo
 * registra en `sources.ts` y añade su literal a `IMPORT_SOURCES` (regla 5 de
 * CLAUDE.md).
 *
 * Entre lo público hay un constructor de extractos sintéticos
 * (`norma43Bytes`), para los tests de las capas de encima: hoy el borde HTTP,
 * mañana `pnpm seed`. Sale por aquí en vez de importarse de `adapters/` a pelo
 * porque la frontera del módulo vale también para los tests. Que un test de la
 * ruta necesite un cuaderno 43 de verdad no es motivo para saltársela, es
 * motivo para que el módulo ofrezca uno.
 */

export { Norma43FormatError } from './adapters/norma43/errors'
export { norma43Adapter } from './adapters/norma43/index'
export {
  norma43Bytes,
  type SyntheticMovement as SyntheticNorma43Movement,
} from './adapters/norma43/testing'
export { RevolutCsvFormatError } from './adapters/revolut-csv/errors'
export { revolutCsvAdapter } from './adapters/revolut-csv/index'
export { AccountNotFoundError } from './errors'
export { type ImportOutcome, type RunImportInput, runImport } from './pipeline'
export { SourceFormatError } from './ports/source-format-error'
export type { SourceReadResult, TransactionSource } from './ports/transaction-source'
export { sourceFor } from './sources'
