/**
 * Todos los datos de este fichero son inventados: ni cuentas, ni comercios, ni
 * importes corresponden a nada real.
 */
import type { Account, Category, Transaction } from '@finanzas/shared'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../test-utils'
import { TransactionScreen } from './TransactionScreen'

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

const CATEGORIAS: Category[] = [
  { id: 5, slug: 'groceries', name: 'Supermercado', kind: 'expense', parentId: null, icon: null },
  { id: 6, slug: 'health', name: 'Salud', kind: 'expense', parentId: null, icon: null },
]

/** Sin categorizar y de Revolut: llena `counterparty` y deja `description` a null. */
const PENDIENTE: Transaction = {
  id: 11,
  accountId: 1,
  bookedAt: '2026-03-12',
  valueDate: null,
  amountCents: -1899,
  currency: 'EUR',
  counterparty: 'FARMACIA EJEMPLO',
  description: null,
  categoryId: null,
  categorySource: null,
  transferId: null,
  importId: 1,
}

let fetchMock: ReturnType<typeof vi.fn>

function stubFetch(
  transaction: Transaction = PENDIENTE,
  overrides: Record<string, () => Response> = {},
) {
  fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    if (input.startsWith('/api/accounts')) return Response.json({ accounts: [CUENTA] })
    if (input.startsWith('/api/categories')) return Response.json({ categories: CATEGORIAS })

    if (init?.method === 'PATCH') {
      const respond = overrides.patch
      if (respond !== undefined) return respond()
      const { categoryId } = JSON.parse(String(init.body)) as { categoryId: number | null }
      return Response.json({
        ...transaction,
        categoryId,
        categorySource: categoryId === null ? null : 'manual',
      })
    }

    if (init?.method === 'POST') {
      const respond = overrides.post
      if (respond !== undefined) return respond()
      return Response.json(
        {
          rule: {
            id: 3,
            priority: 100,
            field: 'counterparty',
            matchType: 'contains',
            pattern: 'FARMACIA EJEMPLO',
            categoryId: 6,
            active: true,
          },
          categorization: { scanned: 40, categorized: 9, cleared: 0, invalidRules: [] },
        },
        { status: 201 },
      )
    }

    return Response.json(transaction)
  })
  vi.stubGlobal('fetch', fetchMock)
}

/** El cuerpo que la pantalla envió con ese método. */
function sent(method: string): unknown {
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === method)
  if (call === undefined) throw new Error(`La pantalla no ha llamado con ${method}`)
  return JSON.parse(String(call[1]?.body))
}

