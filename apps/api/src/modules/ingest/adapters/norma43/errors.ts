/**
 * El fichero no es un cuaderno 43 válido, o lo es pero no cuadra consigo mismo.
 *
 * Se reserva para el fallo de fichero, no para el de fila: un apunte con una
 * divisa desconocida va a `rowErrors` y el resto se importa, pero un extracto
 * cuyos totales no coinciden con lo leído se rechaza entero. Importar en
 * silencio un extracto truncado corrompería los saldos, que el invariante 6
 * calcula sumando movimientos.
 */
export class Norma43FormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'Norma43FormatError'
  }
}
