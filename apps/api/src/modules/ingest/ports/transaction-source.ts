/**
 * El puerto de ingesta: lo único que el pipeline de importación sabe de una
 * fuente de datos.
 *
 * Añadir un banco es escribir algo que implemente esto (regla 5 de CLAUDE.md).
 * Ni el pipeline, ni el dominio, ni la base de datos se enteran.
 */
import type { ImportRowError, ImportSource, NormalizedTransaction } from '@finanzas/shared'

/**
 * Lo que devuelve una lectura: el lote de movimientos y las filas que no se
 * pudieron leer.
 *
 * Los dos a la vez, y no una cosa o la otra, porque un extracto con tres
 * apuntes raros debe importar los otros doscientos y decir cuáles falló —el
 * mismo criterio que `tryParseAmount` en `packages/core` (ADR-008)—. Lo que sí
 * aborta con excepción es el fichero entero mal formado: eso no es un dato
 * sucio, es que no es el fichero que dice ser.
 */
export type SourceReadResult = {
  /** En el orden en que venían en la fuente. */
  readonly transactions: readonly NormalizedTransaction[]
  /** `row` numera unidades lógicas de la fuente (el n-ésimo movimiento), no líneas físicas. */
  readonly rowErrors: readonly ImportRowError[]
}

/**
 * Una fuente de movimientos.
 *
 * Es genérico en la entrada porque las fuentes no reciben todas lo mismo: los
 * adaptadores de fichero reciben **bytes** —el encoding es propiedad del
 * formato y lo decide quien lo conoce, no la capa HTTP— y el
 * `EnableBankingAdapter` de la Fase 4 recibirá la respuesta ya deserializada.
 * Dejarlo abierto ahora evita tener que reabrir la firma entonces.
 *
 * `read` es síncrono a propósito: un adaptador transforma datos que ya tiene en
 * memoria. Quien va a buscarlos —leer el fichero, llamar a la API— es su
 * llamante, y así el adaptador se testea sin IO ninguno.
 */
export interface TransactionSource<TInput = Uint8Array> {
  /** El literal con el que esta fuente se guarda en `imports.source`. */
  readonly id: ImportSource
  read(input: TInput): SourceReadResult
}
