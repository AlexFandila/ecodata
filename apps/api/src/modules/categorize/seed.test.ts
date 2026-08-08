/**
 * Todos los datos de este fichero son inventados.
 */
import { categorySchema } from '@finanzas/shared'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../../db/client'
import { categories } from '../../db/schema'
import { createTestDb } from '../../db/testing'
import { SEED_CATEGORIES, seedCategories } from './seed'

let db: Db

beforeEach(() => {
  db = createTestDb()
})

/** Cuántas categorías describe el árbol, madres e hijas. */
const TOTAL = SEED_CATEGORIES.reduce((suma, madre) => suma + 1 + madre.children.length, 0)

describe('seedCategories', () => {
  it('siembra el árbol entero', () => {
    const resultado = seedCategories(db)

    expect(resultado).toEqual({ inserted: TOTAL, existing: 0 })
    expect(db.select().from(categories).all()).toHaveLength(TOTAL)
  })

  it('crea la categoría del sistema, que es la que desbloquea el invariante 3', () => {
    seedCategories(db)

    const fila = db.select().from(categories).where(eq(categories.slug, 'internal_transfer')).get()

    expect(fila?.kind).toBe('internal')
    expect(fila?.parentId).toBeNull()
  })

  it('cuelga cada subcategoría de su madre y le hereda el tipo', () => {
    seedCategories(db)

    const madre = db.select().from(categories).where(eq(categories.slug, 'food')).get()
    const hija = db.select().from(categories).where(eq(categories.slug, 'groceries')).get()

    expect(hija?.parentId).toBe(madre?.id)
    expect(hija?.kind).toBe('expense')
  })

  it('es idempotente: sembrar dos veces no duplica nada', () => {
    seedCategories(db)
    const segunda = seedCategories(db)

    expect(segunda).toEqual({ inserted: 0, existing: TOTAL })
    expect(db.select().from(categories).all()).toHaveLength(TOTAL)
  })

  it('no pisa lo que el usuario haya renombrado', () => {
    seedCategories(db)
    db.update(categories)
      .set({ name: 'La compra', icon: '🧺' })
      .where(eq(categories.slug, 'groceries'))
      .run()

    seedCategories(db)

    const fila = db.select().from(categories).where(eq(categories.slug, 'groceries')).get()
    expect(fila?.name).toBe('La compra')
    expect(fila?.icon).toBe('🧺')
  })
})

describe('SEED_CATEGORIES · forma del árbol', () => {
  it('no repite ningún slug', () => {
    const slugs = SEED_CATEGORIES.flatMap((madre) => [
      madre.slug,
      ...madre.children.map((hija) => hija.slug),
    ])

    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('tiene exactamente una categoría de tipo `internal`', () => {
    const internas = SEED_CATEGORIES.filter((madre) => madre.kind === 'internal')

    expect(internas.map((madre) => madre.slug)).toEqual(['internal_transfer'])
  })

  it('produce filas que cumplen el contrato de `shared`', () => {
    // Se valida contra el contrato y no contra una expresión regular escrita
    // aquí: si mañana el contrato aprieta el slug o acorta el nombre, la
    // semilla tiene que enterarse.
    seedCategories(db)

    for (const fila of db.select().from(categories).all()) {
      expect(categorySchema.safeParse(fila).success).toBe(true)
    }
  })
})
