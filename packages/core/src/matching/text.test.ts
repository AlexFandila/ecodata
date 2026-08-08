/**
 * Todos los datos de este fichero son inventados: ni cuentas, ni comercios, ni
 * importes reales.
 */
import { describe, expect, it } from 'vitest'
import { containsWord, normalizeForMatching } from './text'

describe('normalizeForMatching', () => {
  it('iguala mayúsculas y minúsculas', () => {
    expect(normalizeForMatching('Revolut')).toBe('REVOLUT')
    expect(normalizeForMatching('revolut')).toBe(normalizeForMatching('REVOLUT'))
  })

  it('quita los acentos y trata la eñe como N', () => {
    expect(normalizeForMatching('José Muñoz')).toBe('JOSE MUNOZ')
    expect(normalizeForMatching('CAFÉ')).toBe(normalizeForMatching('CAFE'))
  })

  it('unifica las formas NFC y NFD del mismo texto', () => {
    const compuesto = 'CAFÉ EJEMPLO'
    const descompuesto = 'CAFE\u0301 EJEMPLO'
    expect(compuesto).not.toBe(descompuesto)
    expect(normalizeForMatching(compuesto)).toBe(normalizeForMatching(descompuesto))
  })

  it('colapsa la puntuación y los espacios repetidos en un solo espacio', () => {
    expect(normalizeForMatching('TRANSF.  SEPA   NACIONAL')).toBe('TRANSF SEPA NACIONAL')
    expect(normalizeForMatching('Revolut**1234')).toBe('REVOLUT 1234')
    expect(normalizeForMatching('  UNICAJA  ')).toBe('UNICAJA')
  })

  it('conserva los dígitos', () => {
    expect(normalizeForMatching('Recarga 4567')).toBe('RECARGA 4567')
  })

  it('deja vacío un texto que solo tenía puntuación', () => {
    expect(normalizeForMatching('***')).toBe('')
    expect(normalizeForMatching('   ')).toBe('')
    expect(normalizeForMatching('')).toBe('')
  })
})

describe('containsWord', () => {
  it('reconoce el nombre como palabra completa y no como parte de otra', () => {
    expect(containsWord('TRANSFERENCIA A REVOLUT', 'REVOLUT')).toBe(true)
    expect(containsWord('COMPRA DE PLATANOS', 'ANA')).toBe(false)
  })

  it('reconoce el nombre al principio y al final del texto', () => {
    expect(containsWord('REVOLUT BANK UAB', 'REVOLUT')).toBe(true)
    expect(containsWord('TRASPASO A UNICAJA', 'UNICAJA')).toBe(true)
    expect(containsWord('UNICAJA', 'UNICAJA')).toBe(true)
  })

  it('reconoce un nombre de varias palabras', () => {
    expect(containsWord('TRANSF DE ALEX EJEMPLO SANZ', 'ALEX EJEMPLO')).toBe(true)
    expect(containsWord('TRANSF DE ALEX SANZ', 'ALEX EJEMPLO')).toBe(false)
  })

  it('ignora las agujas de menos de tres caracteres', () => {
    expect(containsWord('PAGO EN EL SUPER', 'EL')).toBe(false)
    expect(containsWord('PAGO EN EL SUPER', '')).toBe(false)
  })

  it('no encuentra nada en un texto vacío', () => {
    expect(containsWord('', 'REVOLUT')).toBe(false)
  })
})
