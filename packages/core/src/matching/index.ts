/**
 * Matching de transferencias internas: qué dos movimientos son las dos patas
 * del mismo traspaso entre cuentas propias.
 *
 * La heurística está en docs/DATA_MODEL.md; lo que aquel texto dejaba abierto
 * —la estrategia de asignación, si el +2 acumula, si hace falta puntuación
 * mínima— lo fija ADR-013.
 *
 * Aquí solo se decide. Persistirlo (la tabla `transfers`, `transfer_id`, la
 * categoría `internal_transfer`) es del módulo `ledger` de la api.
 */

export {
  TRANSFER_MATCH_SIGNALS,
  type TransferCandidate,
  type TransferMatch,
  type TransferMatchingAccount,
  type TransferMatchingInput,
  type TransferMatchingResult,
  type TransferMatchSignal,
  type UnresolvedCandidate,
} from './candidate'
export { TransferMatchingError } from './errors'
export { matchInternalTransfers } from './match'
export { TRANSFER_CLOSE_DAY_GAP, TRANSFER_MAX_DAY_GAP } from './score'
export { normalizeForMatching } from './text'
