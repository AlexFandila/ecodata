/**
 * Matching de transferencias internas: dado un conjunto de movimientos, qué
 * pares son las dos patas del mismo traspaso entre cuentas propias.
 *
 * Implementa la heurística de docs/DATA_MODEL.md. Las tres cosas que aquel
 * texto dejaba abiertas —cómo se asigna cuando hay varios candidatos, si el +2
 * acumula, y si hace falta puntuación mínima— las fija ADR-013.
 *
 * Es una función pura y determinista: sin reloj, sin aleatoriedad, y el
 * resultado no depende del orden en que lleguen los candidatos. Eso último no
 * es cosmético: si dependiera del orden, el mismo mes daría parejas distintas
 * según qué extracto se importara antes.
 */

import { daysBetween, isCalendarDate } from '../dates/days'
import { isOpposite, type Money, money } from '../money/money'
import type {
  TransferCandidate,
  TransferMatch,
  TransferMatchingAccount,
  TransferMatchingInput,
  TransferMatchingResult,
  TransferMatchSignal,
  UnresolvedCandidate,
} from './candidate'
import { TransferMatchingError } from './errors'
import {
  normalizeNeedles,
  type ScorableLeg,
  scorePair,
  searchableText,
  TRANSFER_MAX_DAY_GAP,
} from './score'

/** Un candidato con todo lo caro ya calculado: se hace una vez, no por par. */
type PreparedCandidate = {
  readonly id: number
  readonly accountId: number
  readonly bookedAt: string
  readonly money: Money
  readonly leg: ScorableLeg
}

/** Un par factible, ya puntuado. */
type Edge = {
  readonly outTxnId: number
  readonly inTxnId: number
  readonly score: number
  readonly dayGap: number
  readonly matchedBy: readonly TransferMatchSignal[]
}

/** El mejor resultado de un movimiento entre los compañeros que siguen libres. */
type Best = {
  readonly score: number
  readonly partners: readonly number[]
}

/**
 * Empareja las dos patas de las transferencias internas de un conjunto de
 * movimientos.
 *
 * Lanza `TransferMatchingError` ante lo que solo puede ser un fallo de quien
 * llama: ids repetidos, una cuenta que no viene en la lista, una fecha contable
 * que no existe en el calendario. Un importe que no sea entero de céntimos lo
 * rechaza `money()` con un `MoneyError`, que es de quien es la regla.
 */
export function matchInternalTransfers(input: TransferMatchingInput): TransferMatchingResult {
  const accounts = indexAccounts(input.accounts)
  const holderNeedles = normalizeNeedles(input.holderNames)
  const prepared = prepare(input.candidates, accounts)

  const matches: TransferMatch[] = []
  const unresolved: UnresolvedCandidate[] = []

  for (const bucket of bucketByAmount(prepared).values()) {
    resolve(feasibleEdges(bucket, holderNeedles), matches, unresolved)
  }

  matches.sort((a, b) => a.outTxnId - b.outTxnId)
  unresolved.sort((a, b) => a.transactionId - b.transactionId)

  return { matches, unresolved }
}

function indexAccounts(
  accounts: readonly TransferMatchingAccount[],
): ReadonlyMap<number, TransferMatchingAccount> {
  return new Map(accounts.map((account) => [account.id, account]))
}

/**
 * Valida y precalcula. La validación es total y va antes que nada: un error a
 * mitad de camino dejaría un resultado parcial que parece completo.
 */
function prepare(
  candidates: readonly TransferCandidate[],
  accounts: ReadonlyMap<number, TransferMatchingAccount>,
): readonly PreparedCandidate[] {
  const seen = new Set<number>()
  const prepared: PreparedCandidate[] = []

  for (const candidate of candidates) {
    if (seen.has(candidate.id)) {
      throw new TransferMatchingError(`Dos candidatos comparten el id ${candidate.id}`)
    }
    seen.add(candidate.id)

    const account = accounts.get(candidate.accountId)
    if (account === undefined) {
      throw new TransferMatchingError(
        `El movimiento ${candidate.id} apunta a la cuenta ${candidate.accountId}, que no viene en la lista`,
      )
    }

    if (!isCalendarDate(candidate.bookedAt)) {
      throw new TransferMatchingError(
        `El movimiento ${candidate.id} tiene una fecha contable que no existe: ${JSON.stringify(candidate.bookedAt)}`,
      )
    }

    // Criterio (a): las cuentas ajenas no participan. Y un apunte de cero no
    // es una transferencia, que es lo que ya dice `isOpposite`.
    if (!account.isOwn || candidate.amountCents === 0) continue

    prepared.push({
      id: candidate.id,
      accountId: candidate.accountId,
      bookedAt: candidate.bookedAt,
      money: money(candidate.amountCents, candidate.currency),
      leg: {
        text: searchableText(candidate.counterparty, candidate.description),
        accountNeedles: normalizeNeedles(account.aliases),
      },
    })
  }

  return prepared
}

/**
 * Agrupa por divisa y valor absoluto del importe.
 *
 * Dos movimientos de cubetas distintas jamás pueden ser pareja, así que el
 * criterio (b) queda resuelto en una pasada lineal y el resto del trabajo
 * —que es cuadrático— se queda dentro de grupos que en datos reales tienen dos
 * o tres elementos. Las cubetas además son independientes entre sí, así que
 * cada una se resuelve por separado.
 */
