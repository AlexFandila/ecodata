import { type Currency, minorUnitsOf } from './currency'
import { MoneyError } from './errors'
import { type Money, money } from './money'

/** Espacios de todo tipo: `\s` cubre también el no separable y el estrecho. */
const SPACES = /\s/g
/** Símbolos y códigos de divisa que pueden venir pegados al importe. */
const CURRENCY_MARKS = /€|\$|£|¥|EUR|USD|GBP|CHF|JPY/gi
const ONLY_DIGITS = /^\d+$/

/**
 * Convierte texto de un extracto bancario en un importe.
 *
 * La conversión es puramente textual: se separan los dígitos enteros de los
 * decimales, se rellenan hasta los que admite la divisa y se concatenan antes de
 * un único `parseInt`. En ningún momento se multiplica por 100, que es justo
 * donde los floats estropean los importes (0.1 + 0.2 y demás).
 *
 * Admite el formato español y el anglosajón, el signo delante o detrás
 * (`'1.234,56-'` aparece en extractos reales) y los paréntesis como negativo.
 *
 * Ambigüedad documentada: si el único separador va seguido de exactamente tres
 * dígitos, se interpreta como separador de millares. Así `'1.234'` son 1234,00 €
 * y no 1,23 €. Un importe con decimales de verdad casi siempre trae dos.
 *
 * Devuelve `null` en vez de lanzar: la entrada de un CSV es dato sucio, no un
 * bug, y quien importa decide si rechaza la fila o la manda a revisión.
 */
export function tryParseAmount(input: string, currency: Currency): Money | null {
  let text = input.replace(SPACES, '').replace(CURRENCY_MARKS, '')
  if (text === '') return null

  let negative = false

  // (1.234,56) = negativo, convención contable de algunos exportadores.
  const parenthesized = /^\((.*)\)$/.exec(text)?.[1]
  if (parenthesized !== undefined) {
    negative = true
    text = parenthesized
  }

  // Signo detrás del importe.
  const lastChar = text.at(-1)
  if (lastChar === '-' || lastChar === '+') {
    negative = negative !== (lastChar === '-')
    text = text.slice(0, -1)
  }

  // Signo delante.
  const firstChar = text.at(0)
  if (firstChar === '-' || firstChar === '+') {
    negative = negative !== (firstChar === '-')
    text = text.slice(1)
  }

  if (!/^[\d.,]+$/.test(text)) return null

  const groups = text.split(/[.,]/)
  const separators = text.match(/[.,]/g) ?? []
  if (groups.some((group) => !ONLY_DIGITS.test(group))) return null

  const digits = toDigits(groups, separators, minorUnitsOf(currency))
  if (digits === null) return null

  const amount = Number.parseInt(digits, 10)
  if (!Number.isSafeInteger(amount)) return null

  return money(negative ? -amount : amount, currency)
}

/**
 * Decide qué parte del número son enteros y qué parte decimales, y devuelve
 * todos los dígitos ya escalados a la unidad mínima de la divisa.
 */
function toDigits(
  groups: readonly string[],
  separators: readonly string[],
  minorUnits: number,
): string | null {
  const last = groups.at(-1)
  if (last === undefined) return null

  if (groups.length === 1) {
    return `${last}${'0'.repeat(minorUnits)}`
  }

  // ¿El número entero podría ser solo millares bien agrupados? '1.234' → 1234.
  if (isGrouping(groups, separators)) {
    return `${groups.join('')}${'0'.repeat(minorUnits)}`
  }

  // El último separador es el decimal; lo anterior tiene que ser un entero
  // agrupado con el *otro* separador (o no tener separadores).
  const integerGroups = groups.slice(0, -1)
  const integerSeparators = separators.slice(0, -1)
  const decimalSeparator = separators.at(-1)
  if (integerSeparators.some((separator) => separator === decimalSeparator)) return null
  if (integerGroups.length > 1 && !isGrouping(integerGroups, integerSeparators)) return null

  // Más decimales de los que admite la divisa: se rechaza, nunca se redondea a escondidas.
  if (last.length > minorUnits) return null

  return `${integerGroups.join('')}${last.padEnd(minorUnits, '0')}`
}

/** ¿Son estos grupos un entero con separador de millares, tipo 1.234.567? */
function isGrouping(groups: readonly string[], separators: readonly string[]): boolean {
  if (groups.length < 2) return false
  if (separators.length !== groups.length - 1) return false
  if (new Set(separators).size !== 1) return false
  const [first, ...rest] = groups
  if (first === undefined || first.length < 1 || first.length > 3) return false
  return rest.every((group) => group.length === 3)
}

/** Como `tryParseAmount`, pero lanza si el texto no es un importe válido. */
export function parseAmount(input: string, currency: Currency): Money {
  const parsed = tryParseAmount(input, currency)
  if (parsed === null) {
    throw new MoneyError(`No es un importe válido en ${currency}: ${JSON.stringify(input)}`)
  }
  return parsed
}
