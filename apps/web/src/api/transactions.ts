import {
  type ListTransactionsResponse,
  listTransactionsResponseSchema,
  type Transaction,
  transactionSchema,
} from '@finanzas/shared'
import { apiFetch } from './client'

/**
 * Los filtros tal como los maneja la pantalla: todo texto, que es como vienen
 * de la barra de direcciones y como van a la query string. Convertirlos a
 * números aquí para que la API los vuelva a leer como texto no aportaría nada;
 * quien los coacciona de verdad es `listTransactionsQuerySchema` en la ruta.
 */
export type TransactionFilters = {
  readonly accountId?: string
  readonly from?: string
  readonly to?: string
  readonly categoryId?: string
  readonly uncategorized?: boolean
  readonly search?: string
  readonly limit?: number
  readonly offset?: number
}

/**
 * Un valor vacío **no** se manda: `accountId=` sería un filtro puesto a nada, y
 * la API lo rechazaría con un 400 en vez de entenderlo como "sin filtro".
 */
function toSearchParams(filters: TransactionFilters): URLSearchParams {
  const params = new URLSearchParams()
  const add = (key: string, value: string | undefined) => {
    if (value !== undefined && value !== '') params.set(key, value)
  }

  add('accountId', filters.accountId)
  add('from', filters.from)
  add('to', filters.to)
  add('categoryId', filters.categoryId)
  add('search', filters.search)
  if (filters.uncategorized === true) params.set('uncategorized', 'true')
  if (filters.limit !== undefined) params.set('limit', String(filters.limit))
  if (filters.offset !== undefined && filters.offset > 0) {
    params.set('offset', String(filters.offset))
  }

  return params
}

/**
 * La clave lleva los filtros dentro: dos listados con filtros distintos son dos
 * cachés distintas, y volver atrás desde el detalle de un movimiento reencuentra
 * la lista que se estaba mirando en vez de recargarla.
 */
export function transactionsQueryKey(filters: TransactionFilters) {
  return ['transactions', toSearchParams(filters).toString()] as const
}

export const transactionsRootKey = ['transactions'] as const

export async function fetchTransactions(
  filters: TransactionFilters,
): Promise<ListTransactionsResponse> {
  const params = toSearchParams(filters).toString()
  return listTransactionsResponseSchema.parse(
    await apiFetch(`/transactions${params === '' ? '' : `?${params}`}`),
  )
}

export function transactionQueryKey(id: number) {
  return ['transactions', 'detalle', id] as const
}

export async function fetchTransaction(id: number): Promise<Transaction> {
  return transactionSchema.parse(await apiFetch(`/transactions/${id}`))
}

export type UpdateTransactionCategoryInput = {
  readonly id: number
  /** `null` devuelve el movimiento a la bandeja de pendientes. */
  readonly categoryId: number | null
}

export async function updateTransactionCategory({
  id,
  categoryId,
}: UpdateTransactionCategoryInput): Promise<Transaction> {
  return transactionSchema.parse(
    await apiFetch(`/transactions/${id}/category`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ categoryId }),
    }),
  )
}
