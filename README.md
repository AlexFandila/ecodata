# Finanzas

App personal de economía y finanzas: importa movimientos de Unicaja y Revolut, detecta transferencias internas, categoriza gastos, proyecta objetivos (vivienda, coche, fondo de emergencia) con datos del BCE/Banco de España y ofrece un asesor conversacional con Claude vía MCP. PWA mobile-first para Android e iPhone, también usable en escritorio.

**Estado**: Fases 0 y 1 completas — el MVP funciona de extremo a extremo. Se importan extractos reales de Unicaja (Norma 43) y Revolut (CSV), se deduplica por hash, se categoriza por reglas, se detectan y revisan las transferencias internas, y hay dashboard móvil en una PWA instalable. Siguiente: la Fase 2 del roadmap (objetivos, datos del BCE/BdE/INE y auth de la API).

## Cómo empezar

Lee `docs/PRIMERA_SESION.md` y arranca Claude Code en esta carpeta.

## Mapa del repositorio

- `CLAUDE.md` — contexto y reglas que Claude Code carga en cada sesión
- `docs/ARCHITECTURE.md` — módulos, fronteras, puertos y adaptadores, seguridad, despliegue
- `docs/DATA_MODEL.md` — entidades, invariantes, matching de transferencias, categorización
- `docs/ROADMAP.md` — plan por fases con criterios de aceptación
- `docs/decisions/` — decisiones de diseño (ADRs) y su porqué
- `.claude/` — permisos y comandos personalizados (`/tarea`, `/revisar`, `/actualizar-docs`)
- `apps/api` — Hono + Drizzle + SQLite; módulos `ingest`, `ledger` y `categorize`
- `apps/web` — PWA React + Vite, mobile-first
- `packages/core` — dominio puro y testeado, sin IO · `packages/shared` — contratos zod
- `data/` — datos bancarios reales: fuera de git y vetado a Claude Code

## Privacidad

Los datos reales viven solo en `data/` y en la base SQLite auto-alojada; nunca en git ni en nubes de terceros. **Este repositorio es público**, así que la regla no es una precaución: es el requisito que lo sostiene todo. Los tests y las fixtures usan siempre importes, nombres e IBANs inventados. Ver ADR-003 y la sección de datos sensibles de `CLAUDE.md`.
