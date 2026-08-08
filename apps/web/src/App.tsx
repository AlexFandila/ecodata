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
import { SettingsScreen } from './screens/SettingsScreen'
import { SummaryScreen } from './screens/SummaryScreen'
import { TransactionsScreen } from './screens/TransactionsScreen'

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<SummaryScreen />} />
        <Route path="movimientos" element={<TransactionsScreen />} />
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
