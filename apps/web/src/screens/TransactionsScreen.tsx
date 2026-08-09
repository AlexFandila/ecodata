/**
 * La lista de movimientos y la bandeja de «sin categorizar», que son la misma
 * pantalla con un filtro distinto.
 *
 * Tres decisiones que no son cosméticas:
 *
 * - **Los filtros viven en la barra de direcciones**, no en `useState`. En el
 *   móvil el botón atrás es el gesto por defecto para deshacer: con estado
 *   local, quitar un filtro obligaría a buscarlo y atrás sacaría de la pantalla;
 *   con la query string, atrás deshace el último filtro y volver desde el
 *   detalle de un movimiento reencuentra la lista tal como estaba.
 * - **La bandeja es una pestaña y no otra ruta**: es el mismo listado con
 *   `uncategorized=true`, y su contador sale del `total` de la respuesta, sin
 *   pedir la lista entera.
 * - **La paginación es un botón y no un scroll infinito**: `total` dice cuántos
 *   quedan, y saber que se ha llegado al final es información que un scroll
 *   infinito no da nunca.
 */
import type { Category, Transaction } from '@finanzas/shared'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { accountsQueryKey, fetchAccounts } from '../api/accounts'
import { categoriesQueryKey, fetchCategories } from '../api/categories'
import {
  fetchTransactions,
  type TransactionFilters,
  transactionsQueryKey,
} from '../api/transactions'
import { fetchTransfers, type TransferFilters, transfersQueryKey } from '../api/transfers'
import { CONTROL_CLASS, Field } from '../components/Field'
import { Notice } from '../components/Notice'
import { Screen } from '../components/Screen'
import { TabButton, TabLink, TabStrip } from '../components/Tabs'
import { formatDay } from '../format/date'
import { formatMoney } from '../format/money'

const PAGE_SIZE = 50

/** Los filtros que se leen de la query string, con su valor por defecto. */
function readFilters(params: URLSearchParams) {
  return {
    accountId: params.get('cuenta') ?? '',
    from: params.get('desde') ?? '',
    to: params.get('hasta') ?? '',
    categoryId: params.get('categoria') ?? '',
    search: params.get('buscar') ?? '',
    pending: params.get('pendientes') === 'true',
  }
}

type Filters = ReturnType<typeof readFilters>

function toQuery(filters: Filters, offset: number): TransactionFilters {
  return {
    accountId: filters.accountId,
    from: filters.from,
    to: filters.to,
    categoryId: filters.categoryId,
    search: filters.search,
    uncategorized: filters.pending,
    limit: PAGE_SIZE,
    offset,
  }
}

/** Primer y último día del mes al que pertenece `reference`. */
function monthRange(reference: Date, monthsAgo: number): { from: string; to: string } {
  const first = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - monthsAgo, 1),
  )
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0))
  const iso = (date: Date) => date.toISOString().slice(0, 10)
  return { from: iso(first), to: iso(last) }
}

