/**
 * Fechas de calendario: días sin hora ni zona horaria, como los guarda la base
 * (docs/DATA_MODEL.md, nota de implementación 2).
 *
 * Vive fuera de `matching` aunque nazca de él: la diferencia de días es
 * aritmética de calendario, no una regla del emparejamiento, y los agregados
 * mensuales del dashboard y el motor financiero la van a querer sin arrastrar
 * el matching detrás.
 */

export { daysBetween, isCalendarDate, tryDaysBetween } from './days'
export { CalendarDateError } from './errors'
