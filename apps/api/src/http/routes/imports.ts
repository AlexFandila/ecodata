/**
 * `POST /imports`: subir un extracto y que sus movimientos entren al sistema.
 *
 * La petición es `multipart/form-data` —lleva el fichero en el campo `file`— y
 * los demás campos van en texto, que es como los espera
 * `createImportRequestSchema`.
 *
 * El fichero se pasa al pipeline como **bytes**, sin decodificar: el encoding
 * es propiedad del formato (el cuaderno 43 viene en latin-1 y el CSV de Revolut
 * en UTF-8) y lo decide el adaptador, que es quien lo conoce.
 *
 * La ruta es además quien **orquesta** las etapas del pipeline: importar,
 * categorizar lo importado y emparejar las transferencias internas. Los módulos
 * no se llaman entre sí, así que `ingest` sigue sin saber que existen
 * `categorize` ni `ledger`.
 */
import {
  createImportRequestSchema,
  detailsFromZodError,
  importResultResponseSchema,
} from '@finanzas/shared'
import { Hono } from 'hono'
import type { Db } from '../../db/client'
import { categorizeTransactions } from '../../modules/categorize/index'
import { AccountNotFoundError, runImport, SourceFormatError } from '../../modules/ingest/index'
import { recordInternalTransfers } from '../../modules/ledger/index'
import { errorJson } from '../errors'

/** Campo del formulario que lleva el fichero. La PWA se ata a este nombre. */
const FILE_FIELD = 'file'

export type ImportsRoutesOptions = {
  /** Nombres del titular para la señal de +2 del matching. Ver `AppOptions`. */
  readonly holderNames: readonly string[]
}

export function createImportsRoutes(db: Db, { holderNames }: ImportsRoutesOptions) {
  const routes = new Hono()

  routes.post('/', async (c) => {
    let body: Awaited<ReturnType<typeof c.req.parseBody>>
    try {
      body = await c.req.parseBody()
    } catch {
      return errorJson(c, 400, 'validation_error', 'La petición no es un formulario multipart', [
        { path: '(raíz)', message: 'Se esperaba multipart/form-data con un fichero' },
      ])
    }

    const file = body[FILE_FIELD]
    if (!(file instanceof File) || file.size === 0) {
      return errorJson(c, 400, 'validation_error', 'Falta el fichero que importar', [
        { path: FILE_FIELD, message: 'Se esperaba un fichero no vacío' },
      ])
    }

    // Un `fileName` en blanco es "no me lo has dicho", no un error: `trimmedText`
    // rechazaría la cadena vacía. Si no viene, sirve el nombre del fichero subido.
    const declaredName = typeof body.fileName === 'string' ? body.fileName.trim() : ''
    const fields = createImportRequestSchema.safeParse({
      accountId: body.accountId,
      source: body.source,
      fileName: declaredName !== '' ? declaredName : (file.name ?? null),
    })
    if (!fields.success) {
      return errorJson(
        c,
        400,
        'validation_error',
        'Los datos del formulario no son válidos',
        detailsFromZodError(fields.error),
      )
    }

    const bytes = new Uint8Array(await file.arrayBuffer())

    try {
      const outcome = runImport(db, { ...fields.data, bytes })

      // Paso 1 del pipeline de categorización (DATA_MODEL.md): al importar, se
      // aplican las reglas activas. Se orquesta aquí y no dentro de
      // `runImport` para no crear una arista `ingest → categorize`: cada
      // módulo sigue sin saber que el otro existe.
      //
      // Va después de que el import haya confirmado, no dentro de su
      // transacción, y eso es deliberado: si fallara la categorización, los
      // movimientos ya están dentro y aparecen en la bandeja de pendientes,
      // que es un estado correcto. Deshacer el import sería perder datos por
      // un problema de una etiqueta.
      categorizeTransactions(db, { importId: outcome.importId })

      // Última etapa: emparejar transferencias internas. Sobre **toda** la
      // población sin emparejar y no solo sobre lo recién importado, porque el
      // punto fijo sobre un subconjunto no es la restricción del punto fijo
      // sobre el conjunto entero: el extracto que acaba de entrar puede traer
      // la otra pata de un traspaso importado hace un mes (ADR-013).
      //
      // Va después de categorizar y no antes: escribe `internal_transfer`
      // encima de lo que hubieran puesto las reglas, que es lo que manda el
      // invariante 3, y hacerlo al revés dejaría a una regla la última palabra
      // sobre una pata.
      recordInternalTransfers(db, { holderNames })

      return c.json(
        importResultResponseSchema.parse({
          ...outcome,
          importedAt: outcome.importedAt.toISOString(),
          rowErrors: [...outcome.rowErrors],
        }),
        201,
      )
    } catch (error) {
      if (error instanceof AccountNotFoundError) {
        return errorJson(c, 404, 'not_found', error.message)
      }
      // El mensaje del adaptador va tal cual: está escrito para que lo lea una
      // persona y dice qué le pasa al fichero, que es justo lo que hay que
      // enseñar a quien acaba de subirlo.
      if (error instanceof SourceFormatError) {
        return errorJson(c, 422, 'unsupported_format', error.message)
      }
      throw error
    }
  })

  return routes
}
