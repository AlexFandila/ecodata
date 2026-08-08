import { Link } from 'react-router'
import { Screen } from '../components/Screen'

export function NotFoundScreen() {
  return (
    <Screen title="Aquí no hay nada">
      <p className="text-slate-400 text-sm">Esta dirección no corresponde a ninguna pantalla.</p>
      <Link to="/" className="text-emerald-400 underline">
        Volver al resumen
      </Link>
    </Screen>
  )
}
