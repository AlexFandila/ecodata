/**
 * Transferencias internas: la mitad con IO de lo que `packages/core` decide.
 *
 * El reparto es el mismo de siempre (ADR-013): allí se decide **qué** dos
 * movimientos son las dos patas del mismo traspaso —función pura, sin base de
 * datos— y aquí se decide **a quién se le puede preguntar** y se persiste. Los
 * criterios que el dominio no conoce son el `WHERE` de `candidates()`: el
 * borrado lógico (invariante 5) y el criterio (d) de la heurística, "ninguno
 * pertenece ya a una transferencia". Para eso existe el índice parcial
 * `transactions_matching_idx`.
 *
 * Escribir aquí es escribir tres sitios a la vez, y por eso todo va dentro de
 * `db.transaction`: la fila de `transfers`, el `transfer_id` de las dos patas y
 * su categoría. El invariante 3 dice que una pata va a `internal_transfer`, y
 * el `CHECK transactions_categoria_con_origen` obliga a poner `category_source`
 * en el mismo `UPDATE`; ese origen es `'transfer'` y no `'rule'` porque ninguna
 * regla la puso (ADR-015).
 */
import {
  matchInternalTransfers,
  type TransferCandidate,
  type TransferMatchingAccount,
} from '@finanzas/core'
import {
  type ListTransfersQuery,
  TRANSFER_MATCH_SIGNALS,
  type TransferMatchSignal,
} from '@finanzas/shared'
import { and, count, desc, eq, isNull, or } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import type { Db } from '../../db/client'
import {
  type Account,
  accounts,
  categories,
  type Transaction,
  type Transfer,
  transactions,
  transfers,
} from '../../db/schema'
import { INTERNAL_TRANSFER_SLUG } from '../categorize/index'
import {
  InvalidTransferPairError,
  TransactionAlreadyPairedError,
  TransactionNotFoundError,
  TransferNotFoundError,
} from './errors'

/** Una transferencia con sus dos movimientos, que es como la lee la pantalla. */
export type TransferRecord = {
  readonly transfer: Transfer
  readonly out: Transaction
  readonly in: Transaction
}

export type ListTransfersOutcome = {
  readonly rows: readonly TransferRecord[]
  /** Las que cumplen el filtro, no las devueltas: es lo que permite paginar. */
  readonly total: number
}

export type RecordTransfersOptions = {
  /**
   * Variantes del nombre del titular que reconocer en los extractos, para la
   * señal de +2. Entran por parámetro y no de una variable de entorno leída
   * aquí porque son dato personal y porque `core` es puro: quien llama decide
   * qué variantes reconoce (ADR-013 decisión 5).
   */
  readonly holderNames: readonly string[]
}

