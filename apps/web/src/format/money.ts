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
