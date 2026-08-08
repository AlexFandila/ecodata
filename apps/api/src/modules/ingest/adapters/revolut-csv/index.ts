/**
 * `RevolutCsvAdapter`: el export CSV de Revolut → `NormalizedTransaction[]`.
 *
 * Este sí lleva nombre de casa, al revés que `norma43`: el CSV de Revolut es
 * suyo y de nadie más (ADR-010, punto 3).
 *
 * Tres cosas lo separan de un lector de CSV cualquiera, y las tres salen de
 * haber mirado un export real antes de escribirlo (ADR-011):
 *
 * 1. **El fichero está traducido**, cabecera y valores. Por eso las columnas se
 *    localizan por nombre con una tabla de alias (`columns.ts`) y por eso una
 *    fila se considera importable por **tener fecha de finalización**, y no por
 *    comparar su estado con `COMPLETADO` o con `COMPLETED`. Decidir sobre la
 *    forma del dato y no sobre un texto traducido es lo que hace que esto
 *    aguante un cambio de idioma de la app.
 * 2. **El fichero se autoverifica**, igual que un cuaderno 43 y al contrario de
 *    lo que ADR-010 daba por supuesto de un CSV: la columna de saldo encadena
 *    movimiento a movimiento. Si no cuadra, se aborta (invariante 6).
 * 3. **Es multidivisa por fila.** Cada movimiento trae la suya y aquí no se
 *    convierte nada (ADR-008, punto 4); el saldo se encadena por bolsillo
 *    —producto + divisa—, que es como lo lleva Revolut.
 */
import { add, equals, money, subtract } from '@finanzas/core'
import {
  type Currency,
  type ImportRowError,
  type NormalizedTransaction,
  normalizedTransactionSchema,
} from '@finanzas/shared'
import type { SourceReadResult, TransactionSource } from '../../ports/transaction-source'
import { type ColumnIndex, cell, locateColumns } from './columns'
import { readCsv } from './csv'
import { RevolutCsvFormatError } from './errors'
import { amountCentsOrNull, calendarDateOrNull, currencyOrNull, textOrNull } from './fields'

/** Lo que hace falta de una fila para poder encadenar el saldo. */
type Ledger = {
  readonly currency: Currency
  /** Ya neto de comisión: es lo que mueve el saldo. */
  readonly amountCents: number
  readonly balanceCents: number
}

type Read<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string }

/**
 * Producto + divisa: el bolsillo cuyo saldo Revolut lleva por separado, y por
 * tanto la unidad en la que hay que encadenar la verificación.
 *
 * La clave se serializa como JSON en vez de pegar los dos textos con un
 * separador: el nombre de un producto puede llevar espacios o guiones, y
 * entonces dos bolsillos distintos podrían acabar con la misma clave.
 */
function pocketOf(row: readonly string[], columns: ColumnIndex): string {
  const product = cell(row, columns, 'product').trim()
  const currency = cell(row, columns, 'currency').trim()
  return JSON.stringify([product, currency])
}

/** Nombre legible del bolsillo, para los mensajes de error. */
function pocketLabel(pocket: string): string {
  const [product, currency] = JSON.parse(pocket) as [string, string]
  return `${product || '(sin producto)'} · ${currency || '(sin divisa)'}`
}

/**
 * Importe, comisión, divisa y saldo: lo que la verificación de integridad
 * necesita, y nada más.
 *
 * Va antes y aparte del resto del mapeo porque el saldo tiene que poder
 * comprobarse aunque la fila falle luego por otro motivo —una fecha ilegible, un
 * texto que no cumple el contrato—: esos movimientos no se importan, pero sí
 * movieron el saldo, y saltárselos en la cadena la rompería.
 */
function readLedger(row: readonly string[], columns: ColumnIndex): Read<Ledger> {
  const currencyText = cell(row, columns, 'currency')
  const currency = currencyOrNull(currencyText)
  if (currency === null) {
    return { ok: false, message: `Divisa no admitida: «${currencyText.trim()}»` }
  }

  const amountText = cell(row, columns, 'amount')
  const amountCents = amountCentsOrNull(amountText, currency)
  if (amountCents === null) {
    return { ok: false, message: `Importe ilegible: «${amountText.trim()}»` }
  }

  const feeText = cell(row, columns, 'fee')
  // La celda de comisión en blanco es una comisión de cero, no un error: no todos
  // los productos de Revolut la escriben.
  const feeCents = textOrNull(feeText) === null ? 0 : amountCentsOrNull(feeText, currency)
  if (feeCents === null) {
    return { ok: false, message: `Comisión ilegible: «${feeText.trim()}»` }
  }

  const balanceText = cell(row, columns, 'balance')
  const balanceCents = amountCentsOrNull(balanceText, currency)
  if (balanceCents === null) {
    return { ok: false, message: `Saldo ilegible: «${balanceText.trim()}»` }
  }

  // La comisión sale de la cuenta **además** del importe, que es como Revolut
  // encadena su columna de saldo. Ver ADR-011, punto 5.
  const net = subtract(money(amountCents, currency), money(feeCents, currency))
  return { ok: true, value: { currency, amountCents: net.amountCents, balanceCents } }
}

