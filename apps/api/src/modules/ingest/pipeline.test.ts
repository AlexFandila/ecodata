/**
 * Todos los datos de este fichero son inventados: ni cuentas, ni comercios, ni
 * importes corresponden a nada real.
 */
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../../db/client'
import { imports, transactions } from '../../db/schema'
import { createTestDb, insertAccount } from '../../db/testing'
import { Norma43FormatError } from './adapters/norma43/errors'
import { norma43Bytes, type SyntheticMovement } from './adapters/norma43/testing'
import { revolutCsvBytes } from './adapters/revolut-csv/testing'
import { AccountNotFoundError } from './errors'
import { runImport } from './pipeline'

let db: Db
let accountId: number

beforeEach(() => {
  db = createTestDb()
  accountId = insertAccount(db)
})

/** Un extracto Norma 43 sintético con los movimientos indicados. */
const n43 = (movements: readonly SyntheticMovement[]) => norma43Bytes({ movements })

/** Importa un cuaderno 43 en la cuenta de la prueba. */
function importN43(
  movements: readonly SyntheticMovement[],
  overrides: { accountId?: number } = {},
) {
  return runImport(db, {
    accountId: overrides.accountId ?? accountId,
    source: 'norma43',
    fileName: 'extracto.n43',
    bytes: n43(movements),
  })
}

/** Las filas vivas de `transactions`, en orden de inserción. */
const storedTransactions = () => db.select().from(transactions).all()

const storedImports = () => db.select().from(imports).all()

describe('runImport · el camino feliz', () => {
  it('persiste los movimientos y deja constancia en imports', () => {
    const outcome = importN43([{ amountCents: -4550 }, { amountCents: 120_000 }])

    expect(outcome.stats).toEqual({ read: 2, inserted: 2, duplicated: 0, errors: 0 })
    expect(outcome.rowErrors).toEqual([])

    const fila = storedImports()
    expect(fila).toHaveLength(1)
    expect(fila[0]).toMatchObject({
      id: outcome.importId,
      accountId,
      source: 'norma43',
      fileName: 'extracto.n43',
      stats: outcome.stats,
    })

    const movimientos = storedTransactions()
    expect(movimientos).toHaveLength(2)
    expect(movimientos.map((m) => m.amountCents)).toEqual([-4550, 120_000])
    for (const movimiento of movimientos) {
      expect(movimiento.accountId).toBe(accountId)
      expect(movimiento.importId).toBe(outcome.importId)
      expect(movimiento.sourceHash).toMatch(/^[0-9a-f]{64}$/)
    }
  })

  it('cuadra la aritmética de stats: read = inserted + duplicated + errors', () => {
    const { stats } = importN43([{ amountCents: -100 }, { amountCents: -200 }])

    expect(stats.read).toBe(stats.inserted + stats.duplicated + stats.errors)
  })

  it('deja los movimientos listos para las etapas siguientes del pipeline', () => {
    // Categorizar y emparejar transferencias son tareas posteriores: lo que
    // esperan encontrar es exactamente esto.
    importN43([{ amountCents: -4550 }])

    expect(storedTransactions()[0]).toMatchObject({
      categoryId: null,
      categorySource: null,
      transferId: null,
      deletedAt: null,
    })
  })

  it('conserva la fila original intacta (invariante 4)', () => {
    importN43([{ amountCents: -4550, reference1: 'REF-EJEMPLO1' }])

    const raw = storedTransactions()[0]?.raw as Record<string, unknown>
    expect(raw).toMatchObject({ entidad: expect.any(String), fechaOperacion: expect.any(String) })
    expect(JSON.stringify(raw)).toContain('REF-EJEMPLO1')
  })
})

describe('runImport · idempotencia (invariante 1)', () => {
  const extracto: readonly SyntheticMovement[] = [
    { amountCents: -4550, operationDate: '260315' },
    { amountCents: 120_000, operationDate: '260316' },
    { amountCents: -1200, operationDate: '260317' },
  ]

  it('reimportar el mismo fichero no duplica nada', () => {
    importN43(extracto)
    const segundo = importN43(extracto)

    expect(segundo.stats).toMatchObject({ read: 3, inserted: 0, duplicated: 3, errors: 0 })
    expect(storedTransactions()).toHaveLength(3)
  })

  it('deja constancia del segundo intento aunque no inserte nada', () => {
    importN43(extracto)
    importN43(extracto)

    // El import ocurrió: se leyó un fichero y se comprobó que ya estaba. Que no
    // insertara nada es el resultado, no un motivo para no registrarlo.
    expect(storedImports()).toHaveLength(2)
  })

  it('un fichero solapado solo aporta lo nuevo', () => {
    importN43(extracto)

    const solapado = importN43([...extracto, { amountCents: -7700, operationDate: '260318' }])

    expect(solapado.stats).toMatchObject({ read: 4, inserted: 1, duplicated: 3 })
    expect(storedTransactions()).toHaveLength(4)
  })

  it('un fichero parcial no vuelve a insertar lo que ya estaba', () => {
    importN43(extracto)

    const parcial = importN43(extracto.slice(0, 2))

    expect(parcial.stats).toMatchObject({ read: 2, inserted: 0, duplicated: 2 })
    expect(storedTransactions()).toHaveLength(3)
  })

  it('el mismo fichero en dos cuentas distintas se importa dos veces', () => {
    // La cuenta forma parte de la identidad del movimiento: el mismo apunte en
    // dos cuentas son dos movimientos.
    const otra = insertAccount(db, { name: 'Otra cuenta de prueba' })

    importN43(extracto)
    const segunda = importN43(extracto, { accountId: otra })

    expect(segunda.stats).toMatchObject({ inserted: 3, duplicated: 0 })
    expect(storedTransactions()).toHaveLength(6)
  })
})

