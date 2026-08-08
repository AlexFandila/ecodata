/**
 * Datos inventados. Los IBAN de ejemplo son deliberadamente **no españoles**:
 * el hook pre-commit aborta cualquier commit que contenga `ES` seguido de 22
 * dígitos, incluso inventado, y tiene razón en hacerlo.
 */
import { describe, expect, it } from 'vitest'
import { accountListResponseSchema, accountSchema, createAccountRequestSchema } from './accounts'

const IBAN_SINTETICO = 'DE89370400440532013000'

const cuenta = {
  id: 1,
  name: 'Unicaja nómina',
  provider: 'unicaja',
  type: 'checking',
  currency: 'EUR',
  iban: IBAN_SINTETICO,
  isOwn: true,
  openingBalanceCents: 125000,
  createdAt: '2026-01-15T09:00:00Z',
}

describe('accountSchema', () => {
  it('acepta una cuenta completa', () => {
    expect(accountSchema.parse(cuenta).openingBalanceCents).toBe(125000)
  })

  it('acepta una cuenta sin IBAN, como una de Revolut', () => {
    const result = accountSchema.parse({
      ...cuenta,
      provider: 'revolut',
      iban: null,
    })

    expect(result.iban).toBeNull()
  })

  it('normaliza el IBAN a mayúsculas y sin espacios sobrantes', () => {
    expect(
      accountSchema.parse({ ...cuenta, iban: `  ${IBAN_SINTETICO.toLowerCase()}  ` }).iban,
    ).toBe(IBAN_SINTETICO)
  })

  it('rechaza un IBAN con forma imposible', () => {
    for (const iban of ['1234', 'DE89', 'no-es-un-iban']) {
      expect(accountSchema.safeParse({ ...cuenta, iban }).success).toBe(false)
    }
  })

  it('rechaza un proveedor o un tipo desconocidos', () => {
    expect(accountSchema.safeParse({ ...cuenta, provider: 'santander' }).success).toBe(false)
    expect(accountSchema.safeParse({ ...cuenta, type: 'crypto' }).success).toBe(false)
  })

  it('admite un saldo inicial negativo: una tarjeta puede estar en descubierto', () => {
    expect(
      accountSchema.parse({ ...cuenta, openingBalanceCents: -35000 }).openingBalanceCents,
    ).toBe(-35000)
  })

  it('exige un instante, no una fecha suelta, en createdAt', () => {
    expect(accountSchema.safeParse({ ...cuenta, createdAt: '2026-01-15' }).success).toBe(false)
  })
})

describe('createAccountRequestSchema', () => {
  it('con lo mínimo, rellena los valores habituales', () => {
    const result = createAccountRequestSchema.parse({
      name: 'Revolut personal',
      provider: 'revolut',
      type: 'checking',
      currency: 'EUR',
    })

    expect(result.isOwn).toBe(true)
    expect(result.openingBalanceCents).toBe(0)
    expect(result.iban).toBeNull()
  })

  it('deja marcar una cuenta como ajena para excluirla del matching', () => {
    expect(
      createAccountRequestSchema.parse({
        name: 'Cuenta de un tercero',
        provider: 'manual',
        type: 'checking',
        currency: 'EUR',
        isOwn: false,
      }).isOwn,
    ).toBe(false)
  })

  it('rechaza un nombre vacío', () => {
    expect(
      createAccountRequestSchema.safeParse({
        name: '   ',
        provider: 'manual',
        type: 'checking',
        currency: 'EUR',
      }).success,
    ).toBe(false)
  })
})

describe('accountListResponseSchema', () => {
  it('envuelve la lista en un objeto, no la devuelve pelada', () => {
    const result = accountListResponseSchema.parse({ accounts: [cuenta] })

    expect(result.accounts).toHaveLength(1)
  })

  it('acepta que no haya ninguna cuenta todavía', () => {
    expect(accountListResponseSchema.parse({ accounts: [] }).accounts).toEqual([])
  })
})
