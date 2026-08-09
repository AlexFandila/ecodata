/**
 * Todos los datos de este fichero son inventados: ni cuentas, ni conceptos, ni
 * importes corresponden a nada real.
 *
 * Lo que se comprueba aquí son los tres invariantes que gobiernan cualquier
 * agregado, y sobre todo la asimetría del invariante 3: una transferencia
 * interna no es ni ingreso ni gasto, pero sí mueve el saldo.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../../db/client'
import { transactions, transfers } from '../../db/schema'
import {
  createTestDb,
  insertAccount,
  insertCategory,
  insertImport,
  seedContext,
  transactionValues,
} from '../../db/testing'
import { summarize } from './summary'

const MONTH = '2026-08'

let db: Db
let context: { accountId: number; importId: number }

beforeEach(() => {
  db = createTestDb()
  context = seedContext(db)
})

function insertTransaction(overrides: Partial<typeof transactions.$inferInsert> = {}): number {
  const row = db
    .insert(transactions)
    .values(transactionValues(context, { bookedAt: '2026-08-12', ...overrides }))
    .returning({ id: transactions.id })
    .get()
  if (row === undefined) throw new Error('No se pudo insertar el movimiento de prueba')
  return row.id
}

/** El resumen del mes de prueba, con la ventana por defecto del dashboard. */
function summary(month = MONTH, months = 6) {
  return summarize(db, { month, months })
}

function flowOf(month: string, currency = 'EUR') {
  return summary().evolution.find((row) => row.month === month && row.currency === currency)
}

describe('saldos (invariante 6)', () => {
  it('saldo = apertura + suma de los movimientos vivos', () => {
    insertTransaction({ amountCents: -4550 })
    insertTransaction({ amountCents: 120_000 })

    const [account] = summary().accounts

    expect(account?.balances).toEqual([{ currency: 'EUR', amountCents: 115_450 }])
  })

  it('una cuenta sin movimientos vale su apertura y aparece igualmente', () => {
    insertAccount(db, { name: 'Ahorro', openingBalanceCents: 500_000 })

    const ahorro = summary().accounts.find((entry) => entry.account.name === 'Ahorro')

    expect(ahorro?.balances).toEqual([{ currency: 'EUR', amountCents: 500_000 }])
  })

  it('la apertura se suma a los movimientos, no los sustituye', () => {
    const accountId = insertAccount(db, { name: 'Con apertura', openingBalanceCents: 30_000 })
    const importId = insertImport(db, { accountId })
    db.insert(transactions)
      .values(transactionValues({ accountId, importId }, { amountCents: -10_000 }))
      .run()

    const cuenta = summary().accounts.find((entry) => entry.account.name === 'Con apertura')

    expect(cuenta?.balances).toEqual([{ currency: 'EUR', amountCents: 20_000 }])
  })

  it('el total suma las cuentas divisa a divisa', () => {
    insertTransaction({ amountCents: 100_000 })
    insertAccount(db, { name: 'Ahorro', openingBalanceCents: 250_000 })

    expect(summary().totals).toEqual([{ currency: 'EUR', amountCents: 350_000 }])
  })

  it('los saldos no dependen del mes que se pida: un saldo es un acumulado', () => {
    insertTransaction({ amountCents: 100_000, bookedAt: '2026-08-12' })

    expect(summary('2026-08').totals).toEqual(summary('2026-03').totals)
  })
})

describe('invariante 5: los borrados no existen para nadie', () => {
  beforeEach(() => {
    insertTransaction({ amountCents: -50_000, deletedAt: new Date('2026-08-20T00:00:00Z') })
  })

  it('no cuenta en el saldo', () => {
    expect(summary().accounts[0]?.balances).toEqual([{ currency: 'EUR', amountCents: 0 }])
  })

  it('no cuenta en el gasto del mes', () => {
    expect(summary().spending).toEqual([])
  })

  it('no cuenta en la evolución', () => {
    expect(flowOf('2026-08')).toMatchObject({ incomeCents: 0, expenseCents: 0 })
  })
})

