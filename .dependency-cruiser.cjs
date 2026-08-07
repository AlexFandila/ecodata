/**
 * Fronteras de arquitectura como error de lint, no como convención.
 *
 * Traduce a reglas comprobables la regla 1 de CLAUDE.md y la sección "Fronteras
 * entre módulos" de docs/ARCHITECTURE.md. Si una de estas reglas te estorba,
 * la conversación es sobre la arquitectura (y un ADR), no sobre el linter.
 */

/** Paquetes de infraestructura que `packages/core` no puede tocar jamás. */
const INFRA_PACKAGES =
  'better-sqlite3|drizzle-orm|drizzle-kit|hono|@hono|@modelcontextprotocol|axios|node-fetch'

/** Builtins de Node que implican IO (o acceso al proceso) desde el dominio. */
const NODE_IO_BUILTINS =
  '^(node:)?(fs|fs/promises|net|http|https|http2|dgram|dns|tls|child_process|worker_threads|cluster|readline|repl|inspector|v8|vm|process)$'

module.exports = {
  forbidden: [
    {
      name: 'no-module-internals',
      severity: 'error',
      comment:
        'Un módulo de apps/api solo puede importar el index.ts público de otro módulo, nunca sus ficheros internos (CLAUDE.md, regla 1).',
      from: { path: '^apps/api/src/modules/([^/]+)/' },
      to: {
        path: '^apps/api/src/modules/([^/]+)/',
        pathNot: ['^apps/api/src/modules/$1/', '^apps/api/src/modules/[^/]+/index\\.ts$'],
      },
    },
    {
      name: 'no-module-internals-from-outside',
      severity: 'error',
      comment:
        'Desde fuera de modules/ (http, db, tests) solo se entra por el index.ts público de cada módulo.',
      from: { pathNot: '^apps/api/src/modules/' },
      to: {
        path: '^apps/api/src/modules/[^/]+/.+',
        pathNot: '^apps/api/src/modules/[^/]+/index\\.ts$',
      },
    },
    {
      name: 'core-no-apps',
      severity: 'error',
      comment: 'packages/core es dominio puro reutilizable: no conoce las apps (ARCHITECTURE.md).',
      from: { path: '^packages/core/' },
      to: { path: '^apps/' },
    },
    {
      name: 'core-no-io',
      severity: 'error',
      comment:
        'packages/core no hace IO: ni ficheros, ni red, ni proceso. Recibe datos y devuelve resultados.',
      from: { path: '^packages/core/' },
      to: { path: NODE_IO_BUILTINS, dependencyTypes: ['core'] },
    },
    {
      name: 'core-no-infra-deps',
      severity: 'error',
      comment:
        'packages/core no depende de base de datos, framework HTTP ni clientes de red. Eso vive en los adaptadores.',
      from: { path: '^packages/core/' },
      to: { path: `node_modules/(${INFRA_PACKAGES})(/|$)` },
    },
    {
      name: 'shared-is-leaf',
      severity: 'error',
      comment:
        'packages/shared son contratos: es una hoja del grafo, no importa de core ni de las apps.',
      from: { path: '^packages/shared/' },
      to: { path: '^(apps/|packages/core/)' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Las dependencias circulares hacen intratable el orden de inicialización.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'error',
      comment: 'Módulo que nadie importa y que no importa nada: sobra o falta enchufarlo.',
      from: {
        orphan: true,
        pathNot: [
          '(^|/)\\.[^/]+\\.(js|cjs|mjs|ts)$',
          '\\.d\\.ts$',
          '(^|/)(vite|vitest|tsup|biome)\\.config\\.(js|cjs|mjs|ts)$',
        ],
      },
      to: {},
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment: 'Import que no resuelve: o es una errata o falta una dependencia en package.json.',
      from: {},
      to: { couldNotResolve: true },
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|coverage|\\.dev)/' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
      mainFields: ['module', 'main', 'types'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
}
