/**
 * Todos los importes de este fichero son inventados.
 */
import { describe, expect, it } from 'vitest'
import { formatMoney } from './money'

/** `Intl` separa el símbolo con espacios duros; se normalizan para comparar. */
function plain(value: string): string {
  return value.replace(/[  ]/g, ' ')
}

describe('formatMoney', () => {
  it('pasa de céntimos a euros con el formato español', () => {
    expect(plain(formatMoney(123456789, 'EUR'))).toBe('1.234.567,89 €')
  })

  it('conserva el signo: un cargo se pinta en negativo', () => {
    expect(plain(formatMoney(-4550, 'EUR'))).toBe('-45,50 €')
  })

  it('cero es cero, no una cadena vacía', () => {
    expect(plain(formatMoney(0, 'EUR'))).toBe('0,00 €')
  })

  it('respeta los decimales de cada divisa sin tener una tabla propia', () => {
    // El yen no tiene subdivisión: 1234 yenes son 1234, no 12,34. Los decimales
    // los pone `Intl`, que es lo que evita duplicar `CURRENCIES` aquí.
    expect(plain(formatMoney(1234, 'JPY'))).toBe('1234 JPY')
    expect(plain(formatMoney(1234, 'USD'))).toBe('12,34 US$')
  })
})
