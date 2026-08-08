/**
 * Todos los datos de este fichero son inventados: ni cuentas, ni comercios, ni
 * importes reales.
 */
import { describe, expect, it } from 'vitest'
import { daysBetween, isCalendarDate, tryDaysBetween } from './days'

describe('daysBetween', () => {
  it('cuenta cero días entre la misma fecha', () => {
    expect(daysBetween('2026-03-15', '2026-03-15')).toBe(0)
  })

  it('cuenta los días con signo según el orden de los argumentos', () => {
    expect(daysBetween('2026-03-15', '2026-03-18')).toBe(3)
    expect(daysBetween('2026-03-18', '2026-03-15')).toBe(-3)
  })

  it('cruza el cambio de mes', () => {
    expect(daysBetween('2026-01-30', '2026-02-02')).toBe(3)
    expect(daysBetween('2026-04-30', '2026-05-01')).toBe(1)
  })

  it('cruza el cambio de año', () => {
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1)
    expect(daysBetween('2025-12-30', '2026-01-02')).toBe(3)
  })

  it('cuenta el 29 de febrero de un año bisiesto', () => {
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2)
    expect(daysBetween('2025-02-28', '2025-03-01')).toBe(1)
  })

  it('trata las fechas como fechas de calendario y no como instantes: el cambio de hora no añade ni quita días', () => {
    // Los dos domingos en que Madrid cambia la hora en 2026. Con aritmética en
    // hora local, uno de estos días dura 23 h y el otro 25 h, y la diferencia
    // saldría 0 o 2 en vez de 1. En UTC no existe el problema.
    expect(daysBetween('2026-03-28', '2026-03-29')).toBe(1)
    expect(daysBetween('2026-10-24', '2026-10-25')).toBe(1)
  })

  it('lanza si la fecha no tiene la forma ISO YYYY-MM-DD', () => {
    expect(() => daysBetween('15/03/2026', '2026-03-15')).toThrow(/inválida/i)
    expect(() => daysBetween('2026-3-15', '2026-03-15')).toThrow(/inválida/i)
    expect(() => daysBetween('2026-03-15T00:00:00Z', '2026-03-15')).toThrow(/inválida/i)
    expect(() => daysBetween('', '2026-03-15')).toThrow(/inválida/i)
  })

  it('lanza si la fecha tiene la forma correcta pero el día no existe', () => {
    // La base valida `booked_at` con un CHECK ... GLOB, que solo mira la forma:
    // estas dos pasarían esa comprobación.
    expect(() => daysBetween('2026-02-31', '2026-03-01')).toThrow(/inválida/i)
    expect(() => daysBetween('2025-02-29', '2025-03-01')).toThrow(/inválida/i)
  })

  it('lanza si el mes o el día están fuera de rango', () => {
    expect(() => daysBetween('2026-13-01', '2026-03-15')).toThrow(/inválida/i)
    expect(() => daysBetween('2026-00-10', '2026-03-15')).toThrow(/inválida/i)
    expect(() => daysBetween('2026-01-00', '2026-03-15')).toThrow(/inválida/i)
  })

  it('nombra en el mensaje la fecha que falla, sea la primera o la segunda', () => {
    expect(() => daysBetween('2026-02-31', '2026-03-15')).toThrow(/2026-02-31/)
    expect(() => daysBetween('2026-03-15', '2026-02-31')).toThrow(/2026-02-31/)
  })
})

describe('isCalendarDate', () => {
  it('acepta el 29 de febrero de un año bisiesto y rechaza el del que no lo es', () => {
    expect(isCalendarDate('2024-02-29')).toBe(true)
    expect(isCalendarDate('2025-02-29')).toBe(false)
  })

  it('acepta una fecha corriente y rechaza la que solo tiene la forma', () => {
    expect(isCalendarDate('2026-03-15')).toBe(true)
    expect(isCalendarDate('2026-02-31')).toBe(false)
    expect(isCalendarDate('15/03/2026')).toBe(false)
  })
})

describe('tryDaysBetween', () => {
  it('devuelve null en vez de lanzar con una fecha inválida', () => {
    expect(tryDaysBetween('2026-02-31', '2026-03-01')).toBeNull()
    expect(tryDaysBetween('2026-03-01', 'ayer')).toBeNull()
  })

  it('coincide con daysBetween cuando las dos fechas son válidas', () => {
    expect(tryDaysBetween('2026-03-15', '2026-03-18')).toBe(daysBetween('2026-03-15', '2026-03-18'))
  })
})
