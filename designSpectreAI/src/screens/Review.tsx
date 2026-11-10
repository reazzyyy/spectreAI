import { useEffect, useState, type ReactNode } from "react"
import { useApp } from "../app-context"
import { Shell } from "../components/shell"
import {
  Badge,
  Button,
  Icon,
  StateCard,
  type ScreenProps,
  type Tone,
} from "../components/ui"

type Clause = { id: string; num: string; text: string; heading?: string }
type Sug = {
  id: string
  clause: string
  kind: "replace" | "comment"
  from: string
  to?: string
  title: string
  level: "high" | "medium" | "question"
  reason: string
  basis: string
}
type Status = "pending" | "accepted" | "rejected"

const clauses: Clause[] = [
  {
    id: "c51",
    num: "5.1",
    heading: "5. Ответственность сторон",
    text: "За нарушение срока поставки Поставщик уплачивает Покупателю неустойку в размере 0,5% от стоимости всей партии товара за каждый день просрочки.",
  },
  {
    id: "c52",
    num: "5.2",
    text: "Уплата неустойки не освобождает Поставщика от исполнения обязательства в натуре и возмещения убытков в полном объёме.",
  },
  {
    id: "c61",
    num: "6.1",
    heading: "6. Обстоятельства непреодолимой силы",
    text: "Сторона освобождается от ответственности при наступлении обстоятельств непреодолимой силы при условии письменного уведомления другой стороны в течение одного рабочего дня.",
  },
  {
    id: "c72",
    num: "7.2",
    heading: "7. Разрешение споров",
    text: "Споры, не урегулированные путём переговоров, рассматриваются в суде по месту нахождения ответчика.",
  },
]

const suggestions: Sug[] = [
  {
    id: "s1",
    clause: "c51",
    kind: "replace",
    from: "0,5% от стоимости всей партии товара",
    to: "0,1% от стоимости не поставленного в срок товара, но не более 10% такой стоимости",
    title: "Ограничить размер неустойки",
    level: "high",
    reason:
      "Расчёт от стоимости всей партии без предела повышает риск снижения неустойки судом.",
    basis: "ГК РФ, ст. 333 (демонстрационный источник)",
  },
  {
    id: "s2",
    clause: "c52",
    kind: "replace",
    from: "в полном объёме",
    to: "в части, не покрытой неустойкой",
    title: "Не допускать двойного взыскания",
    level: "medium",
    reason:
      "Без оговорки убытки возмещаются сверх неустойки без общего предела.",
    basis:
      "Предложение для обсуждения: размер ограничения требует решения юриста",
  },
  {
    id: "s3",
    clause: "c61",
    kind: "replace",
    from: "одного рабочего дня",
    to: "пяти рабочих дней",
    title: "Увеличить срок уведомления",
    level: "medium",
    reason:
      "Один рабочий день может быть недостаточен для подтверждения обстоятельств.",
    basis: "Допущение: срок выбран как пример и не основан на источнике",
  },
  {
    id: "s4",
    clause: "c72",
    kind: "comment",
    from: "в суде по месту нахождения ответчика",
    title: "Уточнить подсудность",
    level: "question",
    reason:
      "Не указан конкретный суд и не определён претензионный порядок. Нужно уточнить намерения сторон.",
    basis: "Требует фактов, которых нет в документе",
  },
]

const levelMeta: Record<Sug["level"], { label: string; tone: Tone }> = {
  high: { label: "Высокий риск", tone: "danger" },
  medium: { label: "Требует внимания", tone: "warning" },
  question: { label: "Вопрос", tone: "info" },
}

const states = [
  { id: "default", label: "Правки нейросети" },
  { id: "idle", label: "Проверка не запускалась" },
  { id: "running", label: "Идёт проверка" },
  { id: "failed", label: "Ошибка проверки" },
  { id: "empty", label: "Замечаний нет" },
]

