import { MoneyError } from './errors'

/**
 * Divisas admitidas, con sus dígitos decimales según ISO 4217.
 *
 * Lista cerrada a propósito: `Currency` se deriva de aquí, así que añadir una
 * divisa es una línea en esta tabla y el compilador señala los `switch` que hay
 * que ampliar. Ojo con `minorUnits`: no todas las divisas tienen dos decimales
 * (el yen no tiene ninguno), así que "céntimos" es en realidad "la unidad
 * mínima de la divisa".
 */
export const CURRENCIES = {
  EUR: { minorUnits: 2 },
  USD: { minorUnits: 2 },
  GBP: { minorUnits: 2 },
  CHF: { minorUnits: 2 },
  JPY: { minorUnits: 0 },
} as const

/** Código ISO 4217 de una divisa admitida. */
export type Currency = keyof typeof CURRENCIES

/** Códigos admitidos, en orden estable. Útil para validaciones y selectores. */
export const CURRENCY_CODES = Object.keys(CURRENCIES) as readonly Currency[]

/** ¿Es `value` una divisa admitida? Distingue mayúsculas: 'eur' no lo es. */
export function isCurrency(value: string): value is Currency {
  return Object.hasOwn(CURRENCIES, value)
}

/** Convierte una cadena en `Currency` o lanza. Para datos que cruzan una frontera. */
export function assertCurrency(value: string): Currency {
  if (!isCurrency(value)) {
    throw new MoneyError(`Divisa desconocida: ${JSON.stringify(value)}`)
  }
  return value
}

/** Dígitos decimales de la divisa: 2 para el euro, 0 para el yen. */
export function minorUnitsOf(currency: Currency): number {
  return CURRENCIES[currency].minorUnits
}
