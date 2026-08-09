/**
 * Todos los datos de este fichero son inventados. Los ids imitan al árbol que
 * siembra `seedCategories`: madres (10 vivienda, 20 alimentación) con sus hijas
 * (11 alquiler, 12 suministros, 21 supermercado…).
 */
import { describe, expect, it } from 'vitest'
import { spendingByParent } from './spending'

/** `null` = ya es madre, que es como lo devuelve la tabla `categories`. */
const TREE = new Map<number, number | null>([
  [10, null],
  [11, 10],
  [12, 10],
  [20, null],
  [21, 20],
  [30, null],
])

describe('spendingByParent', () => {
  it('las hijas suman en su madre y quedan como desglose', () => {
    const spending = spendingByParent({
      rows: [
        { categoryId: 11, currency: 'EUR', amountCents: 85_000 },
        { categoryId: 12, currency: 'EUR', amountCents: 12_400 },
      ],
      parentOf: TREE,
    })

    expect(spending).toEqual([
      {
        categoryId: 10,
        currency: 'EUR',
        amountCents: 97_400,
        children: [
          { categoryId: 11, amountCents: 85_000 },
          { categoryId: 12, amountCents: 12_400 },
        ],
      },
    ])
  })

  it('el gasto que va directo a la madre no abre desglose contra sí misma', () => {
    const spending = spendingByParent({
      rows: [{ categoryId: 30, currency: 'EUR', amountCents: 5000 }],
      parentOf: TREE,
    })

    expect(spending).toEqual([{ categoryId: 30, currency: 'EUR', amountCents: 5000, children: [] }])
  })

  it('suma el gasto directo de la madre con el de sus hijas', () => {
    const [vivienda] = spendingByParent({
      rows: [
        { categoryId: 10, currency: 'EUR', amountCents: 1000 },
        { categoryId: 11, currency: 'EUR', amountCents: 4000 },
      ],
      parentOf: TREE,
    })

    expect(vivienda?.amountCents).toBe(5000)
    expect(vivienda?.children).toEqual([{ categoryId: 11, amountCents: 4000 }])
  })

  it('«sin categorizar» es una fila más, para que la suma cuadre con el mes', () => {
    const spending = spendingByParent({
      rows: [
        { categoryId: 21, currency: 'EUR', amountCents: 30_000 },
        { categoryId: null, currency: 'EUR', amountCents: 4500 },
      ],
      parentOf: TREE,
    })

    expect(spending.map((row) => row.categoryId)).toEqual([20, null])
    expect(spending.reduce((total, row) => total + row.amountCents, 0)).toBe(34_500)
  })

  it('a igualdad de importe, «sin categorizar» va al final', () => {
    const spending = spendingByParent({
      rows: [
        { categoryId: null, currency: 'EUR', amountCents: 1000 },
        { categoryId: 30, currency: 'EUR', amountCents: 1000 },
      ],
      parentOf: TREE,
    })

    expect(spending.map((row) => row.categoryId)).toEqual([30, null])
  })

  it('ordena de mayor a menor gasto', () => {
    const spending = spendingByParent({
      rows: [
        { categoryId: 21, currency: 'EUR', amountCents: 10_000 },
        { categoryId: 11, currency: 'EUR', amountCents: 90_000 },
        { categoryId: 30, currency: 'EUR', amountCents: 50_000 },
      ],
      parentOf: TREE,
    })

    expect(spending.map((row) => row.categoryId)).toEqual([10, 30, 20])
  })

  it('a igualdad de importe desempata el id ascendente, para que la lista no baile', () => {
    const spending = spendingByParent({
      rows: [
        { categoryId: 30, currency: 'EUR', amountCents: 1000 },
        { categoryId: 10, currency: 'EUR', amountCents: 1000 },
        { categoryId: 20, currency: 'EUR', amountCents: 1000 },
      ],
      parentOf: TREE,
    })

    expect(spending.map((row) => row.categoryId)).toEqual([10, 20, 30])
  })

  it('una categoría que ya no está en el árbol se trata como madre y no pierde su importe', () => {
    const spending = spendingByParent({
      rows: [{ categoryId: 99, currency: 'EUR', amountCents: 700 }],
      parentOf: TREE,
    })

    expect(spending).toEqual([{ categoryId: 99, currency: 'EUR', amountCents: 700, children: [] }])
  })

  it('cada divisa es su propia fila: nunca se suman entre sí', () => {
    const spending = spendingByParent({
      rows: [
        { categoryId: 11, currency: 'EUR', amountCents: 85_000 },
        { categoryId: 11, currency: 'GBP', amountCents: 2000 },
      ],
      parentOf: TREE,
    })

    expect(spending).toEqual([
      {
        categoryId: 10,
        currency: 'EUR',
        amountCents: 85_000,
        children: [{ categoryId: 11, amountCents: 85_000 }],
      },
      {
        categoryId: 10,
        currency: 'GBP',
        amountCents: 2000,
        children: [{ categoryId: 11, amountCents: 2000 }],
      },
    ])
  })

  it('ordena las hijas de mayor a menor', () => {
    const [vivienda] = spendingByParent({
      rows: [
        { categoryId: 12, currency: 'EUR', amountCents: 1000 },
        { categoryId: 11, currency: 'EUR', amountCents: 9000 },
      ],
      parentOf: TREE,
    })

    expect(vivienda?.children).toEqual([
      { categoryId: 11, amountCents: 9000 },
      { categoryId: 12, amountCents: 1000 },
    ])
  })

  it('un mes sin gasto no devuelve nada', () => {
    expect(spendingByParent({ rows: [], parentOf: TREE })).toEqual([])
  })
})
