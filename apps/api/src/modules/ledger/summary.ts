/**
 * Los agregados del dashboard: saldos, gasto del mes por categoría y evolución
 * de ingresos y gastos.
 *
 * Es la primera lectura del sistema que **agrega** en vez de listar, y el
 * reparto de trabajo es el mismo que en el matching y en el motor de reglas: el
 * módulo consulta y filtra, `packages/core` compone. Aquí viven las tres
 * consultas —el `GROUP BY` lo hace SQLite, que suma enteros de forma exacta y
 * con la divisa dentro del grupo no puede mezclar dos— y en `core/summary` vive
 * lo que SQL no sabe hacer y sí falla en silencio: rellenar los meses vacíos,
 * plegar las hijas en su madre y ordenar de forma determinista.
 *
 * Los tres invariantes que gobiernan esto van en el `WHERE` y no en quien llama,
 * por el mismo criterio que en `listTransactions`:
 *
 * - **Invariante 5**: los borrados no existen para nadie, en ninguna de las tres.
 * - **Invariante 3**: las patas de una transferencia interna quedan fuera del
 *   gasto y de la evolución, pero **dentro** del saldo. Esa asimetría es toda la
 *   dificultad de este fichero y es deliberada: un traspaso de Unicaja a Revolut
 *   no es un gasto, pero sí deja menos dinero en Unicaja.
 * - **Invariante 6**: saldo = apertura + Σ movimientos vivos.
 *
 * Lo que **no** se filtra es `is_own`: ese flag es del matcher de transferencias
 * y solo de él (DATA_MODEL.md). Una cuenta que el usuario sigue sin considerarla
 * propia tiene saldo igual, y esconderlo sería contar mal su patrimonio.
 */
import {
  accountBalances,
  type CategorySpending,
  type Currency,
  type CurrencyTotal,
  currenciesByRelevance,
  type MonthFlow,
  monthlyFlows,
  monthRange,
  monthsEndingAt,
  spendingByParent,
  totalBalances,
} from '@finanzas/core'
import { and, asc, gte, isNull, lt, lte, sql } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { type Account, accounts, categories, transactions } from '../../db/schema'

export type SummaryQuery = {
  /** Mes ISO `YYYY-MM` que se agrega en `spending` y que cierra la evolución. */
  readonly month: string
  /** Cuántos meses de evolución, contando el pedido. */
  readonly months: number
}

export type AccountBalance = {
  readonly account: Account
  readonly balances: readonly CurrencyTotal[]
}

export type LedgerSummary = {
  readonly currencies: readonly Currency[]
  readonly accounts: readonly AccountBalance[]
  readonly totals: readonly CurrencyTotal[]
  readonly spending: readonly CategorySpending[]
  readonly evolution: readonly MonthFlow[]
}

/**
 * Filtros comunes al gasto y a la evolución: los dos son **flujos**, así que los
 * dos excluyen las transferencias internas. El saldo no los usa, que es
 * justamente el invariante 3.
 */
function flowFilters() {
  return and(isNull(transactions.deletedAt), isNull(transactions.transferId))
}

/** Σ de los movimientos vivos de cada cuenta, por divisa (invariante 5). */
function balanceSums(db: Db): Map<number, CurrencyTotal[]> {
  const rows = db
    .select({
      accountId: transactions.accountId,
      currency: transactions.currency,
      // `sum()` devuelve NULL sobre cero filas, pero aquí los grupos nacen de
      // filas, así que nunca puede serlo. El `coalesce` blinda el tipo.
      total: sql<number>`coalesce(sum(${transactions.amountCents}), 0)`,
    })
    .from(transactions)
    // Sin `transfer_id IS NULL`: una transferencia interna sí mueve el saldo.
    .where(isNull(transactions.deletedAt))
    .groupBy(transactions.accountId, transactions.currency)
    .all()

  const sums = new Map<number, CurrencyTotal[]>()
  for (const row of rows) {
    const forAccount = sums.get(row.accountId) ?? []
    forAccount.push({ currency: row.currency, amountCents: row.total })
    sums.set(row.accountId, forAccount)
  }

  return sums
}

