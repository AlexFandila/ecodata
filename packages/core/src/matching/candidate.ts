/**
 * La forma de lo que entra y sale del matching de transferencias internas
 * (docs/DATA_MODEL.md, "Heurística de matching"; ADR-013).
 *
 * Los tipos son propios de `core` y no los contratos de `packages/shared`: el
 * dominio no importa de shared (ADR-009 punto 2 ya eligió duplicar antes que
 * crear esa arista), y para decidir si dos apuntes son las dos patas de la
 * misma transferencia no hace falta ni `raw`, ni `sourceHash`, ni la categoría.
 */

import type { Currency } from '../money/currency'

/**
 * Un movimiento tal como lo ve el matching.
 *
 * Precondición de quien construye la lista: aquí solo llegan movimientos vivos
 * y todavía sin transferencia. Es decir, el criterio (d) de la heurística
 * —"ninguno pertenece ya a una transferencia"— y el invariante 5 —los borrados
 * no cuentan— son un filtro de consulta, no una regla del dominio. El índice
 * parcial `transactions_matching_idx` existe exactamente para ese filtro.
 */
export type TransferCandidate = {
  readonly id: number
  readonly accountId: number
  /** Fecha contable ISO `YYYY-MM-DD`: un día, sin hora ni zona. */
  readonly bookedAt: string
  /** Negativo = cargo, positivo = abono (la misma convención que `Money`). */
  readonly amountCents: number
  readonly currency: Currency
  readonly counterparty: string | null
  readonly description: string | null
}

/**
 * Lo que el matching necesita saber de una cuenta: si participa y con qué
 * textos se la reconoce en el extracto de otra.
 *
 * Va aparte y no denormalizado dentro de cada candidato porque son dos o tres
 * filas: repetirlas en miles de movimientos solo invita a que se desincronicen.
 */
export type TransferMatchingAccount = {
  readonly id: number
  /** Criterio (a): solo las cuentas propias participan. */
  readonly isOwn: boolean
  /**
   * Textos con los que esta cuenta aparece nombrada en el extracto de otra
   * (`'REVOLUT'`, `'REVOLUT BANK UAB'`, `'UNICAJA'`…). Los construye quien
   * llama, a partir de `accounts.provider` y `accounts.name`: el vocabulario de
   * proveedores vive en `shared`, no aquí.
   */
  readonly aliases: readonly string[]
}

export type TransferMatchingInput = {
  /** Movimientos vivos y sin transferencia; ver `TransferCandidate`. */
  readonly candidates: readonly TransferCandidate[]
  /** Debe traer todas las cuentas a las que apuntan los candidatos. */
  readonly accounts: readonly TransferMatchingAccount[]
  /**
   * Nombres del titular, para la señal de +2. Se pasan explícitamente porque
   * `core` es puro: no hay configuración global ni variables de entorno aquí.
   * Quien llama lista las variantes que quiera reconocer (`['ALEX EJEMPLO',
   * 'EJEMPLO ALEX']`); el dominio no las inventa, que sería una heurística
   * encima de otra heurística.
   */
  readonly holderNames: readonly string[]
}

/**
 * Las señales que pueden disparar un emparejamiento, en su orden canónico. Es
 * lo que acaba en `transfers.matched_by` para poder depurar la heurística y
 * explicar en la pantalla de revisión por qué se emparejó algo.
 *
 * Lista cerrada de literales y no texto libre: en cuanto es texto libre, quien
 * lo lee acaba distinguiendo casos por el contenido de una frase.
 */
export const TRANSFER_MATCH_SIGNALS = [
  /** El texto de una pata nombra al proveedor de la cuenta de la otra. */
  'other_provider_named',
  /** El texto de una pata nombra al titular. */
  'holder_named',
  /** Las dos fechas contables se llevan un día o menos. */
  'close_dates',
] as const

export type TransferMatchSignal = (typeof TRANSFER_MATCH_SIGNALS)[number]

/** Las dos patas de una transferencia interna, ya emparejadas. */
export type TransferMatch = {
  /** Pata de cargo (`amountCents < 0`) → `transfers.out_txn_id`. */
  readonly outTxnId: number
  /** Pata de abono (`amountCents > 0`) → `transfers.in_txn_id`. */
  readonly inTxnId: number
  /**
   * 0..3. Sirvió para desempatar, no es un umbral de aceptación: un candidato
   * único con cero puntos se empareja igual (ADR-013).
   */
  readonly score: number
  /** Días entre las dos fechas contables, en valor absoluto (0..3). */
  readonly dayGap: number
  /** Señales presentes, en el orden de `TRANSFER_MATCH_SIGNALS`. */
  readonly matchedBy: readonly TransferMatchSignal[]
}

/**
 * "Empate no resoluble → dejar sin emparejar y marcar para revisión"
 * (docs/DATA_MODEL.md).
 *
 * No hay columna en la base para esto ni hace falta: el movimiento se queda con
 * `transfer_id = null`, que ya lo hace visible en la bandeja de revisión. Esta
 * lista es la explicación del porqué.
 */
export type UnresolvedCandidate = {
  readonly transactionId: number
  /** Unión de un solo miembro hoy; existe para que el motivo sea legible. */
  readonly reason: 'tie'
  /** Ids que empataban en la mejor puntuación, ascendentes. */
  readonly tiedWith: readonly number[]
  readonly score: number
}

export type TransferMatchingResult = {
  /** Parejas resueltas, ordenadas por `outTxnId` ascendente. */
  readonly matches: readonly TransferMatch[]
  /** Empates sin resolver, ordenados por `transactionId` ascendente. */
  readonly unresolved: readonly UnresolvedCandidate[]
}
