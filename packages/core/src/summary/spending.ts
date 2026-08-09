/**
 * Gasto del mes, agrupado por categoría madre.
 *
 * El agrupado por madre no es una preferencia estética: es la razón por la que
 * el árbol de categorías tiene dos niveles y no tres. ADR-014, en su última
 * consecuencia, lo deja escrito —«el dashboard móvil enseña el gasto agrupado
 * por la madre y el detalle por la hija, y un tercer nivel no cabría en
 * pantalla»—, así que esta función es la que cobra aquella decisión: nueve
 * barras (vivienda, alimentación, transporte…) en vez de las treinta y tantas
 * hojas del árbol, con el desglose colgando de cada una.
 *
 * «Sin categorizar» es **una fila más**, no un hueco. Es justo el sitio donde el
 * usuario tiene que actuar —crear una regla, etiquetar a mano—, y esconderla
 * haría que la suma de las barras no cuadrase con el gasto del mes.
 */

import { add, type Currency, type Money, money, zero } from '../money/index'

export type CategorySpendingRow = {
  /** `null` = movimiento sin categoría. */
  readonly categoryId: number | null
  readonly currency: Currency
  /** El gasto en positivo: quien consulta ya le ha dado la vuelta al signo. */
  readonly amountCents: number
}

export type CategorySpendingChild = {
  readonly categoryId: number
  readonly amountCents: number
}

export type CategorySpending = {
  /** `null` = sin categorizar. */
  readonly categoryId: number | null
  readonly currency: Currency
  /** Lo gastado en la madre, incluyendo lo de sus hijas. */
  readonly amountCents: number
  /** Desglose por hija, de mayor a menor. Vacío si el gasto fue directo a la madre. */
  readonly children: readonly CategorySpendingChild[]
}

/** Clave del grupo: la madre y la divisa. Dos divisas son dos barras distintas. */
function keyOf(parentId: number | null, currency: Currency): string {
  return `${parentId ?? 'none'}|${currency}`
}

/**
 * Ordena por importe descendente y desempata por id ascendente.
 *
 * El desempate no es decorativo, por el mismo motivo que el de las reglas
 * (ADR-014 punto 3) y el del listado de movimientos: dos categorías con el mismo
 * gasto saldrían en cualquier orden entre dos peticiones idénticas, y la lista
 * bailaría al recargar. «Sin categorizar» (`null`) va al final a igualdad de
 * importe: es la fila de trabajo pendiente, no una categoría de gasto.
 */
function byAmountThenId(
  left: { amountCents: number; categoryId: number | null },
  right: { amountCents: number; categoryId: number | null },
): number {
  if (left.amountCents !== right.amountCents) return right.amountCents - left.amountCents
  if (left.categoryId === right.categoryId) return 0
  if (left.categoryId === null) return 1
  if (right.categoryId === null) return -1

  return left.categoryId - right.categoryId
}

/**
 * Agrupa las filas por (categoría madre, divisa).
 *
 * `parentOf` va de id de categoría a id de su madre, o a `null` si ya es madre.
 * Una categoría que no esté en el mapa se trata como madre: es lo que hay que
 * hacer con una categoría que el usuario borró después de gastar en ella, y es
 * preferible a perder su importe del total.
 */
export function spendingByParent(input: {
  readonly rows: readonly CategorySpendingRow[]
  readonly parentOf: ReadonlyMap<number, number | null>
}): readonly CategorySpending[] {
  const totals = new Map<string, { parentId: number | null; currency: Currency; total: Money }>()
  const children = new Map<string, Map<number, Money>>()

  /**
   * La madre bajo la que agrupar. El `??` cubre los dos casos que significan «ya
   * es madre»: que el mapa la traiga con `null` y que no la traiga en absoluto.
   */
  const parentIdOf = (categoryId: number | null): number | null =>
    categoryId === null ? null : (input.parentOf.get(categoryId) ?? categoryId)

  for (const row of input.rows) {
    const parentId = parentIdOf(row.categoryId)

    const key = keyOf(parentId, row.currency)
    const amount = money(row.amountCents, row.currency)

    const group = totals.get(key)
    totals.set(key, {
      parentId,
      currency: row.currency,
      total: group === undefined ? amount : add(group.total, amount),
    })

    // Solo es hija si su id no es el del propio grupo: el gasto que va directo a
    // la madre suma en la barra pero no abre una línea de desglose contra sí
    // misma.
    if (row.categoryId !== null && row.categoryId !== parentId) {
      const byChild = children.get(key) ?? new Map<number, Money>()
      byChild.set(row.categoryId, add(byChild.get(row.categoryId) ?? zero(row.currency), amount))
      children.set(key, byChild)
    }
  }

  const spending = [...totals.entries()].map(([key, group]) => ({
    categoryId: group.parentId,
    currency: group.currency,
    amountCents: group.total.amountCents,
    children: [...(children.get(key) ?? new Map<number, Money>())]
      .map(([categoryId, amount]) => ({ categoryId, amountCents: amount.amountCents }))
      .sort(byAmountThenId),
  }))

  // Entre divisas, código alfabético: el orden de relevancia lo lleva la lista
  // `currencies` de la respuesta, y la pantalla filtra por la que está pintando.
  return spending.sort(
    (left, right) => left.currency.localeCompare(right.currency) || byAmountThenId(left, right),
  )
}