export type RecordTransfersOutcome = {
  /** Transferencias nuevas escritas en esta pasada. */
  readonly created: number
  /** Movimientos que empataban entre varias mejores opciones y quedan a mano. */
  readonly unresolved: number
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

const outLeg = alias(transactions, 'out_leg')
const inLeg = alias(transactions, 'in_leg')

/**
 * Las transferencias, de la más reciente a la más antigua.
 *
 * Por `id` descendente y no por la fecha de las patas: lo que ordena esta lista
 * es cuándo apareció el emparejamiento, que es lo que el usuario viene a
 * revisar. Un traspaso de hace tres meses importado hoy es trabajo de hoy.
 */
export function listTransfers(db: Db, query: ListTransfersQuery): ListTransfersOutcome {
  const where = query.status === undefined ? undefined : eq(transfers.status, query.status)

  const rows = db
    .select({ transfer: transfers, out: outLeg, in: inLeg })
    .from(transfers)
    .innerJoin(outLeg, eq(outLeg.id, transfers.outTxnId))
    .innerJoin(inLeg, eq(inLeg.id, transfers.inTxnId))
    .where(where)
    .orderBy(desc(transfers.id))
    .limit(query.limit)
    .offset(query.offset)
    .all()

  const totalRow = db.select({ value: count() }).from(transfers).where(where).get()

  return { rows, total: totalRow?.value ?? 0 }
}

/** Una transferencia con sus patas, o `undefined` si no existe. */
export function findTransfer(db: Db, id: number): TransferRecord | undefined {
  return db
    .select({ transfer: transfers, out: outLeg, in: inLeg })
    .from(transfers)
    .innerJoin(outLeg, eq(outLeg.id, transfers.outTxnId))
    .innerJoin(inLeg, eq(inLeg.id, transfers.inTxnId))
    .where(eq(transfers.id, id))
    .get()
}

/**
 * Las señales de `matched_by`, ya deserializadas.
 *
 * Tolerante a propósito: una columna vacía —las transferencias manuales no
 * tienen señales, porque no las disparó ninguna heurística— o con un literal
 * que ya no existe no puede impedir que la pantalla enseñe la transferencia.
 * Se filtra contra la lista cerrada en vez de confiar en lo que hay en disco.
 */
export function matchSignalsOf(transfer: Transfer): readonly TransferMatchSignal[] {
  if (transfer.matchedBy === null) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(transfer.matchedBy)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  return TRANSFER_MATCH_SIGNALS.filter((signal) => parsed.includes(signal))
}

// ---------------------------------------------------------------------------
// Emparejado automático
// ---------------------------------------------------------------------------

/**
 * Empareja lo que la heurística sepa emparejar y lo escribe.
 *
 * Corre sobre **toda** la población sin emparejar y no solo sobre lo recién
 * importado. No es una simplificación: el punto fijo sobre un subconjunto no es
 * la restricción del punto fijo sobre el conjunto entero, así que un movimiento
 * nuevo puede crear un empate donde antes había una pareja clara (ADR-013,
 * consecuencias). Es idempotente por construcción: lo ya emparejado no vuelve a
 * ser candidato.
 */
export function recordInternalTransfers(
  db: Db,
  { holderNames }: RecordTransfersOptions,
): RecordTransfersOutcome {
  const { matches, unresolved } = matchInternalTransfers({
    candidates: candidates(db),
    accounts: db.select().from(accounts).all().map(matchingAccount),
    holderNames,
  })

  if (matches.length === 0) {
    return { created: 0, unresolved: unresolved.length }
  }

  const categoryId = internalTransferCategoryId(db)

  db.transaction((tx) => {
    for (const match of matches) {
      const row = tx
        .insert(transfers)
        .values({
          outTxnId: match.outTxnId,
          inTxnId: match.inTxnId,
          status: 'auto',
          matchedBy: JSON.stringify(match.matchedBy),
        })
        .returning({ id: transfers.id })
        .get()
      if (row === undefined) {
        throw new Error('La inserción de la transferencia no devolvió ninguna fila')
      }

      pairLegs(tx, row.id, [match.outTxnId, match.inTxnId], categoryId)
    }
  })

  return { created: matches.length, unresolved: unresolved.length }
}

/**
 * Los movimientos que pueden entrar al matching: vivos y todavía sin
 * transferencia. Es el criterio (d) y el invariante 5, que son filtro de
 * consulta y no regla del dominio (ADR-013 decisión 4).
 */
function candidates(db: Db): TransferCandidate[] {
  return db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      bookedAt: transactions.bookedAt,
      amountCents: transactions.amountCents,
      currency: transactions.currency,
      counterparty: transactions.counterparty,
      description: transactions.description,
    })
    .from(transactions)
    .where(and(isNull(transactions.deletedAt), isNull(transactions.transferId)))
    .all()
}

/**
 * Cómo se reconoce una cuenta nombrada en el extracto de otra.
 *
 * Los alias salen del proveedor y del nombre, que es lo que ADR-013 decisión 5
 * deja en manos de quien llama; el dominio no inventa variantes. El proveedor
 * `manual` se queda fuera: no nombra a ningún banco y «MANUAL» es una palabra
 * que puede aparecer en el concepto de cualquier apunte, y la señal vale +2,
 * que es la que más pesa.
 */
function matchingAccount(account: Account): TransferMatchingAccount {
  const aliases = account.provider === 'manual' ? [account.name] : [account.provider, account.name]
  return { id: account.id, isOwn: account.isOwn, aliases }
}

