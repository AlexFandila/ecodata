/**
 * Todos los datos de este fichero son inventados: ni cuentas, ni comercios, ni
 * importes reales.
 *
 * Lo que se prueba aquí no es «qué categoría toca» —eso lo cubre el motor puro
 * de `packages/core`— sino **a quién se le puede escribir**: el invariante 7 y
 * sus vecinos, que es lo que este módulo aporta.
 */
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../../db/client'
import type { NewTransaction } from '../../db/schema'
import { transactions } from '../../db/schema'
import {
  createTestDb,
  insertCategory,
  insertRule,
  seedContext,
  transactionValues,
} from '../../db/testing'
import { categorizeTransactions } from './apply'

let db: Db
let context: { accountId: number; importId: number }
let supermercado: number
let restaurantes: number

beforeEach(() => {
  db = createTestDb()
  context = seedContext(db)
  supermercado = insertCategory(db, { slug: 'groceries', name: 'Supermercado' })
  restaurantes = insertCategory(db, { slug: 'restaurants', name: 'Restaurantes' })
})

/** Inserta un movimiento y devuelve su id. */
function insertTransaction(overrides: Partial<NewTransaction> = {}): number {
  const row = db
    .insert(transactions)
    .values(transactionValues(context, overrides))
    .returning({ id: transactions.id })
    .get()
  if (row === undefined) throw new Error('No se pudo insertar el movimiento')
  return row.id
}

/** El estado de categorización de un movimiento. */
function categoriaDe(id: number) {
  const row = db
    .select({ categoryId: transactions.categoryId, categorySource: transactions.categorySource })
    .from(transactions)
    .where(eq(transactions.id, id))
    .get()
  if (row === undefined) throw new Error('El movimiento no existe')
  return row
}

describe('categorizeTransactions', () => {
  it('categoriza un movimiento sin categoría y anota que fue una regla', () => {
    const id = insertTransaction({ counterparty: 'SUPERMERCADO EJEMPLO' })
    insertRule(db, { categoryId: supermercado, pattern: 'SUPERMERCADO' })

    const resultado = categorizeTransactions(db)

    expect(resultado.categorized).toBe(1)
    expect(categoriaDe(id)).toEqual({ categoryId: supermercado, categorySource: 'rule' })
  })

  it('deja sin categoría lo que no casa con ninguna regla', () => {
    const id = insertTransaction({ counterparty: 'FARMACIA EJEMPLO' })
    insertRule(db, { categoryId: supermercado, pattern: 'SUPERMERCADO' })

    const resultado = categorizeTransactions(db)

    expect(resultado).toMatchObject({ scanned: 1, categorized: 0, cleared: 0 })
    expect(categoriaDe(id)).toEqual({ categoryId: null, categorySource: null })
  })

  it('no escribe nada si no hay reglas activas', () => {
    const id = insertTransaction({ counterparty: 'SUPERMERCADO EJEMPLO' })
    insertRule(db, { categoryId: supermercado, pattern: 'SUPERMERCADO', active: false })

    const resultado = categorizeTransactions(db)

    expect(resultado.categorized).toBe(0)
    expect(categoriaDe(id).categoryId).toBeNull()
  })

  it('acota a una importación cuando se le pide', () => {
    const otroImport = seedContext(db)
    const propio = insertTransaction({ counterparty: 'SUPERMERCADO EJEMPLO' })
    const ajeno = db
      .insert(transactions)
      .values(
        transactionValues(otroImport, { counterparty: 'SUPERMERCADO EJEMPLO', sourceHash: 'otro' }),
      )
      .returning({ id: transactions.id })
      .get()
    insertRule(db, { categoryId: supermercado, pattern: 'SUPERMERCADO' })

    const resultado = categorizeTransactions(db, { importId: context.importId })

    expect(resultado).toMatchObject({ scanned: 1, categorized: 1 })
    expect(categoriaDe(propio).categoryId).toBe(supermercado)
    expect(categoriaDe(ajeno?.id ?? 0).categoryId).toBeNull()
  })
})

