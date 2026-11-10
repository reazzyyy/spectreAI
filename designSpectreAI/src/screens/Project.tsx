import { useState } from "react"
import { useApp } from "../app-context"
import { Shell } from "../components/shell"
import {
  Badge,
  Button,
  Icon,
  StateCard,
  type ScreenProps,
} from "../components/ui"
import { DraftList, ResearchList } from "../components/LegalWorkLists"
import { DocumentsLibrary } from "../components/DocumentsLibrary"
import { useWorkspace } from "../workspace-context"
import { chatResultBadge } from "../lib/chat-context"

export function ProjectScreen({ go, scenario, setScenario }: ScreenProps) {
  const ctx = useApp()
  const p = ctx.current
  const [q, setQ] = useState("")
  const tab = ctx.route.tab
  const ro = ctx.readOnly.is
  const ws = useWorkspace()
  const projectChats = ws.conversations.filter((c) => c.projectId === p?.id)
  const states = [
    { id: "default", label: "Обычный проект" },
    { id: "forbidden", label: "Нет доступа к проекту" },
  ]
  const shellDemo = { items: states, current: scenario, set: setScenario }

  if (!p || scenario === "forbidden" || p.status === "deleting") {
    return (
      <Shell screen="project" go={go} demo={shellDemo}>
        <div className="center">
          <StateCard
            icon="lock"
            title={p?.status === "deleting" ? "Проект удаляется" : "Проект недоступен"}
            text={p?.status === "deleting" ? "Доступ к содержимому закрыт. Статус операции и сроки хранения доступны в журнале аудита в пределах ваших прав." : "Проекта нет или у вас нет к нему доступа. Проверьте ссылку или найдите проект через поиск."}
          >
            <Button variant="primary" icon="search" onClick={ctx.openPalette}>
              Найти проект
            </Button>
            <Button onClick={() => ctx.openList()}>Все проекты</Button>
            <Button onClick={() => ctx.go("audit")}>Открыть журнал аудита</Button>
            {ctx.identity.isOrgManager && (
              <Button onClick={() => ctx.go("organization")}>
                Запросить временный доступ
              </Button>
            )}
          </StateCard>
        </div>
      </Shell>
    )
  }

  return (
    <Shell
      screen="project"
      go={go}
      project={p}
      projectTab={tab}
      demo={shellDemo}
    >
      <div
        className={`page ${tab !== "chats" ? "library-page" : "project-page"}`}
      >
        {tab === "chats" && (
          <>
            <div className="ask">
              <div className="grow">
                <label className="visible-label" htmlFor="ask-q">
                  Новый вопрос
                </label>
                <input
                  id="ask-q"
                  placeholder="Задайте вопрос по материалам проекта"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  disabled={ro}
                />
              </div>
              <Button
                variant="primary"
                icon="arrow"
                disabled={ro}
                onClick={() => ctx.startChat(q)}
              >
                Начать диалог
              </Button>
            </div>
            {projectChats.length ? (
              <>
                <h2 className="section-title">Чаты проекта</h2>
                <div className="rows">
                  {projectChats.map((c) => {
                    const result = chatResultBadge(c.turns.slice(-1)[0]?.status, c.turns.slice(-1)[0]?.failureStage)
                    return (
                    <button
                      key={c.id}
                      className="row"
                      onClick={() => ctx.openChat(c.id)}
                    >
                      <span className="row-main">
                        <strong>{c.title}</strong>
                        <small>
                          {c.turns.length} сообщений ·{" "}
                          {c.visibility === "PRIVATE"
                            ? "Личный чат"
                            : "Доступен участникам проекта"}
                        </small>
                      </span>
                      <Badge tone={result.tone}>{result.label}</Badge>
                    </button>
                  )})}
                </div>
              </>
            ) : (
              <StateCard
                icon="chat"
                title="В проекте пока нет чатов"
                text={
                  ro
                    ? "Проект доступен только для чтения."
                    : "Начните первый диалог: задайте вопрос или сначала добавьте документ."
                }
              >
                <Button
                  variant="primary"
                  icon="arrow"
                  disabled={ro}
                  onClick={() => ctx.startChat("")}
                >
                  Создать первый чат
                </Button>
              </StateCard>
            )}
          </>
        )}

        {tab === "docs" && <DocumentsLibrary />}

        {tab === "research" && <ResearchList />}
        {tab === "drafts" && <DraftList />}
        {ro && (
          <p className="muted proto-note">
            <Icon name="lock" size={14} /> Изменяющие действия отключены.
          </p>
        )}
      </div>
    </Shell>
  )
}
