/** Matchers de DOM (`toBeInTheDocument`, `toHaveValue`…) para todos los tests. */
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

/**
 * jsdom no implementa `ResizeObserver` y el `ResponsiveContainer` de recharts lo
 * instancia al montarse, así que sin esto el render **lanza** y se cae el test
 * entero. No basta con que el SVG vaya `aria-hidden`: eso lo esconde del árbol
 * de accesibilidad, no impide que se renderice.
 *
 * No mide nada —en jsdom no hay layout que medir— y no hace falta que mida: los
 * tests asertan sobre la lista o la tabla que cada gráfico renderiza a su lado,
 * nunca sobre el SVG. Lo que sí se sigue comprobando es que el gráfico se monta
 * sin reventar, que es el único fallo que un test de UI puede pillar aquí; por
 * eso los gráficos **no** se sustituyen por un mock.
 *
 * Va como asignación directa y no con `vi.stubGlobal` a propósito: varios tests
 * llaman a `vi.unstubAllGlobals()` en su `afterEach` para soltar el `fetch`
 * simulado, y eso devolvería esto a `undefined` a mitad de fichero.
 */
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver

// Testing Library solo desmonta sola cuando Vitest corre con `globals: true`, y
// aquí los imports son explícitos (como en el resto del repo). Sin esto, cada
// test encuentra también el DOM del anterior.
afterEach(cleanup)
