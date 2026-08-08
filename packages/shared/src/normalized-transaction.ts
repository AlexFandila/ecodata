/**
 * `NormalizedTransaction`: un movimiento tal como sale de un adaptador de
 * ingesta, antes de tocar la base de datos.
 *
 * Es el contrato del puerto `TransactionSource` (docs/ARCHITECTURE.md): todos
 * los adaptadores —`Norma43Adapter`, `RevolutCsvAdapter` y, en la Fase 4,
 * `EnableBankingAdapter`— devuelven exactamente esta forma, y el pipeline de
 * importación es único porque solo conoce esta forma. Añadir un banco es
 * escribir algo que produzca esto; no se toca ni el pipeline ni el dominio.
 *
 * No es la fila de `transactions`: le faltan a propósito casi la mitad de las
 * columnas, y cada ausencia es una decisión.
 *
 * 1. **Sin `accountId`.** Un adaptador lee un fichero, y un fichero no dice a
 *    qué cuenta pertenece: la elige el usuario al subirlo. La pone el pipeline.
 * 2. **Sin `sourceHash`.** El orden es normalizar → hash → deduplicar, y el
 *    invariante 1 quiere el hash sobre la cuenta y sobre el n-ésimo movimiento
 *    idéntico dentro del fichero (ADR-012). Ni una cosa ni la otra se conocen
 *    aquí —la cuenta la elige el usuario, y el ordinal solo lo sabe quien ve el
 *    lote entero—, así que el hash tampoco puede calcularse aquí.
 * 3. **Sin `categoryId`, `categorySource`, `transferId`, `deletedAt`,
 *    `importId` ni `id`.** Son estado que asignan etapas posteriores
 *    (categorización, matching de transferencias, persistencia).
 * 4. **Con `raw`.** El adaptador es el único punto del sistema que ve la fila
 *    original, así que es el único que puede conservarla (invariante 4).
 *
 * Los campos que en la base son `NULL`able son aquí `nullable()` pero
 * **obligatorios**: el adaptador tiene que decidir explícitamente que no hay
 * contraparte, en vez de omitir la clave y dejar que el pipeline adivine.
 */
import { z } from 'zod'
import { currencySchema } from './enums'
import { amountCentsSchema, isoDateSchema, rawRecordSchema, trimmedText } from './primitives'

export const normalizedTransactionSchema = z.object({
  /** Fecha contable: la que usa el banco para ordenar el extracto. */
  bookedAt: isoDateSchema,
  /** Fecha valor. `null` cuando la fuente no la da, que es lo habitual en CSV. */
  valueDate: isoDateSchema.nullable(),
  /** Negativo = cargo, positivo = abono. */
  amountCents: amountCentsSchema,
  /**
   * Divisa del movimiento, no de la cuenta. Van separadas porque Revolut es
   * multidivisa: un mismo extracto puede traer euros y libras, y convertirlos
   * al importar destruiría el importe original (ADR-008).
   */
  currency: currencySchema,
  /** Quién cobra o paga, ya normalizado por el adaptador. */
  counterparty: trimmedText(200).nullable(),
  /** Concepto del movimiento. */
  description: trimmedText(500).nullable(),
  /** La fila de origen intacta, para poder re-normalizar más adelante. */
  raw: rawRecordSchema,
})

export type NormalizedTransaction = z.infer<typeof normalizedTransactionSchema>

/**
 * Lo que devuelve un `TransactionSource` al leer un fichero o una respuesta de
 * API: el lote entero de movimientos, en el orden en que venían.
 */
export const normalizedTransactionListSchema = z.array(normalizedTransactionSchema)
