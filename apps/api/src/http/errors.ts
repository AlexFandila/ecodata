/**
 * Un único constructor de respuestas de error, contra el contrato de shared.
 *
 * Está aquí y no en cada ruta porque el contrato dice que la PWA decide por el
 * `code` y no por el texto (ADR-009): si cada handler arma su propio JSON, las
 * respuestas acaban pareciéndose solo por casualidad y el primer `code` que se
 * escriba mal no lo detecta nadie. Pasando por `errorResponseSchema.parse`, un
 * código inventado revienta aquí.
 */
import { type ApiErrorCode, type ErrorDetail, errorResponseSchema } from '@finanzas/shared'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export function errorJson(
  c: Context,
  status: ContentfulStatusCode,
  code: ApiErrorCode,
  message: string,
  details?: readonly ErrorDetail[],
): Response {
  const body = errorResponseSchema.parse({
    error: details === undefined ? { code, message } : { code, message, details: [...details] },
  })
  return c.json(body, status)
}
