import { minorUnitsOf } from './currency'
import type { Money } from './money'

export type FormatMoneyOptions = {
  /** Locale de presentación. Por defecto español de España. */
  locale?: string
  /** Incluir el símbolo o el código de la divisa. Por defecto sí. */
  showSymbol?: boolean
}

/**
 * Formatea un importe para mostrarlo por pantalla.
 *
 * Este es el **único** sitio de todo el proyecto donde los céntimos se dividen
 * por una potencia de diez, y es solo para pintar: el valor de coma flotante
 * muere dentro de esta función y nunca vuelve al dominio. `Intl` no hace IO, así
 * que no rompe la regla de pureza de `packages/core`.
 */
export function formatMoney(m: Money, options: FormatMoneyOptions = {}): string {
  const { locale = 'es-ES', showSymbol = true } = options
  const digits = minorUnitsOf(m.currency)
  const units = m.amountCents / 10 ** digits

  const formatter = new Intl.NumberFormat(locale, {
    ...(showSymbol ? { style: 'currency' as const, currency: m.currency } : {}),
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    // El es-ES por defecto no agrupa los millares hasta cinco cifras ('1234,56').
    // Un extracto bancario sí lo hace, y así se lee mejor de un vistazo.
    useGrouping: true,
  })

  return formatter.format(units)
}
