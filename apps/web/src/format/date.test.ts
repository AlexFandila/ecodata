/**
 * Todas las fechas de este fichero son inventadas.
 */
import { describe, expect, it } from 'vitest'
import { formatDay, formatFullDay } from './date'

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
