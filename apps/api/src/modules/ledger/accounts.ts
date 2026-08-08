/**
 * Cuentas: listarlas y darlas de alta.
 *
 * Devuelven la fila tal cual la da Drizzle, con `createdAt` como `Date`. La
 * traducción a ISO 8601 es del borde HTTP, igual que hace `runImport` con
 * `importedAt`: el módulo habla en tipos de dominio y el contrato de la API es
 * asunto de quien la sirve.
 */
import type { CreateAccountRequest } from '@finanzas/shared'
import { asc } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { type Account, accounts } from '../../db/schema'

/**
 * Ordenadas por nombre y no por `id`: la lista se lee en un desplegable, y el
 * orden de creación no le dice nada a quien la mira.
 */
export function listAccounts(db: Db): Account[] {
  return db.select().from(accounts).orderBy(asc(accounts.name)).all()
}

export function createAccount(db: Db, input: CreateAccountRequest): Account {
  const row = db.insert(accounts).values(input).returning().get()
  if (row === undefined) {
    throw new Error('La inserción de la cuenta no devolvió ninguna fila')
  }
  return row
}
