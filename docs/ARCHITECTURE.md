# Arquitectura

## Visión y principios

1. **Privacidad primero**: datos financieros en una SQLite auto-alojada, nunca en nubes de terceros. Acceso remoto desde el móvil por red privada (Tailscale).
2. **Determinismo en los cálculos**: toda la matemática financiera es código puro y testeado en `packages/core`. Los LLM explican e interpretan; no calculan.
3. **Monolito modular**: una sola app desplegable, pero con módulos de fronteras estrictas para poder crecer (módulo de autónomo, nuevas fuentes...) sin reescribir.
4. **Puertos y adaptadores**: lo volátil (formatos CSV, APIs bancarias, APIs de datos) se aísla detrás de interfaces. Cambiar de proveedor = escribir un adaptador.
5. **Mobile-first**: la PWA se diseña primero para pantalla de móvil (~390 px); el escritorio es la adaptación, no al revés.

## Estructura del monorepo

```
finanzas-app/
├── apps/
│   ├── api/                  # Hono + Drizzle + SQLite
│   │   └── src/
│   │       ├── modules/
│   │       │   ├── ingest/      # importación y normalización (adaptadores CSV, luego Open Banking)
│   │       │   ├── ledger/      # cuentas, movimientos, transferencias internas, saldos
│   │       │   ├── categorize/  # categorías y motor de reglas
│   │       │   ├── goals/       # objetivos y proyecciones (llama a core/finance)
│   │       │   ├── marketdata/  # BCE, Banco de España, INE (con caché local)
│   │       │   └── advisor/     # reglas de asesoría transparentes
│   │       ├── db/              # esquema Drizzle y migraciones
│   │       └── http/            # rutas, auth, arranque
│   ├── web/                  # React + Vite PWA (mobile-first)
│   └── mcp/                  # (Fase 3) servidor MCP de solo lectura
├── packages/
│   ├── core/                 # dominio puro, sin IO: money, matching, rules, finance
│   └── shared/               # esquemas zod + tipos (contratos)
├── data/                     # datos reales del usuario — git-ignored, vetado a Claude Code
└── docs/
```

## Fronteras entre módulos

- Cada módulo de `apps/api/src/modules/*` expone su API pública en `index.ts`. Los demás módulos solo pueden importar ese `index.ts` o `packages/shared`. Nunca ficheros internos.
- `packages/core` no importa nada de `apps/*` ni hace IO (ni base de datos, ni red, ni ficheros). Recibe datos, devuelve resultados. Esto lo hace trivial de testear y de reutilizar desde api y mcp.
- `packages/shared` define con zod todo lo que cruza una frontera: cuerpos HTTP, resultados de tools MCP, filas normalizadas de importación. Los tipos de TypeScript se derivan de los esquemas (`z.infer`), nunca se duplican a mano.

## Puertos y adaptadores

### Ingesta (`ingest`)

Puerto: `TransactionSource` — dado un input, devuelve `NormalizedTransaction[]` (esquema en shared).

Adaptadores previstos, en orden:
1. `UnicajaCsvAdapter` (Fase 1) — export de la web de Unicaja.
2. `RevolutCsvAdapter` (Fase 1) — export CSV de la app de Revolut (multidivisa).
3. `EnableBankingAdapter` (Fase 4) — Open Banking automático. Ver ADR-004.

El pipeline común (normalizar → hash → deduplicar → persistir → categorizar → emparejar transferencias) es único e independiente del adaptador.

### Datos de mercado (`marketdata`)

Puerto: `MarketSeriesProvider` — devuelve series temporales `(seriesId, date, value)`.

Adaptadores: `EcbSdmxAdapter` (portal de datos del BCE, API SDMX gratuita sin clave: inflación armonizada, tipos oficiales, tipos de cambio de referencia), `BdeAdapter` (euríbor), `IneAdapter` (IPC España). Todo se cachea en la tabla `market_series` para no depender de la red al consultar.

### Asesor (`advisor`)

Dos capas separadas a propósito:
1. **Motor de reglas** (determinista, en core + advisor): orden de prioridades transparente — fondo de emergencia de 3-6 meses → amortizar deuda cara → invertir excedente — parametrizado y explicable.
2. **Capa conversacional** (Fase 3): Claude, conectado por MCP, consulta el estado real y las salidas del motor y las explica en lenguaje natural. Ver ADR-005.

## Frontend (PWA)

- `vite-plugin-pwa`: manifest, iconos, service worker con caché básica para poder consultar el último estado sin conexión.
- Instalable en Android (prompt nativo) y en iPhone (Compartir → Añadir a pantalla de inicio). Ver ADR-001.
- Navegación inferior de 4-5 pestañas: Resumen · Movimientos · Objetivos · Aprender · Ajustes.
- Estado de servidor con TanStack Query; nada de estado global complejo mientras no haga falta.

## Servidor MCP (Fase 3)

Proceso aparte (`apps/mcp`) que reutiliza `packages/core` y el acceso de lectura a la base de datos. Herramientas de solo lectura:

`get_monthly_summary`, `list_transactions(filters)`, `get_spending_by_category`, `get_net_worth`, `get_goal_progress(goalId)`, `run_projection(params)`, `get_market_series(seriesId)`.

Reglas: solo lectura por defecto; si algún día se añade escritura (crear regla de categorización), cada llamada requiere confirmación explícita del usuario. Los importes se devuelven ya calculados: el LLM no recibe la tarea de sumar nada.

## Seguridad y datos sensibles

- Secretos en `.env` (nunca en código, nunca en git); `env.example` documenta las variables necesarias.
- Defensa en capas durante el desarrollo con Claude Code (ver ADR-006): el sandbox a nivel de sistema operativo es el muro real (cubre también subprocesos), las reglas `deny` de `.claude/settings.json` son la primera capa (`.env`, `data/`), el modo plan por defecto impide editar sin aprobación, dependency-cruiser convierte las fronteras de módulos en error de lint, y el hook pre-commit (lint + typecheck + escaneo de IBANs) es el suelo en git. `/revisar` queda como capa semántica para lo que exige juicio.
- La API escucha solo en localhost o en la interfaz de Tailscale. Auth mínima suficiente para un solo usuario en red privada: token estático en cabecera, guardado por la PWA. Endurecer solo si algún día se expone fuera.
- HTTPS para la PWA vía Tailscale (certificados integrados) o Caddy.
- Backups: script nocturno que copia el `.db` con fecha a `data/backups/` (y opcionalmente Litestream a un bucket cifrado).

## Despliegue

Docker Compose (api + web servida como estáticos) en un mini-PC/Raspberry en casa o un VPS pequeño, dentro de una tailnet de Tailscale. El móvil accede desde cualquier sitio a través de Tailscale sin exponer nada a internet.

## Cómo extender (checklist)

**Nuevo adaptador de ingesta**: implementar el puerto en `ingest/adapters/`, añadir fixtures sintéticos y tests del parser, registrar en el selector de fuentes. No tocar pipeline ni dominio.

**Nuevo módulo** (p. ej. `autonomo` en Fase 5): carpeta en `modules/` con `index.ts` público, contratos nuevos en shared, rutas propias, tests. Documentar aquí y añadir ADR si cambia alguna decisión.
