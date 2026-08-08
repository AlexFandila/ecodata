import { type HealthResponse, healthResponseSchema } from '@finanzas/shared'
import { apiFetch } from './client'

export const healthQueryKey = ['health'] as const

export async function fetchHealth(): Promise<HealthResponse> {
  // Validar en la frontera: lo que llega por HTTP no es de fiar hasta que pasa
  // por el esquema de shared.
  return healthResponseSchema.parse(await apiFetch('/health'))
}
