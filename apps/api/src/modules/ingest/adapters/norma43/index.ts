/**
 * `Norma43Adapter`: cuaderno 43 de la AEB → `NormalizedTransaction[]`.
 *
 * Es lo que exporta Unicaja, pero el adaptador no sabe nada de Unicaja: la
 * Norma 43 es un estándar y esto sirve para cualquier banco español que la
 * emita (ADR-010). De qué banco es una importación lo dice la cuenta a la que
 * va, no el formato del fichero.
 *
 * Lo que hace distinto a este adaptador de un lector de CSV es que **el fichero
 * se verifica a sí mismo**: el registro final de cuenta trae los totales y el
 * recuento de apuntes, así que se puede comprobar que lo leído es todo lo que
 * había. Si no cuadra, se aborta: importar en silencio un extracto truncado
 * dejaría un saldo mal para siempre (invariante 6).
 */
import { minorUnitsOf } from '@finanzas/core'
import {
  type Currency,
  type ImportRowError,
  type NormalizedTransaction,
  normalizedTransactionSchema,
} from '@finanzas/shared'
import type { SourceReadResult, TransactionSource } from '../../ports/transaction-source'
import { Norma43FormatError } from './errors'
import {
  amountCentsOrNull,
  calendarDateOrNull,
  currencyFromNumeric,
  integerOrNull,
  signOrNull,
  textOrNull,
} from './fields'
import {
  ACCOUNT_FOOTER,
  ACCOUNT_HEADER,
  AMOUNT_EQUIVALENCE,
  EXTENDED_CONCEPT,
  FILE_FOOTER,
  type Field,
  read,
  TRANSACTION,
} from './layout'
import {
  type AccountBlock,
  decodeNorma43,
  type Norma43Structure,
  parseStructure,
  splitRecords,
  type TransactionRecords,
} from './records'

/** Fecha a ceros o en blanco: la fuente dice «no hay», no «hay y es esta». */
function isAbsentDate(value: string): boolean {
  const trimmed = value.trim()
  return trimmed === '' || /^0+$/.test(trimmed)
}

/**
 * Descripción del movimiento: las dos mitades de cada registro 23, recortadas
 * por separado y unidas por un espacio.
 *
 * La primera mitad es el tipo de operación (`TRANSF.SEPA NACIONAL`) y la
 * segunda el texto libre (`Auto transferencia`). Se conservan las dos: el
 * `.xls` de Unicaja solo enseña la segunda, y la primera es justo lo que da
 * juego al motor de reglas.
 */
function describe(concepts: readonly string[]): string | null {
  const parts: string[] = []
  for (const record of concepts) {
    for (const field of [EXTENDED_CONCEPT.first, EXTENDED_CONCEPT.second]) {
      const value = textOrNull(read(record, field))
      if (value !== null) parts.push(value)
    }
  }
  return textOrNull(parts.join(' ').replace(/\s+/g, ' '))
}

/** La fila original, para poder re-normalizar el día que este parser mejore (invariante 4). */
function rawOf(
  transaction: TransactionRecords,
  account: { bank: string; branch: string; account: string; currency: string },
): Record<string, unknown> {
  const main = transaction.main
  return {
    formato: 'norma43',
    entidad: account.bank,
    oficina: account.branch,
    cuenta: account.account,
    divisa: account.currency,
    oficinaOrigen: read(main, TRANSACTION.originBranch).trim(),
    fechaOperacion: read(main, TRANSACTION.operationDate),
    fechaValor: read(main, TRANSACTION.valueDate),
    conceptoComun: read(main, TRANSACTION.commonConcept),
    conceptoPropio: read(main, TRANSACTION.ownConcept),
    signo: read(main, TRANSACTION.sign),
    importe: read(main, TRANSACTION.amount),
    numeroDocumento: read(main, TRANSACTION.documentNumber),
    referencia1: read(main, TRANSACTION.reference1).trim(),
    referencia2: read(main, TRANSACTION.reference2).trim(),
    /** «Libre» en la norma; Unicaja mete aquí la hora `HHMM`. No se interpreta. */
    libre: read(main, TRANSACTION.free),
    conceptos: transaction.concepts.map((record) => ({
      codigo: read(record, EXTENDED_CONCEPT.dataCode),
      primera: read(record, EXTENDED_CONCEPT.first).trim(),
      segunda: read(record, EXTENDED_CONCEPT.second).trim(),
    })),
    equivalencias: transaction.equivalences.map((record) => ({
      codigo: read(record, AMOUNT_EQUIVALENCE.dataCode),
      divisa: read(record, AMOUNT_EQUIVALENCE.currency),
      importe: read(record, AMOUNT_EQUIVALENCE.amount),
    })),
    /** Los registros literales: la fidelidad total que exige el invariante 4. */
    registros: [main, ...transaction.concepts, ...transaction.equivalences],
  }
}

