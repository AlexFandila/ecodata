/**
 * Módulo `ledger`: cuentas, movimientos, saldos y transferencias internas
 * (ARCHITECTURE.md). Empezó con lo mínimo que necesitaba la pantalla de
 * importación —listar cuentas y crearlas— y ahora sirve además el listado de
 * movimientos, que es de lo que vive la pantalla de movimientos. Los saldos y
 * la escritura en `transfers` llegan con sus propias tareas.
 *
 * Quién escribe la **categoría** de un movimiento no está aquí sino en
 * `categorize`: este módulo es dueño de la fila, y aquel del invariante 7.
 *
 * Esto es todo lo que el resto de `apps/api` puede ver del módulo: lo demás son
 * internals y `dependency-cruiser` lo hace cumplir en `pnpm lint`.
 */

export type { Account, Transaction } from '../../db/schema'
export { createAccount, listAccounts } from './accounts'
export { findTransaction, type ListTransactionsOutcome, listTransactions } from './transactions'
