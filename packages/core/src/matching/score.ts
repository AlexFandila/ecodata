/**
 * La puntuación de un par candidato (docs/DATA_MODEL.md, "Puntuación").
 *
 * Existe para desempatar, no para aceptar: los criterios (a)-(d) deciden quién
 * es candidato y esto solo ordena entre varios. Por eso un candidato único con
 * cero puntos se empareja igual (ADR-013).
 */

import { TRANSFER_MATCH_SIGNALS, type TransferMatchSignal } from './candidate'
import { containsWord, normalizeForMatching } from './text'

/** Criterio (c): diferencia máxima de fechas entre las dos patas, en días. */
export const TRANSFER_MAX_DAY_GAP = 3

/** Umbral del +1: "si la diferencia de fechas es ≤ 1 día". */
export const TRANSFER_CLOSE_DAY_GAP = 1

/** Lo que suma reconocer un nombre; +1 lo que suma la cercanía de fechas. */
const NAME_POINTS = 2
const CLOSE_DATES_POINTS = 1

/**
 * Los textos de un movimiento, ya normalizados y unidos.
 *
 * Se precalcula una vez por candidato y no una vez por par: la contraparte solo
 * la llena Revolut y la descripción solo tiene señal en Unicaja (ADR-010 punto
 * 7, ADR-011), así que la heurística mira los dos campos siempre y da igual de
 * cuál venga el nombre.
 */
export function searchableText(counterparty: string | null, description: string | null): string {
  return normalizeForMatching(`${counterparty ?? ''} ${description ?? ''}`)
}

/** Los nombres a reconocer en una pata, ya normalizados y sin duplicados. */
export function normalizeNeedles(values: readonly string[]): readonly string[] {
  const seen = new Set<string>()
  for (const value of values) {
    const needle = normalizeForMatching(value)
    if (needle !== '') seen.add(needle)
  }

  return [...seen]
}

/** Un par ya listo para puntuar: textos y agujas precalculados. */
export type ScorableLeg = {
  /** Contraparte y descripción normalizadas y unidas. */
  readonly text: string
  /** Alias de la cuenta *de esta pata*, normalizados. */
  readonly accountNeedles: readonly string[]
}

export type PairScore = {
  readonly score: number
  readonly matchedBy: readonly TransferMatchSignal[]
}

/**
 * Puntúa un par y anota qué señales lo dispararon.
 *
 * Dos detalles que la especificación deja implícitos y que ADR-013 fija:
 *
 * - El +2 se suma **una sola vez**: la regla dice "el nombre del otro proveedor
 *   **o** del titular". Las dos señales se anotan por separado si ambas están
 *   —son útiles al depurar—, pero no acumulan puntos.
 * - Cada pata se compara contra los alias de la **otra** cuenta, nunca contra
 *   los suyos: que un apunte de Unicaja diga "UNICAJA" no es señal de nada.
 */
export function scorePair(
  a: ScorableLeg,
  b: ScorableLeg,
  holderNeedles: readonly string[],
  dayGap: number,
): PairScore {
  const signals = new Set<TransferMatchSignal>()

  if (namesAny(a.text, b.accountNeedles) || namesAny(b.text, a.accountNeedles)) {
    signals.add('other_provider_named')
  }

  if (namesAny(a.text, holderNeedles) || namesAny(b.text, holderNeedles)) {
    signals.add('holder_named')
  }

  if (dayGap <= TRANSFER_CLOSE_DAY_GAP) {
    signals.add('close_dates')
  }

  const namePoints =
    signals.has('other_provider_named') || signals.has('holder_named') ? NAME_POINTS : 0
  const datePoints = signals.has('close_dates') ? CLOSE_DATES_POINTS : 0

  return {
    score: namePoints + datePoints,
    matchedBy: TRANSFER_MATCH_SIGNALS.filter((signal) => signals.has(signal)),
  }
}

function namesAny(text: string, needles: readonly string[]): boolean {
  return needles.some((needle) => containsWord(text, needle))
}