type Mapped = { ok: true; value: NormalizedTransaction } | { ok: false; message: string }

function toNormalized(
  transaction: TransactionRecords,
  account: { bank: string; branch: string; account: string; currency: string },
  currency: string,
  amountCents: number,
): Mapped {
  const main = transaction.main

  const bookedAt = calendarDateOrNull(read(main, TRANSACTION.operationDate))
  if (bookedAt === null) {
    return {
      ok: false,
      message: `Fecha de operación ilegible: «${read(main, TRANSACTION.operationDate)}»`,
    }
  }

  const rawValueDate = read(main, TRANSACTION.valueDate)
  let valueDate: string | null = null
  if (!isAbsentDate(rawValueDate)) {
    valueDate = calendarDateOrNull(rawValueDate)
    if (valueDate === null) {
      return { ok: false, message: `Fecha valor ilegible: «${rawValueDate}»` }
    }
  }

  const candidate = {
    bookedAt,
    valueDate,
    amountCents,
    currency,
    // La Norma 43 no distingue contraparte de concepto: el adaptador no la inventa (ADR-010).
    counterparty: null,
    description: describe(transaction.concepts),
    raw: rawOf(transaction, account),
  }

  const parsed = normalizedTransactionSchema.safeParse(candidate)
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(raíz)'}: ${issue.message}`)
      .join('; ')
    return { ok: false, message: `El movimiento no cumple el contrato — ${detail}` }
  }
  return { ok: true, value: parsed.data }
}

/**
 * Importes de cada apunte, leídos del registro 22 sin interpretar nada más.
 *
 * Van aparte del resto del mapeo porque son la base de la comprobación de
 * integridad, y esa tiene que poder hacerse aunque un apunte falle por otro
 * motivo. Un importe ilegible sí es fallo de fichero: sin él no hay forma de
 * comprobar que lo leído cuadra con lo que el propio fichero declara.
 */
function amountsOf(block: AccountBlock, currency: Currency): number[] {
  return block.transactions.map((transaction) => {
    const sign = read(transaction.main, TRANSACTION.sign)
    const digits = read(transaction.main, TRANSACTION.amount)
    const cents = amountCentsOrNull(sign, digits, currency)
    if (cents === null) {
      throw new Norma43FormatError(
        `Importe ilegible en el movimiento ${transaction.ordinal}: signo «${sign}», importe «${digits}»`,
      )
    }
    return cents
  })
}

function signedBalance(record: string, sign: Field, amount: Field, label: string): number {
  const direction = signOrNull(read(record, sign))
  const magnitude = integerOrNull(read(record, amount))
  if (direction === null || magnitude === null) {
    throw new Norma43FormatError(`${label} ilegible en el fichero`)
  }
  return direction * magnitude
}

/**
 * La comprobación que justifica haber elegido este formato: lo leído tiene que
 * cuadrar con lo que el propio fichero declara, al céntimo y al apunte.
 */
