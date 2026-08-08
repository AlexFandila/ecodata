/**
 * Forma única de los errores de la API.
 *
 * Que un fallo tenga contrato importa tanto como que lo tenga un éxito: la PWA
 * necesita distinguir "esta cuenta no existe" de "el CSV no se entiende" para
 * decidir si reintentar, avisar o pedir otro fichero, y si cada ruta inventa su
 * propio JSON acaba distinguiéndolos por el texto del mensaje.
 */
import { z } from 'zod'

/**
 * Códigos de error. Lista corta y cerrada a propósito: el `code` es para que
 * decida el programa, y el `message` para que lea la persona.
 */
export const API_ERROR_CODES = [
  /** La petición no cumple su esquema. Acompaña siempre a un `details`. */
  'validation_error',
  /** La entidad referida no existe (o está borrada, invariante 5). */
  'not_found',
  /** El estado actual no admite la operación: duplicados, reglas ya aplicadas… */
  'conflict',
  /** El fichero subido no es de un formato que ningún adaptador sepa leer. */
  'unsupported_format',
  /** Todo lo demás. Nunca lleva detalles: hacia fuera no se filtran internos. */
  'internal_error',
] as const

export const apiErrorCodeSchema = z.enum(API_ERROR_CODES)
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>

/**
 * Un problema concreto dentro de la petición. `path` usa notación de puntos
 * (`rows.3.amount`) para poder señalar la fila del CSV o el campo del
 * formulario que falla, en vez de rechazar el envío entero sin decir dónde.
 */
export const errorDetailSchema = z.object({
  path: z.string(),
  message: z.string(),
})

export type ErrorDetail = z.infer<typeof errorDetailSchema>

export const errorResponseSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    details: z.array(errorDetailSchema).optional(),
  }),
})

export type ErrorResponse = z.infer<typeof errorResponseSchema>

/**
 * Traduce los problemas de un `ZodError` a `details`.
 *
 * Es la única función del paquete, y está aquí porque validar la entrada y
 * contestar el error es la misma operación en todas las rutas: sin esto, cada
 * una recorrería `error.issues` a mano y las respuestas se parecerían solo por
 * casualidad. Un `path` vacío —el error está en la raíz del objeto— se marca
 * con `'(raíz)'` en vez de con una cadena vacía, que no se ve en una pantalla.
 */
export function detailsFromZodError(error: z.ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : '(raíz)',
    message: issue.message,
  }))
}
