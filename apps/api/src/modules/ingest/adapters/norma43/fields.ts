/**
 * Cómo se lee cada tipo de campo del cuaderno 43.
 *
 * Todas estas funciones devuelven `null` ante un dato ilegible en vez de
 * lanzar, por el mismo motivo que `tryParseAmount` en `packages/core` (ADR-008):
 * una celda mal formada es un dato sucio, y quien la lee es quien decide si la
 * fila entera se descarta o si el fichero es irrecuperable.
 */
import { minorUnitsOf, money } from '@finanzas/core'
import type { Currency } from '@finanzas/shared'

const ONLY_DIGITS = /^\d+$/

/**
 * Ventana de siglo para el año de dos dígitos de la norma (`AAMMDD`).
 *
 * La norma no la fija, así que se elige aquí y se documenta en ADR-010 en vez
 * de dejarla implícita: `00`–`79` son 20xx y `80`–`99` son 19xx.
 */
const CENTURY_PIVOT = 80

/** Divisas en ISO 4217 **numérico**, que es como las escribe el cuaderno 43. */
const CURRENCY_BY_NUMERIC: Readonly<Record<string, Currency>> = {
  '978': 'EUR',
  '840': 'USD',
  '826': 'GBP',
  '756': 'CHF',
  '392': 'JPY',
}

/** Texto de un campo; `null` si viene vacío o solo con espacios (nunca cadena vacía). */
export function textOrNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** Entero de un campo numérico rellenado con ceros a la izquierda. */
export function integerOrNull(value: string): number | null {
  if (!ONLY_DIGITS.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function currencyFromNumeric(value: string): Currency | null {
  return CURRENCY_BY_NUMERIC[value.trim()] ?? null
}

/** Los días de cada mes, contando el año bisiesto de verdad (y no cada cuatro a secas). */
function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    return leap ? 29 : 28
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31
}

/**
 * `AAMMDD` → fecha ISO `YYYY-MM-DD`.
 *
 * Comprueba que el día exista, no solo que la forma cuadre: el `30` de febrero
 * tiene seis dígitos igual que cualquier otra fecha.
 */
export function calendarDateOrNull(value: string): string | null {
  if (value.length !== 6 || !ONLY_DIGITS.test(value)) return null

  const shortYear = Number(value.slice(0, 2))
  const month = Number(value.slice(2, 4))
  const day = Number(value.slice(4, 6))
  const year = shortYear < CENTURY_PIVOT ? 2000 + shortYear : 1900 + shortYear

  if (month < 1 || month > 12) return null
  if (day < 1 || day > daysInMonth(year, month)) return null

  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

/** `1` = debe (cargo, negativo); `2` = haber (abono, positivo). */
export function signOrNull(value: string): -1 | 1 | null {
  if (value === '1') return -1
  if (value === '2') return 1
  return null
}

/**
 * Importe del cuaderno 43 a céntimos con signo.
 *
 * La norma escribe los importes como un entero con **dos decimales
 * implícitos**, así que los dígitos ya son céntimos y no hay nada que
 * multiplicar: en ningún punto de este adaptador existe un float. Eso solo vale
 * para divisas de dos decimales, que es lo que la norma contempla; una divisa
 * con otra escala tendría que decidirse aparte, así que aquí se rechaza en vez
 * de dar un importe cien veces mayor.
 */
export function amountCentsOrNull(sign: string, digits: string, currency: Currency): number | null {
  if (minorUnitsOf(currency) !== 2) return null

  const direction = signOrNull(sign)
  if (direction === null) return null

  const magnitude = integerOrNull(digits)
  if (magnitude === null) return null

  return money(direction * magnitude, currency).amountCents
}
