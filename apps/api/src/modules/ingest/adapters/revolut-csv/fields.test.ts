/**
 * Todos los datos de este fichero son inventados.
 */
import { describe, expect, it } from 'vitest'
import { amountCentsOrNull, calendarDateOrNull, currencyOrNull, textOrNull } from './fields'

describe('textOrNull', () => {
  it('recorta el texto', () => {
    expect(textOrNull('  Comercio Ejemplo  ')).toBe('Comercio Ejemplo')
  })

  it('una celda vacía o en blanco es la ausencia de dato, no una cadena vacía', () => {
    expect(textOrNull('')).toBeNull()
    expect(textOrNull('   ')).toBeNull()
  })
})

describe('calendarDateOrNull', () => {
  it('se queda con la fecha y tira la hora', () => {
    expect(calendarDateOrNull('2026-01-02 09:14:03')).toBe('2026-01-02')
  })

  it('admite también la T de ISO 8601, por si Revolut cambia de estilo', () => {
    expect(calendarDateOrNull('2026-01-02T09:14:03')).toBe('2026-01-02')
  })

  it('una celda vacía no es una fecha', () => {
    expect(calendarDateOrNull('')).toBeNull()
    expect(calendarDateOrNull('   ')).toBeNull()
  })

  it('comprueba que el día exista, no solo que la forma cuadre', () => {
    expect(calendarDateOrNull('2026-02-31 00:00:00')).toBeNull()
    expect(calendarDateOrNull('2026-02-29 00:00:00')).toBeNull()
    expect(calendarDateOrNull('2024-02-29 00:00:00')).toBe('2024-02-29')
    expect(calendarDateOrNull('2026-13-01 00:00:00')).toBeNull()
    expect(calendarDateOrNull('2026-00-10 00:00:00')).toBeNull()
  })

  it('rechaza lo que no tenga la forma de Revolut', () => {
    expect(calendarDateOrNull('2026-01-02')).toBeNull()
    expect(calendarDateOrNull('02/01/2026 09:14:03')).toBeNull()
    expect(calendarDateOrNull('ayer')).toBeNull()
  })
})

describe('currencyOrNull', () => {
  it('lee el código ISO 4217 alfabético', () => {
    expect(currencyOrNull('EUR')).toBe('EUR')
    expect(currencyOrNull(' GBP ')).toBe('GBP')
  })

  it('distingue mayúsculas y no admite divisas fuera de la lista', () => {
    expect(currencyOrNull('eur')).toBeNull()
    expect(currencyOrNull('XYZ')).toBeNull()
    expect(currencyOrNull('')).toBeNull()
  })
})

describe('amountCentsOrNull · dialecto de Revolut', () => {
  it('lee cargos y abonos con dos decimales', () => {
    expect(amountCentsOrNull('-24.50', 'EUR')).toBe(-2450)
    expect(amountCentsOrNull('300.00', 'EUR')).toBe(30000)
    expect(amountCentsOrNull('0.00', 'EUR')).toBe(0)
  })

  it('no necesita separador de millares, y no lo admite', () => {
    expect(amountCentsOrNull('1000.00', 'EUR')).toBe(100000)
    expect(amountCentsOrNull('1,234.56', 'EUR')).toBeNull()
    expect(amountCentsOrNull('1.234,56', 'EUR')).toBeNull()
  })

  it('admite un decimal suelto o ninguno', () => {
    expect(amountCentsOrNull('1.5', 'EUR')).toBe(150)
    expect(amountCentsOrNull('12', 'EUR')).toBe(1200)
  })

  it('más decimales de los que tiene la divisa se rechazan, nunca se redondean', () => {
    expect(amountCentsOrNull('1.500', 'EUR')).toBeNull()
    expect(amountCentsOrNull('0.005', 'EUR')).toBeNull()
  })

  it('el límite de decimales lo pone la divisa de la fila, no el euro', () => {
    expect(amountCentsOrNull('1234', 'JPY')).toBe(1234)
    expect(amountCentsOrNull('12.34', 'JPY')).toBeNull()
  })

  it('rechaza lo que no sea un número', () => {
    expect(amountCentsOrNull('', 'EUR')).toBeNull()
    expect(amountCentsOrNull('   ', 'EUR')).toBeNull()
    expect(amountCentsOrNull('abc', 'EUR')).toBeNull()
    expect(amountCentsOrNull('24.50 €', 'EUR')).toBeNull()
    expect(amountCentsOrNull('(24.50)', 'EUR')).toBeNull()
    expect(amountCentsOrNull('24.50-', 'EUR')).toBeNull()
  })

  it('no pasa por un float en ningún momento: 0.1 + 0.2 no aparece por aquí', () => {
    expect(amountCentsOrNull('0.1', 'EUR')).toBe(10)
    expect(amountCentsOrNull('0.2', 'EUR')).toBe(20)
    expect(amountCentsOrNull('8.16', 'EUR')).toBe(816)
    expect(amountCentsOrNull('1234567.89', 'EUR')).toBe(123456789)
  })
})
