/**
 * `GET /accounts` y `POST /accounts`.
 *
 * Son la puerta de entrada de la pantalla de importación: para subir un
 * extracto hay que decir a qué cuenta van sus movimientos, y para eso hay que
 * poder listarlas y crearlas.
 *
 * Aquí se traduce la fila de la base al contrato de shared: `createdAt` pasa de
 * epoch en milisegundos a ISO 8601 (ADR-009). Lo interno —si algún día lo
 * hubiera— no sale: la respuesta la construye `accountSchema`, no un `...row`.
 */
import {
  type Account,
  accountListResponseSchema,
  accountSchema,
  createAccountRequestSchema,
  detailsFromZodError,
} from '@finanzas/shared'
import { Hono } from 'hono'
import type { Db } from '../../db/client'
import { type Account as AccountRow, createAccount, listAccounts } from '../../modules/ledger/index'
import { errorJson } from '../errors'

function toDto(row: AccountRow): Account {
  return accountSchema.parse({ ...row, createdAt: row.createdAt.toISOString() })
}

export function createAccountsRoutes(db: Db) {
  const routes = new Hono()

  routes.get('/', (c) => {
    return c.json(accountListResponseSchema.parse({ accounts: listAccounts(db).map(toDto) }))
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

    const fields = createAccountRequestSchema.safeParse(body)
    if (!fields.success) {
      return errorJson(
        c,
        400,
        'validation_error',
        'Los datos de la cuenta no son válidos',
        detailsFromZodError(fields.error),
      )
    }

    return c.json(toDto(createAccount(db, fields.data)), 201)
  })

  return routes
}
