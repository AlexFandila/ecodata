/**
 * Módulo `ledger`: cuentas, movimientos, saldos y transferencias internas
 * (ARCHITECTURE.md). Entra aquí con lo mínimo que necesita la pantalla de
 * importación —listar cuentas para elegir una, y crearlas para que una
 * instalación limpia no sea un callejón sin salida—; los movimientos, los
 * saldos y la escritura en `transfers` llegan con sus propias tareas.
 *
 * Esto es todo lo que el resto de `apps/api` puede ver del módulo: lo demás son
 * internals y `dependency-cruiser` lo hace cumplir en `pnpm lint`.
 */

export type { Account } from '../../db/schema'
export { createAccount, listAccounts } from './accounts'
