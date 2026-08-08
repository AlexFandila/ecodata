/**
 * Categorizar un movimiento a mano: el paso 3 del pipeline de categorización de
 * docs/DATA_MODEL.md.
 *
 * Vive en `categorize` y no en `ledger` porque quien es dueño del invariante 7
 * —quién puede escribir la categoría de un movimiento— es este módulo (ADR-014
 * decisión 5). Aquí se ejerce la única dirección que ese invariante permite:
 * lo `manual` **sí** pisa lo que puso una regla, y a partir de entonces ninguna
 * recategorización automática lo vuelve a tocar, porque el `WHERE` de `apply.ts`
 * ya no lo alcanza.
 */
import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { categories, type Transaction, transactions } from '../../db/schema'
import {
  CategoryNotFoundError,
  TransactionNotFoundError,
  TransferLegNotCategorizableError,
} from './errors'

/**
 * Pone (o quita) la categoría de un movimiento y devuelve cómo queda.
 *
 * `categoryId === null` lo devuelve a la bandeja de pendientes: es el deshacer
 * de haberse equivocado al categorizar, y también escribe `categorySource` a
 * `null` porque el invariante 7 exige que vayan los dos o ninguno —lo comprueba
 * además un `CHECK` de la base—.
 */
export function setTransactionCategory(
  db: Db,
  transactionId: number,
  categoryId: number | null,
): Transaction {
  const current = db
    .select({ transferId: transactions.transferId })
    .from(transactions)
    .where(and(eq(transactions.id, transactionId), isNull(transactions.deletedAt)))
    .get()

  if (current === undefined) {
    throw new TransactionNotFoundError(transactionId)
  }
  if (current.transferId !== null) {
    throw new TransferLegNotCategorizableError(transactionId)
  }

  // La clave foránea también lo rechazaría, pero como un error de base de datos
  // opaco: comprobarlo aquí es lo que permite contestar "esa categoría no
  // existe" en vez de un 500.
  if (categoryId !== null) {
    const category = db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, categoryId))
      .get()
    if (category === undefined) {
      throw new CategoryNotFoundError(categoryId)
    }
  }

  const updated = db
    .update(transactions)
    .set(
      categoryId === null
        ? { categoryId: null, categorySource: null }
        : { categoryId, categorySource: 'manual' },
    )
    .where(eq(transactions.id, transactionId))
    .returning()
    .get()

  if (updated === undefined) {
    throw new Error(`La actualización del movimiento ${transactionId} no devolvió ninguna fila`)
  }
  return updated
}
