import { describe, expect, it } from 'vitest'
import { formatMoney } from './format'
import { money } from './money'
import { parseAmount } from './parse'

/** `Intl` usa espacios no separables; se normalizan para poder comparar la cadena. */
const normalizar = (texto: string) => texto.replace(/\s/g, ' ')

describe('formatMoney', () => {
  it('formatea euros en español con símbolo detrás', () => {
    expect(normalizar(formatMoney(money(123_456, 'EUR')))).toBe('1.234,56 €')
  })

  it('formatea cargos con el signo delante', () => {
    expect(normalizar(formatMoney(money(-123_456, 'EUR')))).toBe('-1.234,56 €')
  })

  it('formatea el cero con sus dos decimales', () => {
    expect(normalizar(formatMoney(money(0, 'EUR')))).toBe('0,00 €')
  })

  it('no inventa decimales en divisas que no los tienen', () => {
    const formateado = formatMoney(money(1234, 'JPY'))
    expect(formateado).toContain('1.234')
    expect(formateado).not.toContain(',')
  })

  it('omite la divisa si se le pide', () => {
    expect(normalizar(formatMoney(money(-123_456, 'EUR'), { showSymbol: false }))).toBe('-1.234,56')
  })

  it('respeta el locale que se le pase', () => {
    expect(normalizar(formatMoney(money(123_456, 'USD'), { locale: 'en-US' }))).toBe('$1,234.56')
  })
})

describe('formatear y volver a parsear', () => {
  it('recupera el importe original', () => {
    const importes = [0, 1, -1, 99, -99, 100, 123_456, -123_456, 1_000_000_00]
    for (const amountCents of importes) {
      const original = money(amountCents, 'EUR')
      expect(parseAmount(formatMoney(original), 'EUR')).toEqual(original)
    }
  })
})
