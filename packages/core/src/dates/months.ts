/**
 * Aritmética de meses de calendario ISO (`'2026-03'`).
 *
 * Es la hermana de `days.ts` y comparte su criterio: el texto se trocea a mano y
 * los instantes se construyen con `Date.UTC`, nunca con `new Date(texto)`. Aquí
 * la trampa tiene además una segunda cara. `new Date(2026, 0, 31)` más un mes no
 * da febrero: da el 3 de marzo, porque `Date` desborda el día que no existe. Un
 * mes no tiene día, así que el desbordamiento no puede ocurrir si nunca se
 * construye la fecha con el día original: aquí se opera **sobre el índice de mes
 * absoluto** (`año * 12 + mes`) y el día se recupera al final, ya sabiendo cuál
 * es el último del mes de destino.
 *
 * Existe porque el dashboard agrega por mes: el rango de un mes, la serie de los
 * últimos seis y el salto a mes anterior o siguiente. El motor financiero de la
 * Fase 2 va a querer lo mismo.
 */

import { isCalendarDate } from './days'
import { CalendarDateError } from './errors'

/** La forma, no el calendario: `'2026-13'` la cumple y no es un mes. */
const ISO_MONTH = /^(\d{4})-(\d{2})$/

/**
 * Índice de mes absoluto desde el año 0: `año * 12 + (mes - 1)`.
 *
 * Es la representación en la que sumar meses es sumar un entero, sin días de por
 * medio que puedan desbordar. `null` si el texto no es un mes que exista.
 */
function indexOrNull(month: string): number | null {
  const parts = ISO_MONTH.exec(month)
  if (parts === null) return null

  const year = Number(parts[1])
  const monthNumber = Number(parts[2])
  if (monthNumber < 1 || monthNumber > 12) return null

  return year * 12 + (monthNumber - 1)
}

/** El camino de vuelta: del índice absoluto al texto `YYYY-MM`. */
function monthAt(index: number): string {
  const year = Math.floor(index / 12)
  const monthNumber = (index % 12) + 1

  if (year < 0 || year > 9999) {
    throw new CalendarDateError(`El mes resultante se sale del calendario: año ${year}`)
  }

  return `${String(year).padStart(4, '0')}-${String(monthNumber).padStart(2, '0')}`
}

function invalidMonth(value: string): CalendarDateError {
  return new CalendarDateError(`Mes de calendario inválido: ${JSON.stringify(value)}`)
}

function indexOrThrow(month: string): number {
  const index = indexOrNull(month)
  if (index === null) throw invalidMonth(month)

  return index
}

/**
 * ¿Es un mes de calendario ISO `YYYY-MM` que exista?
 *
 * Más estricta que la forma: `'2026-13'` y `'2026-00'` se rechazan.
 */
export function isCalendarMonth(value: string): boolean {
  return indexOrNull(value) !== null
}

/**
 * El mes al que pertenece un día: `'2026-03-15'` → `'2026-03'`.
 *
 * Es un recorte de texto y no una conversión, que es justo lo que permite que la
 * consulta equivalente en SQL sea un `substr(booked_at, 1, 7)` sobre la misma
 * columna de texto: los dos hacen exactamente lo mismo sobre el mismo dato.
 *
 * La validez la comprueba `isCalendarDate`, la misma que usa el resto del
 * módulo, así que `'2026-02-31'` se rechaza aquí por el mismo motivo que allí.
 */
export function monthOf(date: string): string {
  if (!isCalendarDate(date)) {
    throw new CalendarDateError(`Fecha de calendario inválida: ${JSON.stringify(date)}`)
  }

  return date.slice(0, 7)
}

/** Cuántos días tiene un mes. El día 0 del siguiente es el último de este. */
function lastDayOf(index: number): number {
  const year = Math.floor(index / 12)
  const monthNumber = (index % 12) + 1

  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
}

/**
 * El primer y el último día de un mes, como fechas ISO: los dos extremos de un
 * `BETWEEN` sobre `booked_at`.
 *
 * El último día se pregunta al calendario en vez de leerlo de una tabla, así que
 * febrero de 2024 son 29 días y el de 2025, 28, sin ninguna regla de bisiestos
 * escrita aquí.
 */
export function monthRange(month: string): { readonly from: string; readonly to: string } {
  const index = indexOrThrow(month)

  return { from: `${month}-01`, to: `${month}-${String(lastDayOf(index)).padStart(2, '0')}` }
}

/**
 * Mueve un mes `delta` posiciones, hacia adelante o hacia atrás.
 *
 * `addMonths('2026-01', 1)` es `'2026-02'` y no el 3 de marzo, que es lo que
 * daría sumar 31 días o construir la fecha con el día original.
 */
export function addMonths(month: string, delta: number): string {
  if (!Number.isSafeInteger(delta)) {
    throw new CalendarDateError(`El desplazamiento en meses es un entero; recibido: ${delta}`)
  }

  return monthAt(indexOrThrow(month) + delta)
}

/**
 * Los `count` meses que **acaban** en `month`, en orden ascendente.
 *
 * `monthsEndingAt('2026-03', 3)` es `['2026-01', '2026-02', '2026-03']`: el mes
 * pedido va incluido y es el último, porque es la serie que pinta una gráfica de
 * evolución —el presente a la derecha—. Se devuelven todos, también los que no
 * tengan ni un movimiento: un hueco en la serie es información perdida, no un
 * mes que no ocurrió.
 *
 * Se llama así y no `previousMonths` porque «previous» se lee como excluyente, y
 * de esa duda salen ventanas de cinco meses o de siete. `endingAt` dice a la
 * vez dónde acaba la serie y que ese extremo entra.
 */
export function monthsEndingAt(month: string, count: number): readonly string[] {
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new CalendarDateError(`El número de meses es un entero positivo; recibido: ${count}`)
  }

  const last = indexOrThrow(month)

  return Array.from({ length: count }, (_, offset) => monthAt(last - (count - 1 - offset)))
}
