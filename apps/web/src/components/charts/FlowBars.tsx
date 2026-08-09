/**
 * Evolución de ingresos y gastos: columnas agrupadas y, debajo, la misma serie
 * como tabla.
 *
 * Mismo criterio que en `SpendingBars`: el SVG va `aria-hidden` y la tabla es lo
 * que se lee. Aquí además la tabla hace el trabajo que en escritorio haría un
 * tooltip —en una pantalla táctil no hay hover—, así que `<Tooltip>` de recharts
 * se omite a conciencia en vez de por olvido.
 *
 * `emerald` y `rose` no son una paleta categórica: son los dos colores con los
 * que la app pinta el signo en todo el listado de movimientos, y aquí significan
 * lo mismo. La leyenda va en HTML fuera del SVG para que la identidad de cada
 * serie no dependa solo del color ni quede sepultada bajo el `aria-hidden`.
 */

import type { MonthFlow } from '@finanzas/shared'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis } from 'recharts'
import { formatMonth, formatMonthShort } from '../../format/date'
import { formatMoney } from '../../format/money'

const INCOME_COLOR = '#34d399'
const EXPENSE_COLOR = '#fb7185'

function LegendDot({ color, children }: { color: string; children: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true" className="size-2 rounded-full" style={{ background: color }} />
      {children}
    </span>
  )
}

export function FlowBars({
  evolution,
  currency,
}: {
  /** Ya filtrada por la divisa que se pinta, en orden ascendente y sin huecos. */
  evolution: readonly MonthFlow[]
  currency: string
}) {
  if (evolution.length === 0) {
    return <p className="text-slate-400 text-sm">Todavía no hay meses que comparar.</p>
  }

  const data = evolution.map((flow) => ({ ...flow, label: formatMonthShort(flow.month) }))

  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex justify-end gap-4 text-slate-400 text-xs">
        <LegendDot color={INCOME_COLOR}>Ingresos</LegendDot>
        <LegendDot color={EXPENSE_COLOR}>Gastos</LegendDot>
      </figcaption>

      <div aria-hidden="true" className="-mx-2">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} barGap={2} margin={{ left: 8, right: 8, top: 4 }}>
            {/* Horizontal y sólida: una rejilla discontinua compite con las barras. */}
            <CartesianGrid stroke="#1e293b" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Bar
              dataKey="incomeCents"
              fill={INCOME_COLOR}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
            <Bar
              dataKey="expenseCents"
              fill={EXPENSE_COLOR}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <table className="w-full text-sm">
        <caption className="sr-only">Ingresos, gastos y saldo de cada mes</caption>
        <thead>
          <tr className="text-slate-400 text-xs">
            <th scope="col" className="py-1 text-left font-normal">
              Mes
            </th>
            <th scope="col" className="py-1 text-right font-normal">
              Ingresos
            </th>
            <th scope="col" className="py-1 text-right font-normal">
              Gastos
            </th>
            <th scope="col" className="py-1 text-right font-normal">
              Neto
            </th>
          </tr>
        </thead>
        <tbody>
          {evolution.map((flow) => (
            <tr key={flow.month} className="border-slate-800 border-t">
              <th
                scope="row"
                className="py-1.5 text-left font-normal text-slate-300 first-letter:uppercase"
              >
                {formatMonth(flow.month)}
              </th>
              <td className="py-1.5 text-right text-emerald-400 tabular-nums">
                {formatMoney(flow.incomeCents, currency)}
              </td>
              <td className="py-1.5 text-right text-rose-400 tabular-nums">
                {formatMoney(flow.expenseCents, currency)}
              </td>
              <td
                className={`py-1.5 text-right tabular-nums ${
                  flow.netCents < 0 ? 'text-rose-300' : 'text-slate-100'
                }`}
              >
                {formatMoney(flow.netCents, currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
