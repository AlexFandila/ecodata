/**
 * Subir un extracto: elegir cuenta, elegir formato, adjuntar y ver qué entró.
 *
 * Dos detalles que no son cosméticos:
 *
 * - El desplegable nombra el **formato**, no el banco (ADR-010). Se presugiere
 *   a partir del `provider` de la cuenta porque acierta casi siempre, pero se
 *   puede cambiar: nada impide guardar en la cuenta de Unicaja un fichero que
 *   venga de otro sitio.
 * - Un import con `inserted: 0` y `duplicated: 12` **es un éxito**, no un
 *   fallo: reimportar el mismo extracto es el caso normal y el dedupe hace su
 *   trabajo. Por eso el resultado se pinta igual salga como salga el reparto.
 */
import type { AccountProvider, ImportSource } from '@finanzas/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useId, useState } from 'react'
import { Link } from 'react-router'
import { accountsQueryKey, fetchAccounts } from '../api/accounts'
import { ApiError } from '../api/client'
import { createImport } from '../api/imports'
import { Notice, NoticeDetails } from '../components/Notice'
import { Screen } from '../components/Screen'

/**
 * Como `Record` completo y no como objeto suelto: añadir un formato a
 * `IMPORT_SOURCES` sin ponerle etiqueta aquí deja de compilar.
 */
const SOURCE_LABELS: Record<ImportSource, string> = {
  norma43: 'Cuaderno 43 · Unicaja',
  revolut_csv: 'CSV de Revolut',
}

/** Formato que suele traer cada proveedor. `manual` no exporta nada conocido. */
const SUGGESTED_SOURCE: Record<AccountProvider, ImportSource | null> = {
  unicaja: 'norma43',
  revolut: 'revolut_csv',
  manual: null,
}

const STATS = [
  { key: 'read', label: 'Leídos' },
  { key: 'inserted', label: 'Nuevos' },
  { key: 'duplicated', label: 'Duplicados' },
  { key: 'errors', label: 'Con error' },
] as const

