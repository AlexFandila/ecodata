/**
 * Todos los datos de este fichero son inventados.
 */
import { categoryListResponseSchema } from '@finanzas/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../../db/client'
import { createTestDb, insertCategory } from '../../db/testing'
import { seedCategories } from '../../modules/categorize/index'
import { createApp } from '../app'

let db: Db
let app: ReturnType<typeof createApp>

beforeEach(() => {
  db = createTestDb()
  app = createApp(db)
})

async function list() {
  const response = await app.request('/categories')
  // Si la respuesta se saliera del contrato, el parse lanzaría aquí.
  return { status: response.status, body: categoryListResponseSchema.parse(await response.json()) }
}

describe('GET /categories', () => {
  it('devuelve la lista vacía y no un array pelado', async () => {
    const { status, body } = await list()

    expect(status).toBe(200)
    expect(body.categories).toEqual([])
  })

  it('ordena por nombre, no por el orden en que las sembró la semilla', async () => {
    insertCategory(db, { slug: 'restaurantes', name: 'Restaurantes' })
    insertCategory(db, { slug: 'farmacia', name: 'Farmacia' })

    const { body } = await list()

    expect(body.categories.map((category) => category.name)).toEqual(['Farmacia', 'Restaurantes'])
  })

  it('devuelve el árbol plano, con el `parentId` de cada hija', async () => {
    const parentId = insertCategory(db, { slug: 'food', name: 'Alimentación' })
    insertCategory(db, { slug: 'groceries', name: 'Supermercado', parentId })

    const { body } = await list()
    const hija = body.categories.find((category) => category.slug === 'groceries')

    // Plano y no anidado: agrupar por madre es trabajo de quien pinta.
    expect(hija?.parentId).toBe(parentId)
  })

  it('sirve el árbol sembrado, con la categoría del sistema incluida', async () => {
    seedCategories(db)

    const { body } = await list()

    expect(body.categories.length).toBeGreaterThan(10)
    expect(body.categories.some((category) => category.slug === 'internal_transfer')).toBe(true)
  })
})
