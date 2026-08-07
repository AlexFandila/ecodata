import { type HealthResponse, healthResponseSchema } from '@finanzas/shared'

const API_URL = import.meta.env.VITE_API_URL ?? '/api'

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_URL}/health`)
  if (!response.ok) {
    throw new Error(`La API respondió ${response.status}`)
  }
  // Validar en la frontera: lo que llega por HTTP no es de fiar hasta que pasa
  // por el esquema de shared.
  return healthResponseSchema.parse(await response.json())
}
