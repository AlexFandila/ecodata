/**
 * Todos los datos de este fichero son inventados: ni comercios, ni conceptos
 * bancarios, ni importes corresponden a nada real.
 */
import {
  errorResponseSchema,
  listTransactionsResponseSchema,
  transactionSchema,
} from '@finanzas/shared'
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
import { createApp } from '../app'

let db: Db
let app: ReturnType<typeof createApp>
let context: { accountId: number; importId: number }

beforeEach(() => {
  db = createTestDb()
  app = createApp(db)
  context = seedContext(db)
})

/** Inserta un movimiento sintético y devuelve su id. */
function insertTransaction(
  overrides: Partial<Parameters<typeof transactionValues>[1]> = {},
  ctx = context,
): number {
  const row = db
    .insert(transactions)
    .values(transactionValues(ctx, overrides))
    .returning({ id: transactions.id })
    .get()
  if (row === undefined) throw new Error('No se pudo crear el movimiento de prueba')
  return row.id
}

async function list(query = '') {
  const response = await app.request(`/transactions${query}`)
  return {
    status: response.status,
    // Si la respuesta se saliera del contrato, el parse lanzaría aquí.
    body: listTransactionsResponseSchema.parse(await response.json()),
  }
}

function patchCategory(id: number | string, body: unknown) {
  return app.request(`/transactions/${id}/category`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('GET /transactions · lo que sale y lo que no', () => {
  it('devuelve la lista vacía con su paginación, no un array pelado', async () => {
    const { status, body } = await list()

    expect(status).toBe(200)
    expect(body).toEqual({ transactions: [], total: 0, limit: 50, offset: 0 })
  })

  it('no expone raw, sourceHash ni deletedAt', async () => {
    insertTransaction()

    const { body } = await list()

    expect(body.transactions[0]).not.toHaveProperty('raw')
    expect(body.transactions[0]).not.toHaveProperty('sourceHash')
    expect(body.transactions[0]).not.toHaveProperty('deletedAt')
  })

  it('deja fuera los borrados (invariante 5)', async () => {
    insertTransaction()
    insertTransaction({ deletedAt: new Date('2026-04-01T00:00:00Z') })

    const { body } = await list()

    expect(body.transactions).toHaveLength(1)
    expect(body.total).toBe(1)
  })

  it('deja fuera las patas de una transferencia interna salvo que se pidan', async () => {
    const salida = insertTransaction({ amountCents: -20000 })
    const entrada = insertTransaction({ amountCents: 20000 })
    const transferId = db
      .insert(transfers)
      .values({ outTxnId: salida, inTxnId: entrada, status: 'auto' })
      .returning({ id: transfers.id })
      .get()?.id
    db.update(transactions).set({ transferId }).run()

    // Invariante 3: no son ni ingreso ni gasto, así que por defecto no salen.
    expect((await list()).body.total).toBe(0)
    expect((await list('?includeTransfers=true')).body.total).toBe(2)
  })
})

describe('GET /transactions · filtros', () => {
  it('filtra por cuenta', async () => {
    const otraCuenta = insertAccount(db, { name: 'Revolut personal', provider: 'revolut' })
    const otroContexto = {
      accountId: otraCuenta,
      importId: insertImport(db, { accountId: otraCuenta }),
    }
    insertTransaction()
    insertTransaction({}, otroContexto)

    const { body } = await list(`?accountId=${otraCuenta}`)

    expect(body.total).toBe(1)
    expect(body.transactions[0]?.accountId).toBe(otraCuenta)
  })

  it('filtra por rango de fechas, con los dos extremos incluidos', async () => {
    insertTransaction({ bookedAt: '2026-02-28' })
    insertTransaction({ bookedAt: '2026-03-01' })
    insertTransaction({ bookedAt: '2026-03-31' })
    insertTransaction({ bookedAt: '2026-04-01' })

    const { body } = await list('?from=2026-03-01&to=2026-03-31')

    expect(body.transactions.map((t) => t.bookedAt)).toEqual(['2026-03-31', '2026-03-01'])
  })

  it('filtra por categoría y por «sin categorizar»', async () => {
    const categoryId = insertCategory(db)
    insertTransaction({ categoryId, categorySource: 'rule' })
    insertTransaction()

    expect((await list(`?categoryId=${categoryId}`)).body.total).toBe(1)
    expect((await list('?uncategorized=true')).body.total).toBe(1)
    expect((await list('?uncategorized=true')).body.transactions[0]?.categoryId).toBeNull()
  })

  it('busca en contraparte y en descripción', async () => {
    insertTransaction({ counterparty: 'FARMACIA EJEMPLO', description: null })
    insertTransaction({ counterparty: null, description: 'Recibo de la farmacia' })
    insertTransaction({ counterparty: 'GASOLINERA EJEMPLO', description: 'Repostaje' })

    expect((await list('?search=farmacia')).body.total).toBe(2)
  })

  it('trata los comodines de LIKE como texto, no como comodines', async () => {
    insertTransaction({ counterparty: 'DESCUENTO 100%', description: null })
    insertTransaction({ counterparty: 'GASOLINERA EJEMPLO', description: null })

    // Un `%` suelto sin escapar casaría con el extracto entero; escapado, solo
    // con el movimiento que lleva un `%` de verdad en el texto.
    expect((await list('?search=%25')).body.total).toBe(1)
    expect((await list('?search=100%25')).body.transactions[0]?.counterparty).toBe('DESCUENTO 100%')
  })

  it('rechaza un filtro mal formado señalando el campo', async () => {
    const response = await app.request('/transactions?limit=500')

    expect(response.status).toBe(400)
    const body = errorResponseSchema.parse(await response.json())
    expect(body.error.code).toBe('validation_error')
    expect(body.error.details?.map((detail) => detail.path)).toContain('limit')
  })
})

describe('GET /transactions · paginación y orden', () => {
  it('el total es el del filtro y no el de la página', async () => {
    for (let i = 0; i < 5; i += 1) insertTransaction({ bookedAt: `2026-03-0${i + 1}` })

    const { body } = await list('?limit=2&offset=2')

    expect(body.transactions).toHaveLength(2)
    expect(body).toMatchObject({ total: 5, limit: 2, offset: 2 })
  })

  it('ordena por fecha descendente y desempata por id, sin repetir entre páginas', async () => {
    // Cuatro del mismo día: si el orden no fuera total, la base podría
    // devolverlos en cualquier orden y una página repetiría lo de la anterior.
    const ids = [1, 2, 3, 4].map(() => insertTransaction({ bookedAt: '2026-03-15' }))

    const primera = (await list('?limit=2')).body.transactions.map((t) => t.id)
    const segunda = (await list('?limit=2&offset=2')).body.transactions.map((t) => t.id)

    expect([...primera, ...segunda]).toEqual([...ids].reverse())
  })
})

describe('GET /transactions/:id', () => {
  it('devuelve el movimiento pedido, no el primero de la lista', async () => {
    insertTransaction({ counterparty: 'GASOLINERA EJEMPLO' })
    const buscado = insertTransaction({ counterparty: 'FARMACIA EJEMPLO' })
    insertTransaction({ counterparty: 'PANADERÍA EJEMPLO' })

    const response = await app.request(`/transactions/${buscado}`)

    expect(response.status).toBe(200)
    const body = transactionSchema.parse(await response.json())
    expect(body).toMatchObject({ id: buscado, counterparty: 'FARMACIA EJEMPLO' })
  })

  it('un borrado no se distingue de uno que no existe', async () => {
    const id = insertTransaction({ deletedAt: new Date('2026-04-01T00:00:00Z') })

    expect((await app.request(`/transactions/${id}`)).status).toBe(404)
    expect((await app.request('/transactions/9999')).status).toBe(404)
  })

  it('sí devuelve una pata de transferencia: verla es distinto de listarla', async () => {
    const salida = insertTransaction({ amountCents: -20000 })
    const entrada = insertTransaction({ amountCents: 20000 })
    const transferId = db
      .insert(transfers)
      .values({ outTxnId: salida, inTxnId: entrada, status: 'auto' })
      .returning({ id: transfers.id })
      .get()?.id
    db.update(transactions).set({ transferId }).run()

    const body = transactionSchema.parse(
      await (await app.request(`/transactions/${salida}`)).json(),
    )

    expect(body.transferId).toBe(transferId)
  })

  it('rechaza un id que no es un entero positivo', async () => {
    expect((await app.request('/transactions/abc')).status).toBe(400)
    expect((await app.request('/transactions/0')).status).toBe(400)
  })
})

describe('PATCH /transactions/:id/category', () => {
  it('categoriza a mano y marca el origen como `manual`', async () => {
    const categoryId = insertCategory(db)
    const id = insertTransaction()

    const response = await patchCategory(id, { categoryId })

    expect(response.status).toBe(200)
    const body = transactionSchema.parse(await response.json())
    expect(body).toMatchObject({ categoryId, categorySource: 'manual' })
  })

  it('pisa lo que había puesto una regla: esa dirección sí la permite el invariante 7', async () => {
    const puestaPorRegla = insertCategory(db)
    const elegidaAMano = insertCategory(db, { slug: 'restaurantes', name: 'Restaurantes' })
    const id = insertTransaction({ categoryId: puestaPorRegla, categorySource: 'rule' })

    const body = transactionSchema.parse(
      await (await patchCategory(id, { categoryId: elegidaAMano })).json(),
    )

    expect(body).toMatchObject({ categoryId: elegidaAMano, categorySource: 'manual' })
  })

  it('quitar la categoría devuelve el movimiento a la bandeja', async () => {
    const categoryId = insertCategory(db)
    const id = insertTransaction({ categoryId, categorySource: 'manual' })

    const body = transactionSchema.parse(
      await (await patchCategory(id, { categoryId: null })).json(),
    )

    // Los dos a la vez, que es lo que exige el invariante 7 y el CHECK.
    expect(body.categoryId).toBeNull()
    expect(body.categorySource).toBeNull()
  })

  it('un movimiento borrado no existe para nadie', async () => {
    const categoryId = insertCategory(db)
    const id = insertTransaction({ deletedAt: new Date('2026-04-01T00:00:00Z') })

    const response = await patchCategory(id, { categoryId })

    expect(response.status).toBe(404)
    expect(errorResponseSchema.parse(await response.json()).error.code).toBe('not_found')
  })

  it('una categoría inexistente es un 404 y no un error de base de datos', async () => {
    const id = insertTransaction()

    const response = await patchCategory(id, { categoryId: 9999 })

    expect(response.status).toBe(404)
    expect(errorResponseSchema.parse(await response.json()).error.code).toBe('not_found')
  })

  it('una pata de transferencia interna es un conflicto, no un 404', async () => {
    const categoryId = insertCategory(db)
    const salida = insertTransaction({ amountCents: -20000 })
    const entrada = insertTransaction({ amountCents: 20000 })
    const transferId = db
      .insert(transfers)
      .values({ outTxnId: salida, inTxnId: entrada, status: 'auto' })
      .returning({ id: transfers.id })
      .get()?.id
    db.update(transactions).set({ transferId }).run()

    const response = await patchCategory(salida, { categoryId })

    // Invariante 3: su categoría la pone la transferencia, no el usuario.
    expect(response.status).toBe(409)
    expect(errorResponseSchema.parse(await response.json()).error.code).toBe('conflict')
  })

  it('rechaza un id o un cuerpo que no valen', async () => {
    expect((await patchCategory('abc', { categoryId: null })).status).toBe(400)
    expect((await patchCategory(1, 'esto no es json')).status).toBe(400)
    expect((await patchCategory(1, {})).status).toBe(400)
  })
})
