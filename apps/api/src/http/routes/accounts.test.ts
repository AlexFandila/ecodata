/**
 * Todos los datos de este fichero son inventados: ni cuentas, ni IBANes, ni
 * importes corresponden a nada real.
 */
import { accountListResponseSchema, accountSchema, errorResponseSchema } from '@finanzas/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../../db/client'
import { createTestDb, insertAccount } from '../../db/testing'
import { createApp } from '../app'

let db: Db
let app: ReturnType<typeof createApp>

beforeEach(() => {
  db = createTestDb()
  app = createApp(db)
})

/** `POST /accounts` con el cuerpo indicado, ya serializado. */
function post(body: unknown) {
  return app.request('/accounts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('GET /accounts', () => {
  it('devuelve la lista vacía y no un array pelado', async () => {
    const response = await app.request('/accounts')

    expect(response.status).toBe(200)
    // Si la respuesta se saliera del contrato, el parse lanzaría aquí.
    const body = accountListResponseSchema.parse(await response.json())
    expect(body.accounts).toEqual([])
  })

  it('ordena por nombre, no por orden de creación', async () => {
    insertAccount(db, { name: 'Revolut personal', provider: 'revolut', type: 'card' })
    insertAccount(db, { name: 'Cuenta corriente', provider: 'unicaja', type: 'checking' })

    const response = await app.request('/accounts')
    const body = accountListResponseSchema.parse(await response.json())

    expect(body.accounts.map((account) => account.name)).toEqual([
      'Cuenta corriente',
      'Revolut personal',
    ])
  })

  it('saca createdAt como instante ISO 8601 y no como epoch', async () => {
    insertAccount(db)

    const response = await app.request('/accounts')
    const body = accountListResponseSchema.parse(await response.json())

    expect(body.accounts[0]?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/)
  })
})

describe('POST /accounts', () => {
  it('crea con lo mínimo y aplica los valores por defecto del contrato', async () => {
    const response = await post({
      name: 'Cuenta de nómina',
      provider: 'unicaja',
      type: 'checking',
      currency: 'EUR',
    })

    expect(response.status).toBe(201)
    const body = accountSchema.parse(await response.json())
    expect(body).toMatchObject({
      name: 'Cuenta de nómina',
      provider: 'unicaja',
      type: 'checking',
      currency: 'EUR',
      iban: null,
      isOwn: true,
      openingBalanceCents: 0,
    })

    // Y queda listada: el alta sirve para lo que se creó.
    const listed = accountListResponseSchema.parse(await (await app.request('/accounts')).json())
    expect(listed.accounts).toHaveLength(1)
  })

  it('normaliza el IBAN a mayúsculas', async () => {
    const response = await post({
      name: 'Cuenta con IBAN',
      provider: 'manual',
      type: 'savings',
      currency: 'EUR',
      // Inventado y deliberadamente no español: el hook pre-commit rechaza
      // cualquier `ES` + 22 dígitos en lo staged, y aquí el país da igual —
      // lo que se prueba es que la forma se normaliza a mayúsculas.
      iban: 'de89370400440532013000',
    })

    const body = accountSchema.parse(await response.json())
    expect(body.iban).toBe('DE89370400440532013000')
  })

  it('rechaza un proveedor inventado señalando el campo', async () => {
    const response = await post({
      name: 'Cuenta rara',
      provider: 'banco_inventado',
      type: 'checking',
      currency: 'EUR',
    })

    expect(response.status).toBe(400)
    const body = errorResponseSchema.parse(await response.json())
    expect(body.error.code).toBe('validation_error')
    expect(body.error.details?.map((detail) => detail.path)).toContain('provider')
  })

  it('rechaza un cuerpo que no es JSON', async () => {
    const response = await post('esto no es json')

    expect(response.status).toBe(400)
    const body = errorResponseSchema.parse(await response.json())
    expect(body.error.code).toBe('validation_error')
  })
})
