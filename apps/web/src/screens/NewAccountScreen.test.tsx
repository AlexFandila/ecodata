/**
 * Todos los datos de este fichero son inventados: ni cuentas, ni IBANes, ni
 * importes corresponden a nada real.
 */
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../test-utils'
import { NewAccountScreen } from './NewAccountScreen'

const CREADA = {
  id: 3,
  name: 'Cuenta de prueba',
  provider: 'revolut',
  type: 'card',
  currency: 'EUR',
  iban: null,
  isOwn: true,
  openingBalanceCents: 0,
  createdAt: '2026-03-01T00:00:00.000Z',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(response: () => Response) {
  const mock = vi.fn(async (_input: string, _init?: RequestInit) => response())
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('NewAccountScreen', () => {
  /** El cuerpo de la única llamada que la pantalla haya hecho a la API. */
  function enviado(fetchMock: ReturnType<typeof stubFetch>): unknown {
    const [, init] = fetchMock.mock.calls[0] ?? []
    return JSON.parse(String(init?.body))
  }

  it('manda los campos del formulario y deja a la API solo el default de isOwn', async () => {
    const fetchMock = stubFetch(() => Response.json(CREADA, { status: 201 }))
    const user = userEvent.setup()
    renderWithProviders(<NewAccountScreen />)

    await user.type(screen.getByLabelText('Nombre'), 'Cuenta de prueba')
    await user.selectOptions(screen.getByLabelText('Proveedor'), 'Revolut')
    await user.selectOptions(screen.getByLabelText('Tipo'), 'Tarjeta')
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(enviado(fetchMock)).toEqual({
      name: 'Cuenta de prueba',
      provider: 'revolut',
      type: 'card',
      currency: 'EUR',
      // En blanco es "no lo he puesto", no cadena vacía.
      iban: null,
      // Un saldo en blanco es un cero dicho a propósito, no un campo sin poner.
      openingBalanceCents: 0,
    })
  })

  it('convierte el saldo inicial a céntimos', async () => {
    const fetchMock = stubFetch(() => Response.json(CREADA, { status: 201 }))
    const user = userEvent.setup()
    renderWithProviders(<NewAccountScreen />)

    await user.type(screen.getByLabelText('Nombre'), 'Cuenta con saldo')
    await user.type(screen.getByLabelText('Saldo inicial (opcional)'), '1.234,56')
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(enviado(fetchMock)).toMatchObject({ openingBalanceCents: 123456 })
  })

  it('un saldo que no se entiende se avisa y no llega a la API', async () => {
    const fetchMock = stubFetch(() => Response.json(CREADA, { status: 201 }))
    const user = userEvent.setup()
    renderWithProviders(<NewAccountScreen />)

    await user.type(screen.getByLabelText('Nombre'), 'Cuenta rara')
    await user.type(screen.getByLabelText('Saldo inicial (opcional)'), 'mil euros')
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    const aviso = await screen.findByRole('alert')
    expect(aviso).toHaveTextContent('El saldo inicial no se entiende')
    // Lo que importa: el fallo de formato se para aquí y no gasta una llamada.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('pinta el detalle del campo que la API rechaza', async () => {
    stubFetch(() =>
      Response.json(
        {
          error: {
            code: 'validation_error',
            message: 'Los datos de la cuenta no son válidos',
            details: [{ path: 'iban', message: 'El IBAN no tiene la forma esperada' }],
          },
        },
        { status: 400 },
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<NewAccountScreen />)

    await user.type(screen.getByLabelText('Nombre'), 'Cuenta rara')
    await user.type(screen.getByLabelText('IBAN (opcional)'), 'no-es-un-iban')
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    const aviso = await screen.findByRole('alert')
    expect(aviso).toHaveTextContent('iban: El IBAN no tiene la forma esperada')
  })
})
