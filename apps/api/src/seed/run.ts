/**
 * La semilla de desarrollo: deja una base con la que se pueda trabajar.
 *
 * Todos los datos son inventados (CLAUDE.md, «Datos sensibles»). Ninguna cuenta
 * lleva IBAN: uno español escrito en un fichero versionado lo rechazaría el
 * propio hook pre-commit, y para desarrollar no hace falta.
 *
 * El orden de los pasos no es casual:
 *
 * 1. Categorías, porque las reglas necesitan sus ids.
 * 2. Cuentas, porque los movimientos necesitan a cuál van.
 * 3. Reglas, **antes** de importar, para que la categorización de después tenga
 *    con qué trabajar.
 * 4. Los dos extractos por el `runImport()` de producción.
 * 5. Categorizar, igual que hace la ruta `POST /imports`.
 * 6. Emparejar transferencias internas, también igual que aquella ruta: la
 *    semilla imita el pipeline de producción entero, así que la base de
 *    desarrollo tiene transferencias `auto` que revisar desde el primer
 *    `pnpm seed`. Los traspasos sintéticos son todos de importe distinto,
 *    porque los empates el matcher los deja sin resolver a propósito.
 * 7. Objetivos, que no dependen de nada.
 *
 * Es idempotente de arriba abajo: cuentas por nombre, reglas por su terna
 * (campo, tipo, patrón), objetivos por nombre y movimientos por el
 * `UNIQUE(source_hash)` de siempre. El emparejado también: lo ya emparejado no
 * vuelve a ser candidato, así que la segunda pasada crea 0. Sembrar dos veces
 * deja la misma base.
 */
import { type Currency, createRuleRequestSchema, type RuleField } from '@finanzas/shared'
import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from '../db/client'
import {
  accounts,
  categories,
  type GoalParams,
  goals,
  type NewGoal,
  rules,
  transactions,
} from '../db/schema'
import { categorizeTransactions, seedCategories } from '../modules/categorize/index'
import {
  type ImportOutcome,
  norma43Bytes,
  revolutCsvBytes,
  runImport,
} from '../modules/ingest/index'
import { recordInternalTransfers } from '../modules/ledger/index'
import {
  REVOLUT_OPENING_BALANCE_CENTS,
  syntheticSeed,
  UNICAJA_OPENING_BALANCE_CENTS,
} from './synthetic'

// ---------------------------------------------------------------------------
// Qué se siembra
// ---------------------------------------------------------------------------

type SeedAccount = {
  readonly name: string
  readonly provider: 'unicaja' | 'revolut'
  readonly type: 'checking' | 'card'
  readonly currency: Currency
  readonly openingBalanceCents: number
  /**
   * Cómo llama el usuario a esta cuenta. Entra en el matching de transferencias
   * porque `packages/core` es puro y no puede consultar la tabla (ADR-013).
   */
  readonly aliases: readonly string[]
}

export const SEED_ACCOUNTS = {
  unicaja: {
    name: 'Unicaja nómina',
    provider: 'unicaja',
    type: 'checking',
    currency: 'EUR',
    openingBalanceCents: UNICAJA_OPENING_BALANCE_CENTS,
    aliases: ['Unicaja'],
  },
  revolut: {
    name: 'Revolut',
    provider: 'revolut',
    type: 'card',
    currency: 'EUR',
    openingBalanceCents: REVOLUT_OPENING_BALANCE_CENTS,
    aliases: ['Revolut'],
  },
} as const satisfies Record<string, SeedAccount>

/** El titular sintético, para la señal de nombre del matching. */
export const SEED_HOLDER_NAMES = ['Titular Ejemplo'] as const

type SeedRule = {
  readonly priority: number
  readonly field: RuleField
  readonly pattern: string
  /** Categoría destino por slug: los ids los renumera la semilla, los slugs no. */
  readonly slug: string
}

