/**
 * Todos los importes de este fichero son inventados.
 */
import { describe, expect, it } from 'vitest'
import { formatMoney, parseMoneyCents } from './money'

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

describe('parseMoneyCents', () => {
  it('lee un importe escrito como lo escribe el banco', () => {
    expect(parseMoneyCents('1.234,56', 'EUR')).toBe(123456)
    expect(parseMoneyCents('1234,56', 'EUR')).toBe(123456)
    expect(parseMoneyCents('1.234.567,89', 'EUR')).toBe(123456789)
    expect(parseMoneyCents('250', 'EUR')).toBe(25000)
  })

  it('no pierde céntimos por el camino: la conversión no pasa por un float', () => {
    // El caso clásico de `Math.round(parseFloat(x) * 100)`: en coma flotante
    // 8.29 * 100 es 828.9999999999999, que truncado da 828 y pierde un céntimo.
    expect(parseMoneyCents('8,29', 'EUR')).toBe(829)
    expect(parseMoneyCents('1234.56', 'EUR')).toBe(123456)
    expect(parseMoneyCents('0,07', 'EUR')).toBe(7)
  })

  it('desambigua el punto por el número de cifras que le siguen', () => {
    // Tres cifras detrás y un solo punto: millares, que es la lectura española.
    expect(parseMoneyCents('1.500', 'EUR')).toBe(150000)
    // Cualquier otra cantidad de cifras solo puede ser un decimal.
    expect(parseMoneyCents('1.5', 'EUR')).toBe(150)
    expect(parseMoneyCents('1.50', 'EUR')).toBe(150)
  })

  it('acepta el signo, y el vacío es cero porque el campo es opcional', () => {
    expect(parseMoneyCents('-45,50', 'EUR')).toBe(-4550)
    expect(parseMoneyCents('+45,50', 'EUR')).toBe(4550)
    expect(parseMoneyCents(',50', 'EUR')).toBe(50)
    expect(parseMoneyCents('', 'EUR')).toBe(0)
    expect(parseMoneyCents('   ', 'EUR')).toBe(0)
    expect(parseMoneyCents('-0', 'EUR')).toBe(0)
  })

  it('rechaza en vez de redondear cuando sobran decimales', () => {
    expect(parseMoneyCents('1,234', 'EUR')).toBeNull()
    // El yen no tiene subdivisión, así que ahí sobra ya el primer decimal.
    expect(parseMoneyCents('1500', 'JPY')).toBe(1500)
    expect(parseMoneyCents('1500,5', 'JPY')).toBeNull()
  })

  it('ignora los espacios, que en un importe solo pueden separar millares', () => {
    // Y el no separable, que es lo que pega `Intl` —y algún teclado de móvil—
    // al copiar una cantidad ya formateada.
    expect(parseMoneyCents('1 234,56', 'EUR')).toBe(123456)
    expect(parseMoneyCents('1 234,56', 'EUR')).toBe(123456)
    expect(parseMoneyCents(' 45,50 ', 'EUR')).toBe(4550)
  })

  it('devuelve null ante cualquier cosa que no sea un importe', () => {
    for (const basura of ['abc', '1,2,3', '12€', '--5', '1,5.0', '-', '.', ',']) {
      expect(parseMoneyCents(basura, 'EUR')).toBeNull()
    }
  })

  /**
   * El riesgo de tener aquí un parser propio —la web no puede importar el de
   * `packages/core`— es que se separe del formateador que tiene al lado. Este
   * test es el que lo detectaría.
   */
  it('cierra el círculo con formatMoney', () => {
    // Con cuatro cifras `Intl` no agrupa en español (ICU agrupa a partir de
    // cinco), así que el ida y vuelta se prueba con una cantidad que sí agrupa.
    const cents = parseMoneyCents('1.234.567,89', 'EUR')
    expect(cents).not.toBeNull()
    expect(plain(formatMoney(cents ?? 0, 'EUR'))).toBe('1.234.567,89 €')
  })
})
