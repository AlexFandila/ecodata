/**
 * El dashboard: lo primero que se ve al abrir la app.
 *
 * Responde tres preguntas en este orden, que es el del pulgar: cuánto tengo,
 * dónde lo tengo, y en qué se me está yendo. Los saldos van arriba porque son la
 * pregunta que se hace todos los días; el mes y sus gráficos, debajo, porque son
 * la que se hace una vez por semana.
 *
 * Tres decisiones que no son cosméticas:
 *
 * - **El mes que se pinta sale de la respuesta, no de la barra de direcciones.**
 *   En la primera carga no se manda ninguno y lo elige el servidor, que es quien
 *   tiene el reloj de la base. Leerlo de `searchParams` dejaría la cabecera
 *   vacía justo en la carga más frecuente.
 * - **Los saldos no cambian al cambiar de mes.** Un saldo es un acumulado, no un
 *   flujo: solo se mueven el gasto y la evolución. Despista un segundo y es lo
 *   correcto.
 * - **Una divisa a la vez en los gráficos.** No hay tipos de cambio hasta la
 *   Fase 2, así que sumar euros con libras sería inventárselos; el selector
 *   aparece solo si de verdad hay más de una.
 */
import type { DashboardResponse } from '@finanzas/shared'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ApiError } from '../api/client'
import { dashboardQueryKey, fetchDashboard } from '../api/dashboard'
import { FlowBars } from '../components/charts/FlowBars'
import { SpendingBars } from '../components/charts/SpendingBars'
import { currentMonth, MonthNav } from '../components/MonthNav'
import { Notice } from '../components/Notice'
import { Screen } from '../components/Screen'
import { TabButton, TabStrip } from '../components/Tabs'
import { formatMoney } from '../format/money'

/** La ventana de la evolución. Seis barras caben a 390 px sin apretarse. */
const MONTHS = 6

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium text-slate-300 text-sm">{title}</h2>
      {children}
    </section>
  )
}

function TotalBalance({ totals }: { totals: DashboardResponse['totals'] }) {
  if (totals.length === 0) {
    return <p className="font-semibold text-3xl text-slate-100 tabular-nums">—</p>
  }

  return (
    <div className="flex flex-col gap-1">
      {totals.map((total, index) => (
        <p
          key={total.currency}
          className={
            // La divisa principal es la cifra con la que abre la pantalla; las
            // demás la acompañan sin competir con ella.
            index === 0
              ? 'font-semibold text-4xl text-slate-100 tabular-nums'
              : 'text-slate-400 text-lg tabular-nums'
          }
        >
          {formatMoney(total.amountCents, total.currency)}
        </p>
      ))}
    </div>
  )
}

