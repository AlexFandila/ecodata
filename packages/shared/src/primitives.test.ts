import { describe, expect, it } from 'vitest'
import {
  amountCentsSchema,
  entityIdSchema,
  isoDateSchema,
  isoDateTimeSchema,
  nonNegativeIntSchema,
  rawRecordSchema,
  trimmedText,
} from './primitives'

describe('isoDateSchema', () => {
  it('acepta una fecha de calendario', () => {
    expect(isoDateSchema.parse('2026-03-15')).toBe('2026-03-15')
  })

  it('no admite hora: una fecha contable no la tiene', () => {
    expect(isoDateSchema.safeParse('2026-03-15T10:30:00Z').success).toBe(false)
  })

  it('es más estricta que el GLOB de SQLite y comprueba que el día exista', () => {
    expect(isoDateSchema.safeParse('2026-02-31').success).toBe(false)
    expect(isoDateSchema.safeParse('2026-13-01').success).toBe(false)
    expect(isoDateSchema.safeParse('2026-02-29').success).toBe(false)
    expect(isoDateSchema.safeParse('2024-02-29').success).toBe(true)
  })
})

describe('isoDateTimeSchema', () => {
  it('acepta un instante en UTC', () => {
    expect(isoDateTimeSchema.parse('2026-03-15T10:30:00Z')).toBe('2026-03-15T10:30:00Z')
    expect(isoDateTimeSchema.safeParse('2026-03-15T10:30:00.123Z').success).toBe(true)
  })

  it('no acepta una fecha suelta: son cosas distintas', () => {
    expect(isoDateTimeSchema.safeParse('2026-03-15').success).toBe(false)
  })
})

describe('amountCentsSchema', () => {
  it('acepta enteros con signo', () => {
    expect(amountCentsSchema.parse(-4250)).toBe(-4250)
    expect(amountCentsSchema.parse(0)).toBe(0)
  })

  it('rechaza floats: los importes van en la unidad mínima de la divisa', () => {
    expect(amountCentsSchema.safeParse(42.5).success).toBe(false)
    expect(amountCentsSchema.safeParse(-0.01).success).toBe(false)
  })

  it('rechaza lo que está fuera del rango entero seguro', () => {
    expect(amountCentsSchema.safeParse(Number.MAX_SAFE_INTEGER).success).toBe(true)
    expect(amountCentsSchema.safeParse(Number.MAX_SAFE_INTEGER + 2).success).toBe(false)
  })

  it('rechaza NaN, infinito y cadenas: nada de coerción silenciosa', () => {
    for (const valor of [Number.NaN, Number.POSITIVE_INFINITY, '4250']) {
      expect(amountCentsSchema.safeParse(valor).success).toBe(false)
    }
  })
})

describe('nonNegativeIntSchema y entityIdSchema', () => {
  it('un recuento puede ser cero', () => {
    expect(nonNegativeIntSchema.parse(0)).toBe(0)
    expect(nonNegativeIntSchema.safeParse(-1).success).toBe(false)
  })

  it('un id no: las claves autoincrementales empiezan en 1', () => {
    expect(entityIdSchema.parse(1)).toBe(1)
    expect(entityIdSchema.safeParse(0).success).toBe(false)
    expect(entityIdSchema.safeParse(-3).success).toBe(false)
  })
})

describe('trimmedText', () => {
  const texto = trimmedText(10)

  it('recorta antes de medir', () => {
    expect(texto.parse('  hola  ')).toBe('hola')
    expect(texto.parse('  0123456789  ')).toBe('0123456789')
  })

  it('rechaza lo que queda vacío al recortar', () => {
    expect(texto.safeParse('').success).toBe(false)
    expect(texto.safeParse('     ').success).toBe(false)
  })

  it('rechaza lo que se pasa de largo ya recortado', () => {
    expect(texto.safeParse('01234567890').success).toBe(false)
  })
})

describe('rawRecordSchema', () => {
  it('acepta las columnas de un CSV', () => {
    const fila = { FECHA: '15/03/2026', CONCEPTO: 'COMPRA', IMPORTE: '-42,50' }

    expect(rawRecordSchema.parse(fila)).toEqual(fila)
  })

  it('acepta valores JSON anidados', () => {
    const fila = { amount: { value: '-42.50', currency: 'EUR' }, tags: ['a', 'b'], id: null }

    expect(rawRecordSchema.parse(fila)).toEqual(fila)
  })

  it('rechaza lo que no es JSON serializable', () => {
    expect(rawRecordSchema.safeParse({ fn: () => 1 }).success).toBe(false)
    expect(rawRecordSchema.safeParse({ fecha: new Date(0) }).success).toBe(false)
  })
})
