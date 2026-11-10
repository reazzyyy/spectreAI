import { useState } from "react"
import { useApp } from "../app-context"
import { Shell } from "../components/shell"
import {
  Button,
  Icon,
  NavigationLink,
  StateCard,
  type ScreenProps,
} from "../components/ui"
import { recentDocs } from "../data/documents"
import { clientName, formatWhen, visLabel } from "../data/projects"
import { Dialog } from "../components/Dialog"
import { useWorkspace } from "../workspace-context"
import { lifecycleDate } from "../data/ownership"

export function HomeScreen({ go }: ScreenProps) {
  const ctx = useApp()
  const [menu, setMenu] = useState(false)
  const [task, setTask] = useState<"docs" | "chats" | null>(null)
  const ws = useWorkspace()
  // Только документы доступных проектов; проект удаляется — документы скрыты.
  const recentDocRows = recentDocs
    .slice()
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .map((d) => ({ d, p: ctx.projects.find((x) => x.id === d.projectId) }))
    .filter(
      (x) =>
        x.p &&
        x.p.status !== "deleting" &&
        ws.materials.some(
          (m) =>
            m.projectId === x.d.projectId &&
            m.name === x.d.name &&
            m.stage !== "forbidden",
        ),
    )
    .slice(0, 3)
  const sever = ctx.projects.find((p) => p.id === "sever")
  const errors = ws.materials.filter(
    (m) =>
      m.stage === "error" &&
      ctx.projects.some((p) => p.id === m.projectId && p.status !== "deleting"),
  )
  const incoming = ctx.identity.lifecycle.offers.filter((o) => o.toId === ctx.identity.userId && o.orgId === ctx.identity.orgId && o.status === "pending" && o.expiresAt > Date.now() && ctx.projects.some((p) => p.id === o.projectId))
  const restricted = ctx.projects.filter((p) => p.status === "restricted")
  return (
    <Shell screen="home" go={go}>
      <div className="page home">
        <div className="page-head">
          <div>
            <div className="home-organization"><label htmlFor="home-org">Организация</label><select id="home-org" aria-label="Текущая организация" value={ctx.identity.orgId} onChange={(e) => ctx.switchOrganization(e.target.value)}>{ctx.identity.activeOrganizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
            <h1>Добрый день, {ctx.identity.user.name.split(" ")[0]}</h1>
            <p className="muted">
              Продолжите работу по проекту или начните новую задачу.
            </p>
          </div>
          <div className="menu-anchor">
            <Button
              variant="primary"
              icon="plus"
              onClick={() => setMenu(!menu)}
            >
              Новая задача
            </Button>
            {menu && (
              <div className="menu">
                <button
                  onClick={() => {
                    setMenu(false)
                    ctx.openCreate()
                  }}
                >
                  <span className="menu-item">
                    <Icon name="folder" size={16} />
                    Создать проект
                  </span>
                </button>
                <button
                  onClick={() => {
                    setMenu(false)
                    setTask("docs")
                  }}
                >
                  <span className="menu-item">
                    <Icon name="upload" size={16} />
                    Проверить документ
                  </span>
                </button>
                <button
                  onClick={() => {
                    setMenu(false)
                    setTask("chats")
                  }}
                >
                  <span className="menu-item">
                    <Icon name="chat" size={16} />
                    Задать вопрос
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>

        {incoming.length > 0 && <section className="home-ownership-inbox"><div className="eyebrow">Ожидает вашего решения</div>{incoming.map((o) => <button className="home-ownership-card" key={o.id} onClick={() => ctx.openMembers(o.projectId)}><span className="state-icon accent"><Icon name="users" size={20} /></span><div><strong>{o.mode === "recovery" ? "Принять владение ограниченным TEAM" : "Вам предложено владение проектом"}</strong><p>{ctx.projects.find((p) => p.id === o.projectId)?.name}</p><small>До {lifecycleDate(o.expiresAt)} · предложение не меняет роль до принятия</small></div><Icon name="chevron" size={17} /></button>)}</section>}
        {restricted.length > 0 && <section className="home-restricted-projects"><h2 className="section-title">TEAM без действующего владельца</h2>{restricted.map((p) => <button key={p.id} className="home-restricted-row" onClick={() => ctx.openMembers(p.id)}><Icon name="lock" size={16} /><span><strong>{p.name}</strong><small>Только чтение · ожидается принявший владение преемник</small></span><Icon name="chevron" size={16} /></button>)}</section>}
        <div className="home-columns">
          <section>
            <div className="section-row">
              <h2 className="section-title">Недавние проекты</h2>
              {ctx.projects.length > 0 && (
                <button className="link" onClick={() => ctx.openList()}>
                  Все проекты ({ctx.projects.length})
                </button>
              )}
            </div>
            {ctx.recents.length === 0 ? (
              <StateCard
                icon="folder"
                title="У вас пока нет проектов"
                text="Создайте проект: в нём будут чаты, документы, исследования и черновики по одной задаче."
              >
                <Button
                  variant="primary"
                  icon="plus"
                  onClick={() => ctx.openCreate()}
                >
                  Создать проект
                </Button>
              </StateCard>
            ) : (
              <div className="rows">
                {ctx.recents.map((p) => (
                  <NavigationLink
                    key={p.id}
                    className="row"
                    href={`#/projects/${encodeURIComponent(p.id)}/chats`}
                    onNavigate={() => ctx.openProject(p.id)}
                  >
                    <span className="row-main">
                      <strong>{p.name}</strong>
                      <small>
                        {p.clientId ? clientName(p.clientId) : "Без клиента"}
                      </small>
                    </span>
                    <span className="row-meta">{visLabel(p)}</span>
                    <span className="row-meta">{formatWhen(p.updatedAt)}</span>
                  </NavigationLink>
                ))}
              </div>
            )}
            {recentDocRows.length > 0 && (
              <>
                <div className="section-row" style={{ marginTop: 40 }}>
                  <h2 className="section-title">Недавние документы</h2>
                </div>
                <div className="rows">
                  {recentDocRows.map(({ d, p }) => (
                    <NavigationLink
                      key={d.name + d.at}
                      className="row"
                      style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}
                      href={`#/projects/${encodeURIComponent(d.projectId)}/${d.target}?${new URLSearchParams({ doc: d.name, view: d.scenario ?? "default" })}`}
                      onNavigate={() =>
                        ctx.openDocument(
                          d.projectId,
                          d.name,
                          d.target,
                          d.scenario,
                        )
                      }
                    >
                      <span className="row-main">
                        <strong>{d.name}</strong>
                        <small>
                          {p!.name} · {d.action}
                        </small>
                      </span>
                      <span className="row-meta">{formatWhen(d.at)}</span>
                    </NavigationLink>
                  ))}
                </div>
              </>
            )}
          </section>
          <section>
            <h2 className="section-title">Требует внимания</h2>
            {!errors.length && !sever && (
              <p className="muted">Нет задач, требующих внимания.</p>
            )}
            <div className="rows">
              {errors.map((m) => (
                <button
                  key={m.id}
                  className="row attention"
                  onClick={() => ctx.openDocument(m.projectId, m.name)}
                >
                  <Icon name="warning" size={16} />
                  <span className="row-main">
                    <strong>Ошибка обработки файла</strong>
                    <small>
                      {ctx.projects.find((p) => p.id === m.projectId)?.name} ·{" "}
                      {m.name}
                    </small>
                  </span>
                </button>
              ))}
              {sever && (
                <button
                  className="row attention"
                  onClick={() => ctx.openProject("sever", "drafts")}
                >
                  <Icon name="edit" size={16} />
                  <span className="row-main">
                    <strong>Черновик не завершён</strong>
                    <small>Проект Север · версия 3</small>
                  </span>
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
      {task && (
        <Dialog
          label="Выберите проект для задачи"
          onClose={() => setTask(null)}
        >
          <div className="dialog-head">
            <h2>В каком проекте продолжить?</h2>
          </div>
          <div className="dialog-body">
            <p className="muted">
              Документы и диалоги всегда принадлежат проекту.
            </p>
            {ctx.projects
              .filter((p) => p.status === "active")
              .map((p) => (
                <button
                  className="list-item"
                  key={p.id}
                  onClick={() => {
                    ctx.openProject(p.id, task)
                    setTask(null)
                  }}
                >
                  <strong>{p.name}</strong>
                  <small>
                    {visLabel(p)}
                    {p.role === "viewer" ? " · только чтение" : ""}
                  </small>
                </button>
              ))}
            {!ctx.projects.some((p) => p.status === "active") && (
              <p>Доступных активных проектов нет.</p>
            )}
          </div>
          <div className="dialog-foot">
            <Button onClick={() => setTask(null)}>Отмена</Button>
            <Button
              variant="primary"
              onClick={() => {
                setTask(null)
                ctx.openCreate()
              }}
            >
              Создать проект
            </Button>
          </div>
        </Dialog>
      )}
    </Shell>
  )
}
