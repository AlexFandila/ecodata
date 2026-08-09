/**
 * El detalle de un movimiento y las dos formas de sacarlo de la bandeja:
 * ponerle una categoría a mano, o escribir una regla que lo categorice a él y a
 * todos sus iguales (paso 3 del pipeline de DATA_MODEL.md).
 *
 * Las dos existen porque resuelven casos distintos: un bizum a un amigo no
 * merece una regla y una regla que solo casara con él sería basura acumulada;
 * el recibo del gimnasio, en cambio, va a repetirse todos los meses y
 * categorizarlo a mano cada vez es trabajo que la máquina puede hacer sola.
 *
 * La regla se pre-rellena con el campo que el movimiento **tiene lleno**: la
 * Norma 43 deja `counterparty` a null y lo mete todo en `description`
 * (ADR-010), y el CSV de Revolut hace justo lo contrario (ADR-011). Elegir
 * siempre el mismo dejaría el formulario en blanco con la mitad de las fuentes.
 */
import type {
  Category,
  CategorySource,
  RuleField,
  RuleMatchType,
  Transaction,
} from '@finanzas/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useId, useState } from 'react'
import { Link, useParams } from 'react-router'
import { accountsQueryKey, fetchAccounts } from '../api/accounts'
import { categoriesQueryKey, fetchCategories } from '../api/categories'
import { ApiError } from '../api/client'
import { createRule } from '../api/rules'
import {
  fetchTransaction,
  transactionQueryKey,
  transactionsRootKey,
  updateTransactionCategory,
} from '../api/transactions'
import { CONTROL_CLASS, Field } from '../components/Field'
import { Notice, NoticeDetails } from '../components/Notice'
import { Screen } from '../components/Screen'
import { formatFullDay } from '../format/date'
import { formatMoney } from '../format/money'

const MATCH_TYPE_LABELS: Record<RuleMatchType, string> = {
  contains: 'Contiene el texto',
  regex: 'Expresión regular',
}

const FIELD_LABELS: Record<RuleField, string> = {
  counterparty: 'Contraparte',
  description: 'Concepto',
}

/** Quién puso la categoría. `suggestion` es de la Fase 5, pero el tipo ya la trae. */
const SOURCE_LABELS: Record<CategorySource, string> = {
  rule: 'puesta por una regla',
  manual: 'puesta a mano',
  suggestion: 'sugerida, sin confirmar',
  transfer: 'la de la transferencia interna',
}

export function TransactionScreen() {
  const { id } = useParams()
  const transactionId = Number(id)
  const queryClient = useQueryClient()

  const detail = useQuery({
    queryKey: transactionQueryKey(transactionId),
    queryFn: () => fetchTransaction(transactionId),
    retry: false,
    enabled: Number.isInteger(transactionId) && transactionId > 0,
  })

  const categories = useQuery({
    queryKey: categoriesQueryKey,
    queryFn: fetchCategories,
    retry: false,
  })
  const accounts = useQuery({ queryKey: accountsQueryKey, queryFn: fetchAccounts, retry: false })

  if (!Number.isInteger(transactionId) || transactionId <= 0) {
    return (
      <Screen title="Movimiento">
        <Notice title="Ese identificador no es un movimiento" />
        <BackLink />
      </Screen>
    )
  }

  if (detail.isPending) {
    return (
      <Screen title="Movimiento">
        <p className="text-slate-400 text-sm">Cargando el movimiento…</p>
      </Screen>
    )
  }

  if (detail.error) {
    // Un borrado y uno que nunca existió son lo mismo para el cliente
    // (invariante 5), así que el 404 se cuenta como tal y no como un fallo.
    const gone = detail.error instanceof ApiError && detail.error.code === 'not_found'
    return (
      <Screen title="Movimiento">
        {gone ? (
          <p className="text-slate-400 text-sm">Ese movimiento ya no existe.</p>
        ) : (
          <Notice title="No se ha podido cargar el movimiento" detail={detail.error.message} />
        )}
        <BackLink />
      </Screen>
    )
  }

  const transaction = detail.data
  const accountName = accounts.data?.find((account) => account.id === transaction.accountId)?.name

  return (
    <Screen title="Movimiento">
      <Summary transaction={transaction} accountName={accountName} />

      <Categorize
        transaction={transaction}
        categories={categories.data ?? []}
        onDone={() => queryClient.invalidateQueries({ queryKey: transactionsRootKey })}
      />

      {transaction.transferId === null ? (
        <RuleForm
          transaction={transaction}
          categories={categories.data ?? []}
          onDone={() => queryClient.invalidateQueries({ queryKey: transactionsRootKey })}
        />
      ) : null}

      {transaction.transferId === null ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-medium text-slate-100">¿Es un traspaso entre cuentas tuyas?</h2>
          <p className="text-slate-500 text-xs">
            Emparejarlo con su otra pata lo saca de ingresos y gastos, pero sigue moviendo el saldo
            de las dos cuentas.
          </p>
          <Link
            to={`/movimientos/transferencias/emparejar?con=${transaction.id}`}
            className="min-h-11 rounded-xl bg-slate-800 px-4 py-3 text-center font-medium text-slate-100"
          >
            Emparejar como transferencia interna
          </Link>
        </section>
      ) : null}

      <BackLink />
    </Screen>
  )
}

