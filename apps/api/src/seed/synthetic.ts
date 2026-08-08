/**
 * El perfil sintético de tres meses que puebla la base de desarrollo.
 *
 * Todos los datos que salen de aquí son inventados: ni comercios, ni entidades,
 * ni números de cuenta, ni importes corresponden a nada real (CLAUDE.md,
 * «Datos sensibles»).
 *
 * Dos decisiones de fondo:
 *
 * 1. **Esto no produce filas, produce ficheros.** Devuelve los extractos tal
 *    como los describen los constructores sintéticos de cada adaptador, y quien
 *    los convierte en movimientos es el `runImport()` de producción. Así la
 *    base de desarrollo tiene el mismo `raw`, el mismo hash y las mismas filas
 *    de `imports` que tendría con un fichero de verdad, y sembrar dos veces no
 *    duplica nada porque el árbitro es el `UNIQUE(source_hash)` de siempre.
 * 2. **Es puro y determinista.** Sin IO, sin `Math.random` y sin leer el reloj:
 *    la fecha final entra como parámetro, para que el CLI pase «hoy» —y la base
 *    de desarrollo tenga siempre movimientos recientes que enseñar en el
 *    dashboard— mientras los tests pasan una fecha fija y comparan bytes.
 */
import type {
  SyntheticNorma43Movement,
  SyntheticNorma43Statement,
  SyntheticRevolutMovement,
  SyntheticRevolutStatement,
} from '../modules/ingest/index'

// ---------------------------------------------------------------------------
// Aritmética de calendario
// ---------------------------------------------------------------------------

/** Los días de cada mes, contando el año bisiesto de verdad. */
function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    return leap ? 29 : 28
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31
}

type CalendarMonth = { readonly year: number; readonly month: number }

