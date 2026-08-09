/**
 * Traducción de fila de la base a contrato de `shared`.
 *
 * Vive aquí y no dentro de una ruta porque la misma fila sale por dos sitios:
 * el listado de movimientos y las dos patas de una transferencia interna. Dos
 * copias de este mapeo serían dos sitios donde olvidarse de que `raw`,
 * `sourceHash` y `deletedAt` no salen nunca (ADR-009 punto 6).
 *
 * Se construye campo a campo y no con `...row` a propósito: con el operador de
 * propagación, añadir mañana una columna interna al esquema la publicaría sola.
 */
import { type Transaction, transactionSchema } from '@finanzas/shared'
import type { Transaction as TransactionRow } from '../modules/ledger/index'

export function transactionDto(row: TransactionRow): Transaction {
  return transactionSchema.parse({
    id: row.id,
    accountId: row.accountId,
    bookedAt: row.bookedAt,
    valueDate: row.valueDate,
    amountCents: row.amountCents,
    currency: row.currency,
    counterparty: row.counterparty,
    description: row.description,
    categoryId: row.categoryId,
    categorySource: row.categorySource,
    transferId: row.transferId,
    importId: row.importId,
  })
}

/**
 * El `:id` de una URL, ya validado. `Number('')` es `0` y `Number('1.5')` no es
 * entero: los dos tienen que caer aquí y no llegar a una consulta.
 */
export function entityId(raw: string): number | null {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}
