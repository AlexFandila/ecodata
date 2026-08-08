/**
 * Constructor de ficheros Norma 43 sintéticos para los tests.
 *
 * Todos los datos que salen de aquí son inventados: ni entidades, ni oficinas,
 * ni números de cuenta, ni importes corresponden a nada real.
 *
 * Los registros se montan **escribiendo sobre las posiciones de `layout.ts`**,
 * no copiando literales de 80 caracteres. Es la diferencia entre un fixture que
 * se rompe cuando el editor recorta los espacios finales y uno que no, y además
 * ata los tests al mismo mapa de campos que usa el parser: si un
 * desplazamiento estuviera mal, estaría mal en los dos sitios y el test de
 * ida y vuelta contra el fichero real lo cazaría igual.
 *
 * Los totales del registro 33 y el recuento del 88 se calculan solos, para que
 * un fixture sea coherente por defecto; `footer` y `fileFooter` permiten
 * descuadrarlos a propósito, que es como se prueba la verificación de
 * integridad.
 */
import {
  ACCOUNT_FOOTER,
  ACCOUNT_HEADER,
  AMOUNT_EQUIVALENCE,
  EXTENDED_CONCEPT,
  FILE_FOOTER,
  type Field,
  RECORD_CODES,
  RECORD_LENGTH,
  TRANSACTION,
} from './layout'

export type SyntheticConcept = {
  readonly code?: string
  readonly first: string
  readonly second?: string
}

export type SyntheticEquivalence = {
  readonly code?: string
  /** ISO 4217 numérico, como lo escribe la norma. */
  readonly currency: string
  readonly amountCents: number
}

export type SyntheticMovement = {
  /** `AAMMDD`, como en el fichero. */
  readonly operationDate?: string
  /** `AAMMDD`. Ausente = se copia la de operación; `''` = campo en blanco. */
  readonly valueDate?: string
  /** Con signo: negativo = debe, positivo = haber. */
  readonly amountCents: number
  readonly commonConcept?: string
  readonly ownConcept?: string
  readonly documentNumber?: string
  readonly reference1?: string
  readonly reference2?: string
  /** «Libre» en la norma; Unicaja escribe aquí la hora `HHMM`. */
  readonly free?: string
  readonly concepts?: readonly SyntheticConcept[]
  readonly equivalences?: readonly SyntheticEquivalence[]
  /** Escribe el campo de signo tal cual, para probar un valor inválido. */
  readonly rawSign?: string
  /** Escribe el campo de importe tal cual, para probar un valor inválido. */
  readonly rawAmount?: string
}

/** Descuadres a propósito del registro 33, para los tests de integridad. */
export type SyntheticFooterOverrides = {
  readonly debitCount?: number
  readonly creditCount?: number
  readonly debitTotalCents?: number
  readonly creditTotalCents?: number
  readonly closingBalanceCents?: number
}

export type SyntheticStatement = {
  readonly bank?: string
  readonly branch?: string
  readonly account?: string
  readonly startDate?: string
  readonly endDate?: string
  readonly openingBalanceCents?: number
  /** ISO 4217 numérico; `978` es el euro. */
  readonly currency?: string
  readonly accountName?: string
  readonly movements?: readonly SyntheticMovement[]
  readonly footer?: SyntheticFooterOverrides
}

export type Norma43Options = {
  /** `''` produce el fichero sin ningún salto de línea: bloques de 80 seguidos. */
  readonly newline?: string
  /** `null` omite el registro 88; un número escribe ese recuento en vez del real. */
  readonly fileFooter?: { readonly recordCount?: number } | null
}

const BLANK = ' '.repeat(RECORD_LENGTH)

function place(buffer: string, field: Field, value: string): string {
  if (value.length !== field.length) {
    throw new Error(
      `El campo de la posición ${field.at} ocupa ${field.length} y se le han dado ${value.length}: «${value}»`,
    )
  }
  const from = field.at - 1
  return buffer.slice(0, from) + value + buffer.slice(from + field.length)
}

/** Numérico rellenado con ceros a la izquierda, como los escribe la norma. */
function digits(value: number | string, field: Field): string {
  const text = String(value)
  if (text.length > field.length) {
    throw new Error(
      `«${text}» no cabe en el campo numérico de ${field.length} de la posición ${field.at}`,
    )
  }
  return text.padStart(field.length, '0')
}

/** Texto rellenado con espacios a la derecha. */
function text(value: string, field: Field): string {
  if (value.length > field.length) {
    throw new Error(
      `«${value}» no cabe en el campo de texto de ${field.length} de la posición ${field.at}`,
    )
  }
  return value.padEnd(field.length, ' ')
}

