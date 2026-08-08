/**
 * Barra de pestañas inferior (ARCHITECTURE.md: "navegación inferior de 4-5
 * pestañas"). Van cuatro: *Aprender* es de la Fase 5 y una pestaña que no lleva
 * a ningún sitio es ruido.
 *
 * Fija abajo porque la app se usa con el pulgar, con `env(safe-area-inset-bottom)`
 * para no quedar debajo de la barra de gestos del móvil, y con objetivos táctiles
 * de 44 px, que es el mínimo por debajo del cual se falla al pulsar.
 */
import { NavLink } from 'react-router'

type Tab = {
  readonly to: string
  readonly label: string
  /** Trazo del icono, sobre una caja de 24×24. */
  readonly icon: string
}

const TABS: readonly Tab[] = [
  { to: '/', label: 'Resumen', icon: 'M3 12l9-8 9 8M5 10v10h14V10' },
  { to: '/movimientos', label: 'Movimientos', icon: 'M4 7h16M4 12h16M4 17h10' },
  { to: '/objetivos', label: 'Objetivos', icon: 'M12 21V8m0 0l6-3v6l-6 3M5 21V4' },
  {
    to: '/ajustes',
    label: 'Ajustes',
    icon: 'M12 15a3 3 0 100-6 3 3 0 000 6zM4 12h2m12 0h2M12 4v2m0 12v2',
  },
]

export function TabBar() {
  return (
    <nav
      aria-label="Secciones"
      className="fixed inset-x-0 bottom-0 border-slate-800 border-t bg-slate-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-md">
        {TABS.map((tab) => (
          <li key={tab.to} className="flex-1">
            <NavLink
              to={tab.to}
              // `end` solo en la raíz: sin él, "/" quedaría activa en todas las
              // rutas, que es como no tener indicador.
              end={tab.to === '/'}
              className={({ isActive }) =>
                `flex min-h-11 flex-col items-center gap-1 py-2 text-xs ${
                  isActive ? 'text-emerald-400' : 'text-slate-400'
                }`
              }
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={tab.icon} />
              </svg>
              {tab.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
