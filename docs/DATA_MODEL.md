# Modelo de datos

Nombres de tablas y campos en inglés. Dinero siempre como enteros en céntimos + divisa ISO 4217 (regla 3 de CLAUDE.md). El tipo `Money` de `packages/core` es quien lo hace cumplir: operaciones, redondeo half-even y reparto sin pérdida de céntimos en ADR-008.

## Entidades

### accounts
- `id`, `name` (p. ej. "Unicaja nómina"), `provider` (`unicaja` | `revolut` | `manual`)
- `type` (`checking` | `savings` | `card`), `currency` (divisa principal), `iban` (opcional)
- `is_own` (boolean, default true) — las cuentas propias participan en el matching de transferencias
- `opening_balance_cents` (entero, default 0) — saldo justo antes del movimiento más antiguo importado; base del cálculo de saldo (invariante 6). Lo recoge el alta de cuenta de la web, con un texto que insiste en que es el saldo *anterior* al primer movimiento y no el de hoy: es la confusión que desplaza todos los saldos de la app y ningún test la detecta. Sale de la cabecera del propio extracto (en un cuaderno 43, el saldo inicial del registro `11`)

### transactions
- `id`, `account_id`, `booked_at` (fecha contable), `value_date` (opcional)
- `amount_cents` (entero, negativo = cargo), `currency`
- `counterparty` (texto normalizado), `description`
- `category_id` (nullable), `transfer_id` (nullable — si forma parte de una transferencia interna)
- `category_source` (`rule` | `manual` | `suggestion` | `transfer`; `null` si no hay categoría) — quién puso `category_id`; protege lo manual de la recategorización automática (invariante 7). `transfer` es la categoría que impone una transferencia interna por el invariante 3: existe como valor propio, y no reutilizando `rule`, para que las patas queden fuera de la recategorización automática por dos vías independientes y para que la interfaz no atribuya a una regla algo que ninguna regla puso (ADR-015)
- `deleted_at` (timestamp, nullable) — soft-delete; `null` = movimiento vivo (invariante 5)
- `import_id`, `source_hash` (UNIQUE — clave de deduplicación), `raw` (JSON con la fila original tal cual)

### transfers
- `id`, `out_txn_id`, `in_txn_id` (cargo y abono enlazados)
- `status`: `auto` (emparejada por heurística) | `confirmed` (validada por el usuario) | `manual` (creada a mano). No hay `rejected`: rechazar un emparejamiento es borrar la fila, porque si quedara, sus dos patas seguirían ocupadas y la heurística no volvería a mirarlas (ADR-015)
- `matched_by` (qué señales dispararon el emparejamiento, para depurar y para explicárselo al usuario en la pantalla de revisión): JSON con los literales de `TRANSFER_MATCH_SIGNALS`, `null` en las manuales. Al leerlo se filtra contra la lista cerrada, no se confía en lo que haya en disco
- Quien escribe esta tabla es el módulo `ledger`, y siempre en la misma transacción que el `transfer_id` y la categoría de las dos patas: el invariante 3 no admite un estado intermedio

### categories
- `id`, `slug` (UNIQUE — identificador estable independiente del nombre visible: el código referencia `internal_transfer` por aquí, no por un id que la semilla podría renumerar)
- `name`, `kind` (`expense` | `income` | `internal`), `parent_id` (opcional), `icon` (opcional)
- El árbol inicial —vivienda, supermercado, restaurantes, transporte, suscripciones, salud, ocio, nómina…, más la categoría del sistema `internal_transfer`— lo siembra `seedCategories()` del módulo `categorize`, que se ejecuta al arrancar la api justo detrás de las migraciones. Es una función idempotente y no un `INSERT` en una migración porque son datos de referencia y no esquema: el usuario puede renombrar una categoría desde la UI y sembrar de nuevo no se lo pisa (ADR-014, punto 8). Dos niveles, slugs en inglés y nombres en español.

