/**
 * Errores del módulo, como clases propias: el borde HTTP los traduce a códigos
 * con `instanceof`, igual que hace con los de `ingest` y los de `categorize`.
 * Que el módulo lance su error y no un 404 es lo que le permite no saber que
 * existe HTTP.
 */

/** La transferencia no existe. */
export class TransferNotFoundError extends Error {
  constructor(readonly transferId: number) {
    super(`No existe la transferencia ${transferId}`)
    this.name = 'TransferNotFoundError'
  }
}

/** El movimiento no existe, o está borrado, que para fuera es lo mismo (invariante 5). */
export class TransactionNotFoundError extends Error {
  constructor(readonly transactionId: number) {
    super(`No existe el movimiento ${transactionId}`)
    this.name = 'TransactionNotFoundError'
  }
}

/**
 * Se ha intentado emparejar un movimiento que ya es pata de otra transferencia.
 *
 * Es el invariante 2 visto desde fuera. Los dos `UNIQUE` de la tabla lo
 * rechazarían igual, pero como un error opaco de base de datos: comprobarlo
 * aquí es lo que permite contestar "ese movimiento ya está emparejado" con el
 * id de la transferencia que lo tiene.
 */
export class TransactionAlreadyPairedError extends Error {
  constructor(
    readonly transactionId: number,
    readonly transferId: number,
  ) {
    super(`El movimiento ${transactionId} ya es parte de la transferencia interna ${transferId}`)
    this.name = 'TransactionAlreadyPairedError'
  }
}

/**
 * Los dos movimientos no pueden ser las dos patas de la misma transferencia.
 *
 * Cubre lo que sigue siendo obligatorio también a mano: cuentas distintas, las
 * dos propias, y un cargo con un abono. Lo que el emparejado manual **no**
 * exige —importes opuestos, misma divisa, fechas cercanas— son criterios de la
 * heurística, y este error no los mira (ADR-015).
 */
export class InvalidTransferPairError extends Error {
  constructor(readonly reason: string) {
    super(reason)
    this.name = 'InvalidTransferPairError'
  }
}
