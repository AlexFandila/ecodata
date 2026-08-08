/**
 * Todos los datos de este fichero son inventados.
 */
import { describe, expect, it } from 'vitest'
import { categoryListResponseSchema, categorySchema } from './categories'

const categoria = {
  id: 1,
  slug: 'groceries',
  name: 'Supermercado',
  kind: 'expense',
  parentId: null,
  icon: '🛒',
}

describe('categorySchema', () => {
  it('acepta una categoría raíz', () => {
    expect(categorySchema.parse(categoria).slug).toBe('groceries')
  })

  it('acepta una subcategoría con madre e icono', () => {
    const result = categorySchema.parse({ ...categoria, parentId: 3, icon: '🍽️' })

    expect(result.parentId).toBe(3)
  })

  it('acepta la categoría del sistema', () => {
    const result = categorySchema.parse({
      ...categoria,
      slug: 'internal_transfer',
      name: 'Transferencia interna',
      kind: 'internal',
      icon: null,
    })

    expect(result.kind).toBe('internal')
  })

  it('rechaza un slug que no se pueda escribir en el código que lo referencia', () => {
    for (const slug of ['Groceries', 'super mercado', 'nómina', '1st', 'con-guion', '']) {
      expect(categorySchema.safeParse({ ...categoria, slug }).success).toBe(false)
    }
  })

  it('rechaza un tipo de categoría desconocido', () => {
    expect(categorySchema.safeParse({ ...categoria, kind: 'transfer' }).success).toBe(false)
  })

  it('rechaza un nombre en blanco', () => {
    expect(categorySchema.safeParse({ ...categoria, name: '   ' }).success).toBe(false)
  })
})

describe('categoryListResponseSchema', () => {
  it('envuelve la lista en un objeto con clave nombrada', () => {
    const result = categoryListResponseSchema.parse({ categories: [categoria] })

    expect(result.categories).toHaveLength(1)
  })

  it('rechaza un array pelado', () => {
    expect(categoryListResponseSchema.safeParse([categoria]).success).toBe(false)
  })
})
