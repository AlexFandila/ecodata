/**
 * Todos los datos de este fichero son inventados: ni comercios, ni conceptos
 * bancarios reales.
 */
import { describe, expect, it } from 'vitest'
import { applyCategoryRules } from './apply'
import { CategoryRulesError } from './errors'
import type { CategorizableTransaction, CategoryRule } from './rule'

const SUPERMERCADO = 10
const RESTAURANTES = 11
const SUSCRIPCIONES = 12

const REGLA_BASE: CategoryRule = {
  id: 0,
  priority: 100,
  field: 'counterparty',
  matchType: 'contains',
  pattern: 'PATRON',
  categoryId: SUPERMERCADO,
}

const MOVIMIENTO_BASE: CategorizableTransaction = {
  id: 0,
  counterparty: null,
  description: null,
}

/** Una regla sintética; solo se escribe lo que el caso necesita. */
const regla = (overrides: Partial<CategoryRule> & { id: number }): CategoryRule => ({
  ...REGLA_BASE,
  ...overrides,
})

/** Un movimiento sintético; solo se escribe lo que el caso necesita. */
const txn = (
  overrides: Partial<CategorizableTransaction> & { id: number },
): CategorizableTransaction => ({ ...MOVIMIENTO_BASE, ...overrides })

describe('applyCategoryRules · coincidencia', () => {
  it('categoriza un movimiento cuya contraparte contiene el patrón', () => {
    const resultado = applyCategoryRules({
      transactions: [txn({ id: 1, counterparty: 'SUPERMERCADO EJEMPLO 42' })],
      rules: [regla({ id: 7, pattern: 'SUPERMERCADO', categoryId: SUPERMERCADO })],
    })

    expect(resultado.assignments).toEqual([
      { transactionId: 1, categoryId: SUPERMERCADO, ruleId: 7 },
    ])
  })

  it('deja fuera del resultado a los movimientos que no casan con ninguna regla', () => {
    // La ausencia es el estado "sin categorizar": no hay lista de descartados.
    const resultado = applyCategoryRules({
      transactions: [txn({ id: 1, counterparty: 'FARMACIA EJEMPLO' })],
      rules: [regla({ id: 7, pattern: 'SUPERMERCADO' })],
    })

    expect(resultado.assignments).toEqual([])
  })

  it('mira el campo que dice la regla y no el otro', () => {
    const resultado = applyCategoryRules({
      transactions: [
        txn({ id: 1, counterparty: 'CAFETERIA EJEMPLO', description: 'Pago con tarjeta' }),
      ],
      rules: [
        regla({ id: 7, field: 'description', pattern: 'CAFETERIA', categoryId: RESTAURANTES }),
      ],
    })

    expect(resultado.assignments).toEqual([])
  })

  it('categoriza contra la descripción cuando la contraparte viene vacía', () => {
    // Es el caso de la Norma 43: deja `counterparty` a null y lo mete todo en
    // la descripción (ADR-010 punto 7).
    const resultado = applyCategoryRules({
      transactions: [txn({ id: 1, description: 'TRANSF.SEPA NACIONAL NOMINA MARZO' })],
      rules: [regla({ id: 7, field: 'description', pattern: 'NOMINA', categoryId: RESTAURANTES })],
    })

    expect(resultado.assignments).toEqual([
      { transactionId: 1, categoryId: RESTAURANTES, ruleId: 7 },
    ])
  })

  it('no casa nunca contra un campo nulo', () => {
    const resultado = applyCategoryRules({
      transactions: [txn({ id: 1, counterparty: null, description: 'Compra' })],
      rules: [regla({ id: 7, field: 'counterparty', matchType: 'regex', pattern: '.*' })],
    })

    expect(resultado.assignments).toEqual([])
  })
})

