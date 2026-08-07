# Finanzas — app personal de economía y finanzas

App personal (un solo usuario) para aprender economía y gestionar finanzas: importa movimientos de Unicaja y Revolut, detecta transferencias internas entre cuentas propias, categoriza gastos, proyecta objetivos (vivienda, coche, fondo de emergencia) con datos del BCE/Banco de España, y expone un servidor MCP para que Claude actúe de asesor. Prioridad móvil (PWA instalable en Android/iPhone), también usable en web de escritorio.

El plan de trabajo vive en `docs/ROADMAP.md`. Las decisiones de diseño están en `docs/decisions/`.

## Stack

- Monorepo pnpm workspaces. TypeScript estricto en todo. Node 22 LTS.
- `apps/api`: Hono + Drizzle ORM + SQLite (better-sqlite3).
- `apps/web`: React + Vite + vite-plugin-pwa + Tailwind + TanStack Query. Mobile-first (diseñar a ~390 px, navegación de pestañas inferior).
- `apps/mcp` (Fase 3): servidor MCP con `@modelcontextprotocol/sdk`, herramientas de solo lectura.
- `packages/core`: dominio puro (dinero, matching de transferencias, motor de reglas, motor financiero). Sin IO, sin dependencias de framework. Cobertura de tests alta.
- `packages/shared`: esquemas zod + tipos derivados = contratos entre módulos y apps.
- Tooling: Vitest, Biome (lint + formato).

## Comandos

Se crean en la Fase 0 y deben mantenerse funcionando siempre:

- `pnpm dev` — levanta api + web
- `pnpm test` — todos los tests (Vitest)
- `pnpm typecheck` — `tsc --noEmit` en todos los paquetes
- `pnpm lint` — Biome + dependency-cruiser (las fronteras de módulos fallan aquí)
- `pnpm build` — compila todo; no entra en el ciclo por tarea, pero debe estar en verde al cerrar cada fase

## Reglas de arquitectura (importantes)

1. Monolito modular con puertos y adaptadores. Los módulos de `apps/api` (`ingest`, `ledger`, `categorize`, `goals`, `marketdata`, `advisor`) solo se comunican entre sí a través de su `index.ts` público o de los contratos de `packages/shared`. Nunca importar internals de otro módulo. Estas fronteras las aplica dependency-cruiser dentro de `pnpm lint`: no son convención, son error de lint.
2. Todo cálculo financiero (proyecciones, hipotecas, escenarios) vive en `packages/core` como funciones puras con tests. La IA nunca hace aritmética: consulta herramientas que llaman a este motor.
3. Dinero: siempre enteros en céntimos (`amountCents: number`) + divisa ISO 4217. Prohibidos los floats en importes.
4. Los datos importados nunca se destruyen: el registro crudo (`raw`) se conserva; la deduplicación se hace por hash. Las transferencias internas emparejadas se excluyen de ingresos/gastos pero sí mueven saldos.
5. Una fuente de datos nueva (otro banco, otra API) = un adaptador nuevo que implementa un puerto existente. No tocar el dominio para añadir fuentes.
6. Antes de cambiar estructura de carpetas o esquema de base de datos, leer `docs/ARCHITECTURE.md` y `docs/DATA_MODEL.md`. Si se cambia una decisión de diseño, añadir un ADR en `docs/decisions/`.

## Datos sensibles

- `data/` contiene datos bancarios reales del usuario: está en `.gitignore` y vetado para Claude Code (ver `.claude/settings.json`). No leerlo ni pedir leerlo.
- Nunca commitear datos reales: ni CSVs, ni `.db`, ni `.env`. Verificar `git status` antes de cada commit.
- Tests, fixtures y ejemplos usan siempre datos sintéticos (nombres, IBANs e importes inventados). La base de datos de desarrollo vive en `apps/api/.dev/` con datos de la semilla sintética.
- El veto se aplica en capas: reglas `deny` de settings, sandbox de Claude Code a nivel de sistema operativo (cubre también subprocesos: ningún script ni test debe leer `data/`, y con el sandbox activo tampoco podrá), y hook pre-commit que escanea IBANs (`ES` + 22 dígitos) en lo staged.

## Convenciones

- Código, identificadores y nombres de tabla en inglés; UI, textos al usuario, docs y commits en español.
- Commits: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`), pequeños y atómicos.
- En `packages/core`, escribir el test antes o junto al código (la lógica de negocio sin test no se mergea).
- Zod primero: cualquier dato que cruza una frontera (HTTP, MCP, fichero) se valida con un esquema de `packages/shared`.
- El fichero de ejemplo de configuración se llama `env.example` (sin punto inicial), para que ni `.gitignore` ni las reglas `deny` sobre `.env.*` lo bloqueen. El real es `.env` y nunca se commitea.

## Flujo de trabajo

- Trabajar una tarea del `docs/ROADMAP.md` cada vez; al terminarla, marcar su casilla.
- Para tareas no triviales: proponer plan corto y esperar aprobación antes de escribir código (o usar `/tarea`).
- Definición de hecho: `pnpm test`, `pnpm typecheck` y `pnpm lint` pasan; docs actualizadas si cambió el comportamiento; casilla del roadmap marcada.
