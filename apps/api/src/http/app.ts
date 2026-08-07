import { CORE_VERSION } from '@finanzas/core'
import { healthResponseSchema } from '@finanzas/shared'
import { Hono } from 'hono'

export function createApp() {
  const app = new Hono()

  app.get('/health', (c) => {
    // El contrato se valida contra el esquema de shared antes de salir: si
    // alguien cambia la forma de la respuesta, rompe aquí y no en la PWA.
    return c.json(healthResponseSchema.parse({ status: 'ok', version: CORE_VERSION }))
  })

  return app
}
