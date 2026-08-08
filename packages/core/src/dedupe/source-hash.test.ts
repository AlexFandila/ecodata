/**
 * Todos los datos de este fichero son inventados: ni cuentas, ni comercios, ni
 * importes reales.
 */
import { describe, expect, it } from 'vitest'
import { type SourceHashInput, sourceHash } from './source-hash'

const BASE: SourceHashInput = {
  accountId: 1,
  bookedAt: '2026-03-15',
  amountCents: -250,
  currency: 'EUR',
  counterparty: 'CAFETERIA EJEMPLO',
  description: 'Compra con tarjeta',
  occurrence: 0,
}

/** El hash de `BASE` con los cambios indicados. */
const hash = (overrides: Partial<SourceHashInput> = {}) => sourceHash({ ...BASE, ...overrides })

describe('sourceHash · forma', () => {
  it('es determinista: la misma entrada da siempre el mismo hash', () => {
    expect(hash()).toBe(hash())
  })

  it('devuelve un SHA-256 en hexadecimal', () => {
    expect(hash()).toMatch(/^[0-9a-f]{64}$/)
  })

  it('no depende del orden en que se escriban las claves', () => {
    const alReves: SourceHashInput = {
      occurrence: BASE.occurrence,
      description: BASE.description,
      counterparty: BASE.counterparty,
      currency: BASE.currency,
      amountCents: BASE.amountCents,
      bookedAt: BASE.bookedAt,
      accountId: BASE.accountId,
    }

    expect(sourceHash(alReves)).toBe(hash())
  })
})

describe('sourceHash · cada campo cuenta', () => {
  it('distingue la cuenta: el mismo apunte en dos cuentas son dos movimientos', () => {
    expect(hash({ accountId: 2 })).not.toBe(hash())
  })

  it('distingue la fecha contable', () => {
    expect(hash({ bookedAt: '2026-03-16' })).not.toBe(hash())
  })

  it('distingue el importe, incluido el signo', () => {
    expect(hash({ amountCents: -251 })).not.toBe(hash())
    expect(hash({ amountCents: 250 })).not.toBe(hash())
  })

  it('distingue la contraparte y la descripción', () => {
    expect(hash({ counterparty: 'OTRA CAFETERIA' })).not.toBe(hash())
    expect(hash({ description: 'Otro concepto' })).not.toBe(hash())
  })
})

describe('sourceHash · la divisa (ADR-011)', () => {
  it('distingue dos movimientos idénticos en divisas distintas', () => {
    // El caso del cambio de divisa en Revolut: misma fecha, mismo importe y
    // misma descripción. Sin la divisa en el hash, el segundo se descartaría
    // como duplicado y desaparecería del extracto.
    expect(hash({ currency: 'USD' })).not.toBe(hash())
  })
})

describe('sourceHash · el ordinal de ocurrencia (ADR-012)', () => {
  it('distingue dos movimientos por lo demás idénticos', () => {
    // Dos cafés de 2,50 € en el mismo comercio el mismo día.
    expect(hash({ occurrence: 1 })).not.toBe(hash())
  })

  it('vuelve a dar el mismo hash con el mismo ordinal: reimportar es idempotente', () => {
    expect(hash({ occurrence: 3 })).toBe(hash({ occurrence: 3 }))
  })
})

describe('sourceHash · ambigüedades que un separador dejaría abiertas', () => {
  it('separa "sin contraparte" de "contraparte vacía"', () => {
    // `trimmedText` de shared obliga al adaptador a decidir `null`, pero el
    // hash no puede depender de que nadie se lo salte nunca.
    expect(hash({ counterparty: null })).not.toBe(hash({ counterparty: '' }))
  })

  it('separa el null de la descripción del null de la contraparte', () => {
    expect(hash({ counterparty: null })).not.toBe(hash({ description: null }))
  })

  it('no deja que un texto desplace los campos', () => {
    // Con los campos pegados por un separador, estos dos serían la misma
    // cadena en cuanto el separador fuese `|`.
    const juntos = hash({ counterparty: 'A|B', description: null })
    const separados = hash({ counterparty: 'A', description: 'B' })

    expect(juntos).not.toBe(separados)
  })

  it('trata igual las dos formas Unicode del mismo texto', () => {
    // 'CAFÉ' con la E acentuada como un carácter (NFC) y como E + tilde
    // combinante (NFD): se leen igual, son bytes distintos y son el mismo
    // movimiento.
    const compuesto = 'CAFÉ EJEMPLO'
    const descompuesto = 'CAFE\u0301 EJEMPLO'

    expect(compuesto).not.toBe(descompuesto)
    expect(hash({ counterparty: compuesto })).toBe(hash({ counterparty: descompuesto }))
  })

  it('no deja que unas comillas en el texto desplacen los campos', () => {
    const conComillas = hash({ counterparty: 'A","B', description: null })
    const separados = hash({ counterparty: 'A', description: 'B' })

    expect(conComillas).not.toBe(separados)
  })
})
