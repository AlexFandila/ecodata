/**
 * Todos los datos de este fichero son inventados.
 */
import { IMPORT_SOURCES } from '@finanzas/shared'
import { describe, expect, it } from 'vitest'
import { norma43Adapter, sourceFor } from './index'

describe('sourceFor', () => {
  it('devuelve el adaptador de la fuente pedida', () => {
    expect(sourceFor('norma43')).toBe(norma43Adapter)
  })

  /**
   * `revolut_csv` ya tiene literal en los contratos pero todavía no adaptador.
   * Que falle diciéndolo es mejor que devolver un `undefined` que reventaría
   * más adelante, con el import ya abierto.
   */
  it('falla de forma explícita ante una fuente sin adaptador todavía', () => {
    expect(() => sourceFor('revolut_csv')).toThrow(/Todavía no hay adaptador/)
  })

  it('el id del adaptador es uno de los literales del contrato', () => {
    expect(IMPORT_SOURCES).toContain(norma43Adapter.id)
  })
})
