/**
 * Las rutas de la pantalla de revisión de transferencias internas.
 *
 * `GET /transfers` para listarlas, `PATCH /transfers/:id/status` para
 * confirmar, `DELETE /transfers/:id` para deshacer, `POST /transfers` para
 * emparejar a mano y `POST /transfers/match` para volver a pasar la heurística.
 *
 * Confirmar es un `PATCH` de estado y rechazar es un `DELETE` porque eso es
 * exactamente lo que pasa en la base: una transferencia deshecha no queda en
 * otro estado, deja de existir, y sus dos patas vuelven a ser candidatas
 * (ADR-015).
 *
 * Esta ruta es además quien **encadena** deshacer con recategorizar. Las patas
 * liberadas se quedan sin categoría, y volver a pasarles las reglas es del
 * módulo `categorize`: igual que en `POST /imports`, quien orquesta las etapas
 * es la ruta y no los módulos entre sí (ARCHITECTURE.md).
 */
import {
  createTransferRequestSchema,
  detailsFromZodError,
  listTransfersQuerySchema,
  listTransfersResponseSchema,
  matchTransfersResponseSchema,
  type TransferWithLegs,
  transferWithLegsSchema,
  undoTransferResponseSchema,
  updateTransferStatusRequestSchema,
} from '@finanzas/shared'
import { Hono } from 'hono'
import type { Db } from '../../db/client'
import { categorizeTransactions } from '../../modules/categorize/index'
import {
  confirmTransfer,
  createManualTransfer,
  findTransaction,
  InvalidTransferPairError,
  listTransfers,
  matchSignalsOf,
  recordInternalTransfers,
  TransactionAlreadyPairedError,
  TransactionNotFoundError,
  TransferNotFoundError,
  type TransferRecord,
  undoTransfer,
} from '../../modules/ledger/index'
import { entityId, transactionDto } from '../dto'
import { errorJson } from '../errors'

export type TransfersRoutesOptions = {
  /**
   * Variantes del nombre del titular para la señal de +2 del matching.
   *
   * Entran por parámetro desde el arranque en vez de leerse de
   * `process.env` aquí, por el mismo motivo por el que la base entra por
   * parámetro: una ruta que se leyera su propia configuración sería un dato
   * global escondido que aparecería en los tests sin que nadie lo hubiera
   * pedido. Es además dato personal y no vive en el repo (ADR-013 decisión 5).
   */
  readonly holderNames: readonly string[]
}

function toDto(record: TransferRecord): TransferWithLegs {
  return transferWithLegsSchema.parse({
    id: record.transfer.id,
    outTxnId: record.transfer.outTxnId,
    inTxnId: record.transfer.inTxnId,
    status: record.transfer.status,
    matchedBy: matchSignalsOf(record.transfer),
    createdAt: record.transfer.createdAt.toISOString(),
    out: transactionDto(record.out),
    in: transactionDto(record.in),
  })
}

export function createTransfersRoutes(db: Db, { holderNames }: TransfersRoutesOptions) {
  const routes = new Hono()

  routes.get('/', (c) => {
    const query = listTransfersQuerySchema.safeParse(c.req.query())
    if (!query.success) {
      return errorJson(
        c,
        400,
        'validation_error',
        'Los filtros de la consulta no son válidos',
        detailsFromZodError(query.error),
      )
    }

    const { rows, total } = listTransfers(db, query.data)

    return c.json(
      listTransfersResponseSchema.parse({
        transfers: rows.map(toDto),
        total,
        limit: query.data.limit,
        offset: query.data.offset,
      }),
    )
  })

  /**
   * Vuelve a pasar la heurística sobre todo lo que sigue sin emparejar.
   *
   * Existe además de la etapa que corre al importar porque deshacer una
   * transferencia devuelve dos movimientos al montón, y porque un extracto
   * importado antes que su pareja no se empareja solo hasta que alguien vuelve
   * a mirar. Es idempotente: lo ya emparejado no es candidato.
   */
  routes.post('/match', (c) => {
    return c.json(matchTransfersResponseSchema.parse(recordInternalTransfers(db, { holderNames })))
  })

  routes.post('/', async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return errorJson(c, 400, 'validation_error', 'La petición no lleva un cuerpo JSON válido', [
        { path: '(raíz)', message: 'Se esperaba application/json' },
      ])
    }

    const fields = createTransferRequestSchema.safeParse(body)
    if (!fields.success) {
      return errorJson(
        c,
        400,
        'validation_error',
        'Los movimientos que emparejar no son válidos',
        detailsFromZodError(fields.error),
      )
    }

    try {
      return c.json(toDto(createManualTransfer(db, fields.data)), 201)
    } catch (error) {
      if (error instanceof TransactionNotFoundError) {
        return errorJson(c, 404, 'not_found', error.message)
      }
      // Los dos son del estado y no de la petición: el cuerpo era válido, lo
      // que no se puede es emparejar esos dos movimientos concretos.
      if (
        error instanceof TransactionAlreadyPairedError ||
        error instanceof InvalidTransferPairError
      ) {
        return errorJson(c, 409, 'conflict', error.message)
      }
      throw error
    }
  })

  routes.patch('/:id/status', async (c) => {
    const id = entityId(c.req.param('id'))
    if (id === null) {
      return errorJson(
        c,
        400,
        'validation_error',
        'El identificador de la transferencia no es válido',
        [{ path: 'id', message: 'Se esperaba un entero positivo' }],
      )
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return errorJson(c, 400, 'validation_error', 'La petición no lleva un cuerpo JSON válido', [
        { path: '(raíz)', message: 'Se esperaba application/json' },
      ])
    }

    const fields = updateTransferStatusRequestSchema.safeParse(body)
    if (!fields.success) {
      return errorJson(
        c,
        400,
        'validation_error',
        'El único estado al que se puede pasar una transferencia es «confirmed»',
        detailsFromZodError(fields.error),
      )
    }

    try {
      return c.json(toDto(confirmTransfer(db, id)))
    } catch (error) {
      if (error instanceof TransferNotFoundError) {
        return errorJson(c, 404, 'not_found', error.message)
      }
      throw error
    }
  })

  routes.delete('/:id', (c) => {
    const id = entityId(c.req.param('id'))
    if (id === null) {
      return errorJson(
        c,
        400,
        'validation_error',
        'El identificador de la transferencia no es válido',
        [{ path: 'id', message: 'Se esperaba un entero positivo' }],
      )
    }

    let freedIds: readonly number[]
    try {
      freedIds = undoTransfer(db, id).map((row) => row.id)
    } catch (error) {
      if (error instanceof TransferNotFoundError) {
        return errorJson(c, 404, 'not_found', error.message)
      }
      throw error
    }

    // Las dos patas se han quedado sin categoría al liberarse: se les vuelven a
    // pasar las reglas para que no aparezcan en la bandeja de pendientes solo
    // por haber estado emparejadas. Va fuera de la transacción de `undoTransfer`
    // y por el mismo motivo que en `POST /imports`: si fallara la
    // categorización, la transferencia ya está deshecha, que es lo que se pedía.
    categorizeTransactions(db, { transactionIds: freedIds })

    // Se releen después de categorizar: las filas que devolvió `undoTransfer`
    // son de antes de esa pasada y dirían "sin categoría" de algo que ya la
    // tiene.
    const legs = freedIds
      .map((legId) => findTransaction(db, legId))
      .filter((row) => row !== undefined)

    return c.json(undoTransferResponseSchema.parse({ transactions: legs.map(transactionDto) }))
  })

  return routes
}
