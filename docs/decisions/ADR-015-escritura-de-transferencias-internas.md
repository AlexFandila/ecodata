# ADR-015 — Escritura de transferencias internas: origen de categoría, estados y emparejado manual

**Estado**: aceptada · 2026-08

## Contexto

ADR-013 entregó el motor de decisión y aplazó a propósito todo lo demás: «no hay módulo `ledger`,
ni escritura en `transfers`, ni enganche al pipeline de importación», porque escribir `transfer_id`
obliga por el invariante 3 a poner también `category_id = internal_transfer` y esa categoría no
existía todavía. Ya existe, y la pantalla de revisión —confirmar, deshacer, emparejar a mano— es
justo la tarea que no se puede hacer sin persistir nada.

Al implementarla aparecen cuatro huecos que ni DATA_MODEL.md ni ADR-013 cubren, y todos tienen la
misma raíz: la tabla `transfers` estaba diseñada, pero nunca se había escrito en ella.

**Uno, qué `category_source` lleva una pata.** El invariante 3 exige que un movimiento con
`transfer_id` tenga la categoría `internal_transfer`, y el `CHECK transactions_categoria_con_origen`
exige que `category_id` y `category_source` vayan siempre juntos. Ninguno de los tres valores que
existían (`rule` | `manual` | `suggestion`) significa «lo puso la transferencia».

**Dos, cómo se serializa `matched_by`.** ADR-013 punto 7 fijó que las señales son literales de una
lista cerrada y que «`core` devuelve la estructura; serializarla a la columna `TEXT` es del
`ledger`», sin decir con qué formato.

**Tres, qué comprueba el emparejado manual.** La heurística exige importes opuestos exactos, misma
divisa y menos de tres días. Si el emparejado manual exigiera lo mismo, no serviría para nada: los
pares que cumplen esos tres criterios ya los empareja la heurística sola.

**Cuatro, qué forma HTTP tienen confirmar y rechazar.** `TRANSFER_STATUSES` es `auto | confirmed |
manual`: no hay ningún `rejected`.

## Decisión

1. **`CATEGORY_SOURCES` gana un cuarto valor, `'transfer'`.** La alternativa evidente era reutilizar
   `'rule'`, que no cuesta migración: el motor de reglas ya excluye las patas por
   `isNull(transactions.transferId)`, así que nada las pisaría igualmente. Se descarta por dos
   motivos. El primero es de garantía mecánica (ADR-006): con `'transfer'`, la protección es doble
   —si un día alguien escribe una consulta de recategorización y se olvida del filtro por
   `transfer_id`, el invariante 7 sigue dejando las patas fuera, porque su origen no es `'rule'`—.
   El segundo es que la columna dice quién puso la categoría, y con `'rule'` diría una mentira que
   la interfaz repetiría en pantalla: «categoría puesta por una regla» de algo que ninguna regla
   tocó.

   El precio es una migración que reconstruye `transactions` entera, que es lo que cuesta cambiar
   un `CHECK` en SQLite (DATA_MODEL.md, nota 1). Se paga ahora, con una base de desarrollo, y no
   más adelante.

2. **`matched_by` se guarda como JSON: `["other_provider_named","close_dates"]`.** Se lee con un
   parseo tolerante que **filtra contra la lista cerrada** en vez de confiar en lo que hay en
   disco: una columna vacía —las manuales no tienen señales— o con un literal que ya no exista no
   puede impedir que la pantalla enseñe la transferencia. Un CSV de literales habría sido más
   legible en un visor de SQLite, pero obliga a decidir qué hacer con la cadena vacía, que en JSON
   es un array vacío y en CSV es ambigua.

3. **El emparejado manual comprueba el estado, no la heurística.** Exige cuentas distintas, las dos
   `is_own`, un cargo y un abono, ninguna pata pillada ya, y los dos movimientos vivos. **No**
   exige importes opuestos, ni misma divisa, ni fechas cercanas. Los casos que DATA_MODEL.md declara
   fuera del alcance de la heurística —la recarga de Revolut con tarjeta, que llega a Unicaja con
   otro importe; dos patas en divisas distintas— son exactamente los que esta función existe para
   resolver, y validarlos con los criterios de la heurística la dejaría sin ningún uso.

   Lo que sí sigue siendo obligatorio lo es porque son las columnas o los invariantes: `out_txn_id`
   e `in_txn_id` no son dos huecos intercambiables, y una cuenta ajena no participa en una
   transferencia *interna* por definición.

