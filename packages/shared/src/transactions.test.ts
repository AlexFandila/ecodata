import { describe, expect, it } from 'vitest'
import {
  listTransactionsQuerySchema,
  listTransactionsResponseSchema,
  TRANSACTIONS_DEFAULT_LIMIT,
  transactionSchema,
} from './transactions'

/** Simula lo que entrega un router HTTP: la query string ya troceada, en texto. */
function query(params: Record<string, string>) {
  return listTransactionsQuerySchema.parse(params)
}

describe('listTransactionsQuerySchema · valores por defecto', () => {
  it('sin filtros, pagina y excluye transferencias internas', () => {
    const result = query({})

    expect(result.limit).toBe(TRANSACTIONS_DEFAULT_LIMIT)
    expect(result.offset).toBe(0)
    // Invariante 3: no son ni ingreso ni gasto, así que por defecto no se listan.
    expect(result.includeTransfers).toBe(false)
  })

  it('los filtros no puestos quedan sin definir, no a cero', () => {
    const result = query({})

    expect(result.accountId).toBeUndefined()
    expect(result.from).toBeUndefined()
    expect(result.uncategorized).toBeUndefined()
  })
})

describe('listTransactionsQuerySchema · coerción desde la query string', () => {
  it('convierte los números que llegan como texto', () => {
    const result = query({ accountId: '2', categoryId: '7', limit: '20', offset: '40' })

    expect(result.accountId).toBe(2)
    expect(result.categoryId).toBe(7)
    expect(result.limit).toBe(20)
    expect(result.offset).toBe(40)
  })

  it('convierte los booleanos que llegan como texto', () => {
    expect(query({ uncategorized: 'true' }).uncategorized).toBe(true)
    expect(query({ uncategorized: 'false' }).uncategorized).toBe(false)
    expect(query({ includeTransfers: '1' }).includeTransfers).toBe(true)
  })

  it('recorta la búsqueda libre', () => {
    expect(query({ search: '  mercadona  ' }).search).toBe('mercadona')
  })
})

describe('listTransactionsQuerySchema · rechazos', () => {
  it('no deja pedirse la base entera de una vez', () => {
    expect(listTransactionsQuerySchema.safeParse({ limit: '500' }).success).toBe(false)
    expect(listTransactionsQuerySchema.safeParse({ limit: '200' }).success).toBe(true)
  })

  it('rechaza una página vacía o un desplazamiento negativo', () => {
    expect(listTransactionsQuerySchema.safeParse({ limit: '0' }).success).toBe(false)
    expect(listTransactionsQuerySchema.safeParse({ offset: '-1' }).success).toBe(false)
  })

  it('rechaza un número que no lo es', () => {
    expect(listTransactionsQuerySchema.safeParse({ accountId: 'primera' }).success).toBe(false)
    expect(listTransactionsQuerySchema.safeParse({ limit: '20.5' }).success).toBe(false)
  })

  it('rechaza una fecha mal formada en el rango', () => {
    expect(listTransactionsQuerySchema.safeParse({ from: '01/03/2026' }).success).toBe(false)
    expect(listTransactionsQuerySchema.safeParse({ to: '2026-02-31' }).success).toBe(false)
  })

  it('rechaza un booleano que no lo es', () => {
    expect(listTransactionsQuerySchema.safeParse({ uncategorized: 'quizá' }).success).toBe(false)
  })
})

describe('transactionSchema', () => {
  const movimiento = {
    id: 12,
    accountId: 1,
    bookedAt: '2026-03-15',
    valueDate: null,
    amountCents: -4250,
    currency: 'EUR',
    counterparty: 'SUPERMERCADO EJEMPLO',
    description: 'COMPRA TARJETA 1234',
    categoryId: 3,
    categorySource: 'rule',
    transferId: null,
    importId: 5,
  }

  it('acepta un movimiento categorizado por una regla', () => {
    expect(transactionSchema.parse(movimiento).categorySource).toBe('rule')
  })

  it('acepta uno sin categorizar: es la bandeja de pendientes', () => {
    const result = transactionSchema.parse({
      ...movimiento,
      categoryId: null,
      categorySource: null,
    })

    expect(result.categoryId).toBeNull()
    expect(result.categorySource).toBeNull()
  })

  it('no expone lo interno: raw, sourceHash y deletedAt se quedan fuera', () => {
    const result = transactionSchema.parse({
      ...movimiento,
      raw: { concepto: 'COMPRA' },
      sourceHash: 'abc123',
      deletedAt: 1770000000000,
    })

    expect(result).not.toHaveProperty('raw')
    expect(result).not.toHaveProperty('sourceHash')
    expect(result).not.toHaveProperty('deletedAt')
  })

  it('rechaza un origen de categoría desconocido', () => {
    expect(transactionSchema.safeParse({ ...movimiento, categorySource: 'ia' }).success).toBe(false)
  })
})

describe('listTransactionsResponseSchema', () => {
  it('el total es el del filtro, no el de la página', () => {
    const result = listTransactionsResponseSchema.parse({
      transactions: [],
      total: 137,
      limit: 50,
      offset: 100,
    })

    expect(result.total).toBe(137)
    expect(result.transactions).toEqual([])
  })
})
