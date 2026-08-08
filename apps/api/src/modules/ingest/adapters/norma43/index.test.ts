/**
 * Todos los datos de este fichero son inventados: entidades, oficinas, números
 * de cuenta, nombres e importes no corresponden a ninguna cuenta real.
 */
import { normalizedTransactionListSchema } from '@finanzas/shared'
import { describe, expect, it } from 'vitest'
import { Norma43FormatError } from './errors'
import { norma43Adapter } from './index'
import { norma43Bytes, type SyntheticStatement } from './testing'

/** Extracto de referencia: una nómina, un alquiler y una transferencia propia. */
const EXTRACTO: SyntheticStatement = {
  bank: '9999',
  branch: '1234',
  account: '0000000001',
  openingBalanceCents: 128609,
  movements: [
    {
      operationDate: '260501',
      amountCents: -30000,
      free: '2307',
      concepts: [{ first: 'TRANSF.SEPA NACIONAL', second: 'Auto transferencia' }],
    },
    {
      operationDate: '260503',
      valueDate: '260504',
      amountCents: 170890,
      commonConcept: '03',
      concepts: [{ first: 'NOMIN.TRANF.NACIONAL', second: 'EMPRESA EJEMPLO SL' }],
    },
    {
      operationDate: '260510',
      amountCents: -95000,
      concepts: [{ first: 'RECIBO DOMICILIADO', second: 'ARRENDADOR EJEMPLO' }],
    },
  ],
}

function leer(statement: SyntheticStatement | readonly SyntheticStatement[], options = {}) {
  return norma43Adapter.read(norma43Bytes(statement, options))
}

describe('norma43Adapter · lectura de un extracto', () => {
  it('se identifica con el literal que se guarda en imports.source', () => {
    expect(norma43Adapter.id).toBe('norma43')
  })

  it('lee todos los movimientos, en el orden del fichero', () => {
    const { transactions, rowErrors } = leer(EXTRACTO)

    expect(rowErrors).toEqual([])
    expect(transactions.map((movimiento) => movimiento.amountCents)).toEqual([
      -30000, 170890, -95000,
    ])
  })

  it('los dígitos del fichero son céntimos: no se multiplica por cien en ningún momento', () => {
    const [primero] = leer(EXTRACTO).transactions

    expect(primero?.amountCents).toBe(-30000)
    expect(Number.isSafeInteger(primero?.amountCents)).toBe(true)
  })

  it('el signo lo pone la clave debe/haber, no el importe', () => {
    const { transactions } = leer(EXTRACTO)

    expect(transactions[0]?.amountCents).toBeLessThan(0)
    expect(transactions[1]?.amountCents).toBeGreaterThan(0)
  })

  it('traduce las fechas AAMMDD y conserva la fecha valor cuando difiere', () => {
    const { transactions } = leer(EXTRACTO)

    expect(transactions[0]?.bookedAt).toBe('2026-05-01')
    expect(transactions[0]?.valueDate).toBe('2026-05-01')
    expect(transactions[1]?.bookedAt).toBe('2026-05-03')
    expect(transactions[1]?.valueDate).toBe('2026-05-04')
  })

  it('deja la fecha valor a null cuando la fuente no la da', () => {
    const { transactions } = leer({
      movements: [{ amountCents: -100, valueDate: '      ' }],
    })

    expect(transactions[0]?.valueDate).toBeNull()
  })

  it('trata la fecha valor a ceros como ausente, no como fecha ilegible', () => {
    const { transactions, rowErrors } = leer({
      movements: [{ amountCents: -100, valueDate: '000000' }],
    })

    expect(rowErrors).toEqual([])
    expect(transactions[0]?.valueDate).toBeNull()
  })

  it('la divisa sale de la cabecera de cuenta, que es donde la pone la norma', () => {
    expect(leer(EXTRACTO).transactions[0]?.currency).toBe('EUR')
    expect(leer({ ...EXTRACTO, currency: '840' }).transactions[0]?.currency).toBe('USD')
  })
})