function AccountList({ accounts }: { accounts: DashboardResponse['accounts'] }) {
  return (
    <ul className="flex flex-col gap-2">
      {accounts.map((account) => (
        <li
          key={account.accountId}
          className="flex items-baseline justify-between gap-3 rounded-xl bg-slate-800/60 px-4 py-3"
        >
          <span className="truncate text-slate-200 text-sm">{account.name}</span>
          <span className="flex shrink-0 flex-col items-end">
            {account.balances.map((balance, index) => (
              <span
                key={balance.currency}
                className={
                  index === 0
                    ? 'text-slate-100 tabular-nums'
                    : 'text-slate-400 text-xs tabular-nums'
                }
              >
                {formatMoney(balance.amountCents, balance.currency)}
              </span>
            ))}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function SummaryScreen() {
  const [params, setParams] = useSearchParams()
  // Vacío = «el que tú digas»: es como lo trata el resto de filtros de la app.
  const month = params.get('mes') ?? ''
  const selected = params.get('divisa') ?? ''

  const dashboard = useQuery({
    queryKey: dashboardQueryKey({ month, months: MONTHS }),
    queryFn: () => fetchDashboard({ month, months: MONTHS }),
    retry: false,
    // Cambiar de mes conserva lo anterior mientras llega lo nuevo: sin esto, la
    // pantalla entera parpadea en cada flecha.
    placeholderData: keepPreviousData,
  })

  function selectMonth(next: string) {
    const updated = new URLSearchParams(params)
    updated.set('mes', next)
    setParams(updated)
  }

  function selectCurrency(next: string) {
    const updated = new URLSearchParams(params)
    updated.set('divisa', next)
    setParams(updated)
  }

  function backToCurrentMonth() {
    const updated = new URLSearchParams(params)
    updated.delete('mes')
    setParams(updated)
  }

  if (dashboard.isPending) {
    return (
      <Screen title="Resumen">
        <p className="text-slate-400">Cargando el resumen…</p>
      </Screen>
    )
  }

  if (dashboard.error !== null) {
    const error = dashboard.error
    const isInvalidMonth = error instanceof ApiError && error.code === 'validation_error'

    return (
      <Screen title="Resumen">
        <Notice
          title={isInvalidMonth ? 'Ese mes no es válido' : 'No se ha podido cargar el resumen'}
          detail={error.message}
          hint={
            isInvalidMonth
              ? 'Comprueba la dirección: el mes va como 2026-08.'
              : '¿Está levantada la API?'
          }
        >
          {/* Sin esto, una dirección con un mes mal escrito deja la pantalla
              inservible y sin forma de salir que no sea editar la URL. */}
          {isInvalidMonth ? (
            <button
              type="button"
              onClick={backToCurrentMonth}
              className="mt-3 min-h-11 rounded-xl bg-slate-800 px-4 text-slate-100 text-sm"
            >
              Volver al mes actual
            </button>
          ) : null}
        </Notice>
      </Screen>
    )
  }

  const data = dashboard.data
  const currency = selected === '' ? data.currencies[0] : selected

  // Una instalación recién estrenada: sin cuentas no hay nada que resumir, y lo
  // útil no es un cero sino el camino para que deje de serlo.
  if (data.accounts.length === 0) {
    return (
      <Screen title="Resumen">
        <p className="text-slate-400 text-sm">
          Todavía no hay cuentas. Crea una y ya podrás importar tus extractos.
        </p>
        <Link
          to="/ajustes/cuentas/nueva"
          className="rounded-xl bg-emerald-500 px-4 py-3 text-center font-medium text-slate-950"
        >
          Crear una cuenta
        </Link>
      </Screen>
    )
  }

  const spending = data.spending.filter((row) => row.currency === currency)
  const evolution = data.evolution.filter((row) => row.currency === currency)
  const hasMovements = data.evolution.some((flow) => flow.incomeCents > 0 || flow.expenseCents > 0)

  return (
    <Screen title="Resumen">
      <Section title="Saldo total">
        <TotalBalance totals={data.totals} />
      </Section>

      <Section title="Por cuenta">
        <AccountList accounts={data.accounts} />
      </Section>

      {hasMovements ? null : (
        <p className="rounded-xl bg-slate-800/60 p-4 text-slate-400 text-sm">
          Aún no hay movimientos que resumir.{' '}
          <Link to="/ajustes/importar" className="text-emerald-400 underline">
            Importa un extracto
          </Link>{' '}
          para ver en qué se te va el mes.
        </p>
      )}

      <MonthNav month={data.month} onSelect={selectMonth} max={currentMonth()} />

      {data.currencies.length > 1 ? (
        <TabStrip label="Divisa">
          {data.currencies.map((code) => (
            <TabButton
              key={code}
              selected={code === currency}
              onSelect={() => selectCurrency(code)}
            >
              {code}
            </TabButton>
          ))}
        </TabStrip>
      ) : null}

      {currency === undefined ? null : (
        <>
          {/* «del mes» y no el nombre del mes: el selector está justo encima y
              repetirlo dos veces seguidas sobra en 390 px. */}
          <Section title="Gasto del mes">
            <SpendingBars spending={spending} currency={currency} />
          </Section>

          <Section title={`Evolución · ${MONTHS} meses`}>
            <FlowBars evolution={evolution} currency={currency} />
          </Section>
        </>
      )}
    </Screen>
  )
}
