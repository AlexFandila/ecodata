/**
 * Todos los datos de este fichero son inventados: ni cuentas, ni conceptos, ni
 * importes corresponden a nada real.
 */
import type { Account, Transaction, TransferWithLegs } from '@finanzas/shared'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../test-utils'
import { TransfersScreen } from './TransfersScreen'

const UNICAJA: Account = {
  id: 1,
  name: 'Cuenta corriente',
  provider: 'unicaja',
  type: 'checking',
  currency: 'EUR',
  iban: null,
  isOwn: true,
  openingBalanceCents: 0,
  createdAt: '2026-03-01T00:00:00.000Z',
}

const REVOLUT: Account = { ...UNICAJA, id: 2, name: 'Monedero', provider: 'revolut', type: 'card' }

const CARGO: Transaction = {
  id: 10,
  accountId: 1,
  bookedAt: '2026-03-12',
  valueDate: null,
  amountCents: -20_000,
  currency: 'EUR',
  counterparty: null,
  description: 'TRANSF A MONEDERO',
  categoryId: 3,
  categorySource: 'transfer',
  transferId: 7,
  importId: 1,
}

const ABONO: Transaction = {
  ...CARGO,
  id: 11,
  accountId: 2,
  amountCents: 20_000,
  counterparty: 'Titular Ejemplo',
  description: 'Ingreso',
}

const AUTOMATICA: TransferWithLegs = {
  id: 7,
  outTxnId: 10,
  inTxnId: 11,
  status: 'auto',
  matchedBy: ['other_provider_named', 'close_dates'],
  createdAt: '2026-03-13T08:00:00.000Z',
  out: CARGO,
  in: ABONO,
}

const MANUAL: TransferWithLegs = {
  ...AUTOMATICA,
  id: 8,
  status: 'manual',
  matchedBy: [],
}

let fetchMock: ReturnType<typeof vi.fn>

/**
 * Simula la API. `transfers` es lo que devuelve el listado; las llamadas de
 * escritura contestan lo que la pantalla necesita para refrescar.
 */
function stubFetch(transfers: readonly TransferWithLegs[] = [AUTOMATICA]) {
  fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    if (input.startsWith('/api/accounts')) {
      return Response.json({ accounts: [UNICAJA, REVOLUT] })
    }

    if (input.startsWith('/api/transfers/match')) {
      return Response.json({ created: 1, unresolved: 2 })
    }

    const method = init?.method ?? 'GET'
    if (method === 'PATCH') {
      return Response.json({ ...AUTOMATICA, status: 'confirmed' })
    }
    if (method === 'DELETE') {
      return Response.json({
        transactions: [
          { ...CARGO, transferId: null, categoryId: null, categorySource: null },
          { ...ABONO, transferId: null, categoryId: null, categorySource: null },
        ],
      })
    }

    const url = new URL(input, 'http://localhost')
    const status = url.searchParams.get('status')
    const rows = status === null ? transfers : transfers.filter((row) => row.status === status)
    const limit = Number(url.searchParams.get('limit') ?? '50')

    return Response.json({ transfers: rows.slice(0, limit), total: rows.length, limit, offset: 0 })
  })
  vi.stubGlobal('fetch', fetchMock)
}

/** Las llamadas de escritura, que es lo que distingue confirmar de deshacer. */
function callsWith(method: string): string[] {
  return fetchMock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === method)
    .map(([input]) => String(input))
}

