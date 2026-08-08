# ADR-013 — Matching de transferencias internas: qué decidía la heurística y qué no

**Estado**: aceptada · 2026-08

## Contexto

La sección «Heurística de matching de transferencias internas» de DATA_MODEL.md fija los cuatro criterios de candidatura y la puntuación, y se escribió antes de tener adaptadores ni pipeline. Al implementarla aparecen tres huecos que el texto no cubre y que cambian el resultado sobre datos reales:

**Uno, cómo se asigna cuando hay varios candidatos.** El texto dice «puntuación (desempate si hay varios candidatos)» y «empate no resoluble → dejar sin emparejar y marcar para revisión», pero no dice qué algoritmo produce eso. Un mismo conjunto de movimientos admite varias asignaciones y la elección no es inocua.

**Dos, si el +2 acumula.** «+2 si `counterparty`/`description` contiene el nombre del otro proveedor o del titular» se puede leer como un +2 por par o como un +2 por cada pata que lo cumpla, hasta 4.

**Tres, si hace falta puntuación mínima.** Si un movimiento tiene un único candidato posible y ese par no suma ninguna señal, no hay nada que desempatar. No está escrito si se empareja o no.

Lo que está en juego no es simétrico. Un **falso negativo** cuesta que el usuario empareje dos movimientos a mano en la pantalla de revisión. Un **falso positivo** saca dos movimientos de ingresos y gastos en silencio (invariante 3) y distorsiona el dashboard y los presupuestos hasta que alguien lo note. Esa asimetría es la que ordena las tres decisiones.

## Decisión

1. **Asignación por mejor mutuo e inequívoco, iterado hasta punto fijo.** Un par `(a,b)` se acepta si y solo si `b` es el **único** máximo de puntuación entre los compañeros factibles de `a`, **y** `a` es el único máximo de los de `b`. Los aceptados de una ronda se retiran y se recalcula sobre el resto; se para cuando una ronda no produce ningún par.

   La alternativa evidente —greedy: ordenar los pares por puntuación descendente y aceptar el primero con las dos patas libres— se descarta por una razón concreta. Cuando dos pares de la misma puntuación compiten por una pata, greedy tiene que elegir uno, y para ser determinista solo puede desempatar por id, es decir, **por el orden en que llegaron los ficheros**. Eso resuelve en silencio justo el caso que la especificación manda dejar para revisión, y hace que el mismo mes dé parejas distintas según qué extracto se importara antes. Un emparejamiento de peso máximo global (húngaro) tampoco sirve: es O(n³) y, cuando hay varias soluciones óptimas, también tiene que elegir arbitrariamente.

   Iterar importa: si el mejor compañero de `c` era `b` y `b` se fue con `a`, en la ronda siguiente `c` puede emparejar con su segunda opción. Sin iterar, esto empareja de menos.

   El algoritmo termina siempre —una ronda productiva retira al menos dos movimientos— y cuando se para, si queda algo sin emparejar es porque alguien tenía varias mejores opciones: la arista de peso máximo del grafo restante es mutua salvo que comparta extremo con otra del mismo peso, que es la definición de empate.

2. **El +2 se suma una sola vez.** La regla dice «el nombre del otro proveedor **o** del titular»: puntúa el par, no las patas. Las dos señales se anotan por separado en `matched_by` cuando ambas están —son útiles al depurar la heurística—, pero no acumulan puntos. La puntuación se queda en el rango 0..3 que el texto sugiere.

3. **No hay puntuación mínima: un candidato único con cero puntos se empareja.** Los criterios (a)-(d) definen la candidatura y la puntuación existe solo para desempatar; exigir señal sería añadir un criterio (e) que la especificación no tiene. Además la señal de texto es estructuralmente débil en una de las dos patas: la Norma 43 deja `counterparty` a `null` siempre (ADR-010, punto 7), así que un traspaso Unicaja→Revolut de hace tres días con concepto pobre puntúa 0 siendo perfectamente legítimo. `status = 'auto'` existe precisamente para que el usuario deshaga lo que no cuadre.

   Es la decisión más discutible de las tres, y se toma sabiendo qué la revisaría: si sobre un histórico real aparecen falsos positivos (dos movimientos no relacionados del mismo importe exacto entre cuentas propias en menos de tres días), la salida es exigir ≥1 punto, no cambiar el algoritmo de asignación.

4. **Los criterios (d) y el borrado lógico son un filtro de consulta, no del dominio.** `matchInternalTransfers` recibe movimientos que ya vienen vivos y sin transferencia; no comprueba `transfer_id` ni `deleted_at` porque no los recibe. El índice parcial `transactions_matching_idx` (`WHERE deleted_at IS NULL AND transfer_id IS NULL`) existe exactamente para ese filtro. El criterio (a) sí es del dominio, porque `is_own` viaja con la cuenta y no con el movimiento.

