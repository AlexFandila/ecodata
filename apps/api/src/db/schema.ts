/**
 * Esquema de la base de datos. Traduce docs/DATA_MODEL.md a Drizzle.
 *
 * Criterio (coherente con ADR-006): lo que la base puede rechazar, lo rechaza
 * la base. Los enums son `CHECK`, la deduplicación es un `UNIQUE` y la regla de
 * "un movimiento en una sola transferencia" son dos `UNIQUE`. Un bug en el
 * código no puede dejar datos incoherentes en disco.
 *
 * Convenciones:
 * - Importes: entero en la unidad mínima de la divisa + código ISO 4217, nunca
 *   floats (regla 3 de CLAUDE.md). El tipo `Money` de packages/core opera con
 *   ellos; aquí solo se almacenan.
 * - Fechas de calendario (`booked_at`, `value_date`): TEXTO ISO `YYYY-MM-DD`.
 *   Una fecha contable no tiene hora ni zona horaria; guardarla como epoch
 *   invita a desfases de un día. Los instantes de verdad (`deleted_at`,
 *   `imported_at`) sí son epoch en milisegundos.
 */
import {
  ACCOUNT_PROVIDERS,
  ACCOUNT_TYPES,
  CATEGORY_KINDS,
  CATEGORY_SOURCES,
  CURRENCY_CODES,
  type ImportStats,
  RULE_FIELDS,
  RULE_MATCH_TYPES,
} from '@finanzas/shared'
import { sql } from 'drizzle-orm'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

/** `CHECK` de pertenencia a una lista de literales. */
function oneOf(column: string, values: readonly string[]) {
  return sql.raw(`${column} IN (${values.map((value) => `'${value}'`).join(', ')})`)
}

/** Como `oneOf`, pero admitiendo `NULL`. */
function oneOfOrNull(column: string, values: readonly string[]) {
  return sql.raw(`${column} IS NULL OR ${column} IN (${values.map((v) => `'${v}'`).join(', ')})`)
}

/** Fecha de calendario ISO `YYYY-MM-DD`, sin hora ni zona. */
function isoDate(column: string) {
  return sql.raw(`${column} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`)
}

/**
 * La última lista de literales que todavía no tiene ningún contrato de
 * `shared`: la usa solo la base de datos. Se muda a
 * `packages/shared/src/enums.ts` en cuanto llegue su tarea del roadmap —la
 * pantalla de revisión de transferencias— y tenga que verla también la PWA o el
 * MCP. `ACCOUNT_PROVIDERS`, `ACCOUNT_TYPES`, `CATEGORY_KINDS`,
 * `CATEGORY_SOURCES`, `CURRENCY_CODES`, `RULE_FIELDS` y `RULE_MATCH_TYPES` ya
 * hicieron ese viaje y se importan de arriba.
 */
export const TRANSFER_STATUSES = ['auto', 'confirmed', 'manual'] as const

/** Slug de la categoría del sistema a la que van las transferencias internas. */
export const INTERNAL_TRANSFER_SLUG = 'internal_transfer'

// ---------------------------------------------------------------------------
// accounts
// ---------------------------------------------------------------------------

export const accounts = sqliteTable(
  'accounts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    provider: text('provider', { enum: ACCOUNT_PROVIDERS }).notNull(),
    type: text('type', { enum: ACCOUNT_TYPES }).notNull(),
    /** Divisa principal de la cuenta. Revolut puede tener movimientos en otras. */
    currency: text('currency', { enum: CURRENCY_CODES }).notNull(),
    iban: text('iban'),
    /** Solo las cuentas propias participan en el matching de transferencias internas. */
    isOwn: integer('is_own', { mode: 'boolean' }).notNull().default(true),
    /**
     * Saldo justo antes del movimiento más antiguo importado. Invariante 6:
     * saldo = opening_balance_cents + Σ movimientos no borrados.
     */
    openingBalanceCents: integer('opening_balance_cents').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    check('accounts_provider_valido', oneOf('provider', ACCOUNT_PROVIDERS)),
    check('accounts_type_valido', oneOf('type', ACCOUNT_TYPES)),
    check('accounts_currency_valida', oneOf('currency', CURRENCY_CODES)),
    index('accounts_is_own_idx').on(table.isOwn),
  ],
)

