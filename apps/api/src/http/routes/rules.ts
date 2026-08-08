/**
 * `GET /rules` y `POST /rules`.
 *
 * El `POST` es «crear una regla a partir de este movimiento» visto desde la
 * api, y hace dos cosas: crea la regla y **la aplica**. La segunda no está
 * dentro de `createRule` sino aquí, orquestada por la ruta, por el mismo motivo
 * que `POST /imports` orquesta importar y categorizar (ADR-014 punto 7): así
 * los módulos no se llaman entre sí y añadir o quitar una etapa es tocar la
 * ruta y nada más.
 *
 * Que las dos vayan juntas no es comodidad: una regla recién creada que no se
 * aplicara dejaría en la bandeja de pendientes justo el movimiento del que se
 * la quería sacar, y el usuario no tendría forma de saber si ha servido de
 * algo. La respuesta lleva por eso el reparto de la pasada —cuántos ha
 * categorizado, cuántos ha devuelto a pendientes— y no solo la regla.
 *
 * La recategorización va **sin** `importId`: una regla nueva puede casar con
 * movimientos de cualquier importación, no solo de la última.
 */
import {
  createRuleRequestSchema,
  createRuleResponseSchema,
  detailsFromZodError,
  type Rule,
  ruleListResponseSchema,
  ruleSchema,
} from '@finanzas/shared'
import { Hono } from 'hono'
import type { Db } from '../../db/client'
import {
  CategoryNotFoundError,
  categorizeTransactions,
  createRule,
  listRules,
  type Rule as RuleRow,
} from '../../modules/categorize/index'
import { errorJson } from '../errors'

function toDto(row: RuleRow): Rule {
  return ruleSchema.parse(row)
}

export function createRulesRoutes(db: Db) {
  const routes = new Hono()

  routes.get('/', (c) => {
    return c.json(ruleListResponseSchema.parse({ rules: listRules(db).map(toDto) }))
  })

  routes.post('/', async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return errorJson(c, 400, 'validation_error', 'La petición no lleva un cuerpo JSON válido', [
        { path: '(raíz)', message: 'Se esperaba application/json' },
      ])
    }

    // Primera de las dos capas que protegen de un patrón roto (ADR-014
    // decisión 4): aquí se rechaza al crear, compilándolo con las mismas
    // banderas con las que lo compilará el motor.
    const fields = createRuleRequestSchema.safeParse(body)
    if (!fields.success) {
      return errorJson(
        c,
        400,
        'validation_error',
        'Los datos de la regla no son válidos',
        detailsFromZodError(fields.error),
      )
    }

    let rule: RuleRow
    try {
      rule = createRule(db, fields.data)
    } catch (error) {
      if (error instanceof CategoryNotFoundError) {
        return errorJson(c, 404, 'not_found', error.message)
      }
      throw error
    }

    const outcome = categorizeTransactions(db)

    return c.json(
      createRuleResponseSchema.parse({
        rule: toDto(rule),
        categorization: {
          scanned: outcome.scanned,
          categorized: outcome.categorized,
          cleared: outcome.cleared,
          // Del `InvalidRule` del motor sale el id y el mensaje; el `reason` se
          // queda en `packages/core` (ver `invalidRuleSchema` en shared).
          invalidRules: outcome.invalidRules.map((invalid) => ({
            ruleId: invalid.ruleId,
            message: invalid.message,
          })),
        },
      }),
      201,
    )
  })

  return routes
}
