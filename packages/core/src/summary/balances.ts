/**
 * Saldos: el invariante 6 de DATA_MODEL.md escrito como función pura.
 *
 * > Saldo de una cuenta = `opening_balance_cents` + Σ `amount_cents` de sus
 * > movimientos no borrados. Las transferencias internas **sí** suman aquí
 * > (invariante 3); los borrados no.
 *
 * Las dos exclusiones son un `WHERE` de quien consulta, igual que en el matching
 * y en el motor de reglas: aquí llegan los sumatorios ya hechos y lo único que
 * queda es la parte que no sabe hacer SQL —añadir la apertura sin cruzar divisas
 * y dejar el resultado en un orden que no dependa de cómo devolviera las filas la
 * base—.
 */

import type { Currency, Money } from '../money/index'
import { money } from '../money/index'
import { accumulate, type CurrencyTotal, toTotals } from './totals'

export type AccountBalanceInput = {
  /** Divisa principal de la cuenta: la de `opening_balance_cents`. */
  readonly currency: Currency
  readonly openingBalanceCents: number
  /** Σ de los movimientos vivos de la cuenta, ya agrupados por divisa. */
  readonly sums: readonly CurrencyTotal[]
}

/**
 * Saldo de una cuenta, por divisa.
 *
 * La divisa principal **siempre** sale, aunque no tenga ni un movimiento: una
 * cuenta recién creada con 300 € de apertura tiene 300 €, y omitirla porque no
 * hay filas que sumar sería contar mal. Las divisas extra —los bolsillos en
 * libras de Revolut— se añaden detrás, y no se mezclan con la principal.
 */
export function accountBalances(input: AccountBalanceInput): readonly CurrencyTotal[] {
  const balances = new Map<Currency, Money>()

  // Sembrar con la apertura garantiza que la divisa principal aparezca, y hace
  // que el caso «sin movimientos» no necesite ninguna rama aparte.
  balances.set(input.currency, money(input.openingBalanceCents, input.currency))

  for (const total of input.sums) {
    accumulate(balances, total)
  }

  return toTotals(balances, [input.currency])
}

/**
 * Saldo total de todas las cuentas, por divisa.
 *
 * Lo que en una app de una sola divisa sería un número aquí es una lista, y esa
 * es toda la decisión: no hay conversión posible hasta que exista `fx_rates`
 * (Fase 2), así que el total se presenta separado en vez de convertido a ojo.
 *
 * `preferred` es el orden de relevancia de las divisas, para que el número
 * grande de la pantalla sea el de la divisa en la que el usuario tiene la vida.
 */
export function totalBalances(
  perAccount: readonly (readonly CurrencyTotal[])[],
  preferred: readonly Currency[] = [],
): readonly CurrencyTotal[] {
  const totals = new Map<Currency, Money>()

  for (const balances of perAccount) {
    for (const total of balances) {
      accumulate(totals, total)
    }
  }

  return toTotals(totals, preferred)
}

/**
 * Las divisas del dashboard, de más a menos relevante.
 *
 * La relevancia es **cuántas cuentas la tienen como divisa principal**, y el
 * empate lo rompe el código alfabético. No se usa el importe, que sería la
 * medida obvia: un mes flojo no debería cambiar de sitio la divisa en la que
 * cobras, y una gráfica que cambia de divisa sola es una gráfica que se lee mal.
 *
 * `present` es el conjunto completo —incluye divisas que aparecen en movimientos
 * pero en las que ninguna cuenta está denominada—, y es lo que se devuelve
 * ordenado: la lista sirve para saber qué hay, no solo qué destaca.
 */
export function currenciesByRelevance(input: {
  readonly accountCurrencies: readonly Currency[]
  readonly present: readonly Currency[]
}): readonly Currency[] {
  const accounts = new Map<Currency, number>()
  for (const currency of input.accountCurrencies) {
    accounts.set(currency, (accounts.get(currency) ?? 0) + 1)
  }

  const unique = [...new Set(input.present)]

  return unique.sort((left, right) => {
    const byAccounts = (accounts.get(right) ?? 0) - (accounts.get(left) ?? 0)

    return byAccounts !== 0 ? byAccounts : left.localeCompare(right)
  })
}
