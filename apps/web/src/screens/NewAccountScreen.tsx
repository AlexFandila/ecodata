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
import { CONTROL_CLASS, Field } from '../components/Field'
import { Notice, NoticeDetails } from '../components/Notice'
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
            className={CONTROL_CLASS}
          />
        </Field>

        <Field id={providerFieldId} label="Proveedor">
          <select
            id={providerFieldId}
            value={provider}
            onChange={(event) => setProvider(event.target.value as AccountProvider)}
            className={CONTROL_CLASS}
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
            className={CONTROL_CLASS}
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
            className={CONTROL_CLASS}
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
            className={CONTROL_CLASS}
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

function CreateError({ error }: { error: Error }) {
  return (
    <Notice title="No se ha podido crear la cuenta" detail={error.message}>
      <NoticeDetails details={error instanceof ApiError ? error.details : []} />
    </Notice>
  )
}
