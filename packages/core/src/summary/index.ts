/**
 * Agregados del dashboard: saldos, gasto del mes por categoría y evolución de
 * ingresos y gastos.
 *
 * El reparto con el módulo `ledger` es el mismo que el del matching y el del
 * motor de reglas: **SQL agrupa y esto compone**. Un `SUM ... GROUP BY` sobre
 * enteros es exacto y es lo que la base hace mejor, y con la divisa dentro del
 * `GROUP BY` es imposible que sume dos divisas distintas. Lo que llega aquí es
 * lo que SQL no sabe hacer y sí falla en silencio: añadir la apertura de una
 * cuenta sin cruzar divisas, rellenar los meses que no tienen ni un movimiento,
 * plegar las categorías hijas en su madre y dejarlo todo en un orden que no
 * dependa de cómo devolviera las filas la base.
 *
 * Los invariantes 3 y 5 —las transferencias internas fuera de ingresos y gastos
 * pero dentro del saldo, y los borrados fuera de todo— no están aquí: son un
 * `WHERE` de quien consulta, igual que en `matching` y en `rules`.
 */

export {
  type AccountBalanceInput,
  accountBalances,
  currenciesByRelevance,
  totalBalances,
} from './balances'
export { SummaryError } from './errors'
export { type MonthFlow, type MonthFlowRow, monthlyFlows } from './flows'
export {
  type CategorySpending,
  type CategorySpendingChild,
  type CategorySpendingRow,
  spendingByParent,
} from './spending'
export type { CurrencyTotal } from './totals'
