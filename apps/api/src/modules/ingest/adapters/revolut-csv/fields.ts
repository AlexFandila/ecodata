/**
 * Cómo se lee cada tipo de celda del CSV de Revolut.
 *
 * Todas estas funciones devuelven `null` ante un dato ilegible en vez de lanzar,
 * por el mismo motivo que `tryParseAmount` en `packages/core` (ADR-008, punto
 * 5): una celda mal formada es un dato sucio, y quien la lee es quien decide si
 * la fila entera se descarta o si el fichero es irrecuperable.
 */
import { minorUnitsOf, tryParseAmount } from '@finanzas/core'
import { type Currency, currencySchema } from '@finanzas/shared'

/**
 * El dialecto numérico de Revolut: signo delante opcional, dígitos, y como mucho
 * un punto decimal. **Sin separador de millares.**
 *
 * El export `es-ES` que se inspeccionó escribe los importes en formato
 * anglosajón (`-24.50`) aunque todo lo demás esté traducido, y no usa separador
 * de millares —lo confirman las 730 líneas con exactamente diez campos: una coma
 * de millares habría partido una celda—.
 */
const REVOLUT_NUMBER = /^[+-]?\d+(?:\.(\d+))?$/

/** `YYYY-MM-DD HH:MM:SS`, que es como Revolut escribe sus dos fechas. */
const REVOLUT_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})[ T]\d{2}:\d{2}:\d{2}$/

/** Texto de una celda; `null` si viene vacía o solo con espacios (nunca cadena vacía). */
export function textOrNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
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
 * `2026-01-02 09:14:03` → `2026-01-02`.
 *
 * Se tira la hora a propósito: `bookedAt` es una fecha de calendario
 * (ARCHITECTURE.md, «fechas de calendario e instantes son cosas distintas») y la
 * hora completa se conserva íntegra en `raw`, que es donde tiene sentido.
 *
 * La zona horaria no se toca. Revolut escribe estas marcas en la del usuario y
 * no las etiqueta; interpretarlas como UTC movería de día los movimientos de
 * última hora de la noche, que es justo lo contrario de lo que se quiere.
 *
 * Comprueba que el día exista, no solo que la forma cuadre: el 31 de febrero
 * tiene los mismos diez caracteres que cualquier otra fecha.
 */
export function calendarDateOrNull(value: string): string | null {
  const match = REVOLUT_TIMESTAMP.exec(value.trim())
  if (match === null) return null

  const [, yearText, monthText, dayText] = match
  if (yearText === undefined || monthText === undefined || dayText === undefined) return null

  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  if (month < 1 || month > 12) return null
  if (day < 1 || day > daysInMonth(year, month)) return null

  return `${yearText}-${monthText}-${dayText}`
}

/** Código ISO 4217 alfabético, que es como Revolut escribe la divisa de cada fila. */
export function currencyOrNull(value: string): Currency | null {
  const parsed = currencySchema.safeParse(value.trim())
  return parsed.success ? parsed.data : null
}

/**
 * Importe de una celda a céntimos con signo.
 *
 * Valida primero el dialecto y delega después en `tryParseAmount`, que es el
 * único punto de conversión texto ↔ céntimos del proyecto (ADR-008, punto 6) y
 * reconstruye el número desde los dígitos sin multiplicar por cien en ningún
 * momento.
 *
 * La validación previa no es redundante: `tryParseAmount` acepta a propósito los
 * formatos de medio mundo y, con ellos, una ambigüedad documentada —un único
 * separador seguido de tres dígitos son millares, así que `'1.500'` valdría
 * 1.500,00 €—. Revolut no escribe millares, así que aquí `'1.500'` solo puede
 * ser un importe con tres decimales, y tres decimales no caben en un euro: se
 * rechaza en vez de multiplicar el importe por mil en silencio.
 *
 * El límite de decimales lo pone la divisa de la propia fila, no el euro: el yen
 * no tiene ninguno (`CURRENCIES` en `packages/core`), y un extracto multidivisa
 * de Revolut puede traerlo.
 */
export function amountCentsOrNull(value: string, currency: Currency): number | null {
  const text = value.trim()
  const match = REVOLUT_NUMBER.exec(text)
  if (match === null) return null

  const decimals = match[1]
  if (decimals !== undefined && decimals.length > minorUnitsOf(currency)) return null

  return tryParseAmount(text, currency)?.amountCents ?? null
}
