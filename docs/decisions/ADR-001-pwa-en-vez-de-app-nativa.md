# ADR-001 — PWA en vez de app nativa

**Estado**: aceptada · 2026-08

## Contexto
Prioridad móvil con Android como dispositivo principal, pero debe funcionar también en iPhone y en web. Es una app de uso personal: no habrá distribución por tiendas. Publicar nativo en iPhone exigiría cuenta de desarrollador de Apple (99 $/año) o firmas temporales incómodas; mantener dos apps nativas más una web es inviable para un solo desarrollador.

## Decisión
Una única PWA mobile-first (React + Vite + vite-plugin-pwa): instalable en Android con prompt nativo y en iPhone mediante "Añadir a pantalla de inicio". La web de escritorio es la misma app.

## Consecuencias
- Un solo código, cero fricción de tiendas, iteración rápida con Claude Code.
- Renunciamos a APIs nativas profundas; en iOS las PWA tienen límites (p. ej. notificaciones push solo desde iOS 16.4 y con la app instalada en pantalla de inicio).
- Puerta de salida documentada: si algún día hiciera falta nativo real, Capacitor permite envolver esta misma app web sin reescribirla.
