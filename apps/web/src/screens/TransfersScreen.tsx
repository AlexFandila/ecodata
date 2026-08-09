/**
 * La revisión de transferencias internas: confirmar lo que la heurística ha
 * emparejado, deshacer lo que no cuadre y llegar al emparejado manual.
 *
 * Por qué merece pantalla propia y no un aviso en el listado: emparejar dos
 * movimientos los saca de ingresos y gastos (invariante 3), así que un falso
 * positivo distorsiona el dashboard en silencio hasta que alguien lo mira. La
 * heurística se decidió a sabiendas de eso —empareja de más antes que de menos,
 * porque el coste de un falso negativo es emparejar a mano y el de un falso
 * positivo es un número mal (ADR-013)—, y esta pantalla es la otra mitad de esa
 * decisión: el sitio donde se deshace.
 *
 * Cada tarjeta enseña **por qué** se emparejó. Ese `matchedBy` es lo único que
 * convierte «confía en mí» en una decisión que el usuario puede tomar.
 */
import type { TransferMatchSignal, TransferStatus, TransferWithLegs } from '@finanzas/shared'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import { accountsQueryKey, fetchAccounts } from '../api/accounts'
import { transactionsRootKey } from '../api/transactions'
import {
  confirmTransfer,
  fetchTransfers,
  matchTransfers,
  type TransferFilters,
  transfersQueryKey,
  transfersRootKey,
  undoTransfer,
} from '../api/transfers'
import { Notice } from '../components/Notice'
import { Screen } from '../components/Screen'
import { TabLink, TabStrip } from '../components/Tabs'
import { formatDay } from '../format/date'
import { formatMoney } from '../format/money'

const PAGE_SIZE = 50

/**
 * Qué señal disparó cada emparejamiento, en cristiano.
 *
 * Los literales vienen de una lista cerrada precisamente para poder traducirlos
 * aquí: si `matchedBy` fuera texto libre, esta pantalla acabaría enseñando en
 * bruto lo que escribiera el motor (ADR-013 decisión 7).
 */
const SIGNAL_LABELS: Record<TransferMatchSignal, string> = {
  other_provider_named: 'una nombra a la cuenta de la otra',
  holder_named: 'aparece tu nombre',
  close_dates: 'las fechas se llevan un día o menos',
}

const STATUS_LABELS: Record<TransferStatus, string> = {
  auto: 'Sin revisar',
  confirmed: 'Confirmada',
  manual: 'Emparejada a mano',
}

