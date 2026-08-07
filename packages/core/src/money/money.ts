import type { Currency } from './currency'
import { MoneyError } from './errors'

/**
 * Un importe: entero en la unidad mínima de la divisa (céntimos para el euro)
 * más el código ISO 4217. Objeto plano de solo lectura, no una clase: así viaja
 * sin ceremonia por HTTP, por SQLite y por los contratos de `packages/shared`.
 *
 * Negativo = cargo, positivo = abono (docs/DATA_MODEL.md).
 */
export type Money = {
  readonly amountCents: number
  readonly currency: Currency
}

/**
 * Construye un importe validando que los céntimos son un entero seguro.
 *
 * Es la única puerta de entrada al tipo: cualquier operación que produzca un
 * importe termina aquí, así que un float o un desbordamiento no puede colarse
 * en el dominio ni acabar en la base de datos.
 */
export function money(amountCents: number, currency: Currency): Money {
  if (!Number.isSafeInteger(amountCents)) {
    throw new MoneyError(
      `Los importes son enteros en céntimos dentro del rango seguro; recibido: ${amountCents}`,
    )
  }
  // Normaliza el -0 que sale de negar un cero: molesta en comparaciones y en JSON.
  return { amountCents: amountCents === 0 ? 0 : amountCents, currency }
}

/** Importe cero en la divisa dada. */
export function zero(currency: Currency): Money {
  return { amountCents: 0, currency }
}

/** Lanza si los dos importes no comparten divisa. Nunca se convierte: la v1 no hace cambio de divisa. */
function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new MoneyError(
      `No se pueden operar importes en divisas distintas: ${a.currency} y ${b.currency}`,
    )
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b)
  return money(a.amountCents + b.amountCents, a.currency)
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b)
  return money(a.amountCents - b.amountCents, a.currency)
}

export function negate(m: Money): Money {
  return money(-m.amountCents, m.currency)
}

export function absolute(m: Money): Money {
  return money(Math.abs(m.amountCents), m.currency)
}

/**
 * Suma una lista de importes. La divisa va explícita porque la lista puede venir
 * vacía —el caso normal de una cuenta recién creada— y un cero sin divisa no es
 * un importe.
 */
export function sum(items: readonly Money[], currency: Currency): Money {
  let total = 0
  for (const item of items) {
    if (item.currency !== currency) {
      throw new MoneyError(
        `No se pueden sumar importes en divisas distintas: ${currency} y ${item.currency}`,
      )
    }
    total += item.amountCents
  }
  return money(total, currency)
}

/**
 * Redondeo bancario (half-to-even): en el empate se elige el entero par.
 *
 * A diferencia del redondeo comercial, no sesga sistemáticamente hacia arriba al
 * encadenar muchas operaciones, que es exactamente lo que hace una proyección a
 * treinta años. Ver ADR-008.
 */
export function roundHalfEven(value: number): number {
  if (!Number.isFinite(value)) {
    throw new MoneyError(`No se puede redondear un valor no finito: ${value}`)
  }
  const lower = Math.floor(value)
  const fraction = value - lower
  if (fraction > 0.5) return lower + 1
  if (fraction < 0.5) return lower
  return lower % 2 === 0 ? lower : lower + 1
}

/** Multiplica por un factor adimensional (un tipo de interés, una proporción) y redondea half-even. */
export function multiply(m: Money, factor: number): Money {
  if (!Number.isFinite(factor)) {
    throw new MoneyError(`El factor debe ser un número finito; recibido: ${factor}`)
  }
  return money(roundHalfEven(m.amountCents * factor), m.currency)
}

/** Divide entre un número y redondea half-even. Para repartir sin perder céntimos, usar `allocate`. */
export function divide(m: Money, divisor: number): Money {
  if (!Number.isFinite(divisor) || divisor === 0) {
    throw new MoneyError(
      `El divisor debe ser un número finito distinto de cero; recibido: ${divisor}`,
    )
  }
  return money(roundHalfEven(m.amountCents / divisor), m.currency)
}

