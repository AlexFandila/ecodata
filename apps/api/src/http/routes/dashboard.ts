/**
 * `GET /dashboard`: todo lo que pinta la pantalla de resumen, de una vez.
 *
 * Las tres cosas —saldos, gasto del mes y evolución— van en una sola respuesta y
 * no en tres rutas porque son una sola pantalla: tres peticiones desde el móvil
 * serían tres estados de carga que coordinar y tres oportunidades de quedarse a
 * medias.
 *
 * Aquí es donde se **compone**: `ledger` da los importes y `categorize` los
 * nombres, y quien los junta es la ruta, no un módulo llamando al otro
 * (ADR-014 punto 7). Podría haberse resuelto con un `LEFT JOIN categories`
 * dentro de `ledger`, y sería una consulta menos, pero metería en el módulo de
 * los saldos una tabla cuya semántica no gobierna, y para algo que es puro
 * adorno de presentación: el agregado ya está bien sin el nombre.
 *
 * Sin casos de error propios más allá de la validación: el resumen siempre
 * existe. Una base recién creada devuelve listas vacías, que es la respuesta
 * correcta y no un 404.
 */
/**
 * `core` y `shared` nombran igual sus agregados —uno es el cálculo y el otro el
 * contrato—, así que aquí, el único sitio que ve los dos, los de `core` entran
 * con alias `…Aggregate`. Es exactamente la frontera que esta ruta cruza.
 */
import { type CategorySpending as CategorySpendingAggregate, monthOf } from '@finanzas/core'
import {
  type AccountBalance,
  type CategorySpending,
  type DashboardResponse,
  dashboardResponseSchema,
  detailsFromZodError,
  getDashboardQuerySchema,
} from '@finanzas/shared'
import { Hono } from 'hono'
import type { Db } from '../../db/client'
import { type Category, listCategories } from '../../modules/categorize/index'
import { type AccountBalance as AccountBalanceRow, summarize } from '../../modules/ledger/index'
import { errorJson } from '../errors'

export type DashboardRoutesOptions = {
  /**
   * Hoy, como fecha de calendario ISO `YYYY-MM-DD`. Ver `AppOptions.today`: el
   * reloj entra por parámetro para que ninguna ruta se lea su propia
   * configuración y para que el mes por defecto sea comprobable.
   */
  readonly today: () => string
}

function accountDto(entry: AccountBalanceRow): AccountBalance {
  return {
    accountId: entry.account.id,
    name: entry.account.name,
    provider: entry.account.provider,
    currency: entry.account.currency,
    balances: [...entry.balances],
  }
}

/**
 * Añade nombre e icono a un agregado que solo trae ids.
 *
 * Una categoría que ya no está en la tabla —borrada después de gastar en ella—
 * conserva su importe y se queda sin nombre, igual que la fila sin categorizar:
 * perder el importe para no enseñar un hueco sería descuadrar el total.
 */
function spendingDto(
  row: CategorySpendingAggregate,
  byId: ReadonlyMap<number, Category>,
): CategorySpending {
  const category = row.categoryId === null ? undefined : byId.get(row.categoryId)

  return {
    categoryId: row.categoryId,
    slug: category?.slug ?? null,
    name: category?.name ?? null,
    icon: category?.icon ?? null,
    currency: row.currency,
    amountCents: row.amountCents,
    children: row.children.flatMap((child) => {
      const childCategory = byId.get(child.categoryId)
      if (childCategory === undefined) return []

      return [
        {
          categoryId: child.categoryId,
          slug: childCategory.slug,
          name: childCategory.name,
          icon: childCategory.icon,
          amountCents: child.amountCents,
        },
      ]
    }),
  }
}

export function createDashboardRoutes(db: Db, { today }: DashboardRoutesOptions) {
  const routes = new Hono()

  routes.get('/', (c) => {
    const query = getDashboardQuerySchema.safeParse(c.req.query())
    if (!query.success) {
      return errorJson(
        c,
        400,
        'validation_error',
        'Los parámetros del resumen no son válidos',
        detailsFromZodError(query.error),
      )
    }

    // Un mes futuro no se rechaza: devuelve ceros, que es la verdad. El tope lo
    // pone la pantalla deshabilitando la flecha, que es donde tiene sentido.
    const month = query.data.month ?? monthOf(today())
    const summary = summarize(db, { month, months: query.data.months })
    const byId = new Map(listCategories(db).map((category) => [category.id, category]))

    const body: DashboardResponse = {
      month,
      months: query.data.months,
      currencies: [...summary.currencies],
      accounts: summary.accounts.map(accountDto),
      totals: [...summary.totals],
      spending: summary.spending.map((row) => spendingDto(row, byId)),
      evolution: [...summary.evolution],
    }

    return c.json(dashboardResponseSchema.parse(body))
  })

  return routes
}