describe('norma43Adapter · concepto', () => {
  it('conserva las dos mitades del registro 23, no solo la que enseña el Excel', () => {
    const [primero] = leer(EXTRACTO).transactions

    expect(primero?.description).toBe('TRANSF.SEPA NACIONAL Auto transferencia')
  })

  it('no inventa contraparte: la Norma 43 no la distingue del concepto (ADR-010)', () => {
    const { transactions } = leer(EXTRACTO)

    expect(transactions.every((movimiento) => movimiento.counterparty === null)).toBe(true)
  })

  it('concatena varios registros de concepto ampliado en orden', () => {
    const { transactions } = leer({
      movements: [
        {
          amountCents: -100,
          concepts: [
            { code: '01', first: 'PAGO TARJETA', second: 'COMERCIO EJEMPLO' },
            { code: '02', first: 'TERMINAL 000123', second: '' },
          ],
        },
      ],
    })

    expect(transactions[0]?.description).toBe('PAGO TARJETA COMERCIO EJEMPLO TERMINAL 000123')
  })

  it('un movimiento sin conceptos deja la descripción a null, no a cadena vacía', () => {
    const { transactions, rowErrors } = leer({ movements: [{ amountCents: -100 }] })

    expect(rowErrors).toEqual([])
    expect(transactions[0]?.description).toBeNull()
  })
})

describe('norma43Adapter · raw', () => {
  it('guarda los registros literales para poder re-normalizar (invariante 4)', () => {
    const [primero] = leer(EXTRACTO).transactions
    const registros = primero?.raw.registros

    expect(Array.isArray(registros)).toBe(true)
    expect(registros).toHaveLength(2)
    expect((registros as string[])[0]?.startsWith('22')).toBe(true)
    expect((registros as string[])[1]?.startsWith('23')).toBe(true)
  })

  it('lleva la cuenta del fichero, para que el pipeline pueda cotejarla después', () => {
    const [primero] = leer(EXTRACTO).transactions

    expect(primero?.raw.entidad).toBe('9999')
    expect(primero?.raw.oficina).toBe('1234')
    expect(primero?.raw.cuenta).toBe('0000000001')
  })

  it('conserva el campo libre donde Unicaja mete la hora, sin interpretarlo', () => {
    const [primero] = leer(EXTRACTO).transactions

    expect(primero?.raw.libre).toBe('2307')
  })
})

describe('norma43Adapter · filas que no se pueden leer', () => {
  it('reporta la fila y sigue con el resto del extracto', () => {
    const { transactions, rowErrors } = leer({
      openingBalanceCents: 0,
      movements: [
        { operationDate: '260301', amountCents: -100 },
        { operationDate: '260231', amountCents: -200 },
        { operationDate: '260303', amountCents: -300 },
      ],
    })

    expect(transactions).toHaveLength(2)
    expect(rowErrors).toHaveLength(1)
    expect(rowErrors[0]?.row).toBe(2)
    expect(rowErrors[0]?.message).toMatch(/Fecha de operación ilegible/)
  })

  it('numera la fila por movimiento, no por línea física del fichero', () => {
    const { rowErrors } = leer({
      openingBalanceCents: 0,
      movements: [
        { operationDate: '260301', amountCents: -100, concepts: [{ first: 'UNO' }] },
        { operationDate: '260302', amountCents: -200, concepts: [{ first: 'DOS' }] },
        { operationDate: '261340', amountCents: -300, concepts: [{ first: 'TRES' }] },
      ],
    })

    // El tercer movimiento ocupa las líneas 7 y 8 del fichero, pero es la fila 3.
    expect(rowErrors[0]?.row).toBe(3)
  })

  it('una fecha valor ilegible descarta la fila en vez de colar una fecha inventada', () => {
    const { transactions, rowErrors } = leer({
      movements: [{ amountCents: -100, valueDate: '269999' }],
    })

    expect(transactions).toEqual([])
    expect(rowErrors[0]?.message).toMatch(/Fecha valor ilegible/)
  })
})

