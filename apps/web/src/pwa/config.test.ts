import { describe, expect, it } from 'vitest'
import html from '../../index.html?raw'
import { APPLE_TOUCH_ICON, apiUrlPattern, manifest, THEME_COLOR } from './config'

/**
 * Los PNG de `public/` entran como data URL para poder leerles la cabecera sin
 * tocar el sistema de ficheros: `apps/web` no tiene tipos de Node y no vamos a
 * traérselos para un test.
 */
const files = import.meta.glob<string>('../../public/*', {
  eager: true,
  query: '?inline',
  import: 'default',
})

/** Data URL → los bytes que hacen falta para mirar la cabecera. */
function bytesOf(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const binary = atob(base64)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

/** Ancho y alto declarados en el chunk IHDR de un PNG. */
function pngSize(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

/** Busca en `public/` el fichero que sirve una ruta absoluta del manifest. */
function assetFor(src: string): string | undefined {
  return files[`../../public${src}`]
}

describe('manifest', () => {
  it('declara lo que hace instalable a la app', () => {
    expect(manifest.start_url).toBe('/')
    expect(manifest.scope).toBe('/')
    expect(manifest.display).toBe('standalone')
    expect(manifest.lang).toBe('es')

    // Los dos requisitos de icono que Chrome comprueba para ofrecer instalar.
    const any = manifest.icons.filter((icon) => icon.purpose === 'any')
    expect(any.some((icon) => icon.sizes === '192x192')).toBe(true)
    expect(any.some((icon) => icon.sizes === '512x512')).toBe(true)
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true)
  })

  it('sus iconos existen en public/ y miden lo que dicen medir', () => {
    // El fallo clásico de PWA: el manifest declara un icono que nadie commiteó,
    // y la instalación se cae sin decir por qué.
    for (const icon of manifest.icons) {
      const asset = assetFor(icon.src)
      expect(asset, `falta ${icon.src} en apps/web/public/`).toBeDefined()

      const [width, height] = icon.sizes.split('x').map(Number)
      expect(pngSize(bytesOf(asset as string)), icon.src).toEqual({ width, height })
    }
  })

  it('el icono de iOS existe y es cuadrado de 180', () => {
    const asset = assetFor(APPLE_TOUCH_ICON)
    expect(asset, `falta ${APPLE_TOUCH_ICON} en apps/web/public/`).toBeDefined()
    expect(pngSize(bytesOf(asset as string))).toEqual({ width: 180, height: 180 })
  })

  it('usa el mismo color que el theme-color del HTML', () => {
    // El navegador lee el del HTML antes de tener el manifest: si no coinciden,
    // la barra de estado cambia de color al instalar.
    const meta = /<meta name="theme-color" content="([^"]+)"/.exec(html)
    expect(meta?.[1]).toBe(THEME_COLOR)
    expect(manifest.theme_color).toBe(THEME_COLOR)
    expect(manifest.background_color).toBe(THEME_COLOR)
  })

  it('enlaza el icono de iOS y el favicon desde el HTML', () => {
    expect(html).toContain(`rel="apple-touch-icon" href="${APPLE_TOUCH_ICON}"`)
    expect(assetFor('/favicon.svg')).toBeDefined()
  })
})

describe('apiUrlPattern', () => {
  it('reconoce las llamadas a la API y no las rutas de la app', () => {
    const pattern = apiUrlPattern('/api')

    expect(pattern.test('/api/dashboard')).toBe(true)
    expect(pattern.test('/api/transactions?month=2026-08')).toBe(true)
    expect(pattern.test('https://finanzas.tailnet.ts.net/api/accounts')).toBe(true)

    // Estas son navegaciones de la SPA: ni se cachean como datos ni se les
    // puede quitar el fallback a index.html.
    expect(pattern.test('/')).toBe(false)
    expect(pattern.test('/movimientos')).toBe(false)
    expect(pattern.test('/movimientos/transferencias/emparejar')).toBe(false)
  })

  it('acepta una API en otro origen y no casa con orígenes parecidos', () => {
    const pattern = apiUrlPattern('https://api.finanzas.example')

    expect(pattern.test('https://api.finanzas.example/dashboard')).toBe(true)
    expect(pattern.test('https://api.finanzas.example.evil.test/dashboard')).toBe(false)
    expect(pattern.test('https://finanzas.example/dashboard')).toBe(false)
  })

  it('ignora la barra final para no exigir dos', () => {
    expect(apiUrlPattern('/api/').test('/api/dashboard')).toBe(true)
  })

  it('rechaza una base que se confundiría con las rutas de la app', () => {
    expect(() => apiUrlPattern('/')).toThrow(/raíz del origen/)
  })
})
