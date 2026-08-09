import { type DashboardResponse, dashboardResponseSchema } from '@finanzas/shared'
import { apiFetch } from './client'

/**
 * Lo que la pantalla de resumen le pide a la API.
 *
 * `month` es opcional y en la primera carga no se manda: el mes en curso lo
 * decide el reloj, y el reloj está en el servidor. Si lo eligiera el cliente,
 * un móvil con la hora mal puesta vería un mes distinto del que tiene la base.
 */
export type DashboardParams = {
  /**
   * Mes ISO `YYYY-MM`, o cadena vacía para dejar que lo elija la API. Vacío y no
   * `undefined` por lo mismo que los filtros del listado: es como viene de la
   * barra de direcciones, y así no hay dos formas de decir «ninguno».
   */
  readonly month?: string
  readonly months?: number
}

function toSearchParams(params: DashboardParams): URLSearchParams {
  const search = new URLSearchParams()
  // Un `month=` vacío sería un filtro puesto a nada y la API lo rechazaría con
  // un 400 en vez de entenderlo como «el mes que tú digas».
  if (params.month !== undefined && params.month !== '') search.set('month', params.month)
  if (params.months !== undefined) search.set('months', String(params.months))

  return search
}

export function dashboardQueryKey(params: DashboardParams) {
  return ['dashboard', toSearchParams(params).toString()] as const
}

export const dashboardRootKey = ['dashboard'] as const

export async function fetchDashboard(params: DashboardParams): Promise<DashboardResponse> {
  const search = toSearchParams(params).toString()
  return dashboardResponseSchema.parse(
    await apiFetch(`/dashboard${search === '' ? '' : `?${search}`}`),
  )
}
