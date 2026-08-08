# ADR-012 — El hash de deduplicación: la divisa y el ordinal que le faltaban al invariante 1

**Estado**: aceptada · 2026-08

## Contexto
El invariante 1 de DATA_MODEL.md dice que `source_hash` va «sobre campos normalizados estables (cuenta + fecha + importe + contraparte + descripción)». Se escribió antes de tener ningún adaptador, y al implementar el pipeline aparecen dos formas de que esos cinco campos den el mismo hash a dos movimientos que no son el mismo. Las dos hacen desaparecer un movimiento **en silencio**, y las dos dejan el saldo mal, porque el invariante 6 lo calcula sumando movimientos.

**Uno, la divisa.** Lo dejó anotado ADR-011 como deuda explícita para esta tarea: en un extracto multidivisa de Revolut, dos movimientos de la misma fecha, el mismo importe y la misma descripción en divisas distintas colisionan. Es exactamente el caso de un cambio de divisa, donde las dos patas comparten fecha, concepto e importe.

**Dos, los movimientos legítimamente idénticos.** Dos cafés de 2,50 € en el mismo comercio el mismo día coinciden en los cinco campos, y en un cuaderno 43 ni siquiera hay contraparte que los separe: la Norma 43 no la distingue del concepto (ADR-010), así que ese campo es `null` en todos los apuntes de Unicaja. Con el hash literal, el segundo café se descarta como duplicado y no vuelve nunca.

Estas dos cosas tiran en direcciones opuestas y por eso hay que decidirlas juntas: el hash tiene que separar más (la divisa) sin dejar de ser idempotente al reimportar, que es lo único que el invariante 1 existe para garantizar.

Además, el algoritmo concreto no estaba decidido en ninguna parte: ni función, ni codificación, ni cómo se separan los campos.

## Decisión

1. **La divisa entra en el hash.** Es lo que ADR-011 pedía y no tiene contrapartida: dos movimientos en divisas distintas nunca son el mismo movimiento.

2. **Un ordinal de ocurrencia entra en el hash**: el n-ésimo movimiento idéntico *dentro del fichero que se está importando*, empezando en 0. A un grupo de `m` filas idénticas le tocan siempre `0..m-1`.

   Esto conserva la idempotencia porque los números se reparten **dentro del fichero y no contra la base**: reimportar el mismo extracto vuelve a asignar los mismos ordinales y por tanto produce los mismos hashes. Y como a un grupo de `m` idénticos siempre le tocan `0..m-1`, el conjunto de hashes no depende del orden en que vinieran las filas, así que un banco que reordene su export no rompe nada.

   | Situación | Qué pasa |
   |---|---|
   | Reimportar el mismo fichero | Los mismos hashes → todo duplicado, nada se inserta |
   | Fichero solapado con movimientos nuevos | Los ya guardados son duplicados, los nuevos entran |
   | Fichero parcial (un subconjunto) | Todo duplicado; no se pierde ni se duplica nada |

3. **La forma canónica es un array JSON** de los siete campos en orden fijo —`[accountId, bookedAt, amountCents, currency, counterparty, description, occurrence]`—, y el hash es su **SHA-256 en hexadecimal**.

   Se serializa con JSON en vez de pegar los campos con un separador porque JSON cierra de golpe las dos formas de colisionar que un separador deja abiertas: `null` y `''` son textos distintos (`null` y `""`, mientras que con un separador los dos serían la ausencia de nada entre dos barras), y un texto que contenga el separador no puede desplazar los campos, porque las comillas van escapadas. Array y no objeto, para no depender del orden de las claves.

4. **El texto se normaliza a Unicode NFC antes de hashear**, y nada más: ni mayúsculas ni espacios, que ya normaliza el adaptador. `CAFÉ` se puede escribir con la E acentuada como un carácter o como una E seguida de una tilde combinante; se leen igual y son bytes distintos. Sin esto, el mismo movimiento leído por dos fuentes con criterios distintos —el CSV hoy, Open Banking en la Fase 4— entraría dos veces.

5. **La función vive en `packages/core`**, no en el módulo `ingest`. No es una regla de ningún formato sino de la identidad de un movimiento: en la Fase 4, el `EnableBankingAdapter` tiene que producir exactamente los mismos hashes que el CSV para que solapar ambas fuentes no duplique nada (ADR-004), y una regla que dos adaptadores distintos deben cumplir igual no puede vivir dentro de uno de ellos. Hashear es cálculo puro —entra un dato, sale un dato—, así que `node:crypto` no rompe la promesa de que `core` no hace IO; `dependency-cruiser` sigue prohibiéndole ficheros, red y proceso.

6. **`imports` gana `account_id`**, NOT NULL con clave foránea. El contrato `importResultResponseSchema` ya devolvía `accountId` y el usuario elige la cuenta al subir el fichero, pero la tabla no lo guardaba: sin esa columna no se puede listar el histórico de importaciones con su cuenta ni deshacer un import (invariante 5) sabiendo a qué cuenta afectó.

7. **Quien decide si algo es duplicado es el `UNIQUE` de la base**, vía `ON CONFLICT (source_hash) DO NOTHING`, y no una consulta previa de hashes. La regla vive en un solo sitio y no hay ventana entre comprobar e insertar (ADR-006).

## Consecuencias
- El invariante 1 de DATA_MODEL.md pasa de cinco campos a siete. Queda actualizado allí; este ADR es el porqué.
- **Cambiar la receta del hash en el futuro es una migración de datos, no un cambio de código**: los hashes guardados no se recalculan solos, y una reimportación posterior duplicaría todo el histórico. Cualquier cambio en los siete campos, en la forma canónica o en la normalización tiene que venir con su migración que recalcule `source_hash` en las filas existentes.
- **Contrapartida del ordinal**: si `n` copias idénticas del mismo día llegan repartidas entre dos ficheros (dos en uno, una en otro), se guardan `max(2,1) = 2` y se pierde una. Requiere que un mismo día quede partido entre dos exports, cosa que no hace ni el cuaderno 43 ni el CSV de Revolut, que exportan ventanas de fechas completas. Es el precio de que reimportar sea idempotente, y se prefiere a perder el segundo café de todos los días.
- **Choque pendiente entre el invariante 1 y el 5**: un movimiento con `deleted_at` sigue ocupando su `source_hash`, así que borrar un import y reimportar el fichero no restaura nada —todo cuenta como duplicado—. No es de esta tarea, pero hay que resolverlo cuando llegue la de borrar importaciones; la salida natural es un `ON CONFLICT DO UPDATE` que devuelva `deleted_at` a `null` y una cifra más en `stats`.
- **Un fichero rechazado no deja fila en `imports`**: la tabla es el registro de lo importado, no un log de intentos. Un fichero que se importa entero como duplicado sí la deja, con `inserted: 0`: ese import ocurrió.
- `packages/core` incorpora `@types/node` como dependencia de desarrollo y `"types": ["node"]` en su `tsconfig`, igual que `apps/api`. Son tipos, no capacidades: las fronteras las sigue aplicando `dependency-cruiser`.
- Queda anotado para la tarea de saldos: nada impide importar un extracto en GBP a una cuenta en EUR —y es correcto, porque Revolut es multidivisa—, pero entonces el invariante 6 estaría sumando divisas distintas. El pipeline es quien lo hace posible; resolverlo es de `fx_rates` y los agregados multidivisa (Fase 2).
