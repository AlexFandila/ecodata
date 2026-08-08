/**
 * Todos los datos de este fichero son inventados: comercios, nombres e importes
 * no corresponden a nada real.
 */
import { describe, expect, it } from 'vitest'
import { decodeRevolutCsv, parseCsv, readCsv } from './csv'
import { RevolutCsvFormatError } from './errors'

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

describe('parseCsv · celdas y filas', () => {
  it('trocea por comas y por saltos de línea', () => {
    expect(parseCsv('a,b,c\nd,e,f')).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ])
  })

  it('admite los tres finales de línea', () => {
    const esperado = [['a'], ['b'], ['c']]

    expect(parseCsv('a\r\nb\r\nc')).toEqual(esperado)
    expect(parseCsv('a\nb\nc')).toEqual(esperado)
    expect(parseCsv('a\rb\rc')).toEqual(esperado)
  })

  it('el salto final no inventa una fila vacía', () => {
    expect(parseCsv('a,b\n')).toEqual([['a', 'b']])
    expect(parseCsv('a,b\r\n')).toEqual([['a', 'b']])
  })

  it('la última línea puede quedarse sin salto', () => {
    expect(parseCsv('a,b\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  it('conserva las celdas vacías, que son un dato', () => {
    expect(parseCsv('a,,c')).toEqual([['a', '', 'c']])
    expect(parseCsv('a,b,')).toEqual([['a', 'b', '']])
  })

  it('un texto vacío no da ninguna fila', () => {
    expect(parseCsv('')).toEqual([])
  })
})

describe('parseCsv · comillas', () => {
  it('una coma dentro de comillas no parte la celda', () => {
    expect(parseCsv('Pago con tarjeta,"Comercio Ejemplo, S.L.",-24.50')).toEqual([
      ['Pago con tarjeta', 'Comercio Ejemplo, S.L.', '-24.50'],
    ])
  })

  it('dos comillas seguidas son una comilla literal', () => {
    expect(parseCsv('"Bar ""El Ejemplo""",12.00')).toEqual([['Bar "El Ejemplo"', '12.00']])
  })

  it('un salto de línea dentro de comillas no parte la fila', () => {
    expect(parseCsv('"primera\nsegunda",b\nc,d')).toEqual([
      ['primera\nsegunda', 'b'],
      ['c', 'd'],
    ])
  })

  it('una comilla en mitad de una celda sin comillas es un carácter más', () => {
    expect(parseCsv('12" x 8,b')).toEqual([['12" x 8', 'b']])
  })

  it('una celda entrecomillada vacía es una celda vacía', () => {
    expect(parseCsv('a,"",c')).toEqual([['a', '', 'c']])
  })

  it('una comilla sin cerrar es error de fichero', () => {
    expect(() => parseCsv('a,"sin cerrar\nb,c')).toThrow(RevolutCsvFormatError)
    expect(() => parseCsv('a,"sin cerrar\nb,c')).toThrow(/comilla sin cerrar/)
  })
})

describe('decodeRevolutCsv · bytes a texto', () => {
  it('decodifica UTF-8', () => {
    expect(decodeRevolutCsv(utf8('Descripción,Comisión'))).toBe('Descripción,Comisión')
  })

  it('se traga el BOM en vez de meterlo en la primera columna', () => {
    const conBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('Tipo,Producto')])

    expect(decodeRevolutCsv(conBom)).toBe('Tipo,Producto')
  })

  it('unos bytes que no son UTF-8 no son un extracto de Revolut', () => {
    // 0xF1 suelta es la eñe en latin-1, y no es UTF-8 válido.
    const latin1 = new Uint8Array([0x41, 0xf1, 0x42])

    expect(() => decodeRevolutCsv(latin1)).toThrow(RevolutCsvFormatError)
    expect(() => decodeRevolutCsv(latin1)).toThrow(/UTF-8/)
  })
})

describe('readCsv · de bytes a tabla', () => {
  it('encadena decodificación y troceado', () => {
    expect(readCsv(utf8('Tipo,Divisa\nRecargas,EUR\n'))).toEqual([
      ['Tipo', 'Divisa'],
      ['Recargas', 'EUR'],
    ])
  })
})