4. **Confirmar es `PATCH /transfers/:id/status` y rechazar es `DELETE /transfers/:id`.** No hay
   estado `rejected` porque una transferencia rechazada no es una fila en otro estado: es una fila
   que tiene que dejar de existir. Si quedara, sus dos patas seguirían ocupadas y el criterio (d) de
   la heurística no volvería a mirarlas nunca. El `DELETE` devuelve las dos patas ya liberadas en vez
   de un 204 vacío, porque deshacer les cambia tres campos a la vez y quien lo pidió los necesita.

   El cuerpo del `PATCH` es `{ status: 'confirmed' }` y no una ruta `/confirm` sin cuerpo, para que
   añadir mañana otra transición sea ampliar una unión y no estrenar una ruta.

5. **`HOLDER_NAMES` es una variable de entorno.** ADR-013 decisión 5 dejó dicho que el nombre del
   titular se pasa como entrada y que es dato personal que no entra en el repo. En producción sale
   de `.env`, separado por comas, y viaja **por parámetro** desde el arranque hasta las rutas
   (`createApp(db, { holderNames })`), no leído de `process.env` dentro de la ruta: por el mismo
   motivo por el que la base entra por parámetro. Vacío es un valor legítimo —el matching pierde una
   señal de desempate y nada más—, así que no hace falta configurar nada para que la app funcione.

6. **Los alias de cada cuenta los construye el `ledger` desde `provider` y `name`.** El proveedor
   `manual` se queda fuera de la lista: no nombra a ningún banco, «MANUAL» es una palabra que puede
   aparecer en el concepto de cualquier apunte, y la señal que dispararía vale +2, que es la que más
   pesa.

7. **La etapa de emparejado la encadena la ruta, y va después de categorizar.** `POST /imports`
   llama a `runImport`, luego a `categorizeTransactions` y luego a `recordInternalTransfers`; los
   módulos siguen sin llamarse entre sí (ARCHITECTURE.md). El orden importa: el emparejado escribe
   `internal_transfer` encima de lo que hubieran puesto las reglas, que es lo que manda el invariante
   3. Al revés, una regla tendría la última palabra sobre una pata.

8. **La semilla empareja lo que siembra.** DATA_MODEL.md decía que `pnpm seed` no escribe en
   `transfers` «porque eso es del módulo `ledger`». Ya existe el módulo, y la semilla imita el
   pipeline de producción entero: sin transferencias `auto` en la base de desarrollo, la pantalla de
   revisión no se puede ni mirar.

## Consecuencias

- `TRANSFER_STATUSES` se muda de `apps/api/src/db/schema.ts` a `packages/shared/src/enums.ts`, que
  es lo que ADR-013 dejó anunciado. En el esquema ya solo queda `GOAL_TYPES`.
- `TRANSFER_MATCH_SIGNALS` pasa a estar **duplicada** entre `packages/core` y `packages/shared`, la
  tercera lista en esa situación tras las divisas y los campos de regla, y por el mismo motivo:
  `shared` no puede importar de `core`. La atan dos tests en `apps/api` —mismos miembros y mismo
  orden—, porque el orden es el que se enseña en pantalla.
- `CategorizeOptions` gana `transactionIds`, hermano de `importId`. Una lista vacía significa «nada
  que hacer» y no «todos»: un `inArray` con la lista vacía no filtraría, y una recategorización
  general disparada por un `filter` que se quedó sin resultados sería un efecto invisible.
- Deshacer una transferencia deja sus dos patas **sin categoría**, no con la que tuvieran antes:
  aquella se perdió al escribir `internal_transfer` encima. La ruta vuelve a pasarles las reglas
  acto seguido, así que en la práctica recuperan la que les tocara; lo que no se puede recuperar es
  una categoría que estuviera puesta a mano antes de emparejarlas. Es una pérdida aceptada: guardar
  la categoría anterior para poder restaurarla sería una columna más para un caso que se resuelve
  volviendo a categorizar.
- `POST /transfers/match` existe además de la etapa de importación porque hay dos situaciones en
  las que hace falta y no hay ninguna importación de por medio: después de deshacer, y cuando dos
  extractos se importaron con días de diferencia. Es idempotente.
- La v1 sigue sin revisar un `auto` anterior a la luz de datos nuevos, que es la limitación que
  ADR-013 ya asumía. El usuario siempre puede deshacer y volver a buscar.