5. **El titular y los alias de cuenta se pasan como entrada.** `core` es puro: no hay configuración global ni variables de entorno. Quien llama construye los alias de cada cuenta desde `accounts.provider` y `accounts.name`, y lista las variantes del nombre del titular que quiera reconocer. El dominio **no inventa variantes** («si el extracto pone FERNANDEZ ALEX, esa variante se lista»): una heurística encima de otra heurística no se puede testear ni predecir. El nombre del titular es además dato personal, y así no entra en el repo.

6. **La comparación de nombres es por palabra completa sobre texto normalizado.** Se descompone a NFD, se tiran los diacríticos, se pasa a mayúsculas y se convierte en espacio todo lo que no sea letra o dígito. Convertir la puntuación en espacios —y no borrarla— es lo que hace que `Revolut**1234` se reconozca. Por palabra y no por subcadena porque un titular llamado «ANA» coincidiría con «PLATANOS», y la señal vale +2, que es la que más pesa. Las agujas de menos de tres caracteres se ignoran. Y cada pata se compara contra los alias de la **otra** cuenta: que un apunte de Unicaja diga «UNICAJA» no es señal de nada.

7. **`matched_by` son literales de una lista cerrada** (`other_provider_named`, `holder_named`, `close_dates`), no texto libre. Va a acabar en la pantalla de revisión explicando por qué se emparejó algo, y en cuanto es texto libre quien lo lee acaba distinguiendo casos por el contenido de una frase (mismo criterio que ADR-009 para los errores). `core` devuelve la estructura; serializarla a la columna `TEXT` es del `ledger`.

8. **La aritmética de fechas va en un módulo propio, `packages/core/src/dates`**, y no dentro de `matching`. La diferencia de días no es una regla del emparejamiento: los agregados mensuales del dashboard y el motor financiero de la Fase 2 la van a querer sin arrastrar el matching detrás. Se parsea el texto a mano y se construye con `Date.UTC`; `new Date(texto)` es la trampa, porque la forma `YYYY-MM-DD` se interpreta como UTC pero `2026-3-15` como hora local. La validez se comprueba de ida y vuelta (reconstruir desde el epoch y comparar), que es lo único que rechaza `2026-02-31` —forma válida, día inexistente— y que el `CHECK ... GLOB` de la base deja pasar.

9. **Esta tarea entrega solo el motor de decisión.** No hay módulo `ledger`, ni escritura en `transfers`, ni enganche al pipeline de importación. El motivo no es de alcance sino de coherencia: escribir `transfer_id` obliga por el invariante 3 a poner también `category_id = internal_transfer`, y esa categoría no existe todavía —la semilla de categorías es la tarea siguiente del roadmap—. Cablearlo ahora dejaría el invariante 3 a medias, que es peor que no cablearlo.

## Consecuencias

- La sección de la heurística de DATA_MODEL.md queda precisada con las decisiones 1-3 y remite aquí. Los criterios y la puntuación no cambian: se completa lo que faltaba.
- **El `ledger` deberá re-ejecutar el matching sobre toda la población sin emparejar tras cada importación, no solo sobre las filas recién insertadas.** El punto fijo sobre un subconjunto no es la restricción del punto fijo sobre el conjunto completo: un movimiento nuevo puede crear un empate donde antes había una pareja clara. Como el criterio (d) deja fuera lo ya emparejado, la v1 no revisa un `auto` anterior a la luz de datos nuevos; es una limitación asumida y el usuario siempre puede deshacer.
- El resultado es reproducible: mismo conjunto de movimientos, mismas parejas, sin importar el orden de importación ni los ids. Hay un test que lo comprueba barajando la entrada.
- `TRANSFER_STATUSES` **no** se muda a `packages/shared` en esta tarea. `status = 'auto'` es un concepto de persistencia y no aparece en la salida del dominio; el literal se mudará con el contrato HTTP de transferencias, que ADR-009 dejó explícitamente para cuando se sepa qué necesita la pantalla de revisión.
- Los casos borde que DATA_MODEL declaraba fuera de alcance siguen fuera, ahora con test que lo fija: la recarga de Revolut con tarjeta no cumple el criterio (b) y queda para emparejado manual; una transferencia dividida en dos abonos no se empareja; y dos patas en divisas distintas tampoco, aunque el importe convertido cuadrase (eso requeriría tolerancia con `fx_rates`, Fase 2).
- `normalizeForMatching` se exporta aunque el matching sea su único cliente hoy: el motor de reglas —la tarea siguiente— necesita exactamente la misma normalización para su `contains`, y dos normalizaciones parecidas conviviendo es el principio de que un `contains` y un matching discrepen sobre el mismo texto.
- Un movimiento que se queda sin pareja porque su único candidato prefiere a otro **no** se reporta en `unresolved`: no es un empate, no hay nada que explicar. Solo se reportan los movimientos con varias mejores opciones. Los demás aparecen igualmente en la bandeja de revisión por tener `transfer_id = null`.
