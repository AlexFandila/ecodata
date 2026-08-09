/**
 * Contrato del dashboard: `GET /dashboard`.
 *
 * ADR-009 dejó este contrato explícitamente aplazado —«entra con su tarea,
 * cuando se sepa qué necesita la pantalla»— para no fijar formas a ciegas. Lo
 * que la pantalla necesita, ya sabido, son tres cosas y las tres en la misma
 * petición: saldo por cuenta y total, gasto del mes por categoría y evolución de
 * los últimos meses. Van juntas porque se pintan juntas: tres peticiones serían
 * tres estados de carga en una pantalla que cabe en una sola mirada.
 *
 * Dos decisiones gobiernan toda la forma de abajo:
 *
 * **Cada agregado lleva su divisa y nunca se suman entre sí.** `fx_rates` es de
 * la Fase 2, así que hasta entonces no existe ningún tipo de cambio que aplicar
 * y convertir sería inventárselo (ADR-008 punto 4). Un usuario con euros y
 * libras ve dos totales, no uno mal.
 *
 * **Ingreso y gasto se separan por el signo del movimiento**, no por el `kind`
 * de su categoría, y el gasto se expone en positivo. La consecuencia buscada es
 * que la suma de `spending` de un mes sea exactamente el `expenseCents` de ese
 * mes en `evolution`: son dos números que se ven a la vez y que, si no
 * cuadrasen, dejarían al usuario sin saber a cuál creer. El precio es que una
 * devolución cuenta como ingreso en vez de rebajar la categoría en la que se
 * gastó.
 */
import { z } from 'zod'
import { categorySlugSchema } from './categories'
import { accountProviderSchema, currencySchema } from './enums'
import {
  amountCentsSchema,
  entityIdSchema,
  isoMonthSchema,
  nonNegativeIntSchema,
  trimmedText,
} from './primitives'

/** Cuántos meses de evolución se pueden pedir de una vez. */
export const DASHBOARD_MAX_MONTHS = 24
export const DASHBOARD_DEFAULT_MONTHS = 6

/**
 * Un importe agregado. Es `amountCents` + `currency` como campos hermanos, igual
 * que en el resto de contratos (ADR-009 punto 3), y aquí además es lo que impide
 * que un total pierda de vista de qué divisa era.
 */
export const currencyTotalSchema = z.object({
  currency: currencySchema,
  amountCents: amountCentsSchema,
})

export type CurrencyTotal = z.infer<typeof currencyTotalSchema>

/**
 * El saldo de una cuenta, que es el invariante 6: apertura + movimientos vivos,
 * **con** las transferencias internas dentro (invariante 3: no son ingreso ni
 * gasto, pero sí mueven el saldo) y sin los borrados (invariante 5).
 */
export const accountBalanceSchema = z.object({
  accountId: entityIdSchema,
  name: trimmedText(80),
  provider: accountProviderSchema,
  /** Divisa principal: la primera de `balances`. */
  currency: currencySchema,
  /**
   * Saldo por divisa, la principal primero. Trae **siempre** al menos la
   * principal, aunque valga cero: una cuenta sin movimientos tiene su apertura,
   * y omitirla la haría desaparecer de la pantalla.
   *
   * No hay aquí un `openingBalanceCents` aparte a propósito: la apertura ya está
   * sumada dentro de estos saldos, y exponerla al lado es ofrecerle a quien lee
   * la posibilidad de contarla dos veces. Quien la necesite la tiene en
   * `GET /accounts`, que es de quien es.
   */
  balances: z.array(currencyTotalSchema).min(1),
})

export type AccountBalance = z.infer<typeof accountBalanceSchema>

/** Una subcategoría dentro del desglose de su madre. Hereda la divisa de la madre. */
export const categorySpendingChildSchema = z.object({
  categoryId: entityIdSchema,
  slug: categorySlugSchema,
  name: trimmedText(60),
  icon: trimmedText(8).nullable(),
  amountCents: nonNegativeIntSchema,
})

export type CategorySpendingChild = z.infer<typeof categorySpendingChildSchema>

/**
 * Gasto del mes de una categoría madre, en una divisa.
 *
 * Agrupado por madre y con el detalle por hija porque es exactamente para lo que
 * el árbol tiene dos niveles: ADR-014 fijó que «el dashboard móvil enseña el
 * gasto agrupado por la madre y el detalle por la hija, y un tercer nivel no
 * cabría en pantalla».
 */