function signOf(amountCents: number): string {
  return amountCents < 0 ? '1' : '2'
}

function accountHeaderRecord(statement: SyntheticStatement): string {
  const opening = statement.openingBalanceCents ?? 0
  let record = place(BLANK, { at: 1, length: 2 }, RECORD_CODES.accountHeader)
  record = place(record, ACCOUNT_HEADER.bank, digits(statement.bank ?? '9999', ACCOUNT_HEADER.bank))
  record = place(
    record,
    ACCOUNT_HEADER.branch,
    digits(statement.branch ?? '1234', ACCOUNT_HEADER.branch),
  )
  record = place(
    record,
    ACCOUNT_HEADER.account,
    digits(statement.account ?? '0000000001', ACCOUNT_HEADER.account),
  )
  record = place(
    record,
    ACCOUNT_HEADER.startDate,
    text(statement.startDate ?? '260301', ACCOUNT_HEADER.startDate),
  )
  record = place(
    record,
    ACCOUNT_HEADER.endDate,
    text(statement.endDate ?? '260331', ACCOUNT_HEADER.endDate),
  )
  record = place(record, ACCOUNT_HEADER.openingBalanceSign, signOf(opening))
  record = place(
    record,
    ACCOUNT_HEADER.openingBalance,
    digits(Math.abs(opening), ACCOUNT_HEADER.openingBalance),
  )
  record = place(
    record,
    ACCOUNT_HEADER.currency,
    text(statement.currency ?? '978', ACCOUNT_HEADER.currency),
  )
  record = place(record, ACCOUNT_HEADER.informationMode, '3')
  return place(
    record,
    ACCOUNT_HEADER.accountName,
    text(statement.accountName ?? 'TITULAR EJEMPLO', ACCOUNT_HEADER.accountName),
  )
}

function movementRecords(movement: SyntheticMovement): string[] {
  const operationDate = movement.operationDate ?? '260315'
  const valueDate = movement.valueDate ?? operationDate

  let record = place(BLANK, { at: 1, length: 2 }, RECORD_CODES.transaction)
  record = place(record, TRANSACTION.free, text(movement.free ?? '', TRANSACTION.free))
  record = place(record, TRANSACTION.originBranch, digits('1234', TRANSACTION.originBranch))
  record = place(record, TRANSACTION.operationDate, text(operationDate, TRANSACTION.operationDate))
  record = place(record, TRANSACTION.valueDate, text(valueDate, TRANSACTION.valueDate))
  record = place(
    record,
    TRANSACTION.commonConcept,
    text(movement.commonConcept ?? '04', TRANSACTION.commonConcept),
  )
  record = place(
    record,
    TRANSACTION.ownConcept,
    text(movement.ownConcept ?? '590', TRANSACTION.ownConcept),
  )
  record = place(record, TRANSACTION.sign, movement.rawSign ?? signOf(movement.amountCents))
  record = place(
    record,
    TRANSACTION.amount,
    movement.rawAmount === undefined
      ? digits(Math.abs(movement.amountCents), TRANSACTION.amount)
      : text(movement.rawAmount, TRANSACTION.amount),
  )
  record = place(
    record,
    TRANSACTION.documentNumber,
    digits(movement.documentNumber ?? '0', TRANSACTION.documentNumber),
  )
  record = place(
    record,
    TRANSACTION.reference1,
    text(movement.reference1 ?? '', TRANSACTION.reference1),
  )
  record = place(
    record,
    TRANSACTION.reference2,
    text(movement.reference2 ?? '', TRANSACTION.reference2),
  )

  const records = [record]

  for (const concept of movement.concepts ?? []) {
    let line = place(BLANK, { at: 1, length: 2 }, RECORD_CODES.extendedConcept)
    line = place(
      line,
      EXTENDED_CONCEPT.dataCode,
      text(concept.code ?? '01', EXTENDED_CONCEPT.dataCode),
    )
    line = place(line, EXTENDED_CONCEPT.first, text(concept.first, EXTENDED_CONCEPT.first))
    line = place(line, EXTENDED_CONCEPT.second, text(concept.second ?? '', EXTENDED_CONCEPT.second))
    records.push(line)
  }

  for (const equivalence of movement.equivalences ?? []) {
    let line = place(BLANK, { at: 1, length: 2 }, RECORD_CODES.amountEquivalence)
    line = place(
      line,
      AMOUNT_EQUIVALENCE.dataCode,
      text(equivalence.code ?? '01', AMOUNT_EQUIVALENCE.dataCode),
    )
    line = place(
      line,
      AMOUNT_EQUIVALENCE.currency,
      text(equivalence.currency, AMOUNT_EQUIVALENCE.currency),
    )
    line = place(
      line,
      AMOUNT_EQUIVALENCE.amount,
      digits(Math.abs(equivalence.amountCents), AMOUNT_EQUIVALENCE.amount),
    )
    records.push(line)
  }

  return records
}

