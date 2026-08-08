import { CORE_VERSION } from '@finanzas/core'
import { healthResponseSchema } from '@finanzas/shared'
import { Hono } from 'hono'
import type { Db } from '../db/client'
import { errorJson } from './errors'
import { createAccountsRoutes } from './routes/accounts'
import { createCategoriesRoutes } from './routes/categories'
import { createImportsRoutes } from './routes/imports'
import { createRulesRoutes } from './routes/rules'
import { createTransactionsRoutes } from './routes/transactions'

/**
 * La base entra por parámetro y sin valor por defecto a propósito: un
 * `createApp()` que se abriera la suya sería una base global escondida que
 * aparecería en los tests sin que nadie la hubiera pedido.
 */
export function createApp(db: Db) {
  const app = new Hono()

  // Red de seguridad: cualquier excepción que no haya sabido traducir una ruta
  // sale con el contrato de error de shared, no como el HTML por defecto de
  // Hono. Sin `details`: hacia fuera no se filtran internos (ADR-009).
  app.onError((error, c) => {
    console.error(error)
    return errorJson(c, 500, 'internal_error', 'Error interno')
  })

  app.get('/health', (c) => {
    // El contrato se valida contra el esquema de shared antes de salir: si
    // alguien cambia la forma de la respuesta, rompe aquí y no en la PWA.
    return c.json(healthResponseSchema.parse({ status: 'ok', version: CORE_VERSION }))
  })

  app.route('/accounts', createAccountsRoutes(db))
  app.route('/categories', createCategoriesRoutes(db))
  app.route('/imports', createImportsRoutes(db))
  app.route('/rules', createRulesRoutes(db))
  app.route('/transactions', createTransactionsRoutes(db))

  return app
}
