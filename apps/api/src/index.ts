import { serve } from '@hono/node-server'
import { createDb, databasePath } from './db/client'
import { runMigrations } from './db/migrate'
import { createApp } from './http/app'
import { seedCategories } from './modules/categorize/index'

const port = Number(process.env.PORT ?? 3000)

/**
 * Variantes del nombre del titular que reconocer en los extractos, separadas
 * por comas (ver env.example).
 *
 * Se lee aquí, en el arranque, y viaja por parámetro hasta las rutas: es dato
 * personal —por eso no está en el repo (ADR-013 decisión 5)— y una ruta que
 * leyera `process.env` por su cuenta sería configuración global escondida.
 * Vacío es legítimo: el matching pierde una señal de desempate, nada más.
 */
const holderNames = (process.env.HOLDER_NAMES ?? '')
  .split(',')
  .map((name) => name.trim())
  .filter((name) => name !== '')

// Migrar al arrancar es idempotente (drizzle lleva su propia tabla de control)
// y evita el fallo más tonto posible: levantar la API contra una base sin el
// esquema al día y descubrirlo en la primera petición.
const db = createDb({ path: databasePath() })
runMigrations(db)

// Las categorías van justo detrás y por el mismo motivo: también es idempotente
// —no duplica ni pisa lo que el usuario haya renombrado— y hay código que da
// por hecho que la categoría del sistema `internal_transfer` existe (invariante
// 3). Es dato de referencia, no esquema, y por eso no viaja en una migración.
seedCategories(db)

// Solo localhost: la exposición al móvil va por Tailscale, nunca por una
// interfaz pública (ver ARCHITECTURE.md y ADR-003).
serve({ fetch: createApp(db, { holderNames }).fetch, port, hostname: '127.0.0.1' }, (info) => {
  console.log(`API escuchando en http://127.0.0.1:${info.port}`)
})
