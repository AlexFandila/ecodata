# ADR-014 — Motor de reglas de categorización: qué compara cada regla y quién puede escribir la categoría

**Estado**: aceptada · 2026-08

## Contexto

La sección «Pipeline de categorización» de DATA_MODEL.md fija cinco pasos —aplicar las reglas activas por orden de `priority`, primera coincidencia gana, lo `manual` no se pisa— y la tabla `rules` fija sus columnas (`field`, `match_type`, `pattern`). Se escribieron antes de tener adaptadores, y al implementarlo aparecen cuatro huecos que cambian el resultado sobre datos reales:

**Uno, qué compara exactamente `contains`.** «Contiene» puede ser subcadena cruda, subcadena sobre texto normalizado o palabra completa. Los extractos escriben `Nómina`, `NOMINA` y `NOMIN.TRANF.NACIONAL` para la misma cosa, así que la elección decide si una regla escrita a mano sirve de algo. Y hay ya una comparación de texto en el repo —`containsWord`, del matching de transferencias— que ADR-013 dejó exportada anticipando esta tarea.

**Dos, contra qué texto va `regex`.** Si `regex` mira el mismo texto normalizado que `contains`, un patrón que cite un acento o un punto deja de casar sin que nadie lo avise.

**Tres, cómo se ordenan dos reglas con la misma prioridad.** `priority` no es un orden total y `ORDER BY priority` a secas deja el desempate en manos de cómo SQLite devuelva las filas.

**Cuatro, qué se hace con un patrón roto.** `pattern` en la base solo tiene un `CHECK` de longitud: una `regex` que no compila puede estar guardada desde hace meses.

Lo que está en juego no es simétrico, igual que en ADR-013 pero al revés. Una regla que **no** casa cuesta que el movimiento aparezca en la bandeja de pendientes, que es donde el usuario ya está mirando. Una regla que casa **de más** mete gasto en la categoría equivocada en silencio y distorsiona el dashboard hasta que alguien revisa movimiento a movimiento. Y un fallo duro al aplicar reglas es el peor de los tres, porque bloquearía la importación entera —el dato— por un problema de una etiqueta.

## Decisión

1. **`contains` es subcadena sobre texto normalizado con `normalizeForMatching`.** Se reutiliza la normalización que reservaba ADR-013 —NFD, sin diacríticos, mayúsculas, puntuación a espacios— para que un `contains` y el matching no discrepen jamás sobre el mismo texto. Lo que **no** se reutiliza es `containsWord`: aquella compara por palabra completa porque sus agujas son *inferidas* (el nombre del titular, donde «ANA» casaría con «PLATANOS» y la señal vale +2, la que más pesa). El patrón de una regla lo escribe el usuario a conciencia sobre un movimiento que tiene delante, así que `contains` hace lo que dice su nombre: `SUPER` casa con `SUPERMERCADO`. Quien quiera frontera de palabra tiene `regex`.

   El único caso en que `contains` no puede cumplir lo que promete es un patrón que se queda en nada al normalizarlo (`***`): la cadena vacía está contenida en cualquier texto y la regla categorizaría el extracto entero. Se reporta como regla inválida, no se aplica.

2. **`regex` se evalúa contra el texto crudo, con banderas `iu`.** Normalizar antes rompería en silencio cualquier patrón que cite un acento o un signo (`\.`, `€`, `NÓMINA`), que es justo para lo que alguien escribe una expresión regular. La `i` porque los extractos alternan mayúsculas sin criterio; la `u` para que `\p{...}` funcione y porque es más estricta con los escapes inútiles, y ese error conviene que salte al crear la regla y no meses después. Sin bandera `g`: una regex global arrastra `lastIndex` entre llamadas y el resultado dependería de cuántas veces se hubiera usado antes.

   Que los dos `match_type` traten el texto de forma distinta es deliberado y hay que saberlo al escribir una regla: `contains` perdona, `regex` es literal.

3. **El orden es `priority` ascendente y, a igualdad, `id` ascendente.** El segundo criterio no es decorativo: sin él, dos reglas empatadas se aplicarían según cómo hubiera devuelto las filas la base, que es tanto como decir al azar, y el mismo extracto daría categorías distintas en dos ejecuciones. Por `id` y no por `pattern` porque el id es lo único estable que no cambia al editar la regla. Hay un test que lo comprueba barajando la entrada, como en el matching.

4. **Un patrón roto no tumba el lote: se salta y se reporta.** El motor devuelve `invalidRules` junto a las asignaciones y sigue aplicando las demás reglas. Es la excepción explícita al criterio de ADR-006 de «fallar fuerte y pronto», y el motivo es la asimetría del contexto: una regla mala guardada hace meses no puede impedir que hoy entren los movimientos. Lo que sí falla fuerte es lo que solo puede ser un error de programación de quien llama —ids repetidos, una prioridad que no es entera—, y eso lanza `CategoryRulesError`.

   La protección es de dos capas, no de una: `ruleSchema` de `packages/shared` rechaza el patrón al **crear** la regla, compilándolo con las mismas banderas con las que lo va a compilar el motor —validar con otras sería aceptar allí lo que aquí falla—. Las dos hacen falta porque la primera no existía cuando se guardaron las reglas viejas.

