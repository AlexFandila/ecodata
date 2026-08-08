import { Outlet } from 'react-router'
import { TabBar } from './TabBar'

/**
 * Marco común: contenido centrado a ancho de móvil y la barra de pestañas
 * debajo. El `padding-bottom` deja hueco para la barra, que es fija y si no
 * taparía el final de cada pantalla.
 */
export function AppLayout() {
  return (
    <div className="min-h-dvh pb-24">
      <main className="mx-auto max-w-md">
        <Outlet />
      </main>
      <TabBar />
    </div>
  )
}
