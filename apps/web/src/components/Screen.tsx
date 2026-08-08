import type { ReactNode } from 'react'

/**
 * Cabecera y espaciado comunes a todas las pantallas, para que el título esté
 * siempre en el mismo sitio y no lo decida cada una por su cuenta.
 */
export function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5 px-5 pt-8 pb-4">
      <h1 className="font-semibold text-2xl text-slate-100">{title}</h1>
      {children}
    </section>
  )
}
