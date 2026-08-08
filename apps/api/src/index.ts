import { serve } from '@hono/node-server'
import { createDb, databasePath } from './db/client'
import { runMigrations } from './db/migrate'
import { createApp } from './http/app'

const port = Number(process.env.PORT ?? 3000)

// Migrar al arrancar es idempotente (drizzle lleva su propia tabla de control)
// y evita el fallo más tonto posible: levantar la API contra una base sin el
// esquema al día y descubrirlo en la primera petición.
const db = createDb({ path: databasePath() })
runMigrations(db)

// Solo localhost: la exposición al móvil va por Tailscale, nunca por una
// interfaz pública (ver ARCHITECTURE.md y ADR-003).
serve({ fetch: createApp(db).fetch, port, hostname: '127.0.0.1' }, (info) => {
  console.log(`API escuchando en http://127.0.0.1:${info.port}`)
})
