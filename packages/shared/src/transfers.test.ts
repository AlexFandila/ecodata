/** Todos los datos de este fichero son inventados. */
import { describe, expect, it } from 'vitest'
import {
  createTransferRequestSchema,
  listTransfersQuerySchema,
  TRANSFERS_DEFAULT_LIMIT,
  TRANSFERS_MAX_LIMIT,
  transferSchema,
  transferWithLegsSchema,
  updateTransferStatusRequestSchema,
} from './transfers'

const MOVIMIENTO = {
  id: 1,
  accountId: 1,
  bookedAt: '2026-03-15',
  valueDate: null,
  amountCents: -20000,
  currency: 'EUR',
  counterparty: null,
  description: 'TRANSF A REVOLUT',
  categoryId: 3,
  categorySource: 'transfer',
  transferId: 9,
  importId: 1,
}

const TRANSFERENCIA = {
  id: 9,
  outTxnId: 1,
  inTxnId: 2,
  status: 'auto',
  matchedBy: ['other_provider_named', 'close_dates'],
  createdAt: '2026-03-16T09:00:00Z',
}

describe('transferSchema', () => {
  it('acepta una transferencia emparejada por la heurística', () => {
    expect(transferSchema.parse(TRANSFERENCIA).matchedBy).toEqual([
      'other_provider_named',
      'close_dates',
    ])
  })

  it('acepta una manual, que no tiene señales que enseñar', () => {
    const parsed = transferSchema.parse({ ...TRANSFERENCIA, status: 'manual', matchedBy: [] })

    expect(parsed.matchedBy).toEqual([])
  })

  it('rechaza una señal que no está en la lista cerrada', () => {
    expect(() => transferSchema.parse({ ...TRANSFERENCIA, matchedBy: ['mismo_importe'] })).toThrow()
  })

  it('rechaza un estado inventado', () => {
    expect(() => transferSchema.parse({ ...TRANSFERENCIA, status: 'rejected' })).toThrow()
  })

  it('exige que `createdAt` sea un instante y no una fecha de calendario', () => {
    expect(() => transferSchema.parse({ ...TRANSFERENCIA, createdAt: '2026-03-16' })).toThrow()
  })
})

describe('transferWithLegsSchema', () => {
  it('lleva los dos movimientos dentro', () => {
    const parsed = transferWithLegsSchema.parse({
      ...TRANSFERENCIA,
      out: MOVIMIENTO,
      in: { ...MOVIMIENTO, id: 2, accountId: 2, amountCents: 20000 },
    })

    expect(parsed.out.id).toBe(1)
    expect(parsed.in.amountCents).toBe(20000)
  })

  it('las patas siguen sin exponer lo interno', () => {
    const parsed = transferWithLegsSchema.parse({
      ...TRANSFERENCIA,
      out: { ...MOVIMIENTO, raw: { fila: 'original' }, sourceHash: 'hash', deletedAt: null },
      in: { ...MOVIMIENTO, id: 2, accountId: 2, amountCents: 20000 },
    })

    expect(parsed.out).not.toHaveProperty('raw')
    expect(parsed.out).not.toHaveProperty('sourceHash')
    expect(parsed.out).not.toHaveProperty('deletedAt')
  })
})

describe('listTransfersQuerySchema', () => {
  it('sin filtros pagina con los valores por defecto y no acota el estado', () => {
    const result = listTransfersQuerySchema.parse({})

    expect(result).toEqual({ limit: TRANSFERS_DEFAULT_LIMIT, offset: 0 })
  })

  it('coacciona la paginación, que llega como texto en la query string', () => {
    expect(listTransfersQuerySchema.parse({ limit: '10', offset: '20' })).toEqual({
      limit: 10,
      offset: 20,
    })
  })

  it('no deja pedirse más de lo que cabe en una pantalla', () => {
    expect(() =>
      listTransfersQuerySchema.parse({ limit: String(TRANSFERS_MAX_LIMIT + 1) }),
    ).toThrow()
  })

  it('rechaza un estado que no existe', () => {
    expect(() => listTransfersQuerySchema.parse({ status: 'pendiente' })).toThrow()
  })
})

describe('createTransferRequestSchema', () => {
  it('pide los dos ids y nada más: el estado lo pone la API', () => {
    const parsed = createTransferRequestSchema.parse({
      outTxnId: 1,
      inTxnId: 2,
      status: 'confirmed',
    })

    expect(parsed).toEqual({ outTxnId: 1, inTxnId: 2 })
  })

  it('rechaza un id que la base no puede haber emitido', () => {
    expect(() => createTransferRequestSchema.parse({ outTxnId: 0, inTxnId: 2 })).toThrow()
  })
})

describe('updateTransferStatusRequestSchema', () => {
  it('solo admite confirmar', () => {
    expect(updateTransferStatusRequestSchema.parse({ status: 'confirmed' }).status).toBe(
      'confirmed',
    )
  })

  it('deshacer no es un estado: es un DELETE', () => {
    expect(() => updateTransferStatusRequestSchema.parse({ status: 'auto' })).toThrow()
    expect(() => updateTransferStatusRequestSchema.parse({ status: 'manual' })).toThrow()
  })
})
