import { Link } from 'react-router'
import { Screen } from '../components/Screen'

const OPTIONS = [
  {
    to: '/ajustes/importar',
    label: 'Importar extracto',
    hint: 'Cuaderno 43 de Unicaja o CSV de Revolut',
  },
  { to: '/ajustes/cuentas/nueva', label: 'Nueva cuenta', hint: 'Dar de alta una cuenta o tarjeta' },
] as const

export function SettingsScreen() {
  return (
    <Screen title="Ajustes">
      <ul className="flex flex-col gap-3">
        {OPTIONS.map((option) => (
          <li key={option.to}>
            <Link
              to={option.to}
              className="flex min-h-14 flex-col justify-center rounded-xl bg-slate-800/60 px-4 py-3"
            >
              <span className="text-slate-100">{option.label}</span>
              <span className="text-slate-400 text-xs">{option.hint}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Screen>
  )
}
