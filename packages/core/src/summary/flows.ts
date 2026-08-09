/**
 * Evolución de ingresos y gastos, mes a mes.
 *
 * Dos decisiones viven aquí y las dos se notan en pantalla:
 *
 * 1. **Ingreso y gasto se separan por el signo del movimiento**, no por el
 *    `kind` de su categoría. Un abono es ingreso aunque esté etiquetado en una
 *    categoría de gasto, y al revés. Es lo que hace que la suma de las barras de
 *    «gasto del mes por categoría» cuadre exactamente con la barra de gasto de
 *    este mes: dos números que están en la misma pantalla y que, si no
 *    cuadraran, dejarían al usuario sin saber a cuál de los dos creer.
 * 2. **Un mes sin movimientos sale con ceros y no se omite.** Un hueco en una
 *    serie temporal no se lee como «cero»: se lee como que ese mes no existió, o
 *    peor, la gráfica junta marzo con junio y el usuario ve una caída que no
 *    hubo. Rellenar es la diferencia entre una serie y una lista de puntos.
 *
 * Los movimientos emparejados como transferencia interna no llegan hasta aquí:
 * el invariante 3 los excluye de ingresos y gastos, y esa exclusión es un
 * `WHERE` de quien consulta.
 */

import { add, type Currency, type Money, money, subtract, zero } from '../money/index'
import { SummaryError } from './errors'

export type MonthFlow = {
  readonly month: string
  readonly currency: Currency
  /** Σ de los abonos del mes, en positivo. */
  readonly incomeCents: number
  /** Σ de los cargos del mes, en positivo: el sentido lo lleva el nombre. */
  readonly expenseCents: number
  /** `incomeCents − expenseCents`, con signo: lo que se ahorró o se comió el mes. */
  readonly netCents: number
}

export type MonthFlowRow = {
  readonly month: string
  readonly currency: Currency
  readonly incomeCents: number
  readonly expenseCents: number
}

/** Clave del casillero: un mes y una divisa identifican una barra de la gráfica. */
function keyOf(month: string, currency: Currency): string {
  return `${month}|${currency}`
}

/**
 * La serie completa de `months` × `currencies`, en ese orden: los meses como
 * vengan —`monthsEndingAt` los da ascendentes, con el presente al final— y las
 * divisas por relevancia.
 *
 * Las filas se **acumulan** en vez de sustituirse, así que quien consulta puede
 * emitir el ingreso y el gasto de un mes en dos filas separadas (que es lo
 * natural si se agrupa por el signo en SQL) sin tener que juntarlas antes.
 */
export function monthlyFlows(input: {
  readonly months: readonly string[]
  readonly currencies: readonly Currency[]
  readonly rows: readonly MonthFlowRow[]
}): readonly MonthFlow[] {
  const months = new Set(input.months)
  const currencies = new Set(input.currencies)

  const income = new Map<string, Money>()
  const expense = new Map<string, Money>()

  for (const row of input.rows) {
    // Una fila fuera de la serie es un descuadre entre la consulta y el rango
    // pedido: sumarla la escondería en un mes que no es el suyo, y descartarla
    // en silencio dejaría un total que no cuadra con el listado de movimientos.
    if (!months.has(row.month)) {
      throw new SummaryError(`El mes ${row.month} no está en la serie pedida`)
    }
    if (!currencies.has(row.currency)) {
      throw new SummaryError(`La divisa ${row.currency} no está entre las del dashboard`)
    }

    const key = keyOf(row.month, row.currency)
    income.set(
      key,
      add(income.get(key) ?? zero(row.currency), money(row.incomeCents, row.currency)),
    )
    expense.set(
      key,
      add(expense.get(key) ?? zero(row.currency), money(row.expenseCents, row.currency)),
    )
  }

  const flows: MonthFlow[] = []
  for (const month of input.months) {
    for (const currency of input.currencies) {
      const key = keyOf(month, currency)
      const monthIncome = income.get(key) ?? zero(currency)
      const monthExpense = expense.get(key) ?? zero(currency)

      flows.push({
        month,
        currency,
        incomeCents: monthIncome.amountCents,
        expenseCents: monthExpense.amountCents,
        // Por `subtract` y no por una resta suelta: cruzar divisas aquí sería un
        // bug silencioso, y así lanza (ADR-008 punto 4).
        netCents: subtract(monthIncome, monthExpense).amountCents,
      })
    }
  }

  return flows
}