function accountFooterRecord(statement: SyntheticStatement): string {
  const movements = statement.movements ?? []
  const opening = statement.openingBalanceCents ?? 0
  const amounts = movements.map((movement) => movement.amountCents)

  const debitTotal = -amounts
    .filter((cents) => cents < 0)
    .reduce((total, cents) => total + cents, 0)
  const creditTotal = amounts
    .filter((cents) => cents > 0)
    .reduce((total, cents) => total + cents, 0)
  const closing = opening + amounts.reduce((total, cents) => total + cents, 0)

  const overrides = statement.footer ?? {}
  const debitCount = overrides.debitCount ?? amounts.filter((cents) => cents < 0).length
  const creditCount = overrides.creditCount ?? amounts.filter((cents) => cents > 0).length
  const declaredClosing = overrides.closingBalanceCents ?? closing

  let record = place(BLANK, { at: 1, length: 2 }, RECORD_CODES.accountFooter)
  record = place(record, ACCOUNT_FOOTER.bank, digits(statement.bank ?? '9999', ACCOUNT_FOOTER.bank))
  record = place(
    record,
    ACCOUNT_FOOTER.branch,
    digits(statement.branch ?? '1234', ACCOUNT_FOOTER.branch),
  )
  record = place(
    record,
    ACCOUNT_FOOTER.account,
    digits(statement.account ?? '0000000001', ACCOUNT_FOOTER.account),
  )
  record = place(record, ACCOUNT_FOOTER.debitCount, digits(debitCount, ACCOUNT_FOOTER.debitCount))
  record = place(
    record,
    ACCOUNT_FOOTER.debitTotal,
    digits(overrides.debitTotalCents ?? debitTotal, ACCOUNT_FOOTER.debitTotal),
  )
  record = place(
    record,
    ACCOUNT_FOOTER.creditCount,
    digits(creditCount, ACCOUNT_FOOTER.creditCount),
  )
  record = place(
    record,
    ACCOUNT_FOOTER.creditTotal,
    digits(overrides.creditTotalCents ?? creditTotal, ACCOUNT_FOOTER.creditTotal),
  )
  record = place(record, ACCOUNT_FOOTER.closingBalanceSign, signOf(declaredClosing))
  record = place(
    record,
    ACCOUNT_FOOTER.closingBalance,
    digits(Math.abs(declaredClosing), ACCOUNT_FOOTER.closingBalance),
  )
  return place(
    record,
    ACCOUNT_FOOTER.currency,
    text(statement.currency ?? '978', ACCOUNT_FOOTER.currency),
  )
}

function fileFooterRecord(recordCount: number): string {
  let record = place(BLANK, { at: 1, length: 2 }, RECORD_CODES.fileFooter)
  record = place(record, FILE_FOOTER.nines, '9'.repeat(FILE_FOOTER.nines.length))
  return place(record, FILE_FOOTER.recordCount, digits(recordCount, FILE_FOOTER.recordCount))
}

/** Los registros sueltos, por si un test quiere manipularlos antes de unirlos. */
export function norma43Records(
  statements: readonly SyntheticStatement[],
  options: Norma43Options = {},
): string[] {
  const records: string[] = []
  for (const statement of statements) {
    records.push(accountHeaderRecord(statement))
    for (const movement of statement.movements ?? []) {
      records.push(...movementRecords(movement))
    }
    records.push(accountFooterRecord(statement))
  }

  if (options.fileFooter !== null) {
    records.push(fileFooterRecord(options.fileFooter?.recordCount ?? records.length))
  }
  return records
}

/** El fichero completo como texto. */
export function norma43Text(
  statement: SyntheticStatement | readonly SyntheticStatement[],
  options: Norma43Options = {},
): string {
  const statements = Array.isArray(statement)
    ? (statement as readonly SyntheticStatement[])
    : [statement as SyntheticStatement]
  return norma43Records(statements, options).join(options.newline ?? '\r\n')
}

/** Texto a bytes latin-1, que es como viaja un cuaderno 43 de verdad. */
export function latin1Bytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length)
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index) & 0xff
  }
  return bytes
}

/** Lo que se le pasa al adaptador: un cuaderno 43 sintético en bytes. */
export function norma43Bytes(
  statement: SyntheticStatement | readonly SyntheticStatement[],
  options: Norma43Options = {},
): Uint8Array {
  return latin1Bytes(norma43Text(statement, options))
}
