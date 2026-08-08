/**
 * Todos los datos de este fichero son inventados.
 */
import { and, eq, isNull } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { accounts, goals, rules, transactions } from '../db/schema'
import { createTestDb } from '../db/testing'
import { runSeed, SEED_ACCOUNTS, SEED_GOALS, SEED_RULES } from './run'
import { SEED_MONTHS, syntheticSeed } from './synthetic'

/** La misma fecha fija que en `synthetic.test.ts`: la semilla no mira el reloj. */
const END_DATE = '2026-08-08'

function seededDb() {
  const db = createTestDb()
  const outcome = runSeed(db, { endDate: END_DATE })
  return { db, outcome }
}

describe('runSeed', () => {
  it('deja las dos cuentas, las reglas y los dos objetivos', () => {
    const { db, outcome } = seededDb()

    expect(outcome.accounts).toEqual({ created: 2, existing: 0 })
    expect(outcome.rules).toEqual({ created: SEED_RULES.length, existing: 0 })
    expect(outcome.goals).toEqual({ created: SEED_GOALS.length, existing: 0 })

    expect(db.select().from(accounts).all()).toHaveLength(2)
    expect(db.select().from(rules).all()).toHaveLength(SEED_RULES.length)
    expect(db.select().from(goals).all()).toHaveLength(SEED_GOALS.length)
  })

  it('importa los dos extractos sin un solo error de fila', () => {
    const { outcome } = seededDb()

    expect(outcome.imports.map((result) => result.source)).toEqual(['norma43', 'revolut_csv'])
    for (const result of outcome.imports) {
      expect(result.stats.errors).toBe(0)
      expect(result.stats.duplicated).toBe(0)
      expect(result.stats.inserted).toBe(result.stats.read)
      expect(result.stats.inserted).toBeGreaterThan(0)
    }
  })

  it('siembra movimientos en las dos cuentas y a lo largo de tres meses', () => {
    const { db, outcome } = seededDb()

    const rows = db
      .select({ accountId: transactions.accountId, bookedAt: transactions.bookedAt })
      .from(transactions)
      .all()

    expect(new Set(rows.map((row) => row.accountId)).size).toBe(2)

    const months = new Set(rows.map((row) => row.bookedAt.slice(0, 7)))
    expect(months).toEqual(new Set(['2026-06', '2026-07', '2026-08']))
    expect(months.size).toBe(SEED_MONTHS)

    expect(outcome.period).toEqual({ from: '2026-06-01', to: END_DATE })
  })

  it('ninguna cuenta lleva IBAN, que es lo que rechaza el hook pre-commit', () => {
    const { db } = seededDb()

    for (const account of db.select().from(accounts).all()) {
      expect(account.iban).toBeNull()
      expect(account.isOwn).toBe(true)
    }
  })

  it('el saldo de apertura de cada cuenta es el del extracto que se le importa', () => {
    const { db } = seededDb()

    const unicaja = db
      .select()
      .from(accounts)
      .where(eq(accounts.name, SEED_ACCOUNTS.unicaja.name))
      .get()
    expect(unicaja?.openingBalanceCents).toBe(SEED_ACCOUNTS.unicaja.openingBalanceCents)
  })

  it('categoriza por reglas pero deja la bandeja de pendientes con contenido', () => {
    const { db, outcome } = seededDb()

    expect(outcome.transactions.categorized).toBeGreaterThan(0)
    expect(outcome.transactions.total).toBeGreaterThan(outcome.transactions.categorized)

    // Lo que puso una regla lo dice `category_source`, no la sola presencia de
    // categoría (invariante 7).
    const byRule = db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.categorySource, 'rule'))
      .all()
    expect(byRule.length).toBe(outcome.transactions.categorized)

    const pending = db
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(isNull(transactions.categoryId), isNull(transactions.deletedAt)))
      .all()
    expect(pending.length).toBeGreaterThan(0)
  })

  it('deja emparejable cada traspaso que ha generado, sin ambigüedades', () => {
    const { outcome } = seededDb()

    // El número exacto depende de qué día del mes se siembre, así que la
    // referencia es el generador: lo que importa es que el matcher los case
    // todos y no deje ninguno empatado.
    const { transferCount } = syntheticSeed({ endDate: END_DATE })
    expect(transferCount).toBeGreaterThan(0)
    expect(outcome.matchable).toEqual({ pairs: transferCount, unresolved: 0 })
  })

  it('empareja los tres traspasos cuando el último mes está completo', () => {
    const db = createTestDb()
    const outcome = runSeed(db, { endDate: '2026-08-31' })

    expect(outcome.matchable).toEqual({ pairs: SEED_MONTHS, unresolved: 0 })
  })

  it('no escribe en transfers: eso es del módulo ledger', () => {
    const { db } = seededDb()

    const emparejados = db
      .select({ id: transactions.id })
      .from(transactions)
      .where(isNull(transactions.transferId))
      .all()
    expect(emparejados.length).toBe(db.select().from(transactions).all().length)
  })

  it('sembrar dos veces deja exactamente la misma base', () => {
    const db = createTestDb()

    const first = runSeed(db, { endDate: END_DATE })
    const second = runSeed(db, { endDate: END_DATE })

    expect(second.accounts).toEqual({ created: 0, existing: 2 })
    expect(second.rules).toEqual({ created: 0, existing: SEED_RULES.length })
    expect(second.goals).toEqual({ created: 0, existing: SEED_GOALS.length })
    expect(second.categories.created).toBe(0)

    // El árbitro es el UNIQUE(source_hash), no una comprobación de la semilla.
    for (const result of second.imports) {
      expect(result.stats.inserted).toBe(0)
      expect(result.stats.duplicated).toBe(result.stats.read)
    }

    expect(second.transactions).toEqual(first.transactions)
    expect(second.matchable).toEqual(first.matchable)

    expect(db.select().from(accounts).all()).toHaveLength(2)
    expect(db.select().from(rules).all()).toHaveLength(SEED_RULES.length)
    expect(db.select().from(goals).all()).toHaveLength(SEED_GOALS.length)
  })

  it('los objetivos guardan sus supuestos tal cual', () => {
    const { db } = seededDb()

    const vivienda = db.select().from(goals).where(eq(goals.name, 'Entrada de la vivienda')).get()
    expect(vivienda?.type).toBe('house')
    expect(vivienda?.targetDate).toBe('2031-06-30')
    expect(vivienda?.params).toMatchObject({ entradaPorcentaje: 20 })

    const fondo = db.select().from(goals).where(eq(goals.name, 'Fondo de emergencia')).get()
    expect(fondo?.targetDate).toBeNull()
  })
})
