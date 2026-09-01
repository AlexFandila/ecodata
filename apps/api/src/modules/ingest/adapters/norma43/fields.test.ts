/**
 * Todos los datos de este fichero son inventados: ni entidades, ni cuentas, ni
 * importes corresponden a nada real.
 */
import { CURRENCY_CODES } from '@finanzas/shared'
import { describe, expect, it } from 'vitest'
import {
  amountCentsOrNull,
  calendarDateOrNull,
  currencyFromNumeric,
  integerOrNull,
  signOrNull,
  textOrNull,
} from './fields'

describe('textOrNull', () => {
  it('recorta el relleno de espacios del campo', () => {
    expect(textOrNull('RECIBO ALQUILER      ')).toBe('RECIBO ALQUILER')
  })

  it('traduce el campo vacío a null, nunca a cadena vacía', () => {
    expect(textOrNull('')).toBeNull()
    expect(textOrNull('     ')).toBeNull()
  })
})

describe('integerOrNull', () => {
  it('lee un numérico rellenado con ceros a la izquierda', () => {
    expect(integerOrNull('00031')).toBe(31)
    expect(integerOrNull('00000')).toBe(0)
  })

  it('rechaza lo que no son solo dígitos', () => {
    for (const value of ['0003 ', '', '-1', '1.5', '00o31']) {
      expect(integerOrNull(value)).toBeNull()
    }
  })
})

describe('currencyFromNumeric', () => {
  it('traduce el ISO 4217 numérico que usa la norma', () => {
    expect(currencyFromNumeric('978')).toBe('EUR')
    expect(currencyFromNumeric('840')).toBe('USD')
  })

  it('devuelve null ante un código que no conocemos', () => {
    expect(currencyFromNumeric('999')).toBeNull()
    expect(currencyFromNumeric('')).toBeNull()
  })

  /**
   * Si mañana se añade una divisa a los contratos y se olvida aquí, un extracto
   * en esa divisa se rechazaría entero sin que nadie hubiera decidido eso.
   */
  it('cubre todas las divisas de los contratos', () => {
    const cubiertas = new Set(
      ['978', '840', '826', '756', '392'].map((numerico) => currencyFromNumeric(numerico)),
    )
    for (const codigo of CURRENCY_CODES) {
      expect(cubiertas).toContain(codigo)
    }
  })
})

describe('calendarDateOrNull', () => {
  it('convierte AAMMDD a fecha ISO', () => {
    expect(calendarDateOrNull('260315')).toBe('2026-03-15')
    expect(calendarDateOrNull('260501')).toBe('2026-05-01')
  })

  it('aplica la ventana de siglo documentada en ADR-010', () => {
    expect(calendarDateOrNull('790101')).toBe('2079-01-01')
    expect(calendarDateOrNull('800101')).toBe('1980-01-01')
    expect(calendarDateOrNull('990101')).toBe('1999-01-01')
  })

  it('comprueba que el día exista, no solo que la forma cuadre', () => {
    expect(calendarDateOrNull('260231')).toBeNull()
    expect(calendarDateOrNull('261301')).toBeNull()
    expect(calendarDateOrNull('260300')).toBeNull()
    expect(calendarDateOrNull('260431')).toBeNull()
  })

  it('cuenta bien los bisiestos', () => {
    expect(calendarDateOrNull('240229')).toBe('2024-02-29')
    expect(calendarDateOrNull('260229')).toBeNull()
    // 2000 fue bisiesto (divisible por 400) y 1900 no (divisible por 100).
    expect(calendarDateOrNull('000229')).toBe('2000-02-29')
    expect(calendarDateOrNull('000230')).toBeNull()
  })

  it('rechaza lo que no son seis dígitos', () => {
    for (const value of ['2603', '2603150', '26-3-1', '      ', '']) {
      expect(calendarDateOrNull(value)).toBeNull()
    }
  })
})

describe('signOrNull', () => {
  it('lee la clave debe/haber de la norma', () => {
    expect(signOrNull('1')).toBe(-1)
    expect(signOrNull('2')).toBe(1)
  })

  it('rechaza cualquier otra cosa', () => {
    for (const value of ['0', '3', ' ', '', '12']) {
      expect(signOrNull(value)).toBeNull()
    }
  })
})

describe('amountCentsOrNull', () => {
  it('lee los dígitos como céntimos: no hay nada que multiplicar', () => {
    expect(amountCentsOrNull('1', '00000000030000', 'EUR')).toBe(-30000)
    expect(amountCentsOrNull('2', '00000000198750', 'EUR')).toBe(198750)
  })

  it('el signo lo pone el campo de la norma, no el importe', () => {
    expect(amountCentsOrNull('1', '00000000000001', 'EUR')).toBe(-1)
    expect(amountCentsOrNull('2', '00000000000001', 'EUR')).toBe(1)
  })

  it('normaliza el cero: nada de -0 ensuciando comparaciones', () => {
    const cero = amountCentsOrNull('1', '00000000000000', 'EUR')
    expect(cero).toBe(0)
    expect(Object.is(cero, -0)).toBe(false)
  })

  it('el máximo de 14 dígitos sigue siendo un entero seguro', () => {
    expect(amountCentsOrNull('2', '99999999999999', 'EUR')).toBe(99999999999999)
    expect(Number.isSafeInteger(99999999999999)).toBe(true)
  })

  it('rechaza el importe o el signo ilegibles', () => {
    expect(amountCentsOrNull('3', '00000000030000', 'EUR')).toBeNull()
    expect(amountCentsOrNull('1', '000000000300O0', 'EUR')).toBeNull()
    expect(amountCentsOrNull('1', '        30000 ', 'EUR')).toBeNull()
  })

  /** Los dos decimales implícitos de la norma no valen para una divisa sin decimales. */
  it('rechaza una divisa que no tenga dos decimales', () => {
    expect(amountCentsOrNull('1', '00000000030000', 'JPY')).toBeNull()
  })
})