describe('invariante 3: una transferencia interna mueve el saldo pero no es flujo', () => {
  beforeEach(() => {
    const destinoId = insertAccount(db, { name: 'Monedero', provider: 'revolut', type: 'card' })
    const destinoImportId = insertImport(db, { accountId: destinoId })
    const internal = insertCategory(db, {
      slug: 'internal_transfer',
      name: 'Traspaso',
      kind: 'internal',
    })

    const outId = insertTransaction({
      amountCents: -20_000,
      categoryId: internal,
      categorySource: 'transfer',
    })
    const inRow = db
      .insert(transactions)
      .values(
        transactionValues(
          { accountId: destinoId, importId: destinoImportId },
          {
            bookedAt: '2026-08-12',
            amountCents: 20_000,
            categoryId: internal,
            categorySource: 'transfer',
          },
        ),
      )
      .returning({ id: transactions.id })
      .get()
    if (inRow === undefined) throw new Error('No se pudo insertar la pata de abono')

    const transfer = db
      .insert(transfers)
      .values({ outTxnId: outId, inTxnId: inRow.id, status: 'auto' })
      .returning({ id: transfers.id })
      .get()
    if (transfer === undefined) throw new Error('No se pudo insertar la transferencia')

    db.update(transactions).set({ transferId: transfer.id }).run()
  })

  it('SÍ mueve el saldo de las dos cuentas', () => {
    const balances = Object.fromEntries(
      summary().accounts.map((entry) => [entry.account.name, entry.balances]),
    )

    expect(balances['Cuenta de prueba']).toEqual([{ currency: 'EUR', amountCents: -20_000 }])
    expect(balances.Monedero).toEqual([{ currency: 'EUR', amountCents: 20_000 }])
  })

  it('el total no se mueve: lo que sale de una cuenta entra en la otra', () => {
    expect(summary().totals).toEqual([{ currency: 'EUR', amountCents: 0 }])
  })

  it('NO aparece en el gasto del mes', () => {
    expect(summary().spending).toEqual([])
  })

  it('NO aparece en la evolución, ni como ingreso ni como gasto', () => {
    expect(flowOf('2026-08')).toMatchObject({ incomeCents: 0, expenseCents: 0, netCents: 0 })
  })
})

describe('gasto del mes por categoría', () => {
  it('agrupa las hijas en su madre y deja el desglose', () => {
    const vivienda = insertCategory(db, { slug: 'housing', name: 'Vivienda', kind: 'expense' })
    const alquiler = insertCategory(db, {
      slug: 'rent_mortgage',
      name: 'Alquiler',
      kind: 'expense',
      parentId: vivienda,
    })

    insertTransaction({ amountCents: -85_000, categoryId: alquiler, categorySource: 'rule' })

    expect(summary().spending).toEqual([
      {
        categoryId: vivienda,
        currency: 'EUR',
        amountCents: 85_000,
        children: [{ categoryId: alquiler, amountCents: 85_000 }],
      },
    ])
  })

  it('el gasto sale en positivo aunque esté guardado en negativo', () => {
    insertTransaction({ amountCents: -4550 })

    expect(summary().spending[0]?.amountCents).toBe(4550)
  })

  it('incluye la fila «sin categorizar», que es donde hay trabajo pendiente', () => {
    insertTransaction({ amountCents: -4550 })

    expect(summary().spending).toEqual([
      { categoryId: null, currency: 'EUR', amountCents: 4550, children: [] },
    ])
  })

  it('un abono en una categoría de gasto no resta: sale como ingreso', () => {
    const categoryId = insertCategory(db, { slug: 'groceries', name: 'Supermercado' })
    insertTransaction({ amountCents: -10_000, categoryId, categorySource: 'rule' })
    insertTransaction({ amountCents: 3000, categoryId, categorySource: 'rule' })

    expect(summary().spending[0]?.amountCents).toBe(10_000)
    expect(flowOf('2026-08')).toMatchObject({ incomeCents: 3000, expenseCents: 10_000 })
  })

  it('solo cuenta el mes pedido, con los dos extremos dentro', () => {
    insertTransaction({ amountCents: -100, bookedAt: '2026-08-01' })
    insertTransaction({ amountCents: -200, bookedAt: '2026-08-31' })
    insertTransaction({ amountCents: -400, bookedAt: '2026-07-31' })
    insertTransaction({ amountCents: -800, bookedAt: '2026-09-01' })

    expect(summary().spending[0]?.amountCents).toBe(300)
  })

  it('un mes sin gasto no devuelve filas', () => {
    expect(summary().spending).toEqual([])
  })
})

