import { useState } from "react"
import { useApp } from "../app-context"
import { Dialog } from "../components/Dialog"
import { Shell } from "../components/shell"
import { TextComparison } from "../components/TextComparison"
import {
  Badge,
  Button,
  Icon,
  StateCard,
  type ScreenProps,
} from "../components/ui"
import {
  researchSummary,
  sourcesFor,
  type LegalSource,
  type ResearchConfig,
  type ResearchOutcome,
} from "../data/legal-work"
import { useLegalWork } from "../legal-work-context"

const outcomeOptions = [
  ["success", "Успешный результат"],
  ["empty", "Ничего не найдено"],
  ["partial", "Частичный результат"],
  ["failed", "Ошибка источника"],
  ["timed_out", "Тайм-аут"],
]
export function ResearchScreen({ go }: ScreenProps) {
  const ctx = useApp()
  const work = useLegalWork()
  const p = ctx.current!
  const ro = ctx.readOnly.is
  const research = work.researches.find(
    (r) => r.projectId === p.id && r.id === ctx.route.researchId,
  )
  const [config, setConfig] = useState<ResearchConfig>({
    question: "",
    legalDate: "2026-10-27",
    norms: true,
    practice: true,
    court: "all",
    year: "all",
    outcome: "success",
  })
  const [followup, setFollowup] = useState("")
  const [outcome, setOutcome] = useState<ResearchOutcome>("success")
  const [runIndex, setRunIndex] = useState<number | null>(null)
  const [category, setCategory] = useState("all")
  const [court, setCourt] = useState("all")
  const [year, setYear] = useState("all")
  const [source, setSource] = useState<LegalSource | null>(null)
  const [revision, setRevision] = useState("current")
  const [compare, setCompare] = useState(false)
  const [actuality, setActuality] = useState(false)
  const current = research?.runs[runIndex ?? research.runs.length - 1]
  const latest = research?.runs.slice(-1)[0]
  const busy = !!latest && ["queued", "running"].includes(latest.status)
  const rawSources = research ? sourcesFor(research.config) : []
  const completedSources =
    current?.outcome === "empty"
      ? []
      : current?.outcome === "partial"
        ? rawSources.slice(0, 1)
        : rawSources
  const filtered = completedSources.filter(
    (s) =>
      (category === "all" || s.kind === category) &&
      (s.kind !== "case" ||
        ((court === "all" || s.court === court) &&
          (year === "all" || s.year === year))),
  )
  const start = () => {
    const id = work.runResearch(p.id, config)
    if (id) ctx.openResearch(id)
  }
  const retry = () => {
    if (!research || !current) return
    work.runResearch(
      p.id,
      { ...research.config, question: current.question, outcome: "success" },
      research.id,
    )
    setRunIndex(null)
  }
  const hasResult =
    current?.status === "succeeded" && completedSources.length > 0
  return (
    <Shell screen="research" go={go} project={p} projectTab="research">
      <div className="page research-page">
        <button
          className="back-link"
          onClick={() => ctx.openProject(p.id, "research")}
        >
          <Icon name="chevron" size={14} />
          Исследования проекта
        </button>
        {!research && ctx.route.researchId ? (
          <StateCard
            icon="lock"
            title="Исследование недоступно"
            text="Объект не найден в этом проекте или макет был перезагружен."
          >
            <Button onClick={() => ctx.openProject(p.id, "research")}>
              К исследованиям
            </Button>
          </StateCard>
        ) : !research ? (
          <>
            <div className="page-head">
              <div>
                <div className="eyebrow">Legal Research</div>
                <h1>Найти правовые основания</h1>
                <p className="muted">
                  Сформулируйте вопрос и задайте границы исследования.
                </p>
              </div>
              <Badge tone="info">Синтетический режим</Badge>
            </div>
            <div className="research-create-layout">
              <div className="research-form">
                <label className="field">
                  <span className="visible-label">Правовой вопрос</span>
                  <textarea
                    aria-label="Правовой вопрос"
                    rows={5}
                    value={config.question}
                    maxLength={3000}
                    disabled={ro}
                    onChange={(e) =>
                      setConfig({ ...config, question: e.target.value })
                    }
                    placeholder="Как оценить риск снижения договорной неустойки при просрочке поставки?"
                  />
                </label>
                <button
                  className="text-action"
                  disabled={ro}
                  onClick={() =>
                    setConfig({
                      ...config,
                      question:
                        "При каких обстоятельствах возможно снижение неустойки по договору поставки и как соотносятся неустойка и убытки?",
                    })
                  }
                >
                  Использовать демонстрационный вопрос
                </button>
                <div className="research-param-grid">
                  <label className="field">
                    <span>Юрисдикция</span>
                    <select aria-label="Юрисдикция" disabled>
                      <option>Российская Федерация</option>
                    </select>
                    <small>Текущий объём — российское право</small>
                  </label>
                  <label className="field">
                    <span>Правовая дата</span>
                    <input
                      type="date"
                      aria-label="Правовая дата"
                      value={config.legalDate}
                      disabled={ro}
                      onChange={(e) =>
                        setConfig({ ...config, legalDate: e.target.value })
                      }
                    />
                  </label>
                </div>
                <fieldset className="research-scope">
                  <legend>Где искать</legend>
                  <label>
                    <input
                      type="checkbox"
                      checked={config.norms}
                      disabled={ro}
                      onChange={(e) =>
                        setConfig({ ...config, norms: e.target.checked })
                      }
                    />
                    Нормативные акты
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={config.practice}
                      disabled={ro}
                      onChange={(e) =>
                        setConfig({ ...config, practice: e.target.checked })
                      }
                    />
                    Судебная практика
                  </label>
                </fieldset>
                <div className="research-param-grid">
                  <label className="field">
                    <span>Суды</span>
                    <select
                      aria-label="Суды исследования"
                      value={config.court}
                      disabled={ro || !config.practice}
                      onChange={(e) =>
                        setConfig({ ...config, court: e.target.value })
                      }
                    >
                      <option value="all">Все доступные суды</option>
                      <option value="arbitration">Арбитражные суды</option>
                      <option value="supreme">Верховный Суд</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Год судебных актов</span>
                    <select
                      aria-label="Год исследования"
                      value={config.year}
                      disabled={ro || !config.practice}
                      onChange={(e) =>
                        setConfig({ ...config, year: e.target.value })
                      }
                    >
                      <option value="all">Любой год</option>
                      <option value="2025">2025</option>
                      <option value="2024">2024</option>
                    </select>
                  </label>
                </div>
                <details className="work-demo-details">
                  <summary>Демонстрационные состояния</summary>
                  <label className="field">
                    <span>Результат запуска</span>
                    <select
                      aria-label="Результат исследования"
                      value={config.outcome}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          outcome: e.target.value as ResearchOutcome,
                        })
                      }
                    >
                      {outcomeOptions.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                </details>
                {!config.norms && !config.practice && (
                  <p className="field-error">
                    Выберите хотя бы одну область поиска.
                  </p>
                )}
                <Button
                  variant="primary"
                  icon="search"
                  disabled={
                    ro ||
                    !config.question.trim() ||
                    !config.legalDate ||
                    (!config.norms && !config.practice)
                  }
                  onClick={start}
                >
                  Начать исследование
                </Button>
              </div>
              <aside className="research-intro">
                <span className="research-emblem">
                  <Icon name="search" size={30} />
                </span>
                <h2>От вопроса к обоснованной позиции</h2>
                <ol>
                  <li>
                    <span>01</span>
                    <div>
                      <strong>Границы поиска</strong>
                      <p>Правовая дата, нормы и практика.</p>
                    </div>
                  </li>
                  <li>
                    <span>02</span>
                    <div>
                      <strong>Проверяемые основания</strong>
                      <p>Отдельно вывод, источники и ограничения.</p>
                    </div>
                  </li>
                  <li>
                    <span>03</span>
                    <div>
                      <strong>Продолжение работы</strong>
                      <p>Сохранение и явная передача контекста в чат.</p>
                    </div>
                  </li>
                </ol>
                <p className="demo-notice">
                  Все акты и результаты в этом макете синтетические. Реальные
                  базы, полнота покрытия и проверка актуальности не подключены.
                </p>
              </aside>
            </div>
          </>
        ) : (
          <>
            <div className="page-head compact">
              <div>
                <div className="eyebrow">
                  Исследование · РФ · на {research.config.legalDate}
                </div>
                <h1>{research.config.question}</h1>
                <p className="muted">
                  {research.config.norms ? "Нормы" : ""}
                  {research.config.norms && research.config.practice
                    ? " и "
                    : ""}
                  {research.config.practice ? "судебная практика" : ""} ·{" "}
                  {research.saved
                    ? "сохранено в макете"
                    : "рабочий результат, не сохранён"}
                </p>
              </div>
              <div className="head-actions">
                <Button
                  icon="chat"
                  disabled={ro || !hasResult || !research.saved || busy || current?.id !== latest?.id}
                  title={
                    !research.saved
                      ? "Сначала сохраните исследование"
                      : current?.id !== latest?.id ? "Для нового чата выберите последний завершённый этап" : undefined
                  }
                  onClick={() =>
                    ctx.startChat(
                      "Обсудим выводы сохранённого исследования",
                      undefined,
                      research.id,
                    )
                  }
                >
                  Продолжить в чате
                </Button>
                <Button
                  variant="primary"
                  icon="check"
                  disabled={ro || !hasResult || research.saved || busy}
                  onClick={() => work.saveResearch(research.id)}
                >
                  {research.saved ? "Сохранено" : "Сохранить исследование"}
                </Button>
              </div>
            </div>
            <p className="work-demo-note">
              <Icon name="warning" size={15} />
              Синтетический результат. Актуальность и полнота источников не
              подтверждены.
            </p>
            {research.runs.length > 1 && (
              <div
                className="research-run-tabs"
                aria-label="Этапы исследования"
              >
                {research.runs.map((run, i) => (
                  <button
                    key={run.id}
                    className={current?.id === run.id ? "active" : ""}
                    onClick={() => setRunIndex(i)}
                  >
                    Этап {i + 1}
                    <span>{run.question}</span>
                  </button>
                ))}
              </div>
            )}
            {current && ["queued", "running"].includes(current.status) ? (
              <div className="processing-card" aria-live="polite">
                <span className="state-icon accent">
                  <Icon name="search" size={24} />
                </span>
                <h2>
                  {current.status === "queued"
                    ? "Исследование в очереди"
                    : "Сопоставляем нормы и практику"}
                </h2>
                <p className="muted">
                  Демонстрационный результат появится автоматически. Можно
                  продолжить работу в проекте.
                </p>
                <div className="research-progress-track">
                  <i />
                </div>
                <Button
                  icon="stop"
                  disabled={ro || current.actorId !== ctx.identity.userId && ctx.current?.role !== "owner"}
                  onClick={() => work.stopResearch(research.id)}
                >
                  Остановить исследование
                </Button>
              </div>
            ) : current &&
              ["failed", "timed_out", "cancelled"].includes(current.status) ? (
              <StateCard
                icon="warning"
                tone={current.status === "failed" ? "danger" : "neutral"}
                title={
                  current.status === "failed"
                    ? "Источник не ответил"
                    : current.status === "timed_out"
                      ? "Время исследования истекло"
                      : "Исследование остановлено"
                }
                text="Вопрос, параметры и предыдущие этапы сохранены в памяти макета. Повтор не удалит предыдущую попытку."
              >
                <Button
                  variant="primary"
                  icon="retry"
                  disabled={ro || busy}
                  onClick={retry}
                >
                  Повторить исследование
                </Button>
              </StateCard>
            ) : !hasResult ? (
              <StateCard
                icon="search"
                title="По заданным параметрам ничего не найдено"
                text="Это не означает отсутствия правовой нормы или практики. Покрытие демонстрационных источников ограничено."
              >
                <Button disabled={ro} onClick={retry}>
                  Повторить поиск
                </Button>
                <Button disabled={ro} onClick={() => ctx.openResearch()}>
                  Изменить параметры
                </Button>
              </StateCard>
            ) : (
              <div className="research-result-layout">
                <article className="research-result">
                  <div className="eyebrow">
                    Вывод · этап {(runIndex ?? research.runs.length - 1) + 1}
                  </div>
                  <h2>Ответственность требует оценки соразмерности</h2>
                  <p className="research-current-question">
                    {current?.question}
                  </p>
                  <p>{researchSummary}</p>
                  <div className="research-finding">
                    <span>01</span>
                    <div>
                      <h3>Соотнесите расчёт с нарушением</h3>
                      <p>
                        Проверьте стоимость просроченной части поставки, период
                        просрочки и последствия для кредитора.
                      </p>
                    </div>
                  </div>
                  <div className="research-finding">
                    <span>02</span>
                    <div>
                      <h3>Отделите норму от её применимости</h3>
                      <p>
                        Наличие статьи или судебного акта ещё не подтверждает
                        его применимость к фактам дела.
                      </p>
                    </div>
                  </div>
                  <div className="research-limitations">
                    <Icon name="warning" size={17} />
                    <div>
                      <strong>
                        {current?.outcome === "partial"
                          ? "Получен частичный результат"
                          : "Ограничения исследования"}
                      </strong>
                      <p>
                        {current?.outcome === "partial"
                          ? "Часть источников не ответила. Представлен только доступный фрагмент; исследование нельзя считать полным."
                          : "Факты дела не проверены. Источники и редакции являются образцами, а не официальными актами."}
                      </p>
                      {current?.outcome === "partial" && (
                        <Button
                          variant="ghost"
                          disabled={ro || busy}
                          onClick={retry}
                        >
                          Повторить недоступный поиск
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="research-followup">
                    <h3>Уточнить исследование</h3>
                    <label className="field">
                      <span className="sr-only">Уточняющий вопрос</span>
                      <textarea
                        aria-label="Уточняющий вопрос"
                        rows={3}
                        value={followup}
                        disabled={ro || busy}
                        onChange={(e) => setFollowup(e.target.value)}
                        placeholder="Например, как меняется вывод при частичной поставке?"
                      />
                    </label>
                    <Button
                      variant="primary"
                      icon="arrow"
                      disabled={ro || busy || !followup.trim()}
                      onClick={() => {
                        work.runResearch(
                          p.id,
                          { ...research.config, question: followup, outcome },
                          research.id,
                        )
                        setFollowup("")
                        setRunIndex(null)
                      }}
                    >
                      Продолжить исследование
                    </Button>
                  </div>
                </article>
                <aside className="research-sources">
                  <div className="section-row">
                    <h2>Источники</h2>
                    <Badge>{completedSources.length}</Badge>
                  </div>
                  <div className="research-source-filter">
                    <select
                      aria-label="Тип источника"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      <option value="all">Все источники</option>
                      <option value="norm">Нормы</option>
                      <option value="case">Практика</option>
                    </select>
                    <select
                      aria-label="Фильтр судов"
                      value={court}
                      onChange={(e) => setCourt(e.target.value)}
                    >
                      <option value="all">Все суды</option>
                      <option value="arbitration">Арбитражные</option>
                      <option value="supreme">Верховный Суд</option>
                    </select>
                    <select
                      aria-label="Фильтр года"
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                    >
                      <option value="all">Все годы</option>
                      <option value="2025">2025</option>
                      <option value="2024">2024</option>
                    </select>
                  </div>
                  {filtered.length ? (
                    filtered.map((s, i) => (
                      <button
                        className="research-source-card"
                        key={s.id}
                        onClick={() => {
                          setSource(s)
                          setCompare(false)
                          setActuality(false)
                          setRevision("current")
                        }}
                      >
                        <div>
                          <span className="cite">{i + 1}</span>
                          <small>
                            {s.kind === "norm"
                              ? "Нормативный акт · образец"
                              : "Судебный акт · вымышленный"}
                          </small>
                        </div>
                        <strong>{s.title}</strong>
                        <p>{s.excerpt}</p>
                        <span className="source-card-link">
                          Открыть источник
                          <Icon name="arrow" size={14} />
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="note">
                      Нет источников под выбранные фильтры.
                    </p>
                  )}
                  <details className="work-demo-details">
                    <summary>Демонстрационные состояния</summary>
                    <label className="field">
                      <span>Следующий этап</span>
                      <select
                        aria-label="Исход продолжения"
                        value={outcome}
                        onChange={(e) =>
                          setOutcome(e.target.value as ResearchOutcome)
                        }
                      >
                        {outcomeOptions.map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </label>
                  </details>
                </aside>
              </div>
            )}
          </>
        )}
      </div>
      {source && research && (
        <Dialog label="Источник исследования" variant={compare ? "wide" : "modal"} onClose={() => setSource(null)}>
          <div className="dialog-head">
            <div className="eyebrow">Синтетический источник</div>
            <h2>{source.title}</h2>
          </div>
          <div className="dialog-body">
            <Badge tone="warning">Актуальность не подтверждена</Badge>
            <dl className="source-metadata">
              <dt>Правовая дата</dt>
              <dd>{research.config.legalDate}</dd>
              <dt>Дата образца</dt>
              <dd>{source.date}</dd>
              <dt>Получение</dt>
              <dd>Сгенерировано внутри макета; внешнего запроса нет</dd>
            </dl>
            {source.kind === "norm" && (
              <>
                <label className="field">
                  <span>Редакция образца</span>
                  <select
                    aria-label="Редакция нормы"
                    value={revision}
                    onChange={(e) => setRevision(e.target.value)}
                  >
                    <option value="current">На выбранную правовую дату</option>
                    <option value="previous">
                      Предыдущая условная редакция
                    </option>
                  </select>
                </label>
                <Button onClick={() => setCompare(!compare)}>
                  {compare
                    ? "Закрыть сравнение редакций"
                    : "Сравнить редакции нормы"}
                </Button>
              </>
            )}
            {compare ? (
              <TextComparison
                before={`${source.excerpt}\n\nПредыдущая условная редакция: дополнительные обстоятельства не перечислены.`}
                after={`${source.excerpt}\n\nНовая условная редакция: учитывать доказанные обстоятельства нарушения.`}
                beforeLabel="Предыдущая · образец"
                afterLabel="На правовую дату · образец"
              />
            ) : (
              <blockquote className="research-source-text">
                {source.excerpt}
                {revision === "previous" &&
                  "\nПредыдущая условная редакция: дополнительные обстоятельства не перечислены."}
              </blockquote>
            )}
            <Button icon="retry" onClick={() => setActuality(true)}>
              Проверить актуальность
            </Button>
            {actuality && (
              <p className="assumption" role="status">
                Официальная проверка не подключена. Статус не изменён на
                «проверено». Перед использованием обратитесь к разрешённому
                официальному источнику.
              </p>
            )}
            <p className="help">
              Условные редакции иллюстрируют сравнение, не историю изменений
              реального закона. Лицензии и поставщики ещё не выбраны.
            </p>
          </div>
          <div className="dialog-foot">
            <Button onClick={() => setSource(null)}>Закрыть</Button>
          </div>
        </Dialog>
      )}
    </Shell>
  )
}
