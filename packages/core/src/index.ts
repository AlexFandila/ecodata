/**
 * Dominio puro: sin IO (ni ficheros, ni red, ni base de datos). Recibe datos y
 * devuelve resultados. La regla la aplica dependency-cruiser en `pnpm lint`.
 *
 * Ya viven aquí `money` (importes en céntimos y divisa) y `dedupe` (la
 * identidad de un movimiento importado). El resto del dominio —matching de
 * transferencias, motor de reglas, motor financiero— entra en las fases 1 y 2.
 */

export * from './dedupe/index'
export * from './money/index'

export const CORE_VERSION = '0.0.0'

/**
 * Marca como inalcanzable una rama de un `switch` exhaustivo. Si algún día se
 * añade un caso al tipo y se olvida la rama, el compilador falla aquí en vez de
 * dejar pasar un `undefined` silencioso.
 */
export function assertNever(value: never, message = 'Caso no contemplado'): never {
  throw new Error(`${message}: ${JSON.stringify(value)}`)
}
