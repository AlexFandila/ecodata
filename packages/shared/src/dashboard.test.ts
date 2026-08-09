/** Todos los datos de este fichero son inventados. */
import { describe, expect, it } from 'vitest'
import {
  accountBalanceSchema,
  categorySpendingSchema,
  DASHBOARD_DEFAULT_MONTHS,
  dashboardResponseSchema,
  getDashboardQuerySchema,
  monthFlowSchema,
} from './dashboard'
import { isoMonthSchema } from './primitives'

describe('isoMonthSchema', () => {
  it('acepta los doce meses', () => {
    expect(isoMonthSchema.parse('2026-01')).toBe('2026-01')
    expect(isoMonthSchema.parse('2026-12')).toBe('2026-12')
  })

  it('rechaza un mes que no existe', () => {
    expect(isoMonthSchema.safeParse('2026-13').success).toBe(false)
    expect(isoMonthSchema.safeParse('2026-00').success).toBe(false)
  })

  it('exige dos cifras: la forma del contrato, no la abreviada', () => {
    expect(isoMonthSchema.safeParse('2026-1').success).toBe(false)
  })

  it('rechaza un día: un mes no lleva día', () => {
    expect(isoMonthSchema.safeParse('2026-08-01').success).toBe(false)
  })
})

describe('getDashboardQuerySchema', () => {
  it('sin nada, la ventana por defecto es de seis meses y el mes lo decide el servidor', () => {
    expect(getDashboardQuerySchema.parse({})).toEqual({ months: DASHBOARD_DEFAULT_MONTHS })
  })

  it('coacciona el número de meses, que llega como texto en la query string', () => {
    expect(getDashboardQuerySchema.parse({ months: '12' }).months).toBe(12)
  })

  it('rechaza una ventana vacía o desmedida', () => {
    expect(getDashboardQuerySchema.safeParse({ months: '0' }).success).toBe(false)
    expect(getDashboardQuerySchema.safeParse({ months: '25' }).success).toBe(false)
    expect(getDashboardQuerySchema.safeParse({ months: 'seis' }).success).toBe(false)
  })

  it('rechaza un mes mal formado', () => {
    expect(getDashboardQuerySchema.safeParse({ month: 'agosto' }).success).toBe(false)
  })
})

describe('monthFlowSchema', () => {
  const FLOW = {
    month: '2026-08',
    currency: 'EUR',
    incomeCents: 210_000,
    expenseCents: 184_230,
    netCents: 25_770,
  }

  it('acepta un mes con su neto', () => {
    expect(monthFlowSchema.parse(FLOW)).toEqual(FLOW)
  })

  it('el neto sí puede ser negativo: es un mes en rojo', () => {
    expect(monthFlowSchema.parse({ ...FLOW, netCents: -1000 }).netCents).toBe(-1000)
  })

  it('rechaza un gasto negativo: la convención de signo la impone el contrato', () => {
    expect(monthFlowSchema.safeParse({ ...FLOW, expenseCents: -100 }).success).toBe(false)
  })

  it('rechaza un ingreso negativo por el mismo motivo', () => {
    expect(monthFlowSchema.safeParse({ ...FLOW, incomeCents: -100 }).success).toBe(false)
  })
})

describe('accountBalanceSchema', () => {
  const ACCOUNT = {
    accountId: 1,
    name: 'Cuenta corriente',
    provider: 'unicaja',
    currency: 'EUR',
    balances: [{ currency: 'EUR', amountCents: 390_215 }],
  }

  it('acepta una cuenta con su saldo', () => {
    expect(accountBalanceSchema.parse(ACCOUNT)).toEqual(ACCOUNT)
  })

  it('un saldo puede ser negativo: un descubierto es un saldo', () => {
    const parsed = accountBalanceSchema.parse({
      ...ACCOUNT,
      balances: [{ currency: 'EUR', amountCents: -4500 }],
    })

    expect(parsed.balances[0]?.amountCents).toBe(-4500)
  })

  it('rechaza una cuenta sin ningún saldo: la divisa principal siempre está', () => {
    expect(accountBalanceSchema.safeParse({ ...ACCOUNT, balances: [] }).success).toBe(false)
  })
})

describe('categorySpendingSchema', () => {
  const GASTO = {
    categoryId: 10,
    slug: 'housing',
    name: 'Vivienda',
    icon: '🏠',
    currency: 'EUR',
    amountCents: 97_400,
    children: [
      {
        categoryId: 11,
        slug: 'rent_mortgage',
        name: 'Alquiler o hipoteca',
        icon: '🔑',
        amountCents: 85_000,
      },
    ],
  }

  it('acepta una categoría con su desglose', () => {
    expect(categorySpendingSchema.parse(GASTO)).toEqual(GASTO)
  })

  it('la fila sin categorizar va con todo a null y sin hijas', () => {
    const pendiente = {
      categoryId: null,
      slug: null,
      name: null,
      icon: null,
      currency: 'EUR',
      amountCents: 4500,
      children: [],
    }

    expect(categorySpendingSchema.parse(pendiente)).toEqual(pendiente)
  })

  it('rechaza un gasto negativo', () => {
    expect(categorySpendingSchema.safeParse({ ...GASTO, amountCents: -1 }).success).toBe(false)
  })
})

describe('dashboardResponseSchema', () => {
  it('una base recién creada es una respuesta válida, no un error', () => {
    const vacio = {
      month: '2026-08',
      months: 6,
      currencies: [],
      accounts: [],
      totals: [],
      spending: [],
      evolution: [],
    }

    expect(dashboardResponseSchema.parse(vacio)).toEqual(vacio)
  })

  it('devuelve el mes y la ventana ya resueltos', () => {
    const parsed = dashboardResponseSchema.parse({
      month: '2026-08',
      months: 6,
      currencies: ['EUR'],
      accounts: [],
      totals: [{ currency: 'EUR', amountCents: 431_280 }],
      spending: [],
      evolution: [],
    })

    expect(parsed.month).toBe('2026-08')
    expect(parsed.months).toBe(6)
  })
})
