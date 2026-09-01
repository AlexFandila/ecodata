import {
  type Account,
  accountListResponseSchema,
  accountSchema,
  type CreateAccountRequest,
} from '@finanzas/shared'
import { apiFetch } from './client'

export const accountsQueryKey = ['accounts'] as const

/**
 * Solo los campos que pide el formulario. El único default del contrato que la
 * web sigue delegando en la API es `isOwn`: una cuenta creada a mano es propia
 * salvo que algún día haya pantalla para decir lo contrario.
 *
 * `openingBalanceCents` sí viaja, aunque tenga default: es la base del
 * invariante 6 —saldo = inicial + Σ movimientos— y dejarlo en cero cuando la
 * cuenta no empieza en cero desplaza todos los saldos de la app. El formulario
 * manda 0 explícitamente cuando se deja en blanco, que es distinto de no
 * saberlo.
 */
export type CreateAccountInput = Pick<
  CreateAccountRequest,
  'name' | 'provider' | 'type' | 'currency' | 'iban' | 'openingBalanceCents'
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
