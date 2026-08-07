# ADR-007 — Hook pre-commit versionado en `.githooks/` en vez de generado por simple-git-hooks

**Estado**: aceptada · 2026-08 · sustituye el mecanismo de instalación del hook descrito en la Fase 0 del roadmap (no la decisión del ADR-006, que sigue vigente)

## Contexto

El ADR-006 fija que el hook pre-commit es el suelo de la defensa en capas. La Fase 0 lo implementó con `simple-git-hooks`, que en el `prepare` de `pnpm install` **genera** `.git/hooks/pre-commit`. En la práctica falló dos veces seguidas y por dos motivos distintos:

1. Dentro del sandbox de Claude Code, `.git/` es de solo lectura: la generación aborta con `EROFS`. El sandbox es una decisión deliberada (ADR-006) y no se va a aflojar por esto, así que el hook nunca puede instalarse ni verificarse desde una sesión de Claude Code.
2. Fuera del sandbox tampoco se instaló: con las dependencias ya resueltas, pnpm trata la instalación como un no-op y se salta los scripts de ciclo de vida, `prepare` entre ellos.

El fallo compartido es más de fondo: el hook era un **fichero generado y no versionado**. No aparece en ningún diff, nadie lo revisa, hay que regenerarlo en cada clon y su existencia depende de un efecto secundario de la instalación de dependencias. Un commit con un IBAN pasó limpio las dos veces sin que nada avisara: el suelo no estaba puesto y no había forma de notarlo salvo probándolo.

## Decisión

El hook pasa a ser código versionado del repositorio:

- `.githooks/pre-commit` (ejecutable, en git) invoca `node scripts/precommit.mjs`.
- Git lo encuentra con `git config core.hooksPath .githooks`, una vez por clon. Queda como script `pnpm hooks`.
- Se elimina la dependencia `simple-git-hooks` y el script `prepare`.

La lógica del hook no cambia: escaneo de IBANs sobre el contenido staged, luego `pnpm lint` y `pnpm typecheck`.

## Consecuencias

- El hook se revisa como cualquier otro código: entra en los diffs y en `/revisar`.
- Deja de depender de que una instalación de dependencias tenga trabajo que hacer.
- Sigue haciendo falta **un** comando manual por clon (`pnpm hooks`), ejecutado en una terminal normal: `git config` escribe en `.git/config`, que el sandbox tampoco permite. Es el mismo coste que antes, pero ahora explícito y verificable (`git config core.hooksPath` responde) en vez de implícito en un `pnpm install`.
- `core.hooksPath` desactiva `.git/hooks/`. En este repo está vacío salvo los `.sample`, así que no se pierde nada.
- El escaneo de IBANs se puede seguir probando sin hook instalado con `node scripts/precommit.mjs` sobre algo staged, que es como se verificó en la Fase 0.
