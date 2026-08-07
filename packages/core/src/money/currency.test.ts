import { describe, expect, it } from 'vitest'
import { assertCurrency, CURRENCY_CODES, isCurrency, minorUnitsOf } from './currency'

describe('isCurrency', () => {
  it('reconoce las divisas admitidas', () => {
    for (const code of CURRENCY_CODES) {
      expect(isCurrency(code)).toBe(true)
    }
  })

  it('distingue mayúsculas y rechaza códigos inventados', () => {
    expect(isCurrency('eur')).toBe(false)
    expect(isCurrency('EURO')).toBe(false)
    expect(isCurrency('')).toBe(false)
    expect(isCurrency('BTC')).toBe(false)
  })

  it('no confunde propiedades heredadas de Object con divisas', () => {
    expect(isCurrency('toString')).toBe(false)
    expect(isCurrency('constructor')).toBe(false)
  })
})

describe('assertCurrency', () => {
  it('devuelve el código cuando es válido', () => {
    expect(assertCurrency('EUR')).toBe('EUR')
  })

  it('lanza indicando el valor recibido', () => {
    expect(() => assertCurrency('pesetas')).toThrow(/Divisa desconocida/)
  })
})

describe('minorUnitsOf', () => {
  it('da dos decimales al euro', () => {
    expect(minorUnitsOf('EUR')).toBe(2)
  })

  it('da cero decimales al yen', () => {
    expect(minorUnitsOf('JPY')).toBe(0)
  })
})
