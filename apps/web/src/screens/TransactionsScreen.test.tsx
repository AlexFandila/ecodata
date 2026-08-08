/**
 * Todos los datos de este fichero son inventados: ni cuentas, ni comercios, ni
 * importes corresponden a nada real.
 */
import type { Account, Category, Transaction } from '@finanzas/shared'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../test-utils'
import { TransactionsScreen } from './TransactionsScreen'

const CUENTA: Account = {
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

const SUPERMERCADO: Category = {
  id: 5,
  slug: 'groceries',
  name: 'Supermercado',
  kind: 'expense',
  parentId: null,
  icon: null,
}

const COMPRA: Transaction = {
  id: 10,
  accountId: 1,
  bookedAt: '2026-03-12',
  valueDate: null,
  amountCents: -4230,
  currency: 'EUR',
  counterparty: 'SUPERMERCADO EJEMPLO',
  description: 'Compra semanal',
  categoryId: 5,
  categorySource: 'rule',
  transferId: null,
  importId: 1,
}

const BIZUM: Transaction = {
  ...COMPRA,
  id: 11,
  bookedAt: '2026-03-11',
  amountCents: -1500,
  counterparty: null,
  description: 'BIZUM ENVIADO',
  categoryId: null,
  categorySource: null,
}

let fetchMock: ReturnType<typeof vi.fn>

/**
 * Simula la API entera: devuelve los movimientos que le pasen y responde a las
 * cuentas y las categorías, que la pantalla pide para los desplegables.
 */
function stubFetch(transactions: readonly Transaction[], total = transactions.length) {
  fetchMock = vi.fn(async (input: string) => {
    if (input.startsWith('/api/accounts')) return Response.json({ accounts: [CUENTA] })
    if (input.startsWith('/api/categories')) return Response.json({ categories: [SUPERMERCADO] })

    const url = new URL(input, 'http://localhost')
    const limit = Number(url.searchParams.get('limit') ?? '50')
    const offset = Number(url.searchParams.get('offset') ?? '0')
    const pending = url.searchParams.get('uncategorized') === 'true'
    const rows = pending ? transactions.filter((t) => t.categoryId === null) : transactions

    return Response.json({
      transactions: rows.slice(offset, offset + limit),
      total: pending ? rows.length : total,
      limit,
      offset,
    })
  })
  vi.stubGlobal('fetch', fetchMock)
}

/** Las URLs con las que la pantalla ha llamado a `/transactions`. */
function listCalls(): string[] {
  return fetchMock.mock.calls
    .map(([input]) => String(input))
    .filter((url) => url.startsWith('/api/transactions'))
}

beforeEach(() => {
  stubFetch([COMPRA, BIZUM])
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TransactionsScreen · la lista', () => {
  it('pinta cada movimiento con su fecha, su importe y su categoría', async () => {
    renderWithProviders(<TransactionsScreen />, { route: '/movimientos' })

    const fila = (await screen.findByText('SUPERMERCADO EJEMPLO')).closest('li')
    expect(fila).not.toBeNull()
    // El importe pasa por el formateador propio de la web, no por core.
    expect(within(fila as HTMLElement).getByText(/42,30/)).toBeInTheDocument()
    expect(within(fila as HTMLElement).getByText(/12 mar · Supermercado/)).toBeInTheDocument()
  })

  it('titula con la descripción cuando la fuente no llenó la contraparte', async () => {
    // La Norma 43 deja `counterparty` a null siempre (ADR-010): quedarse solo
    // con ella dejaría media lista en blanco.
    renderWithProviders(<TransactionsScreen />, { route: '/movimientos' })

    expect(await screen.findByText('BIZUM ENVIADO')).toBeInTheDocument()
  })

  it('cada fila lleva al detalle del movimiento', async () => {
    renderWithProviders(<TransactionsScreen />, { route: '/movimientos' })

    const enlace = (await screen.findByText('SUPERMERCADO EJEMPLO')).closest('a')
    expect(enlace).toHaveAttribute('href', '/movimientos/10')
  })

  it('avisa cuando no hay nada, sin confundir "sin datos" con "sin resultados"', async () => {
    stubFetch([])
    renderWithProviders(<TransactionsScreen />, { route: '/movimientos' })

    expect(await screen.findByText(/Todavía no hay movimientos/)).toBeInTheDocument()
  })
})

describe('TransactionsScreen · la bandeja de pendientes', () => {
  it('enseña el contador sin pedir la lista entera', async () => {
    renderWithProviders(<TransactionsScreen />, { route: '/movimientos' })

    // El contador sale del `total` de una consulta con `limit=1`.
    expect(await screen.findByRole('tab', { name: 'Sin categorizar (1)' })).toBeInTheDocument()
    expect(listCalls().some((url) => url.includes('uncategorized=true&limit=1'))).toBe(true)
  })

  it('al pulsarla, pide solo los movimientos sin categoría', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TransactionsScreen />, { route: '/movimientos' })

    await user.click(await screen.findByRole('tab', { name: /Sin categorizar/ }))

    await waitFor(() => {
      expect(screen.queryByText('SUPERMERCADO EJEMPLO')).not.toBeInTheDocument()
    })
    expect(screen.getByText('BIZUM ENVIADO')).toBeInTheDocument()
  })

  it('la bandeja vacía es una buena noticia, no un error', async () => {
    stubFetch([COMPRA])
    const user = userEvent.setup()
    renderWithProviders(<TransactionsScreen />, { route: '/movimientos' })

    await user.click(await screen.findByRole('tab', { name: /Sin categorizar/ }))

    expect(await screen.findByText('No queda nada por categorizar.')).toBeInTheDocument()
  })
})