describe('categorizeTransactions · invariante 7', () => {
  it('no pisa jamás una categoría puesta a mano', () => {
    const id = insertTransaction({
      counterparty: 'SUPERMERCADO EJEMPLO',
      categoryId: restaurantes,
      categorySource: 'manual',
    })
    insertRule(db, { categoryId: supermercado, pattern: 'SUPERMERCADO' })

    const resultado = categorizeTransactions(db)

    expect(resultado.scanned).toBe(0)
    expect(categoriaDe(id)).toEqual({ categoryId: restaurantes, categorySource: 'manual' })
  })

  it('tampoco pisa una sugerencia sin confirmar', () => {
    const id = insertTransaction({
      counterparty: 'SUPERMERCADO EJEMPLO',
      categoryId: restaurantes,
      categorySource: 'suggestion',
    })
    insertRule(db, { categoryId: supermercado, pattern: 'SUPERMERCADO' })

    categorizeTransactions(db)

    expect(categoriaDe(id).categorySource).toBe('suggestion')
  })

  it('sí recategoriza lo que puso otra regla', () => {
    const id = insertTransaction({
      counterparty: 'SUPERMERCADO EJEMPLO',
      categoryId: restaurantes,
      categorySource: 'rule',
    })
    insertRule(db, { categoryId: supermercado, pattern: 'SUPERMERCADO' })

    const resultado = categorizeTransactions(db)

    expect(resultado.categorized).toBe(1)
    expect(categoriaDe(id).categoryId).toBe(supermercado)
  })

  it('devuelve a la bandeja lo que una regla categorizó y ya no casa con nada', () => {
    const id = insertTransaction({
      counterparty: 'FARMACIA EJEMPLO',
      categoryId: supermercado,
      categorySource: 'rule',
    })

    const resultado = categorizeTransactions(db)

    expect(resultado.cleared).toBe(1)
    expect(categoriaDe(id)).toEqual({ categoryId: null, categorySource: null })
  })

  it('no cuenta como cambio lo que ya estaba bien', () => {
    insertTransaction({
      counterparty: 'SUPERMERCADO EJEMPLO',
      categoryId: supermercado,
      categorySource: 'rule',
    })
    insertRule(db, { categoryId: supermercado, pattern: 'SUPERMERCADO' })

    const resultado = categorizeTransactions(db)

    expect(resultado).toMatchObject({ scanned: 1, categorized: 0, cleared: 0 })
  })
})

describe('categorizeTransactions · movimientos que quedan fuera', () => {
  it('ignora los movimientos borrados (invariante 5)', () => {
    const id = insertTransaction({
      counterparty: 'SUPERMERCADO EJEMPLO',
      deletedAt: new Date('2026-04-01T10:00:00Z'),
    })
    insertRule(db, { categoryId: supermercado, pattern: 'SUPERMERCADO' })

    const resultado = categorizeTransactions(db)

    expect(resultado.scanned).toBe(0)
    expect(categoriaDe(id).categoryId).toBeNull()
  })

  it('ignora las patas de una transferencia interna (invariante 3)', () => {
    // Su categoría la pone `ledger`, no las reglas.
    const id = insertTransaction({ counterparty: 'SUPERMERCADO EJEMPLO', transferId: 1 })
    insertRule(db, { categoryId: supermercado, pattern: 'SUPERMERCADO' })

    const resultado = categorizeTransactions(db)

    expect(resultado.scanned).toBe(0)
    expect(categoriaDe(id).categoryId).toBeNull()
  })
})

describe('categorizeTransactions · acotado a unos movimientos', () => {
  it('solo toca los que se le indican', () => {
    const acotado = insertTransaction({ counterparty: 'SUPERMERCADO EJEMPLO' })
    const otro = insertTransaction({ counterparty: 'SUPERMERCADO EJEMPLO' })
    insertRule(db, { categoryId: supermercado, pattern: 'SUPERMERCADO' })

    const resultado = categorizeTransactions(db, { transactionIds: [acotado] })

    expect(resultado.categorized).toBe(1)
    expect(categoriaDe(acotado).categoryId).toBe(supermercado)
    expect(categoriaDe(otro).categoryId).toBeNull()
  })

  it('una lista vacía no es «todos»: es que no hay nada que hacer', () => {
    const id = insertTransaction({ counterparty: 'SUPERMERCADO EJEMPLO' })
    insertRule(db, { categoryId: supermercado, pattern: 'SUPERMERCADO' })

    const resultado = categorizeTransactions(db, { transactionIds: [] })

    expect(resultado).toEqual({ scanned: 0, categorized: 0, cleared: 0, invalidRules: [] })
    expect(categoriaDe(id).categoryId).toBeNull()
  })
})

describe('categorizeTransactions · reglas rotas', () => {
  it('salta la regla con el patrón roto, avisa, y aplica las demás', () => {
    // Una regla mala guardada hace meses no puede impedir importar hoy.
    const id = insertTransaction({ counterparty: 'SUPERMERCADO EJEMPLO' })
    insertRule(db, {
      categoryId: restaurantes,
      priority: 10,
      matchType: 'regex',
      pattern: '(sin cerrar',
    })
    insertRule(db, { categoryId: supermercado, priority: 20, pattern: 'SUPERMERCADO' })

    const resultado = categorizeTransactions(db)

    expect(resultado.invalidRules).toHaveLength(1)
    expect(resultado.invalidRules[0]?.reason).toBe('invalid_regex')
    expect(categoriaDe(id).categoryId).toBe(supermercado)
  })
})
