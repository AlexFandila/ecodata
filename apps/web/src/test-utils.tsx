/**
 * Render con los proveedores que la app monta en `main.tsx`.
 *
 * Un `QueryClient` nuevo por test: compartirlo dejaría la caché de un test
 * dentro del siguiente. Y `retry: false`, porque un test que espera un error no
 * debe esperar tres reintentos antes de verlo.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type RenderResult, render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'

export function renderWithProviders(ui: ReactElement, { route = '/' } = {}): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}
