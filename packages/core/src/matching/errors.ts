/**
 * Error de dominio del matching de transferencias.
 *
 * Se lanza solo ante lo que siempre es un fallo de programación de quien llama:
 * dos candidatos con el mismo id, un candidato que apunta a una cuenta que no
 * viene en la lista, una fecha contable que no existe en el calendario. Nada de
 * esto puede salir de una consulta bien hecha, así que falla fuerte y pronto
 * (mismo criterio que ADR-006) en vez de saltarse el movimiento en silencio:
 * saltarlo lo dejaría sin emparejar para siempre sin que nadie se entere.
 */
export class TransferMatchingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TransferMatchingError'
  }
}
