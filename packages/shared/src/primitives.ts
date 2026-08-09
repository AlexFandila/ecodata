/**
 * Ladrillos de los contratos: las formas que se repiten en todos ellos.
 *
 * Definirlas una vez tiene un efecto práctico además del ahorro: cuando el día
 * de mañana haya que endurecer una validación —admitir otro formato de fecha,
 * subir un límite de longitud— se toca aquí y lo heredan todos los contratos a
 * la vez, en lugar de quedar la mitad al día y la mitad no.
 */
import { z } from 'zod'

/**
 * Fecha de calendario ISO `YYYY-MM-DD`, sin hora ni zona horaria: la fecha
 * contable de un movimiento (`bookedAt`, `valueDate`) y los extremos de un
 * filtro por fechas.
 *
 * Es deliberadamente más estricta que el `CHECK ... GLOB` de SQLite, que solo
 * mira la forma: aquí `2026-02-31` se rechaza porque ese día no existe, y
 * `2024-02-29` se acepta porque 2024 fue bisiesto. La base es la última red;
 * el contrato es la primera.
 */
export const isoDateSchema = z.iso.date()

/**
 * Mes de calendario ISO `YYYY-MM`, sin día: la unidad en la que el dashboard
 * agrega y navega.
 *
 * Es un tipo propio y no una fecha recortada porque un mes no tiene día, y
 * fingir que lo tiene (`'2026-03-01'`) obliga a todo el que lo lea a saber que
 * ese `01` no significa nada. La validación es la misma idea que la de
 * `isoDateSchema`: la forma no basta, `'2026-13'` se rechaza porque ese mes no
 * existe. Su aritmética —el rango de días del mes, el mes anterior— vive en
 * `packages/core/src/dates/months.ts`, que es donde puede tener tests.
 */
export const isoMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Se esperaba un mes ISO YYYY-MM')

/**
 * Instante en el tiempo, ISO 8601 en UTC (`2026-03-15T10:30:00Z`).
 *
 * La base guarda estos campos como epoch en milisegundos, que es lo correcto
 * para calcular; el contrato los expone como texto, que es lo correcto para
 * leer. La conversión entre ambos la hace el borde HTTP, que es su trabajo.
 */
export const isoDateTimeSchema = z.iso.datetime()

/**
 * Importe en la unidad mínima de la divisa (regla 3 de CLAUDE.md): entero, y
 * dentro del rango seguro de JavaScript. Es la misma condición que impone
 * `money()` en `packages/core`, escrita aquí porque `shared` no puede importar
 * de `core` y porque un contrato tiene que poder rechazar un float en la
 * frontera, antes de que llegue al dominio.
 *
 * El signo lleva el sentido del movimiento: negativo = cargo, positivo = abono.
 */
export const amountCentsSchema = z.int()

/** Como `amountCentsSchema`, pero para cantidades que no pueden ser negativas. */
export const nonNegativeIntSchema = z.int().nonnegative()

/**
 * Identificador de una fila: entero positivo, porque las claves primarias son
 * `INTEGER PRIMARY KEY AUTOINCREMENT` (nota 4 de DATA_MODEL.md). Un `0` o un
 * negativo no son ids que la base pueda haber emitido.
 */
export const entityIdSchema = z.int().positive()

/**
 * Texto libre que viene de un CSV: se recorta y se exige que quede algo.
 *
 * El recorte va antes de medir, así que `'   '` no pasa: una celda vacía o solo
 * con espacios no es una descripción, es la ausencia de una. Quien normaliza
 * debe traducirla a `null` explícitamente en vez de colar una cadena vacía que
 * luego ensucie el hash de deduplicación y los listados.
 */
export function trimmedText(maxLength: number) {
  return z.string().trim().min(1).max(maxLength)
}

/**
 * Fila original de la fuente, tal como venía (invariante 4: `raw` no se toca
 * nunca, para poder re-normalizar si mejora un parser).
 *
 * Un mapa de claves a valores JSON: cubre las columnas de un CSV, que son
 * cadenas, y la respuesta anidada de una API de Open Banking en la Fase 4. Se
 * exige que sea JSON de verdad porque acaba serializado en una columna
 * `text(mode: 'json')`: una función o un `undefined` se perderían en silencio.
 */
export const rawRecordSchema = z.record(z.string(), z.json())
export type RawRecord = z.infer<typeof rawRecordSchema>
