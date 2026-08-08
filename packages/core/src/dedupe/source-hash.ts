/**
 * La clave de deduplicación de un movimiento: el invariante 1 de
 * docs/DATA_MODEL.md hecho función.
 *
 * Vive en el dominio y no en el módulo `ingest` porque no es una regla de
 * ningún formato, sino de la identidad de un movimiento: en la Fase 4 el
 * `EnableBankingAdapter` tiene que producir exactamente los mismos hashes que
 * el CSV para que solapar ambas fuentes no duplique nada (ADR-004). Una regla
 * que dos adaptadores distintos deben cumplir igual no puede vivir dentro de
 * uno de ellos.
 *
 * Hashear es cálculo puro: entra un dato, sale un dato. `node:crypto` no abre
 * ficheros ni sockets, así que no rompe la promesa de "core no hace IO".
 *
 * Ver ADR-012 para el porqué de los dos campos que el invariante 1 no tenía
 * (`currency` y `occurrence`).
 */
import { createHash } from 'node:crypto'
import type { Currency } from '../money/currency'

/**
 * Lo que identifica a un movimiento. Son los campos normalizados **estables**:
 * los que van a significar lo mismo dentro de dos años, y no la fila cruda, que
 * cambia en cuanto el banco reordena una columna.
 */
export type SourceHashInput = {
  /** La cuenta forma parte de la identidad: el mismo apunte en dos cuentas son dos movimientos. */
  readonly accountId: number
  /** Fecha contable ISO `YYYY-MM-DD`. */
  readonly bookedAt: string
  readonly amountCents: number
  /**
   * La divisa, que el invariante 1 no pedía.
   *
   * Sin ella, dos movimientos del mismo día, el mismo importe y la misma
   * descripción en divisas distintas colisionan y el segundo se descarta como
   * duplicado. Es exactamente un cambio de divisa en un extracto de Revolut, y
   * lo dejó anotado ADR-011 para arreglarlo aquí.
   */
  readonly currency: Currency
  readonly counterparty: string | null
  readonly description: string | null
  /**
   * El n-ésimo movimiento idéntico dentro del mismo fichero, empezando en 0.
   *
   * Dos cafés de 2,50 € en el mismo comercio el mismo día son dos movimientos
   * de verdad, y con los seis campos de arriba tendrían el mismo hash: el
   * segundo se perdería en silencio y el saldo quedaría mal (invariante 6).
   * Numerarlos los distingue sin romper la idempotencia, porque reimportar el
   * fichero vuelve a asignar los mismos números. Lo calcula el pipeline, que es
   * quien ve el lote entero; ver ADR-012.
   */
  readonly occurrence: number
}

/**
 * La forma canónica que se hashea.
 *
 * Se serializa como array JSON en vez de pegar los campos con un separador
 * porque JSON cierra de golpe las dos formas de colisionar que un separador
 * deja abiertas:
 *
 * 1. `null` y `''` son textos distintos (`null` y `""`). Con un separador los
 *    dos serían la ausencia de nada entre dos barras, y "sin contraparte" y
 *    "contraparte vacía" acabarían siendo el mismo movimiento.
 * 2. Un texto que contenga el separador no puede desplazar los campos: las
 *    comillas van escapadas, así que `{counterparty: 'A|B', description: null}`
 *    y `{counterparty: 'A', description: 'B'}` no pueden confundirse.
 *
 * Array y no objeto porque un array no depende del orden de las claves.
 */
function canonical(input: SourceHashInput): string {
  return JSON.stringify([
    input.accountId,
    input.bookedAt,
    input.amountCents,
    input.currency,
    nfc(input.counterparty),
    nfc(input.description),
    input.occurrence,
  ])
}

/**
 * Unifica la forma Unicode del texto antes de hashear.
 *
 * `CAFÉ` se puede escribir con la E acentuada como un solo carácter (NFC) o
 * como una E seguida de una tilde combinante (NFD). Se leen igual y son bytes
 * distintos, así que sin esto el mismo movimiento leído por dos fuentes con
 * criterios distintos —el CSV hoy, la API de Open Banking en la Fase 4—
 * entraría dos veces. No se toca nada más: ni mayúsculas ni espacios, porque
 * eso ya lo normaliza el adaptador y ser más agresivo aquí fusionaría
 * movimientos que son de verdad distintos.
 */
function nfc(value: string | null): string | null {
  return value === null ? null : value.normalize('NFC')
}

/**
 * SHA-256 en hexadecimal (64 caracteres) de la forma canónica.
 *
 * Es lo que va a `transactions.source_hash`, donde un `UNIQUE` lo convierte en
 * la garantía de que reimportar un fichero no duplica movimientos.
 */
export function sourceHash(input: SourceHashInput): string {
  return createHash('sha256').update(canonical(input), 'utf8').digest('hex')
}
