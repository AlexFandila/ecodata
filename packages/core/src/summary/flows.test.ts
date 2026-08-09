/** Todos los importes de este fichero son inventados. */
import { describe, expect, it } from 'vitest'
import { SummaryError } from './errors'
import { monthlyFlows } from './flows'

const MONTHS = ['2026-01', '2026-02', '2026-03']

describe('monthlyFlows', () => {
  it('calcula el neto como ingresos menos gastos', () => {
    const flows = monthlyFlows({
      months: ['2026-03'],
      currencies: ['EUR'],
      rows: [{ month: '2026-03', currency: 'EUR', incomeCents: 210_000, expenseCents: 184_230 }],
    })

    expect(flows).toEqual([
      {
        month: '2026-03',
        currency: 'EUR',
        incomeCents: 210_000,
        expenseCents: 184_230,
        netCents: 25_770,
      },
    ])
  })

  it('el neto es negativo cuando el mes se come más de lo que entra', () => {
    const [flow] = monthlyFlows({
      months: ['2026-03'],
      currencies: ['EUR'],
      rows: [{ month: '2026-03', currency: 'EUR', incomeCents: 100_000, expenseCents: 130_000 }],
    })

    expect(flow?.netCents).toBe(-30_000)
  })

  it('un mes sin movimientos sale con ceros y NO se omite', () => {
    const flows = monthlyFlows({
      months: MONTHS,
      currencies: ['EUR'],
      rows: [{ month: '2026-03', currency: 'EUR', incomeCents: 1000, expenseCents: 400 }],
    })

    expect(flows).toHaveLength(3)
    expect(flows[0]).toEqual({
      month: '2026-01',
      currency: 'EUR',
      incomeCents: 0,
      expenseCents: 0,
      netCents: 0,
    })
    expect(flows.map((flow) => flow.month)).toEqual(MONTHS)
  })

  it('conserva el orden de los meses que se le da: el presente al final', () => {
    const flows = monthlyFlows({ months: MONTHS, currencies: ['EUR'], rows: [] })

    expect(flows.map((flow) => flow.month)).toEqual(['2026-01', '2026-02', '2026-03'])
  })

  it('cada divisa es su propia serie y nunca se suman entre sí', () => {
    const flows = monthlyFlows({
      months: ['2026-03'],
      currencies: ['EUR', 'USD'],
      rows: [
        { month: '2026-03', currency: 'EUR', incomeCents: 1000, expenseCents: 0 },
        { month: '2026-03', currency: 'USD', incomeCents: 0, expenseCents: 700 },
      ],
    })

    expect(flows).toEqual([
      { month: '2026-03', currency: 'EUR', incomeCents: 1000, expenseCents: 0, netCents: 1000 },
      { month: '2026-03', currency: 'USD', incomeCents: 0, expenseCents: 700, netCents: -700 },
    ])
  })

  it('acumula el ingreso y el gasto que lleguen en filas separadas', () => {
    const [flow] = monthlyFlows({
      months: ['2026-03'],
      currencies: ['EUR'],
      rows: [
        { month: '2026-03', currency: 'EUR', incomeCents: 1000, expenseCents: 0 },
        { month: '2026-03', currency: 'EUR', incomeCents: 0, expenseCents: 250 },
      ],
    })

    expect(flow).toEqual({
      month: '2026-03',
      currency: 'EUR',
      incomeCents: 1000,
      expenseCents: 250,
      netCents: 750,
    })
  })

  it('una fila de un mes fuera de la serie es un descuadre y aborta', () => {
    expect(() =>
      monthlyFlows({
        months: MONTHS,
        currencies: ['EUR'],
        rows: [{ month: '2025-12', currency: 'EUR', incomeCents: 1000, expenseCents: 0 }],
      }),
    ).toThrow(SummaryError)
  })

  it('una fila de una divisa que no está en la lista también aborta', () => {
    expect(() =>
      monthlyFlows({
        months: MONTHS,
        currencies: ['EUR'],
        rows: [{ month: '2026-01', currency: 'JPY', incomeCents: 1000, expenseCents: 0 }],
      }),
    ).toThrow(/JPY/)
  })

  it('sin divisas no hay serie, aunque haya meses', () => {
    expect(monthlyFlows({ months: MONTHS, currencies: [], rows: [] })).toEqual([])
  })
})