export function TransactionsScreen() {
  const [params, setParams] = useSearchParams()
  const filters = readFilters(params)

  const [offset, setOffset] = useState(0)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const accountFieldId = useId()
  const categoryFieldId = useId()
  const searchFieldId = useId()
  const fromFieldId = useId()
  const toFieldId = useId()

  // Cambiar un filtro empieza por el principio de la lista: mantener el
  // desplazamiento anterior enseñaría la página 3 de otra búsqueda.
  const filtersKey = JSON.stringify(filters)
  // biome-ignore lint/correctness/useExhaustiveDependencies: la clave serializa los filtros a propósito
  useEffect(() => setOffset(0), [filtersKey])

  const accounts = useQuery({ queryKey: accountsQueryKey, queryFn: fetchAccounts, retry: false })
  const categories = useQuery({
    queryKey: categoriesQueryKey,
    queryFn: fetchCategories,
    retry: false,
  })

  const query = toQuery(filters, offset)
  const list = useQuery({
    queryKey: transactionsQueryKey(query),
    queryFn: () => fetchTransactions(query),
    retry: false,
    // Sin esto, cada «cargar más» vacía la lista y la pantalla parpadea.
    placeholderData: keepPreviousData,
  })

  // El contador de la pestaña: el `total` de la misma consulta con
  // `uncategorized`, que la API responde sin traerse la lista entera.
  const pendingQuery = { ...toQuery({ ...filters, pending: true }, 0), limit: 1 }
  const pending = useQuery({
    queryKey: transactionsQueryKey(pendingQuery),
    queryFn: () => fetchTransactions(pendingQuery),
    retry: false,
  })

  // Y el de la pestaña de transferencias, por lo mismo: las que están sin
  // revisar, contadas sin traerse la lista.
  const transfersQuery: TransferFilters = { status: 'auto', limit: 1 }
  const transfers = useQuery({
    queryKey: transfersQueryKey(transfersQuery),
    queryFn: () => fetchTransfers(transfersQuery),
    retry: false,
  })

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value === '') next.delete(key)
    else next.set(key, value)
    setParams(next)
  }

  function setPending(value: boolean) {
    const next = new URLSearchParams(params)
    if (value) next.set('pendientes', 'true')
    else next.delete('pendientes')
    setParams(next)
  }

  const categoriesById = new Map((categories.data ?? []).map((category) => [category.id, category]))
  const shown = list.data?.transactions ?? []
  const total = list.data?.total ?? 0
  const hasFilters =
    filters.accountId !== '' ||
    filters.from !== '' ||
    filters.to !== '' ||
    filters.categoryId !== '' ||
    filters.search !== ''

  return (
    <Screen title="Movimientos">
      <TabStrip label="Qué se lista">
        <TabButton selected={!filters.pending} onSelect={() => setPending(false)}>
          Todos
        </TabButton>
        <TabButton selected={filters.pending} onSelect={() => setPending(true)}>
          Sin categorizar{pending.data === undefined ? '' : ` (${pending.data.total})`}
        </TabButton>
        {/* Enlace y no botón: es otra pantalla, no otro filtro de esta. */}
        <TabLink to="/movimientos/transferencias" selected={false}>
          Transferencias{transfers.data === undefined ? '' : ` (${transfers.data.total})`}
        </TabLink>
      </TabStrip>

      <button
        type="button"
        onClick={() => setFiltersOpen((open) => !open)}
        aria-expanded={filtersOpen}
        className="min-h-11 rounded-xl bg-slate-800 px-4 text-slate-100 text-sm"
      >
        {filtersOpen ? 'Ocultar filtros' : 'Filtros'}
        {hasFilters ? ' · activos' : ''}
      </button>

      {filtersOpen ? (
        <div className="flex flex-col gap-4 rounded-xl bg-slate-800/60 p-4">
          <Field id={searchFieldId} label="Buscar">
            <input
              id={searchFieldId}
              type="search"
              value={filters.search}
              onChange={(event) => updateFilter('buscar', event.target.value)}
              placeholder="Contraparte o concepto"
              className={CONTROL_CLASS}
            />
          </Field>

          <Field id={accountFieldId} label="Cuenta">
            <select
              id={accountFieldId}
              value={filters.accountId}
              onChange={(event) => updateFilter('cuenta', event.target.value)}
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

          <Field id={categoryFieldId} label="Categoría">
            <select
              id={categoryFieldId}
              value={filters.categoryId}
              onChange={(event) => updateFilter('categoria', event.target.value)}
              className={CONTROL_CLASS}
            >
              <option value="">Todas</option>
              {(categories.data ?? []).map((category) => (
                <option key={category.id} value={String(category.id)}>
                  {categoryLabel(category, categoriesById)}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex gap-2">
            {[
              { label: 'Este mes', monthsAgo: 0 },
              { label: 'Mes pasado', monthsAgo: 1 },
            ].map((shortcut) => (
              <button
                key={shortcut.label}
                type="button"
                onClick={() => {
                  const range = monthRange(new Date(), shortcut.monthsAgo)
                  const next = new URLSearchParams(params)
                  next.set('desde', range.from)
                  next.set('hasta', range.to)
                  setParams(next)
                }}
                className="min-h-11 flex-1 rounded-xl bg-slate-800 px-3 text-slate-100 text-sm"
              >
                {shortcut.label}
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <Field id={fromFieldId} label="Desde">
                <input
                  id={fromFieldId}
                  type="date"
                  value={filters.from}
                  onChange={(event) => updateFilter('desde', event.target.value)}
                  className={`${CONTROL_CLASS} w-full`}
                />
              </Field>
            </div>
            <div className="flex-1">
              <Field id={toFieldId} label="Hasta">
                <input
                  id={toFieldId}
                  type="date"
                  value={filters.to}
                  onChange={(event) => updateFilter('hasta', event.target.value)}
                  className={`${CONTROL_CLASS} w-full`}
                />
              </Field>
            </div>
          </div>

          {hasFilters ? (
            <button
              type="button"
              onClick={() => setParams(filters.pending ? { pendientes: 'true' } : {})}
              className="min-h-11 rounded-xl bg-slate-700 px-4 text-slate-100 text-sm"
            >
              Quitar los filtros
            </button>
          ) : null}
        </div>
      ) : null}

      {list.error ? (
        <Notice title="No se han podido cargar los movimientos" detail={list.error.message} />
      ) : null}

      {list.isPending ? <p className="text-slate-400 text-sm">Cargando movimientos…</p> : null}

      {list.data !== undefined && shown.length === 0 ? (
        <EmptyState pending={filters.pending} hasFilters={hasFilters} />
      ) : null}

      {shown.length > 0 ? (
        <>
          <ul className="flex flex-col divide-y divide-slate-800">
            {shown.map((transaction) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                category={
                  transaction.categoryId === null
                    ? undefined
                    : categoriesById.get(transaction.categoryId)
                }
              />
            ))}
          </ul>

          <p className="text-center text-slate-500 text-xs">
            {shown.length + offset} de {total}
          </p>

          {offset + shown.length < total ? (
            <button
              type="button"
              onClick={() => setOffset(offset + PAGE_SIZE)}
              disabled={list.isFetching}
              className="min-h-11 rounded-xl bg-slate-800 px-4 py-3 font-medium text-slate-100 disabled:text-slate-500"
            >
              {list.isFetching ? 'Cargando…' : 'Cargar más'}
            </button>
          ) : null}
        </>
      ) : null}
    </Screen>
  )
}

/** «Alimentación · Supermercado» si tiene madre; si no, su nombre a secas. */
function categoryLabel(category: Category, byId: Map<number, Category>): string {
  const parent = category.parentId === null ? undefined : byId.get(category.parentId)
  return parent === undefined ? category.name : `${parent.name} · ${category.name}`
}

/**
 * Un movimiento en la lista. El título es la contraparte y, si no la hay, la
 * descripción: la Norma 43 deja `counterparty` a null siempre y lo mete todo en
 * `description` (ADR-010), y Revolut hace justo lo contrario (ADR-011), así que
 * quedarse con uno solo dejaría media app en blanco.
 */
function TransactionRow({
  transaction,
  category,
}: {
  transaction: Transaction
  category: Category | undefined
}) {
  const title = transaction.counterparty ?? transaction.description ?? 'Sin concepto'
  const charge = transaction.amountCents < 0

  return (
    <li>
      <Link to={`/movimientos/${transaction.id}`} className="flex min-h-16 items-center gap-3 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-slate-100">{title}</p>
          <p className="text-slate-500 text-xs">
            {formatDay(transaction.bookedAt)}
            {category === undefined ? ' · sin categorizar' : ` · ${category.name}`}
          </p>
        </div>
        <span
          className={`shrink-0 font-medium tabular-nums ${charge ? 'text-rose-400' : 'text-emerald-400'}`}
        >
          {formatMoney(transaction.amountCents, transaction.currency)}
        </span>
      </Link>
    </li>
  )
}

function EmptyState({ pending, hasFilters }: { pending: boolean; hasFilters: boolean }) {
  if (pending && !hasFilters) {
    // La bandeja vacía es una buena noticia, no un vacío que explicar.
    return <p className="text-emerald-400 text-sm">No queda nada por categorizar.</p>
  }

  return (
    <p className="text-slate-400 text-sm">
      {hasFilters
        ? 'Ningún movimiento cumple estos filtros.'
        : 'Todavía no hay movimientos. Empieza importando un extracto desde Ajustes.'}
    </p>
  )
}
