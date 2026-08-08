/**
 * Todos los datos de este fichero son inventados: ni comercios ni conceptos
 * bancarios reales.
 */
import { describe, expect, it } from 'vitest'
import {
  categorizationOutcomeSchema,
  createRuleRequestSchema,
  createRuleResponseSchema,
  ruleListResponseSchema,
  ruleSchema,
} from './rules'

const regla = {
  id: 1,
  priority: 100,
  field: 'counterparty',
  matchType: 'contains',
  pattern: 'SUPERMERCADO EJEMPLO',
  categoryId: 5,
  active: true,
}

describe('ruleSchema', () => {
  it('acepta una regla de contiene', () => {
    expect(ruleSchema.parse(regla).pattern).toBe('SUPERMERCADO EJEMPLO')
  })

  it('acepta una regla de expresión regular válida', () => {
    const result = ruleSchema.parse({ ...regla, matchType: 'regex', pattern: '^PAGO .*TARJETA$' })

    expect(result.matchType).toBe('regex')
  })

  it('admite prioridades negativas, que es "antes que todo lo demás"', () => {
    expect(ruleSchema.parse({ ...regla, priority: -10 }).priority).toBe(-10)
  })

  it('rechaza una expresión regular que no compila', () => {
    const result = ruleSchema.safeParse({ ...regla, matchType: 'regex', pattern: '(sin cerrar' })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['pattern'])
  })

  it('rechaza una regex que solo falla con las banderas del motor', () => {
    // `\-` es un escape inútil: sin `u` pasaría, y el motor la compila con `u`.
    // Validar con otras banderas sería aceptar aquí lo que allí falla.
    expect(
      ruleSchema.safeParse({ ...regla, matchType: 'regex', pattern: 'PAGO\\-TARJETA' }).success,
    ).toBe(false)
  })

  it('rechaza un patrón de contiene sin letras ni cifras', () => {
    // Una aguja vacía está contenida en cualquier texto: la regla se tragaría
    // el extracto entero.
    for (const pattern of ['***', '---', '. . .']) {
      expect(ruleSchema.safeParse({ ...regla, pattern }).success).toBe(false)
    }
  })

  it('rechaza un patrón vacío o desmesurado', () => {
    expect(ruleSchema.safeParse({ ...regla, pattern: '   ' }).success).toBe(false)
    expect(ruleSchema.safeParse({ ...regla, pattern: 'A'.repeat(201) }).success).toBe(false)
  })

  it('rechaza un campo o un tipo de comparación desconocidos', () => {
    expect(ruleSchema.safeParse({ ...regla, field: 'amount' }).success).toBe(false)
    expect(ruleSchema.safeParse({ ...regla, matchType: 'starts_with' }).success).toBe(false)
  })

  it('rechaza una regla sin categoría: una regla que no categoriza no es una regla', () => {
    expect(ruleSchema.safeParse({ ...regla, categoryId: null }).success).toBe(false)
  })
})

describe('createRuleRequestSchema · valores por defecto', () => {
  it('crear una regla desde un movimiento son dos campos', () => {
    const result = createRuleRequestSchema.parse({
      field: 'counterparty',
      pattern: 'FARMACIA EJEMPLO',
      categoryId: 5,
    })

    expect(result).toEqual({
      priority: 100,
      field: 'counterparty',
      matchType: 'contains',
      pattern: 'FARMACIA EJEMPLO',
      categoryId: 5,
      active: true,
    })
  })

  it('valida el patrón igual que `ruleSchema`', () => {
    expect(
      createRuleRequestSchema.safeParse({
        field: 'description',
        matchType: 'regex',
        pattern: '[',
        categoryId: 5,
      }).success,
    ).toBe(false)
  })
})

describe('ruleListResponseSchema', () => {
  it('envuelve la lista en un objeto con clave nombrada', () => {
    expect(ruleListResponseSchema.parse({ rules: [regla] }).rules).toHaveLength(1)
  })

  it('rechaza un array pelado', () => {
    expect(ruleListResponseSchema.safeParse([regla]).success).toBe(false)
  })
})

describe('categorizationOutcomeSchema', () => {
  const sinCambios = { scanned: 12, categorized: 0, cleared: 0, invalidRules: [] }

  it('acepta una pasada que no ha cambiado nada', () => {
    expect(categorizationOutcomeSchema.parse(sinCambios).scanned).toBe(12)
  })

  it('rechaza contadores negativos: son cuentas de cambios, no saldos', () => {
    expect(categorizationOutcomeSchema.safeParse({ ...sinCambios, cleared: -1 }).success).toBe(
      false,
    )
  })

  it('reporta la regla saltada con su id y su mensaje, sin el motivo', () => {
    const result = categorizationOutcomeSchema.parse({
      ...sinCambios,
      invalidRules: [{ ruleId: 3, message: 'Expresión regular no válida' }],
    })

    // El `reason` se queda en `packages/core`: sacarlo obligaría a duplicar
    // `INVALID_RULE_REASONS` aquí, y el cliente no decide nada con él.
    expect(result.invalidRules[0]).toEqual({ ruleId: 3, message: 'Expresión regular no válida' })
    expect(result.invalidRules[0]).not.toHaveProperty('reason')
  })
})

describe('createRuleResponseSchema', () => {
  it('devuelve la regla y lo que ha hecho al aplicarla', () => {
    const result = createRuleResponseSchema.parse({
      rule: regla,
      categorization: { scanned: 40, categorized: 9, cleared: 0, invalidRules: [] },
    })

    expect(result.rule.id).toBe(1)
    expect(result.categorization.categorized).toBe(9)
  })

  it('exige las dos mitades: una regla sin efecto no es la respuesta de esta ruta', () => {
    expect(createRuleResponseSchema.safeParse({ rule: regla }).success).toBe(false)
  })
})
