---
description: Revisa los cambios pendientes contra las reglas del proyecto
allowed-tools: Read, Grep, Glob, Bash(git status), Bash(git diff:*)
---
Revisa los cambios sin commitear (`git status` y `git diff`) contra las reglas de CLAUDE.md y docs/ARCHITECTURE.md. Comprueba específicamente:

1. Fronteras de módulos: nada importa internals de otro módulo; solo `index.ts` públicos o `packages/shared`.
2. Dinero: enteros en céntimos + divisa; ningún float en importes ni cálculos financieros fuera de `packages/core`.
3. Datos que cruzan fronteras (HTTP, MCP, ficheros) validados con esquemas zod de `packages/shared`.
4. Ni rastro de datos reales: IBANs, nombres, movimientos o ficheros de `data/` en código, tests, fixtures o commits.
5. Lógica nueva con tests nuevos o actualizados; docs y ROADMAP.md al día si cambió el comportamiento.

Informa los hallazgos ordenados por severidad (bloqueante / mejorable / nota), con fichero y línea, y propón el arreglo concreto de cada uno. No hagas ningún cambio todavía.
