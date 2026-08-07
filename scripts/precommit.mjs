#!/usr/bin/env node
/**
 * Hook pre-commit: el suelo de la defensa en capas del ADR-006.
 *
 * 1. Escanea IBANs españoles en el contenido *staged* (no en el del disco).
 * 2. Si pasa, ejecuta `pnpm lint` y `pnpm typecheck`.
 *
 * Nunca lee `data/`: está en .gitignore, luego nunca llega a estar staged, y el
 * sandbox lo bloquearía igualmente.
 */
import { execFileSync } from 'node:child_process'

const MAX_BYTES = 1024 * 1024

/**
 * El roadmap especifica `ES\d{22}`, que es la longitud correcta de un IBAN
 * español (ES + 2 dígitos de control + 20 de cuenta). Pero los IBANs se
 * escriben casi siempre agrupados (en bloques de cuatro separados por espacios
 * o guiones), así que se permiten esos separadores *dentro* de la secuencia. El
 * lookbehind evita disparar con palabras que acaban en ES (PAISES, MESES...)
 * seguidas de cifras.
 *
 * Aquí no va ningún IBAN de ejemplo completo, ni siquiera inventado: este
 * fichero también pasa por el escáner y se bloquearía a sí mismo.
 */
const IBAN_ES = /(?<![A-Za-z0-9])ES(?:[ -]*\d){22}(?![\d])/

function stagedFiles() {
  const output = execFileSync(
    'git',
    ['diff', '--cached', '--name-only', '--diff-filter=ACM', '-z'],
    {
      encoding: 'utf8',
    },
  )
  return output.split('\0').filter(Boolean)
}

function stagedContent(file) {
  try {
    return execFileSync('git', ['show', `:${file}`], { maxBuffer: MAX_BYTES * 4 })
  } catch {
    return null
  }
}

function scanForIbans() {
  const hits = []

  for (const file of stagedFiles()) {
    const buffer = stagedContent(file)
    if (!buffer || buffer.length > MAX_BYTES) continue
    // Binarios: si hay un byte nulo en la cabecera, no es texto.
    if (buffer.subarray(0, 8000).includes(0)) continue

    const lines = buffer.toString('utf8').split('\n')
    lines.forEach((line, index) => {
      const match = IBAN_ES.exec(line)
      if (match) {
        hits.push({ file, line: index + 1, match: match[0].trim() })
      }
    })
  }

  return hits
}

function redact(iban) {
  const digits = iban.replace(/[^\dA-Z]/g, '')
  return `${digits.slice(0, 6)}…${digits.slice(-2)}`
}

function run(command, args) {
  console.log(`\n▶ ${command} ${args.join(' ')}`)
  execFileSync(command, args, { stdio: 'inherit' })
}

const hits = scanForIbans()

if (hits.length > 0) {
  console.error('\n✖ Commit abortado: hay IBANs españoles en los ficheros staged.\n')
  for (const hit of hits) {
    console.error(`  ${hit.file}:${hit.line} → ${redact(hit.match)}`)
  }
  console.error(
    '\nLos datos reales van solo a data/ (fuera de git). Los fixtures y ejemplos usan\n' +
      'IBANs inventados, pero si de verdad necesitas uno sintético en el repo, sáltate\n' +
      'el hook a conciencia con `git commit --no-verify`.\n',
  )
  process.exit(1)
}

try {
  run('pnpm', ['lint'])
  run('pnpm', ['typecheck'])
} catch {
  console.error('\n✖ Commit abortado: lint o typecheck en rojo.\n')
  process.exit(1)
}
