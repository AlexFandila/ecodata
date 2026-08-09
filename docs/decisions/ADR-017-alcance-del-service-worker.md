# ADR-017 — Alcance del service worker: qué se cachea, qué no, y cómo se actualiza

**Estado**: aceptada · 2026-08

## Contexto

ADR-001 decidió que esto fuera una PWA y no una app nativa, y ARCHITECTURE.md lleva desde el principio dando por hecho un `vite-plugin-pwa` con «caché básica». Hasta esta tarea eso era una promesa sin código: no había manifest, ni iconos, ni service worker.

«Caché básica» no dice lo único que importa de verdad aquí: **qué hace el service worker con las respuestas de la API, que son movimientos bancarios reales**. ADR-003 sí lo había dicho, de pasada y como consecuencia de otra decisión: «si se cae [el servidor], la PWA muestra el último estado cacheado (**solo lectura offline**)». Este ADR convierte esa frase en un alcance concreto y asume su contrapartida en vez de dejarla implícita.

Hay además una tercera pregunta que la instalabilidad obliga a contestar: de dónde salen los iconos. Es cosmética hasta que uno se fija en que la respuesta habitual —`@vite-pwa/assets-generator`— mete un binario nativo en el árbol de dependencias de una app que gestiona datos bancarios.

## Decisión

1. **El armazón se precachea entero; los datos, no.** El precache de Workbox lleva `index.html`, el JS, el CSS, el manifest y los iconos: 714 KiB, casi todo el bundle de la Fase 1. Con eso la app **arranca** sin red. Lo que enseñe al arrancar es otra decisión, la siguiente.

2. **Los `GET` de la API van `NetworkFirst`; las escrituras no pasan por el service worker.** Caché con nombre propio (`api`), `networkTimeoutSeconds: 5`, tope de 64 entradas y caducidad de 24 horas, y solo se guardan respuestas 200.

   `NetworkFirst` y no `StaleWhileRevalidate` porque en una app de finanzas el número correcto es el de ahora: la caché es una red de seguridad para cuando el servidor de casa está apagado o el móvil sin cobertura, no una optimización de latencia. Las 24 horas son la contrapartida a que la app no tiene todavía forma de decir «esto que ves es de ayer»: un dato de hace un mes presentado sin avisar es peor que un error de red. Cuando exista ese indicador, la caducidad se puede alargar.

   **Ninguna escritura se cachea ni se encola.** Nada de background sync. Un `POST /imports` reenviado a ciegas cuando vuelve la red es exactamente el escenario en el que el invariante 1 (dedupe por hash, ADR-012) tiene que sostener algo que nadie ha mirado. Offline es de lectura, y el usuario ve el error de red que corresponde.

3. **Se acepta que haya movimientos bancarios en el `CacheStorage` del navegador.** Es la contrapartida del punto 2 y conviene tenerla escrita. Los atenuantes: el `CacheStorage` está aislado por origen, vive en el mismo dispositivo donde el usuario ya está viendo esos datos, y la app no viaja fuera de la tailnet (ADR-003). La caída real es que borrar la sesión ya no basta: hay que desinstalar la PWA o vaciar los datos del sitio. La caducidad de 24 horas y el tope de 64 entradas acotan cuánto queda ahí.

4. **El patrón que decide qué es «la API» se deriva de `VITE_API_URL`, no se escribe a mano.** `src/api/client.ts` lee esa variable y `env.example` documenta que en despliegue puede cambiar. Si el service worker llevara `/api` fijo y la variable apuntara a otro sitio, cachearía lo que no debe y dejaría de cachear lo que sí, en silencio. `src/pwa/config.ts` construye el patrón a partir de la misma variable y `vite.config.ts` lo usa en los dos sitios de Workbox que lo necesitan: el `runtimeCaching` y el `navigateFallbackDenylist`. El `denylist` no es opcional: el router es un `BrowserRouter` con rutas profundas, hace falta `navigateFallback` a `index.html` para que recargar en `/movimientos/transferencias/emparejar` no dé un 404, y sin la lista de exclusión ese mismo fallback se tragaría las llamadas a la API.

