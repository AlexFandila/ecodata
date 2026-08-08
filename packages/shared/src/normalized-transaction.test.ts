/**
 * Todos los datos de este fichero son inventados: nombres de comercio, IBANs y
 * cantidades no corresponden a ninguna cuenta real.
 */
import { describe, expect, it } from 'vitest'
import {
  type NormalizedTransaction,
  normalizedTransactionListSchema,
  normalizedTransactionSchema,
} from './normalized-transaction'

/** Movimiento válido mínimo, sobre el que cada test cambia una sola cosa. */
function fila(overrides: Record<string, unknown> = {}) {
  return {
    bookedAt: '2026-03-15',
    valueDate: '2026-03-16',
    amountCents: -4250,
    currency: 'EUR',
    counterparty: 'SUPERMERCADO EJEMPLO',
    description: 'COMPRA TARJETA 1234',
    raw: { fecha: '15/03/2026', concepto: 'COMPRA TARJETA 1234', importe: '-42,50' },
    ...overrides,
  }
}

describe('normalizedTransactionSchema', () => {
  it('acepta un movimiento completo', () => {
    const result = normalizedTransactionSchema.parse(fila())

    expect(result.amountCents).toBe(-4250)
    expect(result.currency).toBe('EUR')
    expect(result.raw).toEqual({
      fecha: '15/03/2026',
      concepto: 'COMPRA TARJETA 1234',
      importe: '-42,50',
    })
  })

  it('acepta los campos opcionales a null', () => {
    const result = normalizedTransactionSchema.parse(
      fila({ valueDate: null, counterparty: null, description: null }),
    )

    expect(result.valueDate).toBeNull()
    expect(result.counterparty).toBeNull()
    expect(result.description).toBeNull()
  })

  it('exige esos campos aunque puedan ser null: omitirlos no vale', () => {
    const { counterparty, ...sinContraparte } = fila()

    expect(counterparty).toBeTruthy()
    expect(normalizedTransactionSchema.safeParse(sinContraparte).success).toBe(false)
  })

  it('recorta los espacios que traen las celdas de un CSV', () => {
    const result = normalizedTransactionSchema.parse(
      fila({ counterparty: '  PANADERIA EJEMPLO  ' }),
    )

    expect(result.counterparty).toBe('PANADERIA EJEMPLO')
  })

  it('rechaza una celda vacía o solo con espacios: eso es null, no cadena vacía', () => {
    expect(normalizedTransactionSchema.safeParse(fila({ description: '' })).success).toBe(false)
    expect(normalizedTransactionSchema.safeParse(fila({ description: '   ' })).success).toBe(false)
  })
})

describe('normalizedTransactionSchema · fechas', () => {
  it('rechaza un día que no existe', () => {
    expect(normalizedTransactionSchema.safeParse(fila({ bookedAt: '2026-02-31' })).success).toBe(
      false,
    )
  })

  it('acepta el 29 de febrero de un año bisiesto', () => {
    expect(normalizedTransactionSchema.safeParse(fila({ bookedAt: '2024-02-29' })).success).toBe(
      true,
    )
  })

  it('rechaza formatos que no son ISO', () => {
    for (const fecha of ['15/03/2026', '2026-3-15', '2026-03-15T00:00:00Z', '']) {
      expect(normalizedTransactionSchema.safeParse(fila({ bookedAt: fecha })).success).toBe(false)
    }
  })
})

describe('normalizedTransactionSchema · importes', () => {
  it('rechaza un importe con decimales: los euros van en céntimos', () => {
    expect(normalizedTransactionSchema.safeParse(fila({ amountCents: -42.5 })).success).toBe(false)
  })

  it('rechaza un entero fuera del rango seguro', () => {
    expect(
      normalizedTransactionSchema.safeParse(fila({ amountCents: Number.MAX_SAFE_INTEGER + 2 }))
        .success,
    ).toBe(false)
  })

  it('rechaza NaN e infinito', () => {
    for (const importe of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(normalizedTransactionSchema.safeParse(fila({ amountCents: importe })).success).toBe(
        false,
      )
    }
  })

  it('acepta un cargo y un abono, que se distinguen por el signo', () => {
    expect(normalizedTransactionSchema.parse(fila({ amountCents: -1 })).amountCents).toBe(-1)
    expect(normalizedTransactionSchema.parse(fila({ amountCents: 185000 })).amountCents).toBe(
      185000,
    )
  })

  it('rechaza una divisa desconocida o en minúsculas', () => {
    expect(normalizedTransactionSchema.safeParse(fila({ currency: 'eur' })).success).toBe(false)
    expect(normalizedTransactionSchema.safeParse(fila({ currency: 'XXX' })).success).toBe(false)
  })
})

