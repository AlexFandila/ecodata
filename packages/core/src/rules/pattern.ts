/**
 * Cómo se compara el patrón de una regla con el texto de un movimiento.
 *
 * Los dos tipos de comparación de docs/DATA_MODEL.md tratan el texto de forma
 * deliberadamente distinta (ADR-014, decisiones 1 y 2):
 *
 * - `contains` compara **subcadena sobre texto normalizado** con
 *   `normalizeForMatching`, la misma normalización que usa el matching de
 *   transferencias. Así `NOMINA` casa con `Nómina transf.` y `SUPER` casa con
 *   `SUPERMERCADO`, que es lo que espera quien escribe "contiene".
 * - `regex` compara **contra el texto crudo**, con banderas `iu`. Normalizar
 *   antes rompería en silencio cualquier patrón que cite un acento o un signo
 *   (`\.`, `€`, `NÓMINA`), y quien escribe una expresión regular lo hace justo
 *   para controlar eso.
 *
 * `contains` no usa `containsWord` a propósito, aunque esté al lado: aquella
 * compara por palabra completa porque sus agujas son **inferidas** (el nombre
 * del titular, donde "ANA" casaría con "PLATANOS"). El patrón de una regla lo
 * escribe el usuario a conciencia, y quien quiera frontera de palabra tiene
 * `regex`.
 */

import { normalizeForMatching } from '../matching/text'
import type { InvalidRuleReason, RuleMatchType } from './rule'

/**
 * El texto de un campo en sus dos formas.
 *
 * Se calculan una vez por movimiento y no una vez por regla: con veinte reglas
 * `contains`, normalizar dentro del comparador sería normalizar el mismo texto
 * veinte veces.
 */
export type FieldText = {
  /** Tal como vino del banco. Es lo que mira `regex`. */
  readonly raw: string
  /** Pasado por `normalizeForMatching`. Es lo que mira `contains`. */
  readonly normalized: string
}

/** Prepara los dos textos de un campo. */
export function fieldText(value: string): FieldText {
  return { raw: value, normalized: normalizeForMatching(value) }
}

/**
 * Un patrón ya listo para comparar, o el motivo por el que no se pudo preparar.
 *
 * Se devuelve el fallo en vez de lanzarlo porque el patrón viene de la base de
 * datos, no del programa: una regla mala se salta y se reporta (ADR-014
 * decisión 4). Es la misma familia que `tryParseAmount` y `tryDaysBetween`
 * (ADR-008 punto 5), solo que aquí el motivo del fallo hay que enseñárselo al
 * usuario y un `null` pelado no lo diría.
 */
export type CompiledPattern =
  | {
      readonly ok: true
      readonly matches: (text: FieldText) => boolean
    }
  | {
      readonly ok: false
      readonly reason: InvalidRuleReason
      readonly message: string
    }

/**
 * Prepara un patrón una sola vez para usarlo contra muchos movimientos.
 *
 * Compilar por movimiento sería recompilar la misma expresión regular miles de
 * veces en una importación; por eso el resultado es un cierre y no una función
 * `matches(pattern, value)`.
 */
export function compilePattern(matchType: RuleMatchType, pattern: string): CompiledPattern {
  switch (matchType) {
    case 'contains':
      return compileContains(pattern)
    case 'regex':
      return compileRegex(pattern)
  }
}

function compileContains(pattern: string): CompiledPattern {
  const needle = normalizeForMatching(pattern)

  // Una aguja vacía está contenida en todo: la regla se tragaría el extracto
  // entero. Es el único caso en que `contains` no puede hacer lo que dice.
  if (needle === '') {
    return {
      ok: false,
      reason: 'empty_pattern',
      message: 'El patrón no tiene letras ni números: no se puede buscar',
    }
  }

  return { ok: true, matches: (text) => text.normalized.includes(needle) }
}

function compileRegex(pattern: string): CompiledPattern {
  let regex: RegExp
  try {
    // `i` porque los extractos alternan mayúsculas sin criterio; `u` para que
    // `\p{...}` y los caracteres fuera del plano básico funcionen. `u` es
    // además más estricta con los escapes inútiles, y eso es bueno: el mismo
    // error salta al crear la regla, no meses después al importar.
    regex = new RegExp(pattern, 'iu')
  } catch (error) {
    return {
      ok: false,
      reason: 'invalid_regex',
      message: `Expresión regular no válida: ${error instanceof Error ? error.message : String(error)}`,
    }
  }

  // Sin bandera `g`: una regex global arrastra `lastIndex` entre llamadas y el
  // resultado dependería de cuántas veces se haya usado antes.
  return { ok: true, matches: (text) => regex.test(text.raw) }
}
