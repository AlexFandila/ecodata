import { describe, expect, it } from 'vitest'
import { CalendarDateError } from './errors'
import { addMonths, isCalendarMonth, monthOf, monthRange, monthsEndingAt } from './months'

describe('isCalendarMonth', () => {
  it('acepta un mes ISO', () => {
    expect(isCalendarMonth('2026-03')).toBe(true)
  })

  it('rechaza un mes que no existe', () => {
    expect(isCalendarMonth('2026-13')).toBe(false)
    expect(isCalendarMonth('2026-00')).toBe(false)
  })

  it('exige dos cifras en el mes: la forma es la del contrato, no la abreviada', () => {
    expect(isCalendarMonth('2026-3')).toBe(false)
  })

  it('rechaza un día: un mes no lleva día', () => {
    expect(isCalendarMonth('2026-03-15')).toBe(false)
  })
})

describe('monthOf', () => {
  it('recorta el mes de un día', () => {
    expect(monthOf('2026-03-15')).toBe('2026-03')
  })

  it('conserva el mes de un 31, que es donde falla sumar días', () => {
    expect(monthOf('2026-01-31')).toBe('2026-01')
  })

  it('lanza si el texto no es un día ISO', () => {
    expect(() => monthOf('2026-03')).toThrow(CalendarDateError)
  })

  it('lanza si el día no existe en el calendario, no solo si tiene mala forma', () => {
    expect(() => monthOf('2026-13-01')).toThrow(/Fecha de calendario inválida/)
    expect(() => monthOf('2026-02-31')).toThrow(CalendarDateError)
    expect(() => monthOf('2024-02-29')).not.toThrow()
  })
})

describe('monthRange', () => {
  it('da el primer y el último día de un mes de 31', () => {
    expect(monthRange('2026-03')).toEqual({ from: '2026-03-01', to: '2026-03-31' })
  })

  it('da 30 en un mes de 30', () => {
    expect(monthRange('2026-04')).toEqual({ from: '2026-04-01', to: '2026-04-30' })
  })

  it('febrero de un año bisiesto acaba el 29', () => {
    expect(monthRange('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
  })

  it('febrero de un año normal acaba el 28', () => {
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })

  it('2000 fue bisiesto pese a ser múltiplo de 100: lo sabe el calendario, no nosotros', () => {
    expect(monthRange('2000-02').to).toBe('2000-02-29')
  })

  it('1900 no lo fue', () => {
    expect(monthRange('1900-02').to).toBe('1900-02-28')
  })

  it('lanza con un mes inválido', () => {
    expect(() => monthRange('2026-13')).toThrow(CalendarDateError)
  })
})

describe('addMonths', () => {
  it('suma dentro del mismo año', () => {
    expect(addMonths('2026-03', 2)).toBe('2026-05')
  })

  it('enero más uno es febrero, no el 3 de marzo', () => {
    expect(addMonths('2026-01', 1)).toBe('2026-02')
  })

  it('cruza el cambio de año hacia adelante', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02')
  })

  it('cruza el cambio de año hacia atrás', () => {
    expect(addMonths('2026-02', -3)).toBe('2025-11')
  })

  it('sumar cero devuelve el mismo mes', () => {
    expect(addMonths('2026-07', 0)).toBe('2026-07')
  })

  it('diciembre más uno es enero del siguiente', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01')
  })

  it('lanza con un desplazamiento que no es entero', () => {
    expect(() => addMonths('2026-03', 1.5)).toThrow(/entero/)
  })
})

describe('monthsEndingAt', () => {
  it('incluye el mes pedido y lo pone el último: el presente va a la derecha', () => {
    expect(monthsEndingAt('2026-03', 3)).toEqual(['2026-01', '2026-02', '2026-03'])
  })

  it('la serie de seis meses del dashboard cruza el año sin saltarse ninguno', () => {
    expect(monthsEndingAt('2026-02', 6)).toEqual([
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ])
  })

  it('pedir uno devuelve solo ese mes', () => {
    expect(monthsEndingAt('2026-03', 1)).toEqual(['2026-03'])
  })

  it('lanza si se piden cero meses o menos', () => {
    expect(() => monthsEndingAt('2026-03', 0)).toThrow(/entero positivo/)
    expect(() => monthsEndingAt('2026-03', -1)).toThrow(/entero positivo/)
  })

  it('lanza con un mes inválido', () => {
    expect(() => monthsEndingAt('2026-13', 3)).toThrow(CalendarDateError)
  })
})
