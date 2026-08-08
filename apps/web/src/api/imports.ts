import {
  type ImportResultResponse,
  type ImportSource,
  importResultResponseSchema,
} from '@finanzas/shared'
import { apiFetch } from './client'

/** Campo del formulario que lleva el fichero. Lo fija la API, no la pantalla. */
const FILE_FIELD = 'file'

export type CreateImportInput = {
  readonly accountId: number
  readonly source: ImportSource
  readonly file: File
}

/**
 * No se manda `fileName`: la API cae al nombre del fichero subido cuando falta,
 * que es exactamente lo que pondríamos aquí.
 */
export async function createImport({
  accountId,
  source,
  file,
}: CreateImportInput): Promise<ImportResultResponse> {
  const form = new FormData()
  form.append(FILE_FIELD, file)
  form.append('accountId', String(accountId))
  form.append('source', source)

  return importResultResponseSchema.parse(
    await apiFetch('/imports', { method: 'POST', body: form }),
  )
}
