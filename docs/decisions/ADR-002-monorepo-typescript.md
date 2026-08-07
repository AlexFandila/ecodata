# ADR-002 — Monorepo TypeScript de extremo a extremo

**Estado**: aceptada · 2026-08

## Contexto
La app tiene backend (API + importadores + motor financiero), frontend PWA y, más adelante, un servidor MCP. Se desarrollará principalmente con Claude Code, que trabaja mejor con un solo lenguaje, contratos tipados y tests que le permitan refactorizar sin miedo. La alternativa natural (backend Python) aportaría su ecosistema de datos, que este proyecto no necesita.

## Decisión
Monorepo pnpm con TypeScript estricto en todo: `apps/api` (Hono + Drizzle + SQLite), `apps/web` (React PWA), `apps/mcp` (Fase 3), `packages/core` (dominio puro) y `packages/shared` (esquemas zod como contratos compartidos, tipos derivados con `z.infer`).

## Consecuencias
- Tipos compartidos de la base de datos a la UI y al MCP: los contratos rompen en compilación, no en producción.
- Un solo toolchain (pnpm, Vitest, Biome) que Claude Code puede ejecutar y verificar en cada tarea.
- Si en el futuro un módulo exigiera Python, entraría como servicio aparte detrás de un puerto, sin romper esta decisión.
