# Primera sesión con Claude Code

## 1. Preparar el entorno

1. Instala Node 22 LTS y pnpm. En Arch: `sudo pacman -S nodejs-lts-jod npm pnpm` (o activa pnpm con `corepack enable`).
2. Instala las dependencias del sandbox. En Arch: `sudo pacman -S bubblewrap socat`. Opcional pero recomendado, el filtro seccomp: `npm install -g @anthropic-ai/sandbox-runtime`.
3. Instala Claude Code: `npm install -g @anthropic-ai/claude-code` (documentación oficial: https://docs.claude.com/en/docs/claude-code/overview).
4. Abre una terminal en la carpeta raíz del proyecto, ejecuta `claude` y, dentro, `/sandbox` para activar el aislamiento a nivel de sistema operativo (elige el modo de auto-permitir dentro del sandbox). Si falta alguna dependencia, la pestaña Dependencies de ese mismo menú te dirá cuál.

Claude Code leerá automáticamente `CLAUDE.md` y la configuración de `.claude/` (permisos y comandos personalizados ya incluidos).

## 2. Primer prompt sugerido

Copia esto tal cual en la primera sesión:

> Lee CLAUDE.md, docs/ARCHITECTURE.md, docs/DATA_MODEL.md y docs/ROADMAP.md. Resúmeme en 5 líneas cómo entiendes el proyecto y sus reglas, y dime si ves alguna contradicción. Después, propón un plan para completar la Fase 0 del roadmap y espera mi aprobación antes de ejecutarlo.

Cuando la Fase 0 esté en verde, continúa tarea a tarea con el comando `/tarea`, por ejemplo:

> /tarea Fase 1 — tipo Money en packages/core

## 3. Comandos personalizados incluidos

- `/tarea <descripción>` — planifica e implementa una tarea del roadmap (pide plan primero).
- `/revisar` — revisa los cambios sin commitear contra las reglas del proyecto antes de cada commit.
- `/actualizar-docs` — detecta desviaciones entre código y documentación y propone las correcciones.

## 4. Hábitos que funcionan bien

- **Una tarea por sesión**: sesiones cortas y enfocadas dan mejor resultado; limpia el contexto entre tareas que no tengan relación.
- **Plan antes que código**, ahora por configuración: las sesiones arrancan en modo plan (`defaultMode: "plan"` en settings), así que Claude Code puede explorar y proponer pero no edita nada hasta que apruebes. Para tareas triviales, Mayús+Tab cambia de modo al vuelo.
- **Commits pequeños y frecuentes**: después de cada tarea en verde. Si algo sale mal, `git` es tu deshacer.
- **`/revisar` antes de commitear**, especialmente el punto de datos reales.
- **Tests primero en `packages/core`**: pídele explícitamente "escribe primero los tests del matching con estos casos borde y luego la implementación".
- **Mantén el roadmap vivo**: si surge una idea nueva, pídele que la añada a la fase que toque en vez de implementarla sobre la marcha.

## 5. Seguridad ya configurada

- Defensa en capas, de fuera adentro. El sandbox (`/sandbox`) es el muro real: aplicación a nivel de sistema operativo que ata también a los subprocesos — un script de Node que intente leer `data/` choca contra el SO, no contra una instrucción. Las reglas de `.claude/settings.json` son la primera capa: deniegan `.env` y `data/` a las herramientas de Claude y pre-aprueban los comandos seguros habituales (`pnpm test`, `git diff`...). Amplía la lista cuando un mismo aviso te salga por segunda vez.
- Las sesiones arrancan en modo plan (configurado en settings): nada se edita hasta que apruebas. Mayús+Tab lo cambia cuando quieras trabajar en directo.
- El hook pre-commit es el suelo: lint + typecheck + escaneo de IBANs sobre lo staged, por si algún día tú o Claude os saltáis el ritual. Vive versionado en `.githooks/` (ADR-007) y se activa con `pnpm hooks` una vez por clon, en una terminal normal: el sandbox tiene `.git/` en solo lectura, así que esto no se puede hacer desde dentro de Claude Code. Compruébalo con `git config core.hooksPath`.
- `data/`, `*.db` (y sus `-wal`/`-shm`) están en `.gitignore`. Los CSVs reales van siempre a `data/`, nunca a otra carpeta. Si algún día usas un repositorio remoto, que sea privado, y aun así: cero datos reales en git.
