/**
 * Pintar un importe.
 *
 * `formatMoney` existe ya en `packages/core`, pero `apps/web` no puede
 * importarlo: solo conoce `packages/shared` (regla `web-only-shared` de
 * dependency-cruiser). Las dos salidas evidentes eran duplicar aquí la tabla de
 * divisas con sus decimales o mudar `CURRENCIES` a `shared`, que es lo que
 * ADR-009 avisa que exigiría revisar la regla `shared-is-leaf` y su propio ADR.
 *
 * No hace falta ninguna de las dos: **los decimales de cada divisa los sabe el
 * propio `Intl`**. Se le pregunta cuántos usa (2 para el euro, 0 para el yen) y
 * con eso se pasa de céntimos a unidades. Cero listas que mantener y ninguna
 * decisión que revisar; la autoridad sigue siendo `CURRENCIES` de core, que es
 * quien tiene que cuadrar con ICU, no nosotros.
 *
 * El importe llega **siempre** en la unidad mínima de la divisa (regla 3 de
 * CLAUDE.md): aquí es donde se divide, y es el único sitio de la web que lo
 * hace.
 */

const LOCALE = 'es-ES'

/**
 * Los formateadores de `Intl` son caros de construir y se reutilizan mucho —una
 * lista de movimientos son cincuenta llamadas seguidas con la misma divisa—.
 */
const formatters = new Map<string, Intl.NumberFormat>()

function formatterFor(currency: string): Intl.NumberFormat {
  const cached = formatters.get(currency)
  if (cached !== undefined) return cached

  const formatter = new Intl.NumberFormat(LOCALE, { style: 'currency', currency })
  formatters.set(currency, formatter)
  return formatter
}

/**
 * `1234` + `EUR` → `1.234,00 €`. El signo va incluido: un cargo se pinta en
 * negativo porque en negativo está guardado.
 */
export function formatMoney(amountCents: number, currency: string): string {
  const formatter = formatterFor(currency)
  const minorUnits = formatter.resolvedOptions().maximumFractionDigits ?? 2
  return formatter.format(amountCents / 10 ** minorUnits)
}

/** Solo dígitos, separadores y un signo delante: cualquier otra cosa no es un importe. */
const AMOUNT_SHAPE = /^([+-]?)([\d.,]*)$/

/**
 * La inversa de `formatMoney`: `'1.234,56'` + `EUR` → `123456`. `null` si el
 * texto no es un importe.
 *
 * **Sin floats en ningún punto** (regla 3 de CLAUDE.md). La conversión no es
 * multiplicar por cien, que es justo la operación que introduce el error: es
 * manipulación de cadenas —rellenar los decimales hasta los que use la divisa y
 * concatenar—, así que `'8,29'` da el entero `829` exacto y no el
 * `828.9999999999999` que sale de multiplicar por cien. Cuántos decimales usa
 * la divisa lo dice `Intl`, por lo mismo que lo explica la cabecera.
 *
 * Los separadores se leen como se escriben en español:
 *
 * - La coma es **siempre** decimal, y los puntos que la acompañan, de millares.
 * - Un punto solo es decimal si es el único separador y no le siguen
 *   exactamente tres cifras: `'1.5'` son un euro y medio, pero `'1.500'` son mil
 *   quinientos. Con tres cifras la lectura española gana, que es la que va a
 *   teclear quien usa la app.
 *
 * Vacío es `0` y no un error, porque el campo que lo usa es opcional. Y más
 * decimales de los que admite la divisa se **rechazan** en vez de redondearse:
 * con dinero, preguntar es mejor que adivinar.
 */
export function parseMoneyCents(text: string, currency: string): number | null {
  const compact = text.replace(/\s/g, '')
  if (compact === '') return 0

  const shape = AMOUNT_SHAPE.exec(compact)
  if (shape === null) return null
  const [, sign = '', body = ''] = shape
  // Un signo suelto, un punto suelto o una coma sola no son cero: no son nada.
  if (!/\d/.test(body)) return null

  let whole = body
  let fraction = ''

  const commas = body.split(',').length - 1
  if (commas > 1) return null
  if (commas === 1) {
    const [before = '', after = ''] = body.split(',')
    // Con coma decidida, los puntos que queden solo pueden ser de millares.
    if (after.includes('.')) return null
    whole = before.replaceAll('.', '')
    fraction = after
  } else {
    const dots = body.split('.').length - 1
    const lastDot = body.lastIndexOf('.')
    const tail = lastDot === -1 ? '' : body.slice(lastDot + 1)
    if (dots === 1 && tail.length !== 3) {
      whole = body.slice(0, lastDot)
      fraction = tail
    } else {
      whole = body.replaceAll('.', '')
    }
  }

  // `',50'` es medio euro escrito con prisa; lo que no vale es no traer cifra alguna.
  if (whole === '') whole = '0'
  if (!/^\d+$/.test(whole)) return null
  if (fraction !== '' && !/^\d+$/.test(fraction)) return null

  const minorUnits = formatterFor(currency).resolvedOptions().maximumFractionDigits ?? 2
  if (fraction.length > minorUnits) return null

  const cents = Number(`${whole}${fraction.padEnd(minorUnits, '0')}`)
  if (!Number.isSafeInteger(cents)) return null
  // `-0` es un cero que se serializa raro y no significa nada distinto.
  if (cents === 0) return 0
  return sign === '-' ? -cents : cents
}
