/**
 * Todos los datos de este fichero son inventados: ni cuentas, ni comercios, ni
 * importes reales.
 */
import { describe, expect, it } from 'vitest'
import type { TransferCandidate, TransferMatchingAccount, TransferMatchingInput } from './candidate'
import { matchInternalTransfers } from './match'

const UNICAJA = 1
const REVOLUT = 2
const AJENA = 3

const ACCOUNTS: readonly TransferMatchingAccount[] = [
  { id: UNICAJA, isOwn: true, aliases: ['UNICAJA'] },
  { id: REVOLUT, isOwn: true, aliases: ['REVOLUT'] },
  { id: AJENA, isOwn: false, aliases: ['BANCO EJEMPLO'] },
]

const BASE: TransferCandidate = {
  id: 0,
  accountId: UNICAJA,
  bookedAt: '2026-03-15',
  amountCents: -50_000,
  currency: 'EUR',
  counterparty: null,
  description: null,
}

/** Un movimiento sintético; solo se escribe lo que el caso necesita. */
const txn = (overrides: Partial<TransferCandidate> & { id: number }): TransferCandidate => ({
  ...BASE,
  ...overrides,
})

const match = (
  candidates: readonly TransferCandidate[],
  overrides: Partial<TransferMatchingInput> = {},
) =>
  matchInternalTransfers({
    candidates,
    accounts: ACCOUNTS,
    holderNames: [],
    ...overrides,
  })

/** Las parejas como `[salida, entrada]`, que es lo que casi todo test mira. */
const pairs = (result: ReturnType<typeof match>) =>
  result.matches.map((m) => [m.outTxnId, m.inTxnId])

describe('matchInternalTransfers · candidatura', () => {
  it('empareja un cargo y un abono opuestos entre dos cuentas propias', () => {
    const resultado = match([
      txn({ id: 1, accountId: UNICAJA, amountCents: -50_000 }),
      txn({ id: 2, accountId: REVOLUT, amountCents: 50_000 }),
    ])

    expect(pairs(resultado)).toEqual([[1, 2]])
    expect(resultado.unresolved).toEqual([])
  })

  it('devuelve la pata negativa como salida y la positiva como entrada', () => {
    // El abono se pasa primero a propósito: el orden de entrada no manda.
    const resultado = match([
      txn({ id: 1, accountId: REVOLUT, amountCents: 50_000 }),
      txn({ id: 2, accountId: UNICAJA, amountCents: -50_000 }),
    ])

    expect(resultado.matches).toEqual([
      { outTxnId: 2, inTxnId: 1, score: 1, dayGap: 0, matchedBy: ['close_dates'] },
    ])
  })

  it('no empareja dos movimientos de la misma cuenta', () => {
    const resultado = match([
      txn({ id: 1, accountId: UNICAJA, amountCents: -50_000 }),
      txn({ id: 2, accountId: UNICAJA, amountCents: 50_000 }),
    ])

    expect(resultado.matches).toEqual([])
  })

  it('no empareja si alguna de las dos cuentas no es propia', () => {
    const resultado = match([
      txn({ id: 1, accountId: UNICAJA, amountCents: -50_000 }),
      txn({ id: 2, accountId: AJENA, amountCents: 50_000 }),
    ])

    expect(resultado.matches).toEqual([])
  })

  it('no empareja importes que no son exactamente opuestos', () => {
    const resultado = match([
      txn({ id: 1, accountId: UNICAJA, amountCents: -50_000 }),
      txn({ id: 2, accountId: REVOLUT, amountCents: 49_999 }),
    ])

    expect(resultado.matches).toEqual([])
  })

  it('no empareja importes opuestos en divisas distintas', () => {
    const resultado = match([
      txn({ id: 1, accountId: UNICAJA, amountCents: -50_000, currency: 'EUR' }),
      txn({ id: 2, accountId: REVOLUT, amountCents: 50_000, currency: 'USD' }),
    ])

    expect(resultado.matches).toEqual([])
  })

  it('no empareja dos movimientos de importe cero', () => {
    const resultado = match([
      txn({ id: 1, accountId: UNICAJA, amountCents: 0 }),
      txn({ id: 2, accountId: REVOLUT, amountCents: 0 }),
    ])

    expect(resultado.matches).toEqual([])
  })

  it('no empareja dos cargos ni dos abonos', () => {
    expect(
      match([
        txn({ id: 1, accountId: UNICAJA, amountCents: -50_000 }),
        txn({ id: 2, accountId: REVOLUT, amountCents: -50_000 }),
      ]).matches,
    ).toEqual([])

    expect(
      match([
        txn({ id: 1, accountId: UNICAJA, amountCents: 50_000 }),
        txn({ id: 2, accountId: REVOLUT, amountCents: 50_000 }),
      ]).matches,
    ).toEqual([])
  })

  it('empareja con exactamente tres días de diferencia', () => {
    const resultado = match([
      txn({ id: 1, accountId: UNICAJA, amountCents: -50_000, bookedAt: '2026-03-15' }),
      txn({ id: 2, accountId: REVOLUT, amountCents: 50_000, bookedAt: '2026-03-18' }),
    ])

    expect(pairs(resultado)).toEqual([[1, 2]])
    expect(resultado.matches[0]?.dayGap).toBe(3)
  })

  it('no empareja con cuatro días de diferencia', () => {
    const resultado = match([
      txn({ id: 1, accountId: UNICAJA, amountCents: -50_000, bookedAt: '2026-03-15' }),
      txn({ id: 2, accountId: REVOLUT, amountCents: 50_000, bookedAt: '2026-03-19' }),
    ])

    expect(resultado.matches).toEqual([])
  })

  it('mide los tres días hacia atrás igual que hacia adelante', () => {
    const resultado = match([
      txn({ id: 1, accountId: UNICAJA, amountCents: -50_000, bookedAt: '2026-03-18' }),
      txn({ id: 2, accountId: REVOLUT, amountCents: 50_000, bookedAt: '2026-03-15' }),
    ])

    expect(pairs(resultado)).toEqual([[1, 2]])
  })

  it('devuelve un resultado vacío sin candidatos', () => {
    expect(match([])).toEqual({ matches: [], unresolved: [] })
  })
})

