/**
 * Módulo `ledger`: cuentas, movimientos, saldos y transferencias internas
 * (ARCHITECTURE.md). Empezó con lo mínimo que necesitaba la pantalla de
 * importación —listar cuentas y crearlas—, siguió con el listado de movimientos
 * y ahora escribe también en `transfers`, que es lo que ADR-013 punto 9 dejó
 * aplazado hasta que existiera la pantalla de revisión. Los saldos llegan con
 * su tarea.
 *
 * Quién escribe la **categoría** de un movimiento no está aquí sino en
 * `categorize`: este módulo es dueño de la fila, y aquel del invariante 7. La
 * excepción son las patas de una transferencia interna, cuya categoría la
 * impone el invariante 3 y por tanto la escribe este módulo; `categorize` las
 * deja fuera de su `WHERE` a propósito.
 *
 * Esto es todo lo que el resto de `apps/api` puede ver del módulo: lo demás son
 * internals y `dependency-cruiser` lo hace cumplir en `pnpm lint`.
 */

export type { Account, Transaction, Transfer } from '../../db/schema'
export { createAccount, listAccounts } from './accounts'
export {
  InvalidTransferPairError,
  TransactionAlreadyPairedError,
  TransactionNotFoundError,
  TransferNotFoundError,
} from './errors'
export { findTransaction, type ListTransactionsOutcome, listTransactions } from './transactions'
export {
  type CreateManualTransferInput,
  confirmTransfer,
  createManualTransfer,
  findTransfer,
  type ListTransfersOutcome,
  listTransfers,
  matchSignalsOf,
  type RecordTransfersOptions,
  type RecordTransfersOutcome,
  recordInternalTransfers,
  type TransferRecord,
  undoTransfer,
} from './transfers'
