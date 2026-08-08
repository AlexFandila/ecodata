import {
  type Account,
  accountListResponseSchema,
  accountSchema,
  type CreateAccountRequest,
} from '@finanzas/shared'
import { apiFetch } from './client'

export const accountsQueryKey = ['accounts'] as const

/**
 * Solo los campos que pide el formulario. `isOwn` y `openingBalanceCents` tienen
 * valor por defecto en el contrato y los pone la API: crear una cuenta desde el
 * móvil son cuatro campos y no seis, que es justo por qué el contrato los tiene.
 */
export type CreateAccountInput = Pick<
  CreateAccountRequest,
  'name' | 'provider' | 'type' | 'currency' | 'iban'
>

export async function fetchAccounts(): Promise<readonly Account[]> {
  return accountListResponseSchema.parse(await apiFetch('/accounts')).accounts
}

export async function createAccount(input: CreateAccountInput): Promise<Account> {
  const created = await apiFetch('/accounts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  return accountSchema.parse(created)
}
