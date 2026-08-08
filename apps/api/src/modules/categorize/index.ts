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
 * `INTERNAL_TRANSFER_SLUG` sale por aquí para que el módulo `ledger`, cuando
 * llegue, pueda cumplir el invariante 3 sin entrar en `db/schema.ts`: el slug
 * de la categoría del sistema es asunto de quien siembra las categorías.
 */

export { INTERNAL_TRANSFER_SLUG } from '../../db/schema'
export { type CategorizeOptions, type CategorizeOutcome, categorizeTransactions } from './apply'
export {
  SEED_CATEGORIES,
  type SeedCategoriesOutcome,
  type SeedCategory,
  type SeedSubcategory,
  seedCategories,
} from './seed'
