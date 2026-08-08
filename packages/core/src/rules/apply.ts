/**
 * Motor de reglas de categorización: dado un conjunto de movimientos y las
 * reglas activas, qué categoría le toca a cada uno.
 *
 * Implementa los pasos 1 y 2 del "Pipeline de categorización" de
 * docs/DATA_MODEL.md: reglas por orden de `priority`, la primera coincidencia
 * gana, y sin coincidencia el movimiento se queda sin categoría. Lo que aquel
 * texto dejaba abierto —qué hace exactamente `contains`, contra qué texto va
 * `regex`, cómo se desempatan dos reglas con la misma prioridad y qué pasa con
 * un patrón roto— lo fija ADR-014.
 *
 * Es una función pura y determinista: sin reloj, sin aleatoriedad, y el
 * resultado no depende del orden en que lleguen las reglas ni los movimientos.
 *
 * Aquí solo se decide. Escribir `category_id` y `category_source`, y sobre todo
 * decidir **a quién** se le permite escribir (invariante 7), es del módulo
 * `categorize` de la api: eso es un filtro de consulta, no una regla del
 * dominio.
 */

import { CategoryRulesError } from './errors'
import { compilePattern, type FieldText, fieldText } from './pattern'
import type {
  CategorizableTransaction,
  CategoryAssignment,
  CategoryRule,
  CategoryRulesInput,
  CategoryRulesResult,
  InvalidRule,
  RuleField,
} from './rule'

/** Una regla con su patrón ya compilado: se hace una vez, no por movimiento. */
type PreparedRule = {
  readonly id: number
  readonly field: RuleField
  readonly categoryId: number
  readonly matches: (text: FieldText) => boolean
}

/** Un movimiento con sus dos campos ya normalizados. */
type PreparedTransaction = {
  readonly id: number
  readonly fields: Readonly<Record<RuleField, FieldText | null>>
}

/**
 * Aplica las reglas a un lote de movimientos.
 *
 * Lanza `CategoryRulesError` ante lo que solo puede ser un fallo de quien
 * llama: ids repetidos o una prioridad que no es un entero. Un patrón que no
 * compila **no** lanza: sale en `invalidRules` y las demás reglas siguen
 * aplicándose (ADR-014 decisión 4).
 */
export function applyCategoryRules(input: CategoryRulesInput): CategoryRulesResult {
  const invalidRules: InvalidRule[] = []
  const rules = prepareRules(input.rules, invalidRules)
  const transactions = prepareTransactions(input.transactions)

  const assignments: CategoryAssignment[] = []
  for (const transaction of transactions) {
    const rule = firstMatch(transaction, rules)
    if (rule !== undefined) {
      assignments.push({
        transactionId: transaction.id,
        categoryId: rule.categoryId,
        ruleId: rule.id,
      })
    }
  }

  assignments.sort((a, b) => a.transactionId - b.transactionId)
  invalidRules.sort((a, b) => a.ruleId - b.ruleId)

  return { assignments, invalidRules }
}

/**
 * Valida, ordena y compila las reglas.
 *
 * El orden es `priority` ascendente y, a igualdad, `id` ascendente. El segundo
 * criterio no es decorativo: `priority` sola no es un orden total, y sin él dos
 * reglas empatadas se aplicarían según cómo SQLite hubiera devuelto las filas,
 * que es tanto como decir al azar (ADR-014 decisión 3).
 */
function prepareRules(rules: readonly CategoryRule[], invalidRules: InvalidRule[]): PreparedRule[] {
  const seen = new Set<number>()
  for (const rule of rules) {
    if (!Number.isInteger(rule.priority)) {
      throw new CategoryRulesError(`La prioridad de la regla ${rule.id} no es un entero`)
    }
    if (seen.has(rule.id)) {
      throw new CategoryRulesError(`Hay dos reglas con el id ${rule.id}`)
    }
    seen.add(rule.id)
  }

  const ordered = [...rules].sort((a, b) => a.priority - b.priority || a.id - b.id)

  const prepared: PreparedRule[] = []
  for (const rule of ordered) {
    const pattern = compilePattern(rule.matchType, rule.pattern)
    if (pattern.ok) {
      prepared.push({
        id: rule.id,
        field: rule.field,
        categoryId: rule.categoryId,
        matches: pattern.matches,
      })
    } else {
      invalidRules.push({ ruleId: rule.id, reason: pattern.reason, message: pattern.message })
    }
  }

  return prepared
}

function prepareTransactions(
  transactions: readonly CategorizableTransaction[],
): PreparedTransaction[] {
  const seen = new Set<number>()

  return transactions.map((transaction) => {
    if (seen.has(transaction.id)) {
      throw new CategoryRulesError(`Hay dos movimientos con el id ${transaction.id}`)
    }
    seen.add(transaction.id)

    return {
      id: transaction.id,
      fields: {
        counterparty:
          transaction.counterparty === null ? null : fieldText(transaction.counterparty),
        description: transaction.description === null ? null : fieldText(transaction.description),
      },
    }
  })
}

/**
 * La primera regla que casa, o `undefined`.
 *
 * Un campo nulo no casa nunca, ni siquiera con un patrón que aceptaría la
 * cadena vacía: la Norma 43 deja `counterparty` a null y Revolut deja seco el
 * otro campo (ADR-010 punto 7, ADR-011 punto 1), así que "no hay dato" tiene
 * que ser distinguible de "el dato está vacío".
 */
function firstMatch(
  transaction: PreparedTransaction,
  rules: readonly PreparedRule[],
): PreparedRule | undefined {
  return rules.find((rule) => {
    const text = transaction.fields[rule.field]
    return text !== null && rule.matches(text)
  })
}
