/**
 * Un campo de formulario: su etiqueta y su control, atados por el `id`.
 *
 * Atarlos es lo que hace que `getByLabelText` encuentre el control en los tests
 * y que pulsar la etiqueta enfoque el campo en el móvil, donde acertar con el
 * dedo en un `select` de 44 px no siempre sale a la primera. El `id` se pide
 * por parámetro —con `useId()` en quien lo usa— en vez de generarlo aquí,
 * porque el control es `children` y hay que poder ponérselo.
 */
import type { ReactNode } from 'react'

export function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-slate-400 text-sm">
        {label}
      </label>
      {children}
    </div>
  )
}

/** Las clases de un control: mismo alto táctil y mismo fondo en toda la app. */
export const CONTROL_CLASS = 'min-h-11 rounded-xl bg-slate-800 px-3 text-slate-100'
