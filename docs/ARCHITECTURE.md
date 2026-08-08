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
│   │       │   ├── ingest/      # importación y normalización (adaptadores de fichero, luego Open Banking)
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

## Contratos (`packages/shared`)

Ser la hoja del grafo de dependencias es lo que convierte a `shared` en punto de encuentro: al no importar de `core` ni de las apps, pueden colgar de él la base de datos, la API, la PWA y el servidor MCP sin arrastrarse entre sí. De ahí que sea también **dueño de las listas de literales que cruzan fronteras** (divisas, proveedores y tipos de cuenta, origen de categoría, adaptadores de importación): están en `src/enums.ts` y el esquema Drizzle las importa de ahí en vez de tener su propia copia. Las que todavía solo usa la base de datos siguen en `apps/api/src/db/schema.ts` y se mudan cuando alguna tenga contrato.

La única lista que sigue duplicada es la de divisas, porque `packages/core` la necesita con sus decimales (ADR-008) y `shared` no puede importarla. La coherencia la fija un test en `apps/api`, el único paquete que depende de los dos.

Convenciones comunes a todos los contratos (ADR-009):

- **Dinero**: `amountCents` entero + `currency` ISO 4217, como campos hermanos, igual que en la base de datos. Nunca floats, nunca un importe sin divisa.
- **Fechas de calendario** (`bookedAt`, `valueDate`, filtros): texto ISO `YYYY-MM-DD`, validado de forma más estricta que el `GLOB` de SQLite —`2026-02-31` se rechaza—. **Instantes** (`importedAt`, `createdAt`): ISO 8601 UTC, aunque la base los guarde como epoch en milisegundos.
- **Las respuestas son objetos con clave nombrada** (`{ accounts: [...] }`), nunca arrays pelados: así admiten metadatos nuevos sin romper a quien ya las lee.
- **Lo interno no sale**: `raw`, `sourceHash` y `deletedAt` no aparecen en ninguna respuesta de la API.
- **Los errores también tienen contrato**: `{ error: { code, message, details? } }` con `code` de una lista cerrada, para que el cliente decida por el código y no por el texto del mensaje.

`NormalizedTransaction` es el contrato del puerto `TransactionSource`: el movimiento tal como sale de un adaptador, **antes** de hash, deduplicación y persistencia. Por eso no lleva `accountId` (la cuenta la elige el usuario al subir el fichero) ni `sourceHash` (se calcula después, e incluye la cuenta), pero sí `raw`: el adaptador es el único que ve la fila original y el invariante 4 exige conservarla.

## Puertos y adaptadores

### Ingesta (`ingest`)

Puerto: `TransactionSource` — dado un input, devuelve `NormalizedTransaction[]` más los errores por fila que no impidieron leer el resto (esquemas en shared). Recibe **bytes**, no texto: el encoding es propiedad del formato, así que lo decide el adaptador y no la capa HTTP. La entrada es genérica (`TransactionSource<TInput = Uint8Array>`) porque el adaptador de la Fase 4 recibirá JSON.

Adaptadores previstos, en orden:
1. `Norma43Adapter` (Fase 1) — cuaderno 43 de la AEB, que es lo que exporta Unicaja. Al ser un estándar, sirve para cualquier banco español que lo emita: los literales de `IMPORT_SOURCES` nombran el formato, no el banco. Ver ADR-010.
2. `RevolutCsvAdapter` (Fase 1) — export CSV de la app de Revolut: multidivisa por fila, cabecera y valores traducidos al idioma de la app, y una columna de saldo que permite verificar la lectura. Ver ADR-011.
3. `EnableBankingAdapter` (Fase 4) — Open Banking automático. Ver ADR-004.

Un fichero mal formado, o cuyos totales no cuadran con lo leído, es un error del fichero y aborta la importación. Una fila suelta ilegible no: se salta y se reporta, para que un extracto con tres apuntes raros importe los otros doscientos.

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
