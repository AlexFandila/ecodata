import { Screen } from '../components/Screen'

/** Provisional: la lista con filtros y la bandeja "sin categorizar" son su tarea. */
export function TransactionsScreen() {
  return (
    <Screen title="Movimientos">
      <p className="text-slate-400 text-sm">
        La lista de movimientos y la bandeja de pendientes llegan con su propia tarea.
      </p>
    </Screen>
  )
}