export const categorySpendingSchema = z.object({
  /**
   * `null` = sin categorizar. Es una fila más y no un hueco: es donde el usuario
   * tiene trabajo pendiente, y esconderla haría que las barras no sumaran el
   * gasto del mes.
   *
   * Cuando es `null`, `slug`, `name` e `icon` lo son también: no hay categoría
   * de la que sacarlos. El rótulo que se enseña —«Sin categorizar»— lo escribe
   * la pantalla y no la API, por lo mismo que el resto de textos de interfaz:
   * quien decide que esa fila lleva a la bandeja de pendientes es el `null`, no
   * una cadena que mañana podría cambiar.
   */
  categoryId: entityIdSchema.nullable(),
  slug: categorySlugSchema.nullable(),
  /** El nombre visible de la categoría, en español, tal como está en la base. */
  name: trimmedText(60).nullable(),
  icon: trimmedText(8).nullable(),
  currency: currencySchema,
  /** En positivo: el sentido lo lleva el nombre del campo, no el signo. */
  amountCents: nonNegativeIntSchema,
  /** Vacío si el gasto fue directo a la madre. Ordenado de mayor a menor. */
  children: z.array(categorySpendingChildSchema),
})

export type CategorySpending = z.infer<typeof categorySpendingSchema>

/** Un punto de la serie de evolución: un mes y una divisa. */
export const monthFlowSchema = z.object({
  month: isoMonthSchema,
  currency: currencySchema,
  incomeCents: nonNegativeIntSchema,
  expenseCents: nonNegativeIntSchema,
  /** `incomeCents − expenseCents`, con signo. */
  netCents: amountCentsSchema,
})

export type MonthFlow = z.infer<typeof monthFlowSchema>

/**
 * `month` es opcional y por defecto vale el mes en curso **del servidor**: la
 * PWA no tiene por qué saber en qué día vive la base, y el cliente que quiera un
 * mes concreto lo dice.
 */
export const getDashboardQuerySchema = z.object({
  month: isoMonthSchema.optional(),
  /** Cuántos meses de evolución, contando el pedido. */
  months: z.coerce
    .number()
    .pipe(z.int().min(1).max(DASHBOARD_MAX_MONTHS))
    .default(DASHBOARD_DEFAULT_MONTHS),
})

export type GetDashboardQuery = z.infer<typeof getDashboardQuerySchema>

export const dashboardResponseSchema = z.object({
  /** El mes efectivamente agregado, resuelto ya el valor por defecto. */
  month: isoMonthSchema,
  /**
   * La ventana efectivamente devuelta, por lo mismo que los listados devuelven
   * `limit` y `offset`: el cliente puede no haber mandado ninguno de los dos y
   * necesita saber qué le han contestado.
   */
  months: z.int().min(1).max(DASHBOARD_MAX_MONTHS),
  /**
   * Las divisas presentes, de más a menos relevante (por número de cuentas
   * denominadas en ella; empate por código). La primera es la que pintan los
   * gráficos, que solo pueden enseñar una a la vez. Vacío en una base sin nada.
   */
  currencies: z.array(currencySchema),
  /**
   * Saldos **a día de hoy**, que no dependen de `month`: un saldo es un
   * acumulado y no un flujo. Cambiar de mes cambia `spending` y `evolution` y
   * deja `accounts` y `totals` igual. Despista al principio y es lo correcto:
   * «cuánto tengo» no tiene mes.
   */
  accounts: z.array(accountBalanceSchema),
  /** Saldo total sumando las cuentas, divisa a divisa. */
  totals: z.array(currencyTotalSchema),
  /** Gasto del mes: una fila por (categoría madre, divisa). */
  spending: z.array(categorySpendingSchema),
  /**
   * Una fila por (mes, divisa) para los `months` meses que **acaban** en
   * `month`, en orden ascendente y **sin huecos**: un mes sin movimientos va con
   * ceros, porque en una serie temporal un hueco no se lee como cero.
   */
  evolution: z.array(monthFlowSchema),
})

export type DashboardResponse = z.infer<typeof dashboardResponseSchema>