describe('matchInternalTransfers · señales', () => {
  it('anota las señales que dispararon el emparejamiento', () => {
    const resultado = match(
      [
        txn({
          id: 1,
          accountId: UNICAJA,
          amountCents: -50_000,
          description: 'TRANSF.SEPA NACIONAL A REVOLUT',
        }),
        txn({ id: 2, accountId: REVOLUT, amountCents: 50_000, counterparty: 'Alex Ejemplo' }),
      ],
      { holderNames: ['Alex Ejemplo'] },
    )

    expect(resultado.matches).toEqual([
      {
        outTxnId: 1,
        inTxnId: 2,
        score: 3,
        dayGap: 0,
        matchedBy: ['other_provider_named', 'holder_named', 'close_dates'],
      },
    ])
  })
})

describe('matchInternalTransfers · desempate', () => {
  it('elige el candidato con más puntuación cuando hay varios', () => {
    const resultado = match([
      txn({ id: 1, accountId: UNICAJA, amountCents: -50_000, bookedAt: '2026-03-15' }),
      // Mismo día que el cargo: suma el +1 de fechas cercanas.
      txn({ id: 2, accountId: REVOLUT, amountCents: 50_000, bookedAt: '2026-03-15' }),
      txn({ id: 3, accountId: REVOLUT, amountCents: 50_000, bookedAt: '2026-03-18' }),
    ])

    expect(pairs(resultado)).toEqual([[1, 2]])
    expect(resultado.unresolved).toEqual([])
  })

  it('empareja un candidato único aunque no sume ninguna señal', () => {
    // Sin nombres reconocibles y con tres días de por medio: puntuación 0.
    // La puntuación desempata, no acepta (ADR-013).
    const resultado = match([
      txn({ id: 1, accountId: UNICAJA, amountCents: -3_742, bookedAt: '2026-03-15' }),
      txn({ id: 2, accountId: REVOLUT, amountCents: 3_742, bookedAt: '2026-03-18' }),
    ])

    expect(pairs(resultado)).toEqual([[1, 2]])
    expect(resultado.matches[0]?.score).toBe(0)
    expect(resultado.matches[0]?.matchedBy).toEqual([])
  })

  it('deja sin emparejar y marca para revisión cuando dos candidatos empatan en la mejor puntuación', () => {
    const resultado = match([
      txn({ id: 1, accountId: UNICAJA, amountCents: -50_000, bookedAt: '2026-03-15' }),
      txn({ id: 2, accountId: REVOLUT, amountCents: 50_000, bookedAt: '2026-03-15' }),
      txn({ id: 3, accountId: REVOLUT, amountCents: 50_000, bookedAt: '2026-03-15' }),
    ])

    expect(resultado.matches).toEqual([])
    expect(resultado.unresolved).toEqual([
      { transactionId: 1, reason: 'tie', tiedWith: [2, 3], score: 1 },
    ])
  })

  it('nombra en la revisión los ids que empataban y con qué puntuación', () => {
    const resultado = match([
      txn({ id: 10, accountId: UNICAJA, amountCents: -50_000, description: 'A REVOLUT' }),
      txn({ id: 20, accountId: REVOLUT, amountCents: 50_000 }),
      txn({ id: 30, accountId: REVOLUT, amountCents: 50_000 }),
    ])

    expect(resultado.unresolved).toEqual([
      { transactionId: 10, reason: 'tie', tiedWith: [20, 30], score: 3 },
    ])
  })

  it('no empareja un movimiento cuyo único candidato prefiere a otro', () => {
    // El cargo 1 solo tiene al abono 2 como opción, pero el abono 2 prefiere
    // el cargo 3, que lo nombra y es del mismo día. El 1 se queda sin pareja y
    // no es un empate: no hay nada que llevar a revisión.
    const resultado = match([
      txn({ id: 1, accountId: UNICAJA, amountCents: -50_000, bookedAt: '2026-03-12' }),
      txn({ id: 2, accountId: REVOLUT, amountCents: 50_000, bookedAt: '2026-03-15' }),
      txn({
        id: 3,
        accountId: UNICAJA,
        amountCents: -50_000,
        bookedAt: '2026-03-15',
        description: 'TRASPASO A REVOLUT',
      }),
    ])

    expect(pairs(resultado)).toEqual([[3, 2]])
    expect(resultado.unresolved).toEqual([])
  })

  it('empareja en una pasada posterior el movimiento que se queda libre al resolverse otro par', () => {
    // 1 y 3 compiten por 2; 1 gana por nombre. Al retirarse el par 1-2, el
    // cargo 3 se queda con el abono 4 en la ronda siguiente.
    const resultado = match([
      txn({
        id: 1,
        accountId: UNICAJA,
        amountCents: -50_000,
        bookedAt: '2026-03-15',
        description: 'TRASPASO A REVOLUT',
      }),
      txn({ id: 2, accountId: REVOLUT, amountCents: 50_000, bookedAt: '2026-03-15' }),
      txn({ id: 3, accountId: UNICAJA, amountCents: -50_000, bookedAt: '2026-03-15' }),
      txn({ id: 4, accountId: REVOLUT, amountCents: 50_000, bookedAt: '2026-03-17' }),
    ])

    expect(pairs(resultado)).toEqual([
      [1, 2],
      [3, 4],
    ])
    expect(resultado.unresolved).toEqual([])
  })

  it('resuelve un empate que deja de serlo cuando uno de los rivales se empareja antes', () => {
    // El cargo 3 empata entre los abonos 2 y 4 (los dos a un día). Pero el
    // abono 2 se va con el cargo 1, que lo nombra; en la ronda siguiente el
    // empate de 3 ya no existe y se empareja con 4.
    const resultado = match([
      txn({
        id: 1,
        accountId: UNICAJA,
        amountCents: -50_000,
        bookedAt: '2026-03-15',
        description: 'TRASPASO A REVOLUT',
      }),
      txn({ id: 2, accountId: REVOLUT, amountCents: 50_000, bookedAt: '2026-03-15' }),
      txn({ id: 3, accountId: UNICAJA, amountCents: -50_000, bookedAt: '2026-03-16' }),
      txn({ id: 4, accountId: REVOLUT, amountCents: 50_000, bookedAt: '2026-03-17' }),
    ])

    expect(pairs(resultado)).toEqual([
      [1, 2],
      [3, 4],
    ])
    expect(resultado.unresolved).toEqual([])
  })

  it('da el mismo resultado aunque se baraje el orden de los candidatos de entrada', () => {
    const candidatos = [
      txn({ id: 1, accountId: UNICAJA, amountCents: -50_000, description: 'A REVOLUT' }),
      txn({ id: 2, accountId: REVOLUT, amountCents: 50_000 }),
      txn({ id: 3, accountId: UNICAJA, amountCents: -50_000, bookedAt: '2026-03-16' }),
      txn({ id: 4, accountId: REVOLUT, amountCents: 50_000, bookedAt: '2026-03-17' }),
      txn({ id: 5, accountId: UNICAJA, amountCents: -12_345 }),
      txn({ id: 6, accountId: REVOLUT, amountCents: 12_345 }),
    ]

    const esperado = match(candidatos)
    expect(esperado.matches).not.toEqual([])
    expect(match([...candidatos].reverse())).toEqual(esperado)
    expect(match([...candidatos.slice(3), ...candidatos.slice(0, 3)])).toEqual(esperado)
  })

  it('devuelve las parejas ordenadas por el id de la pata de cargo y las revisiones por id', () => {
    const resultado = match([
      txn({ id: 9, accountId: UNICAJA, amountCents: -12_345 }),
      txn({ id: 8, accountId: REVOLUT, amountCents: 12_345 }),
      txn({ id: 7, accountId: UNICAJA, amountCents: -67_800 }),
      txn({ id: 6, accountId: REVOLUT, amountCents: 67_800 }),
    ])

    expect(resultado.matches.map((m) => m.outTxnId)).toEqual([7, 9])
  })

  it('no coloca ningún movimiento en dos parejas', () => {
    const resultado = match([
      txn({ id: 1, accountId: UNICAJA, amountCents: -50_000, description: 'A REVOLUT' }),
      txn({ id: 2, accountId: REVOLUT, amountCents: 50_000 }),
      txn({ id: 3, accountId: UNICAJA, amountCents: -50_000, bookedAt: '2026-03-16' }),
      txn({ id: 4, accountId: REVOLUT, amountCents: 50_000, bookedAt: '2026-03-17' }),
    ])

    const usados = resultado.matches.flatMap((m) => [m.outTxnId, m.inTxnId])
    expect(new Set(usados).size).toBe(usados.length)
  })
})

