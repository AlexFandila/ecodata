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
│   │       │   ├── goals/       # (Fase 2) objetivos y proyecciones (llama a core/finance)
│   │       │   ├── marketdata/  # (Fase 2) BCE, Banco de España, INE (con caché local)
│   │       │   └── advisor/     # (Fase 3) reglas de asesoría transparentes
│   │       ├── db/              # esquema Drizzle y migraciones
│   │       ├── http/            # rutas y arranque (la auth es de la Fase 2: hoy no hay)
│   │       └── seed/            # `pnpm seed`: datos sintéticos; `--empty`, base para datos reales
│   ├── web/                  # React + Vite PWA (mobile-first)
│   └── mcp/                  # (Fase 3) servidor MCP de solo lectura
├── packages/
│   ├── core/                 # dominio puro, sin IO: money, dedupe, dates, matching, rules, summary (+ finance en la Fase 2)
│   └── shared/               # esquemas zod + tipos (contratos)
├── scripts/                  # utilidades sin dependencias: generador de iconos (`pnpm icons`), cuerpo del hook pre-commit
├── data/                     # datos reales del usuario — git-ignored, vetado a Claude Code
└── docs/
```

## Fronteras entre módulos

- Cada módulo de `apps/api/src/modules/*` expone su API pública en `index.ts`. Los demás módulos solo pueden importar ese `index.ts` o `packages/shared`. Nunca ficheros internos.
- `packages/core` no importa nada de `apps/*` ni hace IO (ni base de datos, ni red, ni ficheros). Recibe datos, devuelve resultados. Esto lo hace trivial de testear y de reutilizar desde api y mcp.
- `packages/shared` define con zod todo lo que cruza una frontera: cuerpos HTTP, resultados de tools MCP, filas normalizadas de importación. Los tipos de TypeScript se derivan de los esquemas (`z.infer`), nunca se duplican a mano.

## Contratos (`packages/shared`)

Ser la hoja del grafo de dependencias es lo que convierte a `shared` en punto de encuentro: al no importar de `core` ni de las apps, pueden colgar de él la base de datos, la API, la PWA y el servidor MCP sin arrastrarse entre sí. De ahí que sea también **dueño de las listas de literales que cruzan fronteras** (divisas, proveedores y tipos de cuenta, tipo y origen de categoría, campo y comparación de una regla, adaptadores de importación, estados y señales de una transferencia interna): están en `src/enums.ts` y el esquema Drizzle las importa de ahí en vez de tener su propia copia. La única que todavía solo usa la base de datos, `GOAL_TYPES`, sigue en `apps/api/src/db/schema.ts` y se mudará cuando tenga contrato.

Las listas duplicadas son tres, y por el mismo motivo: `packages/core` necesita las divisas con sus decimales (ADR-008), necesita saber qué campos y comparaciones admite una regla (ADR-014) y es quien produce las señales del matching de transferencias (ADR-013), pero no puede importar de `shared`. La coherencia la fijan sendos tests en `apps/api`, el único paquete que depende de los dos.

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

El pipeline común (normalizar → hash → deduplicar → persistir → categorizar → emparejar transferencias) es único e independiente del adaptador. Las tres primeras etapas son de `ingest`, la de categorizar es de `categorize` y la de emparejar es de `ledger`; **quien las encadena es la ruta HTTP, no los módulos entre sí** (ADR-014, punto 7). Así `ingest` no sabe que existen ninguno de los otros dos. El emparejado va el último y no antes de categorizar: escribe `internal_transfer` encima de lo que hubieran puesto las reglas, que es lo que manda el invariante 3 (ADR-015).

### Datos de mercado (`marketdata`)

Puerto: `MarketSeriesProvider` — devuelve series temporales `(seriesId, date, value)`.

Adaptadores: `EcbSdmxAdapter` (portal de datos del BCE, API SDMX gratuita sin clave: inflación armonizada, tipos oficiales, tipos de cambio de referencia), `BdeAdapter` (euríbor), `IneAdapter` (IPC España). Todo se cachea en la tabla `market_series` para no depender de la red al consultar.

### Asesor (`advisor`)

Dos capas separadas a propósito:
1. **Motor de reglas** (determinista, en core + advisor): orden de prioridades transparente — fondo de emergencia de 3-6 meses → amortizar deuda cara → invertir excedente — parametrizado y explicable.
2. **Capa conversacional** (Fase 3): Claude, conectado por MCP, consulta el estado real y las salidas del motor y las explica en lenguaje natural. Ver ADR-005.

## Frontend (PWA)

- `vite-plugin-pwa` en modo `generateSW`: manifest e iconos en `apps/web/public/`, y un service worker que **precachea el armazón** (HTML, JS, CSS, iconos) y sirve los `GET` de la API con `NetworkFirst` y 24 horas de caducidad, para poder consultar el último estado con el servidor apagado. Las escrituras no pasan por él: offline es **de solo lectura**, sin cola ni background sync. Ver ADR-017, que recoge también por qué se asume tener movimientos bancarios en el `CacheStorage` del dispositivo y por qué los iconos los genera un script propio (`pnpm icons`) en vez de `sharp`.
- El manifest y el patrón que decide qué es «la API» viven en `src/pwa/config.ts` como datos, no como literales dentro de `vite.config.ts`: el patrón se deriva de la **misma** `VITE_API_URL` que lee `api/client.ts` —si divergieran, el service worker cachearía otra cosa— y así los dos se comprueban con tests (`src/pwa/config.test.ts`), incluido que cada icono declarado exista y mida lo que dice.
- Instalable en Android (prompt nativo) y en iPhone (Compartir → Añadir a pantalla de inicio). Lo que iOS no saca del manifest —`apple-touch-icon` y las metas de `apple-mobile-web-app-*`— va a mano en `index.html`. Ver ADR-001.
- Navegación inferior de 4-5 pestañas: Resumen · Movimientos · Objetivos · Aprender · Ajustes. Van cuatro montadas, pero solo tres tienen contenido: *Objetivos* es todavía una pantalla vacía —la tabla `goals` existe desde la Fase 1 por la semilla, pero no hay módulo, ni contratos, ni rutas— y se llena en la Fase 2. *Aprender* ni siquiera está montada: entra con su módulo en la Fase 5.
- Estado de servidor con TanStack Query; nada de estado global complejo mientras no haga falta.
- Router: `react-router` en modo declarativo (`<BrowserRouter>` + `<Routes>`), sin rutas por ficheros ni build de servidor: la PWA se sirve como estáticos.
- Las direcciones van en español porque el usuario las ve (`/movimientos`, `/ajustes/importar`); los ficheros y los identificadores, en inglés como el resto del código.

Estructura de `apps/web/src`:

- `api/` — el único sitio que habla con la API. `client.ts` traduce el contrato de error de ADR-009 a un `ApiError` que **conserva el `code`**, para que las pantallas decidan por el código y no por el texto; los demás ficheros son un módulo por recurso y validan la respuesta con el esquema de `shared`.
- `screens/` — una pantalla por ruta. `components/` — lo compartido entre pantallas (`AppLayout`, `TabBar`, `Screen`, `Field`, `Notice`, `Tabs`, `MonthNav`) y, dentro, `components/charts/` para los gráficos. `TabBar` es la navegación de la app; `Tabs` es el control segmentado que reparte una sección en vistas («Todos · Sin categorizar · Transferencias»), y distingue `TabButton` —cambia un filtro de la pantalla en la que ya estás— de `TabLink` —te lleva a otra ruta—, porque un enlace disfrazado de botón se come el «abrir en otra pestaña» y el botón atrás deja de deshacer.
- **Los gráficos son recharts y ninguno viaja solo**: el SVG va `aria-hidden` y el mismo componente renderiza a su lado la misma información como lista o tabla. No es una regla para poder testear —un SVG de barras no le dice nada a un lector de pantalla, y en 390 px una etiqueta dentro de una barra no cabe—, y que las dos mitades salgan del mismo componente es lo que impide enviar una sin la otra. Los tests asertan sobre el texto, nunca sobre el SVG. `emerald` y `rose` significan **signo** en toda la app; para magnitud sin signo, `sky`. Ver ADR-016, que recoge también lo que recharts pesa y por dónde se sale de él si algún día estorba.
- `format/` — pintar importes y fechas. Existe porque `apps/web` **no puede importar `packages/core`**, donde vive `formatMoney`: la regla `web-only-shared` se lo prohíbe. Las dos salidas obvias eran duplicar aquí la tabla de divisas o mudar `CURRENCIES` a `shared`, que es lo que ADR-009 avisa que exigiría revisar `shared-is-leaf` y merecería su propio ADR. No hace falta ninguna: **los decimales de cada divisa los sabe el propio `Intl`** (`resolvedOptions().maximumFractionDigits`), así que no hay lista que mantener ni decisión que revisar. Las fechas de calendario se trocean y se formatean en UTC, porque pasarlas por `new Date(iso)` y formatearlas en la zona local las retrasa un día al oeste de Greenwich —el desfase que DATA_MODEL.md evita guardándolas como texto—.
- Tests de UI con Vitest en entorno jsdom y Testing Library, junto al componente (`X.test.tsx`), simulando `fetch`. No hay servidor de mentira: el cliente HTTP es un único punto de entrada y basta con `vi.stubGlobal`.

`apps/web` solo conoce `packages/shared`: nunca importa de `apps/api` ni de `packages/core`. Lo aplica la regla `web-only-shared` de dependency-cruiser, no la buena voluntad.

## Servidor MCP (Fase 3)

Proceso aparte (`apps/mcp`) que reutiliza `packages/core` y el acceso de lectura a la base de datos. Herramientas de solo lectura:

`get_monthly_summary`, `list_transactions(filters)`, `get_spending_by_category`, `get_net_worth`, `get_goal_progress(goalId)`, `run_projection(params)`, `get_market_series(seriesId)`.

Reglas: solo lectura por defecto; si algún día se añade escritura (crear regla de categorización), cada llamada requiere confirmación explícita del usuario. Los importes se devuelven ya calculados: el LLM no recibe la tarea de sumar nada.

## Seguridad y datos sensibles

- Secretos en `.env` (nunca en código, nunca en git); `env.example` documenta las variables necesarias. Ahí vive también lo que no es un secreto pero sí dato personal: `HOLDER_NAMES`, las variantes del nombre del titular que el matching de transferencias reconoce en los extractos (ADR-013 decisión 5). Se lee una sola vez, en el arranque, y viaja por parámetro hasta las rutas —`createApp(db, { holderNames })`— para que ninguna se lea su propia configuración por su cuenta. Por la misma puerta entra `today`, el reloj que `GET /dashboard` usa para resolver «el mes en curso»: no es un secreto, pero sí es algo que una ruta que lo mirase por su cuenta volvería incomprobable (ADR-016 decisión 6).
- Defensa en capas durante el desarrollo con Claude Code (ver ADR-006): el sandbox a nivel de sistema operativo es el muro real (cubre también subprocesos), las reglas `deny` de `.claude/settings.json` son la primera capa (`.env`, `data/`), el modo plan por defecto impide editar sin aprobación, dependency-cruiser convierte las fronteras de módulos en error de lint, y el hook pre-commit (lint + typecheck + escaneo de IBANs) es el suelo en git. `/revisar` queda como capa semántica para lo que exige juicio.
- La API escucha solo en localhost (`hostname: '127.0.0.1'` en `apps/api/src/index.ts`) o en la interfaz de Tailscale. **Hoy eso es toda la defensa: la API no autentica.** No hay middleware de auth ni cabecera que se compruebe, aunque `env.example` declare `API_TOKEN` desde la Fase 0. Lo previsto —token estático en cabecera, guardado por la PWA, auth mínima suficiente para un solo usuario en red privada— es una casilla de la Fase 2 del roadmap. Mientras no esté, cualquiera con acceso a la tailnet o a ese puerto lee los movimientos sin credencial. Endurecer más allá del token solo si algún día se expone fuera.
- HTTPS para la PWA vía Tailscale (certificados integrados) o Caddy.
- Backups: script nocturno que copia el `.db` con fecha a `data/backups/` (y opcionalmente Litestream a un bucket cifrado).

## Despliegue

Docker Compose (api + web servida como estáticos) en un mini-PC/Raspberry en casa o un VPS pequeño, dentro de una tailnet de Tailscale. El móvil accede desde cualquier sitio a través de Tailscale sin exponer nada a internet.

## Cómo extender (checklist)

**Nuevo adaptador de ingesta**: implementar el puerto en `ingest/adapters/`, añadir fixtures sintéticos y tests del parser, registrar en el selector de fuentes. No tocar pipeline ni dominio.

**Nuevo módulo** (p. ej. `autonomo` en Fase 5): carpeta en `modules/` con `index.ts` público, contratos nuevos en shared, rutas propias, tests. Documentar aquí y añadir ADR si cambia alguna decisión.
