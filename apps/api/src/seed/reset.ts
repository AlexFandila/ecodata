/**
 * Borrado de la base de desarrollo para `pnpm seed --reset`.
 *
 * Vive aparte del CLI para poder probarlo: un fichero que se ejecuta al
 * importarlo no se puede testear sin borrar algo por el camino.
 *
 * La guarda es el motivo de que esto sea un módulo y no tres líneas sueltas.
 * `DB_PATH` es una variable de entorno, así que la ruta que llega aquí puede ser
 * cualquiera —incluida la base de producción del usuario, que en este proyecto
 * es un fichero suelto en un servidor (ADR-003) y no tiene copia más que la del
 * script de backup—. Un borrado solo se permite dentro de `.dev/`, que es la
 * carpeta git-ignored de desarrollo; contra cualquier otra ruta, esto se niega.
 */
import { rmSync } from 'node:fs'
import { resolve, sep } from 'node:path'

/** Los ficheros que SQLite deja al lado de la base cuando va en modo WAL. */
const SIDECARS = ['', '-wal', '-shm'] as const

export class UnsafeResetError extends Error {
  constructor(path: string) {
    super(
      `--reset solo borra bases de desarrollo dentro de .dev/, y DB_PATH apunta a «${path}». ` +
        'Si de verdad querías borrar esa base, hazlo a mano.',
    )
    this.name = 'UnsafeResetError'
  }
}

/** `true` si la ruta cae dentro de una carpeta `.dev/`. */
export function isDevDatabase(path: string): boolean {
  return resolve(path).includes(`${sep}.dev${sep}`)
}

/**
 * Borra la base de desarrollo y sus ficheros auxiliares. No falla si no existen:
 * `--reset` sobre una base que aún no está es una petición ya cumplida.
 */
export function resetDevDatabase(path: string): void {
  if (!isDevDatabase(path)) throw new UnsafeResetError(path)

  const full = resolve(path)
  for (const suffix of SIDECARS) rmSync(`${full}${suffix}`, { force: true })
}