export function ImportScreen() {
  const queryClient = useQueryClient()
  const accountFieldId = useId()
  const sourceFieldId = useId()
  const fileFieldId = useId()

  const [accountId, setAccountId] = useState<number | null>(null)
  const [source, setSource] = useState<ImportSource>('norma43')
  const [file, setFile] = useState<File | null>(null)

  const accounts = useQuery({ queryKey: accountsQueryKey, queryFn: fetchAccounts, retry: false })

  const importFile = useMutation({
    mutationFn: createImport,
    onError: (error) => {
      // La cuenta elegida ya no está: la lista que tenemos en pantalla miente.
      if (error instanceof ApiError && error.code === 'not_found') {
        void queryClient.invalidateQueries({ queryKey: accountsQueryKey })
      }
    },
  })

  function handleAccountChange(value: string) {
    const chosen = accounts.data?.find((account) => String(account.id) === value)
    setAccountId(chosen?.id ?? null)
    const suggestion = chosen === undefined ? null : SUGGESTED_SOURCE[chosen.provider]
    if (suggestion !== null) {
      setSource(suggestion)
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (accountId === null || file === null) return
    importFile.mutate({ accountId, source, file })
  }

  if (accounts.isPending) {
    return (
      <Screen title="Importar">
        <p className="text-slate-400 text-sm">Cargando cuentas…</p>
      </Screen>
    )
  }

  if (accounts.error) {
    return (
      <Screen title="Importar">
        <p className="text-rose-400 text-sm">
          No se han podido cargar las cuentas ({accounts.error.message}).
        </p>
      </Screen>
    )
  }

  // Sin cuentas no hay nada que elegir: un desplegable vacío sería una trampa.
  if (accounts.data.length === 0) {
    return (
      <Screen title="Importar">
        <p className="text-slate-400 text-sm">
          Todavía no hay ninguna cuenta. Los movimientos de un extracto van siempre a una cuenta,
          así que hay que crear una antes de importar.
        </p>
        <Link
          to="/ajustes/cuentas/nueva"
          className="rounded-xl bg-emerald-500 px-4 py-3 text-center font-medium text-slate-950"
        >
          Crear la primera cuenta
        </Link>
      </Screen>
    )
  }

  const result = importFile.data
  if (result !== undefined) {
    return (
      <Screen title="Importado">
        <p className="text-slate-400 text-sm">{result.fileName ?? 'Fichero sin nombre'}</p>
        <dl className="grid grid-cols-2 gap-3">
          {STATS.map((stat) => (
            <div key={stat.key} className="rounded-xl bg-slate-800/60 p-4">
              <dt className="text-slate-400 text-xs">{stat.label}</dt>
              <dd className="font-semibold text-2xl text-slate-100">{result.stats[stat.key]}</dd>
            </div>
          ))}
        </dl>

        {result.stats.duplicated > 0 && result.stats.inserted === 0 ? (
          <p className="text-emerald-400 text-sm">
            Todo estaba ya importado: no se ha duplicado nada.
          </p>
        ) : null}

        {result.rowErrors.length > 0 ? (
          <div className="rounded-xl bg-slate-800/60 p-4">
            <h2 className="font-medium text-slate-100 text-sm">Filas que no se han podido leer</h2>
            <ul className="mt-2 flex flex-col gap-1 text-slate-400 text-xs">
              {result.rowErrors.map((rowError) => (
                <li key={`${rowError.row}-${rowError.message}`}>
                  Fila {rowError.row} — {rowError.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => {
            importFile.reset()
            setFile(null)
          }}
          className="min-h-11 rounded-xl bg-slate-800 px-4 py-3 font-medium text-slate-100"
        >
          Importar otro fichero
        </button>
      </Screen>
    )
  }

  return (
    <Screen title="Importar">
      {importFile.error ? <ImportError error={importFile.error} /> : null}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor={accountFieldId} className="text-slate-400 text-sm">
            Cuenta de destino
          </label>
          <select
            id={accountFieldId}
            value={accountId === null ? '' : String(accountId)}
            onChange={(event) => handleAccountChange(event.target.value)}
            className="min-h-11 rounded-xl bg-slate-800 px-3 text-slate-100"
          >
            <option value="">Elige una cuenta</option>
            {accounts.data.map((account) => (
              <option key={account.id} value={String(account.id)}>
                {account.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={sourceFieldId} className="text-slate-400 text-sm">
            Formato del fichero
          </label>
          <select
            id={sourceFieldId}
            value={source}
            onChange={(event) => setSource(event.target.value as ImportSource)}
            className="min-h-11 rounded-xl bg-slate-800 px-3 text-slate-100"
          >
            {Object.entries(SOURCE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={fileFieldId} className="text-slate-400 text-sm">
            Fichero
          </label>
          <input
            id={fileFieldId}
            type="file"
            accept=".n43,.csv,.txt,text/csv,text/plain"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="rounded-xl bg-slate-800 p-3 text-slate-100 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={accountId === null || file === null || importFile.isPending}
          className="min-h-11 rounded-xl bg-emerald-500 px-4 py-3 font-medium text-slate-950 disabled:bg-slate-700 disabled:text-slate-400"
        >
          {importFile.isPending ? 'Importando…' : 'Importar'}
        </button>
      </form>
    </Screen>
  )
}

/**
 * Decide por el `code` y no por el texto del mensaje (ADR-009). El `message`
 * del adaptador sí se enseña tal cual: está escrito para leerse y dice si el
 * descuadre es de totales o de saldo.
 */
function ImportError({ error }: { error: Error }) {
  if (!(error instanceof ApiError)) {
    return <Notice title="No se ha podido contactar con la API" detail={error.message} />
  }

  switch (error.code) {
    case 'unsupported_format':
      return (
        <Notice
          title="El fichero no encaja con el formato elegido"
          detail={error.message}
          hint="Comprueba el desplegable: el cuaderno 43 y el CSV de Revolut no son intercambiables."
        />
      )
    case 'not_found':
      return <Notice title="Esa cuenta ya no existe" detail={error.message} />
    case 'validation_error':
      return (
        <Notice title="Los datos del formulario no son válidos" detail={error.message}>
          <NoticeDetails details={error.details} />
        </Notice>
      )
    default:
      return <Notice title="La importación ha fallado" detail={error.message} />
  }
}
