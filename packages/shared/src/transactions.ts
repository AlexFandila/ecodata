/**
 * Contratos de movimientos: `GET /transactions`.
 *
 * Es la lectura más frecuente de la app —la pantalla de movimientos, la bandeja
 * de "sin categorizar"— y la que más se presta a filtrar mal, así que los dos
 * invariantes que la gobiernan van escritos en el propio esquema: los borrados
 * no salen nunca (invariante 5) y las transferencias internas quedan fuera
 * salvo que se pidan (invariante 3).
 */
import { z } from 'zod'
import { categorySourceSchema, currencySchema } from './enums'
import { amountCentsSchema, entityIdSchema, isoDateSchema, trimmedText } from './primitives'

/** Tope de página. Existe para que un cliente no pueda pedirse la base entera. */
export const TRANSACTIONS_MAX_LIMIT = 200
export const TRANSACTIONS_DEFAULT_LIMIT = 50

/**
 * Filtros del listado. Los valores llegan como texto en la query string, así
 * que se coaccionan aquí: la ruta recibe la query cruda, la pasa por este
 * esquema y ya trabaja con números y booleanos.
 */
export const listTransactionsQuerySchema = z.object({
  accountId: z.coerce.number().pipe(entityIdSchema).optional(),
  /** Desde esta fecha contable, inclusive. */
  from: isoDateSchema.optional(),
  /** Hasta esta fecha contable, inclusive. */
  to: isoDateSchema.optional(),
  categoryId: z.coerce.number().pipe(entityIdSchema).optional(),
  /** La bandeja de pendientes: solo movimientos sin categoría. */
  uncategorized: z.stringbool().optional(),
  /**
   * Por defecto `false`: el invariante 3 dice que las transferencias internas
   * no son ni ingreso ni gasto, así que quedarían distorsionando cualquier
   * listado. La pantalla de revisión de transferencias lo pondrá a `true`.
   */
  includeTransfers: z.stringbool().default(false),
  /** Búsqueda libre sobre contraparte y descripción. */
  search: trimmedText(100).optional(),
  limit: z.coerce
    .number()
    .pipe(z.int().min(1).max(TRANSACTIONS_MAX_LIMIT))
    .default(TRANSACTIONS_DEFAULT_LIMIT),
  offset: z.coerce.number().pipe(z.int().nonnegative()).default(0),
})

export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>

/**
 * Un movimiento tal como lo ve la API.
 *
 * No es la fila de la base: fuera quedan `raw` y `sourceHash`, que son
 * maquinaria interna sin nada que decirle a la interfaz, y `deletedAt`, porque
 * un movimiento borrado sencillamente no aparece en ninguna respuesta
 * (invariante 5). Tampoco es `NormalizedTransaction`: aquello es lo que entra
 * al sistema, esto es lo que sale, y por eso lleva ids y estado.
 */
export const transactionSchema = z.object({
  id: entityIdSchema,
  accountId: entityIdSchema,
  bookedAt: isoDateSchema,
  valueDate: isoDateSchema.nullable(),
  amountCents: amountCentsSchema,
  currency: currencySchema,
  counterparty: z.string().nullable(),
  description: z.string().nullable(),
  categoryId: entityIdSchema.nullable(),
  /** Va siempre en pareja con `categoryId`: o los dos, o ninguno (invariante 7). */
  categorySource: categorySourceSchema.nullable(),
  /** No `null` = es una pata de una transferencia interna. */
  transferId: entityIdSchema.nullable(),
  importId: entityIdSchema,
})

export type Transaction = z.infer<typeof transactionSchema>

/**
 * `total` es el número de movimientos que cumplen el filtro, no los devueltos:
 * es lo que permite paginar y lo que da el contador de la bandeja de
 * pendientes sin pedir la lista entera.
 */
export const listTransactionsResponseSchema = z.object({
  transactions: z.array(transactionSchema),
  total: z.int().nonnegative(),
  limit: z.int().positive(),
  offset: z.int().nonnegative(),
})

export type ListTransactionsResponse = z.infer<typeof listTransactionsResponseSchema>