### rules
- `id`, `priority` (menor = antes), `field` (`counterparty` | `description`), `match_type` (`contains` | `regex`)
- `pattern`, `category_id`, `active`

### goals
- `id`, `name`, `type` (`house` | `car` | `emergency_fund` | `custom`)
- `target_amount_cents`, `target_date` (opcional), `params` (JSON: entrada %, gastos e impuestos %, retorno esperado, inflación asumida, aportación inicial…)
- La tabla se creó en la Fase 1, junto con `pnpm seed`, aunque los objetivos sean de la Fase 2: la semilla siembra dos de ejemplo y una base de desarrollo a la que le falta una tabla no sirve para desarrollar contra ella. `params` va como JSON sin tipar a propósito hasta que el motor financiero decida qué supuestos necesita cada tipo de objetivo. Sin `UNIQUE` en `name`: dos objetivos homónimos serán confusos, pero no incoherentes.

### imports
- `id`, `account_id` (cuenta a la que fue el fichero: la elige el usuario al subirlo, y todos los movimientos de un import van a la misma), `source` (adaptador usado), `file_name`, `imported_at`, `stats` (JSON: filas leídas, insertadas, duplicadas, errores)
- `read = inserted + duplicated + errors`. Lo que la fuente salta por no ser un movimiento —una fila de Revolut sin fecha de finalización, una línea en blanco— no cuenta en ninguna de las cuatro: no llegó a ocurrir.
- Un fichero rechazado entero (mal formado, o cuyos totales no cuadran) **no** deja fila aquí: la tabla es el registro de lo importado, no un log de intentos. Un fichero que se importa entero como duplicado sí la deja, con `inserted: 0`.

### fx_rates
- `date`, `base`, `quote`, `rate` — tipos de cambio de referencia del BCE. Solo para agregados; el importe original nunca se convierte destructivamente.

### market_series
- `series_id` (p. ej. `euribor_12m`, `hicp_ea`, `ipc_es`), `date`, `value` — caché local de BCE/BdE/INE.

## Invariantes

1. `source_hash` es único: reimportar el mismo fichero (o solapar CSV con Open Banking en Fase 4) no duplica movimientos. Hash sobre campos normalizados estables, no sobre la fila cruda: **cuenta + fecha + importe + divisa + contraparte + descripción + ordinal de ocurrencia**. La divisa está porque sin ella un cambio de divisa colisiona consigo mismo; el ordinal —el n-ésimo movimiento idéntico dentro del fichero— porque dos cafés de 2,50 € el mismo día son dos movimientos y no uno. Ver ADR-012 para la receta exacta y sus contrapartidas. Lo calcula `sourceHash()` en `packages/core`, para que la Fase 4 produzca los mismos hashes que el CSV.
2. Un movimiento pertenece como máximo a una transferencia interna.
3. Movimientos con `transfer_id` ≠ null: categoría `internal_transfer` con `category_source = 'transfer'`, **excluidos** de ingresos, gastos y presupuestos; **incluidos** en el saldo de su cuenta. Esa categoría la escribe el módulo `ledger` —es la única que no pone `categorize`— y ni las reglas ni el `PATCH` de categoría manual la pueden tocar mientras la transferencia exista. Deshacerla devuelve las dos patas a `(null, null)` y a la bandeja de pendientes.
4. `raw` nunca se modifica ni se borra: si un parser mejora, se puede re-normalizar desde ahí.
5. Borrar un import nunca es un `DELETE` físico: marca `deleted_at` en sus movimientos. **Toda consulta —saldos, agregados, listados, tools MCP— excluye por defecto los movimientos con `deleted_at` ≠ null**; restaurar es volver a ponerlo a `null`. Si se borra una de las dos patas de una transferencia interna, la `transfer` se deshace: la otra pata queda con `transfer_id = null` y vuelve a ser candidata al matching.
6. Saldo de una cuenta = `opening_balance_cents` + Σ `amount_cents` de sus movimientos no borrados. Las transferencias internas sí suman aquí (invariante 3); los borrados no (invariante 5).
7. `category_source` manda sobre la automatización: las reglas y las recategorizaciones en bloque solo escriben donde `category_id` es null o `category_source = 'rule'`. Una categoría puesta a mano (`manual`) o por una transferencia (`transfer`) no se pisa jamás automáticamente.

