import { describe, expect, it } from 'vitest'
import { createImportRequestSchema, importResultResponseSchema, importStatsSchema } from './imports'

describe('createImportRequestSchema', () => {
  it('coacciona los campos de un formulario multipart, que llegan en texto', () => {
    const result = createImportRequestSchema.parse({
      accountId: '2',
      source: 'norma43',
      fileName: 'movimientos-marzo.csv',
    })

    expect(result.accountId).toBe(2)
    expect(result.source).toBe('norma43')
  })

  it('el nombre del fichero es opcional', () => {
    expect(
      createImportRequestSchema.parse({ accountId: '1', source: 'revolut_csv' }).fileName,
    ).toBeNull()
  })

  it('rechaza un adaptador que no existe', () => {
    expect(
      createImportRequestSchema.safeParse({ accountId: '1', source: 'bbva_csv' }).success,
    ).toBe(false)
  })

  it('rechaza una cuenta que no puede ser un id', () => {
    for (const accountId of ['0', '-1', 'primera', '']) {
      expect(createImportRequestSchema.safeParse({ accountId, source: 'norma43' }).success).toBe(
        false,
      )
    }
  })
})

describe('importStatsSchema', () => {
  it('acepta un recuento con duplicados, que son lo normal al reimportar', () => {
    const stats = importStatsSchema.parse({ read: 120, inserted: 95, duplicated: 25, errors: 0 })

    expect(stats.duplicated).toBe(25)
  })

  it('acepta un import que no insertó nada: el fichero ya estaba entero', () => {
    expect(
      importStatsSchema.parse({ read: 40, inserted: 0, duplicated: 40, errors: 0 }).inserted,
    ).toBe(0)
  })

  it('rechaza recuentos negativos o fraccionarios', () => {
    expect(
      importStatsSchema.safeParse({ read: 10, inserted: -1, duplicated: 0, errors: 0 }).success,
    ).toBe(false)
    expect(
      importStatsSchema.safeParse({ read: 10.5, inserted: 10, duplicated: 0, errors: 0 }).success,
    ).toBe(false)
  })

  it('exige los cuatro recuentos', () => {
    expect(importStatsSchema.safeParse({ read: 10, inserted: 10 }).success).toBe(false)
  })
})

describe('importResultResponseSchema', () => {
  const resultado = {
    importId: 7,
    accountId: 2,
    source: 'norma43',
    fileName: 'movimientos-marzo.csv',
    importedAt: '2026-04-01T18:20:00Z',
    stats: { read: 120, inserted: 95, duplicated: 25, errors: 0 },
    rowErrors: [],
  }

  it('acepta un import limpio', () => {
    expect(importResultResponseSchema.parse(resultado).stats.inserted).toBe(95)
  })

  it('lleva las filas que fallaron con su número de línea', () => {
    const result = importResultResponseSchema.parse({
      ...resultado,
      stats: { read: 120, inserted: 93, duplicated: 25, errors: 2 },
      rowErrors: [
        { row: 14, message: 'Importe ilegible: "--42,50"' },
        { row: 87, message: 'Fecha ilegible: "31/02/2026"' },
      ],
    })

    expect(result.rowErrors.map((e) => e.row)).toEqual([14, 87])
  })

  it('numera las filas desde 1: la cabecera no cuenta', () => {
    expect(
      importResultResponseSchema.safeParse({
        ...resultado,
        rowErrors: [{ row: 0, message: 'x' }],
      }).success,
    ).toBe(false)
  })

  it('exige un instante ISO en importedAt', () => {
    expect(
      importResultResponseSchema.safeParse({ ...resultado, importedAt: 1775067600000 }).success,
    ).toBe(false)
  })
})
