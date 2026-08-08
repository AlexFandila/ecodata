/**
 * Contratos de cuentas: `GET /accounts` y `POST /accounts`.
 *
 * Hacen falta ya en la Fase 1 aunque la pantalla de cuentas no exista: para
 * subir un CSV hay que elegir a qué cuenta van los movimientos, y para eso hay
 * que poder listarlas y crearlas.
 */
import { z } from 'zod'
import { accountProviderSchema, accountTypeSchema, currencySchema } from './enums'
import { amountCentsSchema, entityIdSchema, isoDateTimeSchema, trimmedText } from './primitives'

/**
 * IBAN validado solo por su forma: dos letras de país, dos dígitos de control y
 * hasta 30 alfanuméricos. No se comprueba el dígito de control (módulo 97)
 * porque aquí el IBAN es una etiqueta para reconocer la cuenta, no una orden de
 * pago; rechazar por un dígito mal copiado estorbaría más de lo que protege.
 */
const ibanSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/, 'El IBAN no tiene la forma esperada')

export const accountSchema = z.object({
  id: entityIdSchema,
  name: trimmedText(80),
  provider: accountProviderSchema,
  type: accountTypeSchema,
  /** Divisa principal. Los movimientos pueden traer otra: Revolut es multidivisa. */
  currency: currencySchema,
  iban: ibanSchema.nullable(),
  /** Solo las cuentas propias entran en el matching de transferencias internas. */
  isOwn: z.boolean(),
  /**
   * Saldo justo antes del movimiento más antiguo importado. Es la base del
   * invariante 6: saldo = `openingBalanceCents` + Σ movimientos no borrados.
   */
  openingBalanceCents: amountCentsSchema,
  createdAt: isoDateTimeSchema,
})

export type Account = z.infer<typeof accountSchema>

/**
 * Alta de cuenta. Sin `id` ni `createdAt`, que los pone la base, y con los dos
 * campos que casi siempre valen lo mismo (`isOwn`, `openingBalanceCents`) con
 * valor por defecto, para que crear una cuenta desde el móvil sean tres campos
 * y no cinco.
 */
export const createAccountRequestSchema = z.object({
  name: trimmedText(80),
  provider: accountProviderSchema,
  type: accountTypeSchema,
  currency: currencySchema,
  iban: ibanSchema.nullable().default(null),
  isOwn: z.boolean().default(true),
  openingBalanceCents: amountCentsSchema.default(0),
})

export type CreateAccountRequest = z.infer<typeof createAccountRequestSchema>

/**
 * Envuelto en un objeto y no como array pelado: así se le pueden añadir
 * metadatos (totales, fecha del último import) sin romper a quien ya lo lee.
 */
export const accountListResponseSchema = z.object({
  accounts: z.array(accountSchema),
})

export type AccountListResponse = z.infer<typeof accountListResponseSchema>
