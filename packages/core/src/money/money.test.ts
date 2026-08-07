import { describe, expect, it } from 'vitest'
import {
  absolute,
  add,
  allocate,
  compare,
  divide,
  equals,
  isNegative,
  isOpposite,
  isPositive,
  isZero,
  max,
  min,
  money,
  multiply,
  negate,
  percentage,
  roundHalfEven,
  split,
  subtract,
  sum,
  zero,
} from './money'

const eur = (amountCents: number) => money(amountCents, 'EUR')
const usd = (amountCents: number) => money(amountCents, 'USD')

describe('money', () => {
  it('construye un importe con céntimos y divisa', () => {
    expect(eur(1250)).toEqual({ amountCents: 1250, currency: 'EUR' })
  })

  it('admite importes negativos, que representan cargos', () => {
    expect(eur(-1250).amountCents).toBe(-1250)
  })

  it('rechaza decimales: los importes son enteros en céntimos', () => {
    expect(() => eur(12.5)).toThrow(/enteros en céntimos/)
  })

  it('rechaza valores no finitos', () => {
    expect(() => eur(Number.NaN)).toThrow(/enteros en céntimos/)
    expect(() => eur(Number.POSITIVE_INFINITY)).toThrow(/enteros en céntimos/)
  })

  it('rechaza importes fuera del rango entero seguro', () => {
    expect(() => eur(Number.MAX_SAFE_INTEGER + 1)).toThrow(/enteros en céntimos/)
  })

  it('normaliza el cero negativo', () => {
    expect(Object.is(negate(zero('EUR')).amountCents, 0)).toBe(true)
  })
})

describe('suma y resta', () => {
  it('suma importes de la misma divisa', () => {
    expect(add(eur(1250), eur(750))).toEqual(eur(2000))
  })

  it('resta importes de la misma divisa', () => {
    expect(subtract(eur(1250), eur(750))).toEqual(eur(500))
  })

  it('trata los cargos como negativos al sumar', () => {
    expect(add(eur(10_000), eur(-2550))).toEqual(eur(7450))
  })

  it('niega y toma el valor absoluto', () => {
    expect(negate(eur(-1250))).toEqual(eur(1250))
    expect(absolute(eur(-1250))).toEqual(eur(1250))
    expect(absolute(eur(1250))).toEqual(eur(1250))
  })

  it('lanza al mezclar divisas', () => {
    expect(() => add(eur(100), usd(100))).toThrow(/divisas distintas/)
    expect(() => subtract(eur(100), usd(100))).toThrow(/divisas distintas/)
  })

  it('lanza si el resultado se sale del rango seguro', () => {
    const enorme = eur(Number.MAX_SAFE_INTEGER)
    expect(() => add(enorme, eur(1))).toThrow(/rango seguro/)
  })
})

describe('sum', () => {
  it('suma una lista de importes', () => {
    expect(sum([eur(1000), eur(-250), eur(30)], 'EUR')).toEqual(eur(780))
  })

  it('devuelve cero en la divisa dada si la lista está vacía', () => {
    expect(sum([], 'EUR')).toEqual(eur(0))
  })

  it('lanza si algún importe es de otra divisa', () => {
    expect(() => sum([eur(100), usd(100)], 'EUR')).toThrow(/divisas distintas/)
  })
})

describe('roundHalfEven', () => {
  it('en el empate se queda con el entero par', () => {
    expect(roundHalfEven(2.5)).toBe(2)
    expect(roundHalfEven(3.5)).toBe(4)
    expect(roundHalfEven(-2.5)).toBe(-2)
    expect(roundHalfEven(-3.5)).toBe(-4)
  })

  it('fuera del empate redondea al más cercano', () => {
    expect(roundHalfEven(2.4)).toBe(2)
    expect(roundHalfEven(2.6)).toBe(3)
    expect(roundHalfEven(-2.4)).toBe(-2)
    expect(roundHalfEven(-2.6)).toBe(-3)
  })

  it('no toca los enteros', () => {
    expect(roundHalfEven(7)).toBe(7)
    expect(roundHalfEven(-7)).toBe(-7)
    expect(roundHalfEven(0)).toBe(0)
  })
})

