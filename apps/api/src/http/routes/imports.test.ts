/**
 * Todos los datos de este fichero son inventados: ni cuentas, ni comercios, ni
 * importes corresponden a nada real.
 */
import { errorResponseSchema, importResultResponseSchema } from '@finanzas/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../../db/client'
import { transactions } from '../../db/schema'
import { createTestDb, insertAccount, insertCategory, insertRule } from '../../db/testing'
import {
  norma43Bytes,
  type SyntheticNorma43Movement as SyntheticMovement,
} from '../../modules/ingest/index'
import { createApp } from '../app'

let db: Db
let app: ReturnType<typeof createApp>
let accountId: number

beforeEach(() => {
  db = createTestDb()
  app = createApp(db)
  accountId = insertAccount(db)
})

const MOVIMIENTOS: readonly SyntheticMovement[] = [
  { amountCents: -4550, operationDate: '260315' },
  { amountCents: 120_000, operationDate: '260316' },
]

/** Un fichero sintético listo para adjuntar al formulario. */
function n43File(movements: readonly SyntheticMovement[] = MOVIMIENTOS, name = 'extracto.n43') {
  return new File([norma43Bytes({ movements })], name)
}

/** `POST /imports` con los campos indicados. `undefined` omite el campo. */
function post(fields: Record<string, string | File | undefined>) {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) form.append(key, value)
  }
  return app.request('/imports', { method: 'POST', body: form })
}

describe('POST /imports · el camino feliz', () => {
  it('responde 201 con el contrato de shared', async () => {
    const response = await post({
      file: n43File(),
      accountId: String(accountId),
      source: 'norma43',
    })

    expect(response.status).toBe(201)
    // Si la respuesta se saliera del contrato, el parse lanzaría aquí.
    const body = importResultResponseSchema.parse(await response.json())
    expect(body).toMatchObject({
      accountId,
      source: 'norma43',
      fileName: 'extracto.n43',
      stats: { read: 2, inserted: 2, duplicated: 0, errors: 0 },
      rowErrors: [],
    })
  })

  it('usa el nombre del fichero subido cuando no viene el campo fileName', async () => {
    const response = await post({
      file: n43File(MOVIMIENTOS, 'marzo.n43'),
      accountId: String(accountId),
      source: 'norma43',
    })

    const body = importResultResponseSchema.parse(await response.json())
    expect(body.fileName).toBe('marzo.n43')
  })

  it('deja mandar un fileName distinto del nombre del fichero', async () => {
    const response = await post({
      file: n43File(),
      accountId: String(accountId),
      source: 'norma43',
      fileName: 'Extracto de marzo',
    })

    const body = importResultResponseSchema.parse(await response.json())
    expect(body.fileName).toBe('Extracto de marzo')
  })

  it('subir dos veces el mismo fichero no duplica movimientos', async () => {
    const campos = { accountId: String(accountId), source: 'norma43' }
    await post({ ...campos, file: n43File() })
    const segunda = await post({ ...campos, file: n43File() })

    const body = importResultResponseSchema.parse(await segunda.json())
    expect(body.stats).toMatchObject({ inserted: 0, duplicated: 2 })
  })
})

describe('POST /imports · peticiones mal formadas', () => {
  it('400 si no viene el fichero', async () => {
    const response = await post({ accountId: String(accountId), source: 'norma43' })

    expect(response.status).toBe(400)
    const body = errorResponseSchema.parse(await response.json())
    expect(body.error.code).toBe('validation_error')
    expect(body.error.details?.[0]?.path).toBe('file')
  })

  it('400 si el fichero está vacío', async () => {
    const response = await post({
      file: new File([], 'vacio.n43'),
      accountId: String(accountId),
      source: 'norma43',
    })

    expect(response.status).toBe(400)
  })

  it('400 si el source no es un adaptador conocido', async () => {
    const response = await post({
      file: n43File(),
      accountId: String(accountId),
      source: 'banco_inventado',
    })

    expect(response.status).toBe(400)
    const body = errorResponseSchema.parse(await response.json())
    expect(body.error.code).toBe('validation_error')
    expect(body.error.details?.map((d) => d.path)).toContain('source')
  })

  it('400 si el accountId no es un id', async () => {
    const response = await post({ file: n43File(), accountId: 'no-soy-un-id', source: 'norma43' })

    expect(response.status).toBe(400)
    const body = errorResponseSchema.parse(await response.json())
    expect(body.error.code).toBe('validation_error')
  })

  it('400 si el cuerpo no es un formulario multipart', async () => {
    const response = await app.request('/imports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId, source: 'norma43' }),
    })

    expect(response.status).toBe(400)
    errorResponseSchema.parse(await response.json())
  })
})