function bucketByAmount(
  candidates: readonly PreparedCandidate[],
): ReadonlyMap<string, PreparedCandidate[]> {
  const buckets = new Map<string, PreparedCandidate[]>()

  for (const candidate of candidates) {
    const key = `${candidate.money.currency} ${Math.abs(candidate.money.amountCents)}`
    const bucket = buckets.get(key)
    if (bucket === undefined) buckets.set(key, [candidate])
    else bucket.push(candidate)
  }

  return buckets
}

/** Los pares de una cubeta que cumplen los criterios (a)-(c), ya puntuados. */
function feasibleEdges(
  bucket: readonly PreparedCandidate[],
  holderNeedles: readonly string[],
): readonly Edge[] {
  const outs = bucket.filter((candidate) => candidate.money.amountCents < 0)
  const ins = bucket.filter((candidate) => candidate.money.amountCents > 0)
  const edges: Edge[] = []

  for (const out of outs) {
    for (const into of ins) {
      if (out.accountId === into.accountId) continue
      if (!isOpposite(out.money, into.money)) continue

      const dayGap = Math.abs(daysBetween(out.bookedAt, into.bookedAt))
      if (dayGap > TRANSFER_MAX_DAY_GAP) continue

      const { score, matchedBy } = scorePair(out.leg, into.leg, holderNeedles, dayGap)
      edges.push({ outTxnId: out.id, inTxnId: into.id, score, dayGap, matchedBy })
    }
  }

  return edges
}

/**
 * Asigna los pares de una cubeta: mejor mutuo e inequívoco, iterado hasta punto
 * fijo (ADR-013).
 *
 * Un par se acepta solo si cada pata es el **único** máximo de puntuación de la
 * otra. Los aceptados de una ronda se retiran y se vuelve a mirar, porque el
 * que se queda sin su primera opción puede tener una segunda: sin iterar, esto
 * empareja de menos.
 *
 * Termina siempre: una ronda productiva retira al menos dos movimientos y una
 * improductiva corta. Y el conjunto aceptado en cada ronda es función de quién
 * sigue libre, no del orden de la lista, que es de donde sale el determinismo.
 */
function resolve(
  edges: readonly Edge[],
  matches: TransferMatch[],
  unresolved: UnresolvedCandidate[],
): void {
  const byNode = new Map<number, Edge[]>()
  for (const edge of edges) {
    append(byNode, edge.outTxnId, edge)
    append(byNode, edge.inTxnId, edge)
  }

  const taken = new Set<number>()

  for (;;) {
    const best = new Map<number, Best>()
    for (const [node, incident] of byNode) {
      if (taken.has(node)) continue
      const candidate = bestAvailable(node, incident, taken)
      if (candidate !== null) best.set(node, candidate)
    }

    const accepted = edges.filter((edge) => isMutualAndUnique(edge, best, taken))
    if (accepted.length === 0) {
      // Nadie más se puede emparejar sin romper un empate. Lo que queda con
      // varias mejores opciones va a revisión; lo que se quedó sin compañeros
      // simplemente no tiene pareja y no hay nada que explicar.
      for (const [node, candidate] of best) {
        if (candidate.partners.length < 2) continue
        unresolved.push({
          transactionId: node,
          reason: 'tie',
          tiedWith: [...candidate.partners].sort((a, b) => a - b),
          score: candidate.score,
        })
      }
      return
    }

    for (const edge of accepted) {
      taken.add(edge.outTxnId)
      taken.add(edge.inTxnId)
      matches.push({
        outTxnId: edge.outTxnId,
        inTxnId: edge.inTxnId,
        score: edge.score,
        dayGap: edge.dayGap,
        matchedBy: edge.matchedBy,
      })
    }
  }
}

/** La mejor puntuación de `node` y con quién la consigue, entre los libres. */
function bestAvailable(
  node: number,
  incident: readonly Edge[],
  taken: ReadonlySet<number>,
): Best | null {
  let score = Number.NEGATIVE_INFINITY
  let partners: number[] = []

  for (const edge of incident) {
    const other = edge.outTxnId === node ? edge.inTxnId : edge.outTxnId
    if (taken.has(other)) continue

    if (edge.score > score) {
      score = edge.score
      partners = [other]
    } else if (edge.score === score) {
      partners.push(other)
    }
  }

  return partners.length === 0 ? null : { score, partners }
}

function isMutualAndUnique(
  edge: Edge,
  best: ReadonlyMap<number, Best>,
  taken: ReadonlySet<number>,
) {
  if (taken.has(edge.outTxnId) || taken.has(edge.inTxnId)) return false

  const forOut = best.get(edge.outTxnId)
  const forIn = best.get(edge.inTxnId)
  if (forOut === undefined || forIn === undefined) return false

  if (forOut.partners.length !== 1 || forOut.partners[0] !== edge.inTxnId) return false
  return forIn.partners.length === 1 && forIn.partners[0] === edge.outTxnId
}

function append(byNode: Map<number, Edge[]>, node: number, edge: Edge): void {
  const incident = byNode.get(node)
  if (incident === undefined) byNode.set(node, [edge])
  else incident.push(edge)
}