describe('normalizedTransactionSchema · raw', () => {
  it('es obligatorio: sin la fila original no se puede re-normalizar (invariante 4)', () => {
    const { raw, ...sinRaw } = fila()

    expect(raw).toBeTruthy()
    expect(normalizedTransactionSchema.safeParse(sinRaw).success).toBe(false)
  })

  it('admite estructuras anidadas, como la respuesta de una API', () => {
    const anidado = {
      transactionAmount: { amount: '-42.50', currency: 'EUR' },
      remittanceInformationUnstructured: ['COMPRA', 'TARJETA'],
      internalId: null,
    }

    expect(normalizedTransactionSchema.parse(fila({ raw: anidado })).raw).toEqual(anidado)
  })

  it('rechaza lo que no sobreviviría a un JSON.stringify', () => {
    expect(normalizedTransactionSchema.safeParse(fila({ raw: { fn: () => 1 } })).success).toBe(
      false,
    )
    expect(normalizedTransactionSchema.safeParse(fila({ raw: { x: undefined } })).success).toBe(
      false,
    )
  })
})

/**
 * El ensayo de la tarea siguiente: lo que tendrán que producir
 * `UnicajaCsvAdapter` y `RevolutCsvAdapter`. Si estas dos formas no caben en el
 * esquema, el contrato está mal planteado y es ahora cuando hay que verlo.
 */
describe('normalizedTransactionListSchema · lo que devolverá un adaptador', () => {
  it('acepta un lote de Unicaja, todo en euros', () => {
    const lote: NormalizedTransaction[] = normalizedTransactionListSchema.parse([
      {
        bookedAt: '2026-03-01',
        valueDate: '2026-03-01',
        amountCents: 210000,
        currency: 'EUR',
        counterparty: 'EMPRESA EJEMPLO SL',
        description: 'NOMINA MARZO',
        raw: { FECHA: '01/03/2026', CONCEPTO: 'NOMINA MARZO', IMPORTE: '2.100,00' },
      },
      {
        bookedAt: '2026-03-03',
        valueDate: null,
        amountCents: -95000,
        currency: 'EUR',
        counterparty: 'ARRENDADOR EJEMPLO',
        description: 'RECIBO ALQUILER',
        raw: { FECHA: '03/03/2026', CONCEPTO: 'RECIBO ALQUILER', IMPORTE: '-950,00' },
      },
    ])

    expect(lote).toHaveLength(2)
    expect(lote[0]?.amountCents).toBe(210000)
  })

  it('acepta un lote de Revolut con dos divisas en el mismo fichero', () => {
    const lote = normalizedTransactionListSchema.parse([
      {
        bookedAt: '2026-03-10',
        valueDate: null,
        amountCents: -1299,
        currency: 'EUR',
        counterparty: 'TIENDA EJEMPLO',
        description: 'Card payment',
        raw: { Type: 'CARD_PAYMENT', Amount: '-12.99', Currency: 'EUR' },
      },
      {
        bookedAt: '2026-03-11',
        valueDate: null,
        amountCents: -2500,
        currency: 'GBP',
        counterparty: 'EXAMPLE SHOP LTD',
        description: 'Card payment',
        raw: { Type: 'CARD_PAYMENT', Amount: '-25.00', Currency: 'GBP' },
      },
    ])

    expect(lote.map((m) => m.currency)).toEqual(['EUR', 'GBP'])
  })

  it('acepta un lote vacío: un extracto sin movimientos no es un error', () => {
    expect(normalizedTransactionListSchema.parse([])).toEqual([])
  })
})
