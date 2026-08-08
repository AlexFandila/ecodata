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
import type { TransactionSource } from './ports/transaction-source'

export { Norma43FormatError } from './adapters/norma43/errors'
export { norma43Adapter } from './adapters/norma43/index'
export type { SourceReadResult, TransactionSource } from './ports/transaction-source'

/**
 * El selector de fuentes.
 *
 * Es `Partial` a propósito: `revolut_csv` ya tiene literal en los contratos pero
 * todavía no adaptador, y la alternativa —fingir que existe— acabaría en un
 * `undefined` corriendo por el pipeline. Cuando llegue su tarea, se añade aquí
 * y esta función no cambia.
 */
const ADAPTERS: Partial<Record<ImportSource, TransactionSource>> = {
  norma43: norma43Adapter,
}

export function sourceFor(source: ImportSource): TransactionSource {
  const adapter = ADAPTERS[source]
  if (adapter === undefined) {
    throw new Error(`Todavía no hay adaptador para la fuente «${source}»`)
  }
  return adapter
}
