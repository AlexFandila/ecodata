/**
 * `GET /categories`: el árbol que alimenta cualquier desplegable de categorías.
 *
 * Solo lectura, y sin ningún caso de error propio —la lista siempre existe,
 * porque `seedCategories()` la siembra al arrancar la api—. Renombrar o crear
 * categorías no tiene todavía pantalla que lo pida, y el criterio de ADR-009 es
 * que una ruta entra con quien la consume, no antes.
 */
import { type Category, categoryListResponseSchema, categorySchema } from '@finanzas/shared'
import { Hono } from 'hono'
import type { Db } from '../../db/client'
import { type Category as CategoryRow, listCategories } from '../../modules/categorize/index'

function toDto(row: CategoryRow): Category {
  return categorySchema.parse(row)
}

export function createCategoriesRoutes(db: Db) {
  const routes = new Hono()

  routes.get('/', (c) => {
    return c.json(categoryListResponseSchema.parse({ categories: listCategories(db).map(toDto) }))
  })

  return routes
}
