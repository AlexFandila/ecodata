/**
 * Qué columna es cada cual, en un solo sitio.
 *
 * Es el equivalente de `layout.ts` en el adaptador de la Norma 43: allí un mapa
 * de posiciones fijas, aquí un mapa de nombres. Y hay que localizarlas por
 * nombre y no por posición porque **el CSV de Revolut está traducido**: el
 * export `es-ES` que se inspeccionó trae `Tipo,Producto,Fecha de inicio,Fecha de
 * finalización,Descripción,Importe,Comisión,Divisa,State,Saldo` (con `State` sin
 * traducir, que es cosa suya). Leer por posición sería inmune al idioma, sí,
 * pero también a que Revolut inserte una columna en medio, y ese fallo sería
 * silencioso. Ver ADR-011.
 *
 * Los alias se comparan sin acentos, sin mayúsculas y sin espacios de sobra, así
 * que un `Descripcion` mal exportado o un `DIVISA` entran igual. Añadir un
 * idioma es añadir un alias a esta tabla; no se toca nada más.
 */
import { RevolutCsvFormatError } from './errors'

/**
 * Nombre canónico de cada columna → cómo la escribe Revolut en cada idioma.
 *
 * El nombre canónico va en inglés, como todo identificador del proyecto; los
 * alias son literales de la fuente y por eso están tal cual los emite.
 */
export const COLUMN_ALIASES = {
  type: ['Tipo', 'Type'],
  product: ['Producto', 'Product'],
  startedAt: ['Fecha de inicio', 'Started Date'],
  completedAt: ['Fecha de finalización', 'Completed Date'],
  description: ['Descripción', 'Description'],
  amount: ['Importe', 'Amount'],
  fee: ['Comisión', 'Fee'],
  currency: ['Divisa', 'Currency'],
  state: ['Estado', 'State'],
  balance: ['Saldo', 'Balance'],
} as const satisfies Record<string, readonly string[]>

export type ColumnName = keyof typeof COLUMN_ALIASES

export const COLUMN_NAMES = Object.keys(COLUMN_ALIASES) as readonly ColumnName[]

/** En qué posición quedó cada columna en este fichero concreto. */
export type ColumnIndex = Readonly<Record<ColumnName, number>>

/** Sin acentos, sin mayúsculas y sin espacios de sobra: así se comparan los nombres. */
function normalizeHeading(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
}

/**
 * Localiza las diez columnas en la fila de cabecera.
 *
 * Que falte una es error de fichero, no de fila: sin ella no hay forma de leer
 * ningún movimiento. El mensaje dice cuáles faltan y qué cabecera se encontró,
 * porque el caso real de esto es haber exportado otra cosa (un extracto de
 * inversión, un CSV de otro banco) y conviene verlo de un vistazo.
 */
export function locateColumns(header: readonly string[]): ColumnIndex {
  const positions = new Map<string, number>()
  for (const [index, heading] of header.entries()) {
    const key = normalizeHeading(heading)
    // La primera gana: si un fichero repitiera un nombre, nos quedamos con la
    // columna de la izquierda en vez de con la última en silencio.
    if (!positions.has(key)) positions.set(key, index)
  }

  const located: Partial<Record<ColumnName, number>> = {}
  const missing: ColumnName[] = []

  for (const name of COLUMN_NAMES) {
    const index = COLUMN_ALIASES[name]
      .map((alias) => positions.get(normalizeHeading(alias)))
      .find((found) => found !== undefined)
    if (index === undefined) {
      missing.push(name)
    } else {
      located[name] = index
    }
  }

  if (missing.length > 0) {
    const expected = missing.map((name) => COLUMN_ALIASES[name][0]).join(', ')
    throw new RevolutCsvFormatError(
      `A la cabecera le faltan columnas del extracto de Revolut (${expected}). Se ha leído: ${header.join(', ')}`,
    )
  }

  return located as ColumnIndex
}

/** La celda de una columna, o cadena vacía si la fila se quedó corta. */
export function cell(row: readonly string[], columns: ColumnIndex, name: ColumnName): string {
  return row[columns[name]] ?? ''
}
