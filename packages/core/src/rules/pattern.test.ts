/**
 * Todos los datos de este fichero son inventados: ni comercios, ni conceptos
 * bancarios reales.
 */
import { describe, expect, it } from 'vitest'
import { compilePattern, fieldText } from './pattern'

/** ¿Casa el patrón con el texto? Falla si el patrón ni siquiera compila. */
function casa(matchType: 'contains' | 'regex', pattern: string, value: string): boolean {
  const compilado = compilePattern(matchType, pattern)
  if (!compilado.ok) throw new Error(`El patrón no compiló: ${compilado.message}`)

  return compilado.matches(fieldText(value))
}

describe('compilePattern · contains', () => {
  it('ignora mayúsculas y minúsculas', () => {
    expect(casa('contains', 'mercadona', 'MERCADONA CENTRO')).toBe(true)
  })

  it('ignora los acentos en los dos lados', () => {
    expect(casa('contains', 'NOMINA', 'Nómina de marzo')).toBe(true)
    expect(casa('contains', 'nómina', 'NOMINA MARZO')).toBe(true)
  })

  it('trata la puntuación como separador, igual que el matching de transferencias', () => {
    expect(casa('contains', 'NETFLIX', 'NETFLIX.COM 1234')).toBe(true)
    expect(casa('contains', 'TIENDA 1234', 'TIENDA*1234')).toBe(true)
  })

  it('casa por subcadena y no por palabra completa', () => {
    // Es la diferencia deliberada con `containsWord` (ADR-014 decisión 1): el
    // patrón lo escribe el usuario a conciencia, no lo infiere el sistema.
    expect(casa('contains', 'SUPER', 'SUPERMERCADO EJEMPLO')).toBe(true)
  })

  it('no casa cuando el texto no contiene el patrón', () => {
    expect(casa('contains', 'FARMACIA', 'SUPERMERCADO EJEMPLO')).toBe(false)
  })

  it('rechaza un patrón que se queda en nada al normalizarlo', () => {
    // Sin esto la aguja sería la cadena vacía, que está contenida en todo: la
    // regla se tragaría el extracto entero.
    const compilado = compilePattern('contains', '***')

    expect(compilado.ok).toBe(false)
    expect(compilado.ok === false && compilado.reason).toBe('empty_pattern')
  })
})

describe('compilePattern · regex', () => {
  it('casa sin distinguir mayúsculas', () => {
    expect(casa('regex', '^pago con tarjeta', 'Pago con tarjeta')).toBe(true)
  })

  it('compara contra el texto crudo, sin normalizar', () => {
    // El acento sigue ahí: es justo lo que pide quien escribe una regex.
    expect(casa('regex', 'NÓMINA', 'NÓMINA DE MARZO')).toBe(true)
    expect(casa('regex', 'NÓMINA', 'NOMINA DE MARZO')).toBe(false)
  })

  it('conserva la puntuación del texto, que `contains` habría convertido en espacios', () => {
    expect(casa('regex', 'NETFLIX\\.COM', 'NETFLIX.COM')).toBe(true)
  })

  it('admite clases unicode', () => {
    expect(casa('regex', '^\\p{Letter}+$', 'Farmacia')).toBe(true)
  })

  it('no arrastra estado entre llamadas', () => {
    // Sin bandera `g` no hay `lastIndex`; con ella, la segunda llamada fallaría.
    const compilado = compilePattern('regex', 'CAFE')
    if (!compilado.ok) throw new Error('El patrón debería compilar')

    const texto = fieldText('CAFE DE LA ESQUINA')
    expect(compilado.matches(texto)).toBe(true)
    expect(compilado.matches(texto)).toBe(true)
  })

  it('devuelve el motivo en vez de lanzar cuando la expresión no compila', () => {
    const compilado = compilePattern('regex', '(sin cerrar')

    expect(compilado.ok).toBe(false)
    expect(compilado.ok === false && compilado.reason).toBe('invalid_regex')
    expect(compilado.ok === false && compilado.message).toMatch(/no válida/i)
  })
})
