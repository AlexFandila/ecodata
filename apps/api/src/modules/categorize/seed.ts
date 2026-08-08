/**
 * El árbol inicial de categorías (docs/DATA_MODEL.md, `### categories`).
 *
 * Va como función idempotente y no como `INSERT` dentro de una migración: son
 * datos de referencia, no esquema. El usuario puede renombrar «Supermercado» o
 * cambiarle el icono desde la UI, y una migración que reinsertara se lo pisaría
 * en el siguiente despliegue. `onConflictDoNothing` sobre `slug` hace que
 * sembrar dos veces no duplique ni sobrescriba nada.
 *
 * **Slugs en inglés, nombres en español**: el slug es un identificador que
 * aparece en el código (`internal_transfer` lo referencia el módulo `ledger`) y
 * sigue la convención de la regla de nombres de CLAUDE.md; el nombre es texto
 * de interfaz.
 */
import type { CategoryKind } from '@finanzas/shared'
import { eq } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { categories, INTERNAL_TRANSFER_SLUG, type NewCategory } from '../../db/schema'

/** Una subcategoría. Hereda el `kind` de su madre: el árbol no mezcla lados. */
export type SeedSubcategory = {
  readonly slug: string
  readonly name: string
  readonly icon: string
}

export type SeedCategory = SeedSubcategory & {
  readonly kind: CategoryKind
  readonly children: readonly SeedSubcategory[]
}

/**
 * El árbol, de dos niveles.
 *
 * Dos niveles y no más porque el dashboard móvil enseña el gasto agrupado por
 * la categoría madre y el detalle por la hija; un tercer nivel no cabría en la
 * pantalla ni añadiría información que no dé el segundo.
 *
 * No se siembra ninguna regla: los patrones dependen del banco y hasta del
 * idioma del export (ADR-011 avisa de que la descripción de Revolut es una
 * etiqueta traducida), así que las escribe el usuario desde sus propios
 * movimientos.
 */
export const SEED_CATEGORIES: readonly SeedCategory[] = [
  {
    // La categoría del sistema (invariante 3): ni ingreso ni gasto, porque
    // mover dinero entre cuentas propias no es ninguna de las dos cosas.
    slug: INTERNAL_TRANSFER_SLUG,
    name: 'Transferencia interna',
    kind: 'internal',
    icon: '🔁',
    children: [],
  },

  { slug: 'salary', name: 'Nómina', kind: 'income', icon: '💼', children: [] },
  {
    slug: 'freelance_income',
    name: 'Ingresos de autónomo',
    kind: 'income',
    icon: '🧾',
    children: [],
  },
  { slug: 'refunds', name: 'Devoluciones y reembolsos', kind: 'income', icon: '↩️', children: [] },
  {
    slug: 'investment_income',
    name: 'Rendimientos de inversión',
    kind: 'income',
    icon: '📈',
    children: [],
  },
  { slug: 'other_income', name: 'Otros ingresos', kind: 'income', icon: '➕', children: [] },

  {
    slug: 'housing',
    name: 'Vivienda',
    kind: 'expense',
    icon: '🏠',
    children: [
      { slug: 'rent_mortgage', name: 'Alquiler o hipoteca', icon: '🔑' },
      { slug: 'utilities', name: 'Suministros', icon: '💡' },
      { slug: 'home_insurance', name: 'Seguro del hogar', icon: '🛡️' },
      { slug: 'home_maintenance', name: 'Mantenimiento del hogar', icon: '🔧' },
    ],
  },
  {
    slug: 'food',
    name: 'Alimentación',
    kind: 'expense',
    icon: '🍽️',
    children: [
      { slug: 'groceries', name: 'Supermercado', icon: '🛒' },
      { slug: 'restaurants', name: 'Restaurantes y bares', icon: '🍴' },
    ],
  },
  {
    slug: 'transport',
    name: 'Transporte',
    kind: 'expense',
    icon: '🚗',
    children: [
      { slug: 'fuel', name: 'Combustible', icon: '⛽' },
      { slug: 'public_transport', name: 'Transporte público', icon: '🚇' },
      { slug: 'car_maintenance', name: 'Mantenimiento del coche', icon: '🔩' },
      { slug: 'car_insurance', name: 'Seguro del coche', icon: '🛡️' },
      { slug: 'parking_tolls', name: 'Parking y peajes', icon: '🅿️' },
    ],
  },
  {
    slug: 'health',
    name: 'Salud',
    kind: 'expense',
    icon: '🩺',
    children: [
      { slug: 'pharmacy', name: 'Farmacia', icon: '💊' },
      { slug: 'medical', name: 'Médicos y dentista', icon: '🏥' },
      { slug: 'health_insurance', name: 'Seguro de salud', icon: '🛡️' },
    ],
  },
  {
    slug: 'leisure',
    name: 'Ocio',
    kind: 'expense',
    icon: '🎬',
    children: [
      { slug: 'subscriptions', name: 'Suscripciones', icon: '📺' },
      { slug: 'travel', name: 'Viajes', icon: '✈️' },
      { slug: 'culture_sport', name: 'Cultura y deporte', icon: '⚽' },
    ],
  },
  {
    slug: 'shopping',
    name: 'Compras',
    kind: 'expense',
    icon: '🛍️',
    children: [
      { slug: 'clothing', name: 'Ropa', icon: '👕' },
      { slug: 'electronics', name: 'Electrónica', icon: '💻' },
      { slug: 'home_goods', name: 'Hogar y decoración', icon: '🛋️' },
    ],
  },
  {
    slug: 'personal',
    name: 'Personal',
    kind: 'expense',
    icon: '👤',
    children: [
      { slug: 'education', name: 'Formación', icon: '📚' },
      { slug: 'personal_care', name: 'Cuidado personal', icon: '💇' },
      { slug: 'gifts_donations', name: 'Regalos y donaciones', icon: '🎁' },
    ],
  },
  {
    slug: 'finance',
    name: 'Finanzas',
    kind: 'expense',
    icon: '🏦',
    children: [
      { slug: 'bank_fees', name: 'Comisiones bancarias', icon: '🏧' },
      { slug: 'taxes', name: 'Impuestos', icon: '🧾' },
      { slug: 'loan_payment', name: 'Préstamos', icon: '📉' },
      { slug: 'savings_investment', name: 'Ahorro e inversión', icon: '🐖' },
    ],
  },
  { slug: 'other_expense', name: 'Otros gastos', kind: 'expense', icon: '❓', children: [] },
]

