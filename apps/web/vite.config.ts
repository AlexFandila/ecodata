/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { apiUrlPattern, manifest } from './src/pwa/config.ts'

/**
 * El directorio desde el que Vite lee los `.env` es, por defecto, el del propio
 * proyecto (este mismo). Se calcula en vez de confiar en el directorio de
 * trabajo porque `pnpm -r build` y `vitest` desde la raíz no lo comparten, y el
 * patrón de la caché tiene que salir de la **misma** variable que lee
 * `src/api/client.ts`: si divergieran, el service worker cachearía otra cosa.
 *
 * Se saca de la URL del módulo y no de `node:path` porque este paquete no tiene
 * los tipos de Node y no merece traérselos para una línea. El `decodeURI` es
 * para que una ruta con espacios siga resolviendo.
 */
const ENV_DIR = decodeURIComponent(new URL('.', import.meta.url).pathname)

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ENV_DIR, 'VITE_')
  const apiPattern = apiUrlPattern(env.VITE_API_URL ?? '/api')

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // El registro lo inyecta el plugin en index.html: nada de importar
        // `virtual:pwa-register` desde src/. Ver ADR-017.
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        // `vite.config.ts` es también la config de Vitest de este paquete, y
        // jsdom no tiene `navigator.serviceWorker`.
        disable: mode === 'test',
        manifest,
        workbox: {
          // Cubre ya los iconos y el favicon; `includeAssets` los duplicaría.
          globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
          // El router es BrowserRouter con rutas profundas
          // (/movimientos/transferencias/emparejar): sin el fallback, recargar
          // ahí da un 404 del servidor de estáticos. El denylist impide que ese
          // mismo fallback se trague las llamadas a la API.
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [apiPattern],
          runtimeCaching: [
            {
              // Solo GET: offline es de lectura. Una escritura encolada y
              // reenviada a ciegas es justo lo que rompe la deduplicación.
              urlPattern: apiPattern,
              method: 'GET',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api',
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 },
                cacheableResponse: { statuses: [200] },
              },
            },
          ],
        },
      }),
    ],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api/, ''),
        },
      },
    },
    test: {
      // La PWA se prueba contra un DOM de verdad; `fetch` se simula por test.
      environment: 'jsdom',
      setupFiles: ['./src/test-setup.ts'],
    },
  }
})
