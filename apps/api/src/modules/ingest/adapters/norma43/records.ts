/**
 * De bytes a una estructura de registros: decodificar, trocear en registros de
 * 80 y comprobar que se suceden en el orden que manda la norma.
 *
 * Aquí no se interpreta ningún campo todavía. Separar el «esto es un cuaderno
 * 43 bien montado» del «este apunte dice tal cosa» es lo que permite que un
 * fichero roto aborte y un apunte raro solo se reporte.
 */
import { Norma43FormatError } from './errors'
import { codeOf, RECORD_CODES, RECORD_LENGTH } from './layout'

/** Un movimiento con los registros que lo acompañan, sin interpretar. */
export type TransactionRecords = {
  /** Posición del movimiento dentro del fichero, 1-based: es el `row` de un `ImportRowError`. */
  readonly ordinal: number
  /** Registro 22. */
  readonly main: string
  /** Registros 23, en orden. */
  readonly concepts: readonly string[]
  /** Registros 24, en orden. */
  readonly equivalences: readonly string[]
}

/** Una cuenta dentro del fichero: cabecera, sus movimientos y su registro de totales. */
export type AccountBlock = {
  readonly header: string
  readonly footer: string
  readonly transactions: readonly TransactionRecords[]
}

export type Norma43Structure = {
  readonly blocks: readonly AccountBlock[]
  /** Registro 88. La norma lo exige, pero no todos los exportadores lo emiten. */
  readonly fileFooter: string | null
  /** Registros leídos, contando el 88 si está. */
  readonly recordCount: number
}

const NEWLINE = /\r\n|\n|\r/
const TRAILING_NEWLINES = /(?:\r\n|\n|\r)+$/
const UTF8_BOM = [0xef, 0xbb, 0xbf] as const

function hasUtf8Bom(input: Uint8Array): boolean {
  return input.length >= 3 && UTF8_BOM.every((byte, index) => input[index] === byte)
}

/**
 * Bytes a texto.
 *
 * El cuaderno 43 es latin-1, y se decodifica como `windows-1252`, que lo
 * contiene: así un fichero que traiga una comilla tipográfica en el concepto no
 * se convierte en un carácter de control. Si aparece un BOM de UTF-8 es que
 * alguien lo ha pasado por un editor, y entonces se cree al BOM.
 */
export function decodeNorma43(input: Uint8Array): string {
  if (hasUtf8Bom(input)) {
    return new TextDecoder('utf-8').decode(input.subarray(UTF8_BOM.length))
  }
  return new TextDecoder('windows-1252').decode(input)
}

/**
 * Trocea el texto en registros de 80.
 *
 * Admite los tres finales de línea y también el fichero **sin ningún salto**,
 * que es un bloque continuo de registros de 80: la norma no obliga a
 * separarlos, y hay exportadores que no lo hacen.
 *
 * Un registro más corto de 80 se rellena con espacios en vez de rechazarse,
 * porque recortar los espacios finales de cada línea es lo que hace cualquier
 * editor por el que pase el fichero, y los últimos campos de casi todos los
 * registros son relleno. Lo que protege de una truncadura de verdad no es esta
 * comprobación, sino que los totales del registro 33 tienen que cuadrar con lo
 * leído. Un registro más largo de 80 sí se rechaza: ahí los desplazamientos ya
 * no significan lo que dicen.
 */
export function splitRecords(text: string): string[] {
  const body = text.replace(TRAILING_NEWLINES, '')
  if (body.trim() === '') return []

  const pieces = NEWLINE.test(body) ? body.split(NEWLINE) : chunkFixedWidth(body)

  const records: string[] = []
  for (const piece of pieces) {
    if (piece.trim() === '') continue
    if (piece.length > RECORD_LENGTH) {
      throw new Norma43FormatError(
        `Los registros del cuaderno 43 ocupan ${RECORD_LENGTH} caracteres; se ha encontrado uno de ${piece.length}`,
      )
    }
    records.push(piece.padEnd(RECORD_LENGTH, ' '))
  }
  return records
}