export function TransfersScreen() {
  const [params] = useSearchParams()
  const queryClient = useQueryClient()

  // Solo dos vistas, así que el filtro cabe en un booleano de la barra de
  // direcciones: atrás deshace «ver todas» en vez de salir de la pantalla.
  const onlyPending = params.get('estado') !== 'todas'
  // Sin `status: undefined`: con `exactOptionalPropertyTypes`, «sin filtro» es
  // no poner la clave, no ponerla a `undefined`.
  const query: TransferFilters = onlyPending
    ? { status: 'auto', limit: PAGE_SIZE, offset: 0 }
    : { limit: PAGE_SIZE, offset: 0 }

  const list = useQuery({
    queryKey: transfersQueryKey(query),
    queryFn: () => fetchTransfers(query),
    retry: false,
    placeholderData: keepPreviousData,
  })

  // El contador de la pestaña: el `total` de la misma consulta acotada a las
  // que faltan por revisar, sin traerse la lista.
  const pendingQuery: TransferFilters = { status: 'auto', limit: 1 }
  const pending = useQuery({
    queryKey: transfersQueryKey(pendingQuery),
    queryFn: () => fetchTransfers(pendingQuery),
    retry: false,
  })

  const accounts = useQuery({ queryKey: accountsQueryKey, queryFn: fetchAccounts, retry: false })
  const accountNames = new Map((accounts.data ?? []).map((account) => [account.id, account.name]))

  /**
   * Cualquier cambio invalida las dos cachés. La de movimientos también:
   * deshacer devuelve dos movimientos al listado normal y confirmar no, pero
   * distinguirlo aquí solo serviría para que una de las dos listas mintiera.
   */
  function refresh() {
    queryClient.invalidateQueries({ queryKey: transfersRootKey })
    queryClient.invalidateQueries({ queryKey: transactionsRootKey })
  }

  const confirm = useMutation({ mutationFn: confirmTransfer, onSuccess: refresh })
  const undo = useMutation({ mutationFn: undoTransfer, onSuccess: refresh })
  const rematch = useMutation({ mutationFn: matchTransfers, onSuccess: refresh })

  const shown = list.data?.transfers ?? []
  const pendingTotal = pending.data?.total

  return (
    <Screen title="Transferencias">
      <TabStrip label="Qué se lista">
        <TabLink to="/movimientos" selected={false}>
          Todos
        </TabLink>
        <TabLink to="/movimientos?pendientes=true" selected={false}>
          Sin categorizar
        </TabLink>
        <TabLink to="/movimientos/transferencias" selected={true}>
          Transferencias{pendingTotal === undefined ? '' : ` (${pendingTotal})`}
        </TabLink>
      </TabStrip>

      <TabStrip label="Qué transferencias">
        <TabLink to="/movimientos/transferencias" selected={onlyPending}>
          Sin revisar
        </TabLink>
        <TabLink to="/movimientos/transferencias?estado=todas" selected={!onlyPending}>
          Todas
        </TabLink>
      </TabStrip>

      <p className="text-slate-400 text-sm">
        Las dos patas de una transferencia interna no cuentan como ingreso ni como gasto, pero sí
        mueven el saldo de sus cuentas.
      </p>

      {list.error ? (
        <Notice title="No se han podido cargar las transferencias" detail={list.error.message} />
      ) : null}
      {confirm.error ? (
        <Notice title="No se ha podido confirmar" detail={confirm.error.message} />
      ) : null}
      {undo.error ? <Notice title="No se ha podido deshacer" detail={undo.error.message} /> : null}
      {rematch.error ? (
        <Notice title="No se han podido buscar transferencias" detail={rematch.error.message} />
      ) : null}

      {list.isPending ? <p className="text-slate-400 text-sm">Cargando transferencias…</p> : null}

      {list.data !== undefined && shown.length === 0 ? (
        <EmptyState onlyPending={onlyPending} />
      ) : null}

      {shown.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {shown.map((transfer) => (
            <TransferCard
              key={transfer.id}
              transfer={transfer}
              accountNames={accountNames}
              busy={confirm.isPending || undo.isPending}
              onConfirm={() => confirm.mutate(transfer.id)}
              onUndo={() => undo.mutate(transfer.id)}
            />
          ))}
        </ul>
      ) : null}

      <section className="flex flex-col gap-3 border-slate-800 border-t pt-5">
        <button
          type="button"
          onClick={() => rematch.mutate()}
          disabled={rematch.isPending}
          className="min-h-11 rounded-xl bg-slate-800 px-4 py-3 font-medium text-slate-100 disabled:text-slate-500"
        >
          {rematch.isPending ? 'Buscando…' : 'Buscar transferencias'}
        </button>

        {rematch.data === undefined ? null : <MatchResult result={rematch.data} />}

        <Link
          to="/movimientos/transferencias/emparejar"
          className="min-h-11 rounded-xl bg-slate-800 px-4 py-3 text-center font-medium text-slate-100"
        >
          Emparejar dos movimientos a mano
        </Link>
      </section>
    </Screen>
  )
}