/**
 * Gasto del mes por categoría y divisa, ya en positivo.
 *
 * Solo entran los movimientos con importe negativo. Partir por el signo y no por
 * el `kind` de la categoría es lo que hace que esta suma cuadre exactamente con
 * el `expenseCents` del mismo mes en la evolución, y lo que impide que un mes
 * con más devoluciones que cargos en una categoría produzca un «gasto» negativo
 * —que el contrato rechazaría con un 500 en producción—.
 */
function spendingRows(db: Db, month: string) {
  const { from, to } = monthRange(month)

  return db
    .select({
      categoryId: transactions.categoryId,
      currency: transactions.currency,
      // Con el signo ya cambiado: hacia fuera un gasto es una magnitud.
      amountCents: sql<number>`-coalesce(sum(${transactions.amountCents}), 0)`,
    })
    .from(transactions)
    .where(
      and(
        flowFilters(),
        lt(transactions.amountCents, 0),
        gte(transactions.bookedAt, from),
        lte(transactions.bookedAt, to),
      ),
    )
    .groupBy(transactions.categoryId, transactions.currency)
    .all()
}

/**
 * Ingresos y gastos de cada mes de la ventana, por divisa.
 *
 * `substr(booked_at, 1, 7)` y no `strftime('%Y-%m', ...)`: la columna tiene un
 * `CHECK ... GLOB` que garantiza la forma `YYYY-MM-DD`, así que el recorte es
 * exacto, es más barato y no depende de que SQLite sepa interpretar la fecha. Es
 * la misma operación que hace `monthOf` en `core`, sobre el mismo texto.
 */
function flowRows(db: Db, months: readonly string[]) {
  const first = months[0]
  const last = months[months.length - 1]
  if (first === undefined || last === undefined) return []

  return db
    .select({
      month: sql<string>`substr(${transactions.bookedAt}, 1, 7)`,
      currency: transactions.currency,
      incomeCents: sql<number>`coalesce(sum(case when ${transactions.amountCents} > 0 then ${transactions.amountCents} else 0 end), 0)`,
      expenseCents: sql<number>`-coalesce(sum(case when ${transactions.amountCents} < 0 then ${transactions.amountCents} else 0 end), 0)`,
    })
    .from(transactions)
    .where(
      and(
        flowFilters(),
        gte(transactions.bookedAt, monthRange(first).from),
        lte(transactions.bookedAt, monthRange(last).to),
      ),
    )
    .groupBy(sql`substr(${transactions.bookedAt}, 1, 7)`, transactions.currency)
    .all()
}

/** id de categoría → id de su madre, o `null` si ya es madre. */
function categoryTree(db: Db): ReadonlyMap<number, number | null> {
  const rows = db
    .select({ id: categories.id, parentId: categories.parentId })
    .from(categories)
    .all()

  return new Map(rows.map((row) => [row.id, row.parentId]))
}

/**
 * Todo lo que necesita el dashboard, en una pasada.
 *
 * Los saldos **no** dependen de `month`: un saldo es un acumulado y no un flujo,
 * así que cambiar de mes mueve `spending` y `evolution` y deja `accounts` y
 * `totals` igual.
 */
export function summarize(db: Db, query: SummaryQuery): LedgerSummary {
  const rows = db.select().from(accounts).orderBy(asc(accounts.name)).all()
  const sums = balanceSums(db)

  const balances = rows.map((account) => ({
    account,
    balances: accountBalances({
      currency: account.currency,
      openingBalanceCents: account.openingBalanceCents,
      sums: sums.get(account.id) ?? [],
    }),
  }))

  const months = monthsEndingAt(query.month, query.months)
  const spending = spendingRows(db, query.month)
  const flows = flowRows(db, months)

  // El orden de las divisas lo decide el servidor y no cada cliente: la PWA y el
  // MCP de la Fase 3 tienen que elegir la misma, y una gráfica que cambia de
  // divisa sola es una gráfica que se lee mal.
  const currencies = currenciesByRelevance({
    accountCurrencies: rows.map((account) => account.currency),
    present: [
      ...balances.flatMap((entry) => entry.balances.map((total) => total.currency)),
      ...spending.map((row) => row.currency),
      ...flows.map((row) => row.currency),
    ],
  })

  return {
    currencies,
    accounts: balances,
    totals: totalBalances(
      balances.map((entry) => entry.balances),
      currencies,
    ),
    spending: spendingByParent({ rows: spending, parentOf: categoryTree(db) }),
    evolution: monthlyFlows({ months, currencies, rows: flows }),
  }
}