describe('TransactionsScreen · los filtros', () => {
  it('los lee de la barra de direcciones y los manda a la API', async () => {
    renderWithProviders(<TransactionsScreen />, {
      route: '/movimientos?cuenta=1&desde=2026-03-01&hasta=2026-03-31&buscar=super',
    })

    await screen.findByText('SUPERMERCADO EJEMPLO')

    const url = listCalls().find((call) => call.includes('search='))
    expect(url).toContain('accountId=1')
    expect(url).toContain('from=2026-03-01')
    expect(url).toContain('to=2026-03-31')
    expect(url).toContain('search=super')
  })

  it('un filtro escrito viaja a la query string, para que atrás lo deshaga', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TransactionsScreen />, { route: '/movimientos' })

    await user.click(await screen.findByRole('button', { name: 'Filtros' }))
    await user.type(screen.getByLabelText('Buscar'), 'farmacia')

    await waitFor(() => {
      expect(listCalls().some((url) => url.includes('search=farmacia'))).toBe(true)
    })
  })

  it('un filtro vacío no se manda: la API lo rechazaría', async () => {
    renderWithProviders(<TransactionsScreen />, { route: '/movimientos' })

    await screen.findByText('SUPERMERCADO EJEMPLO')

    for (const url of listCalls()) {
      expect(url).not.toMatch(/accountId=(&|$)/)
      expect(url).not.toMatch(/search=(&|$)/)
    }
  })

  it('distingue "no hay nada" de "nada cumple estos filtros"', async () => {
    stubFetch([])
    renderWithProviders(<TransactionsScreen />, { route: '/movimientos?buscar=inexistente' })

    expect(await screen.findByText('Ningún movimiento cumple estos filtros.')).toBeInTheDocument()
  })
})

describe('TransactionsScreen · la paginación', () => {
  const muchos = Array.from({ length: 60 }, (_, index) => ({
    ...COMPRA,
    id: 100 + index,
    counterparty: `COMERCIO ${index}`,
  }))

  it('pide la página siguiente con su offset y no vacía la lista', async () => {
    stubFetch(muchos)
    const user = userEvent.setup()
    renderWithProviders(<TransactionsScreen />, { route: '/movimientos' })

    expect(await screen.findByText('50 de 60')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cargar más' }))

    await waitFor(() => {
      expect(listCalls().some((url) => url.includes('offset=50'))).toBe(true)
    })
  })

  it('sin más páginas, no ofrece cargar más', async () => {
    renderWithProviders(<TransactionsScreen />, { route: '/movimientos' })

    await screen.findByText('SUPERMERCADO EJEMPLO')
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument()
  })
})
