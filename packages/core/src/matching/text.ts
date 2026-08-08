/**
 * Normalización de texto para reconocer un nombre dentro de la contraparte o la
 * descripción de un movimiento.
 *
 * Los extractos escriben el mismo nombre de mil maneras: `Revolut**1234`,
 * `TRANSF. A REVOLUT`, `REVOLUT BANK UAB`. Comparar en crudo no reconoce
 * ninguna, así que las dos partes se reducen antes a una forma común.
 */

/** Aguja más corta que se toma en serio. Ver `namesText`. */
const MIN_NEEDLE_LENGTH = 3

/**
 * Reduce un texto a mayúsculas sin acentos, con la puntuación convertida en
 * espacios y los espacios colapsados.
 *
 * Se descompone a NFD y se tiran los diacríticos en vez de comparar en NFC:
 * `CAFÉ` compuesto y descompuesto tienen que dar el mismo texto, que es el
 * mismo problema que resuelve `nfc()` en `dedupe/source-hash.ts`, solo que aquí
 * además interesa que `CAFE` sin tilde también coincida. La `ñ` acaba en `N`
 * como efecto colateral: consciente y deseable, porque los extractos bancarios
 * suelen escribirla así.
 *
 * Convertir la puntuación en espacios (y no borrarla) es lo que hace que
 * `REVOLUT*1234` se reconozca como `REVOLUT 1234` y no como una palabra sola.
 */
export function normalizeForMatching(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
}

/**
 * ¿Aparece `needle` como palabra completa dentro de `haystack`? Los dos deben
 * venir ya normalizados con `normalizeForMatching`.
 *
 * Por palabra y no por subcadena: un titular que se llame "ANA" coincidiría con
 * "PLATANOS" en cuanto se busque por subcadena, y la señal vale +2, que es la
 * que más pesa. Rodear los dos textos de espacios resuelve de paso las agujas
 * de varias palabras, que con una frontera por palabra suelta habría que
 * recorrer a mano.
 *
 * Las agujas de menos de tres caracteres se ignoran: son ruido con el que
 * cualquier extracto acaba coincidiendo por accidente.
 */
export function containsWord(haystack: string, needle: string): boolean {
  if (needle.length < MIN_NEEDLE_LENGTH) return false
  if (haystack === '') return false

  return ` ${haystack} `.includes(` ${needle} `)
}