/**
 * Las reglas de ejemplo, todas `contains`.
 *
 * Van contra `description` las de Unicaja y contra `counterparty` las de
 * Revolut, porque los dos formatos reparten la información al revés: la Norma
 * 43 no distingue contraparte de concepto (ADR-010) y Revolut sí (ADR-011).
 *
 * Ninguna casa con los traspasos internos ni con el bizum, el adeudo y el pago
 * QR: eso es deliberado. Una base de desarrollo en la que todo está
 * categorizado no sirve para construir la bandeja de «sin categorizar».
 *
 * Los patrones son **sintéticos**: están escritos contra el extracto que genera
 * `synthetic.ts`, no contra lo que emite un banco. Sobre datos reales unos
 * cuantos no casarán nunca (`AGUA EJEMPLO`, `Tienda Online`) y otros sí —
 * `ALQUILER`, `GASOLINERA`, `FARMACIA` o `COMISION MANTENIMIENTO` son palabras
 * que aparecen tal cual en los extractos españoles, y `contains` normaliza
 * acentos y mayúsculas (ADR-014)—. Que casen no rompe nada: la categoría que
 * ponen es la correcta y el invariante 7 permite recategorizarlas. Pero hay que
 * saberlo, porque si no aparecen movimientos categorizados por reglas que uno
 * no recuerda haber escrito.
 *
 * Lo que **no** se hace nunca es escribir aquí una regla sacada de un extracto
 * propio: un patrón copiado de un movimiento real es un dato real, y esto va a
 * git (CLAUDE.md, «Datos sensibles»). Las reglas de verdad se crean desde la
 * app, que escribe en la base git-ignored. `runEmptySeed` siembra estas
 * igualmente porque son el esqueleto del motor y lo que no case se queda en la
 * bandeja, que es donde tiene que estar.
 */
export const SEED_RULES: readonly SeedRule[] = [
  { priority: 10, field: 'description', pattern: 'NOMINA', slug: 'salary' },
  { priority: 20, field: 'description', pattern: 'ALQUILER', slug: 'rent_mortgage' },
  { priority: 30, field: 'description', pattern: 'SUPERMERCADO', slug: 'groceries' },
  { priority: 40, field: 'description', pattern: 'GASOLINERA', slug: 'fuel' },
  { priority: 50, field: 'description', pattern: 'ELECTRICA', slug: 'utilities' },
  { priority: 55, field: 'description', pattern: 'AGUA EJEMPLO', slug: 'utilities' },
  { priority: 60, field: 'description', pattern: 'FIBRA Y MOVIL', slug: 'utilities' },
  { priority: 70, field: 'description', pattern: 'SEGURO HOGAR', slug: 'home_insurance' },
  { priority: 80, field: 'description', pattern: 'FARMACIA', slug: 'pharmacy' },
  { priority: 90, field: 'description', pattern: 'COMISION MANTENIMIENTO', slug: 'bank_fees' },

  { priority: 100, field: 'counterparty', pattern: 'Streaming', slug: 'subscriptions' },
  { priority: 110, field: 'counterparty', pattern: 'Musica', slug: 'subscriptions' },
  { priority: 120, field: 'counterparty', pattern: 'Restaurante', slug: 'restaurants' },
  { priority: 130, field: 'counterparty', pattern: 'Ropa', slug: 'clothing' },
  { priority: 140, field: 'counterparty', pattern: 'Tienda Online', slug: 'electronics' },
  { priority: 150, field: 'counterparty', pattern: 'Libreria', slug: 'culture_sport' },
  { priority: 160, field: 'counterparty', pattern: 'Comision de cambio', slug: 'bank_fees' },
]

type SeedGoal = {
  readonly name: string
  readonly type: NewGoal['type']
  readonly targetAmountCents: number
  readonly targetDate: string | null
  readonly params: GoalParams
}

/**
 * Dos objetivos de ejemplo (docs/DATA_MODEL.md). Los `params` son los supuestos
 * que consumirá el motor financiero de la Fase 2; hasta entonces son solo datos
 * con los que la pantalla pueda dibujarse.
 */
