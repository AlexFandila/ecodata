/**
 * Los desplazamientos del cuaderno 43 de la AEB, en un solo sitio.
 *
 * Un formato de posiciones fijas se lee mal de dos maneras: con números mágicos
 * repartidos por el parser, o con `slice` cuyos límites nadie puede comprobar
 * contra el papel. Aquí las posiciones se escriben **como las numera la norma**
 * —empezando en 1, con la longitud del campo— para poder cotejarlas de un
 * vistazo, y `read()` es quien traduce a índices de JavaScript.
 *
 * Verificado contra un fichero real de Unicaja: los desplazamientos son los de
 * la norma, sin desviaciones. Ver ADR-010.
 */
import { Norma43FormatError } from './errors'

/** Todo registro del cuaderno 43 ocupa exactamente esto. */
export const RECORD_LENGTH = 80

/** Los dos primeros caracteres de cada registro dicen qué es. */
export const RECORD_CODES = {
  /** Cabecera de cuenta: abre un bloque. */
  accountHeader: '11',
  /** Movimiento. */
  transaction: '22',
  /** Concepto ampliado del movimiento anterior; hasta cinco por movimiento. */
  extendedConcept: '23',
  /** Equivalencia de importe en otra divisa; opcional, Unicaja no lo emite. */
  amountEquivalence: '24',
  /** Final de cuenta: cierra el bloque con sus totales. */
  accountFooter: '33',
  /** Fin de fichero, con el recuento de registros. */
  fileFooter: '88',
} as const

export type RecordCode = (typeof RECORD_CODES)[keyof typeof RECORD_CODES]

/** Posición 1-based dentro del registro, tal como la numera la norma, y longitud. */
export type Field = {
  readonly at: number
  readonly length: number
}

/** Registro 11 — cabecera de cuenta. */
export const ACCOUNT_HEADER = {
  bank: { at: 3, length: 4 },
  branch: { at: 7, length: 4 },
  account: { at: 11, length: 10 },
  startDate: { at: 21, length: 6 },
  endDate: { at: 27, length: 6 },
  openingBalanceSign: { at: 33, length: 1 },
  openingBalance: { at: 34, length: 14 },
  currency: { at: 48, length: 3 },
  informationMode: { at: 51, length: 1 },
  accountName: { at: 52, length: 26 },
} as const satisfies Record<string, Field>

/**
 * Registro 22 — movimiento.
 *
 * `free` es «libre» en la norma, pero Unicaja mete ahí la hora de la operación
 * en formato `HHMM`. Se conserva en `raw` y no se interpreta: apoyarse en el
 * uso que un banco le da a un campo libre es apoyarse en nada.
 */
export const TRANSACTION = {
  free: { at: 3, length: 4 },
  originBranch: { at: 7, length: 4 },
  operationDate: { at: 11, length: 6 },
  valueDate: { at: 17, length: 6 },
  commonConcept: { at: 23, length: 2 },
  ownConcept: { at: 25, length: 3 },
  sign: { at: 28, length: 1 },
  amount: { at: 29, length: 14 },
  documentNumber: { at: 43, length: 10 },
  reference1: { at: 53, length: 12 },
  reference2: { at: 65, length: 16 },
} as const satisfies Record<string, Field>

/**
 * Registro 23 — concepto ampliado.
 *
 * Las dos mitades son campos independientes, no un texto de 76 caracteres
 * partido: en el fichero real cada una viene rellena de espacios por su cuenta
 * (`'TRANSF.SEPA NACIONAL'` + relleno, `'Auto transferencia'` + relleno), así
 * que se recortan por separado y se unen con un espacio.
 */
export const EXTENDED_CONCEPT = {
  dataCode: { at: 3, length: 2 },
  first: { at: 5, length: 38 },
  second: { at: 43, length: 38 },
} as const satisfies Record<string, Field>

/** Registro 24 — equivalencia de importe en la divisa de origen. */
export const AMOUNT_EQUIVALENCE = {
  dataCode: { at: 3, length: 2 },
  currency: { at: 5, length: 3 },
  amount: { at: 8, length: 14 },
} as const satisfies Record<string, Field>

/** Registro 33 — final de cuenta: es lo que permite verificar la lectura. */
export const ACCOUNT_FOOTER = {
  bank: { at: 3, length: 4 },
  branch: { at: 7, length: 4 },
  account: { at: 11, length: 10 },
  debitCount: { at: 21, length: 5 },
  debitTotal: { at: 26, length: 14 },
  creditCount: { at: 40, length: 5 },
  creditTotal: { at: 45, length: 14 },
  closingBalanceSign: { at: 59, length: 1 },
  closingBalance: { at: 60, length: 14 },
  currency: { at: 74, length: 3 },
} as const satisfies Record<string, Field>

/** Registro 88 — fin de fichero. */
export const FILE_FOOTER = {
  nines: { at: 3, length: 18 },
  recordCount: { at: 21, length: 6 },
} as const satisfies Record<string, Field>

/** Extrae el campo en crudo, sin recortar: recortar es decisión de quien lo interpreta. */
export function read(record: string, field: Field): string {
  const from = field.at - 1
  const value = record.slice(from, from + field.length)
  if (value.length !== field.length) {
    throw new Norma43FormatError(
      `Registro demasiado corto para leer el campo en la posición ${field.at}: ${record.length} caracteres`,
    )
  }
  return value
}

/** El código de registro son siempre las dos primeras posiciones. */
export function codeOf(record: string): string {
  return record.slice(0, 2)
}