describe('norma43Adapter · fichero que no se puede aceptar', () => {
  it('rechaza un fichero con varias cuentas: una importación va a una sola', () => {
    expect(() => leer([EXTRACTO, EXTRACTO])).toThrow(/trae 2 cuentas/)
  })

  it('rechaza una divisa que no conocemos', () => {
    expect(() => leer({ ...EXTRACTO, currency: '999' })).toThrow(/Divisa no admitida/)
  })

  it('rechaza una divisa sin dos decimales, que la escala de la norma no cubre', () => {
    expect(() => leer({ ...EXTRACTO, currency: '392' })).toThrow(/dos decimales/)
  })

  it('rechaza un importe ilegible: sin él no hay forma de verificar el fichero', () => {
    expect(() => leer({ movements: [{ amountCents: -100, rawSign: '7' }] })).toThrow(
      /Importe ilegible/,
    )
    expect(() => leer({ movements: [{ amountCents: -100, rawAmount: '0000000003O0OO' }] })).toThrow(
      /Importe ilegible/,
    )
  })

  it('lo que lanza es siempre un Norma43FormatError, para que la ruta lo distinga', () => {
    expect(() => leer([EXTRACTO, EXTRACTO])).toThrow(Norma43FormatError)
    expect(() => norma43Adapter.read(new Uint8Array())).toThrow(Norma43FormatError)
  })
})

/**
 * Lo que justifica haber elegido este formato frente al `.xls`: el fichero
 * declara sus propios totales, así que una lectura incompleta se detecta en vez
 * de acabar en un saldo mal para siempre (ADR-010).
 */
describe('norma43Adapter · integridad', () => {
  it('acepta el extracto cuando todo cuadra', () => {
    expect(() => leer(EXTRACTO)).not.toThrow()
  })

  it('rechaza un recuento de apuntes que no coincide', () => {
    expect(() => leer({ ...EXTRACTO, footer: { debitCount: 5 } })).toThrow(/apuntes/)
  })

  it('rechaza un total del debe que no cuadra al céntimo', () => {
    expect(() => leer({ ...EXTRACTO, footer: { debitTotalCents: 124999 } })).toThrow(
      /total del debe/,
    )
  })

  it('rechaza un total del haber que no cuadra al céntimo', () => {
    expect(() => leer({ ...EXTRACTO, footer: { creditTotalCents: 1 } })).toThrow(/total del haber/)
  })

  it('rechaza un saldo final que no sale de sumar los movimientos al inicial', () => {
    expect(() => leer({ ...EXTRACTO, footer: { closingBalanceCents: 999999 } })).toThrow(
      /saldo no cuadra/,
    )
  })

  it('detecta que falta un movimiento aunque el fichero parezca bien formado', () => {
    const truncado: SyntheticStatement = {
      ...EXTRACTO,
      movements: (EXTRACTO.movements ?? []).slice(0, 2),
      footer: {
        debitCount: 2,
        creditCount: 1,
        debitTotalCents: 125000,
        creditTotalCents: 170890,
        closingBalanceCents: 174499,
      },
    }

    expect(() => leer(truncado)).toThrow(Norma43FormatError)
  })

  it('rechaza un recuento de registros que no coincide', () => {
    expect(() => leer(EXTRACTO, { fileFooter: { recordCount: 3 } })).toThrow(/registros/)
  })

  it('admite el registro 88 tanto si se cuenta a sí mismo como si no', () => {
    // 11 + (22 + 23) × 3 + 33 = 8 registros antes del propio 88.
    expect(() => leer(EXTRACTO, { fileFooter: { recordCount: 8 } })).not.toThrow()
    expect(() => leer(EXTRACTO, { fileFooter: { recordCount: 9 } })).not.toThrow()
  })

  it('admite un fichero sin registro 88: los totales del 33 ya lo verifican', () => {
    expect(() => leer(EXTRACTO, { fileFooter: null })).not.toThrow()
  })
})

describe('norma43Adapter · contrato', () => {
  it('todo lo que devuelve cumple el esquema de shared', () => {
    const { transactions } = leer(EXTRACTO)

    expect(normalizedTransactionListSchema.safeParse(transactions).success).toBe(true)
  })

  it('un extracto sin movimientos es un lote vacío, no un error', () => {
    const { transactions, rowErrors } = leer({ openingBalanceCents: 5000, movements: [] })

    expect(transactions).toEqual([])
    expect(rowErrors).toEqual([])
  })

  it('da igual con qué salto de línea venga el fichero', () => {
    const conCrLf = leer(EXTRACTO)
    for (const newline of ['\n', '\r', '']) {
      expect(leer(EXTRACTO, { newline })).toEqual(conCrLf)
    }
  })
})
