/** Matchers de DOM (`toBeInTheDocument`, `toHaveValue`…) para todos los tests. */
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Testing Library solo desmonta sola cuando Vitest corre con `globals: true`, y
// aquí los imports son explícitos (como en el resto del repo). Sin esto, cada
// test encuentra también el DOM del anterior.
afterEach(cleanup)
