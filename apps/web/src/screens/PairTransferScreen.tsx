/**
 * Emparejar dos movimientos a mano.
 *
 * Existe para los casos que la heurística no puede resolver, y por eso el
 * buscador es el listado de movimientos de siempre y no una lista de candidatos
 * calculada: los candidatos «obvios» —mismo importe, cuentas distintas, fechas
 * cercanas— ya los empareja el matcher solo. Lo que queda aquí es justo lo que
 * no cumple alguno de esos criterios: una recarga de Revolut con tarjeta que en
 * Unicaja llega con otro importe, o dos patas separadas por más de tres días
 * (DATA_MODEL.md, «casos borde conocidos»). Una lista de candidatos estricta no
 * enseñaría ninguno de esos dos.
 *
 * Se eligen por separado el cargo y el abono porque las columnas de `transfers`
 * son esas dos y no dos genéricas: quien manda el par tiene que saber cuál es
 * cuál.
 */
import type { Transaction } from '@finanzas/shared'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { accountsQueryKey, fetchAccounts } from '../api/accounts'
import { ApiError } from '../api/client'
import {
  fetchTransaction,
  fetchTransactions,
  type TransactionFilters,
  transactionQueryKey,
  transactionsRootKey,
} from '../api/transactions'
import { createTransfer, transfersRootKey } from '../api/transfers'
import { CONTROL_CLASS, Field } from '../components/Field'
import { Notice } from '../components/Notice'
import { Screen } from '../components/Screen'
import { formatDay } from '../format/date'
import { formatMoney } from '../format/money'

const PAGE_SIZE = 25

/** Cuál de las dos patas se está eligiendo. */
type Slot = 'out' | 'in'

const SLOT_LABELS: Record<Slot, string> = {
  out: 'Cargo (el dinero sale)',
  in: 'Abono (el dinero entra)',
}

/** El mismo hueco, nombrado para encabezar el buscador. */
const SLOT_TITLES: Record<Slot, string> = {
  out: 'Elegir el cargo',
  in: 'Elegir el abono',
}

export function PairTransferScreen() {
  const [params] = useSearchParams()
  const queryClient = useQueryClient()

  /**
   * Se puede llegar con una pata puesta desde el detalle de un movimiento
   * (`?con=<id>`). En qué hueco cae lo decide su signo, que es lo único que
   * puede decidirlo: no hay más información en la URL.
   */
  const preselected = Number(params.get('con'))
  const preselectedId = Number.isInteger(preselected) && preselected > 0 ? preselected : null

  const [picked, setPicked] = useState<Record<Slot, Transaction | null>>({ out: null, in: null })
  const [slot, setSlot] = useState<Slot>('out')

  const arriving = useQuery({
    queryKey: transactionQueryKey(preselectedId ?? 0),
    queryFn: () => fetchTransaction(preselectedId ?? 0),
    retry: false,
    enabled: preselectedId !== null,
  })

  // Colocar el movimiento con el que se llega es un efecto y no un estado
  // inicial porque hay que esperar a que la API conteste: hasta entonces no se
  // sabe si es un cargo o un abono. Se hace una vez, cuando llega.
  const arrivingId = arriving.data?.id
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo interesa el momento en que llega
  useEffect(() => {
    if (arriving.data === undefined) return
    const destination: Slot = arriving.data.amountCents < 0 ? 'out' : 'in'
    setPicked((current) =>
      current[destination] === null ? { ...current, [destination]: arriving.data } : current,
    )
    setSlot(destination === 'out' ? 'in' : 'out')
  }, [arrivingId])

  const create = useMutation({
    mutationFn: createTransfer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transfersRootKey })
      queryClient.invalidateQueries({ queryKey: transactionsRootKey })
    },
  })

  function pick(transaction: Transaction) {
    // El signo manda: un cargo no puede ocupar el hueco del abono aunque el
    // usuario tuviera abierto ese hueco. La API lo rechazaría igual, y decirlo
    // aquí evita un 409 que no aporta nada.
    const destination: Slot = transaction.amountCents < 0 ? 'out' : 'in'
    setPicked((current) => ({ ...current, [destination]: transaction }))
    setSlot(destination === 'out' ? 'in' : 'out')
  }

  if (create.data !== undefined) {
    return (
      <Screen title="Emparejar a mano">
        <p className="text-emerald-400 text-sm">
          Emparejados. Los dos movimientos han dejado de contar como ingreso y como gasto.
        </p>
        <Link
          to="/movimientos/transferencias"
          className="min-h-11 rounded-xl bg-emerald-500 px-4 py-3 text-center font-medium text-slate-950"
        >
          Volver a las transferencias
        </Link>
      </Screen>
    )
  }

  const ready = picked.out !== null && picked.in !== null

  return (
    <Screen title="Emparejar a mano">
      <p className="text-slate-400 text-sm">
        Elige el movimiento del que sale el dinero y aquel al que entra. Tienen que estar en cuentas
        propias distintas, pero los importes no hacen falta que cuadren: una recarga con tarjeta
        rara vez cuadra al céntimo.
      </p>

      {create.error ? <PairError error={create.error} /> : null}

      <div className="flex flex-col gap-3">
        {(['out', 'in'] as const).map((current) => (
          <PickedSlot
            key={current}
            slot={current}
            transaction={picked[current]}
            active={slot === current}
            onFocus={() => setSlot(current)}
            onClear={() => setPicked((state) => ({ ...state, [current]: null }))}
          />
        ))}
      </div>

      <button
        type="button"
        disabled={!ready || create.isPending}
        onClick={() => {
          if (picked.out === null || picked.in === null) return
          create.mutate({ outTxnId: picked.out.id, inTxnId: picked.in.id })
        }}
        className="min-h-11 rounded-xl bg-emerald-500 px-4 py-3 font-medium text-slate-950 disabled:bg-slate-700 disabled:text-slate-400"
      >
        {create.isPending ? 'Emparejando…' : 'Emparejar los dos movimientos'}
      </button>

      <Picker slot={slot} onPick={pick} alreadyPicked={[picked.out?.id, picked.in?.id]} />

      <Link to="/movimientos/transferencias" className="text-slate-400 text-sm underline">
        Volver a las transferencias
      </Link>
    </Screen>
  )
}