describe('matchInternalTransfers · errores', () => {
  it('lanza si dos candidatos comparten id', () => {
    expect(() =>
      match([
        txn({ id: 1, accountId: UNICAJA, amountCents: -50_000 }),
        txn({ id: 1, accountId: REVOLUT, amountCents: 50_000 }),
      ]),
    ).toThrow(/comparten el id 1/)
  })

  it('lanza si un candidato apunta a una cuenta que no viene en la lista', () => {
    expect(() => match([txn({ id: 1, accountId: 99 })])).toThrow(/cuenta 99/)
  })

  it('lanza nombrando el movimiento si su fecha contable no existe en el calendario', () => {
    expect(() => match([txn({ id: 7, bookedAt: '2026-02-31' })])).toThrow(
      /movimiento 7.*2026-02-31/s,
    )
  })
})

describe('matchInternalTransfers · casos borde declarados en DATA_MODEL', () => {
  it('deja sin emparejar la recarga de Revolut con tarjeta, cuyos importes no son opuestos exactos', () => {
    // En Unicaja sale como pago de tarjeta con comisión; en Revolut entra el
    // importe limpio. No cumple el criterio (b) y se resuelve a mano.
    const resultado = match([
      txn({
        id: 1,
        accountId: UNICAJA,
        amountCents: -10_150,
        description: 'COMPRA TARJETA REVOLUT',
      }),
      txn({ id: 2, accountId: REVOLUT, amountCents: 10_000, description: 'Recarga' }),
    ])

    expect(resultado.matches).toEqual([])
  })

  it('no empareja una transferencia dividida en dos movimientos', () => {
    const resultado = match([
      txn({ id: 1, accountId: UNICAJA, amountCents: -10_000 }),
      txn({ id: 2, accountId: REVOLUT, amountCents: 6_000 }),
      txn({ id: 3, accountId: REVOLUT, amountCents: 4_000 }),
    ])

    expect(resultado.matches).toEqual([])
    expect(resultado.unresolved).toEqual([])
  })

  it('no empareja dos patas en divisas distintas aunque el importe convertido cuadre', () => {
    // Fuera de alcance de la v1: requeriría tolerancia con fx_rates.
    const resultado = match([
      txn({ id: 1, accountId: UNICAJA, amountCents: -10_000, currency: 'EUR' }),
      txn({ id: 2, accountId: REVOLUT, amountCents: 10_000, currency: 'GBP' }),
    ])

    expect(resultado.matches).toEqual([])
  })

  it('no empareja movimientos separados por un fin de semana de más de tres días', () => {
    // Viernes 13 y miércoles 18 de marzo de 2026: cinco días.
    const resultado = match([
      txn({ id: 1, accountId: UNICAJA, amountCents: -50_000, bookedAt: '2026-03-13' }),
      txn({ id: 2, accountId: REVOLUT, amountCents: 50_000, bookedAt: '2026-03-18' }),
    ])

    expect(resultado.matches).toEqual([])
  })
})

describe('matchInternalTransfers · escala', () => {
  it('empareja miles de movimientos agrupando por divisa e importe', () => {
    const candidatos: TransferCandidate[] = []
    for (let i = 0; i < 2_000; i += 1) {
      // Importes distintos entre sí: cada pareja cae en su propia cubeta.
      const amountCents = 1_000 + i
      candidatos.push(
        txn({ id: i * 2 + 1, accountId: UNICAJA, amountCents: -amountCents }),
        txn({ id: i * 2 + 2, accountId: REVOLUT, amountCents }),
      )
      // Ruido: un gasto de la misma cuenta que no puede emparejar con nada.
      candidatos.push(txn({ id: 100_000 + i, accountId: UNICAJA, amountCents: -7 }))
    }

    const resultado = match(candidatos)

    expect(resultado.matches).toHaveLength(2_000)
    expect(resultado.unresolved).toEqual([])
    expect(resultado.matches.every((m) => m.inTxnId === m.outTxnId + 1)).toBe(true)
  })
})
