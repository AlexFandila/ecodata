/**
 * Errores del pipeline, los que no son de ningún formato en concreto.
 *
 * Cada adaptador tiene su propio `errors.ts` para lo suyo (`Norma43FormatError`,
 * `RevolutCsvFormatError`); aquí van los del pipeline, que son los mismos venga
 * el fichero de donde venga.
 */

/**
 * La cuenta a la que se pide importar no existe.
 *
 * Es una clase y no un `null` de vuelta porque el borde HTTP tiene que
 * distinguirla del resto para contestar 404 con `not_found`: un fichero
 * perfecto contra una cuenta que no está no es un problema del fichero.
 */
export class AccountNotFoundError extends Error {
  constructor(readonly accountId: number) {
    super(`La cuenta ${accountId} no existe`)
    this.name = 'AccountNotFoundError'
  }
}
