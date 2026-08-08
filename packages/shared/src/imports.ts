/**
 * Contratos de importación: `POST /imports`.
 *
 * La petición es `multipart/form-data` —lleva el fichero—, así que estos
 * esquemas describen los **campos** que acompañan al fichero, no el fichero en
 * sí. Como en un formulario todo llega en texto, los campos numéricos se
 * coaccionan aquí en lugar de a mano en la ruta.
 */
import { z } from 'zod'
import { importSourceSchema } from './enums'
import { entityIdSchema, isoDateTimeSchema, nonNegativeIntSchema, trimmedText } from './primitives'

export const createImportRequestSchema = z.object({
  /** Cuenta a la que van los movimientos del fichero: la elige el usuario. */
  accountId: z.coerce.number().pipe(entityIdSchema),
  /** Adaptador con el que interpretar el fichero. */
  source: importSourceSchema,
  /** Nombre original, solo para poder reconocer el import después en la lista. */
  fileName: trimmedText(255).nullable().default(null),
})

export type CreateImportRequest = z.infer<typeof createImportRequestSchema>

/**
 * Recuento de lo que pasó, tal como se guarda en `imports.stats`.
 *
 * `duplicated` no es un error: reimportar un fichero que solapa con otro
 * anterior es lo normal (invariante 1), y saber cuántas filas se descartaron
 * por repetidas es justo lo que confirma que la deduplicación funcionó.
 */
export const importStatsSchema = z.object({
  read: nonNegativeIntSchema,
  inserted: nonNegativeIntSchema,
  duplicated: nonNegativeIntSchema,
  errors: nonNegativeIntSchema,
})

export type ImportStats = z.infer<typeof importStatsSchema>

/**
 * Una fila que no se pudo normalizar, con su número de línea dentro del fichero
 * (1 = primera fila de datos, sin contar la cabecera).
 *
 * Existe para que un extracto con tres celdas ilegibles importe las otras
 * doscientas y diga cuáles falló, en vez de rechazar el fichero entero. Es el
 * mismo criterio que `tryParseAmount` en `packages/core` (ADR-008): un dato
 * sucio de un CSV no es un error del programa, es un dato sucio.
 */
export const importRowErrorSchema = z.object({
  row: z.int().positive(),
  message: z.string(),
})

export type ImportRowError = z.infer<typeof importRowErrorSchema>

/** Lo que ve la pantalla "resultado del import" después de subir un fichero. */
export const importResultResponseSchema = z.object({
  importId: entityIdSchema,
  accountId: entityIdSchema,
  source: importSourceSchema,
  fileName: z.string().nullable(),
  importedAt: isoDateTimeSchema,
  stats: importStatsSchema,
  rowErrors: z.array(importRowErrorSchema),
})

export type ImportResultResponse = z.infer<typeof importResultResponseSchema>