/** La fila original, para poder re-normalizar el día que este parser mejore (invariante 4). */
function rawOf(row: readonly string[], columns: ColumnIndex): Record<string, unknown> {
  return {
    formato: 'revolut_csv',
    tipo: cell(row, columns, 'type'),
    producto: cell(row, columns, 'product'),
    /** No va a `valueDate`: no es una fecha valor, sino cuándo se lanzó la operación (ADR-011). */
    fechaInicio: cell(row, columns, 'startedAt'),
    fechaFinalizacion: cell(row, columns, 'completedAt'),
    descripcion: cell(row, columns, 'description'),
    importe: cell(row, columns, 'amount'),
    comision: cell(row, columns, 'fee'),
    divisa: cell(row, columns, 'currency'),
    estado: cell(row, columns, 'state'),
    saldo: cell(row, columns, 'balance'),
    /** Las celdas literales: la fidelidad total que exige el invariante 4. */
    celdas: [...row],
  }
}

function toNormalized(
  row: readonly string[],
  columns: ColumnIndex,
  ledger: Ledger,
): Read<NormalizedTransaction> {
  const completedAt = cell(row, columns, 'completedAt')
  const bookedAt = calendarDateOrNull(completedAt)
  if (bookedAt === null) {
    return { ok: false, message: `Fecha de finalización ilegible: «${completedAt.trim()}»` }
  }

  const candidate = {
    bookedAt,
    // Revolut no da fecha valor. La de inicio no lo es —es cuándo se lanzó la
    // operación— y forzarla aquí le daría a un mismo campo dos significados
    // distintos según el adaptador. Se conserva en `raw` (ADR-011, punto 2).
    valueDate: null,
    amountCents: ledger.amountCents,
    currency: ledger.currency,
    // Revolut sí separa con quién fue la operación de qué tipo de operación es,
    // al revés que la Norma 43: cada columna va al campo que le corresponde y no
    // se inventa ni se duplica nada (ADR-011, punto 1).
    counterparty: textOrNull(cell(row, columns, 'description')),
    description: textOrNull(cell(row, columns, 'type')),
    raw: rawOf(row, columns),
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
 * La comprobación que este formato regala: cada saldo tiene que ser el anterior
 * de su bolsillo más lo que movió el movimiento.
 *
 * Sirve además de red para la única suposición del adaptador que el extracto
 * real no permitía observar —que la comisión **resta**, porque venía a cero en
 * las 729 filas—: si fuera al revés, el primer fichero con comisiones lo diría a
 * gritos en vez de dejar los saldos torcidos para siempre.
 */
function verifyChain(anchor: number, ledger: Ledger, pocket: string, ordinal: number): void {
  const expected = add(money(anchor, ledger.currency), money(ledger.amountCents, ledger.currency))
  if (equals(expected, money(ledger.balanceCents, ledger.currency))) return

  throw new RevolutCsvFormatError(
    `El saldo no cuadra en la fila ${ordinal} (${pocketLabel(pocket)}): ${anchor} céntimos más un movimiento de ${ledger.amountCents} dan ${expected.amountCents}, pero el fichero declara ${ledger.balanceCents}`,
  )
}

/** ¿Es esta fila una línea en blanco del final del fichero, y no un movimiento? */
function isBlank(row: readonly string[]): boolean {
  return row.every((value) => value.trim() === '')
}

export const revolutCsvAdapter: TransactionSource = {
  id: 'revolut_csv',

  read(input: Uint8Array): SourceReadResult {
    const rows = readCsv(input)
    const [header, ...dataRows] = rows
    if (header === undefined) {
      throw new RevolutCsvFormatError('El fichero está vacío: no es un extracto de Revolut')
    }
    const columns = locateColumns(header)

    const transactions: NormalizedTransaction[] = []
    const rowErrors: ImportRowError[] = []
    /** Último saldo bueno de cada bolsillo. Sin ancla, la fila no se puede comprobar. */
    const anchors = new Map<string, number>()

    for (const [index, row] of dataRows.entries()) {
      const ordinal = index + 1
      if (isBlank(row)) continue

      if (row.length !== header.length) {
        throw new RevolutCsvFormatError(
          `La fila ${ordinal} trae ${row.length} campos y la cabecera declara ${header.length}: el fichero está cortado o no es un extracto de Revolut`,
        )
      }

      // Sin fecha de finalización la operación no llegó a ocurrir (devuelta,
      // rechazada o todavía en curso): ni se importa ni cuenta como error, y de
      // hecho tampoco toca el saldo. Reimportar el fichero cuando se complete la
      // recogerá, porque hasta entonces no existe ningún movimiento que duplicar.
      if (textOrNull(cell(row, columns, 'completedAt')) === null) continue

      const pocket = pocketOf(row, columns)
      const ledger = readLedger(row, columns)
      if (!ledger.ok) {
        rowErrors.push({ row: ordinal, message: ledger.message })
        // Esta fila movió el saldo pero no se ha podido leer cuánto: de aquí en
        // adelante la cadena de este bolsillo ya no prueba nada, así que se
        // vuelve a anclar en la siguiente fila legible en vez de dar por bueno
        // un descuadre o inventarse uno.
        anchors.delete(pocket)
        continue
      }

      const anchor = anchors.get(pocket)
      if (anchor !== undefined) verifyChain(anchor, ledger.value, pocket, ordinal)
      anchors.set(pocket, ledger.value.balanceCents)

      const mapped = toNormalized(row, columns, ledger.value)
      if (mapped.ok) {
        transactions.push(mapped.value)
      } else {
        rowErrors.push({ row: ordinal, message: mapped.message })
      }
    }

    return { transactions, rowErrors }
  },
}
