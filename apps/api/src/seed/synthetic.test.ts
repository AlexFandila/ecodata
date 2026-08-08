/**
 * Todos los datos de este fichero son inventados.
 */
import { describe, expect, it } from 'vitest'
import { norma43Bytes, revolutCsvBytes } from '../modules/ingest/index'
import { SEED_MONTHS, syntheticSeed } from './synthetic'

/** Una fecha fija: lo que el CLI hace con «hoy», los tests lo hacen con esto. */
const END_DATE = '2026-08-08'

describe('syntheticSeed', () => {
  it('cubre los tres meses que acaban en la fecha dada', () => {
    const seed = syntheticSeed({ endDate: END_DATE })

    expect(seed.period).toEqual({ from: '2026-06-01', to: END_DATE })
    expect(SEED_MONTHS).toBe(3)
  })

  it('cruza el año hacia atrás sin inventarse un mes trece', () => {
    const seed = syntheticSeed({ endDate: '2026-01-20' })

    expect(seed.period.from).toBe('2025-11-01')
  })

  it('no emite nada posterior a la fecha final', () => {
    const seed = syntheticSeed({ endDate: END_DATE })

    // `AAMMDD`: el 8 de agosto de 2026 es `260808`, y ordena como texto.
    for (const movement of seed.unicaja.movements ?? []) {
      expect((movement.operationDate ?? '') <= '260808').toBe(true)
    }
    for (const movement of seed.revolut.movements ?? []) {
      expect((movement.completedAt ?? '').slice(0, 10) <= END_DATE).toBe(true)
    }
  })

  it('emite los movimientos en orden cronológico', () => {
    const seed = syntheticSeed({ endDate: END_DATE })

    const dates = (seed.revolut.movements ?? []).map((movement) =>
      (movement.completedAt ?? '').slice(0, 10),
    )
    expect(dates).toEqual([...dates].sort())
  })

  it('reparte un traspaso por mes completo, cada uno de importe distinto', () => {
    const seed = syntheticSeed({ endDate: '2026-08-31' })

    expect(seed.transferCount).toBe(SEED_MONTHS)

    // Que sean distintos es lo que evita los empates del matcher (ADR-013).
    const incoming = (seed.revolut.movements ?? [])
      .filter((movement) => movement.type === 'Transferencia')
      .map((movement) => movement.amountCents)
    expect(incoming).toHaveLength(SEED_MONTHS)
    expect(new Set(incoming).size).toBe(SEED_MONTHS)
  })

  it('corta el mes en curso por la fecha final, traspasos incluidos', () => {
    // El 8 de agosto todavía no ha llegado el traspaso del día 18: la semilla no
    // adelanta movimientos para cuadrar un número redondo.
    const seed = syntheticSeed({ endDate: END_DATE })

    expect(seed.transferCount).toBe(SEED_MONTHS - 1)
  })

  it('es determinista: la misma fecha final produce los mismos bytes', () => {
    const first = syntheticSeed({ endDate: END_DATE })
    const second = syntheticSeed({ endDate: END_DATE })

    expect(norma43Bytes(second.unicaja)).toEqual(norma43Bytes(first.unicaja))
    expect(revolutCsvBytes(second.revolut)).toEqual(revolutCsvBytes(first.revolut))
  })

  it('mete movimientos en más de una divisa en la cuenta de Revolut', () => {
    const seed = syntheticSeed({ endDate: END_DATE })

    const currencies = new Set(
      (seed.revolut.movements ?? []).map((movement) => movement.currency ?? 'EUR'),
    )
    expect(currencies.size).toBeGreaterThan(1)
  })
})