describe('runImport · movimientos legítimamente idénticos (ADR-012)', () => {
  // Dos cafés de 2,50 € el mismo día: mismo importe, misma fecha, y en un
  // cuaderno 43 ni contraparte ni concepto que los separen.
  const dosIguales: readonly SyntheticMovement[] = [
    { amountCents: -250, operationDate: '260315' },
    { amountCents: -250, operationDate: '260315' },
  ]

  it('importa los dos en vez de tomar el segundo por duplicado', () => {
    const outcome = importN43(dosIguales)

    expect(outcome.stats).toMatchObject({ read: 2, inserted: 2, duplicated: 0 })
    expect(storedTransactions()).toHaveLength(2)
  })

  it('y aun así reimportar el fichero sigue sin duplicar', () => {
    importN43(dosIguales)
    const segundo = importN43(dosIguales)

    expect(segundo.stats).toMatchObject({ inserted: 0, duplicated: 2 })
    expect(storedTransactions()).toHaveLength(2)
  })

  it('un tercer idéntico en un fichero posterior sí entra', () => {
    importN43(dosIguales)

    const conTercero = importN43([...dosIguales, { amountCents: -250, operationDate: '260315' }])

    expect(conTercero.stats).toMatchObject({ inserted: 1, duplicated: 2 })
    expect(storedTransactions()).toHaveLength(3)
  })
})

describe('runImport · multidivisa (ADR-011)', () => {
  it('no confunde dos movimientos iguales en divisas distintas', () => {
    // El caso del cambio de divisa: misma fecha, mismo importe y misma
    // descripción en dos bolsillos. Sin la divisa en el hash, el segundo
    // desaparecería del extracto.
    const bytes = revolutCsvBytes({
      movements: [
        { amountCents: -1000, currency: 'EUR', completedAt: '2026-05-01 10:00:00' },
        { amountCents: -1000, currency: 'USD', completedAt: '2026-05-01 10:00:00' },
      ],
    })

    const outcome = runImport(db, {
      accountId,
      source: 'revolut_csv',
      fileName: 'revolut.csv',
      bytes,
    })

    expect(outcome.stats).toMatchObject({ read: 2, inserted: 2, duplicated: 0 })
    expect(
      storedTransactions()
        .map((m) => m.currency)
        .sort(),
    ).toEqual(['EUR', 'USD'])
  })
})

describe('runImport · filas ilegibles', () => {
  it('importa el resto del extracto y reporta las que falló', () => {
    // Mes 13: la fecha de operación no se puede leer, pero el importe sí, así
    // que el fichero sigue cuadrando consigo mismo y solo cae esta fila.
    const outcome = importN43([
      { amountCents: -4550 },
      { amountCents: -100, operationDate: '261332' },
      { amountCents: -1200 },
    ])

    expect(outcome.rowErrors).toHaveLength(1)
    expect(outcome.rowErrors[0]?.row).toBe(2)
    expect(outcome.stats).toEqual({ read: 3, inserted: 2, duplicated: 0, errors: 1 })
    expect(storedTransactions()).toHaveLength(2)
  })
})

describe('runImport · lo que aborta la importación entera', () => {
  it('propaga el error de un fichero que no cuadra y no deja rastro', () => {
    const bytes = norma43Bytes({
      movements: [{ amountCents: -4550 }],
      // El registro 33 dice un total que no es el de los apuntes leídos: el
      // fichero está truncado o editado.
      footer: { debitTotalCents: 999_999 },
    })

    expect(() =>
      runImport(db, { accountId, source: 'norma43', fileName: 'roto.n43', bytes }),
    ).toThrow(Norma43FormatError)

    // La importación no ha ocurrido: `imports` es el registro de lo importado,
    // no un log de intentos.
    expect(storedImports()).toEqual([])
    expect(storedTransactions()).toEqual([])
  })

  it('rechaza una cuenta que no existe sin escribir nada', () => {
    expect(() => importN43([{ amountCents: -4550 }], { accountId: 9999 })).toThrow(
      AccountNotFoundError,
    )

    expect(storedImports()).toEqual([])
    expect(storedTransactions()).toEqual([])
  })
})

describe('runImport · un extracto sin movimientos importables', () => {
  it('se registra igual, con las cifras a cero', () => {
    const outcome = importN43([])

    expect(outcome.stats).toEqual({ read: 0, inserted: 0, duplicated: 0, errors: 0 })

    const fila = db.select().from(imports).where(eq(imports.id, outcome.importId)).get()
    expect(fila?.stats).toEqual(outcome.stats)
  })
})
