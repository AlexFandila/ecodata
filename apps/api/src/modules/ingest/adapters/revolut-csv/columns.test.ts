/**
 * Todos los datos de este fichero son inventados.
 */
import { describe, expect, it } from 'vitest'
import { COLUMN_NAMES, cell, locateColumns } from './columns'
import { RevolutCsvFormatError } from './errors'

/** La cabecera literal del export `es-ES` que se inspeccionó (ADR-011). */
const CABECERA_ES = [
  'Tipo',
  'Producto',
  'Fecha de inicio',
  'Fecha de finalización',
  'Descripción',
  'Importe',
  'Comisión',
  'Divisa',
  'State',
  'Saldo',
]

const CABECERA_EN = [
  'Type',
  'Product',
  'Started Date',
  'Completed Date',
  'Description',
  'Amount',
  'Fee',
  'Currency',
  'State',
  'Balance',
]

describe('locateColumns · idiomas', () => {
  it('localiza las diez columnas del export en español', () => {
    const columnas = locateColumns(CABECERA_ES)

    expect(columnas).toEqual({
      type: 0,
      product: 1,
      startedAt: 2,
      completedAt: 3,
      description: 4,
      amount: 5,
      fee: 6,
      currency: 7,
      state: 8,
      balance: 9,
    })
  })

  it('localiza las mismas columnas en el export en inglés', () => {
    expect(locateColumns(CABECERA_EN)).toEqual(locateColumns(CABECERA_ES))
  })

  it('no le importan los acentos, las mayúsculas ni los espacios de sobra', () => {
    const maltratada = CABECERA_ES.map((nombre) => ` ${nombre.toUpperCase()} `).map((nombre) =>
      nombre.normalize('NFD').replace(/\p{Diacritic}/gu, ''),
    )

    expect(locateColumns(maltratada)).toEqual(locateColumns(CABECERA_ES))
  })

  it('lee las columnas por nombre, no por posición', () => {
    const desordenada = [...CABECERA_ES].reverse()

    expect(locateColumns(desordenada).type).toBe(9)
    expect(locateColumns(desordenada).balance).toBe(0)
  })

  it('una columna de más no estorba', () => {
    const conExtra = ['Referencia', ...CABECERA_ES, 'Etiquetas']

    expect(locateColumns(conExtra).type).toBe(1)
  })
})

describe('locateColumns · cabecera que no sirve', () => {
  it('que falte una columna es error de fichero, y dice cuál', () => {
    const sinImporte = CABECERA_ES.filter((nombre) => nombre !== 'Importe')

    expect(() => locateColumns(sinImporte)).toThrow(RevolutCsvFormatError)
    expect(() => locateColumns(sinImporte)).toThrow(/Importe/)
  })

  it('una cabecera de otra cosa se rechaza entera', () => {
    expect(() => locateColumns(['fecha', 'concepto', 'importe_eur'])).toThrow(RevolutCsvFormatError)
  })

  it('el mensaje enseña la cabecera encontrada, para ver qué se ha exportado', () => {
    expect(() => locateColumns(['fecha', 'concepto'])).toThrow(/fecha, concepto/)
  })
})

describe('cell · lectura de una celda', () => {
  const columnas = locateColumns(CABECERA_ES)

  it('devuelve la celda de la columna pedida', () => {
    const fila = ['Recargas', 'Actual', '', '', 'Nombre Ejemplo', '300.00', '0.00', 'EUR', '', '']

    expect(cell(fila, columnas, 'description')).toBe('Nombre Ejemplo')
    expect(cell(fila, columnas, 'amount')).toBe('300.00')
  })

  it('una fila corta da cadena vacía, no undefined', () => {
    expect(cell(['Recargas'], columnas, 'balance')).toBe('')
  })
})

describe('COLUMN_NAMES', () => {
  it('son las diez columnas del extracto', () => {
    expect(COLUMN_NAMES).toHaveLength(10)
  })
})
