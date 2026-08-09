#!/usr/bin/env node
/**
 * Genera los iconos de la PWA en `apps/web/public/`.
 *
 * Se dibujan por geometría y se codifican a PNG con el `zlib` de Node, sin
 * ninguna dependencia nueva. La alternativa era `@vite-pwa/assets-generator`,
 * que arrastra `sharp` (binario nativo) a una app de finanzas para producir
 * cuatro cuadrados de colores; ver ADR-017.
 *
 * El dibujo es tres barras ascendentes sobre fondo `slate-900`, en el mismo
 * `emerald-400` que marca la pestaña activa del `TabBar`, con las puntas
 * redondeadas de los iconos de la app. El suavizado sale de muestrear cada
 * píxel en una rejilla de 4×4.
 *
 * Ejecutar con `pnpm icons`. La salida es determinista: si el resultado no
 * cambia, `git status` sale limpio.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'public')

/** `slate-900`: el mismo `background_color` del manifest y `theme-color` del HTML. */
const BACKGROUND_HEX = '#0f172a'
/** `emerald-400`, el de la pestaña activa del `TabBar`. */
const BAR_HEX = '#34d399'

/** '#rrggbb' → [r, g, b]. */
function rgb(hex) {
  return [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16))
}

const BACKGROUND = rgb(BACKGROUND_HEX)
const BAR = rgb(BAR_HEX)

/**
 * Alturas de las tres barras y su opacidad, como fracción del cuadro de
 * contenido. La opacidad ascendente es lo que hace que se lea como una serie
 * que crece y no como tres palos sueltos.
 */
const BARS = [
  { height: 0.44, alpha: 0.5 },
  { height: 0.7, alpha: 0.74 },
  { height: 1, alpha: 1 },
]

/** Hueco entre barras, en fracción del ancho del cuadro de contenido. */
const GAP = 0.14

/** Muestras por lado y píxel. 4×4 basta para que no se vean los dientes. */
const SAMPLES = 4

/**
 * Margen alrededor del dibujo, en fracción del lado.
 *
 * El icono `maskable` necesita más porque el lanzador de Android puede recortar
 * hasta dejar solo el círculo central del 80 %: el cuadrado inscrito en ese
 * círculo tiene semilado 0.283, así que con un margen de 0.24 (semilado 0.26)
 * el dibujo entero cae dentro pase lo que pase.
 */
const INSET_ANY = 0.18
const INSET_MASKABLE = 0.24

/** ¿Cae el punto dentro del rectángulo de esquinas redondeadas? */
function insideRounded(x, y, x0, y0, x1, y1, radius) {
  const cx = Math.min(Math.max(x, x0 + radius), x1 - radius)
  const cy = Math.min(Math.max(y, y0 + radius), y1 - radius)
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= radius * radius
}

/** Geometría de las tres barras para un lienzo de lado `size`. */
function barRects(size, inset) {
  const box = size * (1 - 2 * inset)
  const left = size * inset
  const bottom = size * (1 - inset)
  const width = (box * (1 - 2 * GAP)) / 3

  return BARS.map((bar, index) => {
    const x0 = left + index * (width + box * GAP)
    const height = box * bar.height
    return {
      x0,
      x1: x0 + width,
      y0: bottom - height,
      y1: bottom,
      // Puntas de píldora, como el `stroke-linecap="round"` de los iconos.
      radius: Math.min(width, height) / 2,
      alpha: bar.alpha,
    }
  })
}

/** Devuelve los píxeles RGB (3 bytes por píxel) del icono. */
function render(size, inset) {
  const pixels = Buffer.alloc(size * size * 3)
  const rects = barRects(size, inset)
  const step = 1 / SAMPLES
  const offset = step / 2

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let coverage = 0

      for (const rect of rects) {
        // Descartar de golpe las barras que ni rozan este píxel.
        if (x + 1 < rect.x0 || x > rect.x1 || y + 1 < rect.y0 || y > rect.y1) continue

        let hits = 0
        for (let sy = 0; sy < SAMPLES; sy++) {
          for (let sx = 0; sx < SAMPLES; sx++) {
            const px = x + offset + sx * step
            const py = y + offset + sy * step
            if (insideRounded(px, py, rect.x0, rect.y0, rect.x1, rect.y1, rect.radius)) hits++
          }
        }
        // Las barras no se solapan: sumar sus coberturas es exacto.
        coverage += (hits / (SAMPLES * SAMPLES)) * rect.alpha
      }

      const at = (y * size + x) * 3
      for (let channel = 0; channel < 3; channel++) {
        const base = BACKGROUND[channel]
        pixels[at + channel] = Math.round(base + (BAR[channel] - base) * coverage)
      }
    }
  }

  return pixels
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/** PNG de 8 bits sin canal alfa (tipo de color 2): el fondo siempre es opaco. */
function encodePng(size, pixels) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bits por canal
  header[9] = 2 // RGB
  header[10] = 0 // compresión deflate
  header[11] = 0 // filtrado estándar
  header[12] = 0 // sin entrelazado

  const stride = size * 3
  const raw = Buffer.alloc(size * (stride + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filtro None: comprime de sobra con tan pocos colores
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** El mismo dibujo en vectorial, para la pestaña del navegador. */
function favicon() {
  const size = 64
  const bars = barRects(size, INSET_ANY)
    .map((rect) => {
      const width = (rect.x1 - rect.x0).toFixed(2)
      const height = (rect.y1 - rect.y0).toFixed(2)
      const radius = rect.radius.toFixed(2)
      return (
        `  <rect x="${rect.x0.toFixed(2)}" y="${rect.y0.toFixed(2)}" ` +
        `width="${width}" height="${height}" rx="${radius}" ` +
        `fill="${BAR_HEX}" fill-opacity="${rect.alpha}" />`
      )
    })
    .join('\n')

  // El `<title>` no es decoración: este SVG también pasa por el linter de
  // accesibilidad de Biome, y un icono sin alternativa textual es un error.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img">
  <title>Finanzas</title>
  <rect width="${size}" height="${size}" fill="${BACKGROUND_HEX}" />
${bars}
</svg>
`
}

const ICONS = [
  { file: 'pwa-192.png', size: 192, inset: INSET_ANY },
  { file: 'pwa-512.png', size: 512, inset: INSET_ANY },
  { file: 'pwa-maskable-512.png', size: 512, inset: INSET_MASKABLE },
  { file: 'apple-touch-icon-180.png', size: 180, inset: INSET_ANY },
]

mkdirSync(OUT_DIR, { recursive: true })

for (const icon of ICONS) {
  const png = encodePng(icon.size, render(icon.size, icon.inset))
  writeFileSync(join(OUT_DIR, icon.file), png)
  console.log(`  ${icon.file} — ${icon.size}×${icon.size}, ${png.length} B`)
}

writeFileSync(join(OUT_DIR, 'favicon.svg'), favicon())
console.log('  favicon.svg')
