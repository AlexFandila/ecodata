# ADR-010 — La ingesta de Unicaja es Norma 43, no CSV

**Estado**: aceptada · 2026-08 · **matizada por [ADR-011](ADR-011-ingesta-del-csv-de-revolut.md)** en dos consecuencias: el CSV de Revolut **sí** se autoverifica (columna de saldo), y su `counterparty` sí se rellena porque separa la contraparte del tipo de operación. La decisión de fondo —Unicaja se lee por Norma 43, y por qué— no cambia.

## Contexto
ADR-004 decidió que la Fase 1 se resolvería con «adaptadores CSV de Unicaja y Revolut», y el ROADMAP y ARCHITECTURE lo dieron por hecho hasta el punto de nombrar la tarea `UnicajaCsvAdapter`. Nadie había mirado un fichero: la decisión se tomó por analogía con lo que suele exportar un banco, no por observación.

Al ir a fijar el formato apareció que **Unicaja no exporta CSV**. Su banca digital ofrece cuatro formatos: `.xls`, PDF, *AEB Norma 43* y *AEB SEPA Norma 43*.

Se inspeccionaron dos exportaciones reales del mismo periodo (sin que ningún dato entrara en el repo). El `.xls` es un OLE2/BIFF8 binario: nueve filas de preámbulo, cabecera en la fila 11, doce columnas con `Divisa` repetida dos veces —lo que hace ambiguo el mapeo por nombre—, fechas como número de serie de Excel e importes como `double`. Leerlo pide un parser BIFF8, y ahí no hay buena opción: el `xlsx` oficial lleva congelado en npm desde 2022 con dos vulnerabilidades conocidas porque SheetJS se mudó a su propio CDN, y la alternativa es un espejo de terceros o ~400 líneas propias. Además obliga a un puente `double` → céntimos, que es exactamente lo que la regla 3 de CLAUDE.md quiere evitar.

El fichero Norma 43 resultó ser mejor fuente en todos los ejes que importan aquí, y no por poco.

## Decisión
1. **El adaptador de la Fase 1 es `Norma43Adapter`, no `UnicajaCsvAdapter`.** Los importes vienen como entero de 14 dígitos con dos decimales implícitos más un campo de signo (`1` debe / `2` haber): son céntimos de origen, sin floats ni parseo de texto con separadores. Las fechas van en campo fijo. No hay comillas, ni separadores, ni encoding ambiguo: registros de 80 caracteres en latin-1.
2. **Se identifica por formato, no por banco.** La Norma 43 es un estándar de la AEB, así que el mismo adaptador vale para cualquier banco español que la exporte. Un adaptador por banco habría sido copiar el mismo parser con otro nombre. El banco ya lo dice `accounts.provider`; la fuente dice el formato.
3. **El literal de `IMPORT_SOURCES` pasa de `'unicaja_csv'` a `'norma43'`.** `'revolut_csv'` se queda: Revolut sí exporta CSV de verdad. `imports.source` es TEXT libre sin `CHECK`, así que el cambio no arrastra migración.
4. **El puerto recibe bytes, no texto.** El encoding es propiedad del formato y debe decidirlo el adaptador; si lo decidiera la capa HTTP, añadir una fuente obligaría a tocarla, y eso rompe la regla 5. La firma queda genérica en la entrada (`TransactionSource<TInput = Uint8Array>`) para que el `EnableBankingAdapter` de la Fase 4, que recibirá JSON y no bytes, encaje sin reabrir esto.
5. **Se aprovecha que el fichero se autoverifica.** El registro final de cuenta (33) trae los totales y el recuento de apuntes, y el de fin de fichero (88) el número de registros. Un descuadre significa que se ha leído un extracto truncado, así que **es error de fichero y aborta**, no un aviso: importar en silencio movimientos incompletos corrompería los saldos, y el invariante 6 los calcula sumando movimientos. La fila ilegible suelta sí sigue yendo a `rowErrors`, como en cualquier otro adaptador.
6. **Año de dos dígitos: `00`–`79` → 20xx, `80`–`99` → 19xx.** La norma usa `AAMMDD` y no fija la ventana. Se escribe aquí en vez de dejarla implícita en el código, que es donde estas cosas se convierten en un bug de dentro de setenta y cuatro años.
7. **`counterparty` se queda a `null`.** El registro 23 da dos campos de 38 caracteres: el primero es tipo de operación (`TRANSF.SEPA NACIONAL`, `NOMIN.TRANF.NACIONAL`) y el segundo texto libre, que unas veces es un comercio y otras un concepto que escribió el usuario. Ninguno es una contraparte fiable, y el adaptador no inventa lo que la fuente no distingue (ADR-009, punto 8). Ambos se concatenan en `description`, que es lo que miran el motor de reglas y el matching de transferencias.

## Consecuencias
- Los importes llegan al pipeline en céntimos enteros sin haber pasado por un float en ningún momento, ni siquiera transitoriamente. Es más fuerte que lo que da un CSV, donde `tryParseAmount` tiene que reconstruir el número desde el texto.
- La importación puede **verificarse a sí misma**: se compara lo leído con los totales que declara el propio fichero. Con un CSV o un Excel eso no existe, y una lectura truncada pasa inadvertida hasta que un saldo no cuadra semanas después.
- El adaptador da **más** información que el `.xls` que se descartó: el `Concepto` que muestra el Excel es solo la segunda mitad del registro 23, y se pierden el tipo de operación y el código de concepto común de la AEB (`04` transferencias, `03` recibos…), que la tarea de categorización aprovechará sin coste.
- Se gana cobertura sin trabajo: cualquier banco español que exporte C43 entra por este adaptador. El apartado de ADR-004 sobre no depender de terceros para el MVP sale reforzado, no debilitado.
- El `.xls` queda como vía posible si algún banco no diera C43, con el coste ya medido: parser BIFF8 y puente float → céntimos. No se implementa ahora porque no hace falta.
- **La variante SEPA está sin examinar.** El fichero sobre el que se ha verificado todo esto es el «AEB, Norma 43» clásico. Si la variante SEPA trajera el IBAN o el nombre del ordenante en registros 23 adicionales, la decisión 7 se podría revisar y rellenar `counterparty` de verdad, que mejoraría el matching de transferencias internas. Es una comprobación pendiente, no un supuesto: exactamente el error que este ADR corrige.
- Precio de la ventana de siglo: un extracto anterior a 1980 se leería mal. Es teórico —la banca electrónica española no exporta esos periodos— y el ADR deja constancia de que se eligió, en vez de que se coló.
- ADR-004 no se anula: su decisión de fondo (fichero primero, Open Banking después, con el puerto `TransactionSource` en medio) sigue siendo la correcta. Lo que se corrige es el supuesto de que el fichero sería un CSV.

## Nota de método
El error de ADR-004 no fue elegir mal, fue elegir sin mirar. Un formato de fichero es una cuestión observable, no opinable, y el coste de comprobarlo eran cinco minutos. Antes de escribir un adaptador nuevo, mirar un fichero real de la fuente.
