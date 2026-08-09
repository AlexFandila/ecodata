import {
  type CreateTransferRequest,
  type ListTransfersResponse,
  listTransfersResponseSchema,
  type MatchTransfersResponse,
  matchTransfersResponseSchema,
  type TransferStatus,
  type TransferWithLegs,
  transferWithLegsSchema,
  type UndoTransferResponse,
  undoTransferResponseSchema,
} from '@finanzas/shared'
import { apiFetch } from './client'

/** Los filtros tal como los maneja la pantalla; ver `api/transactions.ts`. */
export type TransferFilters = {
  readonly status?: TransferStatus
  readonly limit?: number
  readonly offset?: number
}

function toSearchParams(filters: TransferFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.status !== undefined) params.set('status', filters.status)
  if (filters.limit !== undefined) params.set('limit', String(filters.limit))
  if (filters.offset !== undefined && filters.offset > 0) {
    params.set('offset', String(filters.offset))
  }
  return params
}

export function transfersQueryKey(filters: TransferFilters) {
  return ['transfers', toSearchParams(filters).toString()] as const
}

/**
 * La raíz de la caché de transferencias. Cualquier cambio la invalida entera:
 * confirmar una la saca de la pestaña «sin revisar» y la mete en «todas», así
 * que afinar más qué se recarga solo serviría para dejar una lista mintiendo.
 */
export const transfersRootKey = ['transfers'] as const

export async function fetchTransfers(filters: TransferFilters): Promise<ListTransfersResponse> {
  const params = toSearchParams(filters).toString()
  return listTransfersResponseSchema.parse(
    await apiFetch(`/transfers${params === '' ? '' : `?${params}`}`),
  )
}

/** Empareja a mano dos movimientos. El estado (`manual`) lo pone la API. */
export async function createTransfer(input: CreateTransferRequest): Promise<TransferWithLegs> {
  return transferWithLegsSchema.parse(
    await apiFetch('/transfers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  )
}

export async function confirmTransfer(id: number): Promise<TransferWithLegs> {
  return transferWithLegsSchema.parse(
    await apiFetch(`/transfers/${id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'confirmed' }),
    }),
  )
}

/** Deshacer devuelve las dos patas ya liberadas, no un cuerpo vacío. */
export async function undoTransfer(id: number): Promise<UndoTransferResponse> {
  return undoTransferResponseSchema.parse(await apiFetch(`/transfers/${id}`, { method: 'DELETE' }))
}

/** Vuelve a pasar la heurística sobre todo lo que sigue sin emparejar. */
export async function matchTransfers(): Promise<MatchTransfersResponse> {
  return matchTransfersResponseSchema.parse(await apiFetch('/transfers/match', { method: 'POST' }))
}
