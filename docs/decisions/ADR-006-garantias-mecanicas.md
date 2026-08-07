# ADR-006 — Garantías mecánicas por encima de promesas del modelo

**Estado**: aceptada · 2026-08

## Contexto
Una revisión externa de la metodología detectó tres puntos donde las reglas dependían de que el modelo obedeciera instrucciones en vez de que una herramienta las aplicara: (1) el veto a `data/` y `.env` se saltaba con subprocesos — un `node -e` con `fs.readFileSync` no pasa por las reglas de permisos, que cubren las herramientas de fichero y los comandos de lectura reconocidos en Bash; (2) el "espera mi aprobación" del plan era una instrucción de prompt, no una restricción; (3) las fronteras de módulos solo las vigilaba `/revisar`, es decir, otro LLM. Además, los patrones tipo `Bash(rm -rf:*)` son prefijos literales fáciles de esquivar sin querer (`rm -fr`), como avisa la propia documentación.

## Decisión
Aplicar en cada punto la herramienta que lo convierte en garantía: sandbox de Claude Code activado (aislamiento a nivel de sistema operativo que cubre también los subprocesos de Bash; en Linux requiere `bubblewrap` y `socat`), `"defaultMode": "plan"` en `.claude/settings.json` (las sesiones no editan nada hasta aprobar el plan), dependency-cruiser dentro de `pnpm lint` (las fronteras de la regla 1 de arquitectura fallan el lint en vez de depender de una revisión), y hook pre-commit con lint + typecheck + escaneo de IBANs (`ES\d{22}`) sobre lo staged. El fichero de ejemplo de configuración se llama `env.example` para que las reglas sobre `.env.*` no lo bloqueen (un `deny` no admite excepciones vía `allow`). Los `deny` de comandos peligrosos se conservan como fricción, no como muro: el muro es el sandbox y la red de recuperación es git.

## Consecuencias
- `/revisar` queda para lo que sí exige juicio (floats en dinero, datos reales en fixtures, zod en fronteras); lo linteable lo vigila el linter.
- El modo plan añade un paso a las tareas triviales; se puentea por sesión con Mayús+Tab cuando compense.
- La protección de los datos reales deja de depender de que alguien "se porte bien": settings, sandbox, gitignore y hook fallan por separado y cubren por capas.
