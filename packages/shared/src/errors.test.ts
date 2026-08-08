import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { detailsFromZodError, errorResponseSchema } from './errors'
import { normalizedTransactionSchema } from './normalized-transaction'

describe('errorResponseSchema', () => {
  it('acepta un error sin detalles', () => {
    const result = errorResponseSchema.parse({
      error: { code: 'not_found', message: 'No existe la cuenta 42' },
    })

    expect(result.error.code).toBe('not_found')
    expect(result.error.details).toBeUndefined()
  })

  it('acepta un error de validación con sus detalles', () => {
    const result = errorResponseSchema.parse({
      error: {
        code: 'validation_error',
        message: 'El CSV tiene filas ilegibles',
        details: [{ path: 'rows.3.amount', message: 'Importe ilegible' }],
      },
    })

    expect(result.error.details).toHaveLength(1)
  })

  it('rechaza un código inventado: el code lo lee el programa', () => {
    expect(errorResponseSchema.safeParse({ error: { code: 'ups', message: 'algo' } }).success).toBe(
      false,
    )
  })

  it('rechaza un error sin mensaje', () => {
    expect(errorResponseSchema.safeParse({ error: { code: 'internal_error' } }).success).toBe(false)
  })
})

describe('detailsFromZodError', () => {
  it('señala el campo que falla con notación de puntos', () => {
    const result = normalizedTransactionSchema.safeParse({
      bookedAt: '2026-02-31',
      valueDate: null,
      amountCents: 42.5,
      currency: 'EUR',
      counterparty: null,
      description: null,
      raw: {},
    })

    expect(result.success).toBe(false)
    if (result.success) return

    const details = detailsFromZodError(result.error)

    expect(details.map((d) => d.path).sort()).toEqual(['amountCents', 'bookedAt'])
    for (const detail of details) {
      expect(detail.message.length).toBeGreaterThan(0)
    }
  })

  it('señala el índice dentro de un array, que es la fila del CSV', () => {
    const result = z.array(normalizedTransactionSchema).safeParse([{ bookedAt: 'ayer' }])

    expect(result.success).toBe(false)
    if (result.success) return

    expect(detailsFromZodError(result.error).map((d) => d.path)).toContain('0.bookedAt')
  })

  it('marca el error de la raíz en vez de dejar el path vacío', () => {
    const result = normalizedTransactionSchema.safeParse('no soy un objeto')

    expect(result.success).toBe(false)
    if (result.success) return

    expect(detailsFromZodError(result.error)).toEqual([
      { path: '(raíz)', message: expect.any(String) },
    ])
  })

  it('produce detalles que encajan en el propio contrato de error', () => {
    const result = normalizedTransactionSchema.safeParse({})

    expect(result.success).toBe(false)
    if (result.success) return

    const respuesta = {
      error: {
        code: 'validation_error',
        message: 'La fila no es un movimiento válido',
        details: detailsFromZodError(result.error),
      },
    }

    expect(errorResponseSchema.safeParse(respuesta).success).toBe(true)
  })
})