5. **Actualización automática (`registerType: 'autoUpdate'`) con el registro inyectado por el plugin (`injectRegister: 'auto'`).** La alternativa era `prompt` con un aviso «hay una versión nueva» reutilizando el `Notice` que ya existe, que es más amable —nunca recarga por sorpresa— pero obliga a importar `virtual:pwa-register/react` desde `src/`, y eso son tres cosas más: tipos nuevos en el array cerrado `types` del tsconfig, un mock del módulo virtual en los tests, y **una excepción en la regla `not-to-unresolvable` de dependency-cruiser**, que es error de lint y corre en el hook pre-commit. Un módulo virtual que el linter de fronteras no sabe resolver obligaría a abrir un agujero en una regla que existe para cazar erratas. Para un solo usuario que despliega en su propio servidor, el aviso no vale ese precio. Consecuencia asumida: si hay versión nueva, la página se recarga sola, y quien esté a medias de rellenar el formulario de importar pierde lo escrito.

6. **Los iconos los genera un script propio de ~180 líneas sin dependencias** (`scripts/generate-icons.mjs`, `pnpm icons`): dibuja por geometría y codifica el PNG con el `zlib` de Node. La alternativa era `@vite-pwa/assets-generator`, que arrastra `sharp` —binario nativo, entrada nueva en `allowBuilds` de pnpm— para producir cuatro cuadrados de colores en una app cuyo criterio de seguridad es no meter en el árbol de dependencias nada que no haga falta. El dibujo (tres barras ascendentes `emerald-400` sobre `slate-900`) es deliberadamente geométrico porque es lo que ese enfoque sabe hacer bien, y coincide con el lenguaje visual del `TabBar`. La salida es determinista: regenerar sin cambiar el script deja `git status` limpio.

7. **El service worker está apagado en desarrollo y en los tests.** No se activan las `devOptions`, así que `pnpm dev` no registra nada y no hay que depurar contra una caché. Y `disable: mode === 'test'` porque `apps/web/vite.config.ts` es a la vez la configuración de Vitest de ese paquete y jsdom no implementa `navigator.serviceWorker`.

8. **Lo que se comprueba con tests es la configuración, no el service worker.** Arrancar un service worker de verdad pediría un navegador real y un Playwright que no hay. Lo que sí falla en silencio y sí se testea, en `src/pwa/config.test.ts`: que el manifest cumpla los dos requisitos de icono que Chrome mira para ofrecer la instalación; que **cada icono declarado exista en `public/` y mida lo que dice medir**, leyendo la cabecera IHDR del PNG (el fallo clásico es declarar un icono que nadie commiteó, y la instalación se cae sin explicar por qué); que el `theme_color` del manifest y el `<meta name="theme-color">` del HTML sean el mismo color, que son dos sitios que nadie sincroniza a mano; y que el patrón de la API reconozca `/api/...` y **no** reconozca `/movimientos`, que es lo que separa un dato cacheable de una navegación de la SPA.

## Consecuencias

- Con el servidor apagado, la app instalada arranca y enseña los últimos saldos y movimientos de las últimas 24 horas. Pasado ese plazo, o para cualquier pantalla no visitada antes, sale el error de red de siempre.
- Quedan datos bancarios en el navegador del móvil hasta 24 horas. Está asumido y acotado (punto 3).
- **Recharts se queda.** ADR-016 dejó escrito que esta tarea podía decidir sobre sus 94 KiB gzip, con dos salidas ya apuntadas (`React.lazy` sobre los dos gráficos, o escribir el SVG a mano). No se toca: el precache es un coste único por despliegue sobre una red local, y partir los gráficos traería estados de carga y retoques en los tests de `SummaryScreen` a cambio de nada medible aquí. La salida sigue documentada y sigue disponible.
- `apps/web/tsconfig.json` gana `allowImportingTsExtensions`, porque `vite.config.ts` importa `./src/pwa/config.ts` con extensión: sin ella, Vite avisa en cada `pnpm dev`, `test` y `build` de que su cargador nativo de configuración —que va a ser el de por defecto— no soporta ese import.
- Cuando llegue el aviso de «datos de las HH:MM», la caducidad del punto 2 se puede alargar sin tocar nada más.