// ---------------------------------------------------------------------------
// categories
// ---------------------------------------------------------------------------

export const categories = sqliteTable(
  'categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /**
     * Identificador estable e independiente del nombre visible. El código
     * referencia `internal_transfer` por aquí, no por un id que la semilla
     * podría renumerar.
     */
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    kind: text('kind', { enum: CATEGORY_KINDS }).notNull(),
    // La anotación explícita corta la recursión de tipos de la autorreferencia.
    parentId: integer('parent_id').references((): AnySQLiteColumn => categories.id),
    icon: text('icon'),
  },
  (table) => [
    uniqueIndex('categories_slug_unico').on(table.slug),
    check('categories_kind_valido', oneOf('kind', CATEGORY_KINDS)),
    // Una categoría no puede ser su propia madre.
    check('categories_sin_autopadre', sql`parent_id IS NULL OR parent_id <> id`),
    index('categories_parent_idx').on(table.parentId),
  ],
)

// ---------------------------------------------------------------------------
// imports
// ---------------------------------------------------------------------------

export const imports = sqliteTable(
  'imports',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /**
     * Cuenta a la que fueron los movimientos del fichero.
     *
     * Un fichero no dice a qué cuenta pertenece: la elige el usuario al
     * subirlo, y sin guardarla aquí no se podría listar el histórico de
     * importaciones ni deshacer un import (invariante 5) sabiendo a qué cuenta
     * afectó. Todos los movimientos de un import van a la misma cuenta.
     */
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id),
    /** Adaptador que produjo los movimientos: `norma43`, `revolut_csv`… */
    source: text('source').notNull(),
    fileName: text('file_name'),
    importedAt: integer('imported_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    /** JSON: filas leídas, insertadas, duplicadas, errores. */
    stats: text('stats', { mode: 'json' }).$type<ImportStats>(),
  },
  (table) => [index('imports_cuenta_idx').on(table.accountId)],
)

// ---------------------------------------------------------------------------
// transfers
// ---------------------------------------------------------------------------

/**
 * Transferencia interna entre dos cuentas propias: enlaza el cargo y el abono.
 *
 * Los dos `UNIQUE` son el invariante 2 ("un movimiento pertenece como máximo a
 * una transferencia") aplicado por la base, no por el código.
 */
export const transfers = sqliteTable(
  'transfers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    outTxnId: integer('out_txn_id')
      .notNull()
      .references(() => transactions.id),
    inTxnId: integer('in_txn_id')
      .notNull()
      .references(() => transactions.id),
    status: text('status', { enum: TRANSFER_STATUSES }).notNull(),
    /** Qué señales dispararon el emparejamiento, para poder depurar la heurística. */
    matchedBy: text('matched_by'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex('transfers_out_txn_unico').on(table.outTxnId),
    uniqueIndex('transfers_in_txn_unico').on(table.inTxnId),
    check('transfers_status_valido', oneOf('status', TRANSFER_STATUSES)),
    // Un movimiento no puede ser las dos patas de la misma transferencia.
    check('transfers_patas_distintas', sql`out_txn_id <> in_txn_id`),
  ],
)

// ---------------------------------------------------------------------------
// transactions
// ---------------------------------------------------------------------------

