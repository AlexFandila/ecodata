/**
 * Todos los datos de este fichero son inventados: comercios, nombres, productos
 * e importes no corresponden a ninguna cuenta real.
 */
import { normalizedTransactionListSchema } from '@finanzas/shared'
import { describe, expect, it } from 'vitest'
import { RevolutCsvFormatError } from './errors'
import { revolutCsvAdapter } from './index'
import {
  HEADINGS_EN,
  type RevolutCsvOptions,
  revolutCsvBytes,
  type SyntheticStatement,
  utf8Bytes,
} from './testing'

/** Extracto de referencia: una recarga, un pago con tarjeta y un alquiler. */
const EXTRACTO: SyntheticStatement = {
  openingBalanceCents: 128609,
  movements: [
    {
      type: 'Recargas',
      startedAt: '2026-05-01 08:00:00',
      completedAt: '2026-05-01 08:00:31',
      description: 'Nombre Ejemplo',
      amountCents: 30000,
    },
    {
      type: 'Pago con tarjeta',
      startedAt: '2026-05-03 12:33:11',
      completedAt: '2026-05-03 18:02:44',
      description: 'Comercio Ejemplo',
      amountCents: -2450,
    },
    {
      type: 'Transferir',
      startedAt: '2026-05-10 09:00:00',
      completedAt: '2026-05-10 09:00:12',
      description: 'Arrendador Ejemplo',
      amountCents: -95000,
    },
  ],
}

function leer(statement: SyntheticStatement, options: RevolutCsvOptions = {}) {
  return revolutCsvAdapter.read(revolutCsvBytes(statement, options))
}

describe('revolutCsvAdapter · lectura de un extracto', () => {
  it('se identifica con el literal que se guarda en imports.source', () => {
    expect(revolutCsvAdapter.id).toBe('revolut_csv')
  })

  it('lee todos los movimientos, en el orden del fichero', () => {
    const { transactions, rowErrors } = leer(EXTRACTO)

    expect(rowErrors).toEqual([])
    expect(transactions.map((movimiento) => movimiento.amountCents)).toEqual([30000, -2450, -95000])
  })

  it('el signo del importe es el que lleva la celda: negativo = cargo', () => {
    const { transactions } = leer(EXTRACTO)

    expect(transactions[0]?.amountCents).toBeGreaterThan(0)
    expect(transactions[1]?.amountCents).toBeLessThan(0)
  })

  it('los importes son enteros de céntimos, sin haber pasado por un float', () => {
    const { transactions } = leer({
      movements: [{ amountCents: -816 }, { amountCents: 10 }, { amountCents: 123456789 }],
    })

    expect(transactions.map((movimiento) => movimiento.amountCents)).toEqual([-816, 10, 123456789])
    expect(transactions.every((movimiento) => Number.isSafeInteger(movimiento.amountCents))).toBe(
      true,
    )
  })

  it('un fichero con solo la cabecera no es un error: es un extracto sin movimientos', () => {
    expect(leer({ movements: [] })).toEqual({ transactions: [], rowErrors: [] })
  })

  it('el salto de línea final no inventa una fila', () => {
    expect(leer(EXTRACTO, { trailingNewline: true }).transactions).toHaveLength(3)
  })

  it('lee igual un fichero con CRLF', () => {
    expect(leer(EXTRACTO, { newline: '\r\n' }).transactions).toHaveLength(3)
  })
})

describe('revolutCsvAdapter · fechas', () => {
  it('la fecha contable es la de finalización, sin la hora', () => {
    const { transactions } = leer(EXTRACTO)

    expect(transactions[0]?.bookedAt).toBe('2026-05-01')
    expect(transactions[1]?.bookedAt).toBe('2026-05-03')
  })

  it('la fecha de inicio no se cuela en valueDate: Revolut no da fecha valor', () => {
    // La primera operación se lanzó en abril y se liquidó en mayo.
    const { transactions } = leer({
      movements: [
        {
          startedAt: '2026-04-30 23:50:00',
          completedAt: '2026-05-02 09:14:03',
          amountCents: -1000,
        },
      ],
    })

    expect(transactions[0]?.bookedAt).toBe('2026-05-02')
    expect(transactions[0]?.valueDate).toBeNull()
    expect(transactions[0]?.raw).toMatchObject({ fechaInicio: '2026-04-30 23:50:00' })
  })
})

