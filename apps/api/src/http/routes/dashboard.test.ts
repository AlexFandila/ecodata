/**
 * Todos los datos de este fichero son inventados.
 *
 * La respuesta se valida siempre contra `dashboardResponseSchema`: el `parse` es
 * la aserción de contrato, así que un campo que se saliera de la forma acordada
 * rompe aquí y no en la PWA.
 */
import { dashboardResponseSchema, errorResponseSchema } from '@finanzas/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../../db/client'
import { transactions } from '../../db/schema'
import { createTestDb, insertCategory, seedContext, transactionValues } from '../../db/testing'
import { createApp } from '../app'

/** Congelado: el mes por defecto tiene que ser una aserción, no una tautología. */
const TODAY = () => '2026-08-09'

let db: Db
let app: ReturnType<typeof createApp>
let context: { accountId: number; importId: number }

beforeEach(() => {
  db = createTestDb()
  app = createApp(db, { today: TODAY })
  context = seedContext(db)
})

function insertTransaction(overrides: Partial<typeof transactions.$inferInsert> = {}): void {
  db.insert(transactions)
    .values(transactionValues(context, { bookedAt: '2026-08-12', ...overrides }))
    .run()
}

async function get(query = '') {
  const response = await app.request(`/dashboard${query}`)
  return {
    status: response.status,
    body: dashboardResponseSchema.parse(await response.json()),
  }
}

async function getError(query: string) {
  const response = await app.request(`/dashboard${query}`)
  return {
    status: response.status,
    body: errorResponseSchema.parse(await response.json()),
  }
}

describe('GET /dashboard', () => {
  it('responde 200 con la forma del contrato', async () => {
    const { status } = await get()

    expect(status).toBe(200)
  })

  it('sin mes, agrega el mes en curso del servidor', async () => {
    const { body } = await get()

    expect(body.month).toBe('2026-08')
  })

  it('devuelve el mes y la ventana ya resueltos, como los listados con limit y offset', async () => {
    const { body } = await get()

    expect(body.months).toBe(6)
  })

  it('respeta el mes que se le pida', async () => {
    const { body } = await get('?month=2026-03')

    expect(body.month).toBe('2026-03')
  })

  it('la evolución trae una fila por mes y divisa, sin huecos', async () => {
    insertTransaction({ amountCents: 210_000 })
    const { body } = await get('?months=3')

    expect(body.evolution.map((row) => row.month)).toEqual(['2026-06', '2026-07', '2026-08'])
    expect(body.evolution).toHaveLength(3 * body.currencies.length)
  })

  it('un mes futuro no es un error: devuelve ceros, que es la verdad', async () => {
    insertTransaction({ amountCents: -1000 })
    const { status, body } = await get('?month=2030-01')

    expect(status).toBe(200)
    expect(body.spending).toEqual([])
  })
})

describe('validación', () => {
  it('rechaza un mes que no existe', async () => {
    const { status, body } = await getError('?month=2026-13')

    expect(status).toBe(400)
    expect(body.error.code).toBe('validation_error')
    expect(body.error.details?.length).toBeGreaterThan(0)
  })

  it('rechaza un mes que no es un mes', async () => {
    expect((await getError('?month=agosto')).status).toBe(400)
  })

  it('rechaza una ventana vacía o desmedida', async () => {
    expect((await getError('?months=0')).status).toBe(400)
    expect((await getError('?months=25')).status).toBe(400)
  })
})

describe('nombres de categoría', () => {
  it('los pone la ruta juntando ledger y categorize', async () => {
    const vivienda = insertCategory(db, { slug: 'housing', name: 'Vivienda', icon: '🏠' })
    const alquiler = insertCategory(db, {
      slug: 'rent_mortgage',
      name: 'Alquiler o hipoteca',
      icon: '🔑',
      parentId: vivienda,
    })
    insertTransaction({ amountCents: -85_000, categoryId: alquiler, categorySource: 'rule' })

    const { body } = await get()

    expect(body.spending[0]).toEqual({
      categoryId: vivienda,
      slug: 'housing',
      name: 'Vivienda',
      icon: '🏠',
      currency: 'EUR',
      amountCents: 85_000,
      children: [
        {
          categoryId: alquiler,
          slug: 'rent_mortgage',
          name: 'Alquiler o hipoteca',
          icon: '🔑',
          amountCents: 85_000,
        },
      ],
    })
  })

  it('la fila sin categorizar va con todo a null: el rótulo lo pone la pantalla', async () => {
    insertTransaction({ amountCents: -4550 })

    const { body } = await get()

    expect(body.spending[0]).toEqual({
      categoryId: null,
      slug: null,
      name: null,
      icon: null,
      currency: 'EUR',
      amountCents: 4550,
      children: [],
    })
  })
})

describe('saldos', () => {
  it('salen con la cuenta y su divisa principal', async () => {
    insertTransaction({ amountCents: 120_000 })

    const { body } = await get()

    expect(body.accounts[0]).toEqual({
      accountId: context.accountId,
      name: 'Cuenta de prueba',
      provider: 'unicaja',
      currency: 'EUR',
      balances: [{ currency: 'EUR', amountCents: 120_000 }],
    })
  })

  it('cambiar de mes mueve el gasto y no mueve el saldo', async () => {
    insertTransaction({ amountCents: -10_000, bookedAt: '2026-08-12' })

    const agosto = await get('?month=2026-08')
    const julio = await get('?month=2026-07')

    expect(agosto.body.spending).toHaveLength(1)
    expect(julio.body.spending).toHaveLength(0)
    expect(julio.body.totals).toEqual(agosto.body.totals)
  })
})

describe('base recién creada', () => {
  it('devuelve un resumen vacío con 200, no un 404', async () => {
    const empty = createApp(createTestDb(), { today: TODAY })
    const response = await empty.request('/dashboard')
    const body = dashboardResponseSchema.parse(await response.json())

    expect(response.status).toBe(200)
    expect(body).toEqual({
      month: '2026-08',
      months: 6,
      currencies: [],
      accounts: [],
      totals: [],
      spending: [],
      evolution: [],
    })
  })
})
