/**
 * El fichero no es un extracto CSV de Revolut válido, o lo es pero no cuadra
 * consigo mismo.
 *
 * Mismo criterio que `Norma43FormatError` (ADR-010, punto 5): se reserva para el
 * fallo de fichero, no para el de fila. Una fila con una divisa que no
 * conocemos va a `rowErrors` y el resto se importa; un extracto cuya columna de
 * saldo no encadena se rechaza entero, porque eso significa que se ha leído un
 * fichero truncado o editado e importarlo en silencio corrompería los saldos
 * que el invariante 6 calcula sumando movimientos.
 */
import { SourceFormatError } from '../../ports/source-format-error'

export class RevolutCsvFormatError extends SourceFormatError {
  constructor(message: string) {
    super(message)
    this.name = 'RevolutCsvFormatError'
  }
}
