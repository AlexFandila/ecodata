/**
 * Gasto del mes por categoría: barras horizontales y, debajo, la misma
 * información como lista.
 *
 * Las dos mitades salen del mismo componente a propósito. El SVG va
 * `aria-hidden` —un lector de pantalla no saca nada de una geometría— y la lista
 * es la que lleva los importes formateados, el desglose por subcategoría y el
 * enlace de la fila sin categorizar. No es una concesión a los tests: en 390 px
 * una etiqueta dentro de una barra no cabe, así que la lista es también lo que
 * de verdad se lee con el pulgar.
 *
 * Barras horizontales y no un donut: con categorías nominales lo que se compara
 * son longitudes, y ocho colores para decir lo que ya dice el largo de la barra
 * solo añaden una leyenda que descifrar. Un solo color, `sky`, porque aquí el
 * color no significa nada —`emerald` y `rose` están reservados al signo en toda
 * la app y usarlos aquí diría «esto es bueno» de una categoría de gasto—.
 */

import type { CategorySpending } from '@finanzas/shared'
import { Link } from 'react-router'
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { formatMoney } from '../../format/money'

/** El azul neutro de la app: magnitud, no signo. */
const BAR_COLOR = '#38bdf8'

/** Cuántas categorías caben antes de que la pantalla pida hacer scroll. */
const MAX_BARS = 8

const UNCATEGORIZED = 'Sin categorizar'

function labelOf(row: CategorySpending): string {
  return row.name ?? UNCATEGORIZED
}

export function SpendingBars({
  spending,
  currency,
}: {
  /** Ya filtrado por la divisa que se está pintando y ordenado de mayor a menor. */
  spending: readonly CategorySpending[]
  currency: string
}) {
  if (spending.length === 0) {
    return <p className="text-slate-400 text-sm">Sin gastos este mes.</p>
  }

  const visible = spending.slice(0, MAX_BARS)
  const total = spending.reduce((sum, row) => sum + row.amountCents, 0)

  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex items-baseline justify-between">
        <span className="text-slate-400 text-sm">Total</span>
        <span className="font-semibold text-lg text-slate-100 tabular-nums">
          {formatMoney(total, currency)}
        </span>
      </figcaption>

      <div aria-hidden="true" className="-mx-2">
        <ResponsiveContainer width="100%" height={Math.max(120, visible.length * 34)}>
          <BarChart data={[...visible]} layout="vertical" margin={{ left: 8, right: 8 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey={(row: CategorySpending) => labelOf(row)}
              width={96}
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Bar
              dataKey="amountCents"
              fill={BAR_COLOR}
              radius={[0, 4, 4, 0]}
              // Sin animación: una menos en el móvil, y los tests dejan de
              // depender de temporizadores.
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <ul className="flex flex-col gap-2">
        {spending.map((row) => (
          <li key={`${row.categoryId ?? 'none'}-${row.currency}`} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-slate-200 text-sm">
                {row.icon === null ? null : <span aria-hidden="true">{row.icon} </span>}
                {/* La fila sin categorizar es a la vez el mayor agujero del
                    resumen y el botón para taparlo. */}
                {row.categoryId === null ? (
                  <Link to="/movimientos?pendientes=true" className="text-amber-300 underline">
                    {UNCATEGORIZED}
                  </Link>
                ) : (
                  labelOf(row)
                )}
              </span>
              <span className="shrink-0 text-slate-100 text-sm tabular-nums">
                {formatMoney(row.amountCents, row.currency)}
              </span>
            </div>
            {row.children.length === 0 ? null : (
              <ul className="flex flex-col gap-0.5 pl-4">
                {row.children.map((child) => (
                  <li key={child.categoryId} className="flex justify-between gap-3 text-xs">
                    <span className="truncate text-slate-400">
                      {child.icon === null ? null : <span aria-hidden="true">{child.icon} </span>}
                      {child.name}
                    </span>
                    <span className="shrink-0 text-slate-400 tabular-nums">
                      {formatMoney(child.amountCents, row.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </figure>
  )
}
