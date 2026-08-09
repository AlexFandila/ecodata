/**
 * Todas las fechas de este fichero son inventadas.
 */
import { describe, expect, it } from 'vitest'
import { formatDay, formatFullDay, formatMonth, formatMonthShort } from './date'

describe('formatDay', () => {
  it('deja el día y el mes abreviado, que es lo que cabe en la lista', () => {
    expect(formatDay('2026-03-12')).toBe('12 mar')
  })

  it('el primero de mes sigue siendo el primero de mes', () => {
    // El caso que se desfasaría con `new Date(iso)` formateado en la zona
    // local: el 1 a las 00:00 UTC es todavía el 31 del mes anterior en
    // cualquier zona al oeste de Greenwich. Aquí no puede pasar porque las dos
    // mitades —el parseo y el formato— van fijadas a UTC.
    expect(formatDay('2026-01-01')).toBe('1 ene')
    expect(formatFullDay('2026-01-01')).toBe('1 de enero de 2026')
  })

  it('devuelve tal cual lo que no tiene forma de fecha, en vez de esconderlo', () => {
    expect(formatDay('vaya por dios')).toBe('vaya por dios')
  })
})

describe('formatFullDay', () => {
  it('escribe el mes entero y el año, que en el detalle sí caben', () => {
    expect(formatFullDay('2026-03-12')).toBe('12 de marzo de 2026')
  })
})

describe('formatMonth', () => {
  it('escribe el mes y el año, que es la cabecera del dashboard', () => {
    expect(formatMonth('2026-08')).toBe('agosto de 2026')
  })

  it('enero no se cae a diciembre del año anterior', () => {
    // El mismo desfase que vigila `formatDay`, pero en un dato mensual costaría
    // un mes entero y no un día: formateado en hora local, el 1 de enero a las
    // 00:00 UTC es 31 de diciembre al oeste de Greenwich.
    expect(formatMonth('2026-01')).toBe('enero de 2026')
  })

  it('devuelve tal cual lo que no tiene forma de mes', () => {
    expect(formatMonth('agosto')).toBe('agosto')
  })
})

describe('formatMonthShort', () => {
  it('deja tres letras sin punto, que es lo que cabe bajo una barra', () => {
    expect(formatMonthShort('2026-08')).toBe('ago')
    expect(formatMonthShort('2026-01')).toBe('ene')
  })
})
