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
 */
import {
  createImportRequestSchema,
  detailsFromZodError,
  importResultResponseSchema,
} from '@finanzas/shared'
import { Hono } from 'hono'
import type { Db } from '../../db/client'
import { AccountNotFoundError, runImport, SourceFormatError } from '../../modules/ingest/index'
import { errorJson } from '../errors'

/** Campo del formulario que lleva el fichero. La PWA se ata a este nombre. */
const FILE_FIELD = 'file'

export function createImportsRoutes(db: Db) {
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