export function ReviewScreen({ go, scenario, setScenario }: ScreenProps) {
  const ctx = useApp()
  const ro = ctx.readOnly.is
  const [texts, setTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(clauses.map((c) => [c.id, c.text])),
  )
  const [status, setStatus] = useState<Record<string, Status>>(() =>
    Object.fromEntries(suggestions.map((s) => [s.id, "pending" as Status])),
  )
  const [active, setActive] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [version, setVersion] = useState(3)
  const [savedNote, setSavedNote] = useState(false)
  const shown = scenario === "default"

  useEffect(() => {
    if (scenario !== "running") return
    const t = setTimeout(() => setScenario("default"), 1800)
    return () => clearTimeout(t)
  }, [scenario, setScenario])

  if (
    ctx.current?.id !== "sever" ||
    (ctx.route.documentName &&
      ctx.route.documentName !== "Договор_поставки_демо.docx")
  ) {
    return (
      <Shell screen="review" go={go} project={ctx.current} projectTab="docs">
        <div className="center">
          <StateCard
            icon="lock"
            title="Документ недоступен"
            text="Документа нет в этом проекте или у вас нет разрешения на просмотр."
          >
            <Button onClick={() => ctx.openProject(ctx.current!.id, "docs")}>
              К документам проекта
            </Button>
          </StateCard>
        </div>
      </Shell>
    )
  }

  const pendingFor = (clauseId: string) =>
    shown
      ? suggestions.find(
          (s) => s.clause === clauseId && status[s.id] === "pending",
        )
      : undefined
  const count = (st: Status) =>
    suggestions.filter((s) => status[s.id] === st).length
  const pending = count("pending")

  const decide = (s: Sug, next: Status) => {
    setTexts((t) => {
      const cur = t[s.clause]
      if (s.kind !== "replace" || !s.to) return t
      if (next === "accepted" && cur.includes(s.from))
        return { ...t, [s.clause]: cur.replace(s.from, s.to) }
      if (
        status[s.id] === "accepted" &&
        next === "pending" &&
        cur.includes(s.to)
      )
        return { ...t, [s.clause]: cur.replace(s.to, s.from) }
      return t
    })
    setStatus((st) => ({ ...st, [s.id]: next }))
    if (next === "accepted" || status[s.id] === "accepted") setDirty(true)
  }
  const acceptAll = () =>
    suggestions
      .filter((s) => status[s.id] === "pending")
      .forEach((s) => decide(s, "accepted"))
  const focusClause = (s: Sug) => {
    setActive(s.id)
    document
      .getElementById(`clause-${s.clause}`)
      ?.scrollIntoView({
        block: "center",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      })
  }
  const save = () => {
    setVersion(version + 1)
    setDirty(false)
    setSavedNote(true)
    setTimeout(() => setSavedNote(false), 2500)
  }

  const renderText = (c: Clause): ReactNode => {
    const text = texts[c.id]
    const s = pendingFor(c.id)
    const idx = s ? text.indexOf(s.from) : -1
    if (s && idx >= 0) {
      const before = text.slice(0, idx)
      const after = text.slice(idx + s.from.length)
      return (
        <p
          className={`clause-text ${active === s.id ? "focus" : ""}`}
          onClick={() => setActive(s.id)}
        >
          {before}
          {s.kind === "replace" ? (
            <>
              <del>{s.from}</del>
              <ins>{s.to}</ins>
            </>
          ) : (
            <mark className="cmt">{s.from}</mark>
          )}
          {after}
        </p>
      )
    }
    return (
      <p
        key={`${c.id}:${text}`}
        className="clause-text editable"
        contentEditable={!ro}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={`Пункт ${c.num}`}
        onInput={() => setDirty(true)}
        onBlur={(e) => {
          const v = e.currentTarget.textContent ?? ""
          if (v !== text) setTexts((t) => ({ ...t, [c.id]: v }))
        }}
      >
        {text}
      </p>
    )
  }

  return (
    <Shell
      screen="review"
      go={go}
      project={ctx.current}
      projectTab="docs"
      demo={{ items: states, current: scenario, set: setScenario }}
    >
      <div className="page review">
        <div className="page-head compact">
          <div>
            <h1>Договор поставки</h1>
            <p className="muted">
              Договор_поставки_демо.docx · версия {version} ·{" "}
              {savedNote
                ? `версия ${version} сохранена`
                : dirty
                  ? "есть несохранённые изменения"
                  : "сохранено"}
            </p>
          </div>
          <div className="head-actions">
            <Button
              variant="ghost"
              icon="sparkle"
              disabled={ro || scenario === "running"}
              onClick={() => setScenario("running")}
            >
              Запросить проверку AI
            </Button>
            <Button disabled title="Экспорт не подключён в макете">
              Экспорт
            </Button>
            <Button variant="primary" disabled={ro || !dirty} onClick={save}>
              Сохранить версию
            </Button>
          </div>
        </div>
        <p className="mock-note">
          <Icon name="layers" size={14} />
          Макет: редактор показан схематично. Правки нейросети заданы заранее,
          документ нигде не сохраняется.
        </p>

        <div className="review-layout">
          <article className="doc-page" aria-label="Текст договора">
            {clauses.map((c) => (
              <section key={c.id} id={`clause-${c.id}`} className="clause">
                {c.heading && <h2>{c.heading}</h2>}
                <div className="clause-row">
                  <span className="clause-num">{c.num}</span>
                  {renderText(c)}
                </div>
              </section>
            ))}
          </article>

          <aside className="sug-panel" aria-label="Правки нейросети">
            <h2 className="sug-title">Правки нейросети</h2>
            {shown && (
              <>
                <p className="muted sug-count" aria-live="polite">
                  Ожидают: {pending} · приняты: {count("accepted")} · отклонены:{" "}
                  {count("rejected")}
                </p>
                <div className="sug-actions">
                  <Button disabled={ro || pending === 0} onClick={acceptAll}>
                    Принять все ({pending})
                  </Button>
                </div>
                {suggestions.map((s) => {
                  const st = status[s.id]
                  const lv = levelMeta[s.level]
                  return (
                    <div
                      key={s.id}
                      className={`sug ${active === s.id ? "active" : ""} ${
                        st !== "pending" ? "done" : ""
                      }`}
                    >
                      <button
                        className="sug-head"
                        onClick={() => focusClause(s)}
                        aria-label={`Показать пункт ${clauses.find((c) => c.id === s.clause)?.num}`}
                      >
                        <Badge tone={lv.tone}>{lv.label}</Badge>
                        <span className="muted">
                          Пункт {clauses.find((c) => c.id === s.clause)?.num}
                        </span>
                      </button>
                      <h3>{s.title}</h3>
                      {s.kind === "replace" && (
                        <p className="diff">
                          <del>{s.from}</del>
                          <ins>{s.to}</ins>
                        </p>
                      )}
                      <p className="reason">{s.reason}</p>
                      <p className="basis-line">
                        <span>Основание</span>
                        {s.basis}
                      </p>
                      {st === "pending" ? (
                        <div className="sug-buttons">
                          <Button
                            variant="primary"
                            disabled={ro}
                            onClick={() => decide(s, "accepted")}
                          >
                            {s.kind === "replace" ? "Принять" : "Учтено"}
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={ro}
                            onClick={() => decide(s, "rejected")}
                          >
                            Отклонить
                          </Button>
                        </div>
                      ) : (
                        <div className="sug-buttons">
                          <Badge
                            tone={st === "accepted" ? "success" : "neutral"}
                          >
                            {st === "accepted"
                              ? s.kind === "replace"
                                ? "Принято"
                                : "Учтено"
                              : "Отклонено"}
                          </Badge>
                          <Button
                            variant="ghost"
                            disabled={ro}
                            onClick={() => decide(s, "pending")}
                          >
                            Вернуть
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })}
                <p className="note">
                  Правки нейросети требуют проверки юристом. Решение о
                  формулировке остаётся за вами.
                </p>
              </>
            )}
            {scenario === "idle" && (
              <StateCard
                icon="sparkle"
                tone="accent"
                title="Проверка не запускалась"
                text="Нейросеть найдёт рискованные формулировки и предложит правки. Вы решите, какие принять."
              >
                <Button
                  variant="primary"
                  disabled={ro}
                  onClick={() => setScenario("running")}
                >
                  Запросить проверку AI
                </Button>
              </StateCard>
            )}
            {scenario === "running" && (
              <div className="sug-state" aria-live="polite">
                <p>
                  <strong>Проверяем договор</strong>
                </p>
                <p className="muted">
                  Ищем рискованные формулировки и подбираем правки.
                </p>
                <div className="skeleton">
                  <i />
                  <i />
                  <i />
                </div>
                <Button
                  variant="ghost"
                  icon="stop"
                  disabled={ro}
                  onClick={() => setScenario("idle")}
                >
                  Остановить
                </Button>
              </div>
            )}
            {scenario === "failed" && (
              <StateCard
                icon="warning"
                tone="danger"
                title="Не удалось проверить договор"
                text="Текст документа и ваши правки сохранены. Попробуйте ещё раз."
              >
                <Button
                  variant="primary"
                  icon="retry"
                  disabled={ro}
                  onClick={() => setScenario("running")}
                >
                  Повторить проверку
                </Button>
              </StateCard>
            )}
            {scenario === "empty" && (
              <StateCard
                icon="check"
                title="Замечаний не найдено"
                text="Это не заменяет проверку юристом: нейросеть могла не заметить риски."
              >
                <Button disabled={ro} onClick={() => setScenario("running")}>
                  Проверить ещё раз
                </Button>
              </StateCard>
            )}
          </aside>
        </div>
      </div>
    </Shell>
  )
}
