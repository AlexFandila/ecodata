/**
 * Todos los datos de este fichero son inventados: ni entidades, ni cuentas, ni
 * importes corresponden a nada real.
 */
import { describe, expect, it } from 'vitest'
import { Norma43FormatError } from './errors'
import { RECORD_LENGTH } from './layout'
import { decodeNorma43, parseStructure, splitRecords } from './records'
import { latin1Bytes, norma43Records, norma43Text } from './testing'

const EXTRACTO = {
  movements: [
    { amountCents: -30000, concepts: [{ first: 'TRANSF.SEPA NACIONAL', second: 'Alquiler' }] },
    { amountCents: 170890, concepts: [{ first: 'NOMIN.TRANF.NACIONAL', second: 'Nomina' }] },
  ],
}

describe('decodeNorma43', () => {
  it('decodifica latin-1: las eñes y las tildes sobreviven', () => {
    const texto = 'DEVOLUCIÓN AÑO ANTERIOR'
    expect(decodeNorma43(latin1Bytes(texto))).toBe(texto)
  })

  it('cree al BOM de UTF-8 cuando alguien ha pasado el fichero por un editor', () => {
    const texto = 'CUOTA ASOCIACIÓN'
    const utf8 = new TextEncoder().encode(texto)
    const conBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8])
    expect(decodeNorma43(conBom)).toBe(texto)
  })
})

describe('splitRecords', () => {
  it('trocea con los tres finales de línea', () => {
    const registros = norma43Records([EXTRACTO])
    for (const salto of ['\r\n', '\n', '\r']) {
      expect(splitRecords(registros.join(salto))).toEqual(registros)
    }
  })

  it('trocea un fichero sin ningún salto de línea, que la norma permite', () => {
    const registros = norma43Records([EXTRACTO])
    expect(splitRecords(registros.join(''))).toEqual(registros)
  })

  it('ignora el salto final y las líneas en blanco', () => {
    const registros = norma43Records([EXTRACTO])
    expect(splitRecords(`${registros.join('\r\n')}\r\n\r\n`)).toEqual(registros)
  })

  /**
   * Recortar los espacios finales de cada línea es lo que hace cualquier editor
   * por el que pase el fichero, y los últimos campos son relleno. De una
   * truncadura de verdad no protege esto, sino que los totales tienen que
   * cuadrar.
   */
  it('rellena un registro al que le falten espacios por la derecha', () => {
    const [primero, ...resto] = norma43Records([EXTRACTO])
    if (primero === undefined) throw new Error('fixture sin registros')

    const leidos = splitRecords([primero.trimEnd(), ...resto].join('\n'))

    expect(leidos[0]).toBe(primero)
    expect(leidos.every((registro) => registro.length === RECORD_LENGTH)).toBe(true)
  })

  it('rechaza un registro más largo de 80: ahí los desplazamientos ya mienten', () => {
    const registros = norma43Records([EXTRACTO])
    const [primero, ...resto] = registros
    if (primero === undefined) throw new Error('fixture sin registros')

    expect(() => splitRecords([`${primero} `, ...resto].join('\n'))).toThrow(Norma43FormatError)
  })

  it('rechaza un fichero sin saltos cuya longitud no es múltiplo de 80', () => {
    expect(() => splitRecords(`${norma43Records([EXTRACTO]).join('')}sobra`)).toThrow(
      Norma43FormatError,
    )
  })

  it('devuelve nada ante un fichero vacío', () => {
    expect(splitRecords('')).toEqual([])
    expect(splitRecords('\r\n\r\n')).toEqual([])
  })
})

describe('parseStructure', () => {
  it('agrupa cada movimiento con sus conceptos', () => {
    const estructura = parseStructure(splitRecords(norma43Text(EXTRACTO)))

    expect(estructura.blocks).toHaveLength(1)
    const [bloque] = estructura.blocks
    expect(bloque?.transactions).toHaveLength(2)
    expect(bloque?.transactions[0]?.ordinal).toBe(1)
    expect(bloque?.transactions[0]?.concepts).toHaveLength(1)
    expect(bloque?.transactions[1]?.ordinal).toBe(2)
    // 11 + (22 + 23) × 2 + 33 + 88
    expect(estructura.fileFooter).not.toBeNull()
    expect(estructura.recordCount).toBe(7)
  })

  it('cuenta el registro 88 en recordCount, que es lo que luego se compara', () => {
    const sinPie = parseStructure(splitRecords(norma43Text(EXTRACTO, { fileFooter: null })))

    expect(sinPie.fileFooter).toBeNull()
    expect(sinPie.recordCount).toBe(6)
  })

  it('admite varios bloques de cuenta: la norma los permite', () => {
    const estructura = parseStructure(splitRecords(norma43Text([EXTRACTO, EXTRACTO])))

    expect(estructura.blocks).toHaveLength(2)
    expect(estructura.blocks[1]?.transactions[0]?.ordinal).toBe(3)
  })

  it('rechaza un fichero vacío', () => {
    expect(() => parseStructure([])).toThrow(Norma43FormatError)
  })

  it('rechaza un movimiento sin cabecera de cuenta delante', () => {
    const registros = norma43Records([EXTRACTO]).filter((registro) => !registro.startsWith('11'))

    expect(() => parseStructure(registros)).toThrow(/sin una cabecera de cuenta/)
  })

  it('rechaza un concepto ampliado suelto', () => {
    const registros = norma43Records([EXTRACTO]).filter((registro) => !registro.startsWith('22'))

    expect(() => parseStructure(registros)).toThrow(/sin un movimiento/)
  })

  it('rechaza una cuenta que se queda sin su registro final', () => {
    const registros = norma43Records([EXTRACTO]).filter((registro) => !registro.startsWith('33'))

    expect(() => parseStructure(registros)).toThrow(/sin cerrar|sin su registro final/)
  })

  it('rechaza una cabecera de cuenta dentro de otra sin cerrar', () => {
    const registros = norma43Records([EXTRACTO])
    const cabecera = registros[0]
    if (cabecera === undefined) throw new Error('fixture sin registros')

    expect(() => parseStructure([cabecera, ...registros])).toThrow(/sin haber cerrado la anterior/)
  })

  it('rechaza registros después del fin de fichero', () => {
    const registros = norma43Records([EXTRACTO])
    const pie = registros.at(-1)
    if (pie === undefined) throw new Error('fixture sin registros')

    expect(() => parseStructure([...registros, pie])).toThrow(/debe ser el último/)
  })

  it('rechaza un código de registro que no existe', () => {
    const registros = norma43Records([EXTRACTO])
    const cabecera = registros[0]
    if (cabecera === undefined) throw new Error('fixture sin registros')

    expect(() => parseStructure([cabecera, `99${' '.repeat(78)}`, ...registros.slice(1)])).toThrow(
      /Código de registro desconocido/,
    )
  })
})
