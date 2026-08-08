/**
 * El pipeline de importación: normalizar → hash → deduplicar → persistir → dejar
 * constancia en `imports`.
 *
 * Es único e independiente del adaptador (ARCHITECTURE.md). Lo único que sabe
 * de una fuente es el puerto `TransactionSource`, así que añadir un banco no lo
 * toca (regla 5 de CLAUDE.md).
 *
 * Es síncrono, como el puerto: los adaptadores transforman datos que ya tienen
 * en memoria y better-sqlite3 no es asíncrono. Quien lee el fichero es el borde
 * HTTP, que es su trabajo.
 *
 * Las dos etapas siguientes del pipeline —categorizar con las reglas y emparejar
 * transferencias internas— son tareas posteriores del roadmap: aquí los
 * movimientos entran sin categoría y sin transferencia, que es justo el estado
 * que esas etapas esperan encontrar.
 */
import { sourceHash } from '@finanzas/core'
import type {
  ImportRowError,
  ImportSource,
  ImportStats,
  NormalizedTransaction,
} from '@finanzas/shared'
import { eq } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { accounts, imports, transactions } from '../../db/schema'
import { AccountNotFoundError } from './errors'
import { sourceFor } from './sources'

export type RunImportInput = {
  /** La cuenta la elige el usuario: un fichero no dice a cuál pertenece. */
  readonly accountId: number
  readonly source: ImportSource
  /** Nombre original del fichero, solo para reconocer el import en la lista. */
  readonly fileName: string | null
  readonly bytes: Uint8Array
}

export type ImportOutcome = {
  readonly importId: number
  readonly accountId: number
  readonly source: ImportSource
  readonly fileName: string | null
  /**
   * Instante real. El borde HTTP lo traduce a ISO 8601, que es la convención de
   * los contratos (ADR-009): la base calcula con epoch y la interfaz lee texto.
   */
  readonly importedAt: Date
  readonly stats: ImportStats
  readonly rowErrors: readonly ImportRowError[]
}

/**
 * Numera los movimientos idénticos de un lote para que el hash los distinga.
 *
 * Dos cafés de 2,50 € en el mismo comercio el mismo día coinciden en los seis
 * campos que identifican un movimiento, así que sin numerarlos compartirían
 * hash y el segundo se perdería (ADR-012). Se reparten 0, 1, 2… por orden de
 * aparición.
 *
 * Esto no rompe la idempotencia justamente porque los números se reparten
 * dentro del fichero y no contra la base: reimportar el mismo extracto vuelve a
 * asignar los mismos, y por tanto vuelve a producir los mismos hashes. Y como a
 * un grupo de `m` idénticos siempre le tocan `0..m-1`, el conjunto de hashes no
 * depende de en qué orden vinieran las filas.
 *
 * La clave del grupo es el propio hash con ocurrencia 0, y no una cadena
 * fabricada aquí: así no hay dos formas canónicas que puedan separarse con el
 * tiempo.
 */
function identify(
  accountId: number,
  batch: readonly NormalizedTransaction[],
): { transaction: NormalizedTransaction; sourceHash: string }[] {
  const seen = new Map<string, number>()

  return batch.map((transaction) => {
    const identity = {
      accountId,
      bookedAt: transaction.bookedAt,
      amountCents: transaction.amountCents,
      currency: transaction.currency,
      counterparty: transaction.counterparty,
      description: transaction.description,
    }

    const group = sourceHash({ ...identity, occurrence: 0 })
    const occurrence = seen.get(group) ?? 0
    seen.set(group, occurrence + 1)

    return { transaction, sourceHash: sourceHash({ ...identity, occurrence }) }
  })
}

/**
 * Importa un fichero a una cuenta.
 *
 * Lanza si el fichero no es lo que dice ser (`Norma43FormatError`,
 * `RevolutCsvFormatError`) o si la cuenta no existe (`AccountNotFoundError`);
 * en los dos casos no queda nada escrito. Una fila suelta ilegible no lanza: va
 * a `rowErrors` y el resto del extracto se importa.
 */
export function runImport(db: Db, input: RunImportInput): ImportOutcome {
  // Leer va antes y fuera de la transacción a propósito: un fichero mal formado
  // —o cuyos totales no cuadran con lo leído— no es una importación fallida,
  // es una importación que no ha llegado a ocurrir, y no debe dejar rastro en
  // `imports`.
  const { transactions: batch, rowErrors } = sourceFor(input.source).read(input.bytes)
  const identified = identify(input.accountId, batch)

  return db.transaction((tx) => {
    const account = tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.id, input.accountId))
      .get()
    if (account === undefined) throw new AccountNotFoundError(input.accountId)

    // La fila de `imports` va primero porque `transactions.import_id` es NOT
    // NULL con clave foránea. `stats` se rellena al final, cuando se sabe.
    const created = tx
      .insert(imports)
      .values({ accountId: input.accountId, source: input.source, fileName: input.fileName })
      .returning({ id: imports.id, importedAt: imports.importedAt })
      .get()
    if (created === undefined) throw new Error('No se pudo registrar la importación')

    let inserted = 0
    let duplicated = 0

    for (const { transaction, sourceHash: hash } of identified) {
      const row = tx
        .insert(transactions)
        .values({
          accountId: input.accountId,
          importId: created.id,
          bookedAt: transaction.bookedAt,
          valueDate: transaction.valueDate,
          amountCents: transaction.amountCents,
          currency: transaction.currency,
          counterparty: transaction.counterparty,
          description: transaction.description,
          sourceHash: hash,
          raw: transaction.raw,
        })
        // Quién decide si algo es duplicado es el UNIQUE de `source_hash`, no
        // una consulta previa: la regla vive en un solo sitio y no hay ventana
        // entre comprobar e insertar (ADR-006). Que no vuelva fila **es** la
        // señal de duplicado, y cubre también dos filas iguales del mismo lote.
        .onConflictDoNothing({ target: transactions.sourceHash })
        .returning({ id: transactions.id })
        .get()

      if (row === undefined) duplicated += 1
      else inserted += 1
    }

    const stats: ImportStats = {
      read: batch.length + rowErrors.length,
      inserted,
      duplicated,
      errors: rowErrors.length,
    }
    tx.update(imports).set({ stats }).where(eq(imports.id, created.id)).run()

    return {
      importId: created.id,
      accountId: input.accountId,
      source: input.source,
      fileName: input.fileName,
      importedAt: created.importedAt,
      stats,
      rowErrors,
    }
  })
}
