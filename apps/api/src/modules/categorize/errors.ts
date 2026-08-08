/**
 * Errores del módulo, como clases propias: el borde HTTP los traduce a códigos
 * con `instanceof` (`errorJson`), igual que hace con los de `ingest`. Que el
 * módulo lance su error y no un 404 es lo que le permite no saber que existe
 * HTTP.
 */

/** El movimiento no existe, o está borrado, que para fuera es lo mismo (invariante 5). */
export class TransactionNotFoundError extends Error {
  constructor(readonly transactionId: number) {
    super(`No existe el movimiento ${transactionId}`)
    this.name = 'TransactionNotFoundError'
  }
}

/**
 * Se ha intentado categorizar una pata de una transferencia interna.
 *
 * No es un fallo de la petición sino del estado: la categoría de esas dos filas
 * la pone `ledger` por el invariante 3, y dejar que la UI la cambiara sacaría
 * el movimiento de `internal_transfer` sin deshacer la transferencia, que es
 * exactamente la incoherencia que el invariante evita.
 */
export class TransferLegNotCategorizableError extends Error {
  constructor(readonly transactionId: number) {
    super(
      `El movimiento ${transactionId} es parte de una transferencia interna: su categoría depende de la transferencia, no de las reglas`,
    )
    this.name = 'TransferLegNotCategorizableError'
  }
}

/** La categoría a la que se quería mover el movimiento no existe. */
export class CategoryNotFoundError extends Error {
  constructor(readonly categoryId: number) {
    super(`No existe la categoría ${categoryId}`)
    this.name = 'CategoryNotFoundError'
  }
}