function PickedSlot({
  slot,
  transaction,
  active,
  onFocus,
  onClear,
}: {
  slot: Slot
  transaction: Transaction | null
  active: boolean
  onFocus: () => void
  onClear: () => void
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl p-3 ${
        active ? 'bg-slate-800' : 'bg-slate-800/40'
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-slate-400 text-xs">{SLOT_LABELS[slot]}</p>
        {transaction === null ? (
          <button type="button" onClick={onFocus} className="text-slate-500 text-sm underline">
            Elegir un movimiento
          </button>
        ) : (
          <p className="truncate text-slate-100 text-sm">
            {formatDay(transaction.bookedAt)} ·{' '}
            {formatMoney(transaction.amountCents, transaction.currency)} ·{' '}
            {transaction.counterparty ?? transaction.description ?? 'Sin concepto'}
          </p>
        )}
      </div>
      {transaction === null ? null : (
        <button type="button" onClick={onClear} className="text-slate-400 text-sm underline">
          Quitar
        </button>
      )}
    </div>
  )
}

/**
 * El buscador. Es `GET /transactions` con sus filtros de siempre, que por
 * defecto ya deja fuera lo que está emparejado (invariante 3) y lo borrado
 * (invariante 5): no hace falta ningún endpoint nuevo para que la lista traiga
 * solo movimientos disponibles.
 */
function Picker({
  slot,
  onPick,
  alreadyPicked,
}: {
  slot: Slot
  onPick: (transaction: Transaction) => void
  alreadyPicked: readonly (number | undefined)[]
}) {
  const searchFieldId = useId()
  const accountFieldId = useId()
  const [search, setSearch] = useState('')
  const [accountId, setAccountId] = useState('')

  const accounts = useQuery({ queryKey: accountsQueryKey, queryFn: fetchAccounts, retry: false })

  const filters: TransactionFilters = { search, accountId, limit: PAGE_SIZE }
  const list = useQuery({
    queryKey: ['transactions', 'emparejar', slot, search, accountId],
    queryFn: () => fetchTransactions(filters),
    retry: false,
    placeholderData: keepPreviousData,
  })

  // El signo decide en qué hueco cae cada movimiento, así que la lista enseña
  // solo los que sirven para el que se está eligiendo.
  const wanted = (transaction: Transaction) =>
    slot === 'out' ? transaction.amountCents < 0 : transaction.amountCents > 0

  const shown = (list.data?.transactions ?? [])
    .filter(wanted)
    .filter((transaction) => !alreadyPicked.includes(transaction.id))

  return (
    <section className="flex flex-col gap-4 border-slate-800 border-t pt-5">
      <h2 className="font-medium text-slate-100">{SLOT_TITLES[slot]}</h2>

      <Field id={searchFieldId} label="Buscar">
        <input
          id={searchFieldId}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Contraparte o concepto"
          className={CONTROL_CLASS}
        />
      </Field>

      <Field id={accountFieldId} label="Cuenta">
        <select
          id={accountFieldId}
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
          className={CONTROL_CLASS}
        >
          <option value="">Todas</option>
          {(accounts.data ?? []).map((account) => (
            <option key={account.id} value={String(account.id)}>
              {account.name}
            </option>
          ))}
        </select>
      </Field>

      {list.error ? (
        <Notice title="No se han podido cargar los movimientos" detail={list.error.message} />
      ) : null}

      {list.isPending ? <p className="text-slate-400 text-sm">Cargando movimientos…</p> : null}

      {list.data !== undefined && shown.length === 0 ? (
        <p className="text-slate-400 text-sm">
          Ningún movimiento sin emparejar cumple estos filtros.
        </p>
      ) : null}

      <ul className="flex flex-col divide-y divide-slate-800">
        {shown.map((transaction) => (
          <li key={transaction.id}>
            <button
              type="button"
              onClick={() => onPick(transaction)}
              className="flex min-h-16 w-full items-center gap-3 py-3 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-slate-100">
                  {transaction.counterparty ?? transaction.description ?? 'Sin concepto'}
                </span>
                <span className="block text-slate-500 text-xs">
                  {formatDay(transaction.bookedAt)}
                </span>
              </span>
              <span
                className={`shrink-0 font-medium tabular-nums ${
                  transaction.amountCents < 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {formatMoney(transaction.amountCents, transaction.currency)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Decide por el `code` y no por el texto del mensaje (ADR-009). */
function PairError({ error }: { error: Error }) {
  if (!(error instanceof ApiError)) {
    return <Notice title="No se ha podido contactar con la API" detail={error.message} />
  }

  switch (error.code) {
    case 'conflict':
      return (
        <Notice
          title="Esos dos movimientos no se pueden emparejar"
          detail={error.message}
          hint="Tienen que estar en cuentas propias distintas, y uno tiene que ser un cargo y el otro un abono."
        />
      )
    case 'not_found':
      return <Notice title="Alguno de los dos movimientos ya no existe" detail={error.message} />
    default:
      return <Notice title="No se ha podido emparejar" detail={error.message} />
  }
}
