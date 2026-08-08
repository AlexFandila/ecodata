/**
 * Deduplicación: la identidad de un movimiento, independiente de por dónde
 * haya entrado (invariante 1 de docs/DATA_MODEL.md, ADR-012).
 */

export { type SourceHashInput, sourceHash } from './source-hash'
