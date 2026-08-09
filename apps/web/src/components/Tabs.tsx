/**
 * El control segmentado que reparte una pantalla en vistas: «Todos · Sin
 * categorizar · Transferencias» arriba de los movimientos, y «Sin revisar ·
 * Todas» dentro de la de transferencias.
 *
 * No es la `TabBar` de abajo: aquella es la navegación de la app y esto elige
 * qué se está mirando dentro de una sección.
 *
 * Hay dos tipos de pestaña porque hacen dos cosas distintas, y la diferencia
 * importa en el móvil: `TabButton` cambia un filtro de la pantalla en la que ya
 * estás y `TabLink` te lleva a otra ruta. Un enlace disfrazado de botón se
 * comería el «abrir en otra pestaña» y el botón atrás dejaría de deshacer lo
 * último que hiciste.
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router'

const TAB_CLASS =
  'flex min-h-11 flex-1 items-center justify-center rounded-lg px-3 text-center text-sm'

function classesFor(selected: boolean): string {
  return `${TAB_CLASS} ${selected ? 'bg-slate-700 font-medium text-slate-100' : 'text-slate-400'}`
}

export function TabStrip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex rounded-xl bg-slate-800/60 p-1" role="tablist" aria-label={label}>
      {children}
    </div>
  )
}

export function TabButton({
  selected,
  onSelect,
  children,
}: {
  selected: boolean
  onSelect: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={classesFor(selected)}
    >
      {children}
    </button>
  )
}

export function TabLink({
  to,
  selected,
  children,
}: {
  to: string
  selected: boolean
  children: ReactNode
}) {
  return (
    <Link to={to} role="tab" aria-selected={selected} className={classesFor(selected)}>
      {children}
    </Link>
  )
}