## Notas de implementación (esquema Drizzle)

El esquema vive en `apps/api/src/db/schema.ts` y las migraciones en `apps/api/drizzle/`. Cuatro decisiones que el modelo de arriba no fijaba:

1. **Los invariantes los aplica la base**, no el código (mismo criterio que ADR-006). Los enums son `CHECK`, la deduplicación es un `UNIQUE` sobre `source_hash`, el invariante 2 son dos `UNIQUE` sobre las patas de `transfers` y el invariante 7 es un `CHECK` de coherencia entre `category_id` y `category_source`. Precio asumido: SQLite no sabe alterar un `CHECK`, así que cambiarlo obliga a reconstruir la tabla en la migración.
2. **Fechas de calendario como TEXTO ISO** (`booked_at`, `value_date` → `'2026-03-15'`, validado con `CHECK ... GLOB`). Una fecha contable no tiene hora ni zona horaria; guardarla como epoch invita a desfases de un día. Los instantes de verdad (`deleted_at`, `imported_at`, `created_at`) sí van como entero epoch en milisegundos.
3. **`transactions.transfer_id` no lleva clave foránea.** Declararla formaría un ciclo con `transfers.out_txn_id`/`in_txn_id` que obligaría a diferir la comprobación. Es un dato derivable de `transfers`, denormalizado por velocidad (casi toda consulta de gastos filtra por él, invariante 3); la coherencia la mantiene el módulo `ledger` y la cubren los tests.
4. **IDs enteros autoincrementales.** Un único fichero SQLite en un solo servidor (ADR-003) no necesita UUIDs; la identidad entre importaciones la da `source_hash`, no el id.

`PRAGMA foreign_keys` **no** viene activo por defecto en SQLite: se activa en `createDb()`, el único punto de apertura, para que las claves foráneas no sean decorativas.

## Heurística de matching de transferencias internas

Objetivo: detectar Unicaja → Revolut (y similares) sin intervención, con revisión posible.

**Candidatos**: pares de movimientos donde (a) cuentas distintas con `is_own = true`, (b) `amount_cents` opuestos exactos y misma divisa, (c) diferencia de fechas ≤ 3 días, (d) ninguno pertenece ya a una transferencia.

**Puntuación** (desempate si hay varios candidatos): +2 si `counterparty`/`description` contiene el nombre del otro proveedor o del titular ("REVOLUT", "UNICAJA", nombre del usuario); +1 si la diferencia de fechas es ≤ 1 día. Empate no resoluble → dejar sin emparejar y marcar para revisión.

El +2 se suma una sola vez aunque coincidan el proveedor y el titular: puntúa el par, no las patas. Y no hay puntuación mínima: la puntuación desempata, no acepta, así que un candidato único con cero puntos se empareja igual. Ver ADR-013 para el porqué de las dos cosas.

**Asignación**: un par se acepta solo si cada pata es el **único** máximo de puntuación de la otra; los aceptados se retiran y se recalcula hasta que una ronda no produzca nada. Así el resultado no depende del orden en que se importaron los ficheros, y los empates de verdad quedan sin resolver en vez de romperse en silencio (ADR-013). El motor es `matchInternalTransfers()` en `packages/core`; los criterios (d) y el borrado lógico los aplica quien consulta, no el dominio.

**Resultado**: crear `transfer` con `status = auto` y anotar señales en `matched_by`. El usuario puede confirmar, deshacer (los movimientos vuelven a ser normales) o emparejar manualmente desde la UI.

