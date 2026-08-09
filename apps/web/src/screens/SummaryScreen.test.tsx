/**
 * Todos los datos de este fichero son inventados: ni cuentas, ni categorías, ni
 * importes corresponden a nada real.
 *
 * Las aserciones van siempre contra la lista y la tabla accesibles, nunca contra
 * el SVG: es lo que lee un lector de pantalla y lo que se lee con el pulgar, y
 * el gráfico se monta de verdad —sin mock— para que un fallo suyo se vea aquí.
 */
import type { DashboardResponse, MonthFlow } from '@finanzas/shared'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../test-utils'
import { SummaryScreen } from './SummaryScreen'

const MONTHS = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']

function flows(month: string, incomeCents: number, expenseCents: number): MonthFlow {
  return { month, currency: 'EUR', incomeCents, expenseCents, netCents: incomeCents - expenseCents }
}

const DASHBOARD: DashboardResponse = {
  month: '2026-08',
  months: 6,
  currencies: ['EUR'],
  accounts: [
    {
      accountId: 1,
      name: 'Cuenta corriente',
      provider: 'unicaja',
      currency: 'EUR',
      balances: [{ currency: 'EUR', amountCents: 390_215 }],
    },
    {
      accountId: 2,
      name: 'Monedero',
      provider: 'revolut',
      currency: 'EUR',
      balances: [{ currency: 'EUR', amountCents: 41_065 }],
    },
  ],
  totals: [{ currency: 'EUR', amountCents: 431_280 }],
  spending: [
    {
      categoryId: 10,
      slug: 'housing',
      name: 'Vivienda',
      icon: '🏠',
      currency: 'EUR',
      amountCents: 85_000,
      children: [
        {
          categoryId: 11,
          slug: 'rent_mortgage',
          name: 'Alquiler o hipoteca',
          icon: '🔑',
          amountCents: 85_000,
        },
      ],
    },
    {
      categoryId: null,
      slug: null,
      name: null,
      icon: null,
      currency: 'EUR',
      amountCents: 4550,
      children: [],
    },
  ],
  evolution: [
    flows('2026-03', 0, 0),
    flows('2026-04', 0, 0),
    flows('2026-05', 210_000, 150_000),
    flows('2026-06', 210_000, 160_000),
    flows('2026-07', 210_000, 190_000),
    flows('2026-08', 210_000, 89_550),
  ],
}

const MULTIDIVISA: DashboardResponse = {
  ...DASHBOARD,
  currencies: ['EUR', 'GBP'],
  totals: [
    { currency: 'EUR', amountCents: 431_280 },
    { currency: 'GBP', amountCents: 21_540 },
  ],
  spending: [
    ...DASHBOARD.spending,
    {
      categoryId: 20,
      slug: 'leisure',
      name: 'Ocio',
      icon: '🎬',
      currency: 'GBP',
      amountCents: 3300,
      children: [],
    },
  ],
  evolution: [
    ...DASHBOARD.evolution,
    ...MONTHS.map(
      (month): MonthFlow => ({
        month,
        currency: 'GBP',
        incomeCents: 0,
        expenseCents: month === '2026-08' ? 3300 : 0,
        netCents: month === '2026-08' ? -3300 : 0,
      }),
    ),
  ],
}

let fetchMock: ReturnType<typeof vi.fn>

/** Simula la API devolviendo siempre el mismo resumen, con el mes que se pida. */
function stubFetch(dashboard: DashboardResponse = DASHBOARD) {
  fetchMock = vi.fn(async (input: string) => {
    const url = new URL(input, 'http://localhost')
    const month = url.searchParams.get('month')

    return Response.json(month === null ? dashboard : { ...dashboard, month })
  })
  vi.stubGlobal('fetch', fetchMock)
}

function stubError(status: number, code: string, message: string) {
  fetchMock = vi.fn(async () => Response.json({ error: { code, message } }, { status }))
  vi.stubGlobal('fetch', fetchMock)
}

/** Los meses pedidos a la API, en orden: es lo que prueba la navegación. */
function requestedMonths(): (string | null)[] {
  return fetchMock.mock.calls.map(([input]) =>
    new URL(String(input), 'http://localhost').searchParams.get('month'),
  )
}

