/**
 * Todos los datos de este fichero son inventados: ni cuentas, ni conceptos, ni
 * importes corresponden a nada real.
 */
import type { Account, Transaction } from '@finanzas/shared'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../test-utils'
import { PairTransferScreen } from './PairTransferScreen'

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
  amountCents: -5012,
  currency: 'EUR',
  counterparty: null,
  description: 'PAGO CON TARJETA',
  categoryId: null,
  categorySource: null,
  transferId: null,
  importId: 1,
}

const ABONO: Transaction = {
  ...CARGO,
  id: 11,
  accountId: 2,
  amountCents: 5000,
  counterparty: 'Recarga',
  description: null,
}

let fetchMock: ReturnType<typeof vi.fn>

function stubFetch() {
  fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    if (input.startsWith('/api/accounts')) {
      return Response.json({ accounts: [UNICAJA, REVOLUT] })
    }

    if ((init?.method ?? 'GET') === 'POST') {
      return Response.json(
        {
          id: 3,
          outTxnId: CARGO.id,
          inTxnId: ABONO.id,
          status: 'manual',
          matchedBy: [],
          createdAt: '2026-03-14T09:00:00.000Z',
          out: { ...CARGO, transferId: 3 },
          in: { ...ABONO, transferId: 3 },
        },
        { status: 201 },
      )
    }

    // El detalle, que es como llega la pata preseleccionada con `?con=`.
    if (/^\/api\/transactions\/\d+$/.test(input)) {
      const id = Number(input.split('/').pop())
      return Response.json(id === CARGO.id ? CARGO : ABONO)
    }

    return Response.json({ transactions: [CARGO, ABONO], total: 2, limit: 25, offset: 0 })
  })
  vi.stubGlobal('fetch', fetchMock)
}

/** El cuerpo de la única llamada de creación. */
function createdBody(): unknown {
  const call = fetchMock.mock.calls.find(
    ([input, init]) =>
      String(input) === '/api/transfers' && (init as RequestInit | undefined)?.method === 'POST',
  )
  return call === undefined ? undefined : JSON.parse(String((call[1] as RequestInit).body))
}

beforeEach(() => {
  stubFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PairTransferScreen', () => {
  it('empieza pidiendo el cargo y solo enseña movimientos que lo son', async () => {
    renderWithProviders(<PairTransferScreen />, {
      route: '/movimientos/transferencias/emparejar',
    })

    expect(await screen.findByRole('heading', { name: 'Elegir el cargo' })).toBeInTheDocument()
    expect(await screen.findByText('PAGO CON TARJETA')).toBeInTheDocument()
    // El abono no cabe en el hueco del cargo: el signo decide, no el usuario.
    expect(screen.queryByText('Recarga')).not.toBeInTheDocument()
  })

  it('empareja dos movimientos cuyos importes no cuadran', async () => {
    // Es el caso para el que existe esta pantalla: la heurística exige importes
    // opuestos exactos y una recarga con tarjeta rara vez los tiene.
    const user = userEvent.setup()
    renderWithProviders(<PairTransferScreen />, {
      route: '/movimientos/transferencias/emparejar',
    })

    await user.click(await screen.findByText('PAGO CON TARJETA'))
    await user.click(await screen.findByText('Recarga'))
    await user.click(screen.getByRole('button', { name: 'Emparejar los dos movimientos' }))

    await waitFor(() => expect(createdBody()).toEqual({ outTxnId: 10, inTxnId: 11 }))
    expect(await screen.findByText(/Emparejados\./)).toBeInTheDocument()
  })

  it('no deja emparejar hasta que están los dos huecos', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PairTransferScreen />, {
      route: '/movimientos/transferencias/emparejar',
    })

    const botón = await screen.findByRole('button', { name: 'Emparejar los dos movimientos' })
    expect(botón).toBeDisabled()

    await user.click(await screen.findByText('PAGO CON TARJETA'))
    expect(botón).toBeDisabled()
  })

  it('coloca sola la pata con la que se llega desde el detalle', async () => {
    renderWithProviders(<PairTransferScreen />, {
      route: '/movimientos/transferencias/emparejar?con=11',
    })

    // El abono llega puesto y el buscador pasa a pedir el cargo, que es lo que
    // falta: en qué hueco cae lo decide el signo, no la URL.
    expect(await screen.findByText(/50,00.*Recarga/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Elegir el cargo' })).toBeInTheDocument()
  })

  it('traduce el conflicto de la API en lugar de enseñar su texto a secas', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PairTransferScreen />, {
      route: '/movimientos/transferencias/emparejar',
    })

    await user.click(await screen.findByText('PAGO CON TARJETA'))
    await user.click(await screen.findByText('Recarga'))

    fetchMock.mockImplementation(async () =>
      Response.json(
        { error: { code: 'conflict', message: 'El movimiento 10 ya es parte de la 4' } },
        { status: 409 },
      ),
    )
    await user.click(screen.getByRole('button', { name: 'Emparejar los dos movimientos' }))

    const aviso = await screen.findByRole('alert')
    expect(aviso).toHaveTextContent('Esos dos movimientos no se pueden emparejar')
    expect(aviso).toHaveTextContent('El movimiento 10 ya es parte de la 4')
  })
})
