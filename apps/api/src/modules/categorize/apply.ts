/**
 * Aplicar las reglas a los movimientos que ya están en la base.
 *
 * Es la mitad con IO del pipeline de categorización de docs/DATA_MODEL.md: la
 * decisión de qué categoría le toca a cada movimiento la toma
 * `applyCategoryRules` en `packages/core`, y aquí se decide **a quién se le
 * puede escribir** —el invariante 7— y se persiste.
 *
 * Esa división no es casual. El invariante 7 es un filtro de consulta, no una
 * regla del dominio: vive en el `WHERE` de abajo, igual que en el matching de
 * transferencias el borrado lógico y el «no emparejado ya» viven en la consulta
 * y no en `matchInternalTransfers` (ADR-013).
 */
import { applyCategoryRules, type CategoryRule, type InvalidRule } from '@finanzas/core'
import { and, eq, isNull, or } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { rules, transactions } from '../../db/schema'

export type CategorizeOptions = {
  /**
   * Acotar a los movimientos de una importación. Es el caso del paso 1 del
   * pipeline: recién importados, todos sin categoría. Sin él se recategoriza
   * todo lo recategorizable, que es el botón «recategorizar» de la UI.
   */
  readonly importId?: number
}

export type CategorizeOutcome = {
  /** Movimientos examinados: los que el invariante 7 deja tocar. */
  readonly scanned: number
  /** Movimientos a los que esta pasada les ha **escrito** una categoría. */
  readonly categorized: number
  /** Movimientos devueltos a «sin categorizar» porque ya no casan con nada. */
  readonly cleared: number
  /** Reglas saltadas por tener el patrón roto; se avisa, no se falla. */
  readonly invalidRules: readonly InvalidRule[]
}

/**
 * Categoriza los movimientos pendientes según las reglas activas.
 *
 * Los contadores cuentan **cambios**, no estado: volver a llamarla sin tocar
 * nada devuelve `categorized: 0`, que es la respuesta correcta a «¿qué has
 * hecho?».
 */
export function categorizeTransactions(db: Db, options: CategorizeOptions = {}): CategorizeOutcome {
  const activeRules: CategoryRule[] = db
    .select({
      id: rules.id,
      priority: rules.priority,
      field: rules.field,
      matchType: rules.matchType,
      pattern: rules.pattern,
      categoryId: rules.categoryId,
    })
    .from(rules)
    .where(eq(rules.active, true))
    .all()

  const targets = db
    .select({
      id: transactions.id,
      counterparty: transactions.counterparty,
      description: transactions.description,
      categoryId: transactions.categoryId,
    })
    .from(transactions)
    .where(
      and(
        // Invariante 5: los borrados no cuentan para nada.
        isNull(transactions.deletedAt),
        // Invariante 3: una pata de transferencia interna tiene su categoría
        // puesta por el módulo `ledger` y las reglas no pintan nada ahí.
        isNull(transactions.transferId),
        // Invariante 7: solo lo que no tiene categoría o la puso una regla. Lo
        // `manual` y lo `suggestion` no se tocan jamás automáticamente.
        or(isNull(transactions.categoryId), eq(transactions.categorySource, 'rule')),
        options.importId === undefined ? undefined : eq(transactions.importId, options.importId),
      ),
    )
    .all()

  const { assignments, invalidRules } = applyCategoryRules({
    transactions: targets,
    rules: activeRules,
  })
  const assigned = new Map(assignments.map((a) => [a.transactionId, a.categoryId]))

  let categorized = 0
  let cleared = 0

  db.transaction((tx) => {
    for (const target of targets) {
      const next = assigned.get(target.id) ?? null
      // Ya está como debe: no se escribe por escribir.
      if (next === target.categoryId) continue

      if (next === null) {
        // La regla que lo categorizó se borró o dejó de casar. Devolverlo a
        // «sin categorizar» y no dejarlo como estaba es lo que evita una
        // categoría fantasma que ninguna regla explica y que además no
        // aparecería en la bandeja de pendientes (ADR-014 decisión 6).
        tx.update(transactions)
          .set({ categoryId: null, categorySource: null })
          .where(eq(transactions.id, target.id))
          .run()
        cleared += 1
      } else {
        tx.update(transactions)
          .set({ categoryId: next, categorySource: 'rule' })
          .where(eq(transactions.id, target.id))
          .run()
        categorized += 1
      }
    }
  })

  return { scanned: targets.length, categorized, cleared, invalidRules }
}