describe('revolutCsvAdapter · contraparte y concepto', () => {
  it('la descripción es la contraparte y el tipo es el concepto', () => {
    const { transactions } = leer(EXTRACTO)

    expect(transactions[1]?.counterparty).toBe('Comercio Ejemplo')
    expect(transactions[1]?.description).toBe('Pago con tarjeta')
    expect(transactions[2]?.counterparty).toBe('Arrendador Ejemplo')
    expect(transactions[2]?.description).toBe('Transferir')
  })

  it('una celda vacía es la ausencia de dato, no una cadena vacía', () => {
    const { transactions, rowErrors } = leer({
      movements: [{ type: '', description: '   ', amountCents: -1000 }],
    })

    expect(rowErrors).toEqual([])
    expect(transactions[0]?.counterparty).toBeNull()
    expect(transactions[0]?.description).toBeNull()
  })

  it('una descripción con comas no parte la fila', () => {
    const { transactions } = leer({
      movements: [{ description: 'Comercio Ejemplo, S.L.', amountCents: -2450 }],
    })

    expect(transactions[0]?.counterparty).toBe('Comercio Ejemplo, S.L.')
    expect(transactions[0]?.amountCents).toBe(-2450)
  })
})

describe('revolutCsvAdapter · filas que no llegaron a ocurrir', () => {
  it('se salta las que no tienen fecha de finalización, y no las cuenta como error', () => {
    const { transactions, rowErrors } = leer({
      movements: [
        { description: 'Comercio Ejemplo', amountCents: -2450 },
        { description: 'Compra Devuelta', completedAt: '', state: 'DEVUELTO', amountCents: -9900 },
        { description: 'Otro Comercio', amountCents: -1000 },
      ],
    })

    expect(rowErrors).toEqual([])
    expect(transactions).toHaveLength(2)
    expect(transactions.map((movimiento) => movimiento.counterparty)).toEqual([
      'Comercio Ejemplo',
      'Otro Comercio',
    ])
  })

  it('una devuelta tampoco rompe la cadena de saldos: no movió el saldo', () => {
    expect(() =>
      leer({
        openingBalanceCents: 100000,
        movements: [
          { amountCents: -2450 },
          { completedAt: '', state: 'DEVUELTO', amountCents: -9900 },
          { amountCents: -1000 },
        ],
      }),
    ).not.toThrow()
  })
})

describe('revolutCsvAdapter · comisiones', () => {
  it('la comisión sale de la cuenta además del importe', () => {
    const { transactions, rowErrors } = leer({
      movements: [{ type: 'Cambio', amountCents: -10000, feeCents: 30 }],
    })

    expect(rowErrors).toEqual([])
    expect(transactions[0]?.amountCents).toBe(-10030)
  })

  it('el importe neto es el que encadena el saldo, así que un fichero con comisiones cuadra', () => {
    const { transactions } = leer({
      openingBalanceCents: 50000,
      movements: [
        { amountCents: -10000, feeCents: 30 },
        { amountCents: -5000, feeCents: 15 },
      ],
    })

    expect(transactions.map((movimiento) => movimiento.amountCents)).toEqual([-10030, -5015])
  })

  it('la celda de comisión en blanco es una comisión de cero', () => {
    const { transactions, rowErrors } = leer({
      movements: [{ amountCents: -2450, rawFee: '' }],
    })

    expect(rowErrors).toEqual([])
    expect(transactions[0]?.amountCents).toBe(-2450)
  })
})

describe('revolutCsvAdapter · multidivisa', () => {
  const MULTIDIVISA: SyntheticStatement = {
    movements: [
      { description: 'Comercio Ejemplo', amountCents: -2450, currency: 'EUR' },
      { description: 'Cambio a libras', amountCents: -10000, currency: 'EUR' },
      { description: 'Cambio desde euros', amountCents: 8400, currency: 'GBP' },
      { description: 'Comercio Britanico', amountCents: -1200, currency: 'GBP' },
    ],
  }

  it('cada movimiento conserva su divisa, sin convertir nada', () => {
    const { transactions, rowErrors } = leer(MULTIDIVISA)

    expect(rowErrors).toEqual([])
    expect(transactions.map((movimiento) => movimiento.currency)).toEqual([
      'EUR',
      'EUR',
      'GBP',
      'GBP',
    ])
    expect(transactions.map((movimiento) => movimiento.amountCents)).toEqual([
      -2450, -10000, 8400, -1200,
    ])
  })

  it('el saldo se encadena por bolsillo, no en un solo hilo', () => {
    // Si la verificación mezclara las divisas, este fichero no cuadraría.
    expect(() => leer(MULTIDIVISA)).not.toThrow()
  })

  it('dos productos con la misma divisa son bolsillos distintos', () => {
    const { transactions } = leer({
      movements: [
        { product: 'Actual', amountCents: -2450 },
        { product: 'Ahorro', amountCents: 10000 },
        { product: 'Actual', amountCents: -1000 },
        { product: 'Ahorro', amountCents: 5000 },
      ],
    })

    expect(transactions).toHaveLength(4)
  })

  it('la escala la pone la divisa de la fila: el yen no tiene decimales', () => {
    const { transactions, rowErrors } = leer({
      movements: [{ amountCents: -1234, currency: 'JPY' }],
    })

    expect(rowErrors).toEqual([])
    expect(transactions[0]?.currency).toBe('JPY')
    expect(transactions[0]?.amountCents).toBe(-1234)
  })
})