beforeEach(() => {
  stubFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * Montada en su ruta y no suelta: la pantalla lee el `:id` de la URL con
 * `useParams`, así que sin el `<Route path=":id">` no habría id que leer.
 */
function render(id = '11') {
  return renderWithProviders(
    <Routes>
      <Route path="/movimientos/:id" element={<TransactionScreen />} />
    </Routes>,
    { route: `/movimientos/${id}` },
  )
}

describe('TransactionScreen · el detalle', () => {
  it('enseña el movimiento pedido con su importe, su fecha y su cuenta', async () => {
    render()

    expect(await screen.findByText('FARMACIA EJEMPLO')).toBeInTheDocument()
    expect(screen.getByText(/18,99/)).toBeInTheDocument()
    expect(screen.getByText('12 de marzo de 2026')).toBeInTheDocument()
    expect(screen.getByText('Cuenta corriente')).toBeInTheDocument()
    expect(screen.getByText('sin categorizar')).toBeInTheDocument()
  })

  it('pide el movimiento por su id, no el primero de la lista', async () => {
    render('42')

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/transactions/42')).toBe(
        true,
      )
    })
  })

  it('un movimiento que ya no existe se cuenta como tal, no como un fallo', async () => {
    stubFetch(PENDIENTE)
    fetchMock.mockImplementation(async (input: string) => {
      if (input.startsWith('/api/accounts')) return Response.json({ accounts: [CUENTA] })
      if (input.startsWith('/api/categories')) return Response.json({ categories: CATEGORIAS })
      return Response.json(
        { error: { code: 'not_found', message: 'No existe el movimiento 11' } },
        { status: 404 },
      )
    })

    render()

    expect(await screen.findByText('Ese movimiento ya no existe.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('TransactionScreen · categorizar a mano', () => {
  it('manda la categoría elegida y avisa de que las reglas ya no la tocarán', async () => {
    const user = userEvent.setup()
    render()

    await screen.findByText('FARMACIA EJEMPLO')
    await user.selectOptions(screen.getByLabelText('Categoría'), 'Salud')
    await user.click(screen.getByRole('button', { name: 'Guardar la categoría' }))

    expect(await screen.findByText('Guardada. Las reglas ya no la tocarán.')).toBeInTheDocument()
    // El `categorySource` no viaja en el cuerpo: lo pone la API (invariante 7).
    expect(sent('PATCH')).toEqual({ categoryId: 6 })
  })

  it('quitarla la devuelve a la bandeja', async () => {
    stubFetch({ ...PENDIENTE, categoryId: 5, categorySource: 'manual' })
    const user = userEvent.setup()
    render()

    await screen.findByText('FARMACIA EJEMPLO')
    await user.selectOptions(screen.getByLabelText('Categoría'), 'Sin categorizar')
    await user.click(screen.getByRole('button', { name: 'Guardar la categoría' }))

    expect(await screen.findByText('Vuelve a estar sin categorizar.')).toBeInTheDocument()
    expect(sent('PATCH')).toEqual({ categoryId: null })
  })

  it('una pata de transferencia no se categoriza aquí, y lo dice', async () => {
    stubFetch({ ...PENDIENTE, transferId: 4 })
    render()

    // Invariante 3: mejor decirlo que dejar que la API conteste un 409.
    expect(await screen.findByText(/parte de una transferencia interna/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar la categoría' })).not.toBeInTheDocument()
  })
})

describe('TransactionScreen · crear una regla', () => {
  it('prerrellena el patrón con el campo que la fuente sí llenó', async () => {
    render()

    await screen.findByText('FARMACIA EJEMPLO')
    expect(screen.getByLabelText('Patrón')).toHaveValue('FARMACIA EJEMPLO')
    expect(screen.getByLabelText('Compara contra')).toHaveValue('counterparty')
  })

  it('cuando la contraparte viene vacía, se apoya en el concepto', async () => {
    // Es el caso de la Norma 43, que lo mete todo en `description` (ADR-010).
    stubFetch({ ...PENDIENTE, counterparty: null, description: 'ADEUDO GIMNASIO' })
    render()

    await screen.findByText('ADEUDO GIMNASIO')
    expect(screen.getByLabelText('Patrón')).toHaveValue('ADEUDO GIMNASIO')
    expect(screen.getByLabelText('Compara contra')).toHaveValue('description')
  })

  it('la crea y enseña a cuántos movimientos ha alcanzado', async () => {
    const user = userEvent.setup()
    render()

    await screen.findByText('FARMACIA EJEMPLO')
    await user.selectOptions(screen.getByLabelText('Categoría de la regla'), 'Salud')
    await user.click(screen.getByRole('button', { name: 'Crear la regla y aplicarla' }))

    // Lo que convierte "regla creada" en algo comprobable por el usuario.
    expect(await screen.findByText('La regla ha categorizado 9 movimientos.')).toBeInTheDocument()
    expect(sent('POST')).toEqual({
      field: 'counterparty',
      matchType: 'contains',
      pattern: 'FARMACIA EJEMPLO',
      categoryId: 6,
    })
  })

  it('avisa cuando la regla no ha categorizado nada', async () => {
    stubFetch(PENDIENTE, {
      post: () =>
        Response.json(
          {
            rule: {
              id: 3,
              priority: 100,
              field: 'counterparty',
              matchType: 'contains',
              pattern: 'ZZZ',
              categoryId: 6,
              active: true,
            },
            categorization: { scanned: 40, categorized: 0, cleared: 0, invalidRules: [] },
          },
          { status: 201 },
        ),
    })
    const user = userEvent.setup()
    render()

    await screen.findByText('FARMACIA EJEMPLO')
    await user.selectOptions(screen.getByLabelText('Categoría de la regla'), 'Salud')
    await user.click(screen.getByRole('button', { name: 'Crear la regla y aplicarla' }))

    expect(await screen.findByText(/no ha categorizado ningún movimiento/)).toBeInTheDocument()
  })

  it('enseña el detalle del campo cuando la API rechaza el patrón', async () => {
    stubFetch(PENDIENTE, {
      post: () =>
        Response.json(
          {
            error: {
              code: 'validation_error',
              message: 'Los datos de la regla no son válidos',
              details: [{ path: 'pattern', message: 'Expresión regular no válida' }],
            },
          },
          { status: 400 },
        ),
    })
    const user = userEvent.setup()
    render()

    await screen.findByText('FARMACIA EJEMPLO')
    await user.selectOptions(screen.getByLabelText('Categoría de la regla'), 'Salud')
    await user.click(screen.getByRole('button', { name: 'Crear la regla y aplicarla' }))

    const aviso = await screen.findByRole('alert')
    expect(aviso).toHaveTextContent('La regla no es válida')
    expect(aviso).toHaveTextContent('pattern: Expresión regular no válida')
  })

  it('reporta la regla vieja que se ha saltado sin presentarlo como un fallo', async () => {
    stubFetch(PENDIENTE, {
      post: () =>
        Response.json(
          {
            rule: {
              id: 3,
              priority: 100,
              field: 'counterparty',
              matchType: 'contains',
              pattern: 'FARMACIA EJEMPLO',
              categoryId: 6,
              active: true,
            },
            categorization: {
              scanned: 40,
              categorized: 9,
              cleared: 0,
              invalidRules: [{ ruleId: 2, message: 'Expresión regular no válida' }],
            },
          },
          { status: 201 },
        ),
    })
    const user = userEvent.setup()
    render()

    await screen.findByText('FARMACIA EJEMPLO')
    await user.selectOptions(screen.getByLabelText('Categoría de la regla'), 'Salud')
    await user.click(screen.getByRole('button', { name: 'Crear la regla y aplicarla' }))

    // La regla nueva sí ha hecho su trabajo: la vieja rota es un aviso aparte.
    expect(await screen.findByText('La regla ha categorizado 9 movimientos.')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Regla 2: Expresión regular no válida')
  })
})
