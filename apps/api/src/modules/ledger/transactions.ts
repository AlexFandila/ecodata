/**
 * Listar movimientos: la lectura más frecuente de la app y la que más se presta
 * a filtrar mal.
 *
 * Los dos invariantes que la gobiernan van en el `WHERE` y no en quien llama,
 * por el mismo criterio con el que están en el `WHERE` de `categorize`: un
 * filtro que hay que acordarse de poner acaba faltando en algún sitio. Los
 * borrados no salen nunca (invariante 5) y las patas de una transferencia
 * interna quedan fuera salvo que se pidan (invariante 3).
 */
import type { ListTransactionsQuery } from '@finanzas/shared'
import { and, count, desc, eq, gte, isNull, lte, or, type SQL, sql } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { type Transaction, transactions } from '../../db/schema'

export type ListTransactionsOutcome = {
  readonly rows: readonly Transaction[]
  /**
   * Movimientos que cumplen el filtro, no los devueltos: es lo que permite
   * paginar y lo que da el contador de la bandeja de pendientes sin traerse la
   * lista entera.
   */
  readonly total: number
}

/**
 * Escapa los comodines de `LIKE` para que una búsqueda de `100%` no case con
 * todo. El carácter de escape se declara con `ESCAPE` en el propio `LIKE`.
 */
function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, '\\$&')}%`
}

function filters(query: ListTransactionsQuery): SQL | undefined {
  const search =
    query.search === undefined
      ? undefined
      : or(
          sql`${transactions.counterparty} LIKE ${likePattern(query.search)} ESCAPE '\\'`,
          sql`${transactions.description} LIKE ${likePattern(query.search)} ESCAPE '\\'`,
        )

  return and(
    // Invariante 5: un movimiento borrado sencillamente no existe para nadie.
    isNull(transactions.deletedAt),
    // Invariante 3: ni ingreso ni gasto, así que distorsionarían el listado.
    query.includeTransfers ? undefined : isNull(transactions.transferId),
    query.accountId === undefined ? undefined : eq(transactions.accountId, query.accountId),
    query.from === undefined ? undefined : gte(transactions.bookedAt, query.from),
    query.to === undefined ? undefined : lte(transactions.bookedAt, query.to),
    query.categoryId === undefined ? undefined : eq(transactions.categoryId, query.categoryId),
    query.uncategorized ? isNull(transactions.categoryId) : undefined,
    search,
  )
}

/**
 * El orden es `booked_at` descendente y, a igualdad, `id` descendente.
 *
 * El segundo criterio no es decorativo, por el mismo motivo que el desempate
 * por `id` de las reglas (ADR-014 decisión 3): la fecha contable sola no es un
 * orden total, y dos movimientos del mismo día podrían salir en cualquier orden
 * entre una página y la siguiente, repitiéndose en una y faltando en otra.
 */
export function listTransactions(db: Db, query: ListTransactionsQuery): ListTransactionsOutcome {
  const where = filters(query)

  const rows = db
    .select()
    .from(transactions)
    .where(where)
    .orderBy(desc(transactions.bookedAt), desc(transactions.id))
    .limit(query.limit)
    .offset(query.offset)
    .all()

  const totalRow = db.select({ value: count() }).from(transactions).where(where).get()

  return { rows, total: totalRow?.value ?? 0 }
}

/** Un movimiento por id, respetando el invariante 5. `undefined` si no está. */
export function findTransaction(db: Db, id: number): Transaction | undefined {
  return db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), isNull(transactions.deletedAt)))
    .get()
}
