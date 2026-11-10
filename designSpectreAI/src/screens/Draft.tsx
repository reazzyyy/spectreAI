import { useEffect, useRef, useState } from "react"
import { useApp } from "../app-context"
import { Dialog } from "../components/Dialog"
import { PanelHeader, Shell, Tabs } from "../components/shell"
import { TextComparison } from "../components/TextComparison"
import {
  Badge,
  Button,
  Icon,
  StateCard,
  type ScreenProps,
} from "../components/ui"
import type { DraftAI } from "../data/legal-work"
import { useLegalWork } from "../legal-work-context"
import { useWorkspace } from "../workspace-context"
import { incompleteSourceRefs } from "../lib/chat-context"

const saveLabels = {
  saved: "Сохранено в макете",
  dirty: "Есть несохранённые изменения",
  saving: "Сохранение…",
  error: "Не удалось сохранить",
  conflict: "Конфликт сохранения",
}
export function DraftScreen({ go, scenario }: ScreenProps) {
  const ctx = useApp()
  const work = useLegalWork()
  const ws = useWorkspace()
  const d = work.drafts.find(
    (d) =>
      d.projectId === ctx.current?.id &&
      (ctx.route.draftId ? d.id === ctx.route.draftId : true),
  )
  const readable = !!d && work.canReadDraft(d)
  const incompleteDraftSources = readable && d ? incompleteSourceRefs(d.sources, ws.materials, d.projectId) : []
  const ro = ctx.readOnly.is || !readable
  const [panelOpen, setPanelOpen] = useState(true)
  const [tab, setTab] = useState(scenario === "suggest" ? "ai" : "review")
  const [modal, setModal] =
    useState<"compare" | "proposal" | "restore" | "conflict" | "delete" | null>(
      null,
    )
  const [left, setLeft] = useState(Math.max(1, (d?.versions.length ?? 1) - 1))
  const [right, setRight] = useState(d?.versions.length ?? 1)
  const [restoreNumber, setRestoreNumber] = useState(1)
  const [outcome, setOutcome] = useState<DraftAI["outcome"]>("success")
  const [copyStatus, setCopyStatus] = useState("")
  const [leaveOpen, setLeaveOpen] = useState(false)
  const pendingLeave = useRef<(() => void) | null>(null)
  const leaveAfterSave = useRef(false)
  const editor = useRef<HTMLTextAreaElement>(null)
  const ai = d?.ai
  const aiBusy = !!ai && ["queued", "running"].includes(ai.status)
  const stale = !!d && !!ai && d.editRevision !== ai.baseRevision
  const dirty = !!d && d.saveStatus !== "saved"
  const show = (t: string) => {
    setTab(t)
    setPanelOpen(true)
  }
  const run = (mode: DraftAI["mode"], result = outcome) => {
    if (!d || ro) return
    work.runAI(d.id, mode, result)
    show(mode === "review" ? "review" : "ai")
  }
  useEffect(() => {
    if (!dirty || ro) {
      ctx.setLeaveGuard(null)
      return
    }
    ctx.setLeaveGuard((proceed) => {
      pendingLeave.current = proceed
      setLeaveOpen(true)
      return true
    })
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", beforeUnload)
    return () => {
      ctx.setLeaveGuard(null)
      window.removeEventListener("beforeunload", beforeUnload)
    }
  }, [dirty, ro, ctx.setLeaveGuard])
  useEffect(() => {
    if (d?.saveStatus === "saved" && leaveAfterSave.current) {
      leaveAfterSave.current = false
      setLeaveOpen(false)
      pendingLeave.current?.()
    }
  }, [d?.saveStatus])
  const depart = () => {
    pendingLeave.current?.()
    pendingLeave.current = null
    setLeaveOpen(false)
  }
  const focusClause = () => {
    const target = editor.current
    if (!target || !d) return
    const found = d.text.toLowerCase().indexOf("неустой")
    target.focus()
    if (found >= 0)
      target.setSelectionRange(found, Math.min(found + 80, d.text.length))
    target.scrollIntoView({ block: "center", behavior: "smooth" })
  }
  const leftVersion = d?.versions.find((v) => v.number === left)
  const rightVersion = d?.versions.find((v) => v.number === right)
  const panel = (
    <>
      <PanelHeader
        title="Помощник документа"
        onClose={() => setPanelOpen(false)}
      />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "ai", label: "AI-правки" },
          { id: "review", label: "Review" },
          { id: "history", label: "История" },
          { id: "basis", label: "Основания" },
        ]}
      />
      <div className="panel-body draft-side-panel">
        {d && readable && (
          <>
            {(tab === "ai" || tab === "review") && (
              <>
                <div className="eyebrow">
                  {tab === "ai"
                    ? "Предложение редакции"
                    : "AI-проверка черновика"}
                </div>
                {!ai ||
                (tab === "review"
                  ? ai.mode !== "review"
                  : ai.mode === "review") ? (
                  <div className="draft-assistant-intro">
                    <Icon
                      name={tab === "review" ? "search" : "sparkle"}
                      size={24}
                    />
                    <h3>
                      {tab === "review"
                        ? "Проверьте рабочую редакцию"
                        : "Сформулируйте точнее"}
                    </h3>
                    <p>
                      {tab === "review"
                        ? "Замечания к тексту, полноте оснований и неоднозначным формулировкам. Оригиналы не изменяются."
                        : "AI предложит отдельную редакцию. Изменения появятся в тексте только после принятия."}
                    </p>
                    <Button
                      variant="primary"
                      disabled={ro || !d.text.trim() || aiBusy}
                      onClick={() =>
                        run(tab === "review" ? "review" : "clarify")
                      }
                    >
                      {tab === "review"
                        ? "Запустить проверку"
                        : "Уточнить формулировку"}
                    </Button>
                  </div>
                ) : aiBusy ? (
                  <div className="draft-ai-progress" aria-live="polite">
                    <Icon name="sparkle" size={22} />
                    <strong>
                      {ai.status === "queued"
                        ? "Задача в очереди"
                        : tab === "review"
                          ? "Проверяем черновик"
                          : "Готовим предложение"}
                    </strong>
                    <p>
                      Можно продолжать редактирование. Если текст изменится,
                      результат будет помечен как устаревший.
                    </p>
                    <div className="skeleton">
                      <i />
                      <i />
                      <i />
                    </div>
                    <Button
                      icon="stop"
                      disabled={ro || ai.actorId !== ctx.identity.userId && ctx.current?.role !== "owner"}
                      onClick={() => work.stopAI(d.id)}
                    >
                      Остановить AI
                    </Button>
                  </div>
                ) : ai.status === "failed" || ai.status === "cancelled" ? (
                  <div className="draft-assistant-intro">
                    <Icon name="warning" size={22} />
                    <h3>
                      {ai.status === "failed"
                        ? "AI-действие не выполнено"
                        : "AI-действие остановлено"}
                    </h3>
                    <p>Текст не изменён. Ручные правки остаются в черновике.</p>
                    <Button
                      icon="retry"
                      disabled={ro}
                      onClick={() => run(ai.mode, "success")}
                    >
                      Повторить AI-действие
                    </Button>
                  </div>
                ) : ai.resolved ? (
                  <div className="draft-assistant-intro">
                    <Icon name="check" size={22} />
                    <h3>Предложение обработано</h3>
                    <p>
                      Рабочая редакция и история доступны независимо от
                      AI-панели.
                    </p>
                    <Button
                      disabled={ro || !d.text.trim()}
                      onClick={() => run(ai.mode)}
                    >
                      Новое предложение
                    </Button>
                  </div>
                ) : ai.outcome === "empty" ? (
                  <div className="draft-assistant-intro">
                    <Icon name="check" size={22} />
                    <h3>
                      {tab === "review"
                        ? "Замечаний в образце не найдено"
                        : "Изменений не предложено"}
                    </h3>
                    <p>
                      Это не подтверждает юридическую корректность текста.
                      Проверьте документ самостоятельно.
                    </p>
                    <Button
                      disabled={ro}
                      onClick={() => run(ai.mode, "success")}
                    >
                      Повторить с замечаниями (демо)
                    </Button>
                  </div>
                ) : (
                  <>
                    {stale && (
                      <p className="assumption" role="status">
                        Результат устарел: после запуска текст изменился.
                        Применение к новой редакции запрещено.
                      </p>
                    )}
                    {tab === "review" ? (
                      <>
                        <div className="review-summary">
                          <strong>2 замечания</strong>
                          <span>К редакции текста #{ai.baseRevision + 1}</span>
                        </div>
                        <div className="review-note-card">
                          <Badge tone="warning">Проверить основание</Badge>
                          <h3>Расчёт ответственности</h3>
                          <p>
                            Уточните базу расчёта, период просрочки и
                            подтверждающие материалы. Синтетическое замечание,
                            не юридическая экспертиза.
                          </p>
                          <button className="text-action" onClick={focusClause}>
                            Показать фрагмент текста
                          </button>
                        </div>
                        <div className="review-note-card">
                          <Badge tone="info">Проверить полноту</Badge>
                          <h3>Источники и факты</h3>
                          <p>
                            В тексте не подтверждены все фактические
                            обстоятельства. Нужна проверка юристом.
                          </p>
                        </div>
                        <Button
                          variant="primary"
                          disabled={ro || stale}
                          onClick={() => run("clarify")}
                        >
                          Предложить уточнение
                        </Button>
                      </>
                    ) : (
                      <>
                        <div className="proposal-card">
                          <Badge tone="info">Синтетическое предложение</Badge>
                          <h3>
                            {ai.mode === "shorten"
                              ? "Сократить рабочий текст"
                              : "Уточнить предел ответственности"}
                          </h3>
                          <p>
                            Исходная редакция не перезаписывается. Сравните
                            тексты перед принятием.
                          </p>
                          <Button
                            icon="layers"
                            onClick={() => setModal("proposal")}
                          >
                            Сравнить с исходным
                          </Button>
                        </div>
                        <div className="proposal-actions">
                          <Button
                            disabled={ro}
                            onClick={() => work.rejectAI(d.id)}
                          >
                            Отклонить
                          </Button>
                          <Button
                            variant="primary"
                            disabled={
                              ro || stale || d.saveStatus === "conflict"
                            }
                            onClick={() => work.acceptAI(d.id)}
                          >
                            Принять
                          </Button>
                        </div>
                      </>
                    )}
                    {stale && (
                      <Button
                        icon="retry"
                        disabled={ro}
                        onClick={() => run(ai.mode)}
                      >
                        Пересоздать по текущему тексту
                      </Button>
                    )}
                  </>
                )}
              </>
            )}
            {tab === "history" && (
              <>
                <div className="eyebrow">Контрольные точки</div>
                <h3>История версий</h3>
                <p className="help">
                  Автосохранение обновляет рабочую копию, не создавая отдельную
                  версию после каждой правки.
                </p>
                <div className="version-list">
                  {[...d.versions].reverse().map((v) => (
                    <div className="version-item" key={v.number}>
                      <div>
                        <strong>Версия {v.number}</strong>
                        <Badge>
                          {v.number === d.versions.length
                            ? "Последняя точка"
                            : v.at}
                        </Badge>
                      </div>
                      <p>{v.label}</p>
                      <div>
                        <button
                          className="text-action"
                          onClick={() => {
                            setLeft(v.number)
                            setRight(d.versions.length)
                            setModal("compare")
                          }}
                        >
                          Сравнить
                        </button>
                        <button
                          className="text-action"
                          disabled={ro}
                          onClick={() => {
                            setRestoreNumber(v.number)
                            setModal("restore")
                          }}
                        >
                          Восстановить
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {tab === "basis" && (
              <>
                <div className="eyebrow">Контекст подготовки</div>
                <h3>Основания черновика</h3>
                <p className="help">
                  Оригиналы не изменяются. Связи сохраняют использованные версии
                  источников.
                </p>
                {d.sources.map((s) => {
                  const source = ws.materials.find(
                    (m) =>
                      m.projectId === d.projectId &&
                      m.id === s.id &&
                      m.stage !== "forbidden",
                  )
                  return source ? (
                    <button
                      className="list-item"
                      key={s.id}
                      onClick={() =>
                        ctx.openDocument(
                          d.projectId,
                          source.name,
                          "analysis",
                          "default",
                          s.version,
                        )
                      }
                    >
                      <strong>{source.name}</strong>
                      <small>Версия {s.version} · внутренний образец{incompleteDraftSources.some((ref) => ref.id === s.id && ref.version === s.version) && " · частичное извлечение"}</small>
                    </button>
                  ) : (
                    <p className="note" key={s.id}>
                      Источник недоступен
                    </p>
                  )
                })}
                {d.researchId && (
                  <button
                    className="list-item"
                    onClick={() => ctx.openResearch(d.researchId)}
                  >
                    <strong>Связанное исследование</strong>
                    <small>Синтетический результат и источники</small>
                  </button>
                )}
                {!d.sources.length && !d.researchId && (
                  <p className="note">
                    Источники не выбраны. Ручной текст не считается
                    подтверждённым правовым выводом.
                  </p>
                )}
                <p className="demo-notice">
                  История, версии и правки существуют только в открытом макете.
                  Перезагрузка сбросит данные. Экспорт вне MVP.
                </p>
              </>
            )}
            <details className="work-demo-details">
              <summary>Демонстрационные состояния</summary>
              <label className="field">
                <span>Сохранение</span>
                <select
                  aria-label="Демо сохранения"
                  value={d.saveOutcome}
                  disabled={ro}
                  onChange={(e) =>
                    work.setSaveOutcome(
                      d.id,
                      e.target.value as typeof d.saveOutcome,
                    )
                  }
                >
                  <option value="success">Успешно</option>
                  <option value="error">Ошибка</option>
                  <option value="conflict">Конфликт с другим редактором</option>
                </select>
              </label>
              <label className="field">
                <span>Следующее AI-действие</span>
                <select
                  aria-label="Демо AI черновика"
                  value={outcome}
                  disabled={ro}
                  onChange={(e) =>
                    setOutcome(e.target.value as DraftAI["outcome"])
                  }
                >
                  <option value="success">Предложение / замечания</option>
                  <option value="empty">Без изменений / замечаний</option>
                  <option value="failed">Ошибка AI</option>
                </select>
              </label>
            </details>
          </>
        )}
      </div>
    </>
  )
  return (
    <Shell
      screen="draft"
      go={go}
      project={ctx.current}
      projectTab="drafts"
      panel={readable ? panel : undefined}
      panelOpen={panelOpen}
      setPanelOpen={setPanelOpen}
    >
      <div className="page draft draft-workspace">
        <button
          className="back-link"
          onClick={() => ctx.openProject(ctx.current!.id, "drafts")}
        >
          <Icon name="chevron" size={14} />
          Черновики проекта
        </button>
        {!d || !readable ? (
          <StateCard
            icon="lock"
            title="Черновик недоступен"
            text="Объект отсутствует в этом проекте или недоступен связанный источник. История не предоставляет обходного доступа."
          >
            <Button onClick={() => ctx.openProject(ctx.current!.id, "drafts")}>
              К черновикам
            </Button>
          </StateCard>
        ) : (
          <>
            {!!incompleteDraftSources.length && <div className="extraction-warning"><strong>Основания черновика извлечены частично</strong><p>Изменение текста черновика не восполняет пропуски источника. Таблицы и приложения использованных версий не проверены; сверяйте оригинал.</p></div>}
            <div className="draft-document-heading">
              <div className="eyebrow">{d.kind} · отдельный черновик</div>
              <h1 className="sr-only">{d.title}</h1>
              <input
                className="draft-title-input"
                aria-label="Название черновика"
                maxLength={160}
                value={d.title}
                readOnly={ro}
                onChange={(e) =>
                  work.changeDraft(d.id, { title: e.target.value })
                }
              />
              {!d.title.trim() && (
                <p className="field-error">Название не может быть пустым.</p>
              )}
              <p>
                <span className={`draft-save-dot ${d.saveStatus}`} />
                <span data-testid="save-status" role="status">
                  {saveLabels[d.saveStatus]}
                </span>
                {d.saveStatus === "saved" && d.saveAt > 0 && (
                  <span>
                    {" "}
                    · {new Date(d.saveAt).toLocaleTimeString("ru-RU")}
                  </span>
                )}
                <span>
                  {" "}
                  · {d.versions.length} версий · требует проверки юристом
                </span>
              </p>
            </div>
            <div className="draft-commandbar">
              <div>
                <Button
                  icon="sparkle"
                  disabled={ro || !d.text.trim() || aiBusy}
                  onClick={() => run("clarify")}
                >
                  Уточнить с AI
                </Button>
                <Button
                  icon="search"
                  disabled={ro || !d.text.trim() || aiBusy}
                  onClick={() => run("review")}
                >
                  Проверить с AI
                </Button>
                <Button
                  variant="ghost"
                  disabled={ro || !d.text.trim() || aiBusy}
                  onClick={() => run("shorten")}
                >
                  Сократить
                </Button>
              </div>
              <div>
                <Button icon="layers" onClick={() => show("history")}>
                  История
                </Button>
                <Button
                  variant="primary"
                  icon="check"
                  disabled={
                    ro ||
                    d.saveStatus === "saving" ||
                    d.saveStatus === "conflict" ||
                    !d.title.trim()
                  }
                  onClick={() => work.saveDraft(d.id, d.saveStatus === "error")}
                >
                  Сохранить
                </Button>
              </div>
            </div>
            {d.saveStatus === "error" && (
              <div className="save-alert" role="alert">
                <Icon name="warning" size={18} />
                <div>
                  <strong>Изменения не сохранены</strong>
                  <p>
                    Текст остаётся в рабочей копии. Повторите сохранение; при
                    выходе потребуется явное решение.
                  </p>
                </div>
                <Button
                  disabled={ro}
                  onClick={() => work.saveDraft(d.id, true)}
                >
                  Повторить сохранение
                </Button>
              </div>
            )}
            {d.saveStatus === "conflict" && (
              <div className="save-alert" role="alert">
                <Icon name="warning" size={18} />
                <div>
                  <strong>Обнаружена другая сохранённая редакция</strong>
                  <p>
                    Ваш текст не перезаписан. Сравните обе редакции и выберите,
                    что сохранить.
                  </p>
                </div>
                <Button onClick={() => setModal("conflict")}>
                  Сравнить и разрешить
                </Button>
              </div>
            )}
            <div className="draft-editor-meta">
              <span>
                <Icon name="file" size={14} />
                Рабочая редакция
              </span>
              <span>Автосохранение через 2 секунды</span>
            </div>
            <div className="paper-area">
              <textarea
                ref={editor}
                className="paper"
                aria-label="Текст юридического документа"
                readOnly={ro}
                value={d.text}
                placeholder="Начните вводить текст отдельного черновика…"
                onChange={(e) =>
                  work.changeDraft(d.id, { text: e.target.value })
                }
              />
            </div>
            <div className="draft-footer">
              <span>
                {d.text.trim() ? d.text.trim().split(/\s+/).length : 0} слов ·{" "}
                {d.text.length} знаков
              </span>
              <div>
                <button
                  className="text-action"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(d.text)
                      setCopyStatus("Текст скопирован")
                    } catch {
                      setCopyStatus("Копирование недоступно")
                    }
                  }}
                >
                  Копировать текст
                </button>
                <button
                  className="text-action danger-text"
                  disabled={
                    ro ||
                    (ctx.current?.role !== "owner" &&
                      d.authorId !== ctx.identity.userId)
                  }
                  onClick={() => setModal("delete")}
                >
                  Удалить черновик
                </button>
              </div>
            </div>
            {copyStatus && (
              <p className="help" role="status">
                {copyStatus}
              </p>
            )}
          </>
        )}
      </div>
      {d && readable && modal && (
        <Dialog
          label={
            modal === "proposal"
              ? "Сравнение AI-правок"
              : modal === "conflict"
                ? "Разрешение конфликта"
                : modal === "restore"
                  ? "Восстановление версии"
                  : modal === "delete"
                    ? "Удалить черновик"
                    : "Сравнение версий"
          }
          variant={
            ["compare", "proposal", "conflict"].includes(modal)
              ? "wide"
              : "modal"
          }
          onClose={() => setModal(null)}
        >
          <div className="dialog-head">
            <h2>
              {modal === "proposal"
                ? "Предлагаемые AI-правки"
                : modal === "conflict"
                  ? "Две редакции — без потери текста"
                  : modal === "restore"
                    ? `Восстановить версию ${restoreNumber}?`
                    : modal === "delete"
                      ? "Удалить черновик?"
                      : "Сравнение версий"}
            </h2>
          </div>
          <div className="dialog-body">
            {modal === "compare" && (
              <>
                <div className="version-selectors">
                  <label>
                    Слева
                    <select
                      aria-label="Левая версия"
                      value={left}
                      onChange={(e) => setLeft(Number(e.target.value))}
                    >
                      {d.versions.map((v) => (
                        <option key={v.number} value={v.number}>
                          Версия {v.number} · {v.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Справа
                    <select
                      aria-label="Правая версия"
                      value={right}
                      onChange={(e) => setRight(Number(e.target.value))}
                    >
                      {d.versions.map((v) => (
                        <option key={v.number} value={v.number}>
                          Версия {v.number} · {v.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="help">
                  Подсветка показывает изменённые абзацы. История не заменяет
                  рабочую копию автоматически.
                </p>
                <TextComparison
                  before={leftVersion?.text ?? ""}
                  after={rightVersion?.text ?? ""}
                  beforeLabel={`Версия ${left} · ${leftVersion?.title}`}
                  afterLabel={`Версия ${right} · ${rightVersion?.title}`}
                />
              </>
            )}
            {modal === "proposal" && ai && (
              <>
                {stale && (
                  <p className="assumption">
                    Предложение устарело. Принятие заблокировано. Слева показан
                    текст на момент запуска, не текущие правки.
                  </p>
                )}
                <TextComparison before={ai.baseText} after={ai.proposedText} />
                <p className="help">
                  При принятии появится контрольная точка истории. Результат
                  требует проверки юристом.
                </p>
              </>
            )}
            {modal === "conflict" && (
              <>
                <p className="help">
                  Сохранённая редакция другого участника уже сохранена в
                  истории. Ни одна не перезаписана молча.
                </p>
                <TextComparison
                  before={d.savedText}
                  after={d.text}
                  beforeLabel="Сохранённая другим редактором"
                  afterLabel="Моя рабочая редакция"
                />
              </>
            )}
            {modal === "restore" && (
              <>
                <p>
                  Будет создана новая версия на основе выбранной. Текущая
                  история сохранится.
                </p>
                {dirty && (
                  <p className="assumption">
                    Локальные несохранённые правки сначала будут сохранены
                    отдельной контрольной точкой.
                  </p>
                )}
              </>
            )}
            {modal === "delete" && (
              <>
                <p>
                  «{d.title}» и его версии будут удалены из проекта. Оригиналы
                  документов не изменятся.
                </p>
                {dirty && (
                  <p className="assumption">
                    Несохранённая рабочая редакция также будет удалена.
                  </p>
                )}
                <p className="help">
                  В макете — удаление из памяти. Реальное хранение и сроки
                  удаления не моделируются.
                </p>
              </>
            )}
          </div>
          <div className="dialog-foot">
            <Button onClick={() => setModal(null)}>
              {modal === "compare" ? "Закрыть" : "Отмена"}
            </Button>
            {modal === "proposal" && (
              <Button
                variant="primary"
                disabled={
                  ro || stale || ai?.resolved || d.saveStatus === "conflict"
                }
                onClick={() => {
                  work.acceptAI(d.id)
                  setModal(null)
                }}
              >
                Принять AI-правки
              </Button>
            )}
            {modal === "conflict" && (
              <>
                <Button
                  disabled={ro}
                  onClick={() => {
                    work.resolveConflict(d.id, "theirs")
                    setModal(null)
                  }}
                >
                  Принять сохранённую редакцию
                </Button>
                <Button
                  variant="primary"
                  disabled={ro}
                  onClick={() => {
                    work.resolveConflict(d.id, "mine")
                    setModal(null)
                  }}
                >
                  Мою — новой версией
                </Button>
              </>
            )}
            {modal === "restore" && (
              <Button
                variant="primary"
                disabled={ro}
                onClick={() => {
                  work.restore(d.id, restoreNumber)
                  setModal(null)
                  show("history")
                }}
              >
                Восстановить новой версией
              </Button>
            )}
            {modal === "delete" && (
              <Button
                variant="primary"
                disabled={ro}
                onClick={() => {
                  work.removeDraft(d.id)
                  ctx.setLeaveGuard(null)
                  setModal(null)
                  ctx.openProject(d.projectId, "drafts")
                }}
              >
                Удалить
              </Button>
            )}
          </div>
        </Dialog>
      )}
      {leaveOpen && d && (
        <Dialog
          label="Несохранённые изменения"
          onClose={() => {
            setLeaveOpen(false)
            pendingLeave.current = null
            leaveAfterSave.current = false
          }}
        >
          <div className="dialog-head">
            <h2>В черновике есть несохранённые изменения</h2>
          </div>
          <div className="dialog-body">
            <p>
              Остаться, сохранить перед выходом или явно отказаться от рабочей
              редакции?
            </p>
            {d.saveStatus === "error" && (
              <p className="form-error">
                Последнее сохранение завершилось ошибкой. Текст пока только в
                рабочей копии.
              </p>
            )}
            {d.saveStatus === "conflict" && (
              <p className="assumption">
                Сначала разрешите конфликт или выберите выход без локальных
                изменений.
              </p>
            )}
          </div>
          <div className="dialog-foot">
            <Button
              onClick={() => {
                setLeaveOpen(false)
                pendingLeave.current = null
                leaveAfterSave.current = false
              }}
            >
              Остаться
            </Button>
            <Button
              onClick={() => {
                work.discardDraft(d.id)
                depart()
              }}
            >
              Выйти без изменений
            </Button>
            <Button
              variant="primary"
              disabled={
                ro ||
                d.saveStatus === "saving" ||
                d.saveStatus === "conflict" ||
                !d.title.trim()
              }
              onClick={() => {
                leaveAfterSave.current = true
                work.saveDraft(d.id, d.saveStatus === "error")
              }}
            >
              Сохранить и выйти
            </Button>
          </div>
        </Dialog>
      )}
    </Shell>
  )
}
