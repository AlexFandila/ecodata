import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { fetchHealth, healthQueryKey } from '../api/health'
import { Screen } from '../components/Screen'

function ApiStatus() {
  const { data, isPending, error } = useQuery({
    queryKey: healthQueryKey,
    queryFn: fetchHealth,
    retry: false,
  })

  if (isPending) {
    return <p className="text-slate-400">Conectando con la API…</p>
  }

  if (error) {
    return (
      <p className="text-rose-400">Sin conexión con la API. ¿Está levantada? ({error.message})</p>
    )
  }

  return <p className="text-emerald-400">API disponible · núcleo v{data.version}</p>
}

/** Provisional hasta la tarea del dashboard: saldos, gasto del mes y evolución. */
export function SummaryScreen() {
  return (
    <Screen title="Resumen">
      <p className="text-slate-400 text-sm">
        El dashboard llega con su propia tarea. Mientras tanto, ya se pueden importar extractos.
      </p>
      <Link
        to="/ajustes/importar"
        className="rounded-xl bg-emerald-500 px-4 py-3 text-center font-medium text-slate-950"
      >
        Importar un extracto
      </Link>
      <div className="rounded-xl bg-slate-800/60 p-4 text-sm">
        <ApiStatus />
      </div>
    </Screen>
  )
}
