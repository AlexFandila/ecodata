import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Un proyecto por paquete: `pnpm test` desde la raíz los recoge todos.
    projects: ['packages/*', 'apps/*'],
  },
})
