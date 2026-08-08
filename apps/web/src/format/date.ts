/**
 * Pintar una fecha contable.
 *
 * Las fechas de calendario del contrato son texto ISO `YYYY-MM-DD` sin hora ni
 * zona (ADR-009 punto 4), y aquí se mantienen así: se trocean a mano y se
 * formatean **en UTC**. Pasarlas por `new Date('2026-03-12')` y formatearlas en
 * la zona local las retrasa un día entero al oeste de Greenwich, que es
 * exactamente el desfase que DATA_MODEL.md evita guardándolas como texto: sería
 * absurdo reintroducirlo en el último paso.
 */

const DAY_MONTH = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

const FULL = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/

function toUtcDate(isoDay: string): Date | null {
  const parts = ISO_DAY.exec(isoDay)
  if (parts === null) return null

  return new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])))
}

/**
 * `'2026-03-12'` → `'12 mar'`. Para la lista, donde el año es casi siempre el
 * mismo y el ancho es de 390 px.
 *
 * Una fecha que no tenga la forma esperada se devuelve tal cual: la base la
 * garantiza con un `CHECK` y el contrato con `isoDateSchema`, así que si llega
 * otra cosa lo útil es verla, no esconderla tras un `—`.
 */
export function formatDay(isoDay: string): string {
  const date = toUtcDate(isoDay)
  return date === null ? isoDay : DAY_MONTH.format(date)
}

/** `'2026-03-12'` → `'12 de marzo de 2026'`. Para el detalle, donde sí cabe. */
export function formatFullDay(isoDay: string): string {
  const date = toUtcDate(isoDay)
  return date === null ? isoDay : FULL.format(date)
}
