# ADR-005 — La IA no calcula: motor determinista + MCP de solo lectura

**Estado**: aceptada · 2026-08

## Contexto
Se quiere un asesor conversacional con acceso a los datos. Los LLM son poco fiables haciendo aritmética y no deben recibir volcados masivos de datos sensibles. Las alternativas consideradas: exportar CSV y pegarlo en el chat (manual, datos de más), dar al LLM acceso directo a la base de datos (peligroso e inauditables), o exponer herramientas controladas.

## Decisión
Toda la matemática financiera vive en `packages/core` como funciones puras y testeadas. Claude se conecta mediante un servidor MCP (`apps/mcp`) con herramientas de **solo lectura** que devuelven agregados y resultados ya calculados (`get_monthly_summary`, `run_projection`, …). Las recomendaciones nacen de un motor de reglas transparente (fondo de emergencia → deuda cara → invertir excedente) que el LLM explica con los números del usuario.

## Consecuencias
- Cifras siempre correctas y auditables; el LLM aporta lenguaje y pedagogía, no cálculo.
- Privacidad por diseño: cada tool devuelve lo mínimo necesario; nada de dumps completos.
- Si algún día se añaden tools de escritura (p. ej. crear una regla), cada llamada exigirá confirmación explícita del usuario.