export const SEED_GOALS: readonly SeedGoal[] = [
  {
    name: 'Entrada de la vivienda',
    type: 'house',
    targetAmountCents: 6_000_000,
    targetDate: '2031-06-30',
    params: {
      precioObjetivoCents: 20_000_000,
      entradaPorcentaje: 20,
      gastosEImpuestosPorcentaje: 10,
      retornoEsperadoPorcentaje: 3,
      inflacionAsumidaPorcentaje: 2,
      aportacionInicialCents: 500_000,
    },
  },
  {
    name: 'Fondo de emergencia',
    type: 'emergency_fund',
    targetAmountCents: 1_200_000,
    targetDate: null,
    params: {
      mesesDeGastos: 6,
      gastoMensualEstimadoCents: 200_000,
      retornoEsperadoPorcentaje: 1,
    },
  },
]

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------

/** Creado ahora vs. lo que ya estaba y se ha dejado intacto. */
export type SeedCount = { readonly created: number; readonly existing: number }

export type SeedOutcome = {
  readonly period: { readonly from: string; readonly to: string }
  readonly categories: SeedCount
  readonly accounts: SeedCount
  readonly rules: SeedCount
  readonly goals: SeedCount
  readonly imports: readonly ImportOutcome[]
  /** Movimientos vivos, con y sin categoría. */
  readonly transactions: { readonly total: number; readonly categorized: number }
  /**
   * Transferencias internas escritas en esta pasada, y cuántos movimientos han
   * quedado sin emparejar por empate. En la segunda pasada `created` es 0: lo
   * ya emparejado no vuelve a ser candidato.
   */
  readonly transfers: { readonly created: number; readonly unresolved: number }
}

export type SeedOptions = {
  /** Último día sembrado. El CLI pasa hoy; los tests, una fecha fija. */
  readonly endDate: string
}

/**
 * Lo que deja una base vacía. Son los dos recuentos de `SeedOutcome` que siguen
 * teniendo sentido cuando no se siembra contenido: de los demás no es que valgan
 * cero, es que no se ha ejecutado la etapa que los produce.
 */
export type EmptySeedOutcome = Pick<SeedOutcome, 'categories' | 'rules'>

/**
 * Deja la base lista para datos **reales**: el vocabulario, y nada de contenido.
 *
 * Es lo que hace falta cuando se deja de desarrollar contra datos inventados y
 * se empiezan a importar los extractos de verdad: `runSeed` no vale, porque
 * mezclaría sus dos cuentas y sus tres meses sintéticos con lo que traiga el
 * banco, y distinguir después unos de otros es justo el lío que se quiere
 * evitar.
 *
 * Categorías y reglas sí, porque no son «datos» sino vocabulario: las
 * categorías las necesita el propio sistema —el invariante 3 marca las dos
 * patas de un traspaso con el slug `internal_transfer`— y las reglas son el
 * punto de partida del motor de categorización. Cuentas, movimientos,
 * importaciones, traspasos y objetivos no: los pone el usuario con sus propios
 * ficheros.
 *
 * Idempotente por lo mismo que `runSeed`: las categorías por slug y las reglas
 * por su terna (campo, tipo, patrón).
 */
export function runEmptySeed(db: Db): EmptySeedOutcome {
  const categoriesOutcome = seedCategories(db)
  const rulesOutcome = ensureRules(db)

  return {
    categories: { created: categoriesOutcome.inserted, existing: categoriesOutcome.existing },
    rules: rulesOutcome,
  }
}

// ---------------------------------------------------------------------------
// Pasos
// ---------------------------------------------------------------------------

function ensureAccount(db: Db, account: SeedAccount): { id: number; created: boolean } {
  const existing = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.name, account.name))
    .get()
  if (existing !== undefined) return { id: existing.id, created: false }

  const row = db
    .insert(accounts)
    .values({
      name: account.name,
      provider: account.provider,
      type: account.type,
      currency: account.currency,
      // Un IBAN español en un fichero versionado lo bloquea el hook pre-commit
      // (ADR-006), y para desarrollar no aporta nada.
      iban: null,
      isOwn: true,
      openingBalanceCents: account.openingBalanceCents,
    })
    .returning({ id: accounts.id })
    .get()
  if (row === undefined) throw new Error(`No se pudo crear la cuenta «${account.name}»`)
  return { id: row.id, created: true }
}

/** Los ids de las categorías sembradas, por slug. */
function categoryIdsBySlug(db: Db): Map<string, number> {
  const rows = db.select({ id: categories.id, slug: categories.slug }).from(categories).all()
  return new Map(rows.map((row) => [row.slug, row.id]))
}