function verifyIntegrity(
  block: AccountBlock,
  amounts: readonly number[],
  structure: Norma43Structure,
): void {
  const footer = block.footer

  const debits = amounts.filter((cents) => cents < 0)
  const credits = amounts.filter((cents) => cents > 0)
  // Un apunte de importe cero no es ni debe ni haber; la norma no lo contempla y no aparece.
  const zeros = amounts.length - debits.length - credits.length

  const declaredDebitCount = integerOrNull(read(footer, ACCOUNT_FOOTER.debitCount))
  const declaredCreditCount = integerOrNull(read(footer, ACCOUNT_FOOTER.creditCount))
  const declaredDebitTotal = integerOrNull(read(footer, ACCOUNT_FOOTER.debitTotal))
  const declaredCreditTotal = integerOrNull(read(footer, ACCOUNT_FOOTER.creditTotal))
  if (
    declaredDebitCount === null ||
    declaredCreditCount === null ||
    declaredDebitTotal === null ||
    declaredCreditTotal === null
  ) {
    throw new Norma43FormatError('El registro final de cuenta (33) trae totales ilegibles')
  }

  if (declaredDebitCount + declaredCreditCount + zeros !== amounts.length) {
    throw new Norma43FormatError(
      `El fichero declara ${declaredDebitCount + declaredCreditCount} apuntes y se han leído ${amounts.length}`,
    )
  }

  const readDebitTotal = -debits.reduce((total, cents) => total + cents, 0)
  const readCreditTotal = credits.reduce((total, cents) => total + cents, 0)
  if (readDebitTotal !== declaredDebitTotal) {
    throw new Norma43FormatError(
      `El total del debe no cuadra: el fichero declara ${declaredDebitTotal} céntimos y se han leído ${readDebitTotal}`,
    )
  }
  if (readCreditTotal !== declaredCreditTotal) {
    throw new Norma43FormatError(
      `El total del haber no cuadra: el fichero declara ${declaredCreditTotal} céntimos y se han leído ${readCreditTotal}`,
    )
  }

  const opening = signedBalance(
    block.header,
    ACCOUNT_HEADER.openingBalanceSign,
    ACCOUNT_HEADER.openingBalance,
    'El saldo inicial',
  )
  const closing = signedBalance(
    footer,
    ACCOUNT_FOOTER.closingBalanceSign,
    ACCOUNT_FOOTER.closingBalance,
    'El saldo final',
  )
  const net = amounts.reduce((total, cents) => total + cents, 0)
  if (opening + net !== closing) {
    throw new Norma43FormatError(
      `El saldo no cuadra: ${opening} + ${net} = ${opening + net} céntimos, pero el fichero declara ${closing}`,
    )
  }

  if (structure.fileFooter !== null) {
    const declared = integerOrNull(read(structure.fileFooter, FILE_FOOTER.recordCount))
    if (declared === null) {
      throw new Norma43FormatError('El registro de fin de fichero (88) trae un recuento ilegible')
    }
    // La norma no cuenta el propio 88; hay exportadores que sí, y ambos valen.
    const withoutFooter = structure.recordCount - 1
    if (declared !== withoutFooter && declared !== structure.recordCount) {
      throw new Norma43FormatError(
        `El fichero declara ${declared} registros y se han leído ${withoutFooter}`,
      )
    }
  }
}

export const norma43Adapter: TransactionSource = {
  id: 'norma43',

  read(input: Uint8Array): SourceReadResult {
    const structure = parseStructure(splitRecords(decodeNorma43(input)))

    if (structure.blocks.length > 1) {
      throw new Norma43FormatError(
        `El fichero trae ${structure.blocks.length} cuentas y una importación va a una sola: exporta cada cuenta por separado`,
      )
    }
    const [block] = structure.blocks
    if (block === undefined) {
      throw new Norma43FormatError('El fichero no contiene ninguna cuenta: no es un cuaderno 43')
    }

    const numericCurrency = read(block.header, ACCOUNT_HEADER.currency)
    const currency = currencyFromNumeric(numericCurrency)
    if (currency === null) {
      throw new Norma43FormatError(
        `Divisa no admitida en la cabecera de cuenta: código ISO numérico «${numericCurrency.trim()}»`,
      )
    }
    if (minorUnitsOf(currency) !== 2) {
      throw new Norma43FormatError(
        `La Norma 43 escribe los importes con dos decimales implícitos y ${currency} no tiene dos: haría falta decidir la escala antes de leer este fichero`,
      )
    }

    const account = {
      bank: read(block.header, ACCOUNT_HEADER.bank),
      branch: read(block.header, ACCOUNT_HEADER.branch),
      account: read(block.header, ACCOUNT_HEADER.account),
      currency: numericCurrency,
    }

    const amounts = amountsOf(block, currency)
    verifyIntegrity(block, amounts, structure)

    const transactions: NormalizedTransaction[] = []
    const rowErrors: ImportRowError[] = []

    for (const [index, transaction] of block.transactions.entries()) {
      const amountCents = amounts[index]
      if (amountCents === undefined) continue
      const mapped = toNormalized(transaction, account, currency, amountCents)
      if (mapped.ok) {
        transactions.push(mapped.value)
      } else {
        rowErrors.push({ row: transaction.ordinal, message: mapped.message })
      }
    }

    return { transactions, rowErrors }
  },
}
