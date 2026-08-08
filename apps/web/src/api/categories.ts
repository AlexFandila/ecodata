import { type Category, categoryListResponseSchema } from '@finanzas/shared'
import { apiFetch } from './client'

export const categoriesQueryKey = ['categories'] as const

export async function fetchCategories(): Promise<readonly Category[]> {
  return categoryListResponseSchema.parse(await apiFetch('/categories')).categories
}