describe('multiply, divide y percentage', () => {
  it('multiplica y redondea half-even', () => {
    expect(multiply(eur(1000), 0.335)).toEqual(eur(335))
    expect(multiply(eur(100), 1.5)).toEqual(eur(150))
    expect(multiply(eur(-1000), 0.5)).toEqual(eur(-500))
  })

  it('multiplicar por cero da cero', () => {
    expect(multiply(eur(12_345), 0)).toEqual(eur(0))
  })

  it('divide y redondea half-even', () => {
    expect(divide(eur(1000), 3)).toEqual(eur(333))
    expect(divide(eur(5), 2)).toEqual(eur(2))
    expect(divide(eur(7), 2)).toEqual(eur(4))
  })

  it('lanza al dividir por cero o por un valor no finito', () => {
    expect(() => divide(eur(100), 0)).toThrow(/divisor/)
    expect(() => divide(eur(100), Number.NaN)).toThrow(/divisor/)
  })

  it('lanza si el factor no es finito', () => {
    expect(() => multiply(eur(100), Number.POSITIVE_INFINITY)).toThrow(/factor/)
  })

  it('calcula porcentajes', () => {
    expect(percentage(eur(10_000), 21)).toEqual(eur(2100))
    expect(percentage(eur(1999), 50)).toEqual(eur(1000))
  })
})

describe('allocate', () => {
  it('reparte a partes iguales dando el resto a los primeros', () => {
    expect(allocate(eur(1000), [1, 1, 1]).map((part) => part.amountCents)).toEqual([334, 333, 333])
  })

  it('reparte proporcionalmente a los pesos', () => {
    expect(allocate(eur(10_000), [3, 1]).map((part) => part.amountCents)).toEqual([7500, 2500])
  })

  it('reparte importes negativos sin perder el signo', () => {
    expect(allocate(eur(-1000), [1, 1, 1]).map((part) => part.amountCents)).toEqual([
      -334, -333, -333,
    ])
  })

  it('deja a cero los pesos nulos', () => {
    expect(allocate(eur(1000), [1, 0, 1]).map((part) => part.amountCents)).toEqual([500, 0, 500])
  })

  it('nunca pierde ni inventa un céntimo', () => {
    const casos: ReadonlyArray<readonly [number, readonly number[]]> = [
      [1, [1, 1]],
      [7, [1, 1, 1]],
      [100, [1, 2, 3]],
      [-7, [1, 1, 1]],
      [123_457, [1, 1, 1, 1, 1, 1, 1]],
      [999, [0.5, 0.25, 0.25]],
    ]
    for (const [amountCents, weights] of casos) {
      const partes = allocate(eur(amountCents), weights)
      expect(sum(partes, 'EUR')).toEqual(eur(amountCents))
      expect(partes).toHaveLength(weights.length)
    }
  })

  it('lanza si no hay pesos, si suman cero o si alguno es negativo', () => {
    expect(() => allocate(eur(100), [])).toThrow(/al menos un peso/)
    expect(() => allocate(eur(100), [0, 0])).toThrow(/no puede ser cero/)
    expect(() => allocate(eur(100), [1, -1])).toThrow(/no negativos/)
  })
})

describe('split', () => {
  it('parte en trozos iguales repartiendo el resto', () => {
    expect(split(eur(1000), 3).map((part) => part.amountCents)).toEqual([334, 333, 333])
  })

  it('lanza si el número de partes no es un entero positivo', () => {
    expect(() => split(eur(100), 0)).toThrow(/entero positivo/)
    expect(() => split(eur(100), 2.5)).toThrow(/entero positivo/)
  })
})

describe('comparaciones', () => {
  it('ordena importes de la misma divisa', () => {
    expect(compare(eur(100), eur(200))).toBe(-1)
    expect(compare(eur(200), eur(100))).toBe(1)
    expect(compare(eur(100), eur(100))).toBe(0)
  })

  it('lanza al ordenar divisas distintas: no significa nada sin tipo de cambio', () => {
    expect(() => compare(eur(100), usd(100))).toThrow(/divisas distintas/)
  })

  it('min y max devuelven el importe correcto', () => {
    expect(min(eur(100), eur(-200))).toEqual(eur(-200))
    expect(max(eur(100), eur(-200))).toEqual(eur(100))
  })

  it('equals compara importe y divisa sin lanzar', () => {
    expect(equals(eur(100), eur(100))).toBe(true)
    expect(equals(eur(100), eur(101))).toBe(false)
    expect(equals(eur(100), usd(100))).toBe(false)
  })

  it('isOpposite detecta las dos patas de una transferencia interna', () => {
    expect(isOpposite(eur(-50_000), eur(50_000))).toBe(true)
    expect(isOpposite(eur(50_000), eur(-50_000))).toBe(true)
  })

  it('isOpposite exige misma divisa e importes distintos de cero', () => {
    expect(isOpposite(eur(-50_000), usd(50_000))).toBe(false)
    expect(isOpposite(eur(0), eur(0))).toBe(false)
    expect(isOpposite(eur(-50_000), eur(50_001))).toBe(false)
  })

  it('predicados de signo', () => {
    expect(isZero(zero('EUR'))).toBe(true)
    expect(isNegative(eur(-1))).toBe(true)
    expect(isPositive(eur(1))).toBe(true)
    expect(isNegative(eur(0))).toBe(false)
    expect(isPositive(eur(0))).toBe(false)
  })
})
