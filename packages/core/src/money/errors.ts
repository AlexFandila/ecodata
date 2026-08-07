/**
 * Error de dominio del módulo de dinero.
 *
 * Se lanza ante lo que siempre es un fallo de programación: mezclar divisas,
 * construir un importe con decimales, dividir por cero. La entrada sucia (una
 * celda de un CSV) no llega aquí: para eso están las variantes `try*`, que
 * devuelven `null` en vez de lanzar.
 */
export class MoneyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MoneyError'
  }
}
