/**
 * Alta de cuenta. Cuatro campos y un IBAN opcional: `isOwn` y
 * `openingBalanceCents` los pone la API desde los valores por defecto del
 * contrato, que es justo por qué los tiene.
 */
import {
  ACCOUNT_PROVIDERS,
  ACCOUNT_TYPES,
  type AccountProvider,
  type AccountType,
  CURRENCY_CODES,
  type Currency,
} from '@finanzas/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useId, useState } from 'react'
import { useNavigate } from 'react-router'
import { accountsQueryKey, createAccount } from '../api/accounts'
import { ApiError } from '../api/client'
import { Screen } from '../components/Screen'

const PROVIDER_LABELS: Record<AccountProvider, string> = {
  unicaja: 'Unicaja',
  revolut: 'Revolut',
  manual: 'Manual',
}

const TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Cuenta corriente',
  savings: 'Cuenta de ahorro',
  card: 'Tarjeta',
}

export function NewAccountScreen() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const nameFieldId = useId()
  const providerFieldId = useId()
  const typeFieldId = useId()
  const currencyFieldId = useId()
  const ibanFieldId = useId()

  const [name, setName] = useState('')
  const [provider, setProvider] = useState<AccountProvider>('unicaja')
  const [type, setType] = useState<AccountType>('checking')
  const [currency, setCurrency] = useState<Currency>('EUR')
  const [iban, setIban] = useState('')

  const create = useMutation({
    mutationFn: createAccount,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: accountsQueryKey })
      // De vuelta a importar: crear la cuenta casi siempre es el paso previo.
      await navigate('/ajustes/importar')
    },
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    // Un IBAN en blanco es "no lo he puesto", no una cadena vacía.
    create.mutate({ name, provider, type, currency, iban: iban.trim() === '' ? null : iban })
  }

  return (
    <Screen title="Nueva cuenta">
      {create.error ? <CreateError error={create.error} /> : null}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field id={nameFieldId} label="Nombre">
          <input
            id={nameFieldId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="min-h-11 rounded-xl bg-slate-800 px-3 text-slate-100"
          />
        </Field>

        <Field id={providerFieldId} label="Proveedor">
          <select
            id={providerFieldId}
            value={provider}
            onChange={(event) => setProvider(event.target.value as AccountProvider)}
            className="min-h-11 rounded-xl bg-slate-800 px-3 text-slate-100"
          >
            {ACCOUNT_PROVIDERS.map((value) => (
              <option key={value} value={value}>
                {PROVIDER_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>

        <Field id={typeFieldId} label="Tipo">
          <select
            id={typeFieldId}
            value={type}
            onChange={(event) => setType(event.target.value as AccountType)}
            className="min-h-11 rounded-xl bg-slate-800 px-3 text-slate-100"
          >
            {ACCOUNT_TYPES.map((value) => (
              <option key={value} value={value}>
                {TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>

        <Field id={currencyFieldId} label="Divisa">
          <select
            id={currencyFieldId}
            value={currency}
            onChange={(event) => setCurrency(event.target.value as Currency)}
            className="min-h-11 rounded-xl bg-slate-800 px-3 text-slate-100"
          >
            {CURRENCY_CODES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Field>

        <Field id={ibanFieldId} label="IBAN (opcional)">
          <input
            id={ibanFieldId}
            value={iban}
            onChange={(event) => setIban(event.target.value)}
            className="min-h-11 rounded-xl bg-slate-800 px-3 text-slate-100"
          />
        </Field>

        <button
          type="submit"
          disabled={name.trim() === '' || create.isPending}
          className="min-h-11 rounded-xl bg-emerald-500 px-4 py-3 font-medium text-slate-950 disabled:bg-slate-700 disabled:text-slate-400"
        >
          {create.isPending ? 'Creando…' : 'Crear cuenta'}
        </button>
      </form>
    </Screen>
  )
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-slate-400 text-sm">
        {label}
      </label>
      {children}
    </div>
  )
}

function CreateError({ error }: { error: Error }) {
  const details = error instanceof ApiError ? error.details : []

  return (
    <div role="alert" className="rounded-xl bg-rose-950/60 p-4 text-rose-200 text-sm">
      <p className="font-medium">No se ha podido crear la cuenta</p>
      <p className="mt-1 text-rose-300/90">{error.message}</p>
      {details.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1 text-xs">
          {details.map((detail) => (
            <li key={detail.path}>
              {detail.path}: {detail.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