beforeEach(() => {
  stubFetch()
  // Congelado: el tope de la flecha de avance sale del reloj del dispositivo.
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 9))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('SummaryScreen · saldos', () => {
  it('pinta el saldo total', async () => {
    renderWithProviders(<SummaryScreen />)

    expect(await screen.findByText(/4312,80/)).toBeInTheDocument()
  })

  it('pinta el saldo de cada cuenta', async () => {
    renderWithProviders(<SummaryScreen />)

    const cuenta = (await screen.findByText('Cuenta corriente')).closest('li')
    expect(cuenta).not.toBeNull()
    expect(within(cuenta as HTMLElement).getByText(/3902,15/)).toBeInTheDocument()

    const monedero = screen.getByText('Monedero').closest('li')
    expect(within(monedero as HTMLElement).getByText(/410,65/)).toBeInTheDocument()
  })

  it('en la primera carga no manda mes: lo elige el servidor', async () => {
    renderWithProviders(<SummaryScreen />)
    await screen.findByText(/4312,80/)

    expect(requestedMonths()).toEqual([null])
  })
})

describe('SummaryScreen · gasto del mes', () => {
  it('lista las categorías con su importe y su desglose', async () => {
    renderWithProviders(<SummaryScreen />)

    const vivienda = (await screen.findByText(/Vivienda/)).closest('li')
    expect(vivienda).not.toBeNull()
    expect(within(vivienda as HTMLElement).getByText(/Alquiler o hipoteca/)).toBeInTheDocument()
    // Dos veces el mismo importe: la madre y su única hija, que es correcto.
    expect(within(vivienda as HTMLElement).getAllByText(/850,00/)).toHaveLength(2)
  })

  it('«Sin categorizar» es una fila y lleva a la bandeja de pendientes', async () => {
    renderWithProviders(<SummaryScreen />)

    const enlace = await screen.findByRole('link', { name: 'Sin categorizar' })
    expect(enlace).toHaveAttribute('href', '/movimientos?pendientes=true')
  })

  it('el total del mes es la suma de las categorías y cuadra con la evolución', async () => {
    renderWithProviders(<SummaryScreen />)

    // 850,00 + 45,50 = 895,50, y ese mismo número es el gasto de agosto en la
    // tabla de evolución: los dos se ven a la vez y tienen que coincidir.
    await screen.findByText(/Vivienda/)
    expect(screen.getAllByText(/895,50/)).toHaveLength(2)
  })
})

describe('SummaryScreen · evolución', () => {
  it('la tabla trae los seis meses, con los vacíos a cero y no ausentes', async () => {
    renderWithProviders(<SummaryScreen />)

    const tabla = await screen.findByRole('table')
    const filas = within(tabla).getAllByRole('row')
    // Seis meses más la cabecera.
    expect(filas).toHaveLength(7)
    expect(within(tabla).getByRole('rowheader', { name: /marzo de 2026/i })).toBeInTheDocument()

    const marzo = within(tabla)
      .getByRole('rowheader', { name: /marzo de 2026/i })
      .closest('tr')
    expect(within(marzo as HTMLElement).getAllByText('0,00 €')).toHaveLength(3)
  })

  it('el gráfico va escondido del lector de pantalla y la tabla no', async () => {
    const { container } = renderWithProviders(<SummaryScreen />)
    const tabla = await screen.findByRole('table')

    // En jsdom no hay layout, así que el `ResponsiveContainer` mide 0 y no llega
    // a pintar el SVG. Lo que sí se comprueba —y es lo que importa— es que se
    // monta sin reventar (sin el stub de `ResizeObserver` esto lanzaría) y que
    // su hueco está fuera del árbol de accesibilidad mientras la tabla no.
    const escondido = container.querySelectorAll('[aria-hidden="true"]')
    expect(escondido.length).toBeGreaterThan(0)
    expect(tabla.closest('[aria-hidden="true"]')).toBeNull()
  })
})

