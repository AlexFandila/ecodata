import { z } from 'zod'

/**
 * Contrato del endpoint de salud de la API. Es el primer contrato del proyecto
 * y sirve de plantilla: todo lo que cruza una frontera (HTTP, MCP, fichero) se
 * define aquí con zod y su tipo se deriva con `z.infer`, nunca se duplica a mano.
 */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
})

export type HealthResponse = z.infer<typeof healthResponseSchema>