describe('applyCategoryRules · orden', () => {
  it('gana la regla de menor prioridad numérica', () => {
    const resultado = applyCategoryRules({
      transactions: [txn({ id: 1, counterparty: 'RESTAURANTE DEL SUPERMERCADO' })],
      rules: [
        regla({ id: 1, priority: 50, pattern: 'RESTAURANTE', categoryId: RESTAURANTES }),
        regla({ id: 2, priority: 10, pattern: 'SUPERMERCADO', categoryId: SUPERMERCADO }),
      ],
    })

    expect(resultado.assignments).toEqual([
      { transactionId: 1, categoryId: SUPERMERCADO, ruleId: 2 },
    ])
  })

  it('desempata dos reglas de la misma prioridad por id ascendente', () => {
    // `priority` sola no es un orden total: sin este criterio el resultado
    // dependería de cómo SQLite hubiera devuelto las filas (ADR-014 decisión 3).
    const resultado = applyCategoryRules({
      transactions: [txn({ id: 1, counterparty: 'RESTAURANTE DEL SUPERMERCADO' })],
      rules: [
        regla({ id: 9, priority: 10, pattern: 'RESTAURANTE', categoryId: RESTAURANTES }),
        regla({ id: 4, priority: 10, pattern: 'SUPERMERCADO', categoryId: SUPERMERCADO }),
      ],
    })

    expect(resultado.assignments).toEqual([
      { transactionId: 1, categoryId: SUPERMERCADO, ruleId: 4 },
    ])
  })

  it('da el mismo resultado aunque se barajen las reglas y los movimientos de entrada', () => {
    const reglas = [
      regla({ id: 3, priority: 20, pattern: 'CAFE', categoryId: RESTAURANTES }),
      regla({ id: 1, priority: 10, pattern: 'SUPERMERCADO', categoryId: SUPERMERCADO }),
      regla({ id: 2, priority: 20, pattern: 'CAFETERIA', categoryId: SUSCRIPCIONES }),
    ]
    const movimientos = [
      txn({ id: 3, counterparty: 'CAFETERIA EJEMPLO' }),
      txn({ id: 1, counterparty: 'SUPERMERCADO EJEMPLO' }),
      txn({ id: 2, counterparty: 'FARMACIA EJEMPLO' }),
    ]

    const directo = applyCategoryRules({ transactions: movimientos, rules: reglas })
    const barajado = applyCategoryRules({
      transactions: [...movimientos].reverse(),
      rules: [...reglas].reverse(),
    })

    expect(barajado).toEqual(directo)
    // Y la salida sale ordenada por movimiento, no por orden de entrada.
    expect(directo.assignments).toEqual([
      { transactionId: 1, categoryId: SUPERMERCADO, ruleId: 1 },
      // `CAFE` (id 3) y `CAFETERIA` (id 2) empatan a 20: gana el id menor.
      { transactionId: 3, categoryId: SUSCRIPCIONES, ruleId: 2 },
    ])
  })
})

describe('applyCategoryRules · reglas inválidas', () => {
  it('salta la regla rota y sigue aplicando las demás', () => {
    const resultado = applyCategoryRules({
      transactions: [txn({ id: 1, counterparty: 'SUPERMERCADO EJEMPLO' })],
      rules: [
        regla({ id: 1, priority: 10, matchType: 'regex', pattern: '(sin cerrar' }),
        regla({ id: 2, priority: 20, pattern: 'SUPERMERCADO', categoryId: SUPERMERCADO }),
      ],
    })

    expect(resultado.assignments).toEqual([
      { transactionId: 1, categoryId: SUPERMERCADO, ruleId: 2 },
    ])
    expect(resultado.invalidRules).toHaveLength(1)
    expect(resultado.invalidRules[0]?.ruleId).toBe(1)
    expect(resultado.invalidRules[0]?.reason).toBe('invalid_regex')
  })

  it('reporta un patrón de `contains` sin letras ni números', () => {
    const resultado = applyCategoryRules({
      transactions: [txn({ id: 1, counterparty: 'LO QUE SEA' })],
      rules: [regla({ id: 5, pattern: '---' })],
    })

    expect(resultado.assignments).toEqual([])
    expect(resultado.invalidRules).toEqual([
      { ruleId: 5, reason: 'empty_pattern', message: expect.any(String) },
    ])
  })

  it('ordena las reglas inválidas por id ascendente', () => {
    const resultado = applyCategoryRules({
      transactions: [],
      rules: [
        regla({ id: 8, priority: 10, matchType: 'regex', pattern: '[' }),
        regla({ id: 2, priority: 20, matchType: 'regex', pattern: '(' }),
      ],
    })

    expect(resultado.invalidRules.map((r) => r.ruleId)).toEqual([2, 8])
  })
})

describe('applyCategoryRules · errores', () => {
  it('lanza si dos reglas comparten id', () => {
    expect(() =>
      applyCategoryRules({
        transactions: [],
        rules: [regla({ id: 1 }), regla({ id: 1, pattern: 'OTRO' })],
      }),
    ).toThrow(CategoryRulesError)
  })

  it('lanza si dos movimientos comparten id', () => {
    expect(() =>
      applyCategoryRules({
        transactions: [txn({ id: 1 }), txn({ id: 1 })],
        rules: [],
      }),
    ).toThrow(CategoryRulesError)
  })

  it('lanza si una prioridad no es un entero', () => {
    expect(() =>
      applyCategoryRules({ transactions: [], rules: [regla({ id: 1, priority: 1.5 })] }),
    ).toThrow(CategoryRulesError)
  })
})

describe('applyCategoryRules · escala', () => {
  it('compila cada patrón una sola vez para todo el lote', () => {
    const reglas = Array.from({ length: 50 }, (_, i) =>
      regla({ id: i + 1, priority: i, matchType: 'regex', pattern: `COMERCIO-${i}\\b` }),
    )
    const movimientos = Array.from({ length: 5_000 }, (_, i) =>
      txn({ id: i + 1, counterparty: `COMERCIO-${i % 50} SUCURSAL ${i}` }),
    )

    const resultado = applyCategoryRules({ transactions: movimientos, rules: reglas })

    expect(resultado.assignments).toHaveLength(5_000)
    expect(resultado.invalidRules).toEqual([])
  })
})
