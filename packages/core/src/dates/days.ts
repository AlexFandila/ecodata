/**
 * Aritmética de fechas de calendario ISO (`'2026-03-15'`).
 *
 * Una fecha contable no tiene hora ni zona horaria (docs/DATA_MODEL.md, nota de
 * implementación 2), así que aquí no se usa la hora local en ningún momento: se
 * parsea el texto a mano y se construye el instante con `Date.UTC`. `new
 * Date(texto)` sería la vía corta y es justo la trampa: la forma `YYYY-MM-DD`
 * se interpreta como UTC pero `'2026-3-15'` como hora local, y de esa
 * ambigüedad salen los desfases de un día.
 */

import { CalendarDateError } from './errors'

/** Milisegundos de un día. En UTC no hay horario de verano: siempre son exactos. */
const MS_PER_DAY = 86_400_000

/** La forma, no el calendario: `'2026-02-31'` la cumple y no es un día. */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * El instante UTC de medianoche de una fecha de calendario, o `null` si el
 * texto no es una fecha que exista.
 *
 * La comprobación es de ida y vuelta: `Date.UTC` no valida nada —desborda
 * `2026-02-31` a 3 de marzo sin rechistar—, así que se reconstruye la fecha
 * desde el epoch y se compara con lo que se leyó. Es lo único que distingue el
 * 29 de febrero de 2024 (existe) del de 2025 (no).
 */
function epochOrNull(value: string): number | null {
  const parts = ISO_DATE.exec(value)
  if (parts === null) return null

  const year = Number(parts[1])
  const month = Number(parts[2])
  const day = Number(parts[3])

  const epoch = Date.UTC(year, month - 1, day)
  const back = new Date(epoch)
  if (back.getUTCFullYear() !== year) return null
  if (back.getUTCMonth() !== month - 1) return null
  if (back.getUTCDate() !== day) return null

  return epoch
}

function invalidDate(value: string): CalendarDateError {
  return new CalendarDateError(`Fecha de calendario inválida: ${JSON.stringify(value)}`)
}

/**
 * ¿Es una fecha de calendario ISO `YYYY-MM-DD` que existe de verdad?
 *
 * Más estricta que el `CHECK ... GLOB` con el que la base valida `booked_at`:
 * aquel solo mira la forma, así que una fila puede llegar con `'2026-02-31'`.
 */
export function isCalendarDate(value: string): boolean {
  return epochOrNull(value) !== null
}

/**
 * Días de calendario de `from` a `to`, con signo (`to - from`).
 *
 * Lanza `CalendarDateError` si alguna de las dos no es una fecha que exista.
 * Para el valor absoluto —lo que pide el criterio (c) del matching— basta
 * `Math.abs()`: una función y no dos, porque dos funciones con semánticas
 * parecidas se acaban confundiendo.
 */
export function daysBetween(from: string, to: string): number {
  const start = epochOrNull(from)
  if (start === null) throw invalidDate(from)

  const end = epochOrNull(to)
  if (end === null) throw invalidDate(to)

  // La división es exacta (los dos son medianoche UTC); el redondeo solo blinda.
  return Math.round((end - start) / MS_PER_DAY)
}

/**
 * Como `daysBetween`, pero devuelve `null` en vez de lanzar cuando alguna fecha
 * no es válida. Para cuando el dato viene de fuera y quien llama decide.
 */
export function tryDaysBetween(from: string, to: string): number | null {
  const start = epochOrNull(from)
  const end = epochOrNull(to)
  if (start === null || end === null) return null

  return Math.round((end - start) / MS_PER_DAY)
}
