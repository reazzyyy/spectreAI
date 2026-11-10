import { useEffect, useState } from "react"
import { useApp } from "../app-context"
import { Dialog } from "../components/Dialog"
import { PanelHeader, Shell } from "../components/shell"
import {
  Badge,
  Button,
  Icon,
  StateCard,
  type ScreenProps,
} from "../components/ui"
import {
  demoAnswer,
  type SourceRef,
  type Turn,
  type AIOutcome,
  type ChatContextMode,
} from "../data/workspace"
import { chatAnswerText, MAX_SELECTED_SOURCES, sampleEvidence, searchWorkspaceSamples, validChatSources } from "../lib/chat-context"
import { ChatMaterialPicker } from "../components/ChatMaterialPicker"
import { useWorkspace } from "../workspace-context"
import { useLegalWork } from "../legal-work-context"
import { researchSummary } from "../data/legal-work"
import { initials } from "../data/identity"

export function ChatScreen({ go }: ScreenProps) {
  const ctx = useApp()
  const ws = useWorkspace()
  const work = useLegalWork()
  const p = ctx.current!
  const ro = ctx.readOnly.is
  const chat = ws.conversations.find(
    (c) => c.id === ctx.route.chatId && c.projectId === p.id,
  )
  const last = chat?.turns.slice(-1)[0]
  const researchId = chat?.researchId ?? ctx.route.researchContextId
  const research = work.researches.find(
    (r) =>
      r.projectId === p.id &&
      r.id === researchId &&
      (chat?.researchRunId
        ? r.runs.some(
            (run) =>
              run.id === chat.researchRunId && run.status === "succeeded",
          )
        : r.saved),
  )
  const contextRun =
    research?.runs.find((run) => run.id === chat?.researchRunId) ??
    research?.runs.slice(-1)[0]
  const materials = ws.materials.filter((m) => m.projectId === p.id)
  const initial = materials.find(
    (m) => m.name === ctx.route.documentName && m.stage === "ready",
  )
  const composerSlot = ctx.route.chatId
    ? `chat:${ctx.route.chatId}`
    : `new:${JSON.stringify([ctx.route.documentName, ctx.route.researchContextId])}`
  const cached = ws.getComposer(p.id, composerSlot)
  const [restored] = useState(!!cached?.prompt)
  const [selected, setSelected] = useState<SourceRef[]>(
    cached?.sources ?? last?.contextSources ?? last?.sources ??
      (initial ? [{ id: initial.id, version: initial.versions.length }] : []),
  )
  const [prompt, setPrompt] = useState(ctx.route.prompt?.trim() ? ctx.route.prompt : cached?.prompt ?? "")
  const [contextMode, setContextMode] = useState<ChatContextMode>(
    cached?.mode ?? last?.contextMode ?? "selected",
  )
  const [panel, setPanel] = useState<"materials" | "source" | null>(null)
  const [source, setSource] = useState<SourceRef | null>(null)
  const [sourceQuestion, setSourceQuestion] = useState("")
  const [share, setShare] = useState(false)
  const [draftTurn, setDraftTurn] = useState<Turn | null>(null)
  const [branch, setBranch] = useState(cached?.branch ?? false)
  const [copyState, setCopyState] = useState("")
  const [outcome, setOutcome] = useState<AIOutcome>("succeeded")
  const [searchFailure, setSearchFailure] = useState(false)
  const busy = last?.status === "running" || last?.status === "queued"
  const sourceValid = (s: SourceRef) =>
    materials.some(
      (m) =>
        m.id === s.id &&
        m.stage !== "forbidden" &&
        m.versions.some((v) => v.number === s.version),
    )
  const usableSelection = validChatSources(selected, materials, p.id, branch)
  const selectedValid = contextMode === "workspace" || usableSelection.length === selected.length
  const selectionTooLarge = contextMode === "selected" && selected.length > MAX_SELECTED_SOURCES
  const workspacePreview = searchWorkspaceSamples(materials, p.id, prompt)
  const removeUnavailable = () => setSelected(usableSelection)
  useEffect(() => {
    if (ro) {
      setPrompt("")
      setBranch(false)
      ws.clearComposer(p.id, composerSlot)
      return
    }
    ws.saveComposer(p.id, composerSlot, { prompt, sources: selected, mode: contextMode, branch })
  }, [prompt, selected, contextMode, branch, p.id, composerSlot, ro])
  const used =
    source &&
    materials.find((m) => m.id === source.id && m.stage !== "forbidden")
  const usedVersion =
    used && used.versions.find((v) => v.number === source?.version)
  const usedExcerpt = usedVersion ? sampleEvidence(usedVersion.text, sourceQuestion) : ""
  const submit = () => {
    if (!selectedValid || selectionTooLarge || ro || busy) return
    if (researchId && !research) return
    const id = ws.ask(
      p.id,
      prompt,
      selected,
      branch ? undefined : chat?.id,
      outcome,
      researchId,
      contextRun?.id,
      contextMode,
      searchFailure,
    )
    if (id) {
      setSearchFailure(false)
      ws.clearComposer(p.id, composerSlot)
      setPrompt("")
      setBranch(false)
      ctx.openChat(id)
    }
  }
  const regenerate = (t: Turn) => {
    const requested = t.contextMode === "selected" ? t.contextSources ?? t.sources : t.sources
    const id = ws.ask(
      p.id,
      t.prompt,
      requested,
      undefined,
      "succeeded",
      researchId,
      contextRun?.id,
      requested.length ? "selected" : t.contextMode ?? "selected",
    )
    if (id) ctx.openChat(id)
  }
  const editTurn = (t: Turn) => {
    setPrompt(t.prompt)
    setSelected(t.contextMode === "selected" ? t.contextSources ?? t.sources : t.sources)
    setContextMode(t.contextMode === "workspace" && !t.sources.length ? "workspace" : "selected")
    setBranch(true)
  }
  const canRetry = (t: Turn) => {
    const requested = t.contextMode === "selected" ? t.contextSources ?? t.sources : t.sources
    return !ro && !busy && validChatSources(requested, materials, p.id, true).length === requested.length
  }
  const panelContent =
    panel === "materials" ? (
      <>
        <PanelHeader
          title="Материалы для ответа"
          onClose={() => setPanel(null)}
        />
        <div className="panel-body">
          <fieldset className="chat-context-modes" disabled={ro || !!busy}>
            <legend>Область вопроса</legend>
            <label><input type="radio" name="chat-context-mode" value="selected" checked={contextMode === "selected"} onChange={() => setContextMode("selected")} />Выбранные документы</label>
            <label><input type="radio" name="chat-context-mode" value="workspace" checked={contextMode === "workspace"} disabled={branch || !!researchId} onChange={() => setContextMode("workspace")} />Все готовые документы проекта</label>
          </fieldset>
          <p className="muted">
            {contextMode === "workspace"
              ? `Демо-поиск по синтетическому тексту готовых документов: ${workspacePreview.summary.eligible}. Не включены неготовые: ${workspacePreview.summary.excluded}. В ответ попадёт не более ${workspacePreview.summary.limit} подходящих источников.`
              : "Демо-поиск только в выбранных версиях этого проекта. Выбранный набор и использованные совпадения показываются отдельно."}
          </p>
          <div className="context-scope">
            <Icon name="folder" size={16} />
            <strong>{p.name}</strong>
          </div>
          <ChatMaterialPicker materials={materials} projectId={p.id} selected={selected} mode={contextMode} disabled={ro || !!busy} historical={branch} onSelected={setSelected} />
          {contextMode === "selected" && !selectedValid && <div className="chat-context-recovery">
            <p>Часть выбранного контекста больше не готова или недоступна. Вопрос сохранён.</p>
            <Button disabled={ro || !!busy} onClick={removeUnavailable}>Убрать недоступные материалы</Button>
            {!branch && <Button disabled={ro || !!busy} onClick={() => setSelected(selected.flatMap((s) => {
              const m = materials.find((m) => m.id === s.id && m.stage === "ready")
              const v = m?.versions.slice(-1)[0]
              return m && v ? [{ id: m.id, version: v.number }] : []
            }))}>Обновить выбранные версии</Button>}
          </div>}
          <div className="context-summary">
            <strong>{contextMode === "workspace" ? `Для поиска готовы: ${workspacePreview.summary.eligible}` : `Выбрано: ${selected.length}`}</strong>
            <p>
              В ответе отдельно будут указаны фактически использованные
              источники.
            </p>
          </div>
          {selectionTooLarge && <p className="form-error" role="alert">Демо-лимит ручного контекста — {MAX_SELECTED_SOURCES} документов. Сократите выбор{!branch && !researchId ? " или включите поиск по проекту" : ""}; источники не обрезаются молча.</p>}
          <Button onClick={() => ctx.openProject(p.id, "docs")}>
            К документам проекта
          </Button>
          <p className="note">
            Ни роль владельца, ни организационные права не раскрывают
            недоступные материалы.
          </p>
          <label className="field demo-ai-outcome">
            <span className="visible-label">Демо-сценарий поиска источников</span>
            <select aria-label="Демо-сценарий поиска источников" value={searchFailure ? "failed" : "ready"} disabled={ro || !!busy || (contextMode === "selected" && !selected.length)} onChange={(e) => setSearchFailure(e.target.value === "failed")}>
              <option value="ready">Поиск работает</option>
              <option value="failed">Сбой поиска — одна попытка</option>
            </select>
            <small>Отдельно от генерации AI; для поиска по проекту или непустому ручному набору.</small>
          </label>
          <label className="field demo-ai-outcome">
            <span className="visible-label">Демо-сценарий AI</span>
            <select
              aria-label="Демо-сценарий AI"
              value={outcome}
              disabled={ro || !!busy}
              onChange={(e) => setOutcome(e.target.value as AIOutcome)}
            >
              <option value="succeeded">Успешный ответ</option>
              <option value="failed">Ошибка с возможностью повтора</option>
              <option value="timed_out">Время ожидания истекло</option>
            </select>
          </label>
          <details className="work-demo-details">
            <summary>Большой набор материалов (демо)</summary>
            <p className="help">Создаёт 30 вымышленных документов тремя пакетами по 10. Ничего не загружается на сервер; текущий выбор не изменяется.</p>
            <Button disabled={ro || !!busy} onClick={() => {
              const batch = crypto.randomUUID().slice(0, 6)
              for (let offset = 0; offset < 30; offset += 10) ws.add(p.id, Array.from({ length: 10 }, (_, index) => ({
                name: `Демо_набор_${String(offset + index + 1).padStart(2, "0")}_${batch}.pdf`,
                size: 184320, duplicate: "copy" as const,
              })), "ready")
            }}>Добавить 30 демодокументов</Button>
          </details>
        </div>
      </>
    ) : (
      <>
        <PanelHeader title="Источник ответа" onClose={() => setPanel(null)} />
        <div className="panel-body">
          {used && usedVersion ? (
            <>
              <div className="eyebrow">Внутренний документ</div>
              <h3 className="source-title">{used.name}</h3>
              <Badge tone="info">Использована версия {source!.version}</Badge>
              {usedVersion.extraction === "partial" && <div className="extraction-warning"><strong>Текст этой версии извлечён частично</strong><p>Таблицы, приложения или часть текста не проверены. История ответа не восполняет пропуски.</p></div>}
              <div className="source-excerpt">
                <span>Совпавший фрагмент синтетического образца{usedExcerpt.match(/\d+\.\d+\./)?.[0] ? ` · п. ${usedExcerpt.match(/\d+\.\d+\./)![0]}` : ""}</span>
                <blockquote>
                  {usedExcerpt || "Совпавший фрагмент в образце не найден. Откройте использованную версию и проверьте её вручную; точное позиционирование не обещается."}
                </blockquote>
              </div>
              {source!.version !== used.versions.length && (
                <p className="assumption">
                  В проекте есть более новая версия. Этот ответ основан на
                  прежней.
                </p>
              )}
              <Button
                icon="file"
                variant="primary"
                onClick={() =>
                  ctx.openDocument(
                    p.id,
                    used.name,
                    "analysis",
                    "default",
                    source!.version,
                  )
                }
              >
                Открыть использованную версию
              </Button>
              <p className="note">
                Ссылка ведёт к версии документа. Точное выделение в оригинале не
                обещается. Внешние правовые источники в этом ответе не
                использовались.
              </p>
            </>
          ) : (
            <StateCard
              icon="lock"
              title="Источник недоступен"
              text="Документ удалён или доступ отозван. История чата не предоставляет обходного доступа."
            />
          )}
        </div>
      </>
    )
  return (
    <Shell
      screen="chat"
      go={go}
      project={p}
      projectTab="chats"
      panel={panelContent}
      panelOpen={!!panel}
      setPanelOpen={(open) => setPanel(open ? "materials" : null)}
    >
      <div className="page chat-workspace">
        <div className="page-head compact">
          <div>
            <div className="eyebrow">Диалог по материалам</div>
            <h1>{chat?.title ?? "Новый диалог"}</h1>
            <p className="chat-meta">
              <Icon
                name={chat?.visibility === "WORKSPACE" ? "users" : "lock"}
                size={14}
              />
              {chat?.visibility === "WORKSPACE"
                ? "Участники проекта"
                : "Личный чат"}
              <span>·</span>
              {p.name}
            </p>
          </div>
          <div className="head-actions">
            {chat?.visibility === "PRIVATE" && (
              <Button icon="users" disabled={ro} onClick={() => setShare(true)}>
                Открыть проекту
              </Button>
            )}
            <Button icon="plus" disabled={ro} onClick={() => ctx.startChat("")}>
              Новый чат
            </Button>
          </div>
        </div>
        {research && (
          <div className="research-chat-context">
            <Icon name="search" size={18} />
            <div>
              <strong>Контекст: сохранённый этап исследования</strong>
              <p>{contextRun?.question}</p>
              <small>
                РФ · на {research.config.legalDate} · этап{" "}
                {research.runs.findIndex((run) => run.id === contextRun?.id) +
                  1}{" "}
                · синтетический результат
              </small>
            </div>
            <Button onClick={() => ctx.openResearch(research.id)}>
              Открыть
            </Button>
          </div>
        )}
        {contextRun?.outcome === "partial" && (
          <p className="assumption">
            Контекст исследования частичный: часть источников недоступна.
            Полнота выводов не подтверждена.
          </p>
        )}
        {researchId && !research && (
          <p className="form-error" role="alert">
            Исследование из контекста недоступно. Начните новый чат или откройте
            доступное сохранённое исследование.
          </p>
        )}
        {ctx.route.chatId && !chat ? (
          <StateCard
            icon="lock"
            title="Диалог недоступен"
            text="Ссылка устарела или макет был перезагружен. Демонстрационные диалоги хранятся только в памяти."
          >
            <Button onClick={() => ctx.startChat("")}>
              Начать новый диалог
            </Button>
          </StateCard>
        ) : (
          <>
            {!chat && (
              <div className="chat-empty">
                <span className="state-icon accent">
                  <Icon name="chat" size={24} />
                </span>
                <h2>Начните с юридического вопроса</h2>
                <p>
                  Выберите документы или поиск по готовым материалам проекта.
                  <br />
                  Область вопроса задаётся явно; текст файлов не анализируется.
                </p>
                <div className="prompt-ideas">
                  {[
                    "Какие риски есть в условии об ответственности?",
                    "Как уточнить базу расчёта неустойки?",
                  ].map((q) => (
                    <button key={q} disabled={ro} onClick={() => setPrompt(q)}>
                      {q}
                      <Icon name="arrow" size={14} />
                    </button>
                  ))}
                </div>
                <Button icon="layers" onClick={() => setPanel("materials")}>
                  Выбрать материалы · {selected.length}
                </Button>
              </div>
            )}
            <div className="conversation-turns" aria-live="polite">
              {chat?.turns.map((t, index) => {
                const available =
                  t.sources.every(sourceValid) && (!researchId || !!research)
                const completed = t.status === "succeeded"
                return (
                  <section key={t.id} className="conversation-turn">
                    <div className="question-bubble">
                      <span className="avatar">{initials(ctx.identity.people.find((p) => p.id === (t.actorId ?? "elena"))?.name ?? "Сотрудник")}</span>
                      <p>{t.prompt}</p>
                      <span className="question-number">{index + 1}</span>
                    </div>
                    {!available ? (
                      <div className="revoked-answer">
                        <Icon name="lock" size={20} />
                        <div>
                          <strong>Ответ закрыт: источник недоступен</strong>
                          <p>
                            Документ удалён или доступ отозван. Зависимый ответ
                            нельзя использовать как копию источника.
                          </p>
                        </div>
                      </div>
                    ) : t.status === "queued" || t.status === "running" ? (
                      <div className="answer-progress">
                        <span className="answer-symbol">
                          <Icon name="sparkle" size={18} />
                        </span>
                        <div>
                          <strong>
                            {t.status === "queued"
                              ? "Запрос в очереди"
                              : t.failureStage === "retrieval" ? "Выполняем демо-поиск источников" : "Готовим демонстрационный ответ"}
                          </strong>
                          <p className="muted">
                            {t.contextMode === "workspace" ? "Демо-поиск в готовых документах проекта" : "Демо-поиск в выбранном контексте"} · {t.contextSources?.length ?? t.sources.length} документов в области запроса
                          </p>
                          {t.status === "running" && (
                            <div className="skeleton">
                              <i />
                              <i />
                              <i />
                            </div>
                          )}
                          <Button
                            icon="stop"
                            variant="ghost"
                            disabled={ro || t.actorId !== ctx.identity.userId && ctx.current?.role !== "owner"}
                            onClick={() => ws.stop(chat!.id)}
                          >
                            Остановить
                          </Button>
                        </div>
                      </div>
                    ) : t.status === "failed" && t.failureStage === "retrieval" ? (
                      <div className="ai-error retrieval-error" role="alert">
                        <Icon name="search" size={20} />
                        <div><h2>Поиск источников не выполнен</h2><p>Это сбой поиска, а не отсутствие подходящих фрагментов и не ошибка генерации. AI-ответ не создавался. Вопрос и область сохранены; повтор заново проверит доступные материалы и создаст отдельную ветку.</p>
                          <Button variant="primary" icon="retry" disabled={!canRetry(t)} onClick={() => regenerate(t)}>Повторить поиск</Button>
                          <Button variant="ghost" icon="edit" disabled={ro || !!busy} onClick={() => editTurn(t)}>Изменить вопрос</Button>
                        </div>
                      </div>
                    ) : t.status === "failed" || t.status === "timed_out" ? (
                      <div className="ai-error">
                        <Icon name="warning" size={20} />
                        <div>
                          <h2>
                            {t.status === "failed"
                              ? "Не удалось подготовить ответ"
                              : "Время ожидания истекло"}
                          </h2>
                          <p>
                            Вопрос и выбранные версии материалов сохранены.
                            Ответ не получен. Повтор создаст новую ветку, не
                            удаляя эту попытку.
                          </p>
                          <Button
                            icon="retry"
                            variant="primary"
                            disabled={!canRetry(t)}
                            onClick={() => regenerate(t)}
                          >
                            Повторить запрос
                          </Button>
                          <Button variant="ghost" icon="edit" disabled={ro || !!busy} onClick={() => editTurn(t)}>Изменить вопрос</Button>
                        </div>
                      </div>
                    ) : (
                      <article className="legal-answer">
                        <div className="label">
                          <Icon name="sparkle" size={15} />
                          {completed
                            ? "Синтетический ответ"
                            : "Генерация остановлена"}
                        </div>
                        {t.searchSummary && t.searchSummary.outcome !== "failed" && <div className="chat-search-summary">
                          <Icon name="search" size={15} />
                          <span>{t.searchSummary.scope === "selected" ? "Поиск в выбранных версиях" : "Поиск по проекту"} · готовых: {t.searchSummary.eligible} · совпадений: {t.searchSummary.matched} · использовано: {t.sources.length}
                          {t.searchSummary.matched > t.searchSummary.limit && ` · показаны первые ${t.searchSummary.limit}`}
                          {!!t.searchSummary.partialEligible && ` · частично извлечённых в наборе: ${t.searchSummary.partialEligible}`}
                          . Только синтетический текст; состав источников зафиксирован для этого ответа. Проверяются только доступные версии, не полнота всего хранилища.</span>
                        </div>}
                        {!!t.incompleteSources?.length && <div className="extraction-warning"><strong>Неполное извлечение — предварительный вывод</strong><p>Использованы частично извлечённые версии: {t.incompleteSources.length}. Таблицы и приложения не проверены; предупреждение переносится в копию ответа и черновик.</p></div>}
                        {!t.sources.length && !!t.searchSummary?.partialEligible && <p className="assumption">Часть документов извлечена не полностью. Поиск не проверял пропущенные фрагменты; отсутствие совпадений не подтверждает отсутствие условия.</p>}
                        {t.sources.length || research ? (
                          <>
                            <h2>
                              {completed
                                ? t.incompleteSources?.length ? "Предварительная оценка извлечённого фрагмента" : "Условие об ответственности требует уточнения"
                                : t.cancelReason === "access" ? "Задача остановлена из-за изменения доступа" : "Незавершённый результат"}
                            </h2>
                            <p>
                              {t.cancelReason === "access" ? "Задача остановлена из-за изменения доступа. Неполученный результат не сохраняется и не возобновляется автоматически после возврата прав." : !completed && !t.partial
                                ? "Запрос отменён до начала генерации. Текст ответа не получен."
                                : !completed
                                  ? demoAnswer.slice(0, 199) + "…"
                                  : chatAnswerText(t, research ? researchSummary : demoAnswer, !!research)}
                            </p>
                            {completed && !t.incompleteSources?.length && (
                              <blockquote>
                                Уточните: неустойка начисляется от стоимости
                                товара, поставленного с просрочкой; общий предел
                                ответственности согласуется сторонами отдельно.
                              </blockquote>
                            )}
                            <div className="answer-sources">
                              <span>Использованные источники</span>
                              {research && (
                                <button
                                  onClick={() => ctx.openResearch(research.id)}
                                >
                                  <span className="cite">R</span>
                                  <span>
                                    Сохранённое исследование
                                    <small>
                                      РФ · на {research.config.legalDate} ·
                                      синтетический контекст
                                    </small>
                                  </span>
                                  <Icon name="chevron" size={14} />
                                </button>
                              )}
                              {t.sources.map((s, i) => (
                                <button
                                  key={s.id}
                                  onClick={() => {
                                    setSource(s)
                                    setSourceQuestion(t.prompt)
                                    setPanel("source")
                                  }}
                                >
                                  <span className="cite">{i + 1}</span>
                                  <span>
                                    {materials.find((m) => m.id === s.id)?.name}
                                    <small>
                                      Версия {s.version} · синтетический образец
                                      {t.incompleteSources?.some((ref) => ref.id === s.id && ref.version === s.version) && " · частичное извлечение"}
                                    </small>
                                  </span>
                                  <Icon name="chevron" size={14} />
                                </button>
                              ))}
                            </div>
                          </>
                        ) : (
                          <>
                            <h2>{!completed ? t.cancelReason === "access" ? "Задача остановлена из-за изменения доступа" : "Запрос остановлен" : t.searchSummary?.outcome === "no_ready" ? "Нет готовых документов для поиска" : t.searchSummary?.outcome === "no_matches" ? "Подходящих фрагментов не найдено" : "Для проверки нужен контекст"}</h2>
                            <p>
                              {!completed ? t.cancelReason === "access" ? "Задача остановлена из-за изменения доступа. Неполученный результат не сохраняется и не возобновляется автоматически после возврата прав." : "Полный ответ не получен. Вопрос сохранён, повтор создаст отдельную ветку." : t.searchSummary ? "Демо-поиск не нашёл подтверждений в готовых материалах. Это не доказывает отсутствие условия: уточните вопрос, проверьте обработку или выберите конкретный документ." : <>Документы не выбраны. Утверждать, что условие есть
                              или отсутствует в материалах проекта, нельзя.
                              Выберите готовый документ и повторите вопрос.</>}
                            </p>
                            <Button
                              icon="layers"
                              onClick={() => setPanel("materials")}
                            >
                              Выбрать материалы
                            </Button>
                          </>
                        )}
                        {!completed && (
                          <p className="assumption">
                            Результат не завершён. Его нельзя считать полным
                            юридическим выводом.
                          </p>
                        )}
                        <div className="answer-actions">
                          <Button
                            variant="ghost"
                            icon="retry"
                            disabled={
                              !canRetry(t)
                            }
                            onClick={() => regenerate(t)}
                          >
                            Повторить в новой ветке
                          </Button>
                          {completed && (t.sources.length > 0 || research) && (
                            <Button
                              variant="ghost"
                              icon="file"
                              disabled={ro}
                              onClick={() => setDraftTurn(t)}
                            >
                              Создать черновик
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            icon="edit"
                            disabled={ro || !!busy}
                            onClick={() => editTurn(t)}
                          >
                            Изменить вопрос
                          </Button>
                          {completed && (t.sources.length > 0 || research) && (
                            <Button
                              variant="ghost"
                              icon="copy"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(
                                    chatAnswerText(t, research ? researchSummary : demoAnswer, !!research),
                                  )
                                  setCopyState("Текст скопирован")
                                } catch {
                                  setCopyState(
                                    "Копирование недоступно в браузере",
                                  )
                                }
                              }}
                            >
                              Копировать
                            </Button>
                          )}
                        </div>
                      </article>
                    )}
                  </section>
                )
              })}
            </div>
            <div className="chat-composer-area">
              {copyState && (
                <p className="help" role="status">
                  {copyState}
                </p>
              )}
              {branch && (
                <div className="branch-notice">
                  Изменённый вопрос откроет новую ветку. Прежний ответ
                  сохранится.
                  <button
                    onClick={() => {
                      setBranch(false)
                      setPrompt("")
                    }}
                  >
                    Отмена
                  </button>
                </div>
              )}
              {restored && prompt && <p className="help" role="status">Неотправленный вопрос восстановлен в этой демосессии. После перезагрузки он не сохраняется.</p>}
              {selectionTooLarge && <p className="form-error" role="alert">Выбрано {selected.length}; демо-лимит — {MAX_SELECTED_SOURCES}. Сократите ручной выбор{!branch && !researchId ? " или используйте поиск по проекту" : ""}. Вопрос сохранён.</p>}
              {!selectedValid && (
                <div className="form-error chat-context-recovery" role="alert">
                  <p>
                  Контекст изменился. Уберите недоступные материалы или выберите
                  текущие версии. Текст вопроса сохранён.
                  </p>
                  <Button disabled={ro || !!busy} onClick={removeUnavailable}>Убрать недоступные материалы</Button>
                </div>
              )}
              <button
                className="context-line"
                onClick={() => setPanel("materials")}
              >
                <Icon name="layers" size={15} />
                {contextMode === "workspace" ? `Поиск по проекту · готовых: ${workspacePreview.summary.eligible}` : selected.length
                  ? `Выбрано документов: ${selected.length}`
                  : "Документы не выбраны"}
                <Icon name="down" size={14} />
              </button>
              <div className="composer">
                <label className="visible-label" htmlFor="workspace-question">
                  Ваш вопрос
                </label>
                <textarea
                  id="workspace-question"
                  rows={2}
                  value={prompt}
                  disabled={ro || !!busy}
                  placeholder="Например, проверьте условие об ответственности"
                  onChange={(e) => setPrompt(e.target.value)}
                />
                <div className="composer-footer">
                  <span className="muted">
                    Демо: ответ не анализирует загруженный файл.
                  </span>
                  <Button
                    variant="primary"
                    icon="arrow"
                    disabled={
                      ro ||
                      !!busy ||
                      !prompt.trim() ||
                      !selectedValid ||
                      selectionTooLarge ||
                      (!!researchId && !research)
                    }
                    onClick={submit}
                  >
                    Отправить
                  </Button>
                </div>
              </div>
              <p className="chat-disclaimer">
                ИИ может ошибаться. Проверяйте источники и выводы. Состояние
                макета — до перезагрузки.
              </p>
            </div>
          </>
        )}
      </div>
      {draftTurn && (
        <Dialog
          label="Создать черновик из ответа"
          onClose={() => setDraftTurn(null)}
        >
          <div className="dialog-head">
            <h2>Сохранить ответ отдельным черновиком?</h2>
          </div>
          <div className="dialog-body">
            <p>
              Черновик станет материалом проекта «{p.name}» и будет доступен его
              участникам по правилам проекта.
            </p>
            <p className="assumption">
              Копируется только выбранный ответ и ссылки на его основания.
              Личный чат не становится общим, остальная переписка не
              переносится.
            </p>
            <p className="help">
              Название будет нейтральным: PRIVATE-вопрос не копируется в название общего черновика. Исходный ответ и оригиналы документов останутся без изменений.
            </p>
          </div>
          <div className="dialog-foot">
            <Button onClick={() => setDraftTurn(null)}>Отмена</Button>
            <Button
              variant="primary"
              disabled={
                ro ||
                !draftTurn.sources.every(sourceValid) ||
                (!!researchId && !research)
              }
              onClick={() => {
                const id = work.createDraft(
                  p.id,
                  "Черновик из ответа",
                  "Правовое заключение",
                  chatAnswerText(draftTurn, research ? researchSummary : demoAnswer, !!research),
                  draftTurn.sources,
                  researchId,
                )
                if (id) {
                  setDraftTurn(null)
                  ctx.openDraft(id)
                }
              }}
            >
              Создать в проекте
            </Button>
          </div>
        </Dialog>
      )}
      {share && (
        <Dialog
          label="Открыть историю участникам проекта"
          onClose={() => setShare(false)}
        >
          <div className="dialog-head">
            <h2>Открыть весь диалог проекту?</h2>
          </div>
          <div className="dialog-body">
            <p>
              Участники проекта «{p.name}» увидят историю вопросов и доступные
              им ответы. Проверьте, нет ли в переписке личных или
              конфиденциальных сведений.
            </p>
            <p className="assumption">
              Это явное раскрытие всей истории. Вернуть чат в PRIVATE в MVP
              нельзя. Недоступные источники этим действием не раскрываются.
            </p>
          </div>
          <div className="dialog-foot">
            <Button onClick={() => setShare(false)}>Отмена</Button>
            <Button
              variant="primary"
              disabled={ro}
              onClick={() => {
                ws.share(chat!.id)
                setShare(false)
              }}
            >
              Открыть участникам
            </Button>
          </div>
        </Dialog>
      )}
    </Shell>
  )
}
