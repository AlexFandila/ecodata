import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  // Los paquetes del workspace se exportan como TypeScript fuente, así que hay
  // que meterlos en el bundle en vez de dejarlos como dependencia externa.
  noExternal: ['@finanzas/core', '@finanzas/shared'],
})
