/**
 * Error de dominio de los agregados del dashboard.
 *
 * Se lanza ante lo que siempre es un fallo de programación: pasar una fila de un
 * mes que no está en la serie pedida, o una divisa que no está en la lista. No
 * hay variante `try*` porque estas funciones no reciben dato sucio de fuera:
 * reciben lo que acaba de agrupar una consulta SQL. Si eso no cuadra, el bug
 * está en la consulta y esconderlo detrás de un `null` lo convertiría en un
 * número mal sumado en pantalla, que es el peor sitio donde puede aparecer.
 *
 * Lo que sí puede llegar raro —un importe que no es entero, dos divisas que se
 * intentan sumar— lo detectan `money()` y `add()` con su propio `MoneyError`
 * (ADR-008): aquí no se duplica esa comprobación.
 */
export class SummaryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SummaryError'
  }
}