describe('SummaryScreen · navegación de meses', () => {
  it('la flecha atrás pide el mes anterior', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SummaryScreen />)
    await screen.findByText(/4312,80/)

    await user.click(screen.getByRole('button', { name: 'Mes anterior' }))

    await waitFor(() => expect(requestedMonths()).toContain('2026-07'))
    expect(screen.getByRole('status')).toHaveTextContent(/julio de 2026/i)
  })

  it('la flecha de avance está deshabilitada en el mes en curso', async () => {
    renderWithProviders(<SummaryScreen />)
    await screen.findByText(/4312,80/)

    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled()
  })

  it('en un mes pasado sí se puede avanzar', async () => {
    renderWithProviders(<SummaryScreen />, { route: '/?mes=2026-05' })
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/mayo de 2026/i))

    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeEnabled()
  })

  it('el mes de la dirección es el que se pide', async () => {
    renderWithProviders(<SummaryScreen />, { route: '/?mes=2026-05' })
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/mayo de 2026/i))

    expect(requestedMonths()).toEqual(['2026-05'])
  })
})

describe('SummaryScreen · multidivisa', () => {
  beforeEach(() => {
    stubFetch(MULTIDIVISA)
  })

  it('enseña un total por divisa, sin sumarlos', async () => {
    renderWithProviders(<SummaryScreen />)

    expect(await screen.findByText(/4312,80/)).toBeInTheDocument()
    expect(screen.getByText(/215,40/)).toBeInTheDocument()
  })

  it('el selector de divisa cambia lo que pintan los gráficos', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SummaryScreen />)
    await screen.findByText(/Vivienda/)

    await user.click(screen.getByRole('tab', { name: 'GBP' }))

    expect(await screen.findByText(/Ocio/)).toBeInTheDocument()
    expect(screen.queryByText(/Vivienda/)).not.toBeInTheDocument()
  })

  it('con una sola divisa no hay selector que estorbe', async () => {
    stubFetch(DASHBOARD)
    renderWithProviders(<SummaryScreen />)
    await screen.findByText(/Vivienda/)

    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })
})

describe('SummaryScreen · estados', () => {
  it('avisa mientras carga', () => {
    renderWithProviders(<SummaryScreen />)

    expect(screen.getByText(/Cargando el resumen/)).toBeInTheDocument()
  })

  it('sin cuentas, ofrece crear una en vez de enseñar ceros', async () => {
    stubFetch({
      month: '2026-08',
      months: 6,
      currencies: [],
      accounts: [],
      totals: [],
      spending: [],
      evolution: [],
    })
    renderWithProviders(<SummaryScreen />)

    const enlace = await screen.findByRole('link', { name: 'Crear una cuenta' })
    expect(enlace).toHaveAttribute('href', '/ajustes/cuentas/nueva')
  })

  it('con cuentas pero sin movimientos, ofrece importar', async () => {
    stubFetch({
      ...DASHBOARD,
      spending: [],
      evolution: MONTHS.map((month) => flows(month, 0, 0)),
    })
    renderWithProviders(<SummaryScreen />)

    expect(await screen.findByRole('link', { name: /Importa un extracto/ })).toBeInTheDocument()
    // Los saldos siguen siendo verdad aunque no haya movimientos este mes.
    expect(screen.getByText(/4312,80/)).toBeInTheDocument()
  })

  it('un error de la API se anuncia como alerta', async () => {
    stubError(500, 'internal_error', 'Error interno')
    renderWithProviders(<SummaryScreen />)

    const alerta = await screen.findByRole('alert')
    expect(within(alerta).getByText(/No se ha podido cargar/)).toBeInTheDocument()
  })

  it('un mes inválido ofrece volver al mes actual, y volver lo arregla', async () => {
    const user = userEvent.setup()
    stubError(400, 'validation_error', 'Los parámetros del resumen no son válidos')
    renderWithProviders(<SummaryScreen />, { route: '/?mes=2026-13' })

    await screen.findByRole('alert')
    const volver = screen.getByRole('button', { name: 'Volver al mes actual' })

    stubFetch()
    await user.click(volver)

    expect(await screen.findByText(/4312,80/)).toBeInTheDocument()
  })
})
