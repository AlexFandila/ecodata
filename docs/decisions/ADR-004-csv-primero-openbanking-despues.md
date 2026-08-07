# ADR-004 — CSV primero, Open Banking después (Enable Banking)

**Estado**: aceptada · 2026-08

## Contexto
Un particular no puede consumir directamente las APIs PSD2 de los bancos (requiere licencia AISP): hay que pasar por un agregador. La opción gratuita clásica, Nordigen / GoCardless Bank Account Data, cerró el registro a nuevos usuarios a mediados de 2025. La alternativa autoservicio habitual en Europa es Enable Banking, con un modo "restricted production" gratuito para acceder a las cuentas propias pre-vinculadas en su portal; Unicaja está cubierta vía la plataforma Redsys y la cobertura de Revolut debe verificarse antes de la Fase 4. Además, el consentimiento PSD2 caduca (≤ 180 días) y estas APIs fallan o cambian con frecuencia.

## Decisión
La ingesta es un puerto (`TransactionSource`) con adaptadores. Fase 1: adaptadores CSV de Unicaja y Revolut (la app es útil desde el primer día y no depende de terceros). Fase 4: `EnableBankingAdapter` como automatización opcional. El CSV se mantiene siempre como vía de respaldo.

## Consecuencias
- Cero bloqueo externo para el MVP; el pipeline (normalizar, dedupe por hash, matching) es idéntico venga de donde venga el dato.
- La caducidad del consentimiento se trata como caso de primera clase: la app avisa antes de que expire.
- Si Enable Banking cambiara condiciones, se sustituye el adaptador, no la app.
