/**
 * Error de dominio del módulo de fechas.
 *
 * Se lanza ante lo que siempre es un fallo de programación: pedir la distancia
 * entre dos días cuando uno de ellos no es un día. El dato sucio que viene de
 * un fichero no llega aquí —lo filtran los adaptadores en la ingesta—, y para
 * lo que sí puede llegar dudoso está `tryDaysBetween`, que devuelve `null` en
 * vez de lanzar (mismo criterio que `tryParseAmount`, ADR-008 punto 5).
 */
export class CalendarDateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CalendarDateError'
  }
}