export const transactions = sqliteTable(
  'transactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id),
    /** Fecha contable, ISO `YYYY-MM-DD`. */
    bookedAt: text('booked_at').notNull(),
    /** Fecha valor, ISO `YYYY-MM-DD`. Opcional: no todos los bancos la dan. */
    valueDate: text('value_date'),
    /** Negativo = cargo, positivo = abono. */
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency', { enum: CURRENCY_CODES }).notNull(),
    counterparty: text('counterparty'),
    description: text('description'),
    categoryId: integer('category_id').references(() => categories.id),
    /** Quién puso la categoría. Invariante 7: lo `manual` no se pisa nunca. */
    categorySource: text('category_source', { enum: CATEGORY_SOURCES }),
    /**
     * Transferencia interna a la que pertenece, si la hay.
     *
     * Es un dato derivable de `transfers`, denormalizado aquí porque casi toda
     * consulta de gastos necesita excluir transferencias (invariante 3) y
     * hacerlo con un JOIN saldría caro. A propósito **sin** clave foránea: la
     * declararía en dirección contraria a `transfers.out_txn_id`, formando un
     * ciclo que obligaría a diferir la comprobación. La coherencia la mantiene
     * el módulo `ledger` y la cubren los tests.
     */
    transferId: integer('transfer_id'),
    /** Soft-delete (invariante 5). `null` = movimiento vivo. */
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    importId: integer('import_id')
      .notNull()
      .references(() => imports.id),
    /** Clave de deduplicación sobre campos normalizados estables (invariante 1). */
    sourceHash: text('source_hash').notNull(),
    /** Fila original tal cual. Nunca se modifica ni se borra (invariante 4). */
    raw: text('raw', { mode: 'json' }).notNull(),
  },
  (table) => [
    // Invariante 1: reimportar el mismo fichero no duplica movimientos.
    uniqueIndex('transactions_source_hash_unico').on(table.sourceHash),

    check('transactions_currency_valida', oneOf('currency', CURRENCY_CODES)),
    check('transactions_category_source_valido', oneOfOrNull('category_source', CATEGORY_SOURCES)),
    check('transactions_booked_at_iso', isoDate('booked_at')),
    check('transactions_value_date_iso', sql`value_date IS NULL OR ${isoDate('value_date')}`),
    // Invariante 7: categoría y origen van siempre juntos o ausentes los dos.
    check(
      'transactions_categoria_con_origen',
      sql`(category_id IS NULL) = (category_source IS NULL)`,
    ),

    // Listado de movimientos de una cuenta, que es la consulta más frecuente.
    index('transactions_cuenta_fecha_idx').on(table.accountId, table.bookedAt),
    // Bandeja "sin categorizar" y agregados por categoría.
    index('transactions_categoria_idx').on(table.categoryId),
    index('transactions_import_idx').on(table.importId),
    /**
     * Candidatos del matching de transferencias internas: solo movimientos
     * vivos y todavía sin emparejar. El índice parcial mantiene fuera lo que la
     * heurística nunca mira.
     */
    index('transactions_matching_idx')
      .on(table.currency, table.amountCents, table.bookedAt)
      .where(sql`deleted_at IS NULL AND transfer_id IS NULL`),
  ],
)

// ---------------------------------------------------------------------------
// rules
// ---------------------------------------------------------------------------

export const rules = sqliteTable(
  'rules',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** Menor = se evalúa antes. La primera coincidencia gana. */
    priority: integer('priority').notNull(),
    field: text('field', { enum: RULE_FIELDS }).notNull(),
    matchType: text('match_type', { enum: RULE_MATCH_TYPES }).notNull(),
    pattern: text('pattern').notNull(),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
  },
  (table) => [
    check('rules_field_valido', oneOf('field', RULE_FIELDS)),
    check('rules_match_type_valido', oneOf('match_type', RULE_MATCH_TYPES)),
    check('rules_pattern_no_vacio', sql`length(pattern) > 0`),
    index('rules_prioridad_idx').on(table.priority),
  ],
)

// ---------------------------------------------------------------------------
// Tipos derivados
// ---------------------------------------------------------------------------

export type Account = typeof accounts.$inferSelect
export type NewAccount = typeof accounts.$inferInsert
export type Category = typeof categories.$inferSelect
export type NewCategory = typeof categories.$inferInsert
export type Import = typeof imports.$inferSelect
export type NewImport = typeof imports.$inferInsert
export type Rule = typeof rules.$inferSelect
export type NewRule = typeof rules.$inferInsert
export type Transaction = typeof transactions.$inferSelect
export type NewTransaction = typeof transactions.$inferInsert
export type Transfer = typeof transfers.$inferSelect
export type NewTransfer = typeof transfers.$inferInsert
