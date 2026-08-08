/**
 * Contratos de categorías.
 *
 * Se define el contrato aunque la ruta `GET /categories` todavía no exista: lo
 * necesitan ya el motor de reglas y la semilla, y una categoría es lo primero
 * que va a pedir la pantalla de movimientos. La ruta entra con esa pantalla
 * (ADR-009).
 */
import { z } from 'zod'
import { categoryKindSchema } from './enums'
import { entityIdSchema, trimmedText } from './primitives'

/**
 * Identificador estable e independiente del nombre visible: minúsculas, cifras
 * y guiones bajos. El código referencia `internal_transfer` por aquí, no por un
 * id que la semilla podría renumerar (DATA_MODEL.md, `### categories`).
 *
 * Se valida la forma —y no solo que no esté vacío— porque un slug con espacios
 * o acentos deja de ser escribible en el código que lo referencia, que es lo
 * único para lo que sirve un slug.
 */
export const categorySlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-z][a-z0-9_]*$/, 'El slug solo admite minúsculas, cifras y guiones bajos')

export const categorySchema = z.object({
  id: entityIdSchema,
  slug: categorySlugSchema,
  /** El nombre visible, en español: es texto de interfaz, no un identificador. */
  name: trimmedText(60),
  kind: categoryKindSchema,
  /** Categoría madre, si es una subcategoría. El árbol tiene dos niveles. */
  parentId: entityIdSchema.nullable(),
  /** Emoji para la lista del móvil, donde no cabe más que un icono y el nombre. */
  icon: trimmedText(8).nullable(),
})

export type Category = z.infer<typeof categorySchema>

/**
 * Envuelto en un objeto y no como array pelado: así se le pueden añadir
 * metadatos (gasto del mes por categoría, por ejemplo) sin romper a quien ya lo
 * lee.
 */
export const categoryListResponseSchema = z.object({
  categories: z.array(categorySchema),
})

export type CategoryListResponse = z.infer<typeof categoryListResponseSchema>
