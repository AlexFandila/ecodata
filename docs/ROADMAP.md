# Roadmap

Trabajar una fase cada vez, y dentro de cada fase, una tarea cada vez. Marcar casillas al completar. No empezar una fase sin cumplir los criterios de aceptación de la anterior.

## Fase 0 — Cimientos

- [x] `git init` + primer commit con esta documentación
- [x] Sandbox de Claude Code activado (`/sandbox`; en Arch instalar antes `bubblewrap` y `socat` — ver PRIMERA_SESION.md)
- [x] Monorepo pnpm workspaces: `apps/api`, `apps/web`, `packages/core`, `packages/shared` con esqueleto mínimo ("hola mundo" en api y web)
- [x] TypeScript estricto compartido (`tsconfig` base), Biome, Vitest configurados en la raíz
- [x] dependency-cruiser integrado en `pnpm lint`: prohibido importar internals de otros módulos, y `packages/core` no puede importar de `apps/*` (la regla 1 de CLAUDE.md como error de lint)
- [x] Hook pre-commit versionado en `.githooks/` (ver ADR-007): `pnpm lint` + `pnpm typecheck` + escaneo de IBANs (`ES\d{22}`) sobre los ficheros staged. Se activa con `pnpm hooks` una vez por clon, en una terminal fuera de Claude Code (el sandbox tiene `.git/` en solo lectura)
- [x] `env.example` con las variables necesarias documentadas (el `.env` real nunca entra en git)
- [x] Scripts raíz: `pnpm dev`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`
- [x] Verificar que `.gitignore` cubre `data/`, `*.db` (incluidos `-wal` y `-shm`), `.env*`, `.dev/`

**Aceptación**: `pnpm dev` levanta api y web; `pnpm test`, `pnpm typecheck`, `pnpm lint` y `pnpm build` pasan en limpio; y un commit de prueba con un IBAN sintético en un fichero staged es rechazado por el hook.

**Decisión de la fase**: TypeScript se queda en la línea 6.x. La 7 (el compilador nativo) ya es estable, pero dependency-cruiser todavía no la soporta y cruzaría 0 módulos, dejando vacías las reglas de frontera del ADR-006. Revisar cuando dependency-cruiser publique soporte para `typescript@>=7`.

## Fase 1 — Núcleo usable (MVP)

- [x] `packages/core`: tipo `Money` (céntimos + divisa) con operaciones seguras y tests
- [x] Esquema Drizzle + migraciones: `accounts`, `transactions`, `categories`, `rules`, `transfers`, `imports` (ver DATA_MODEL.md). `goals` se añadió después, con `pnpm seed`
- [x] `packages/shared`: esquema `NormalizedTransaction` y contratos HTTP de la Fase 1 (ingesta y movimientos; reglas, transferencias y dashboard entran con su tarea — ver ADR-009)
- [x] Puerto `TransactionSource` + `Norma43Adapter` con fixtures sintéticos y tests (Unicaja no exporta CSV sino Norma 43 de la AEB — ver ADR-010)
- [x] `RevolutCsvAdapter` (atención: multidivisa) con fixtures sintéticos y tests (el CSV está traducido y su columna de saldo se autoverifica — ver ADR-011)
- [x] Pipeline de importación: normalizar → hash → dedupe → persistir → log en `imports`, con `POST /imports` (el hash gana divisa y ordinal de ocurrencia — ver ADR-012)
- [x] Matching de transferencias internas según DATA_MODEL.md (en `packages/core`, con tests de los casos borde; mejor mutuo iterado, sin puntuación mínima — ver ADR-013). Escribirlas en `transfers` es del módulo `ledger`, que entra con la pantalla de revisión
- [x] Motor de reglas de categorización + semilla de categorías (`contains` normaliza y `regex` no; una regla rota se salta en vez de tumbar la importación — ver ADR-014). La semilla es `seedCategories()`, idempotente, no una migración
- [x] `pnpm seed` con datos sintéticos de desarrollo. Genera un cuaderno 43 y un CSV de Revolut sintéticos y los pasa por el `runImport()` de producción, así que el dedupe, el `raw` y las filas de `imports` son los de verdad y sembrar dos veces no duplica nada. Se adelantó aquí la tabla `goals` de la Fase 2, porque la semilla siembra dos objetivos de ejemplo
- [x] Web: subir fichero, elegir cuenta, ver resultado del import. Trajo consigo el armazón que faltaba: `GET`/`POST /accounts` en un módulo `ledger` nuevo (sin cuentas no hay a dónde importar), la navegación de pestañas inferior y los tests de UI (jsdom + Testing Library). El cliente HTTP conserva el `code` del error, que es lo que distingue "este fichero no es de ese formato" de "esa cuenta ya no existe"
- [x] Web: lista de movimientos con filtros; bandeja "sin categorizar"; crear regla desde un movimiento. La bandeja es una pestaña del mismo listado —el filtro `uncategorized` del contrato— y su contador sale del `total` de la respuesta, sin traerse la lista. Trajo las rutas que ADR-009 y ADR-014 dejaron pendientes de esta pantalla (`GET /transactions`, `GET /transactions/:id`, `PATCH /transactions/:id/category`, `GET /categories`, `GET`/`POST /rules`) y el `PATCH` estrenó el código `conflict`, que estaba en el contrato sin usar. `POST /rules` crea **y** recategoriza en la misma llamada, y contesta cuántos movimientos ha etiquetado: una regla que no se aplicara dejaría en la bandeja justo el movimiento del que se la quería sacar. Los filtros viven en la query string para que el botón atrás del móvil deshaga un filtro en vez de salir de la pantalla
- [x] Web: revisión de transferencias internas (confirmar / deshacer / emparejar a mano). No era solo una pantalla: traía consigo toda la escritura en `transfers` que ADR-013 punto 9 dejó aplazada hasta que existiera esta tarea. El módulo `ledger` gana `recordInternalTransfers()`, que persiste lo que decide el matcher —fila en `transfers`, `transfer_id` y categoría de las dos patas, todo en la misma transacción— y la ruta `POST /imports` lo encadena como última etapa del pipeline, **después** de categorizar: el invariante 3 manda sobre lo que hubieran puesto las reglas. `category_source` estrena el valor `transfer` en vez de reutilizar `rule`, que habría sido gratis pero mentiría sobre quién puso esa categoría (ADR-015). Deshacer es un `DELETE` y no un estado más: si la fila quedara, sus dos patas seguirían ocupadas y el matcher no volvería a mirarlas. El emparejado manual comprueba el estado —cuentas propias distintas, un cargo y un abono— pero **no** los criterios de la heurística: los pares con importes exactos ya los casa la máquina, y lo que queda a mano es justo lo que no cuadra. El buscador de la pantalla de emparejar es `GET /transactions` tal cual, que por defecto ya excluye lo emparejado. La semilla pasa a emparejar lo que siembra, porque una base de desarrollo sin transferencias `auto` no deja ni mirar la pantalla
- [x] Web: dashboard móvil — saldo por cuenta y total, gasto del mes por categoría, evolución ingresos/gastos (excluyendo transferencias internas). Es el primer sitio del sistema que **agrega** en vez de listar, y eso obligó a tomar de golpe las decisiones que ADR-009 había aplazado (ver ADR-016). La central es que **no se suman divisas distintas**: sin `fx_rates` —que es de la Fase 2— no hay conversión posible, así que `totals` es una lista y no un número, y la divisa viaja dentro de cada fila. La segunda es que ingreso y gasto se separan **por el signo del movimiento** y no por el `kind` de la categoría, lo que garantiza que la suma de las barras de gasto cuadre exactamente con la barra de gasto del mes: dos números que se ven a la vez y que si no cuadraran no serviría ninguno. La asimetría del invariante 3 queda por fin visible en pantalla: una transferencia interna no aparece en el gasto ni en la evolución, pero sí mueve el saldo, y por eso los saldos **no cambian** al cambiar de mes. El reparto del cálculo sigue el precedente del matcher y del motor de reglas —SQL agrupa en `ledger/summary.ts`, `packages/core` compone en `summary/` y `dates/months.ts`, y quien pone los nombres de categoría es la ruta juntando `ledger` y `categorize`—, y lo que va a `core` es justo lo que falla en silencio: bisiestos, cambios de año y meses vacíos, que se rellenan con ceros porque un hueco en una serie no se lee como cero. El gasto se agrupa por categoría madre con el desglose por hija, que es para lo que ADR-014 dejó el árbol en dos niveles. Los gráficos son recharts (+94 kB gzip, medido) y van `aria-hidden` con la misma información como lista y tabla al lado, dentro del mismo componente: es lo que lee un lector de pantalla, lo que se lee con el pulgar a 390 px, y lo que asertan los tests. `createApp` estrena `today` para que el mes por defecto sea comprobable en vez de depender del reloj
- [x] PWA instalable (manifest, iconos, service worker básico). Lo que había que decidir no era «poner el plugin» sino **qué hace el service worker con las respuestas de la API, que son movimientos bancarios** (ver ADR-017). Se cumple la promesa que ADR-003 había dejado escrita de pasada: el armazón se precachea entero y los `GET` de la API van `NetworkFirst` con 24 horas de caducidad, así que con el servidor de casa apagado la app arranca y enseña los últimos saldos en vez de una pantalla de errores. Las escrituras **no** pasan por el service worker y no se encolan: un `POST /imports` reenviado a ciegas al volver la red es justo el caso en el que el dedupe del invariante 1 tendría que sostener algo que nadie ha mirado. La contrapartida —copia de datos bancarios en el `CacheStorage` del móvil— queda asumida y acotada por escrito. El patrón que separa «llamada a la API» de «navegación de la SPA» se **deriva de `VITE_API_URL`**, la misma que lee `api/client.ts`, porque un `/api` escrito a mano en el service worker se desincroniza en silencio; y hace falta en dos sitios, el `runtimeCaching` y el `navigateFallbackDenylist` que impide que el fallback a `index.html` —necesario para que recargar en `/movimientos/transferencias/emparejar` no dé 404— se trague las llamadas a la API. La actualización es automática y sin código propio (`injectRegister: 'auto'`): el aviso «hay una versión nueva» habría obligado a importar un módulo virtual que dependency-cruiser no resuelve, y abrir un agujero en `not-to-unresolvable` cuesta más que lo que vale el aviso. Los iconos los dibuja `pnpm icons`, un script sin dependencias que codifica el PNG con el `zlib` de Node, para no meter `sharp` (binario nativo) en el árbol por cuatro cuadrados de colores. No hay test que arranque un service worker —eso pide navegador de verdad—; se testea lo que falla en silencio: que cada icono declarado exista y **mida lo que dice medir**, que el `theme_color` del manifest y el del HTML sean el mismo, y que el patrón de la API no confunda `/movimientos` con un dato cacheable

**Aceptación**: importo un mes real de Unicaja y de Revolut en menos de un minuto; las transferencias Unicaja→Revolut quedan detectadas y excluidas del gasto; el dashboard se ve y funciona bien en el móvil; ningún dato real ha entrado en git.

## Fase 2 — Objetivos y datos externos

- [ ] `marketdata`: puerto `MarketSeriesProvider` + adaptadores BCE (SDMX), Banco de España (euríbor) e INE (IPC), con caché en `market_series` y refresco programado
- [ ] `fx_rates` con tipos de referencia del BCE; agregados multidivisa correctos
- [ ] `packages/core/finance`: valor futuro, aportación mensual necesaria, escenarios pesimista/base/optimista (parámetros explícitos, tests con casos conocidos)
- [ ] Simulador de vivienda: entrada %, gastos e impuestos % (parámetro por CCAA), cuota con amortización francesa, estrés de euríbor ±2 pp, ratio de esfuerzo ≤ 35 %
- [ ] Simuladores de coche y fondo de emergencia
- [ ] Web: crear objetivo, ver plan de ahorro mensual, progreso real vs plan, supuestos siempre visibles y editables

**Aceptación**: creo el objetivo "entrada de una casa de 200.000 € en 2031" y obtengo aportación mensual con tres escenarios, cuota hipotecaria estimada con euríbor actual y estresado, y una explicación de cada supuesto.

## Fase 3 — Asesor con Claude (MCP)

- [ ] `apps/mcp` con el SDK oficial de MCP, reutilizando `packages/core` y lectura de la base de datos
- [ ] Tools de solo lectura: `get_monthly_summary`, `list_transactions`, `get_spending_by_category`, `get_net_worth`, `get_goal_progress`, `run_projection`, `get_market_series`
- [ ] Motor de reglas del `advisor` (prioridades: fondo de emergencia → deuda cara → inversión del excedente) expuesto como tool
- [ ] Documentar en `docs/MCP.md` cómo conectar el servidor a Claude Code / Claude Desktop, con prompts de ejemplo
- [ ] Revisión de privacidad: las tools devuelven agregados y cálculos ya hechos; nada de volcados masivos innecesarios

**Aceptación**: le pregunto a Claude "¿cómo fue mi mes y qué debería hacer con el excedente?" y responde con mis datos reales vía MCP, citando las reglas del asesor, sin que yo copie o pegue nada.

## Fase 4 — Open Banking (automatización)

- [ ] Alta en Enable Banking (modo restricted production gratuito) y pre-vinculación de las cuentas propias en su portal — ver ADR-004
- [ ] `EnableBankingAdapter` implementando `TransactionSource`; verificación de cobertura real de Unicaja y Revolut
- [ ] Flujo de consentimiento y re-autenticación, con aviso en la app cuando esté por caducar (≤ 180 días)
- [ ] Sincronización programada + botón manual; dedupe correcto contra lo ya importado por CSV
- [ ] El CSV se mantiene como vía de respaldo permanente

**Aceptación**: pulso "sincronizar" y aparecen los movimientos nuevos de ambos bancos sin duplicados; si el consentimiento caduca, la app me lo dice en vez de fallar en silencio.

## Fase 5 — Autónomo y extras

- [ ] Módulo `autonomo`: marcar movimientos como actividad económica; provisión automática de IVA e IRPF por ingreso; calendario fiscal (modelos 130/303) con avisos
- [ ] Detección de suscripciones recurrentes y su coste anualizado
- [ ] Previsión de tesorería a 3-6 meses a partir de recurrencias
- [ ] Patrimonio neto histórico y alertas (gasto inusual, saldo bajo)
- [ ] Módulo "Aprender": conceptos económicos (inflación, interés compuesto, coste de oportunidad, diversificación) explicados con los números del propio usuario

**Aceptación**: cada funcionalidad entra como módulo o extensión sin romper las fronteras de ARCHITECTURE.md; los tests de las fases anteriores siguen en verde.