function isoOf(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** `2026-08-08` → `260808`, que es como escribe las fechas el cuaderno 43. */
function norma43Date(iso: string): string {
  return iso.slice(2).replaceAll('-', '')
}

/** `2026-08-08` → `2026-08-08 09:14:03`, que es como las escribe Revolut. */
function revolutTimestamp(iso: string, hhmmss: string): string {
  return `${iso} ${hhmmss}`
}

/** El mes desplazado `offset` meses respecto al dado. */
function shiftMonth({ year, month }: CalendarMonth, offset: number): CalendarMonth {
  const index = year * 12 + (month - 1) + offset
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

/**
 * El día `day` de ese mes, recortado al último si el mes es más corto: un
 * recibo domiciliado el 31 se cobra el 28 en febrero, no se salta.
 */
function dayOf({ year, month }: CalendarMonth, day: number): string {
  return isoOf(year, month, Math.min(day, daysInMonth(year, month)))
}

// ---------------------------------------------------------------------------
// Azar determinista
// ---------------------------------------------------------------------------

/**
 * `mulberry32`, devolviendo el entero de 32 bits en crudo en vez de un decimal
 * entre 0 y 1.
 *
 * Que devuelva enteros no es un detalle: de aquí salen importes, y en este
 * proyecto un importe no pasa por un float ni de camino (regla 3 de CLAUDE.md).
 * Con semilla fija, la misma llamada produce siempre la misma base de datos.
 */
function randomSequence(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return (t ^ (t >>> 14)) >>> 0
  }
}

/** Un entero de céntimos en `[min, max]`, ambos incluidos. */
function centsBetween(next: () => number, min: number, max: number): number {
  return min + (next() % (max - min + 1))
}

/** La semilla. Cualquier número sirve; que sea fijo es lo que importa. */
const SEED = 0x5eed_1a05

// ---------------------------------------------------------------------------
// El guion del mes
// ---------------------------------------------------------------------------

/** Importe fijo en céntimos, o el rango del que se sortea uno. */
type Amount = number | readonly [min: number, max: number]

function amountOf(amount: Amount, next: () => number): number {
  return typeof amount === 'number' ? amount : centsBetween(next, amount[0], amount[1])
}

type Norma43Recipe = {
  /** Día del mes. Se recorta al último si el mes es más corto. */
  readonly day: number
  readonly amountCents: Amount
  /** Primera mitad del registro 23: el tipo de operación, como lo escribe el banco. */
  readonly first: string
  /** Segunda mitad: el texto libre. Es lo que da juego al motor de reglas. */
  readonly second: string
}

/**
 * El mes de la cuenta de Unicaja.
 *
 * La Norma 43 no distingue contraparte de concepto (ADR-010), así que todo esto
 * acaba en `description` y `counterparty` queda a `null`. Por eso las reglas de
 * esta cuenta van contra `description`.
 */
const UNICAJA_MONTH: readonly Norma43Recipe[] = [
  { day: 1, amountCents: -79_500, first: 'RECIBO DOMICILIADO', second: 'ALQUILER VIVIENDA' },
  {
    day: 3,
    amountCents: [-7_460, -1_820],
    first: 'COMPRA TARJETA',
    second: 'SUPERMERCADO EJEMPLO',
  },
  {
    day: 5,
    amountCents: [-8_940, -4_130],
    first: 'RECIBO DOMICILIADO',
    second: 'ELECTRICA EJEMPLO SA',
  },
  { day: 7, amountCents: [-7_050, -4_480], first: 'COMPRA TARJETA', second: 'GASOLINERA EJEMPLO' },
  { day: 8, amountCents: [-3_910, -2_240], first: 'RECIBO DOMICILIADO', second: 'AGUA EJEMPLO SA' },
  {
    day: 9,
    amountCents: [-6_320, -2_150],
    first: 'COMPRA TARJETA',
    second: 'SUPERMERCADO EJEMPLO',
  },
  { day: 10, amountCents: -3_990, first: 'RECIBO DOMICILIADO', second: 'FIBRA Y MOVIL EJEMPLO' },
  { day: 12, amountCents: -2_845, first: 'RECIBO DOMICILIADO', second: 'SEGURO HOGAR EJEMPLO' },
  { day: 14, amountCents: [-4_180, -930], first: 'COMPRA TARJETA', second: 'FARMACIA EJEMPLO' },
  {
    day: 16,
    amountCents: [-8_770, -2_640],
    first: 'COMPRA TARJETA',
    second: 'SUPERMERCADO EJEMPLO',
  },
  // Sin patrón reconocible: es lo que llena la bandeja de «sin categorizar».
  { day: 19, amountCents: [-4_500, -1_100], first: 'BIZUM ENVIADO', second: 'REF 4471' },
  { day: 21, amountCents: [-6_890, -4_310], first: 'COMPRA TARJETA', second: 'GASOLINERA EJEMPLO' },
  {
    day: 22,
    amountCents: [-5_940, -1_960],
    first: 'COMPRA TARJETA',
    second: 'SUPERMERCADO EJEMPLO',
  },
  { day: 23, amountCents: [-3_200, -800], first: 'ADEUDO', second: 'PLATAFORMA XZ' },
  { day: 25, amountCents: 215_000, first: 'TRANSFERENCIA A SU FAVOR', second: 'NOMINA MENSUAL' },
  {
    day: 27,
    amountCents: [-7_110, -2_380],
    first: 'COMPRA TARJETA',
    second: 'SUPERMERCADO EJEMPLO',
  },
  { day: 28, amountCents: -300, first: 'COMISION MANTENIMIENTO', second: 'CUENTA CORRIENTE' },
]

type RevolutRecipe = {
  readonly day: number
  readonly amountCents: Amount
  /** Columna `Tipo`. Va a `description` en el movimiento normalizado (ADR-011). */
  readonly type: string
  /** Columna `Descripción`. Va a `counterparty`. */
  readonly description: string
  /** Ausente = euros. Otra divisa es otro bolsillo, con su propia cadena de saldos. */
  readonly currency?: string
}

/** El mes de la cuenta de Revolut. Aquí sí hay contraparte, así que las reglas van a ella. */
const REVOLUT_MONTH: readonly RevolutRecipe[] = [
  { day: 2, amountCents: -1_299, type: 'Pago con tarjeta', description: 'Streaming Ejemplo' },
  { day: 4, amountCents: -1_099, type: 'Pago con tarjeta', description: 'Musica Ejemplo' },
  {
    day: 6,
    amountCents: [-4_260, -1_140],
    type: 'Pago con tarjeta',
    description: 'Restaurante Ejemplo',
  },
  { day: 11, amountCents: [-8_950, -2_390], type: 'Pago con tarjeta', description: 'Ropa Ejemplo' },
  {
    day: 13,
    amountCents: [-3_180, -960],
    type: 'Pago con tarjeta',
    description: 'Restaurante Ejemplo',
  },
  // Multidivisa: bolsillos distintos, cada uno con su cadena de saldos (ADR-011).
  {
    day: 15,
    amountCents: [-5_500, -1_500],
    type: 'Pago con tarjeta',
    description: 'Tienda Online Ejemplo',
    currency: 'USD',
  },
  {
    day: 17,
    amountCents: [-3_900, -1_200],
    type: 'Pago con tarjeta',
    description: 'Libreria Ejemplo',
    currency: 'GBP',
  },
  {
    day: 20,
    amountCents: [-2_740, -880],
    type: 'Pago con tarjeta',
    description: 'Restaurante Ejemplo',
  },
  { day: 24, amountCents: -150, type: 'Cambio de divisa', description: 'Comision de cambio' },
  // Sin patrón reconocible, igual que el bizum de Unicaja.
  { day: 26, amountCents: [-2_600, -700], type: 'Pago con tarjeta', description: 'Pago QR 8842' },
]

// ---------------------------------------------------------------------------
// Las transferencias internas
// ---------------------------------------------------------------------------

/** Día del mes en que sale el traspaso a Revolut. */
const TRANSFER_DAY = 18

/**
 * Un importe distinto por mes, y a propósito.
 *
 * El matcher de `packages/core` agrupa candidatos por divisa e importe absoluto
 * y descarta los grupos ambiguos (ADR-013: mejor mutuo **e inequívoco**). Dos
 * traspasos del mismo importe dentro de la ventana de tres días dejarían los
 * cuatro movimientos sin emparejar, y la base de desarrollo enseñaría un caso
 * borde en vez del caso normal. Los importes redondos también separan estos
 * movimientos del resto, que van sorteados y nunca caen en una cifra así.
 */
const TRANSFER_AMOUNTS_CENTS = [20_000, 25_000, 18_000] as const

/**
 * Los textos nombran a la otra cuenta, que es la señal que vale +2 puntos.
 * Ninguna regla de la semilla casa con ellos: hasta que exista el módulo
 * `ledger`, las patas de una transferencia se quedan sin categoría, que es
 * exactamente lo que son —ni gasto ni ingreso—.
 */
const TRANSFER_OUT = { first: 'TRANSF.SEPA EMITIDA', second: 'TRASPASO A REVOLUT' } as const
const TRANSFER_IN = { type: 'Transferencia', description: 'Transferencia de Unicaja' } as const

// ---------------------------------------------------------------------------
// Saldos de apertura
// ---------------------------------------------------------------------------

/**
 * Saldo de cada cuenta justo antes del primer movimiento sembrado.
 *
 * El mismo número va a `accounts.opening_balance_cents` y a la cabecera del
 * extracto, para que el invariante 6 cuadre: saldo = apertura + Σ movimientos.
 */
export const UNICAJA_OPENING_BALANCE_CENTS = 250_000
export const REVOLUT_OPENING_BALANCE_CENTS = 15_000

/** Cuántos meses cubre la semilla (docs/DATA_MODEL.md, «Semilla de desarrollo»). */
export const SEED_MONTHS = 3

// ---------------------------------------------------------------------------
// El generador
// ---------------------------------------------------------------------------

export type SyntheticSeedOptions = {
  /** Último día sembrado, ISO `YYYY-MM-DD`. Nada posterior entra en los ficheros. */
  readonly endDate: string
}

export type SyntheticSeed = {
  /** Primer y último día que cubren los extractos. */
  readonly period: { readonly from: string; readonly to: string }
  readonly unicaja: SyntheticNorma43Statement
  readonly revolut: SyntheticRevolutStatement
  /** Traspasos que el matcher debería emparejar. Los tests comprueban que salen todos. */
  readonly transferCount: number
}

/**
 * El extracto de las dos cuentas para los `SEED_MONTHS` meses que acaban en
 * `endDate`.
 *
 * El mes en curso se corta en `endDate`: un extracto que trajera movimientos de
 * pasado mañana sería lo primero que delataría que la base es de mentira.
 */
export function syntheticSeed({ endDate }: SyntheticSeedOptions): SyntheticSeed {
  const next = randomSequence(SEED)

  const [endYear, endMonth] = endDate.split('-').map(Number)
  if (endYear === undefined || endMonth === undefined) {
    throw new Error(`La fecha final de la semilla no es una fecha ISO: «${endDate}»`)
  }

  const months: CalendarMonth[] = []
  for (let offset = SEED_MONTHS - 1; offset >= 0; offset -= 1) {
    months.push(shiftMonth({ year: endYear, month: endMonth }, -offset))
  }
  const first = months[0]
  if (first === undefined) throw new Error('La semilla necesita cubrir al menos un mes')
  const from = isoOf(first.year, first.month, 1)

  const unicajaMovements: SyntheticNorma43Movement[] = []
  const revolutMovements: SyntheticRevolutMovement[] = []
  let transferCount = 0

  // Un solo recorrido, mes a mes y en orden de día, para que los dos ficheros
  // salgan cronológicos: el CSV de Revolut encadena saldos y los leería mal.
  months.forEach((month, index) => {
    const entries: { readonly date: string; readonly emit: () => void }[] = []

    for (const recipe of UNICAJA_MONTH) {
      const date = dayOf(month, recipe.day)
      const amountCents = amountOf(recipe.amountCents, next)
      entries.push({
        date,
        emit: () => {
          unicajaMovements.push({
            operationDate: norma43Date(date),
            amountCents,
            concepts: [{ first: recipe.first, second: recipe.second }],
          })
        },
      })
    }

    for (const recipe of REVOLUT_MONTH) {
      const date = dayOf(month, recipe.day)
      const amountCents = amountOf(recipe.amountCents, next)
      entries.push({
        date,
        emit: () => {
          revolutMovements.push({
            type: recipe.type,
            startedAt: revolutTimestamp(date, '09:14:03'),
            completedAt: revolutTimestamp(date, '09:14:07'),
            description: recipe.description,
            amountCents,
            ...(recipe.currency === undefined ? {} : { currency: recipe.currency }),
          })
        },
      })
    }

    const transferAmount = TRANSFER_AMOUNTS_CENTS[index % TRANSFER_AMOUNTS_CENTS.length]
    if (transferAmount !== undefined) {
      const date = dayOf(month, TRANSFER_DAY)
      entries.push({
        date,
        emit: () => {
          transferCount += 1
          unicajaMovements.push({
            operationDate: norma43Date(date),
            amountCents: -transferAmount,
            concepts: [{ first: TRANSFER_OUT.first, second: TRANSFER_OUT.second }],
          })
          revolutMovements.push({
            type: TRANSFER_IN.type,
            startedAt: revolutTimestamp(date, '11:02:00'),
            completedAt: revolutTimestamp(date, '11:02:31'),
            description: TRANSFER_IN.description,
            amountCents: transferAmount,
          })
        },
      })
    }

    for (const entry of entries.sort((a, b) => a.date.localeCompare(b.date))) {
      if (entry.date > endDate) continue
      entry.emit()
    }
  })

  return {
    period: { from, to: endDate },
    unicaja: {
      account: '0000000001',
      accountName: 'TITULAR EJEMPLO',
      startDate: norma43Date(from),
      endDate: norma43Date(endDate),
      openingBalanceCents: UNICAJA_OPENING_BALANCE_CENTS,
      movements: unicajaMovements,
    },
    revolut: {
      openingBalanceCents: REVOLUT_OPENING_BALANCE_CENTS,
      movements: revolutMovements,
    },
    transferCount,
  }
}