/** Porcentaje del importe: `percentage(m, 21)` es el 21 % de `m`. */
export function percentage(m: Money, percent: number): Money {
  return multiply(m, percent / 100)
}

/**
 * Reparte un importe en partes proporcionales a `weights` sin perder ni inventar
 * un solo céntimo: la suma de las partes es siempre exactamente el original.
 *
 * El resto se distribuye por mayor remanente, y a igualdad de remanente gana el
 * índice menor, así que el reparto es determinista y reproducible.
 */
export function allocate(m: Money, weights: readonly number[]): Money[] {
  if (weights.length === 0) {
    throw new MoneyError('Hace falta al menos un peso para repartir un importe')
  }
  let totalWeight = 0
  for (const weight of weights) {
    if (!Number.isFinite(weight) || weight < 0) {
      throw new MoneyError(`Los pesos deben ser números finitos no negativos; recibido: ${weight}`)
    }
    totalWeight += weight
  }
  if (totalWeight === 0) {
    throw new MoneyError('La suma de los pesos no puede ser cero')
  }

  const shares = weights.map((weight) => (m.amountCents * weight) / totalWeight)
  // Truncar hacia cero deja un resto con el mismo signo que el importe.
  const parts = shares.map((share) => Math.trunc(share))
  const assigned = parts.reduce((acc, part) => acc + part, 0)
  let remainder = m.amountCents - assigned

  const step = remainder < 0 ? -1 : 1
  const byRemainder = shares
    .map((share, index) => ({ index, fraction: Math.abs(share - Math.trunc(share)) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)

  for (const { index } of byRemainder) {
    if (remainder === 0) break
    parts[index] = (parts[index] ?? 0) + step
    remainder -= step
  }

  return parts.map((part) => money(part, m.currency))
}

/** Reparte un importe en `parts` partes iguales, repartiendo el resto céntimo a céntimo. */
export function split(m: Money, parts: number): Money[] {
  if (!Number.isSafeInteger(parts) || parts <= 0) {
    throw new MoneyError(`El número de partes debe ser un entero positivo; recibido: ${parts}`)
  }
  return allocate(m, new Array<number>(parts).fill(1))
}

/**
 * Orden entre dos importes de la misma divisa. Lanza si no coinciden: ordenar
 * euros contra dólares no significa nada sin un tipo de cambio.
 */
export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b)
  if (a.amountCents < b.amountCents) return -1
  if (a.amountCents > b.amountCents) return 1
  return 0
}

/**
 * ¿Mismo importe y misma divisa? Es un predicado total: con divisas distintas
 * devuelve `false` en vez de lanzar, para poder usarlo al filtrar listas mixtas
 * (Revolut es multidivisa).
 */
export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amountCents === b.amountCents
}

/**
 * ¿Son exactamente opuestos —mismo valor absoluto, signo contrario, misma
 * divisa— y distintos de cero?
 *
 * Es el criterio (b) del matching de transferencias internas de
 * docs/DATA_MODEL.md. Como `equals`, es un predicado total: con divisas
 * distintas devuelve `false`, que es justo lo que pide la regla ("importes
 * opuestos exactos y misma divisa").
 */
export function isOpposite(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amountCents !== 0 && a.amountCents === -b.amountCents
}

export function isZero(m: Money): boolean {
  return m.amountCents === 0
}

export function isNegative(m: Money): boolean {
  return m.amountCents < 0
}

export function isPositive(m: Money): boolean {
  return m.amountCents > 0
}

/** El menor de dos importes de la misma divisa. */
export function min(a: Money, b: Money): Money {
  return compare(a, b) <= 0 ? a : b
}

/** El mayor de dos importes de la misma divisa. */
export function max(a: Money, b: Money): Money {
  return compare(a, b) >= 0 ? a : b
}
