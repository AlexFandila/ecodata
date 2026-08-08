/**
 * El aviso de error de una pantalla.
 *
 * Estaba copiado en la de importación y en la de alta de cuenta; con la tercera
 * copia a punto de escribirse, se extrae. `role="alert"` no es decorativo: es
 * lo que hace que un lector de pantalla anuncie el fallo sin que el usuario
 * tenga que ir a buscarlo, y es también por lo que preguntan los tests.
 *
 * `detail` es el `message` de la API, que está escrito para leerse; `hint` es
 * lo que la pantalla sabe y la API no —qué hacer a continuación—.
 */
import type { ReactNode } from 'react'

export function Notice({
  title,
  detail,
  hint,
  children,
}: {
  title: string
  detail?: string
  hint?: string
  children?: ReactNode
}) {
  return (
    <div role="alert" className="rounded-xl bg-rose-950/60 p-4 text-rose-200 text-sm">
      <p className="font-medium">{title}</p>
      {detail === undefined ? null : <p className="mt-1 text-rose-300/90">{detail}</p>}
      {hint === undefined ? null : <p className="mt-2 text-rose-300/70 text-xs">{hint}</p>}
      {children}
    </div>
  )
}

/**
 * Los `details` de un `validation_error`, que señalan el campo concreto. Van
 * como componente aparte porque no todos los errores los traen.
 */
export function NoticeDetails({
  details,
}: {
  details: readonly { path: string; message: string }[]
}) {
  if (details.length === 0) return null

  return (
    <ul className="mt-2 flex flex-col gap-1 text-xs">
      {details.map((detail) => (
        <li key={detail.path}>
          {detail.path}: {detail.message}
        </li>
      ))}
    </ul>
  )
}
