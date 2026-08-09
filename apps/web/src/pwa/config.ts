/**
 * Manifest y alcance de la caché de la PWA, como datos y no como literales
 * enterrados en `vite.config.ts`, para poder comprobarlos con tests. Las
 * decisiones que hay detrás están en ADR-017.
 *
 * Este fichero no entra en el bundle: lo importa `vite.config.ts` y vive en
 * `src/` solo porque es lo único que cubre el `include` del tsconfig.
 */
import type { ManifestOptions } from 'vite-plugin-pwa'

/**
 * `slate-900`. Es a la vez el `theme_color` del manifest, el `background_color`
 * de la pantalla de arranque —para que no dé un fogonazo blanco antes de pintar
 * una app oscura— y el `<meta name="theme-color">` de `index.html`. Que los tres
 * coincidan lo comprueba un test: son tres sitios y nadie los sincroniza a mano.
 */
export const THEME_COLOR = '#0f172a'

/** iOS no lee el manifest para esto: va como `<link>` en `index.html`. */
export const APPLE_TOUCH_ICON = '/apple-touch-icon-180.png'

export const manifest = {
  id: '/',
  name: 'Finanzas',
  short_name: 'Finanzas',
  description: 'Tus cuentas, tus gastos y tus objetivos, en tu propio servidor.',
  lang: 'es',
  dir: 'ltr',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  theme_color: THEME_COLOR,
  background_color: THEME_COLOR,
  icons: [
    { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    // El recorte del lanzador de Android puede dejar solo el círculo central
    // del 80 %; este dibujo tiene más margen para caber dentro.
    { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
  // `satisfies` y no anotación: comprueba las uniones del manifest (`display`,
  // `orientation`, `purpose`) sin perder los tipos literales que leen los tests.
} satisfies Partial<ManifestOptions>

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Expresión que reconoce una llamada a la API a partir de `VITE_API_URL`.
 *
 * No se puede escribir `/api` a pelo: `api/client.ts` lee esa variable y
 * `env.example` documenta que en despliegue puede cambiar. Si el patrón y el
 * cliente no dijeran lo mismo, el service worker cachearía lo que no debe o
 * dejaría de cachear lo que sí.
 *
 * Se usa en dos sitios de Workbox que comparan contra cosas distintas —el
 * `runtimeCaching` contra la URL entera y el `navigateFallbackDenylist` contra
 * la ruta—, y por eso el patrón relativo va **sin anclar**: así casa en los dos.
 * El absoluto sí se ancla, porque ahí el origen es parte de la identidad.
 */
export function apiUrlPattern(base: string): RegExp {
  const normalized = base.replace(/\/+$/, '')

  if (normalized === '') {
    throw new Error(
      'VITE_API_URL no puede ser la raíz del origen: no habría forma de distinguir ' +
        'una llamada a la API de una ruta de la app (por ejemplo /movimientos).',
    )
  }

  const escaped = escapeRegExp(normalized)
  return /^https?:\/\//.test(normalized) ? new RegExp(`^${escaped}/`) : new RegExp(`${escaped}/`)
}