export type SeedCategoriesOutcome = {
  /** Categorías creadas en esta llamada. */
  readonly inserted: number
  /** Las que ya estaban y se han dejado intactas, con el nombre que tuvieran. */
  readonly existing: number
}

/**
 * Siembra el árbol inicial. Es idempotente: llamarla en cada arranque no
 * duplica nada ni deshace lo que el usuario haya renombrado.
 *
 * Va en una transacción porque a medio camino el árbol estaría descabezado:
 * subcategorías apuntando a madres que aún no existen.
 */
export function seedCategories(db: Db): SeedCategoriesOutcome {
  return db.transaction((tx) => {
    let inserted = 0
    let existing = 0

    const insert = (values: NewCategory): void => {
      const row = tx
        .insert(categories)
        .values(values)
        // Quién decide si la categoría ya está es el UNIQUE de `slug`, no una
        // consulta previa: la regla vive en un solo sitio (mismo criterio que
        // la deduplicación de movimientos en `ingest`).
        .onConflictDoNothing({ target: categories.slug })
        .returning({ id: categories.id })
        .get()

      if (row === undefined) existing += 1
      else inserted += 1
    }

    // Las madres primero: las hijas necesitan su id.
    for (const category of SEED_CATEGORIES) {
      insert({
        slug: category.slug,
        name: category.name,
        kind: category.kind,
        icon: category.icon,
        parentId: null,
      })
    }

    for (const category of SEED_CATEGORIES) {
      if (category.children.length === 0) continue

      // Se relee el id en vez de guardarlo del `insert`: si la categoría ya
      // existía, aquel no devolvió fila.
      const parent = tx
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.slug, category.slug))
        .get()
      if (parent === undefined) {
        throw new Error(`La categoría madre '${category.slug}' no se pudo sembrar`)
      }

      for (const child of category.children) {
        insert({
          slug: child.slug,
          name: child.name,
          kind: category.kind,
          icon: child.icon,
          parentId: parent.id,
        })
      }
    }

    return { inserted, existing }
  })
}
