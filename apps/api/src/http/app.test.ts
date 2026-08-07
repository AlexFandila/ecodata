import { healthResponseSchema } from '@finanzas/shared'
import { describe, expect, it } from 'vitest'
import { createApp } from './app'

describe('GET /health', () => {
  it('responde 200 con el contrato de shared', async () => {
    const response = await createApp().request('/health')

    expect(response.status).toBe(200)
    // Si la respuesta se saliera del contrato, el parse lanzaría aquí.
    const body = healthResponseSchema.parse(await response.json())
    expect(body.status).toBe('ok')
  })

  it('devuelve 404 en una ruta desconocida', async () => {
    const response = await createApp().request('/no-existe')

    expect(response.status).toBe(404)
  })
})
