/**
 * La forma de lo que entra y sale del motor de reglas de categorización
 * (docs/DATA_MODEL.md, "Pipeline de categorización"; ADR-014).
 *
 * Los tipos son propios de `core` y no los contratos de `packages/shared`: el
 * dominio no importa de shared (ADR-009 punto 2 ya eligió duplicar antes que
 * crear esa arista), y para decidir qué categoría le toca a un movimiento no
 * hace falta ni `raw`, ni `sourceHash`, ni el importe.
 */

/** Campo del movimiento contra el que se compara el patrón. */
export const RULE_FIELDS = ['counterparty', 'description'] as const
export type RuleField = (typeof RULE_FIELDS)[number]

/**
 * Cómo se compara el patrón.
 *
 * `contains` es subcadena sobre texto normalizado —la vía normal, la que
 * escribe cualquiera desde la UI—; `regex` va contra el texto crudo y es la
 * salida para el caso raro. Por qué son distintos, en ADR-014 (decisiones 1 y 2).
 */
export const RULE_MATCH_TYPES = ['contains', 'regex'] as const
export type RuleMatchType = (typeof RULE_MATCH_TYPES)[number]

/**
 * Una regla tal como la ve el motor.
 *
 * Precondición de quien construye la lista: aquí solo llegan reglas **activas**.
 * Es decir, `rules.active` es un filtro de consulta y no una regla del dominio,
 * el mismo criterio con el que el matching deja fuera el borrado lógico
 * (ADR-013). Por eso este tipo no tiene campo `active`: si lo tuviera, habría
 * dos sitios donde olvidarse de mirarlo.
 */
export type CategoryRule = {
  readonly id: number
  /** Menor = se evalúa antes. La primera coincidencia gana. */
  readonly priority: number
  readonly field: RuleField
  readonly matchType: RuleMatchType
  readonly pattern: string
  readonly categoryId: number
}

/**
 * Un movimiento tal como lo ve el motor: un id y los dos textos.
 *
 * Los dos campos son nulables porque las fuentes llenan uno u otro y casi nunca
 * los dos: la Norma 43 deja `counterparty` a null y lo mete todo en
 * `description` (ADR-010 punto 7), y Revolut hace justo lo contrario (ADR-011
 * punto 1). Una regla contra un campo nulo no casa nunca.
 */
export type CategorizableTransaction = {
  readonly id: number
  readonly counterparty: string | null
  readonly description: string | null
}

export type CategoryRulesInput = {
  readonly transactions: readonly CategorizableTransaction[]
  /** Solo reglas activas; ver `CategoryRule`. */
  readonly rules: readonly CategoryRule[]
}

/**
 * A qué categoría va un movimiento y quién lo decidió.
 *
 * `ruleId` viaja con la asignación para que la pantalla pueda decir "te lo
 * categorizó la regla X" y para que quitar esa regla sea explicable. No se
 * guarda en `transactions` —ahí solo cabe `category_source = 'rule'`—, pero sí
 * lo devuelve el motor, que es donde se sabe.
 */
export type CategoryAssignment = {
  readonly transactionId: number
  readonly categoryId: number
  readonly ruleId: number
}

/** Por qué una regla no se pudo evaluar. */
export const INVALID_RULE_REASONS = [
  /** El patrón no compila como expresión regular. */
  'invalid_regex',
  /**
   * El patrón de un `contains` se queda en nada al normalizarlo: era solo
   * puntuación. Se reporta en vez de dejarlo pasar porque una aguja vacía está
   * contenida en cualquier texto, y la regla categorizaría el extracto entero.
   */
  'empty_pattern',
] as const

export type InvalidRuleReason = (typeof INVALID_RULE_REASONS)[number]

/**
 * Una regla que no se pudo evaluar y se saltó.
 *
 * No lanza (ADR-014 decisión 4). Una regla que alguien guardó hace meses no
 * puede impedir que hoy entre un extracto: se salta, se avisa, y el resto de
 * reglas siguen aplicándose.
 */
export type InvalidRule = {
  readonly ruleId: number
  readonly reason: InvalidRuleReason
  /** Explicación en español, para poder corregir la regla desde la UI. */
  readonly message: string
}

export type CategoryRulesResult = {
  /**
   * Solo los movimientos que casaron con alguna regla, ordenados por
   * `transactionId` ascendente. La ausencia **es** "sin categorizar": no hace
   * falta una lista de los que no casaron, igual que el matching no inventa una
   * columna para los que se quedan sin pareja.
   */
  readonly assignments: readonly CategoryAssignment[]
  /** Reglas saltadas, ordenadas por `ruleId` ascendente. */
  readonly invalidRules: readonly InvalidRule[]
}
