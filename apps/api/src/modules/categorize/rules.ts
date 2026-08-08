/**
 * Alta y listado de reglas de categorización.
 *
 * Aquí no se valida el patrón: eso ya lo hizo `createRuleRequestSchema` en el
 * borde HTTP, compilándolo con las mismas banderas con las que lo compilará el
 * motor (ADR-014 decisión 4, primera capa). La segunda capa —saltarse una regla
 * rota en vez de tumbar el lote— la pone `applyCategoryRules`.
 */
import type { CreateRuleRequest } from '@finanzas/shared'
import { asc, eq } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { categories, type Rule, rules } from '../../db/schema'
import { CategoryNotFoundError } from './errors'

/**
 * En el mismo orden en que las evalúa el motor —`priority` ascendente y, a
 * igualdad, `id` ascendente (ADR-014 decisión 3)—, para que la lista de la
 * pantalla se lea como lo que va a pasar y no como otra cosa.
 */
export function listRules(db: Db): Rule[] {
  return db.select().from(rules).orderBy(asc(rules.priority), asc(rules.id)).all()
}

export function createRule(db: Db, input: CreateRuleRequest): Rule {
  const category = db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, input.categoryId))
    .get()
  if (category === undefined) {
    throw new CategoryNotFoundError(input.categoryId)
  }

  const row = db.insert(rules).values(input).returning().get()
  if (row === undefined) {
    throw new Error('La inserción de la regla no devolvió ninguna fila')
  }
  return row
}
