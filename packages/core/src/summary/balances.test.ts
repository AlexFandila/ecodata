/** Todos los importes y divisas de este fichero son inventados. */
import { describe, expect, it } from 'vitest'
import { MoneyError } from '../money/index'
import { accountBalances, currenciesByRelevance, totalBalances } from './balances'

describe('accountBalances (invariante 6)', () => {
  it('saldo = apertura + suma de movimientos', () => {
    expect(
      accountBalances({
        currency: 'EUR',
        openingBalanceCents: 30_000,
        sums: [{ currency: 'EUR', amountCents: -12_550 }],
      }),
    ).toEqual([{ currency: 'EUR', amountCents: 17_450 }])
  })

  it('una cuenta sin movimientos vale su apertura, no cero', () => {
    expect(accountBalances({ currency: 'EUR', openingBalanceCents: 30_000, sums: [] })).toEqual([
      { currency: 'EUR', amountCents: 30_000 },
    ])
  })

  it('la divisa principal aparece aunque solo haya movimientos en otra', () => {
    expect(
      accountBalances({
        currency: 'EUR',
        openingBalanceCents: 0,
        sums: [{ currency: 'GBP', amountCents: 4500 }],
      }),
    ).toEqual([
      { currency: 'EUR', amountCents: 0 },
      { currency: 'GBP', amountCents: 4500 },
    ])
  })

  it('no suma una divisa con otra: son dos saldos, no uno', () => {
    expect(
      accountBalances({
        currency: 'EUR',
        openingBalanceCents: 10_000,
        sums: [
          { currency: 'EUR', amountCents: 2000 },
          { currency: 'USD', amountCents: 5000 },
        ],
      }),
    ).toEqual([
      { currency: 'EUR', amountCents: 12_000 },
      { currency: 'USD', amountCents: 5000 },
    ])
  })

  it('la divisa principal va primero aunque alfabéticamente fuera la última', () => {
    const balances = accountBalances({
      currency: 'USD',
      openingBalanceCents: 100,
      sums: [
        { currency: 'CHF', amountCents: 200 },
        { currency: 'EUR', amountCents: 300 },
      ],
    })

    expect(balances.map((total) => total.currency)).toEqual(['USD', 'CHF', 'EUR'])
  })

  it('acumula varias filas de la misma divisa', () => {
    expect(
      accountBalances({
        currency: 'EUR',
        openingBalanceCents: 0,
        sums: [
          { currency: 'EUR', amountCents: 1000 },
          { currency: 'EUR', amountCents: -250 },
        ],
      }),
    ).toEqual([{ currency: 'EUR', amountCents: 750 }])
  })

  it('un importe con decimales es un bug y aborta (ADR-008)', () => {
    expect(() => accountBalances({ currency: 'EUR', openingBalanceCents: 12.5, sums: [] })).toThrow(
      MoneyError,
    )
  })
})

describe('totalBalances', () => {
  it('suma las cuentas divisa a divisa', () => {
    expect(
      totalBalances([
        [{ currency: 'EUR', amountCents: 390_215 }],
        [
          { currency: 'EUR', amountCents: 41_065 },
          { currency: 'USD', amountCents: 21_540 },
        ],
      ]),
    ).toEqual([
      { currency: 'EUR', amountCents: 431_280 },
      { currency: 'USD', amountCents: 21_540 },
    ])
  })

  it('sin cuentas no hay totales', () => {
    expect(totalBalances([])).toEqual([])
  })

  it('respeta el orden de relevancia que se le pase', () => {
    const totals = totalBalances(
      [
        [
          { currency: 'CHF', amountCents: 100 },
          { currency: 'USD', amountCents: 200 },
        ],
      ],
      ['USD'],
    )

    expect(totals.map((total) => total.currency)).toEqual(['USD', 'CHF'])
  })
})

describe('currenciesByRelevance', () => {
  it('manda el número de cuentas, no el importe', () => {
    expect(
      currenciesByRelevance({
        accountCurrencies: ['EUR', 'EUR', 'USD'],
        present: ['USD', 'EUR'],
      }),
    ).toEqual(['EUR', 'USD'])
  })

  it('el empate lo rompe el código alfabético', () => {
    expect(
      currenciesByRelevance({ accountCurrencies: ['USD', 'EUR'], present: ['USD', 'EUR'] }),
    ).toEqual(['EUR', 'USD'])
  })

  it('incluye una divisa que aparece en movimientos pero en la que no hay cuenta', () => {
    expect(currenciesByRelevance({ accountCurrencies: ['EUR'], present: ['EUR', 'GBP'] })).toEqual([
      'EUR',
      'GBP',
    ])
  })

  it('no repite una divisa presente dos veces', () => {
    expect(currenciesByRelevance({ accountCurrencies: ['EUR'], present: ['EUR', 'EUR'] })).toEqual([
      'EUR',
    ])
  })

  it('una base recién creada no tiene divisas', () => {
    expect(currenciesByRelevance({ accountCurrencies: [], present: [] })).toEqual([])
  })
})
