/**
 * Todos los datos de este fichero son inventados.
 */
import { IMPORT_SOURCES } from '@finanzas/shared'
import { describe, expect, it } from 'vitest'
import { norma43Adapter, revolutCsvAdapter, sourceFor } from './index'

describe('sourceFor', () => {
  it('devuelve el adaptador de la fuente pedida', () => {
    expect(sourceFor('norma43')).toBe(norma43Adapter)
    expect(sourceFor('revolut_csv')).toBe(revolutCsvAdapter)
  })

  /**
   * El compilador ya impide que un literal de `IMPORT_SOURCES` se quede sin
   * adaptador, porque el mapa es un `Record` completo. Este test lo comprueba
   * además en ejecución, que es lo que ve el pipeline: un `undefined` colándose
   * por aquí reventaría con el import ya abierto.
   */
  it('todas las fuentes del contrato tienen adaptador', () => {
    for (const source of IMPORT_SOURCES) {
      expect(sourceFor(source)).toBeDefined()
    }
  })

  it('cada adaptador se identifica con la fuente por la que se le pide', () => {
    for (const source of IMPORT_SOURCES) {
      expect(sourceFor(source).id).toBe(source)
    }
  })
})