5. **El dominio no conoce `active`, ni `deleted_at`, ni el invariante 7.** Mismo criterio que ADR-013 punto 4: son filtros de consulta. `CategoryRule` no tiene campo `active` igual que `TransferCandidate` no tiene `deletedAt`; si lo tuviera, habría dos sitios donde olvidarse de mirarlo. `packages/core` decide qué categoría *correspondería* a cada movimiento; quién puede pisar a quién lo aplica el `WHERE` del módulo `categorize`, que es donde el invariante 7 se puede leer de una vez: `deleted_at IS NULL AND transfer_id IS NULL AND (category_id IS NULL OR category_source = 'rule')`.

6. **Recategorizar limpia lo que ya no casa.** Un movimiento con `category_source = 'rule'` cuya regla se borró, se desactivó o dejó de casar vuelve a `(null, null)`. La alternativa —dejarlo como estaba— produce una categoría fantasma que ninguna regla explica, que sigue contando en el dashboard y que además **no** aparece en la bandeja de pendientes, así que el usuario no tiene por dónde enterarse. Al importar es un no-op, porque los movimientos entran ya en `null`. Lo `manual` y lo `suggestion` no se tocan ni para esto: los protege el mismo `WHERE`.

7. **La orquestación va en la ruta HTTP, no en el pipeline de `ingest`.** `POST /imports` llama a `runImport()` y después a `categorizeTransactions()`. Si `ingest` llamara a `categorize` se crearía una arista entre módulos que la regla 1 de CLAUDE.md permite pero que no hace falta: el pipeline de importación no tiene por qué saber que la categorización existe, y así añadir una etapa nueva —el matching de transferencias, cuando llegue `ledger`— es tocar la ruta y nada más.

   La categorización va **después** de que el import haya confirmado, fuera de su transacción, y eso también es deliberado: si fallara, los movimientos ya están dentro y aparecen en la bandeja, que es un estado correcto. Deshacer un import por un problema de etiquetas sería perder el dato por la metadata.

8. **La semilla de categorías es una función idempotente, no una migración.** `seedCategories()` vive en el módulo `categorize` y se ejecuta al arrancar la api, justo detrás de `runMigrations()` y por el mismo motivo que aquella: es idempotente y evita el fallo tonto de levantar la app sin la categoría del sistema que el invariante 3 da por hecha. Va como función y no como `INSERT` en una migración porque son datos de referencia, no esquema: el usuario puede renombrar «Supermercado» desde la UI, y una migración que reinsertara se lo pisaría en el siguiente despliegue. `onConflictDoNothing` sobre `slug` es quien decide si una categoría ya está, no una consulta previa —la misma receta que la deduplicación de movimientos—.

9. **No se siembra ninguna regla.** El árbol de categorías es universal; los patrones no. Dependen del banco y hasta del idioma del export: ADR-011 avisa de que la `description` de Revolut es una etiqueta traducida, y ADR-010 de que la Norma 43 deja `counterparty` a `null` siempre y lo mete todo en `description`. Una regla sembrada que no casa con nada es peor que ninguna, porque parece que el sistema ya está configurado.

## Consecuencias

- La sección «Pipeline de categorización» de DATA_MODEL.md queda precisada con las decisiones 1-3 y 6 y remite aquí. Los cinco pasos no cambian: se completa lo que faltaba.
- **`CATEGORY_KINDS`, `RULE_FIELDS` y `RULE_MATCH_TYPES` se mudan a `packages/shared/src/enums.ts`**, que es lo que ADR-009 dejó dicho que pasaría «cuando llegue su tarea del roadmap». Los literales no cambian, así que los `CHECK` generados son idénticos y no hace falta migración. `TRANSFER_STATUSES` es ahora la única lista que sigue en el esquema.
- `packages/core` duplica a mano `RULE_FIELDS` y `RULE_MATCH_TYPES` porque no puede importar de `shared`. Es la misma duplicación consciente que la lista de divisas, y se protege igual: un test en `apps/api` —el único paquete que depende de los dos— compara las listas y falla si alguien añade un `starts_with` a un lado y no al otro.
- La categoría `internal_transfer` ya existe, que es exactamente lo que ADR-013 punto 9 declaró bloqueante. El módulo `ledger` puede escribir en `transfers` cumpliendo el invariante 3, y `INTERNAL_TRANSFER_SLUG` sale por el `index.ts` de `categorize` para que no tenga que entrar en `db/schema.ts`.
- **Una expresión regular catastrófica puede colgar una importación.** JavaScript no sabe interrumpir una `RegExp` a medias y no hay forma barata de poner un límite de tiempo. Se asume: es una app de un solo usuario, autoalojada, donde las reglas las escribe la misma persona que las sufre. Si algún día hay reglas de otra procedencia —sugerencias de un LLM, por ejemplo— esto se revisa antes que nada.
- Las reglas siguen sin CRUD por HTTP: los contratos (`ruleSchema`, `createRuleRequestSchema`, `categorySchema`) están escritos, pero las rutas entran con la pantalla que las consume, que es lo que ADR-009 pedía para no fijar formas a ciegas.
- El árbol sembrado tiene dos niveles y ~40 categorías. Dos y no tres porque el dashboard móvil enseña el gasto agrupado por la madre y el detalle por la hija, y un tercer nivel no cabría en la pantalla. Los slugs van en inglés (son identificadores que aparecen en el código, regla de nombres de CLAUDE.md) y los nombres en español (son texto de interfaz).
- El resultado del motor es reproducible: mismo lote y mismas reglas, mismas categorías, sin importar el orden de entrada. Hay test que lo comprueba barajando las dos listas.
