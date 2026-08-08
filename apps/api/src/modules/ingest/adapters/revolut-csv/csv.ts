/**
 * De bytes a una tabla de celdas. Aquí no se interpreta ningún campo.
 *
 * Es el equivalente de `records.ts` en el adaptador de la Norma 43: separar el
 * «esto es un CSV bien montado» del «esta fila dice tal cosa» es lo que permite
 * que un fichero roto aborte y una fila rara solo se reporte.
 *
 * El parser es RFC 4180 completo —comillas, comillas escapadas y saltos de línea
 * dentro de una celda— aunque el export real de Revolut que se inspeccionó no
 * traiga una sola comilla en 730 líneas. Se implementa igual porque el día que
 * un comercio lleve una coma en el nombre, un `split(',')` no fallaría: leería
 * importes donde hay divisas, y eso no lo caza nadie.
 *
 * Sin dependencias: son cuarenta líneas y `pnpm install` está lastrado por el
 * sandbox del proyecto (ADR-006).
 */
import { RevolutCsvFormatError } from './errors'

const UTF8_BOM = [0xef, 0xbb, 0xbf] as const

function hasUtf8Bom(input: Uint8Array): boolean {
  return input.length >= 3 && UTF8_BOM.every((byte, index) => input[index] === byte)
}

/**
 * Bytes a texto.
 *
 * Revolut exporta UTF-8, así que se decodifica en modo `fatal`: unos bytes que
 * no son UTF-8 válido no son un extracto de Revolut mal escrito, son otro
 * fichero. Mejor decirlo que colar caracteres de reemplazo en los nombres de los
 * comercios y que acaben en la base de datos y en el hash de deduplicación.
 */
export function decodeRevolutCsv(input: Uint8Array): string {
  const bytes = hasUtf8Bom(input) ? input.subarray(UTF8_BOM.length) : input
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new RevolutCsvFormatError(
      'El fichero no es UTF-8 válido: el CSV de Revolut siempre lo es, así que esto no es un extracto suyo',
    )
  }
}

/**
 * Texto a filas de celdas, según RFC 4180.
 *
 * Detalles que el estándar deja abiertos y aquí se cierran:
 * - Los tres finales de línea valen (`\r\n`, `\n`, `\r`), porque el fichero pasa
 *   por descargas y editores de tres sistemas operativos distintos.
 * - Una comilla en mitad de una celda **sin comillas** es un carácter más, no un
 *   error: es lo que hace cualquier hoja de cálculo y no hay ambigüedad.
 * - La última línea puede acabar en salto o no; el salto final no inventa una
 *   fila vacía de más.
 * - Una comilla que se abre y no se cierra sí es error de fichero: a partir de
 *   ahí el resto del extracto se leería corrido, y el número de filas dejaría de
 *   significar nada.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let cells: string[] = []
  let cell = ''
  let quoted = false
  let cellStarted = false

  const endCell = () => {
    cells.push(cell)
    cell = ''
    cellStarted = false
  }
  const endRow = () => {
    endCell()
    rows.push(cells)
    cells = []
  }

  // `charAt` en vez de `text[index]` porque con `noUncheckedIndexedAccess` el
  // indexado da `string | undefined` y aquí nunca lo es.
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index)

    if (quoted) {
      if (char !== '"') {
        cell += char
        continue
      }
      // Dentro de comillas, `""` es una comilla literal y una sola las cierra.
      if (text.charAt(index + 1) === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = false
      }
      continue
    }

    if (char === '"' && !cellStarted) {
      quoted = true
      cellStarted = true
      continue
    }
    if (char === ',') {
      endCell()
      continue
    }
    if (char === '\r' || char === '\n') {
      endRow()
      if (char === '\r' && text.charAt(index + 1) === '\n') index += 1
      continue
    }

    cell += char
    cellStarted = true
  }

  if (quoted) {
    throw new RevolutCsvFormatError(
      `El fichero tiene una comilla sin cerrar a partir de la fila ${rows.length + 1}: leerlo entero daría filas inventadas`,
    )
  }

  // El salto final del fichero no es una fila más; una celda suelta vacía, sí.
  if (cells.length > 0 || cell !== '') endRow()

  return rows
}

/** Lo que necesita el adaptador: los bytes del fichero convertidos en tabla. */
export function readCsv(input: Uint8Array): string[][] {
  return parseCsv(decodeRevolutCsv(input))
}
