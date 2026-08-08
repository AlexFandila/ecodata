/**
 * Todos los datos de este fichero son inventados: ni cuentas, ni comercios, ni
 * importes reales.
 */
import { describe, expect, it } from 'vitest'
import { normalizeNeedles, type ScorableLeg, scorePair, searchableText } from './score'

/** Una pata con los textos y los alias ya normalizados, como los da `match`. */
const leg = (
  counterparty: string | null,
  description: string | null,
  aliases: readonly string[] = [],
): ScorableLeg => ({
  text: searchableText(counterparty, description),
  accountNeedles: normalizeNeedles(aliases),
})

/** Una pata sin ninguna señal de texto, para aislar la de fechas. */
const mudo = leg(null, null)

const titular = normalizeNeedles(['Alex Ejemplo'])

describe('scorePair · la señal del nombre', () => {
  it('suma +2 cuando la descripción de una pata nombra al proveedor de la otra cuenta', () => {
    const unicaja = leg(null, 'TRANSF.SEPA NACIONAL A REVOLUT', ['UNICAJA'])
    const revolut = leg('Cuenta propia', 'Ingreso', ['REVOLUT'])

    const resultado = scorePair(unicaja, revolut, [], 3)
    expect(resultado.score).toBe(2)
    expect(resultado.matchedBy).toEqual(['other_provider_named'])
  })

  it('suma +2 cuando la contraparte nombra al titular', () => {
    const origen = leg('ALEX EJEMPLO', 'Transferencia', ['UNICAJA'])

    const resultado = scorePair(origen, mudo, titular, 3)
    expect(resultado.score).toBe(2)
    expect(resultado.matchedBy).toEqual(['holder_named'])
  })

  it('suma +2 una sola vez aunque coincidan el proveedor y el titular', () => {
    const unicaja = leg('ALEX EJEMPLO', 'TRASPASO A REVOLUT', ['UNICAJA'])
    const revolut = leg('Cuenta propia', 'Ingreso', ['REVOLUT'])

    const resultado = scorePair(unicaja, revolut, titular, 3)
    expect(resultado.score).toBe(2)
    expect(resultado.matchedBy).toEqual(['other_provider_named', 'holder_named'])
  })

  it('busca la señal en la contraparte y en la descripción de las dos patas', () => {
    const unicaja = leg(null, null, ['UNICAJA'])
    const revolut = leg('De UNICAJA', null, ['REVOLUT'])

    // La señal está en la pata de Revolut y nombra a la cuenta de Unicaja.
    expect(scorePair(unicaja, revolut, [], 3).score).toBe(2)
    // Y da igual el orden de los argumentos.
    expect(scorePair(revolut, unicaja, [], 3).score).toBe(2)
  })

  it('no puntúa que un movimiento nombre al proveedor de su propia cuenta', () => {
    const unicaja = leg(null, 'COMISION UNICAJA', ['UNICAJA'])
    const revolut = leg(null, 'Ingreso', ['REVOLUT'])

    expect(scorePair(unicaja, revolut, [], 3).score).toBe(0)
  })

  it('ignora un alias vacío, en blanco o de menos de tres caracteres', () => {
    const conRuido = leg(null, 'PAGO', ['', '   ', '**', 'AB'])
    const otra = leg(null, 'AB PAGO', [])

    expect(scorePair(otra, conRuido, [], 3).score).toBe(0)
  })

  it('no puntúa nada cuando no hay contraparte ni descripción', () => {
    const resultado = scorePair(mudo, mudo, titular, 3)
    expect(resultado.score).toBe(0)
    expect(resultado.matchedBy).toEqual([])
  })
})

describe('scorePair · la señal de las fechas', () => {
  it('suma +1 cuando las dos patas son del mismo día', () => {
    const resultado = scorePair(mudo, mudo, [], 0)
    expect(resultado.score).toBe(1)
    expect(resultado.matchedBy).toEqual(['close_dates'])
  })

  it('suma +1 con un día de diferencia', () => {
    expect(scorePair(mudo, mudo, [], 1).score).toBe(1)
  })

  it('no suma +1 con dos días de diferencia', () => {
    expect(scorePair(mudo, mudo, [], 2).score).toBe(0)
    expect(scorePair(mudo, mudo, [], 3).score).toBe(0)
  })
})

describe('scorePair · las señales juntas', () => {
  it('llega a 3 sumando el nombre y la cercanía de fechas', () => {
    const unicaja = leg(null, 'TRASPASO A REVOLUT', ['UNICAJA'])
    const revolut = leg('Cuenta propia', 'Ingreso', ['REVOLUT'])

    expect(scorePair(unicaja, revolut, [], 0).score).toBe(3)
  })

  it('anota las señales en el orden canónico', () => {
    const unicaja = leg('ALEX EJEMPLO', 'TRASPASO A REVOLUT', ['UNICAJA'])
    const revolut = leg('Cuenta propia', 'Ingreso', ['REVOLUT'])

    expect(scorePair(unicaja, revolut, titular, 1).matchedBy).toEqual([
      'other_provider_named',
      'holder_named',
      'close_dates',
    ])
  })
})

describe('normalizeNeedles', () => {
  it('normaliza, descarta lo vacío y no repite', () => {
    expect(normalizeNeedles(['Revolut', 'REVOLUT', '', '  ', 'Únicaja'])).toEqual([
      'REVOLUT',
      'UNICAJA',
    ])
  })
})

describe('searchableText', () => {
  it('une contraparte y descripción tratando los nulos como vacío', () => {
    expect(searchableText('Revolut**1234', 'Pago con tarjeta')).toBe(
      'REVOLUT 1234 PAGO CON TARJETA',
    )
    expect(searchableText(null, 'Pago')).toBe('PAGO')
    expect(searchableText('Pago', null)).toBe('PAGO')
    expect(searchableText(null, null)).toBe('')
  })
})
