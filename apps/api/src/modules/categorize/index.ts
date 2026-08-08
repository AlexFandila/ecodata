/**
 * Módulo `categorize`: categorías y motor de reglas.
 *
 * Esto es todo lo que el resto de `apps/api` puede ver del módulo —lo demás son
 * internals y `dependency-cruiser` lo hace cumplir en `pnpm lint`—.
 *
 * El reparto con `packages/core` es el de siempre: allí se **decide** qué
 * categoría le tocaría a un movimiento (función pura, sin base de datos), y
 * aquí se decide **a quién se le puede escribir** (el invariante 7) y se
 * persiste. Ver ADR-014.
 *
 * Ese reparto es también el motivo de que `setTransactionCategory` esté aquí y
 * no en `ledger`, que es dueño de la fila del movimiento: quien manda sobre la
 * columna `category_source` es el invariante 7, y el invariante 7 vive en este
 * módulo. Categorizar a mano es la única dirección que permite —lo `manual`
 * pisa lo que puso una regla, nunca al revés—, y tenerla junto al `WHERE` que
 * la protege es lo que evita que se contradigan.
 *
 * `INTERNAL_TRANSFER_SLUG` sale por aquí para que el módulo `ledger`, cuando
 * llegue, pueda cumplir el invariante 3 sin entrar en `db/schema.ts`: el slug
 * de la categoría del sistema es asunto de quien siembra las categorías.
 */

export type { Category, Rule } from '../../db/schema'
export { INTERNAL_TRANSFER_SLUG } from '../../db/schema'
export { type CategorizeOptions, type CategorizeOutcome, categorizeTransactions } from './apply'
export { listCategories } from './categories'
export {
  CategoryNotFoundError,
  TransactionNotFoundError,
  TransferLegNotCategorizableError,
} from './errors'
export { setTransactionCategory } from './manual'
export { createRule, listRules } from './rules'
export {
  SEED_CATEGORIES,
  type SeedCategoriesOutcome,
  type SeedCategory,
  type SeedSubcategory,
  seedCategories,
} from './seed'