describe('revolutCsvAdapter · integridad', () => {
  it('un saldo que no encadena rechaza el fichero entero', () => {
    const descuadrado: SyntheticStatement = {
      openingBalanceCents: 100000,
      movements: [{ amountCents: -2450 }, { amountCents: -1000, rawBalance: '1.00' }],
    }

    expect(() => leer(descuadrado)).toThrow(RevolutCsvFormatError)
    expect(() => leer(descuadrado)).toThrow(/El saldo no cuadra en la fila 2/)
  })

  it('el mensaje dice de qué bolsillo se trata', () => {
    expect(() =>
      leer({
        movements: [
          { product: 'Ahorro', currency: 'GBP', amountCents: -2450 },
          { product: 'Ahorro', currency: 'GBP', amountCents: -1000, rawBalance: '1.00' },
        ],
      }),
    ).toThrow(/Ahorro · GBP/)
  })

  it('el primer saldo de cada bolsillo es el ancla y no hay contra qué comprobarlo', () => {
    // No se conoce el saldo anterior al primer movimiento del fichero, así que
    // esta fila entra sin verificar. Es el mismo hueco que tiene cualquier
    // extracto que no declare su saldo inicial.
    expect(() => leer({ movements: [{ amountCents: -2450, rawBalance: '999.99' }] })).not.toThrow()
  })

  it('una comisión con el signo cambiado descuadraría el saldo y se vería', () => {
    // La suposición del adaptador es que la comisión resta. Este fixture escribe
    // el saldo como si sumara: el fichero se rechaza en vez de importar importes
    // torcidos (ADR-011, punto 5).
    const comisionQueSuma: SyntheticStatement = {
      openingBalanceCents: 100000,
      movements: [
        { amountCents: -10000, feeCents: 30 },
        { amountCents: -10000, feeCents: 30, rawBalance: '800.60' },
      ],
    }

    expect(() => leer(comisionQueSuma)).toThrow(RevolutCsvFormatError)
  })
})

describe('revolutCsvAdapter · filas que no se pueden leer', () => {
  it('una divisa desconocida va a rowErrors y el resto se importa', () => {
    const { transactions, rowErrors } = leer({
      movements: [
        { description: 'Comercio Ejemplo', amountCents: -2450 },
        { description: 'Pago en rupias', amountCents: -1000, currency: 'INR' },
        { description: 'Otro Comercio', amountCents: -1000 },
      ],
    })

    expect(transactions).toHaveLength(2)
    expect(rowErrors).toEqual([{ row: 2, message: 'Divisa no admitida: «INR»' }])
  })

  it('un importe ilegible va a rowErrors', () => {
    const { transactions, rowErrors } = leer({
      movements: [{ amountCents: 0, rawAmount: '24,50 €' }],
    })

    expect(transactions).toEqual([])
    expect(rowErrors[0]?.message).toMatch(/Importe ilegible/)
  })

  it('una fila ilegible deja su bolsillo sin verificar en vez de inventarse un descuadre', () => {
    // El movimiento del medio movió el saldo de este mismo bolsillo pero no se ha
    // podido leer cuánto. Si la cadena no se volviera a anclar, el tercero se
    // compararía contra el saldo del primero y el fichero abortaría por un
    // descuadre que no existe.
    const { transactions, rowErrors } = leer({
      openingBalanceCents: 100000,
      movements: [
        { amountCents: -2450 },
        { amountCents: -1000, rawAmount: '24,50 €' },
        { amountCents: -500 },
      ],
    })

    expect(rowErrors).toHaveLength(1)
    expect(rowErrors[0]?.message).toMatch(/Importe ilegible/)
    expect(transactions).toHaveLength(2)
  })

  it('una fila en otra divisa es otro bolsillo, y no toca la cadena de este', () => {
    const { transactions, rowErrors } = leer({
      openingBalanceCents: 100000,
      movements: [
        { amountCents: -2450 },
        { amountCents: -1000, currency: 'INR' },
        { amountCents: -500 },
      ],
    })

    expect(rowErrors).toHaveLength(1)
    expect(transactions.map((movimiento) => movimiento.amountCents)).toEqual([-2450, -500])
  })

  it('una fecha de finalización ilegible va a rowErrors, y su saldo sigue contando', () => {
    const { transactions, rowErrors } = leer({
      openingBalanceCents: 100000,
      movements: [
        { amountCents: -2450 },
        { amountCents: -1000, completedAt: '31/05/2026 10:00:00' },
        { amountCents: -500 },
      ],
    })

    expect(transactions).toHaveLength(2)
    expect(rowErrors[0]).toMatchObject({ row: 2 })
    expect(rowErrors[0]?.message).toMatch(/Fecha de finalización ilegible/)
  })

  it('el número de fila cuenta desde la primera fila de datos, sin la cabecera', () => {
    const { rowErrors } = leer({
      movements: [
        { amountCents: -1000 },
        { amountCents: -1000 },
        { amountCents: 0, currency: 'INR' },
      ],
    })

    expect(rowErrors[0]?.row).toBe(3)
  })
})

