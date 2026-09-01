/**
 * Alta de cuenta. `isOwn` lo sigue poniendo la API desde el default del
 * contrato, que es justo por qué lo tiene.
 *
 * El saldo inicial sí se pregunta, aunque también tenga default: es la base del
 * invariante 6 —saldo = inicial + Σ movimientos—, así que dejarlo en cero
 * cuando la cuenta no empieza en cero desplaza todos los saldos de la app en
 * esa cantidad. Y lo que hay que escribir no es el saldo de hoy sino el
 * **anterior al movimiento más antiguo que se vaya a importar**, que es una
 * distinción que nadie acierta si no se la cuentan: de ahí el texto de ayuda
 * bajo el campo, que es parte del campo y no un adorno.
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
import { parseMoneyCents } from '../format/money'

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
  const balanceFieldId = useId()
  const balanceHintId = useId()
  const ibanFieldId = useId()

  const [name, setName] = useState('')
  const [provider, setProvider] = useState<AccountProvider>('unicaja')
  const [type, setType] = useState<AccountType>('checking')
  const [currency, setCurrency] = useState<Currency>('EUR')
  const [openingBalance, setOpeningBalance] = useState('')
  const [balanceError, setBalanceError] = useState<string | null>(null)
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

    // Se valida al enviar y no al teclear: mientras se escribe «1.234,56», el
    // texto pasa por «1.» y por «1.234,», que son inválidos, y un aviso que
    // aparece y desaparece con cada pulsación es ruido, no ayuda.
    const openingBalanceCents = parseMoneyCents(openingBalance, currency)
    if (openingBalanceCents === null) {
      setBalanceError(`No se entiende «${openingBalance}» como un importe.`)
      // Que no queden dos avisos a la vez si el intento anterior falló en la API.
      create.reset()
      return
    }
    setBalanceError(null)

    create.mutate({
      name,
      provider,
      type,
      currency,
      // Un IBAN en blanco es "no lo he puesto", no una cadena vacía.
      iban: iban.trim() === '' ? null : iban,
      openingBalanceCents,
    })
  }

  return (
    <Screen title="Nueva cuenta">
      {balanceError !== null ? (
        <Notice title="El saldo inicial no se entiende" detail={balanceError} />
      ) : null}
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

        {/* Detrás de la divisa a propósito: el importe se lee con ella. */}
        <Field id={balanceFieldId} label="Saldo inicial (opcional)">
          <input
            id={balanceFieldId}
            value={openingBalance}
            onChange={(event) => setOpeningBalance(event.target.value)}
            // `text` con teclado numérico, no `type="number"`: un campo numérico
            // no acepta la coma de forma fiable en español y normaliza su valor
            // según el navegador, que sería meter una segunda gramática de
            // importes justo donde hace falta tener una sola.
            inputMode="decimal"
            placeholder="0,00"
            aria-describedby={balanceHintId}
            aria-invalid={balanceError !== null}
            className={CONTROL_CLASS}
          />
          <p id={balanceHintId} className="text-slate-400 text-xs">
            El saldo justo <strong>antes</strong> del movimiento más antiguo que vayas a importar,
            no el de hoy. Lo dice la cabecera del propio extracto. En blanco es cero.
          </p>
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
