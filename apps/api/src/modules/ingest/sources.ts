/**
 * El selector de fuentes: de un literal de `IMPORT_SOURCES` al adaptador que lo
 * sabe leer.
 *
 * Vive aparte del `index.ts` público —donde estaba hasta que hubo pipeline—
 * porque el pipeline lo necesita, y si lo importara del `index.ts` del propio
 * módulo se formaría un ciclo que `dependency-cruiser` prohíbe. El `index.ts`
 * lo reexporta, así que desde fuera nada cambia.
 */
import type { ImportSource } from '@finanzas/shared'
import { norma43Adapter } from './adapters/norma43/index'
import { revolutCsvAdapter } from './adapters/revolut-csv/index'
import type { TransactionSource } from './ports/transaction-source'

/**
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