function Summary({
  transaction,
  accountName,
}: {
  transaction: Transaction
  accountName: string | undefined
}) {
  const charge = transaction.amountCents < 0

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-slate-800/60 p-4">
      <p
        className={`font-semibold text-3xl tabular-nums ${charge ? 'text-rose-400' : 'text-emerald-400'}`}
      >
        {formatMoney(transaction.amountCents, transaction.currency)}
      </p>
      <dl className="flex flex-col gap-2 text-sm">
        <Row label="Fecha" value={formatFullDay(transaction.bookedAt)} />
        {transaction.counterparty === null ? null : (
          <Row label="Contraparte" value={transaction.counterparty} />
        )}
        {transaction.description === null ? null : (
          <Row label="Concepto" value={transaction.description} />
        )}
        {accountName === undefined ? null : <Row label="Cuenta" value={accountName} />}
        <Row
          label="Categoría"
          value={
            transaction.categorySource === null
              ? 'sin categorizar'
              : SOURCE_LABELS[transaction.categorySource]
          }
        />
      </dl>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-slate-400">{label}</dt>
      <dd className="text-right text-slate-100">{value}</dd>
    </div>
  )
}

/** Poner o quitar la categoría a mano. */
function Categorize({
  transaction,
  categories,
  onDone,
}: {
  transaction: Transaction
  categories: readonly Category[]
  onDone: () => void
}) {
  const fieldId = useId()
  const [categoryId, setCategoryId] = useState(
    transaction.categoryId === null ? '' : String(transaction.categoryId),
  )

  const update = useMutation({
    mutationFn: updateTransactionCategory,
    onSuccess: onDone,
  })

  if (transaction.transferId !== null) {
    // Invariante 3: la categoría de una pata de transferencia la pone la
    // transferencia. Decirlo aquí evita un 409 que el usuario no esperaba, y
    // llevarle a donde sí puede hacer algo —deshacerla— evita que el aviso sea
    // un callejón sin salida.
    return (
      <section className="flex flex-col gap-3">
        <p className="text-slate-400 text-sm">
          Este movimiento es parte de una transferencia interna: su categoría depende de la
          transferencia y no se puede cambiar aquí.
        </p>
        <Link
          to="/movimientos/transferencias"
          className="min-h-11 rounded-xl bg-slate-800 px-4 py-3 text-center font-medium text-slate-100"
        >
          Ver la transferencia
        </Link>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium text-slate-100">Categorizar</h2>

      {update.error ? (
        <Notice title="No se ha podido guardar la categoría" detail={update.error.message} />
      ) : null}

      <Field id={fieldId} label="Categoría">
        <select
          id={fieldId}
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          className={CONTROL_CLASS}
        >
          <option value="">Sin categorizar</option>
          {categories.map((category) => (
            <option key={category.id} value={String(category.id)}>
              {category.name}
            </option>
          ))}
        </select>
      </Field>

      <button
        type="button"
        disabled={update.isPending}
        onClick={() =>
          update.mutate({
            id: transaction.id,
            categoryId: categoryId === '' ? null : Number(categoryId),
          })
        }
        className="min-h-11 rounded-xl bg-emerald-500 px-4 py-3 font-medium text-slate-950 disabled:bg-slate-700 disabled:text-slate-400"
      >
        {update.isPending ? 'Guardando…' : 'Guardar la categoría'}
      </button>

      {update.isSuccess ? (
        <p className="text-emerald-400 text-sm">
          {update.data.categoryId === null
            ? 'Vuelve a estar sin categorizar.'
            : 'Guardada. Las reglas ya no la tocarán.'}
        </p>
      ) : null}
    </section>
  )
}

/** Crear una regla a partir de este movimiento, y aplicarla al momento. */
function RuleForm({
  transaction,
  categories,
  onDone,
}: {
  transaction: Transaction
  categories: readonly Category[]
  onDone: () => void
}) {
  const fieldFieldId = useId()
  const matchTypeFieldId = useId()
  const patternFieldId = useId()
  const categoryFieldId = useId()

  // El campo que la fuente ha llenado; si están los dos, la contraparte, que es
  // el texto más estable de los dos (la descripción cambia con el concepto).
  const initialField: RuleField = transaction.counterparty !== null ? 'counterparty' : 'description'

  const [field, setField] = useState<RuleField>(initialField)
  const [matchType, setMatchType] = useState<RuleMatchType>('contains')
  const [pattern, setPattern] = useState(
    (transaction.counterparty ?? transaction.description ?? '').trim(),
  )
  const [categoryId, setCategoryId] = useState(
    transaction.categoryId === null ? '' : String(transaction.categoryId),
  )

  const create = useMutation({ mutationFn: createRule, onSuccess: onDone })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (categoryId === '') return
    create.mutate({ field, matchType, pattern, categoryId: Number(categoryId) })
  }

  const result = create.data
  if (result !== undefined) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="font-medium text-slate-100">Regla creada</h2>
        <p className="text-emerald-400 text-sm">
          {result.categorization.categorized === 0
            ? 'La regla está guardada, pero no ha categorizado ningún movimiento.'
            : `La regla ha categorizado ${result.categorization.categorized} ${
                result.categorization.categorized === 1 ? 'movimiento' : 'movimientos'
              }.`}
        </p>
        {result.categorization.cleared > 0 ? (
          <p className="text-slate-400 text-sm">
            Además ha devuelto {result.categorization.cleared} a «sin categorizar», porque las
            reglas que los etiquetaban ya no casan.
          </p>
        ) : null}
        {result.categorization.invalidRules.length > 0 ? (
          <Notice
            title="Hay reglas que no se han podido aplicar"
            hint="Se han saltado para no bloquear las demás."
          >
            <ul className="mt-2 flex flex-col gap-1 text-xs">
              {result.categorization.invalidRules.map((invalid) => (
                <li key={invalid.ruleId}>
                  Regla {invalid.ruleId}: {invalid.message}
                </li>
              ))}
            </ul>
          </Notice>
        ) : null}
        <button
          type="button"
          onClick={() => create.reset()}
          className="min-h-11 rounded-xl bg-slate-800 px-4 py-3 font-medium text-slate-100"
        >
          Crear otra regla
        </button>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium text-slate-100">Crear una regla a partir de este movimiento</h2>

      {create.error ? <RuleError error={create.error} /> : null}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field id={fieldFieldId} label="Compara contra">
          <select
            id={fieldFieldId}
            value={field}
            onChange={(event) => setField(event.target.value as RuleField)}
            className={CONTROL_CLASS}
          >
            {Object.entries(FIELD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <Field id={matchTypeFieldId} label="Cómo compara">
          <select
            id={matchTypeFieldId}
            value={matchType}
            onChange={(event) => setMatchType(event.target.value as RuleMatchType)}
            className={CONTROL_CLASS}
          >
            {Object.entries(MATCH_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <Field id={patternFieldId} label="Patrón">
          <input
            id={patternFieldId}
            value={pattern}
            onChange={(event) => setPattern(event.target.value)}
            className={CONTROL_CLASS}
          />
        </Field>
        <p className="text-slate-500 text-xs">
          {matchType === 'contains'
            ? 'Ignora acentos, mayúsculas y puntuación: «SUPER» casa con «Supermercado».'
            : 'Se compara contra el texto tal cual, con acentos y puntuación incluidos.'}
        </p>

        <Field id={categoryFieldId} label="Categoría de la regla">
          <select
            id={categoryFieldId}
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className={CONTROL_CLASS}
          >
            <option value="">Elige una categoría</option>
            {categories.map((category) => (
              <option key={category.id} value={String(category.id)}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>

        <button
          type="submit"
          disabled={pattern.trim() === '' || categoryId === '' || create.isPending}
          className="min-h-11 rounded-xl bg-emerald-500 px-4 py-3 font-medium text-slate-950 disabled:bg-slate-700 disabled:text-slate-400"
        >
          {create.isPending ? 'Creando…' : 'Crear la regla y aplicarla'}
        </button>
      </form>
    </section>
  )
}

/** Decide por el `code` y no por el texto del mensaje (ADR-009). */
function RuleError({ error }: { error: Error }) {
  if (!(error instanceof ApiError)) {
    return <Notice title="No se ha podido contactar con la API" detail={error.message} />
  }

  switch (error.code) {
    case 'validation_error':
      return (
        <Notice
          title="La regla no es válida"
          detail={error.message}
          hint="Una expresión regular tiene que compilar, y un patrón de «contiene» necesita al menos una letra o una cifra."
        >
          <NoticeDetails details={error.details} />
        </Notice>
      )
    case 'not_found':
      return <Notice title="Esa categoría ya no existe" detail={error.message} />
    default:
      return <Notice title="No se ha podido crear la regla" detail={error.message} />
  }
}

function BackLink() {
  return (
    <Link to="/movimientos" className="text-slate-400 text-sm underline">
      Volver a los movimientos
    </Link>
  )
}