describe('revolutCsvAdapter · fichero que no se puede aceptar', () => {
  it('una cabecera que no es la de Revolut', () => {
    const otro = utf8Bytes('fecha,concepto,importe\n2026-05-01,Algo,-24.50')

    expect(() => revolutCsvAdapter.read(otro)).toThrow(RevolutCsvFormatError)
  })

  it('un fichero vacío', () => {
    expect(() => revolutCsvAdapter.read(new Uint8Array())).toThrow(RevolutCsvFormatError)
  })

  it('una fila con más o menos campos que la cabecera', () => {
    const texto = revolutCsvBytes(EXTRACTO)
    const roto = utf8Bytes(`${new TextDecoder().decode(texto)}\nRecargas,Actual`)

    expect(() => revolutCsvAdapter.read(roto)).toThrow(RevolutCsvFormatError)
    expect(() => revolutCsvAdapter.read(roto)).toThrow(/2 campos y la cabecera declara 10/)
  })

  it('unos bytes que no son UTF-8', () => {
    expect(() => revolutCsvAdapter.read(new Uint8Array([0x41, 0xf1, 0x42]))).toThrow(
      RevolutCsvFormatError,
    )
  })
})

describe('revolutCsvAdapter · idioma del export', () => {
  it('el export en inglés da exactamente lo mismo que el español', () => {
    const español = leer(EXTRACTO)
    const inglés = leer(EXTRACTO, { headings: HEADINGS_EN })

    expect(inglés.transactions.map((movimiento) => ({ ...movimiento, raw: undefined }))).toEqual(
      español.transactions.map((movimiento) => ({ ...movimiento, raw: undefined })),
    )
  })

  it('el estado no se interpreta: la fila entra por tener fecha de finalización', () => {
    const { transactions, rowErrors } = leer({
      movements: [
        { state: 'COMPLETED', amountCents: -2450 },
        { state: 'COMPLETADO', amountCents: -1000 },
        { state: 'ABGESCHLOSSEN', amountCents: -500 },
      ],
    })

    expect(rowErrors).toEqual([])
    expect(transactions).toHaveLength(3)
  })
})

describe('revolutCsvAdapter · raw y contrato', () => {
  it('conserva la fila original entera, invariante 4', () => {
    const { transactions } = leer(EXTRACTO)

    expect(transactions[1]?.raw).toMatchObject({
      formato: 'revolut_csv',
      tipo: 'Pago con tarjeta',
      producto: 'Actual',
      fechaInicio: '2026-05-03 12:33:11',
      fechaFinalizacion: '2026-05-03 18:02:44',
      descripcion: 'Comercio Ejemplo',
      importe: '-24.50',
      comision: '0.00',
      divisa: 'EUR',
      estado: 'COMPLETADO',
    })
  })

  it('guarda también las celdas literales', () => {
    const [primero] = leer(EXTRACTO).transactions
    const celdas = (primero?.raw as { celdas?: readonly string[] } | undefined)?.celdas

    expect(celdas).toHaveLength(10)
    expect(celdas?.[0]).toBe('Recargas')
  })

  it('todo lo que devuelve cumple el esquema de shared', () => {
    const { transactions } = leer(EXTRACTO)

    expect(normalizedTransactionListSchema.safeParse(transactions).success).toBe(true)
  })

  it('no calcula el hash de deduplicación: eso es del pipeline, que sí conoce la cuenta', () => {
    const [primero] = leer(EXTRACTO).transactions

    expect(primero).not.toHaveProperty('sourceHash')
    expect(primero).not.toHaveProperty('accountId')
  })
})
