/**
 * Contratos del proyecto: todo lo que cruza una frontera —cuerpos HTTP, filas
 * normalizadas de importación y, en la Fase 3, resultados de herramientas MCP—
 * se define aquí con zod, y su tipo de TypeScript se deriva con `z.infer`,
 * nunca se escribe a mano en paralelo.
 *
 * `packages/shared` es la hoja del grafo de dependencias: no importa de
 * `packages/core` ni de las apps (regla `shared-is-leaf` de dependency-cruiser).
 * Eso es lo que le permite ser el punto de encuentro entre la base de datos, la
 * API, la PWA y el servidor MCP sin arrastrar a ninguno hacia los demás.
 *
 * Convenciones que siguen todos los contratos (ver ADR-009):
 *
 * - **Dinero**: `amountCents` entero + `currency` ISO 4217, como campos
 *   hermanos. Nunca floats, nunca importes sin divisa.
 * - **Fechas de calendario** en texto ISO `YYYY-MM-DD`; **instantes** en ISO
 *   8601 UTC, aunque la base los guarde como epoch en milisegundos.
 * - **Las respuestas son objetos con clave nombrada**, nunca arrays pelados:
 *   así admiten metadatos nuevos sin romper a quien ya las lee.
 * - **Lo interno no sale**: `raw`, `sourceHash` y `deletedAt` no aparecen en
 *   ninguna respuesta de la API.
 *
 * Este fichero es solo el índice: no define nada.
 */

export * from './accounts'
export * from './enums'
export * from './errors'
export * from './health'
export * from './imports'
export * from './normalized-transaction'
export * from './primitives'
export * from './transactions'
