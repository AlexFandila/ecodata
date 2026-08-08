/**
 * Listar el árbol de categorías, que es lo que alimenta cualquier desplegable
 * de la app.
 *
 * Se devuelve plano y no anidado a propósito: el árbol tiene dos niveles y cada
 * fila ya lleva su `parentId`, así que quien pinta agrupa si le hace falta.
 * Anidarlo aquí obligaría a un contrato recursivo para ahorrarle al cliente un
 * `filter`.
 */
import { asc } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { type Category, categories } from '../../db/schema'

/**
 * Ordenadas por nombre, no por `id`: el orden en que las sembró
 * `seedCategories` no le dice nada a quien lee la lista. Basta con el nombre
 * porque el agrupado por madre lo hace el cliente con `parentId`, que es dato
 * de la fila y no del orden.
 */
export function listCategories(db: Db): Category[] {
  return db.select().from(categories).orderBy(asc(categories.name)).all()
}