function MatchResult({ result }: { result: { created: number; unresolved: number } }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p className={result.created > 0 ? 'text-emerald-400' : 'text-slate-400'}>
        {result.created === 0
          ? 'No había ninguna transferencia nueva que emparejar.'
          : `${result.created} ${result.created === 1 ? 'transferencia nueva' : 'transferencias nuevas'}.`}
      </p>
      {result.unresolved > 0 ? (
        <p className="text-slate-400">
          {result.unresolved} {result.unresolved === 1 ? 'movimiento tenía' : 'movimientos tenían'}{' '}
          varias parejas posibles y {result.unresolved === 1 ? 'se ha' : 'se han'} dejado sin
          emparejar: son los que hay que emparejar a mano.
        </p>
      ) : null}
    </div>
  )
}

/**
 * Una transferencia: sus dos patas, por qué se emparejaron y qué hacer con
 * ella.
 *
 * «Confirmar» solo aparece en las `auto`: una manual la puso el usuario y una
 * confirmada ya la miró, así que el botón no tendría nada que confirmar.
 * «Deshacer» está siempre, porque equivocarse se puede uno equivocar de las
 * tres maneras.
 */
function TransferCard({
  transfer,
  accountNames,
  busy,
  onConfirm,
  onUndo,
}: {
  transfer: TransferWithLegs
  accountNames: Map<number, string>
  busy: boolean
  onConfirm: () => void
  onUndo: () => void
}) {
  return (
    <li className="flex flex-col gap-3 rounded-xl bg-slate-800/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-slate-400 text-xs">{STATUS_LABELS[transfer.status]}</span>
        <span className="text-slate-500 text-xs">{formatDay(transfer.out.bookedAt)}</span>
      </div>

      <div className="flex flex-col gap-2">
        <Leg leg={transfer.out} accountName={accountNames.get(transfer.out.accountId)} />
        <Leg leg={transfer.in} accountName={accountNames.get(transfer.in.accountId)} />
      </div>

      {transfer.matchedBy.length > 0 ? (
        <p className="text-slate-500 text-xs">
          Emparejadas porque {transfer.matchedBy.map((signal) => SIGNAL_LABELS[signal]).join(', ')}.
        </p>
      ) : null}

      <div className="flex gap-2">
        {transfer.status === 'auto' ? (
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="min-h-11 flex-1 rounded-xl bg-emerald-500 px-4 font-medium text-slate-950 disabled:bg-slate-700 disabled:text-slate-400"
          >
            Confirmar
          </button>
        ) : null}
        <button
          type="button"
          onClick={onUndo}
          disabled={busy}
          className="min-h-11 flex-1 rounded-xl bg-slate-700 px-4 font-medium text-slate-100 disabled:text-slate-500"
        >
          Deshacer
        </button>
      </div>
    </li>
  )
}

/** Una pata: de qué cuenta sale o a cuál entra, y por cuánto. */
function Leg({
  leg,
  accountName,
}: {
  leg: TransferWithLegs['out']
  accountName: string | undefined
}) {
  const charge = leg.amountCents < 0
  const title = leg.counterparty ?? leg.description ?? 'Sin concepto'

  return (
    <Link to={`/movimientos/${leg.id}`} className="flex items-center gap-3">
      <span aria-hidden="true" className="text-slate-500">
        {charge ? '↑' : '↓'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-slate-100 text-sm">{accountName ?? title}</span>
        <span className="block truncate text-slate-500 text-xs">
          {formatDay(leg.bookedAt)} · {title}
        </span>
      </span>
      <span
        className={`shrink-0 font-medium tabular-nums ${charge ? 'text-rose-400' : 'text-emerald-400'}`}
      >
        {formatMoney(leg.amountCents, leg.currency)}
      </span>
    </Link>
  )
}

function EmptyState({ onlyPending }: { onlyPending: boolean }) {
  // Igual que la bandeja de pendientes: no quedar nada por revisar es una buena
  // noticia y no un vacío que haya que justificar.
  return onlyPending ? (
    <p className="text-emerald-400 text-sm">No queda ninguna transferencia por revisar.</p>
  ) : (
    <p className="text-slate-400 text-sm">
      Todavía no hay ninguna transferencia interna. Aparecerán solas al importar los dos extractos
      de un traspaso.
    </p>
  )
}
