/**
 * El único punto por el que la web sale a la API.
 *
 * Su trabajo es traducir el contrato de error de ADR-009 a algo con lo que un
 * componente pueda decidir: `{ error: { code, message, details? } }` se
 * convierte en un `ApiError` que **conserva el `code`**. Esa es la diferencia
 * que importa —"el `code` es para que decida el programa y el `message` para
 * que lea la persona"—: la pantalla de importación necesita distinguir "este
 * fichero no es de ese formato" (422) de "esa cuenta ya no existe" (404), y por
 * el texto no puede.
 */
import { type ApiErrorCode, type ErrorDetail, errorResponseSchema } from '@finanzas/shared'

const API_URL = import.meta.env.VITE_API_URL ?? '/api'

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
    readonly details: readonly ErrorDetail[] = [],
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Una respuesta de error que no cumple el contrato existe: un 502 del proxy es
 * HTML, y un fallo antes de llegar a Hono no pasa por `errorJson`. Se degrada a
 * `internal_error` en vez de reventar el parse, que dejaría a la pantalla sin
 * nada que enseñar.
 */
async function errorFrom(response: Response): Promise<ApiError> {
  const body = await response.json().catch(() => null)
  const parsed = errorResponseSchema.safeParse(body)
  if (!parsed.success) {
    return new ApiError('internal_error', `La API respondió ${response.status}`, response.status)
  }

  const { code, message, details } = parsed.data.error
  return new ApiError(code, message, response.status, details ?? [])
}

/** Devuelve el JSON sin validar: cada endpoint lo pasa por su esquema. */
export async function apiFetch(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${API_URL}${path}`, init)
  if (!response.ok) {
    throw await errorFrom(response)
  }
  return response.json()
}
