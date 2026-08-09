/**
 * Mapa de rutas. Las direcciones van en español porque el usuario las ve; los
 * identificadores y los ficheros, en inglés (CLAUDE.md).
 */
import { Route, Routes } from 'react-router'
import { AppLayout } from './components/AppLayout'
import { GoalsScreen } from './screens/GoalsScreen'
import { ImportScreen } from './screens/ImportScreen'
import { NewAccountScreen } from './screens/NewAccountScreen'
import { NotFoundScreen } from './screens/NotFoundScreen'
import { PairTransferScreen } from './screens/PairTransferScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { SummaryScreen } from './screens/SummaryScreen'
import { TransactionScreen } from './screens/TransactionScreen'
import { TransactionsScreen } from './screens/TransactionsScreen'
import { TransfersScreen } from './screens/TransfersScreen'

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<SummaryScreen />} />
        <Route path="movimientos">
          <Route index element={<TransactionsScreen />} />
          {/* Antes que `:id`: una ruta estática gana a una con parámetro en el
              ranking del router, pero declararla aquí lo deja también a la vista. */}
          <Route path="transferencias">
            <Route index element={<TransfersScreen />} />
            <Route path="emparejar" element={<PairTransferScreen />} />
          </Route>
          <Route path=":id" element={<TransactionScreen />} />
        </Route>
        <Route path="objetivos" element={<GoalsScreen />} />
        <Route path="ajustes">
          <Route index element={<SettingsScreen />} />
          <Route path="importar" element={<ImportScreen />} />
          <Route path="cuentas/nueva" element={<NewAccountScreen />} />
        </Route>
        <Route path="*" element={<NotFoundScreen />} />
      </Route>
    </Routes>
  )
}
