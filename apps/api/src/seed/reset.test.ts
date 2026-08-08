/**
 * Todos los datos de este fichero son inventados.
 */
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isDevDatabase, resetDevDatabase, UnsafeResetError } from './reset'

describe('isDevDatabase', () => {
  it('reconoce las bases de desarrollo', () => {
    expect(isDevDatabase('.dev/dev.db')).toBe(true)
    expect(isDevDatabase('apps/api/.dev/dev.db')).toBe(true)
  })

  it('no reconoce nada de fuera de .dev/', () => {
    expect(isDevDatabase('finanzas.db')).toBe(false)
    expect(isDevDatabase('data/finanzas.db')).toBe(false)
    // `.development/` no es `.dev/`: la comparación es de segmento, no de prefijo.
    expect(isDevDatabase('.development/dev.db')).toBe(false)
  })
})

describe('resetDevDatabase', () => {
  it('borra la base y los ficheros que SQLite deja al lado', () => {
    const root = mkdtempSync(join(tmpdir(), 'finanzas-reset-'))
    const dir = join(root, '.dev')
    mkdirSync(dir)

    const path = join(dir, 'dev.db')
    for (const suffix of ['', '-wal', '-shm']) writeFileSync(`${path}${suffix}`, '')

    resetDevDatabase(path)

    for (const suffix of ['', '-wal', '-shm']) expect(existsSync(`${path}${suffix}`)).toBe(false)
  })

  it('no protesta si la base todavía no existe', () => {
    const root = mkdtempSync(join(tmpdir(), 'finanzas-reset-'))
    const dir = join(root, '.dev')
    mkdirSync(dir)

    expect(() => resetDevDatabase(join(dir, 'dev.db'))).not.toThrow()
  })

  it('se niega a borrar fuera de .dev/, que es donde está la base de verdad', () => {
    expect(() => resetDevDatabase('finanzas.db')).toThrow(UnsafeResetError)
  })
})
