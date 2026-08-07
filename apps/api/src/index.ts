import { serve } from '@hono/node-server'
import { createApp } from './http/app'

const port = Number(process.env.PORT ?? 3000)

// Solo localhost: la exposición al móvil va por Tailscale, nunca por una
// interfaz pública (ver ARCHITECTURE.md y ADR-003).
serve({ fetch: createApp().fetch, port, hostname: '127.0.0.1' }, (info) => {
  console.log(`API escuchando en http://127.0.0.1:${info.port}`)
})
