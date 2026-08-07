import { describe, expect, it } from 'vitest'
import { money } from './money'
import { parseAmount, tryParseAmount } from './parse'

/** Céntimos que resultan de parsear `input` en euros. */
const centimos = (input: string) => parseAmount(input, 'EUR').amountCents

describe('parseAmount con formato español', () => {
  it('lee el separador de miles y la coma decimal', () => {
    expect(centimos('1.234,56')).toBe(123_456)
  })

  it('lee importes sin separador de miles', () => {
    expect(centimos('1234,56')).toBe(123_456)
  })

  it('rellena los decimales que faltan', () => {
    expect(centimos('12,3')).toBe(1230)
    expect(centimos('12')).toBe(1200)
  })

  it('lee varios grupos de miles', () => {
    expect(centimos('1.234.567,89')).toBe(123_456_789)
  })

  it('lee el cero', () => {
    expect(centimos('0,00')).toBe(0)
    expect(centimos('0')).toBe(0)
  })
})

describe('parseAmount con otros formatos', () => {
  it('lee el formato anglosajón', () => {
    expect(centimos('1,234.56')).toBe(123_456)
  })

  it('ignora espacios, incluidos los no separables', () => {
    expect(centimos('-1 234,56')).toBe(-123_456)
    expect(centimos('1 234,56')).toBe(123_456)
  })

  it('ignora el símbolo y el código de la divisa', () => {
    expect(centimos('1.234,56 €')).toBe(123_456)
    expect(centimos('EUR 1.234,56')).toBe(123_456)
  })

  it('acepta el signo delante y detrás', () => {
    expect(centimos('-1.234,56')).toBe(-123_456)
    expect(centimos('1.234,56-')).toBe(-123_456)
    expect(centimos('+1.234,56')).toBe(123_456)
  })

  it('lee los paréntesis como negativo', () => {
    expect(centimos('(12,34)')).toBe(-1234)
  })

  it('normaliza el cero negativo', () => {
    expect(Object.is(centimos('-0,00'), 0)).toBe(true)
  })
})

describe('parseAmount y la ambigüedad de los tres dígitos', () => {
  it('trata un único separador con tres dígitos detrás como separador de miles', () => {
    expect(centimos('1.234')).toBe(123_400)
    expect(centimos('12,345')).toBe(1_234_500)
  })

  it('trata dos dígitos detrás como decimales', () => {
    expect(centimos('1.23')).toBe(123)
  })
})

describe('parseAmount con divisas sin decimales', () => {
  it('lee yenes como unidades enteras', () => {
    expect(parseAmount('100', 'JPY').amountCents).toBe(100)
    expect(parseAmount('1.234', 'JPY').amountCents).toBe(1234)
  })

  it('rechaza decimales en una divisa que no los tiene', () => {
    expect(() => parseAmount('100,5', 'JPY')).toThrow(/No es un importe válido/)
  })
})

describe('parseAmount con entradas inválidas', () => {
  const invalidos = ['', '   ', 'basura', '12,34,56', '1.234,567', '1.2345', '-', '1..2', '12.34.5']

  it('lanza con un mensaje que incluye la entrada', () => {
    expect(() => parseAmount('basura', 'EUR')).toThrow(/No es un importe válido en EUR/)
  })

  it('rechaza todas las entradas malformadas', () => {
    for (const input of invalidos) {
      expect(() => parseAmount(input, 'EUR')).toThrow()
    }
  })

  it('rechaza importes que se salen del rango entero seguro', () => {
    expect(() => parseAmount('99999999999999999999,00', 'EUR')).toThrow()
  })
})

describe('tryParseAmount', () => {
  it('devuelve el importe cuando el texto es válido', () => {
    expect(tryParseAmount('1.234,56', 'EUR')).toEqual(money(123_456, 'EUR'))
  })

  it('devuelve null en vez de lanzar: una celda sucia de un CSV no es un bug', () => {
    expect(tryParseAmount('basura', 'EUR')).toBeNull()
    expect(tryParseAmount('', 'EUR')).toBeNull()
  })
})
