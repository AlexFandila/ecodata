---
description: Planifica e implementa una tarea del roadmap
argument-hint: [fase y tarea, p. ej. "Fase 1 — matching de transferencias"]
---
Vamos a trabajar en: $ARGUMENTS

1. Lee CLAUDE.md, docs/ROADMAP.md y las secciones relevantes de docs/ARCHITECTURE.md y docs/DATA_MODEL.md.
2. Propón un plan corto: pasos, ficheros a crear o tocar, tests a escribir, y qué NO vas a tocar. Espera mi aprobación antes de escribir código.
3. Implementa respetando las reglas de arquitectura (fronteras de módulos, dinero en céntimos, cálculo solo en packages/core, datos sintéticos).
4. Al terminar: ejecuta `pnpm test`, `pnpm typecheck` y `pnpm lint`; marca la casilla correspondiente en docs/ROADMAP.md; y proponme un commit con mensaje convencional en español.
