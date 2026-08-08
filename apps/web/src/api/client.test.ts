import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiFetch } from './client'

afterEach(() => {
  vi.unstubAllGlobals()
})

function respondWith(body: unknown, status: number, asText = false) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      asText
        ? new Response(String(body), { status, headers: { 'content-type': 'text/html' } })
        : Response.json(body, { status }),
    ),
  )
}

describe('apiFetch', () => {
  it('conserva el code del contrato para que decida el programa', async () => {
    respondWith(
      {
        error: {
          code: 'unsupported_format',
          message: 'El registro 33 no cuadra con los movimientos leídos',
        },
      },
      422,
    )

    const error = await apiFetch('/imports', { method: 'POST' }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      code: 'unsupported_format',
      status: 422,
      message: 'El registro 33 no cuadra con los movimientos leídos',
    })
  })

  it('recoge los details de un error de validación', async () => {
    respondWith(
      {
        error: {
          code: 'validation_error',
          message: 'Los datos no son válidos',
          details: [{ path: 'provider', message: 'Valor no admitido' }],
        },
      },
      400,
    )

    const error = (await apiFetch('/accounts').catch((caught: unknown) => caught)) as ApiError

    expect(error.details).toEqual([{ path: 'provider', message: 'Valor no admitido' }])
  })

  it('degrada a internal_error si la respuesta no cumple el contrato', async () => {
    // Un 502 del proxy es HTML: si el parse reventara, la pantalla se quedaría
    // sin nada que enseñar.
    respondWith('<html>502 Bad Gateway</html>', 502, true)

    const error = (await apiFetch('/health').catch((caught: unknown) => caught)) as ApiError

    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe('internal_error')
    expect(error.status).toBe(502)
  })

  it('devuelve el JSON cuando la respuesta es correcta', async () => {
    respondWith({ status: 'ok', version: '0.0.0' }, 200)

    await expect(apiFetch('/health')).resolves.toEqual({ status: 'ok', version: '0.0.0' })
  })
})
