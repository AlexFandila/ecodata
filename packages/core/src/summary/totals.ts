/**
 * El ladrillo común de los tres agregados del dashboard: un importe **siempre
 * acompañado de su divisa**.
 *
 * No es una precaución teórica. Revolut es multidivisa por fila (ADR-011), así
 * que una misma cuenta puede tener movimientos en euros y en libras, y `fx_rates`
 * —lo único que permitiría convertir— es de la Fase 2. Hasta entonces la única
 * respuesta honesta a «¿cuánto tengo?» son dos números, no uno: sumarlos sería
 * inventarse un tipo de cambio. `Money` ya se niega a hacerlo (ADR-008 punto 4);
 * aquí la estructura de datos se niega también, porque un `number` suelto no
 * recuerda de qué divisa era y un `CurrencyTotal` sí.
 */

import { add, type Currency, type Money, money } from '../money/index'

export type CurrencyTotal = {
  readonly currency: Currency
  readonly amountCents: number
}

/**
 * Acumula importes en un mapa por divisa, sumando con `add` para que un cruce de
 * divisas sea imposible por construcción: cada bolsa solo recibe la suya.
 */
export function accumulate(target: Map<Currency, Money>, total: CurrencyTotal): void {
  const current = target.get(total.currency)
  const next = money(total.amountCents, total.currency)

  target.set(total.currency, current === undefined ? next : add(current, next))
}

/**
 * Orden determinista de una lista de totales.
 *
 * `preferred` va delante y en el orden dado —para una cuenta, su divisa
 * principal—; el resto va por código alfabético. Sin este segundo criterio el
 * orden lo decidiría el de inserción en el mapa, que a su vez depende del orden
 * en que SQLite haya devuelto las filas: dos peticiones idénticas podrían pintar
 * las divisas al revés.
 */
export function sortTotals(
  totals: readonly CurrencyTotal[],
  preferred: readonly Currency[] = [],
): readonly CurrencyTotal[] {
  const rank = new Map(preferred.map((currency, index) => [currency, index]))
  const last = preferred.length

  return [...totals].sort((left, right) => {
    const byRank = (rank.get(left.currency) ?? last) - (rank.get(right.currency) ?? last)

    return byRank !== 0 ? byRank : left.currency.localeCompare(right.currency)
  })
}

/** Vuelca el mapa acumulado a la forma del contrato, ya ordenado. */
export function toTotals(
  balances: ReadonlyMap<Currency, Money>,
  preferred: readonly Currency[] = [],
): readonly CurrencyTotal[] {
  const totals = [...balances.values()].map((value) => ({
    currency: value.currency,
    amountCents: value.amountCents,
  }))

  return sortTotals(totals, preferred)
}