function ensureRules(db: Db): SeedCount {
  const bySlug = categoryIdsBySlug(db)
  let created = 0
  let existing = 0

  for (const rule of SEED_RULES) {
    const categoryId = bySlug.get(rule.slug)
    if (categoryId === undefined) {
      throw new Error(`La regla de la semilla apunta a una categoría inexistente: «${rule.slug}»`)
    }

    // Doble capa, igual que en `categorize`: que una regla de la semilla no
    // compile debe saltar aquí y no al importar el primer fichero.
    const values = createRuleRequestSchema.parse({
      priority: rule.priority,
      field: rule.field,
      matchType: 'contains',
      pattern: rule.pattern,
      categoryId,
      active: true,
    })

    const already = db
      .select({ id: rules.id })
      .from(rules)
      .where(
        and(
          eq(rules.field, values.field),
          eq(rules.matchType, values.matchType),
          eq(rules.pattern, values.pattern),
        ),
      )
      .get()
    if (already !== undefined) {
      existing += 1
      continue
    }

    db.insert(rules).values(values).run()
    created += 1
  }

  return { created, existing }
}

function ensureGoals(db: Db): SeedCount {
  let created = 0
  let existing = 0

  for (const goal of SEED_GOALS) {
    const already = db.select({ id: goals.id }).from(goals).where(eq(goals.name, goal.name)).get()
    if (already !== undefined) {
      existing += 1
      continue
    }

    db.insert(goals)
      .values({
        name: goal.name,
        type: goal.type,
        targetAmountCents: goal.targetAmountCents,
        targetDate: goal.targetDate,
        params: goal.params,
      })
      .run()
    created += 1
  }

  return { created, existing }
}

// ---------------------------------------------------------------------------
// La semilla
// ---------------------------------------------------------------------------

export function runSeed(db: Db, { endDate }: SeedOptions): SeedOutcome {
  const categoriesOutcome = seedCategories(db)

  const unicaja = ensureAccount(db, SEED_ACCOUNTS.unicaja)
  const revolut = ensureAccount(db, SEED_ACCOUNTS.revolut)
  const created = Number(unicaja.created) + Number(revolut.created)

  const rulesOutcome = ensureRules(db)
  const data = syntheticSeed({ endDate })

  const imports = [
    runImport(db, {
      accountId: unicaja.id,
      source: 'norma43',
      fileName: 'unicaja-ejemplo.n43',
      bytes: norma43Bytes(data.unicaja),
    }),
    runImport(db, {
      accountId: revolut.id,
      source: 'revolut_csv',
      fileName: 'revolut-ejemplo.csv',
      bytes: revolutCsvBytes(data.revolut),
    }),
  ]

  // Sin `importId`: en la segunda pasada no hay nada nuevo que categorizar, pero
  // sí puede haber quedado algo de la primera si las reglas cambiaron.
  categorizeTransactions(db)

  const goalsOutcome = ensureGoals(db)

  // Última etapa, igual que en `POST /imports`: emparejar las transferencias
  // internas. Los alias los construye `ledger` desde el proveedor y el nombre
  // de cada cuenta, que son los mismos que declara `SEED_ACCOUNTS`.
  const matching = recordInternalTransfers(db, { holderNames: SEED_HOLDER_NAMES })

  // El recuento va detrás de todas las etapas y no en medio: emparejar
  // categoriza las patas (invariante 3), así que contar antes daría un número
  // distinto en la primera pasada que en la segunda para la misma base.
  const live = db
    .select({ id: transactions.id, categoryId: transactions.categoryId })
    .from(transactions)
    .where(isNull(transactions.deletedAt))
    .all()

  return {
    period: data.period,
    categories: { created: categoriesOutcome.inserted, existing: categoriesOutcome.existing },
    accounts: { created, existing: 2 - created },
    rules: rulesOutcome,
    goals: goalsOutcome,
    imports,
    transactions: {
      total: live.length,
      categorized: live.filter((row) => row.categoryId !== null).length,
    },
    transfers: matching,
  }
}
