/**
 * Contratos de transferencias internas: lo que necesita la pantalla de revisión
 * para confirmar, deshacer y emparejar a mano.
 *
 * ADR-009 dejó estos contratos sin escribir a propósito —"se sabrá qué forma
 * tienen cuando se sepa qué necesita la pantalla"— y ADR-013 aplazó con ellos
 * la mudanza de `TRANSFER_STATUSES` a `shared`. Las dos cosas se resuelven
 * aquí; el porqué de cada forma está en ADR-015.
 */
import { z } from 'zod'
import { transferMatchSignalSchema, transferStatusSchema } from './enums'
import { entityIdSchema, isoDateTimeSchema, nonNegativeIntSchema } from './primitives'
import { transactionSchema } from './transactions'

export const TRANSFERS_MAX_LIMIT = 200
export const TRANSFERS_DEFAULT_LIMIT = 50

/**
 * Una transferencia interna: las dos patas enlazadas y por qué lo están.
 *
 * `matchedBy` es una lista de literales y no el texto libre que sugería
 * DATA_MODEL.md, porque va a acabar explicándole al usuario por qué se emparejó
 * algo y en cuanto es texto libre quien lo lee distingue casos por el contenido
 * de una frase (ADR-013 decisión 7). En una transferencia `manual` está vacía:
 * no la disparó ninguna señal, la puso una persona.
 */
export const transferSchema = z.object({
  id: entityIdSchema,
  /** Pata de cargo (`amountCents < 0`). */
  outTxnId: entityIdSchema,
  /** Pata de abono (`amountCents > 0`). */
  inTxnId: entityIdSchema,
  status: transferStatusSchema,
  matchedBy: z.array(transferMatchSignalSchema),
  createdAt: isoDateTimeSchema,
})

export type Transfer = z.infer<typeof transferSchema>

/**
 * Una transferencia con sus dos movimientos dentro.
 *
 * Van embebidos y no como dos ids que el cliente resuelva aparte: la pantalla
 * pinta las dos patas una frente a otra en cada tarjeta, así que resolverlos
 * fuera serían dos peticiones por fila de la lista. `out` e `in` en vez de
 * repetir `outTxnId`/`inTxnId` resueltos porque el objeto ya los trae dentro.
 */
export const transferWithLegsSchema = transferSchema.extend({
  out: transactionSchema,
  in: transactionSchema,
})

export type TransferWithLegs = z.infer<typeof transferWithLegsSchema>

/**
 * Filtros del listado. Igual que en movimientos, los valores llegan como texto
 * en la query string y se coaccionan aquí.
 *
 * `status` es el que separa "lo que hay que revisar" (`auto`) de lo ya visto, y
 * es de donde sale el contador de la pestaña.
 */
export const listTransfersQuerySchema = z.object({
  status: transferStatusSchema.optional(),
  limit: z.coerce
    .number()
    .pipe(z.int().min(1).max(TRANSFERS_MAX_LIMIT))
    .default(TRANSFERS_DEFAULT_LIMIT),
  offset: z.coerce.number().pipe(z.int().nonnegative()).default(0),
})

export type ListTransfersQuery = z.infer<typeof listTransfersQuerySchema>

/** `total` son las que cumplen el filtro, no las devueltas (igual que en movimientos). */
export const listTransfersResponseSchema = z.object({
  transfers: z.array(transferWithLegsSchema),
  total: nonNegativeIntSchema,
  limit: z.int().positive(),
  offset: nonNegativeIntSchema,
})

export type ListTransfersResponse = z.infer<typeof listTransfersResponseSchema>

/**
 * Emparejar dos movimientos a mano.
 *
 * Solo los dos ids: el estado lo pone la API (`manual`, siempre) por el mismo
 * motivo por el que `PATCH /transactions/:id/category` no admite
 * `categorySource` —un cliente que pudiera declararse `auto` estaría diciendo
 * que lo emparejó una heurística que no ha corrido—.
 *
 * Lo que este contrato **no** exige es tan importante como lo que exige: ni que
 * los importes sean opuestos, ni que la divisa coincida, ni que las fechas
 * estén cerca. Esos son los criterios de la heurística, y el emparejado manual
 * existe precisamente para los casos que no los cumplen (una recarga de Revolut
 * con tarjeta llega a Unicaja como pago de tarjeta y rara vez cuadra exacto,
 * DATA_MODEL.md "casos borde conocidos"). Lo que sí se comprueba —cuentas
 * distintas, las dos propias, signos opuestos, ninguna pata pillada ya— es
 * estado de la base y lo valida la API, no el esquema.
 */
export const createTransferRequestSchema = z.object({
  outTxnId: entityIdSchema,
  inTxnId: entityIdSchema,
})

export type CreateTransferRequest = z.infer<typeof createTransferRequestSchema>

/**
 * Confirmar una transferencia emparejada por la heurística.
 *
 * El único destino posible es `confirmed`: `auto` lo pone el matcher y `manual`
 * la creación, así que no hay ninguna transición más que un cliente pueda
 * pedir. Va como objeto con el estado dentro, y no como un `POST
 * /transfers/:id/confirm` sin cuerpo, para que añadir mañana otra transición
 * sea ampliar una unión y no estrenar una ruta.
 */
export const updateTransferStatusRequestSchema = z.object({
  status: z.literal('confirmed'),
})

export type UpdateTransferStatusRequest = z.infer<typeof updateTransferStatusRequestSchema>

/**
 * Lo que queda tras deshacer: los dos movimientos ya liberados.
 *
 * Se devuelven en vez de un 204 vacío porque deshacer les cambia tres campos a
 * la vez —`transferId`, `categoryId` y `categorySource`— y quien lo pidió los
 * necesita para pintar cómo han quedado sin adivinarlo.
 */
export const undoTransferResponseSchema = z.object({
  transactions: z.array(transactionSchema),
})

export type UndoTransferResponse = z.infer<typeof undoTransferResponseSchema>

/**
 * Lo que ha hecho una pasada del matcher.
 *
 * `unresolved` son los movimientos que empataban entre varias mejores opciones
 * y que la heurística deja a propósito sin emparejar (ADR-013 decisión 1): no
 * es un error, es el aviso de que esos hay que mirarlos a mano.
 */
export const matchTransfersResponseSchema = z.object({
  created: nonNegativeIntSchema,
  unresolved: nonNegativeIntSchema,
})

export type MatchTransfersResponse = z.infer<typeof matchTransfersResponseSchema>