/**
 * El id de la categoría del sistema (invariante 3).
 *
 * Se busca por `slug` y no por id porque el slug es el identificador estable:
 * el usuario puede renombrar la categoría y la semilla podría renumerarla
 * (DATA_MODEL.md, `categories`). Que falte es un error de arranque, no de la
 * petición: `seedCategories()` corre justo detrás de las migraciones.
 */
function internalTransferCategoryId(db: Db): number {
  const row = db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, INTERNAL_TRANSFER_SLUG))
    .get()

  if (row === undefined) {
    throw new Error(
      `No existe la categoría del sistema '${INTERNAL_TRANSFER_SLUG}': ¿se ha ejecutado seedCategories()?`,
    )
  }
  return row.id
}

/** Marca los dos movimientos como patas de `transferId` (invariantes 2 y 3). */
function pairLegs(
  tx: Parameters<Parameters<Db['transaction']>[0]>[0],
  transferId: number,
  legIds: readonly number[],
  categoryId: number,
): void {
  for (const legId of legIds) {
    tx.update(transactions)
      .set({ transferId, categoryId, categorySource: 'transfer' })
      .where(eq(transactions.id, legId))
      .run()
  }
}

// ---------------------------------------------------------------------------
// Revisión: confirmar, deshacer, emparejar a mano
// ---------------------------------------------------------------------------

/**
 * Confirma una transferencia emparejada por la heurística.
 *
 * Confirmar una que ya está confirmada —o una `manual`, que nace confirmada de
 * hecho— no es un error sino un no-op: dos pulsaciones seguidas del mismo botón
 * en un móvil son lo más normal del mundo, y contestar un 409 a la segunda solo
 * serviría para asustar.
 */
export function confirmTransfer(db: Db, id: number): TransferRecord {
  const current = findTransfer(db, id)
  if (current === undefined) {
    throw new TransferNotFoundError(id)
  }

  if (current.transfer.status === 'auto') {
    db.update(transfers).set({ status: 'confirmed' }).where(eq(transfers.id, id)).run()
  }

  const updated = findTransfer(db, id)
  if (updated === undefined) {
    throw new Error(`La transferencia ${id} ha desaparecido al confirmarla`)
  }
  return updated
}

/**
 * Deshace una transferencia: la fila se borra y las dos patas vuelven a ser
 * movimientos normales.
 *
 * Rechazar un emparejamiento es esto y no un estado nuevo: una transferencia
 * deshecha no es una fila en otro estado, es una fila que ya no existe. Si
 * quedara, sus patas seguirían ocupadas y el matcher no podría volver a
 * mirarlas (criterio (d)).
 *
 * Las dos patas se quedan **sin categoría**, no con la que tuvieran antes de
 * emparejarse: aquella se perdió al escribir `internal_transfer` encima. Volver
 * a pasarles las reglas es del módulo `categorize` y lo encadena la ruta, igual
 * que en el pipeline de importación.
 */
export function undoTransfer(db: Db, id: number): readonly Transaction[] {
  const current = findTransfer(db, id)
  if (current === undefined) {
    throw new TransferNotFoundError(id)
  }

  return db.transaction((tx) => {
    // Primero las patas: mientras exista la fila de `transfers`, sus dos
    // `UNIQUE` garantizan que nadie más puede reclamarlas.
    const freed = [current.out.id, current.in.id].map((legId) => {
      const row = tx
        .update(transactions)
        .set({ transferId: null, categoryId: null, categorySource: null })
        .where(eq(transactions.id, legId))
        .returning()
        .get()
      if (row === undefined) {
        throw new Error(`El movimiento ${legId} ha desaparecido al deshacer la transferencia`)
      }
      return row
    })

    tx.delete(transfers).where(eq(transfers.id, id)).run()
    return freed
  })
}

export type CreateManualTransferInput = {
  readonly outTxnId: number
  readonly inTxnId: number
}