**Quién lo escribe y cuándo**: `recordInternalTransfers()` del módulo `ledger`, encadenado por la ruta `POST /imports` detrás de la categorización, y disponible también como `POST /transfers/match` para volver a pasarlo sin importar nada (después de deshacer, o cuando los dos extractos de un traspaso se importaron con días de diferencia). Corre siempre sobre **toda** la población sin emparejar, nunca solo sobre lo recién insertado. El nombre del titular llega por la variable de entorno `HOLDER_NAMES` y los alias de cada cuenta se construyen desde su `provider` y su `name` (ADR-015).

**Emparejado manual**: comprueba el estado —cuentas propias distintas, un cargo y un abono, ninguna pata pillada ya, los dos movimientos vivos— y **no** los criterios de la heurística. No exige importes opuestos, ni misma divisa, ni fechas cercanas: los pares que cumplen eso ya los empareja la máquina sola, y exigirlo dejaría el emparejado manual sin ningún caso que resolver.

**Casos borde conocidos**:
- Recarga de Revolut con tarjeta: en Unicaja aparece como pago de tarjeta con otro formato; a menudo no cumple (b) o (d) limpiamente → emparejado manual, que precisamente por eso no exige que los importes cuadren.
- Transferencias parciales o divididas: fuera de alcance de la v1; se resuelven a mano.
- Distinta divisa entre patas: fuera del alcance de la heurística (requeriría tolerancia con `fx_rates`); a mano sí se pueden emparejar.

## Pipeline de categorización

1. Al importar, aplicar `rules` activas por orden de `priority`; primera coincidencia gana y escribe `category_source = 'rule'`. A igualdad de `priority` desempata el `id` ascendente: `priority` sola no es un orden total y el resto quedaría en manos de cómo devolviera las filas la base (ADR-014, punto 3).
2. Sin coincidencia → `category_id = null` y `category_source = null` (estado "sin categorizar", visible como bandeja de pendientes en la UI).
3. Al categorizar a mano, `category_source = 'manual'`; ofrecer "crear regla a partir de este movimiento" (pre-rellenando `contains` sobre la contraparte). Las dos cosas están implementadas: `PATCH /transactions/:id/category` —cuyo cuerpo lleva solo `category_id`, porque el origen lo pone la API y un cliente que pudiera declararse `'rule'` se saltaría el invariante 7 desde fuera— y `POST /rules`, que además **aplica** la regla recién creada y contesta cuántos movimientos ha etiquetado. El patrón se pre-rellena con el campo que la fuente haya llenado y no siempre con la contraparte: la Norma 43 la deja a `null` siempre (ADR-010). Poner `category_id` a `null` devuelve el movimiento a la bandeja, que es el deshacer de haberse equivocado.
4. (Futuro, opcional) Sugerencias de categoría vía LLM para lo pendiente: se guardan con `category_source = 'suggestion'` y solo pasan a `'manual'` con confirmación explícita del usuario. Una sugerencia sin confirmar sigue contando como pendiente en la bandeja.
5. Recategorizar en bloque re-ejecuta reglas solo sobre movimientos con `category_id` null o `category_source = 'rule'` (invariante 7), y **devuelve a `(null, null)`** los que una regla había categorizado y ya no casan con nada: si no, quedaría una categoría que ninguna regla explica y que tampoco aparece en la bandeja (ADR-014, punto 6). Las patas de una transferencia interna quedan fuera: su categoría la pone `ledger` por el invariante 3.

**Cómo compara cada `match_type`** (ADR-014, puntos 1 y 2): `contains` es subcadena sobre texto normalizado —sin acentos, sin mayúsculas, la puntuación convertida en espacios—, la misma normalización que usa el matching de transferencias, así que `NOMINA` casa con `Nómina transf.` y `SUPER` con `SUPERMERCADO`. `regex` va contra el texto **crudo**, con banderas `iu`: lo que se escribe es lo que se compara, acentos y puntuación incluidos. Una regla contra un campo `null` no casa nunca.

