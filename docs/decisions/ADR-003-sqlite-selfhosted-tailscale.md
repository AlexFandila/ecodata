# ADR-003 — SQLite auto-alojada + acceso por Tailscale

**Estado**: aceptada · 2026-08

## Contexto
Los datos son movimientos bancarios reales de un único usuario: lo más sensible que existe. Debe poder consultarse desde el móvil en cualquier parte, pero no queremos exponer nada a internet ni depender de una base de datos en la nube de terceros.

## Decisión
SQLite en un único fichero, en un servidor propio (mini-PC/Raspberry en casa o VPS pequeño) dentro de una tailnet de Tailscale. La PWA y el móvil acceden por la red privada de Tailscale con HTTPS; la API no escucha en interfaces públicas. Auth mínima (token estático) suficiente mientras solo sea alcanzable dentro de la tailnet.

## Consecuencias
- Privacidad máxima y operación trivial: el backup es copiar un fichero (script nocturno; Litestream opcional).
- Requiere un aparato encendido; si se cae, la PWA muestra el último estado cacheado (solo lectura offline).
- SQLite basta de sobra para un usuario; si algún día hiciera falta Postgres, Drizzle reduce el coste de migración.
