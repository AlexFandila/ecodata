/**
 * Dinero: enteros en la unidad mínima de la divisa, operaciones que fallan antes
 * que redondear a escondidas, y un único punto de conversión texto ↔ céntimos.
 *
 * Ver ADR-008 para el porqué de las decisiones (half-even, sin conversión de
 * divisa, errores por excepción).
 */

export {
  assertCurrency,
  CURRENCIES,
  CURRENCY_CODES,
  type Currency,
  isCurrency,
  minorUnitsOf,
} from './currency'
export { MoneyError } from './errors'
export { type FormatMoneyOptions, formatMoney } from './format'
export {
  absolute,
  add,
  allocate,
  compare,
  divide,
  equals,
  isNegative,
  isOpposite,
  isPositive,
  isZero,
  type Money,
  max,
  min,
  money,
  multiply,
  negate,
  percentage,
  roundHalfEven,
  split,
  subtract,
  sum,
  zero,
} from './money'
export { parseAmount, tryParseAmount } from './parse'
