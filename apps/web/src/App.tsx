import { useQuery } from '@tanstack/react-query'
import { fetchHealth } from './api'

function EstadoApi() {
  const { data, isPending, error } = useQuery({
    queryKey: ['health'],
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

export function App() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-5 py-8">
      <h1 className="text-2xl font-semibold text-slate-100">Finanzas</h1>
      <p className="text-sm text-slate-400">
        Fase 0 en marcha: monorepo, tipos estrictos y fronteras de módulos.
      </p>
      <div className="rounded-xl bg-slate-800/60 p-4 text-sm">
        <EstadoApi />
      </div>
    </main>
  )
}
