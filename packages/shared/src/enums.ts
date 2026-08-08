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
 * Las listas que todavía no tiene ningún contrato (`CATEGORY_KINDS`,
 * `RULE_FIELDS`, `RULE_MATCH_TYPES`, `TRANSFER_STATUSES`) siguen en
 * `apps/api/src/db/schema.ts`; cada una se muda aquí cuando llegue su tarea del
 * roadmap y la necesite alguien más que la base de datos.
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
