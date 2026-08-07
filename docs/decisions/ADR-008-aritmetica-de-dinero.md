# ADR-008 — Aritmética de dinero: enteros, half-even y sin conversión de divisa

**Estado**: aceptada · 2026-08

## Contexto
La regla 3 de CLAUDE.md fija enteros en céntimos y prohíbe los floats en importes, pero no dice qué pasa cuando un cálculo *no* da un número entero de céntimos (multiplicar por un tipo de interés, repartir un recibo entre tres meses) ni qué debe ocurrir al operar importes de divisas distintas, que Revolut produce a diario. Sin una decisión escrita, cada función habría redondeado a su manera y las proyecciones de la Fase 2 habrían dependido del orden de las operaciones.

## Decisión
1. **Enteros en la unidad mínima de la divisa.** `Money = { amountCents, currency }`, validado con `Number.isSafeInteger` en un único constructor. "Céntimos" es la unidad mínima de cada divisa: el yen tiene cero decimales, y la tabla `CURRENCIES` lo recoge.
2. **Redondeo bancario (half-to-even)** en `multiply`, `divide` y `percentage`. No sesga hacia arriba al encadenar operaciones, que es justo lo que hace una proyección a treinta años.
3. **Repartir no redondea: `allocate`.** Distribuye el resto por mayor remanente, así que la suma de las partes es siempre exactamente el importe original. A igualdad de remanente gana el índice menor, para que el reparto sea determinista.
4. **Nunca se convierte de divisa dentro de `Money`.** Sumar euros y dólares lanza `MoneyError`. La conversión con `fx_rates` es un agregado explícito y posterior (DATA_MODEL.md: el importe original nunca se convierte destructivamente).
5. **Errores por excepción, con variantes `try*` para el dato sucio.** Mezclar divisas o construir un importe con decimales es un bug y aborta; una celda ilegible de un CSV no lo es, así que `tryParseAmount` devuelve `null` y quien importa decide.
6. **Un único punto de conversión texto ↔ céntimos.** `parseAmount` trabaja sobre los dígitos como cadena, sin multiplicar por 100 en ningún momento; `formatMoney` es el único sitio donde se divide por una potencia de diez, y solo para pintar.

## Consecuencias
- Los importes son exactos y comparables por igualdad estructural; la deduplicación por hash (invariante 1) y el matching de transferencias (`isOpposite`) se apoyan en ello.
- Un extracto multidivisa no puede sumarse "sin querer": el fallo es ruidoso e inmediato en vez de silencioso.
- El precio del half-even es que un importe suelto puede diferir en un céntimo de lo que muestra una factura con redondeo comercial. Se asume: importa más que las series largas no deriven.
- Si algún día hace falta redondeo comercial en un caso concreto (una factura, un IVA), se añade como opción explícita de la operación, no como cambio del valor por defecto.
