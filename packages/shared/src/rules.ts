/**
 * Contratos de reglas de categorización.
 *
 * Se define el contrato aunque el CRUD de `/rules` todavía no exista: la
 * pantalla que lo va a consumir —"crear regla desde un movimiento"— entra con
 * su tarea del roadmap (ADR-009), pero el patrón hay que saber validarlo desde
 * ya.
 *
 * Este fichero es la **primera** de las dos capas que protegen de un patrón
 * roto: aquí se rechaza al crear la regla, y el motor de `packages/core` la
 * salta al aplicarla en vez de tumbar la importación entera (ADR-014 decisión
 * 4). Las dos hacen falta: la base guarda reglas escritas antes de que
 * existiera esta validación, y `pattern` en SQLite solo tiene un `CHECK` de
 * longitud.
 */
import { z } from 'zod'
import { ruleFieldSchema, ruleMatchTypeSchema } from './enums'
import { entityIdSchema, nonNegativeIntSchema } from './primitives'

/** Un patrón más largo que esto no es una regla, es un extracto pegado. */
const PATTERN_MAX_LENGTH = 200

/**
 * Al menos una letra o una cifra.
 *
 * Es la misma condición que `packages/core` impone a un `contains`, escrita
 * aquí a mano porque `shared` no puede importar de `core`: un patrón de solo
 * puntuación se queda en nada al normalizarlo, y una aguja vacía está contenida
 * en cualquier texto, así que la regla categorizaría el extracto entero.
 */
const HAS_CONTENT = /[\p{Letter}\p{Number}]/u

const patternSchema = z.string().trim().min(1).max(PATTERN_MAX_LENGTH)

/**
 * Comprueba que el patrón sirve para el tipo de comparación elegido.
 *
 * Va como `superRefine` sobre el objeto y no sobre el campo porque la condición
 * depende de `matchType`: el mismo texto es un patrón válido como `contains` e
 * inválido como `regex`.
 */
function checkPattern(
  value: { matchType: z.infer<typeof ruleMatchTypeSchema>; pattern: string },
  ctx: z.RefinementCtx,
): void {
  if (value.matchType === 'regex') {
    try {
      // Las mismas banderas con las que lo va a compilar el motor: validar con
      // otras distintas sería aceptar aquí lo que allí falla.
      new RegExp(value.pattern, 'iu')
    } catch (error) {
      ctx.addIssue({
        code: 'custom',
        path: ['pattern'],
        message: `Expresión regular no válida: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
    return
  }

  if (!HAS_CONTENT.test(value.pattern)) {
    ctx.addIssue({
      code: 'custom',
      path: ['pattern'],
      message: 'El patrón necesita al menos una letra o una cifra',
    })
  }
}

export const ruleSchema = z
  .object({
    id: entityIdSchema,
    /** Menor = se evalúa antes. La primera coincidencia gana. */
    priority: z.int(),
    field: ruleFieldSchema,
    matchType: ruleMatchTypeSchema,
    pattern: patternSchema,
    categoryId: entityIdSchema,
    /** Una regla desactivada no se aplica, pero se conserva para reactivarla. */
    active: z.boolean(),
  })
  .superRefine(checkPattern)

export type Rule = z.infer<typeof ruleSchema>

/**
 * Alta de regla. Sin `id`, que lo pone la base, y con `priority` y `active` por
 * defecto: crear una regla desde un movimiento son dos campos —el patrón y la
 * categoría—, y afinar el orden es cosa de después.
 */
export const createRuleRequestSchema = z
  .object({
    priority: z.int().default(100),
    field: ruleFieldSchema,
    matchType: ruleMatchTypeSchema.default('contains'),
    pattern: patternSchema,
    categoryId: entityIdSchema,
    active: z.boolean().default(true),
  })
  .superRefine(checkPattern)

export type CreateRuleRequest = z.infer<typeof createRuleRequestSchema>

/**
 * Envuelto en un objeto y no como array pelado: así admite metadatos nuevos
 * —cuántos movimientos ha categorizado cada regla— sin romper a quien ya lo lee.
 */
export const ruleListResponseSchema = z.object({
  rules: z.array(ruleSchema),
})

export type RuleListResponse = z.infer<typeof ruleListResponseSchema>

/**
 * Una regla que el motor no pudo evaluar y se saltó (ADR-014 decisión 4).
 *
 * Va el `message` y **no** el `reason`. La lista de motivos
 * (`INVALID_RULE_REASONS`) vive en `packages/core`, y sacarla por aquí
 * obligaría a duplicarla en `shared` con un test que las atara, como pasa con
 * las divisas (ADR-009 punto 2). No compensa: el cliente no decide nada con el
 * motivo —no hay dos maneras de corregir una regla rota, se abre y se arregla—
 * y el `message` ya viene escrito en español para leerse en pantalla. El
 * `ruleId` sí va, porque es lo que permite llevar al usuario a la regla mala.
 */
export const invalidRuleSchema = z.object({
  ruleId: entityIdSchema,
  message: z.string(),
})

export type InvalidRuleReport = z.infer<typeof invalidRuleSchema>

/**
 * Qué ha cambiado una pasada de las reglas sobre los movimientos.
 *
 * Los tres contadores cuentan **cambios**, no estado: `categorized` son los que
 * esta pasada ha etiquetado y `cleared` los que ha devuelto a la bandeja porque
 * ya no casan con nada. Es lo que convierte "regla creada" en "la regla ha
 * categorizado 9 movimientos", que es lo que el usuario venía a comprobar.
 */
export const categorizationOutcomeSchema = z.object({
  /** Movimientos examinados: los que el invariante 7 deja tocar. */
  scanned: nonNegativeIntSchema,
  categorized: nonNegativeIntSchema,
  cleared: nonNegativeIntSchema,
  invalidRules: z.array(invalidRuleSchema),
})

export type CategorizationOutcome = z.infer<typeof categorizationOutcomeSchema>

/**
 * Respuesta de `POST /rules`: la regla creada y el efecto que ha tenido.
 *
 * Las dos cosas juntas porque la ruta hace las dos (ADR-014 punto 7): crear una
 * regla que no se aplicara hasta que alguien pulsara otro botón dejaría el
 * movimiento del que salió en la bandeja, que es justo de donde se le quería
 * sacar.
 */
export const createRuleResponseSchema = z.object({
  rule: ruleSchema,
  categorization: categorizationOutcomeSchema,
})

export type CreateRuleResponse = z.infer<typeof createRuleResponseSchema>