/**
 * Empareja dos movimientos a mano.
 *
 * Comprueba lo que sigue siendo obligatorio —cuentas distintas, las dos
 * propias, un cargo y un abono, ninguno pillado ya— y **no** comprueba lo que
 * es de la heurística: ni que los importes sean opuestos, ni que la divisa
 * coincida, ni que las fechas estén cerca. Exigirlo aquí dejaría fuera
 * precisamente los casos para los que existe esta función: la recarga de
 * Revolut con tarjeta llega a Unicaja como un pago de tarjeta que rara vez
 * cuadra al céntimo (DATA_MODEL.md, "casos borde conocidos"), y una pata en
 * libras contra otra en euros necesitaría `fx_rates` para casar sola.
 */
export function createManualTransfer(db: Db, input: CreateManualTransferInput): TransferRecord {
  const out = legFor(db, input.outTxnId)
  const into = legFor(db, input.inTxnId)

  if (out.transaction.id === into.transaction.id) {
    throw new InvalidTransferPairError('Un movimiento no puede ser sus dos propias patas')
  }
  if (out.transaction.accountId === into.transaction.accountId) {
    throw new InvalidTransferPairError(
      'Las dos patas de una transferencia interna tienen que estar en cuentas distintas',
    )
  }
  if (!out.account.isOwn || !into.account.isOwn) {
    throw new InvalidTransferPairError(
      'Una transferencia interna solo empareja movimientos de cuentas propias',
    )
  }
  if (out.transaction.amountCents >= 0) {
    throw new InvalidTransferPairError(
      `El movimiento ${out.transaction.id} no es un cargo: la pata de salida tiene que ser negativa`,
    )
  }
  if (into.transaction.amountCents <= 0) {
    throw new InvalidTransferPairError(
      `El movimiento ${into.transaction.id} no es un abono: la pata de entrada tiene que ser positiva`,
    )
  }

  const categoryId = internalTransferCategoryId(db)

  const id = db.transaction((tx) => {
    const row = tx
      .insert(transfers)
      .values({
        outTxnId: out.transaction.id,
        inTxnId: into.transaction.id,
        status: 'manual',
        // Sin señales: no la disparó ninguna heurística, la puso una persona.
        matchedBy: null,
      })
      .returning({ id: transfers.id })
      .get()
    if (row === undefined) {
      throw new Error('La inserción de la transferencia no devolvió ninguna fila')
    }

    pairLegs(tx, row.id, [out.transaction.id, into.transaction.id], categoryId)
    return row.id
  })

  const created = findTransfer(db, id)
  if (created === undefined) {
    throw new Error(`La transferencia ${id} no se ha podido releer tras crearla`)
  }
  return created
}

/**
 * El movimiento y su cuenta, comprobando de paso que se puede emparejar.
 *
 * El invariante 2 lo aplican igual los dos `UNIQUE` de la tabla, pero como un
 * error opaco: mirarlo aquí es lo que permite decir cuál de los dos movimientos
 * está pillado y por qué transferencia.
 */
function legFor(db: Db, transactionId: number): { transaction: Transaction; account: Account } {
  const row = db
    .select({ transaction: transactions, account: accounts })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(and(eq(transactions.id, transactionId), isNull(transactions.deletedAt)))
    .get()

  if (row === undefined) {
    throw new TransactionNotFoundError(transactionId)
  }

  if (row.transaction.transferId !== null) {
    throw new TransactionAlreadyPairedError(transactionId, row.transaction.transferId)
  }

  // El `transfer_id` está denormalizado y sin clave foránea (DATA_MODEL.md,
  // nota 3), así que la fuente de verdad es `transfers`: si una fila lo
  // reclamara sin que la pata lo supiera, emparejarlo aquí reventaría contra el
  // `UNIQUE` con un error que nadie sabría leer.
  const claimed = db
    .select({ id: transfers.id })
    .from(transfers)
    .where(or(eq(transfers.outTxnId, transactionId), eq(transfers.inTxnId, transactionId)))
    .get()
  if (claimed !== undefined) {
    throw new TransactionAlreadyPairedError(transactionId, claimed.id)
  }

  return row
}
