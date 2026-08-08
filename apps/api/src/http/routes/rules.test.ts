/**
 * Todos los datos de este fichero son inventados: ni comercios ni conceptos
 * bancarios reales.
 */
import {
  createRuleResponseSchema,
  errorResponseSchema,
  ruleListResponseSchema,
} from '@finanzas/shared'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../../db/client'
import { transactions } from '../../db/schema'
import {
  createTestDb,
  insertCategory,
  insertRule,
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

function insertTransaction(
  overrides: Partial<Parameters<typeof transactionValues>[1]> = {},
): number {
  const row = db
    .insert(transactions)
    .values(transactionValues(context, overrides))
    .returning({ id: transactions.id })
    .get()
  if (row === undefined) throw new Error('No se pudo crear el movimiento de prueba')
  return row.id
}

function post(body: unknown) {
  return app.request('/rules', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

/** Cómo ha quedado un movimiento tras la pasada de reglas. */
function categoryOf(id: number) {
  return db
    .select({ categoryId: transactions.categoryId, categorySource: transactions.categorySource })
    .from(transactions)
    .where(eq(transactions.id, id))
    .get()
}

describe('GET /rules', () => {
  it('devuelve la lista vacía y no un array pelado', async () => {
    const response = await app.request('/rules')

    expect(response.status).toBe(200)
    expect(ruleListResponseSchema.parse(await response.json()).rules).toEqual([])
  })

  it('las ordena como las evalúa el motor: prioridad y, a igualdad, id', async () => {
    const categoryId = insertCategory(db)
    const segunda = insertRule(db, { categoryId, priority: 10, pattern: 'B' })
    const primera = insertRule(db, { categoryId, priority: 5, pattern: 'A' })
    const tercera = insertRule(db, { categoryId, priority: 10, pattern: 'C' })

    const response = await app.request('/rules')
    const body = ruleListResponseSchema.parse(await response.json())

    expect(body.rules.map((rule) => rule.id)).toEqual([primera, segunda, tercera])
  })
})

describe('POST /rules · crea y aplica', () => {
  it('categoriza los movimientos que casan, no solo el que la originó', async () => {
    const categoryId = insertCategory(db)
    const conCasa = insertTransaction({ counterparty: 'FARMACIA EJEMPLO' })
    const otroQueCasa = insertTransaction({ counterparty: 'farmacia ejemplo centro' })
    const queNoCasa = insertTransaction({ counterparty: 'GASOLINERA EJEMPLO' })

    const response = await post({ field: 'counterparty', pattern: 'FARMACIA', categoryId })

    expect(response.status).toBe(201)
    const body = createRuleResponseSchema.parse(await response.json())
    expect(body.rule).toMatchObject({ pattern: 'FARMACIA', matchType: 'contains', active: true })
    // Es lo que convierte "regla creada" en "ha categorizado 2 movimientos".
    expect(body.categorization.categorized).toBe(2)

    expect(categoryOf(conCasa)).toEqual({ categoryId, categorySource: 'rule' })
    expect(categoryOf(otroQueCasa)).toEqual({ categoryId, categorySource: 'rule' })
    expect(categoryOf(queNoCasa)).toEqual({ categoryId: null, categorySource: null })
  })

  it('no pisa lo que se puso a mano (invariante 7)', async () => {
    const puestaAMano = insertCategory(db, { slug: 'restaurantes', name: 'Restaurantes' })
    const deLaRegla = insertCategory(db)
    const id = insertTransaction({
      counterparty: 'FARMACIA EJEMPLO',
      categoryId: puestaAMano,
      categorySource: 'manual',
    })

    await post({ field: 'counterparty', pattern: 'FARMACIA', categoryId: deLaRegla })

    expect(categoryOf(id)).toEqual({ categoryId: puestaAMano, categorySource: 'manual' })
  })

  it('reporta la regla vieja que no compila sin dejar de aplicar la nueva', async () => {
    const categoryId = insertCategory(db)
    // Guardada antes de que existiera la validación del contrato: es justo el
    // caso que ADR-014 decisión 4 dice que hay que sobrevivir, no fallar.
    const rota = insertRule(db, { categoryId, matchType: 'regex', pattern: '(sin cerrar' })
    const id = insertTransaction({ counterparty: 'FARMACIA EJEMPLO' })

    const response = await post({ field: 'counterparty', pattern: 'FARMACIA', categoryId })

    const body = createRuleResponseSchema.parse(await response.json())
    expect(body.categorization.invalidRules).toEqual([
      { ruleId: rota, message: expect.any(String) },
    ])
    expect(body.categorization.invalidRules[0]).not.toHaveProperty('reason')
    expect(categoryOf(id)?.categoryId).toBe(categoryId)
  })
})

describe('POST /rules · lo que rechaza', () => {
  it('rechaza una expresión regular que no compila, señalando el patrón', async () => {
    const categoryId = insertCategory(db)

    const response = await post({
      field: 'description',
      matchType: 'regex',
      pattern: '(sin cerrar',
      categoryId,
    })

    expect(response.status).toBe(400)
    const body = errorResponseSchema.parse(await response.json())
    expect(body.error.code).toBe('validation_error')
    expect(body.error.details?.map((detail) => detail.path)).toContain('pattern')
  })

  it('rechaza un patrón de contiene que se queda en nada al normalizarlo', async () => {
    const categoryId = insertCategory(db)

    // Una aguja vacía está contenida en cualquier texto: la regla se tragaría
    // el extracto entero.
    expect((await post({ field: 'counterparty', pattern: '***', categoryId })).status).toBe(400)
  })

  it('una categoría inexistente es un 404, no un error de base de datos', async () => {
    const response = await post({ field: 'counterparty', pattern: 'FARMACIA', categoryId: 9999 })

    expect(response.status).toBe(404)
    expect(errorResponseSchema.parse(await response.json()).error.code).toBe('not_found')
  })

  it('rechaza un cuerpo que no es JSON', async () => {
    expect((await post('esto no es json')).status).toBe(400)
  })
})
