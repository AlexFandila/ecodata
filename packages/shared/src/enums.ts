/**
 * Vocabulario cerrado del dominio: las listas de literales que cruzan una
 * frontera, con su `z.enum` al lado.
 *
 * Viven aquí, y no en el esquema Drizzle, porque `packages/shared` es la hoja
 * del grafo de dependencias (regla `shared-is-leaf`): la puede importar tanto
 * `apps/api` —que las convierte en `CHECK` de SQLite— como `apps/web` y, en la
 * Fase 3, `apps/mcp`. Una lista sola, en un sitio del que todos cuelgan, en vez
 * de una copia por capa que hay que recordar sincronizar.
 *
 * La única lista que todavía no tiene contrato (`TRANSFER_STATUSES`) sigue en
 * `apps/api/src/db/schema.ts`; se muda aquí cuando llegue su tarea del roadmap
 * —la pantalla de revisión de transferencias— y la necesite alguien más que la
 * base de datos.
 */
import { z } from 'zod'

/**
 * Divisas admitidas (ISO 4217).
 *
 * La autoridad sobre esta lista es `CURRENCIES` de `packages/core`, que además
 * guarda los decimales de cada divisa (ADR-008). Aquí se repite porque `shared`
 * no puede importar de `core`, y para que no se separen en silencio hay un test
 * en `apps/api` —el único paquete que depende de los dos— que las compara.
 */
export const CURRENCY_CODES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY'] as const
export const currencySchema = z.enum(CURRENCY_CODES)
export type Currency = z.infer<typeof currencySchema>

/** Entidad de la que procede una cuenta. `manual` = creada a mano, sin banco detrás. */
export const ACCOUNT_PROVIDERS = ['unicaja', 'revolut', 'manual'] as const
export const accountProviderSchema = z.enum(ACCOUNT_PROVIDERS)
export type AccountProvider = z.infer<typeof accountProviderSchema>

export const ACCOUNT_TYPES = ['checking', 'savings', 'card'] as const
export const accountTypeSchema = z.enum(ACCOUNT_TYPES)
export type AccountType = z.infer<typeof accountTypeSchema>

/**
 * Quién puso la categoría de un movimiento. Es el invariante 7: la
 * automatización solo pisa lo que sea `rule` (o lo que no tenga categoría),
 * nunca lo `manual`.
 */
export const CATEGORY_SOURCES = ['rule', 'manual', 'suggestion'] as const
export const categorySourceSchema = z.enum(CATEGORY_SOURCES)
export type CategorySource = z.infer<typeof categorySourceSchema>

/**
 * De qué lado del presupuesto está una categoría. `internal` es la del sistema
 * (`internal_transfer`): ni ingreso ni gasto, porque mover dinero entre cuentas
 * propias no es ninguna de las dos cosas (invariante 3).
 */
export const CATEGORY_KINDS = ['expense', 'income', 'internal'] as const
export const categoryKindSchema = z.enum(CATEGORY_KINDS)
export type CategoryKind = z.infer<typeof categoryKindSchema>

/**
 * Campo del movimiento contra el que compara una regla de categorización.
 *
 * Son dos y no uno porque las fuentes llenan uno u otro: la Norma 43 deja
 * `counterparty` a null y lo mete todo en `description` (ADR-010 punto 7), y el
 * CSV de Revolut hace justo lo contrario (ADR-011 punto 1).
 */
export const RULE_FIELDS = ['counterparty', 'description'] as const
export const ruleFieldSchema = z.enum(RULE_FIELDS)
export type RuleField = z.infer<typeof ruleFieldSchema>

/**
 * Cómo compara una regla: `contains` es subcadena sobre texto normalizado —sin
 * acentos ni mayúsculas— y `regex` va contra el texto crudo. La autoridad sobre
 * qué hace exactamente cada uno es `packages/core` (ADR-014).
 */
export const RULE_MATCH_TYPES = ['contains', 'regex'] as const
export const ruleMatchTypeSchema = z.enum(RULE_MATCH_TYPES)
export type RuleMatchType = z.infer<typeof ruleMatchTypeSchema>

/**
 * Adaptador que produjo una importación; es lo que se guarda en
 * `imports.source`. Cada adaptador nuevo (regla 5 de CLAUDE.md) añade aquí su
 * literal: `enable_banking` llegará en la Fase 4.
 *
 * Los literales nombran el **formato**, no el banco, porque de qué banco es una
 * importación ya lo dice la cuenta a la que va (`accounts.provider`). Por eso
 * `norma43` y no `unicaja_*`: la Norma 43 de la AEB es un estándar y el mismo
 * adaptador sirve para cualquier banco español que la exporte (ADR-010).
 * `revolut_csv` sí lleva nombre de casa porque su CSV es suyo y de nadie más.
 */
export const IMPORT_SOURCES = ['norma43', 'revolut_csv'] as const
export const importSourceSchema = z.enum(IMPORT_SOURCES)
export type ImportSource = z.infer<typeof importSourceSchema>
