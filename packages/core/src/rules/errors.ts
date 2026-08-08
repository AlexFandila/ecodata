/**
 * Error de dominio del motor de reglas.
 *
 * Se lanza solo ante lo que siempre es un fallo de programación de quien llama:
 * dos reglas con el mismo id, dos movimientos con el mismo id, una prioridad
 * que no es un entero. Nada de esto puede salir de una consulta bien hecha, así
 * que falla fuerte y pronto (mismo criterio que ADR-006).
 *
 * Un patrón que no compila **no** entra aquí: eso sí puede estar guardado en la
 * base y se devuelve en `invalidRules` en vez de tumbar el lote (ADR-014
 * decisión 4).
 */
export class CategoryRulesError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CategoryRulesError'
  }
}