El motor es `applyCategoryRules()` en `packages/core`: decide, pero no escribe. Quién puede ser recategorizado —el invariante 7— es un filtro de consulta del módulo `categorize`, igual que en el matching lo son el borrado lógico y el criterio (d). Un patrón que no compila no interrumpe la importación: se salta esa regla y se reporta, porque bloquear el dato por un problema de etiqueta sería el peor de los fallos posibles.

## Semilla de desarrollo

`pnpm seed` puebla la base de dev (`apps/api/.dev/dev.db`) con: 2 cuentas (unicaja, revolut), 3 meses de movimientos sintéticos realistas (nómina, alquiler, supermercado, suscripciones…), un puñado de reglas de categorización, varias transferencias internas emparejables y 2 objetivos de ejemplo. Ningún dato real, nunca.

Cómo, y por qué así (`apps/api/src/seed/`):

- **No inserta filas: genera ficheros.** `synthetic.ts` construye un cuaderno 43 y un CSV de Revolut con los constructores sintéticos que ya usan los tests de cada adaptador, y `run.ts` los pasa por el `runImport()` de producción. Así la base de desarrollo tiene el mismo `raw`, el mismo `source_hash` y las mismas filas en `imports` que tendría con ficheros de verdad, y la semilla vale además de prueba de humo del pipeline entero.
- **Idempotente sin inventarse nada.** Cuentas por nombre, reglas por su terna (campo, tipo, patrón), objetivos por nombre, y movimientos por el `UNIQUE(source_hash)` del invariante 1: la segunda pasada reporta `inserted: 0` y deja una fila más en `imports`, exactamente como un fichero reimportado. `pnpm seed --reset` borra la base y la recrea, y se niega a borrar nada que no cuelgue de `.dev/`.
- **`pnpm seed --empty` para dejar de desarrollar con datos inventados.** Borra la base y siembra **solo** el vocabulario —el árbol de categorías y las reglas de ejemplo—: ni cuentas, ni movimientos, ni importaciones, ni traspasos, ni objetivos. Es el punto de partida para importar extractos propios, y `runSeed` no vale para eso porque mezclaría sus dos cuentas sintéticas con lo que traiga el banco, que es justo el lío que se quiere evitar. Implica el borrado —vaciar una base ya poblada no se consigue sembrando menos— y por eso conserva íntegra la guarda de `.dev/`. Las categorías van porque las necesita el propio sistema (el invariante 3 marca las patas de un traspaso con `internal_transfer`) y las reglas porque son el esqueleto del motor; que sus patrones sean sintéticos no estorba, lo que no case se queda en la bandeja. Las reglas propias se crean **desde la app**: un patrón copiado de un movimiento real es un dato real, y el código va a git.
- **Determinista, pero con fechas frescas.** El generador es puro y no lee el reloj: recibe la fecha final como parámetro. El CLI le pasa hoy —para que el dashboard tenga movimientos del mes en curso, cortados en la fecha de hoy— y los tests una fecha fija. La misma fecha produce siempre los mismos bytes.
- **Deja trabajo a medio hacer, a propósito.** Un bizum, un adeudo y un pago QR no casan con ninguna regla, para que la bandeja de «sin categorizar» tenga contenido.
- **Y empareja las transferencias, como haría la ruta de importación.** La semilla llama a `recordInternalTransfers()` detrás de categorizar, así que la base de desarrollo tiene transferencias en estado `auto` que revisar desde el primer `pnpm seed`. Los traspasos sintéticos son todos de importe distinto, porque los empates el matcher los deja sin resolver a propósito.
- Ninguna cuenta lleva IBAN: uno español en un fichero versionado lo rechazaría el propio hook pre-commit (ADR-006), y para desarrollar no aporta nada.