describe('POST /imports · lo que sí llega al pipeline pero falla', () => {
  it('404 si la cuenta no existe', async () => {
    const response = await post({ file: n43File(), accountId: '9999', source: 'norma43' })

    expect(response.status).toBe(404)
    const body = errorResponseSchema.parse(await response.json())
    expect(body.error.code).toBe('not_found')
  })

  it('422 si el fichero no es del formato que dice ser', async () => {
    const response = await post({
      file: new File([new TextEncoder().encode('esto no es un cuaderno 43')], 'cualquiera.txt'),
      accountId: String(accountId),
      source: 'norma43',
    })

    expect(response.status).toBe(422)
    const body = errorResponseSchema.parse(await response.json())
    expect(body.error.code).toBe('unsupported_format')
    // El mensaje del adaptador sale tal cual: dice qué le pasa al fichero.
    expect(body.error.message.length).toBeGreaterThan(0)
  })

  it('422 si el extracto no cuadra consigo mismo', async () => {
    const bytes = norma43Bytes({
      movements: [{ amountCents: -4550 }],
      footer: { debitTotalCents: 999_999 },
    })
    const response = await post({
      file: new File([bytes], 'truncado.n43'),
      accountId: String(accountId),
      source: 'norma43',
    })

    expect(response.status).toBe(422)
  })
})

describe('POST /imports · categorización', () => {
  /** Un extracto de un solo movimiento con el concepto que se le indique. */
  function extractoCon(concepto: string) {
    return new File(
      [norma43Bytes({ movements: [{ amountCents: -4550, concepts: [{ first: concepto }] }] })],
      'marzo.n43',
    )
  }

  it('los movimientos importados salen ya categorizados si hay regla que case', async () => {
    // Es el paso 1 del pipeline de categorización de DATA_MODEL.md, orquestado
    // por la ruta: importar y, con lo importado, aplicar las reglas.
    const categoryId = insertCategory(db, { slug: 'groceries', name: 'Supermercado' })
    insertRule(db, { categoryId, field: 'description', pattern: 'SUPERMERCADO' })

    const response = await post({
      file: extractoCon('SUPERMERCADO EJEMPLO'),
      accountId: String(accountId),
      source: 'norma43',
    })

    expect(response.status).toBe(201)
    const fila = db
      .select({ categoryId: transactions.categoryId, categorySource: transactions.categorySource })
      .from(transactions)
      .get()
    expect(fila).toEqual({ categoryId, categorySource: 'rule' })
  })

  it('lo que no casa con ninguna regla entra a la bandeja de pendientes', async () => {
    const categoryId = insertCategory(db, { slug: 'groceries', name: 'Supermercado' })
    insertRule(db, { categoryId, field: 'description', pattern: 'SUPERMERCADO' })

    await post({
      file: extractoCon('FARMACIA EJEMPLO'),
      accountId: String(accountId),
      source: 'norma43',
    })

    const fila = db
      .select({ categoryId: transactions.categoryId, categorySource: transactions.categorySource })
      .from(transactions)
      .get()
    expect(fila).toEqual({ categoryId: null, categorySource: null })
  })

  it('una regla con el patrón roto no impide importar', async () => {
    const categoryId = insertCategory(db, { slug: 'groceries', name: 'Supermercado' })
    insertRule(db, { categoryId, field: 'description', matchType: 'regex', pattern: '(sin cerrar' })

    const response = await post({
      file: extractoCon('SUPERMERCADO EJEMPLO'),
      accountId: String(accountId),
      source: 'norma43',
    })

    expect(response.status).toBe(201)
    const body = importResultResponseSchema.parse(await response.json())
    expect(body.stats.inserted).toBe(1)
  })
})
