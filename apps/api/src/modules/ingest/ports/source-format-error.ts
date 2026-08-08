/**
 * El fichero no es lo que dice ser: la mitad "aborta el import" del contrato de
 * errores del puerto (`SourceReadResult` lleva la otra mitad, la de la fila
 * suelta ilegible).
 *
 * Es una clase abstracta común y no dos clases sueltas porque el borde HTTP
 * tiene que traducir esto a una respuesta, y con dos `instanceof` sueltos el
 * `EnableBankingAdapter` de la Fase 4 se olvidaría de la lista y sus errores de
 * formato acabarían saliendo como un 500 genérico. Extendiéndola, un adaptador
 * nuevo entra en el mapeo por el mero hecho de existir, que es lo que ADR-006
 * pide de este tipo de reglas.
 *
 * Vive en `ports/` y no en un `errors.ts` del módulo porque forma parte del
 * puerto: es lo que un `TransactionSource` promete lanzar.
 */
export abstract class SourceFormatError extends Error {}