beforeEach(() => {
  stubFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TransfersScreen · la lista', () => {
  it('pinta las dos patas con su cuenta y su importe', async () => {
    renderWithProviders(<TransfersScreen />, { route: '/movimientos/transferencias' })

    const tarjeta = (await screen.findByText('Cuenta corriente')).closest('li')
    expect(tarjeta).not.toBeNull()
    expect(within(tarjeta as HTMLElement).getByText('Monedero')).toBeInTheDocument()
    expect(within(tarjeta as HTMLElement).getByText(/-200,00/)).toBeInTheDocument()
    expect(within(tarjeta as HTMLElement).getByText(/^200,00/)).toBeInTheDocument()
  })

  it('explica por qué se emparejaron, que es lo que permite decidir', async () => {
    renderWithProviders(<TransfersScreen />, { route: '/movimientos/transferencias' })

    expect(
      await screen.findByText(
        /una nombra a la cuenta de la otra, las fechas se llevan un día o menos/,
      ),
    ).toBeInTheDocument()
  })

  it('cada pata lleva al detalle de su movimiento', async () => {
    renderWithProviders(<TransfersScreen />, { route: '/movimientos/transferencias' })

    const enlace = (await screen.findByText('Cuenta corriente')).closest('a')
    expect(enlace).toHaveAttribute('href', '/movimientos/10')
  })

  it('por defecto solo enseña las que faltan por revisar', async () => {
    renderWithProviders(<TransfersScreen />, { route: '/movimientos/transferencias' })

    await screen.findByText('Sin revisar', { selector: 'span' })
    const listado = fetchMock.mock.calls
      .map(([input]) => String(input))
      .filter((url) => url.startsWith('/api/transfers?'))
    expect(listado.some((url) => url.includes('status=auto'))).toBe(true)
  })

  it('la bandeja vacía es una buena noticia, no un hueco que explicar', async () => {
    stubFetch([])
    renderWithProviders(<TransfersScreen />, { route: '/movimientos/transferencias' })

    expect(
      await screen.findByText('No queda ninguna transferencia por revisar.'),
    ).toBeInTheDocument()
  })
})

describe('TransfersScreen · confirmar y deshacer', () => {
  it('confirma la transferencia emparejada por la heurística', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TransfersScreen />, { route: '/movimientos/transferencias' })

    await user.click(await screen.findByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(callsWith('PATCH')).toEqual(['/api/transfers/7/status']))
  })

  it('deshacer es un DELETE: rechazar no es un estado más', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TransfersScreen />, { route: '/movimientos/transferencias' })

    await user.click(await screen.findByRole('button', { name: 'Deshacer' }))

    await waitFor(() => expect(callsWith('DELETE')).toEqual(['/api/transfers/7']))
  })

  it('una manual no ofrece confirmar: no la emparejó ninguna heurística', async () => {
    stubFetch([MANUAL])
    renderWithProviders(<TransfersScreen />, { route: '/movimientos/transferencias?estado=todas' })

    expect(await screen.findByText('Emparejada a mano')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Deshacer' })).toBeInTheDocument()
  })

  it('avisa si la API rechaza la confirmación', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TransfersScreen />, { route: '/movimientos/transferencias' })
    await screen.findByRole('button', { name: 'Confirmar' })

    fetchMock.mockImplementation(async () =>
      Response.json(
        { error: { code: 'not_found', message: 'No existe la transferencia 7' } },
        {
          status: 404,
        },
      ),
    )
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se ha podido confirmar')
  })
})

describe('TransfersScreen · volver a buscar', () => {
  it('cuenta lo emparejado y avisa de los empates que quedan a mano', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TransfersScreen />, { route: '/movimientos/transferencias' })

    await user.click(await screen.findByRole('button', { name: 'Buscar transferencias' }))

    expect(await screen.findByText('1 transferencia nueva.')).toBeInTheDocument()
    expect(screen.getByText(/2 movimientos tenían/)).toBeInTheDocument()
  })
})

describe('TransfersScreen · emparejar a mano', () => {
  it('lleva a la pantalla de emparejado', async () => {
    renderWithProviders(<TransfersScreen />, { route: '/movimientos/transferencias' })

    const enlace = await screen.findByRole('link', {
      name: 'Emparejar dos movimientos a mano',
    })
    expect(enlace).toHaveAttribute('href', '/movimientos/transferencias/emparejar')
  })
})
