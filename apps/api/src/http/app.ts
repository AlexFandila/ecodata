import { CORE_VERSION } from '@finanzas/core'
import { healthResponseSchema } from '@finanzas/shared'
import { Hono } from 'hono'
import type { Db } from '../db/client'
import { errorJson } from './errors'
import { createAccountsRoutes } from './routes/accounts'
import { createCategoriesRoutes } from './routes/categories'
import { createDashboardRoutes } from './routes/dashboard'
import { createImportsRoutes } from './routes/imports'
import { createRulesRoutes } from './routes/rules'
import { createTransactionsRoutes } from './routes/transactions'
import { createTransfersRoutes } from './routes/transfers'

export type AppOptions = {
  /**
   * Variantes del nombre del titular que el matching de transferencias
   * internas reconoce en los extractos (la señal de +2). Van por parámetro y no
   * leídas del entorno dentro de las rutas, por lo mismo que la base: es dato
   * personal, no vive en el repo, y un test tiene que poder fijarlo.
   *
   * Vacío es un valor legítimo: el matching sigue funcionando, solo pierde esa
   * señal de desempate.
   */
  readonly holderNames?: readonly string[]

  /**
   * Hoy, como fecha de calendario ISO `YYYY-MM-DD`. Lo usa `GET /dashboard` para
   * resolver «el mes en curso» cuando el cliente no pide uno.
   *
   * Entra por parámetro por lo mismo que `holderNames` y que la fecha final del
   * generador de la semilla: una ruta que mirase el reloj por su cuenta no se
   * podría comprobar sin congelar el tiempo, y el test del mes por defecto
   * quedaría en una tautología.
   *
   * El valor por defecto mira la hora **local** y no UTC, y esa es la decisión:
   * «este mes» es el mes del usuario, no el de Greenwich. La diferencia se nota
   * exactamente el día 1 de madrugada, que es cuando peor sienta abrir la app y
   * ver el mes pasado. No contradice el `format/date.ts` de la web, que sí
   * formatea en UTC: allí la pregunta es «qué día es esta fila» y aquí «qué día
   * es hoy para quien mira».
   */
  readonly today?: () => string
}

/** `2026-08-09` en la zona horaria del servidor. */
function localToday(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  return `${now.getFullYear()}-${month}-${day}`
}

/**
 * La base entra por parámetro y sin valor por defecto a propósito: un
 * `createApp()` que se abriera la suya sería una base global escondida que
 * aparecería en los tests sin que nadie la hubiera pedido.
 */
export function createApp(db: Db, { holderNames = [], today = localToday }: AppOptions = {}) {
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
  app.route('/dashboard', createDashboardRoutes(db, { today }))
  app.route('/imports', createImportsRoutes(db, { holderNames }))
  app.route('/rules', createRulesRoutes(db))
  app.route('/transactions', createTransactionsRoutes(db))
  app.route('/transfers', createTransfersRoutes(db, { holderNames }))

  return app
}