describe('evolución', () => {
  it('devuelve la ventana entera, con los meses vacíos a cero', () => {
    insertTransaction({ amountCents: 210_000 })

    const evolution = summary().evolution

    expect(evolution.map((row) => row.month)).toEqual([
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
    ])
    expect(evolution[0]).toEqual({
      month: '2026-03',
      currency: 'EUR',
      incomeCents: 0,
      expenseCents: 0,
      netCents: 0,
    })
  })

  it('separa ingresos de gastos por el signo y calcula el neto', () => {
    insertTransaction({ amountCents: 210_000 })
    insertTransaction({ amountCents: -184_230 })

    expect(flowOf('2026-08')).toEqual({
      month: '2026-08',
      currency: 'EUR',
      incomeCents: 210_000,
      expenseCents: 184_230,
      netCents: 25_770,
    })
  })

  it('un importe de cero no es ni ingreso ni gasto', () => {
    insertTransaction({ amountCents: 0 })

    expect(flowOf('2026-08')).toMatchObject({ incomeCents: 0, expenseCents: 0 })
  })

  it('reparte cada movimiento en el mes de su fecha contable', () => {
    insertTransaction({ amountCents: -1000, bookedAt: '2026-07-15' })
    insertTransaction({ amountCents: -2000, bookedAt: '2026-08-15' })

    expect(flowOf('2026-07')?.expenseCents).toBe(1000)
    expect(flowOf('2026-08')?.expenseCents).toBe(2000)
  })
})

describe('la suma de las categorías cuadra con el gasto del mes', () => {
  it('Σ spending ≡ evolution[mes].expenseCents, que es lo que el usuario ve a la vez', () => {
    const categoryId = insertCategory(db, { slug: 'groceries', name: 'Supermercado' })
    insertTransaction({ amountCents: -10_000, categoryId, categorySource: 'rule' })
    insertTransaction({ amountCents: -4550 })
    insertTransaction({ amountCents: 210_000 })

    const result = summary()
    const total = result.spending
      .filter((row) => row.currency === 'EUR')
      .reduce((sum, row) => sum + row.amountCents, 0)

    expect(total).toBe(flowOf('2026-08')?.expenseCents)
    expect(total).toBe(14_550)
  })
})

describe('multidivisa', () => {
  beforeEach(() => {
    insertTransaction({ amountCents: -10_000, currency: 'EUR' })
    insertTransaction({ amountCents: -2000, currency: 'GBP' })
  })

  it('el saldo de una cuenta EUR con movimientos en GBP son dos saldos, no uno', () => {
    expect(summary().accounts[0]?.balances).toEqual([
      { currency: 'EUR', amountCents: -10_000 },
      { currency: 'GBP', amountCents: -2000 },
    ])
  })

  it('el total tampoco se suma entre divisas', () => {
    expect(summary().totals).toEqual([
      { currency: 'EUR', amountCents: -10_000 },
      { currency: 'GBP', amountCents: -2000 },
    ])
  })

  it('la divisa de las cuentas va primero aunque la otra tenga movimientos', () => {
    expect(summary().currencies).toEqual(['EUR', 'GBP'])
  })

  it('el gasto y la evolución traen una fila por divisa', () => {
    expect(summary().spending).toHaveLength(2)
    expect(flowOf('2026-08', 'GBP')).toMatchObject({ expenseCents: 2000 })
  })
})

describe('base recién creada', () => {
  it('sin cuentas ni movimientos devuelve un resumen vacío, que es una respuesta válida', () => {
    const empty = createTestDb()

    expect(summarize(empty, { month: MONTH, months: 6 })).toEqual({
      currencies: [],
      accounts: [],
      totals: [],
      spending: [],
      evolution: [],
    })
  })
})