function chunkFixedWidth(body: string): string[] {
  if (body.length % RECORD_LENGTH !== 0) {
    throw new Norma43FormatError(
      `El fichero no trae saltos de línea y su longitud (${body.length}) no es múltiplo de ${RECORD_LENGTH}: no se puede trocear en registros`,
    )
  }
  const chunks: string[] = []
  for (let start = 0; start < body.length; start += RECORD_LENGTH) {
    chunks.push(body.slice(start, start + RECORD_LENGTH))
  }
  return chunks
}

/**
 * Comprueba que los registros se suceden como manda la norma y los agrupa.
 *
 * El orden es parte del formato, no una casualidad: un `23` sin su `22` delante
 * o una cuenta sin su registro de totales significan que el fichero está roto,
 * y es mejor decirlo que adivinar a qué movimiento pertenecía cada concepto.
 */
export function parseStructure(records: readonly string[]): Norma43Structure {
  if (records.length === 0) {
    throw new Norma43FormatError('El fichero está vacío')
  }

  /** Mientras se construye hay que poder añadir conceptos; al salir ya es de solo lectura. */
  type Building = {
    readonly ordinal: number
    readonly main: string
    readonly concepts: string[]
    readonly equivalences: string[]
  }

  const blocks: AccountBlock[] = []
  let header: string | null = null
  let transactions: Building[] = []
  let current: Building | null = null
  let fileFooter: string | null = null
  let ordinal = 0

  for (const [index, record] of records.entries()) {
    const position = index + 1
    if (fileFooter !== null) {
      throw new Norma43FormatError(
        `El registro de fin de fichero (88) debe ser el último, y hay registros después (posición ${position})`,
      )
    }

    switch (codeOf(record)) {
      case RECORD_CODES.accountHeader: {
        if (header !== null) {
          throw new Norma43FormatError(
            `Cabecera de cuenta (11) en la posición ${position} sin haber cerrado la anterior con un registro 33`,
          )
        }
        header = record
        transactions = []
        current = null
        break
      }
      case RECORD_CODES.transaction: {
        if (header === null) {
          throw new Norma43FormatError(
            `Movimiento (22) en la posición ${position} sin una cabecera de cuenta (11) delante`,
          )
        }
        ordinal += 1
        current = { ordinal, main: record, concepts: [], equivalences: [] }
        transactions.push(current)
        break
      }
      case RECORD_CODES.extendedConcept: {
        if (current === null) {
          throw new Norma43FormatError(
            `Concepto ampliado (23) en la posición ${position} sin un movimiento (22) delante`,
          )
        }
        current.concepts.push(record)
        break
      }
      case RECORD_CODES.amountEquivalence: {
        if (current === null) {
          throw new Norma43FormatError(
            `Equivalencia de importe (24) en la posición ${position} sin un movimiento (22) delante`,
          )
        }
        current.equivalences.push(record)
        break
      }
      case RECORD_CODES.accountFooter: {
        if (header === null) {
          throw new Norma43FormatError(
            `Final de cuenta (33) en la posición ${position} sin una cabecera de cuenta (11) delante`,
          )
        }
        blocks.push({ header, footer: record, transactions })
        header = null
        transactions = []
        current = null
        break
      }
      case RECORD_CODES.fileFooter: {
        if (header !== null) {
          throw new Norma43FormatError(
            `Fin de fichero (88) en la posición ${position} con una cuenta sin cerrar`,
          )
        }
        fileFooter = record
        break
      }
      default: {
        throw new Norma43FormatError(
          `Código de registro desconocido «${codeOf(record)}» en la posición ${position}`,
        )
      }
    }
  }

  if (header !== null) {
    throw new Norma43FormatError('La última cuenta se queda sin su registro final (33)')
  }
  if (blocks.length === 0) {
    throw new Norma43FormatError('El fichero no contiene ninguna cuenta: no es un cuaderno 43')
  }

  return { blocks, fileFooter, recordCount: records.length }
}
