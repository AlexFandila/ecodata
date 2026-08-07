# Finanzas

App personal de economía y finanzas: importa movimientos de Unicaja y Revolut, detecta transferencias internas, categoriza gastos, proyecta objetivos (vivienda, coche, fondo de emergencia) con datos del BCE/Banco de España y ofrece un asesor conversacional con Claude vía MCP. PWA mobile-first para Android e iPhone, también usable en escritorio.

**Estado**: documentación lista; código pendiente (empezar por la Fase 0 del roadmap).

## Cómo empezar

Lee `docs/PRIMERA_SESION.md` y arranca Claude Code en esta carpeta.

## Mapa del repositorio

- `CLAUDE.md` — contexto y reglas que Claude Code carga en cada sesión
- `docs/ARCHITECTURE.md` — módulos, fronteras, puertos y adaptadores, seguridad, despliegue
- `docs/DATA_MODEL.md` — entidades, invariantes, matching de transferencias, categorización
- `docs/ROADMAP.md` — plan por fases con criterios de aceptación
- `docs/decisions/` — decisiones de diseño (ADRs) y su porqué
- `.claude/` — permisos y comandos personalizados (`/tarea`, `/revisar`, `/actualizar-docs`)
- `data/` — datos bancarios reales: fuera de git y vetado a Claude Code

## Privacidad

Los datos reales viven solo en `data/` y en la base SQLite auto-alojada; nunca en git ni en nubes de terceros. Ver ADR-003 y la sección de datos sensibles de `CLAUDE.md`.
