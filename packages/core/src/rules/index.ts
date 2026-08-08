/**
 * Motor de reglas de categorización: qué categoría le toca a un movimiento
 * según las reglas que haya escrito el usuario.
 *
 * El pipeline está en docs/DATA_MODEL.md ("Pipeline de categorización"); lo que
 * aquel texto dejaba abierto —qué compara exactamente cada `match_type`, cómo
 * se desempatan dos reglas con la misma prioridad, qué se hace con un patrón
 * roto— lo fija ADR-014.
 *
 * Aquí solo se decide. Persistirlo (`category_id`, `category_source`) y
 * respetar el invariante 7 —que lo puesto a mano no se pisa jamás— es del
 * módulo `categorize` de la api.
 */

export { applyCategoryRules } from './apply'
export { CategoryRulesError } from './errors'
export {
  type CategorizableTransaction,
  type CategoryAssignment,
  type CategoryRule,
  type CategoryRulesInput,
  type CategoryRulesResult,
  INVALID_RULE_REASONS,
  type InvalidRule,
  type InvalidRuleReason,
  RULE_FIELDS,
  RULE_MATCH_TYPES,
  type RuleField,
  type RuleMatchType,
} from './rule'
