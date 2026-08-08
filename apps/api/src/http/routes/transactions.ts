/**
 * `GET /transactions`, `GET /transactions/:id` y
 * `PATCH /transactions/:id/category`.
 *
 * El listado es la lectura de la que vive la pantalla de movimientos y la
 * bandeja de pendientes; el detalle es lo que abre una fila de esa lista; y el
 * `PATCH` es el paso 3 del pipeline de categorización (DATA_MODEL.md): poner
 * una categoría a mano.
 *
 * La ruta es `/:id/category` y no un `PATCH /:id` genérico porque la categoría
 * es lo único editable de un movimiento —lo demás viene del extracto y el
 * invariante 4 dice que no se toca—, y una URL que prometiera editar el
 * movimiento entero estaría mintiendo.
 *
 * Aquí se traduce la fila de la base al contrato de shared: `raw`, `sourceHash`
 * y `deletedAt` se quedan dentro, y la respuesta la construye
 * `transactionSchema`, no un `...row` (ADR-009 punto 6).
 */
import {
  detailsFromZodError,
  listTransactionsQuerySchema,
  listTransactionsResponseSchema,
  type Transaction,
  transactionSchema,
  updateTransactionCategoryRequestSchema,
} from '@finanzas/shared'
import { Hono } from 'hono'
import type { Db } from '../../db/client'
import {
  CategoryNotFoundError,
  setTransactionCategory,
  TransactionNotFoundError,
  TransferLegNotCategorizableError,
} from '../../modules/categorize/index'
import {
  findTransaction,
  listTransactions,
  type Transaction as TransactionRow,
} from '../../modules/ledger/index'
import { errorJson } from '../errors'

function toDto(row: TransactionRow): Transaction {
  return transactionSchema.parse({
    id: row.id,
    accountId: row.accountId,
    bookedAt: row.bookedAt,
    valueDate: row.valueDate,
    amountCents: row.amountCents,
    currency: row.currency,
    counterparty: row.counterparty,
    description: row.description,
    categoryId: row.categoryId,
    categorySource: row.categorySource,
    transferId: row.transferId,
    importId: row.importId,
  })
}

/**
 * El `:id` de la URL, ya validado. `Number('')` es `0` y `Number('1.5')` no es
 * entero: los dos tienen que caer aquí y no llegar a una consulta.
 */
function transactionId(raw: string): number | null {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

export function createTransactionsRoutes(db: Db) {
  const routes = new Hono()

  routes.get('/', (c) => {
    // La query llega en texto; el esquema es quien la coacciona a números y
    // booleanos y quien pone los valores por defecto de la paginación.
    const query = listTransactionsQuerySchema.safeParse(c.req.query())
    if (!query.success) {
      return errorJson(
        c,
        400,
        'validation_error',
        'Los filtros de la consulta no son válidos',
        detailsFromZodError(query.error),
      )
    }

    const { rows, total } = listTransactions(db, query.data)

    return c.json(
      listTransactionsResponseSchema.parse({
        transactions: rows.map(toDto),
        total,
        limit: query.data.limit,
        offset: query.data.offset,
      }),
    )
  })

  routes.get('/:id', (c) => {
    const id = transactionId(c.req.param('id'))
    if (id === null) {
      return errorJson(c, 400, 'validation_error', 'El identificador del movimiento no es válido', [
        { path: 'id', message: 'Se esperaba un entero positivo' },
      ])
    }

    const row = findTransaction(db, id)
    // Un movimiento borrado no se distingue de uno que no existe: para el
    // cliente son lo mismo (invariante 5).
    if (row === undefined) {
      return errorJson(c, 404, 'not_found', `No existe el movimiento ${id}`)
    }

    return c.json(toDto(row))
  })

  routes.patch('/:id/category', async (c) => {
    const id = transactionId(c.req.param('id'))
    if (id === null) {
      return errorJson(c, 400, 'validation_error', 'El identificador del movimiento no es válido', [
        { path: 'id', message: 'Se esperaba un entero positivo' },
      ])
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return errorJson(c, 400, 'validation_error', 'La petición no lleva un cuerpo JSON válido', [
        { path: '(raíz)', message: 'Se esperaba application/json' },
      ])
    }

    const fields = updateTransactionCategoryRequestSchema.safeParse(body)
    if (!fields.success) {
      return errorJson(
        c,
        400,
        'validation_error',
        'La categoría indicada no es válida',
        detailsFromZodError(fields.error),
      )
    }

    try {
      return c.json(toDto(setTransactionCategory(db, id, fields.data.categoryId)))
    } catch (error) {
      if (error instanceof TransactionNotFoundError || error instanceof CategoryNotFoundError) {
        return errorJson(c, 404, 'not_found', error.message)
      }
      // No es un problema de la petición sino del estado del movimiento: la
      // categoría de una pata de transferencia la pone el invariante 3.
      if (error instanceof TransferLegNotCategorizableError) {
        return errorJson(c, 409, 'conflict', error.message)
      }
      throw error
    }
  })

  return routes
}
