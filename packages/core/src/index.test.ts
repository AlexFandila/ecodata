import { describe, expect, it } from 'vitest'
import { assertNever, CORE_VERSION } from './index'

describe('andamiaje de core', () => {
  it('expone una versión', () => {
    expect(CORE_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})

describe('assertNever', () => {
  it('lanza incluyendo el valor recibido', () => {
    expect(() => assertNever('inesperado' as never)).toThrow(/inesperado/)
  })

  it('permite personalizar el mensaje', () => {
    expect(() => assertNever(42 as never, 'Divisa desconocida')).toThrow(/Divisa desconocida/)
  })
})
