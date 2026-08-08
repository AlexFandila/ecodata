import {
  type CreateRuleRequest,
  type CreateRuleResponse,
  createRuleResponseSchema,
} from '@finanzas/shared'
import { apiFetch } from './client'

export const rulesQueryKey = ['rules'] as const

/**
 * Los campos que pide el formulario de "crear regla desde un movimiento".
 * `priority` y `active` tienen valor por defecto en el contrato y los pone la
 * API: crear una regla desde un movimiento son dos campos —el patrón y la
 * categoría—, y afinar el orden es cosa de después.
 */
export type CreateRuleInput = Pick<
  CreateRuleRequest,
  'field' | 'matchType' | 'pattern' | 'categoryId'
>

/**
 * La respuesta trae la regla **y** lo que ha hecho al aplicarla: la ruta crea y
 * recategoriza en la misma llamada, así que quien la pide puede enseñar
 * directamente cuántos movimientos ha etiquetado.
 */
export async function createRule(input: CreateRuleInput): Promise<CreateRuleResponse> {
  return createRuleResponseSchema.parse(
    await apiFetch('/rules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  )
}
