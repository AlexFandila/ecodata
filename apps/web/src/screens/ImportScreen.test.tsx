/**
 * Todos los datos de este fichero son inventados: ni cuentas, ni IBANes, ni
 * importes corresponden a nada real.
 */
import type { Account } from '@finanzas/shared'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../test-utils'
import { ImportScreen } from './ImportScreen'

const CUENTA_UNICAJA: Account = {
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

const CUENTA_REVOLUT: Account = {
  ...CUENTA_UNICAJA,
  id: 2,
  name: 'Revolut personal',
  provider: 'revolut',
  type: 'card',
}

const RESULTADO = {
  importId: 7,
  accountId: 1,
  source: 'norma43',
  fileName: 'extracto.n43',
  importedAt: '2026-03-15T10:30:00.000Z',
  stats: { read: 12, inserted: 10, duplicated: 1, errors: 1 },
  rowErrors: [{ row: 4, message: 'Importe ilegible' }],
}

let fetchMock: ReturnType<typeof vi.fn>

/** Encola las respuestas del `fetch` en el orden en que las pide la pantalla. */
function stubFetch(accounts: readonly Account[], importResponse?: () => Response) {
  fetchMock = vi.fn(async (_input: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      return importResponse?.() ?? Response.json(RESULTADO, { status: 201 })
    }
    return Response.json({ accounts }, { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
}

function n43File(name = 'extracto.n43') {
  return new File(['contenido sintético'], name, { type: 'text/plain' })
}

/** El formulario que la pantalla envió a `POST /imports`. */
function enviado(): FormData {
  const call = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')
  const init = call?.[1]
  if (init === undefined) {
    throw new Error('La pantalla no ha llamado a POST /imports')
  }
  return init.body as FormData
}

beforeEach(() => {
  stubFetch([CUENTA_UNICAJA, CUENTA_REVOLUT])
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ImportScreen · el camino feliz', () => {
  it('envía cuenta, formato y fichero, y enseña el reparto del import', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ImportScreen />)

    await screen.findByLabelText('Cuenta de destino')
    await user.selectOptions(screen.getByLabelText('Cuenta de destino'), 'Cuenta corriente')
    await user.upload(screen.getByLabelText('Fichero'), n43File())
    await user.click(screen.getByRole('button', { name: 'Importar' }))

    expect(await screen.findByText('Importado')).toBeInTheDocument()

    const form = enviado()
    expect(form.get('accountId')).toBe('1')
    expect(form.get('source')).toBe('norma43')
    expect((form.get('file') as File).name).toBe('extracto.n43')

    // Las cuatro cifras de `stats`, que es lo que se viene a ver.
    for (const [label, valor] of [
      ['Leídos', '12'],
      ['Nuevos', '10'],
      ['Duplicados', '1'],
      ['Con error', '1'],
    ] as const) {
      expect(screen.getByText(label).nextElementSibling).toHaveTextContent(valor)
    }
  })

  it('lista las filas que no se han podido leer', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ImportScreen />)

    await screen.findByLabelText('Cuenta de destino')
    await user.selectOptions(screen.getByLabelText('Cuenta de destino'), 'Cuenta corriente')
    await user.upload(screen.getByLabelText('Fichero'), n43File())
    await user.click(screen.getByRole('button', { name: 'Importar' }))

    expect(await screen.findByText(/Fila 4 — Importe ilegible/)).toBeInTheDocument()
  })
})

describe('ImportScreen · el formato', () => {
  it('lo presugiere a partir del proveedor de la cuenta, pero deja cambiarlo', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ImportScreen />)

    await screen.findByLabelText('Cuenta de destino')
    const formato = screen.getByLabelText('Formato del fichero')

    await user.selectOptions(screen.getByLabelText('Cuenta de destino'), 'Revolut personal')
    expect(formato).toHaveValue('revolut_csv')

    // ADR-010: el desplegable nombra el formato, no el banco. La sugerencia no
    // puede ser una imposición.
    await user.selectOptions(formato, 'Cuaderno 43 · Unicaja')
    expect(formato).toHaveValue('norma43')

    await user.upload(screen.getByLabelText('Fichero'), n43File())
    await user.click(screen.getByRole('button', { name: 'Importar' }))

    await waitFor(() => expect(screen.getByText('Importado')).toBeInTheDocument())
    expect(enviado().get('source')).toBe('norma43')
  })

  /**
   * El `accept` no valida nada —de eso se encarga el adaptador—, pero en el
   * móvil decide qué ficheros se pueden ni siquiera elegir. Unicaja exporta
   * `.csb`, así que sin él el cuaderno 43 sale agrisado en el selector.
   */
  it('sugiere al selector de archivos las extensiones del formato elegido', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ImportScreen />)

    await screen.findByLabelText('Cuenta de destino')
    const fichero = screen.getByLabelText('Fichero')
    const formato = screen.getByLabelText('Formato del fichero')

    expect(formato).toHaveValue('norma43')
    expect(fichero).toHaveAttribute('accept', expect.stringContaining('.csb'))
    expect(fichero).toHaveAttribute('accept', expect.stringContaining('.n43'))

    await user.selectOptions(formato, 'CSV de Revolut')
    expect(fichero).toHaveAttribute('accept', '.csv,text/csv')
  })
})

describe('ImportScreen · los errores', () => {
  it('enseña el mensaje del adaptador cuando el fichero no es de ese formato', async () => {
    stubFetch([CUENTA_UNICAJA, CUENTA_REVOLUT], () =>
      Response.json(
        {
          error: {
            code: 'unsupported_format',
            message: 'El fichero no empieza por un registro de cabecera 11',
          },
        },
        { status: 422 },
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<ImportScreen />)

    await screen.findByLabelText('Cuenta de destino')
    await user.selectOptions(screen.getByLabelText('Cuenta de destino'), 'Cuenta corriente')
    await user.upload(screen.getByLabelText('Fichero'), n43File('movimientos.csv'))
    await user.click(screen.getByRole('button', { name: 'Importar' }))

    const aviso = await screen.findByRole('alert')
    expect(aviso).toHaveTextContent('El fichero no encaja con el formato elegido')
    expect(aviso).toHaveTextContent('El fichero no empieza por un registro de cabecera 11')

    // El formulario sigue relleno: cambiar el formato y reintentar no obliga a
    // volver a elegirlo todo.
    expect(screen.getByLabelText('Cuenta de destino')).toHaveValue('1')
  })
})

describe('ImportScreen · sin cuentas', () => {
  it('lleva a crear la primera en vez de enseñar un desplegable vacío', async () => {
    stubFetch([])
    renderWithProviders(<ImportScreen />)

    expect(await screen.findByRole('link', { name: 'Crear la primera cuenta' })).toHaveAttribute(
      'href',
      '/ajustes/cuentas/nueva',
    )
    expect(screen.queryByLabelText('Cuenta de destino')).not.toBeInTheDocument()
  })
})
