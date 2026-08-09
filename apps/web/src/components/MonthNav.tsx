/**
 * `‹ agosto de 2026 ›`: el selector de mes del dashboard.
 *
 * Es la única aritmética de fechas de toda la web. `packages/core` ya tiene
 * `addMonths` con sus tests, pero `apps/web` no puede importarlo (regla
 * `web-only-shared`), y es la misma duplicación consciente que la de
 * `format/money.ts`: cuatro líneas aquí frente a mudar `dates` a `shared`, que
 * ADR-009 avisa que exigiría revisar `shared-is-leaf` y su propio ADR.
 *
 * La suma va sobre el índice de mes absoluto y no sobre un `Date`: `setMonth`
 * desborda el 31 de enero a marzo, y aquí eso saltaría un mes entero de la
 * navegación.
 */

import { formatMonth } from '../format/date'

const ISO_MONTH = /^(\d{4})-(\d{2})$/

/** `shiftMonth('2026-12', 1)` → `'2027-01'`. Devuelve el mismo si no es un mes. */
export function shiftMonth(month: string, delta: number): string {
  const parts = ISO_MONTH.exec(month)
  if (parts === null) return month

  const index = Number(parts[1]) * 12 + (Number(parts[2]) - 1) + delta
  const year = Math.floor(index / 12)
  const monthNumber = (index % 12) + 1

  return `${String(year).padStart(4, '0')}-${String(monthNumber).padStart(2, '0')}`
}

/**
 * El mes en curso según el reloj **del dispositivo**, y solo para saber hasta
 * dónde se puede avanzar.
 *
 * Qué mes se agrega lo decide siempre el servidor —viene en la respuesta—; esto
 * es una ayuda de la interfaz, así que un móvil con la hora mal puesta como
 * mucho deshabilita la flecha un mes antes o después, nunca enseña datos de otro
 * mes.
 */
export function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

const ARROW_CLASS =
  'flex size-11 items-center justify-center rounded-xl text-slate-300 disabled:text-slate-700'

function Arrow({ d }: { d: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  )
}

export function MonthNav({
  month,
  onSelect,
  max,
}: {
  month: string
  onSelect: (month: string) => void
  /** Último mes navegable. Más allá solo hay meses vacíos: un callejón sin salida. */
  max: string
}) {
  const canGoForward = month < max

  return (
    <div className="flex items-center justify-between rounded-xl bg-slate-800/60 px-1 py-1">
      <button
        type="button"
        className={ARROW_CLASS}
        onClick={() => onSelect(shiftMonth(month, -1))}
        aria-label="Mes anterior"
      >
        <Arrow d="M15 5l-7 7 7 7" />
      </button>
      {/* `role="status"`: al cambiar de mes con el lector de pantalla, lo que hay
          que anunciar es el mes nuevo, no que se ha pulsado un botón. */}
      <p role="status" className="font-medium text-slate-100 text-sm first-letter:uppercase">
        {formatMonth(month)}
      </p>
      <button
        type="button"
        className={ARROW_CLASS}
        onClick={() => onSelect(shiftMonth(month, 1))}
        disabled={!canGoForward}
        aria-label="Mes siguiente"
      >
        <Arrow d="M9 5l7 7-7 7" />
      </button>
    </div>
  )
}
