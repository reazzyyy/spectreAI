import { useState } from "react"
import { useApp } from "../app-context"
import { Dialog } from "../components/Dialog"
import { Shell } from "../components/shell"
import {
  Badge,
  Button,
  Icon,
  StateCard,
  type ScreenProps,
} from "../components/ui"
import { initials, projectRoleLabel } from "../data/identity"
import type { Role } from "../data/projects"
import { OwnershipPanel } from "../components/OwnershipPanel"

export function MembersScreen({ go }: ScreenProps) {
  const ctx = useApp()
  const id = ctx.identity
  const project =
    ctx.current ?? id.adminProjects.find((p) => p.id === ctx.route.projectId)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("all")
  const [dialog, setDialog] = useState<"add" | "role" | "remove" | null>(null)
  const [target, setTarget] = useState("")
  const [role, setRole] = useState<Exclude<Role, "owner">>("viewer")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [fail, setFail] = useState(false)
  const members = project
    ? (id.projectMembers[project.id] ?? []).filter((m) => id.inOrg(m.userId))
    : []
  const rows = members
    .map((m) => ({ ...m, person: id.people.find((p) => p.id === m.userId)! }))
    .filter(
      (m) =>
        m.person &&
        (filter === "all" || m.role === filter) &&
        `${m.person.name} ${m.person.email}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
  const canManage = !!project && id.canManage(project.id)
  const eligible = id.people.filter(
    (p) =>
      id.inOrg(p.id) &&
      p.id !== id.userId &&
      !members.some((m) => m.userId === p.id),
  )
  const selected = id.people.find((p) => p.id === target)
  const open = (
    action: "add" | "role" | "remove",
    userId = "",
    next: Exclude<Role, "owner"> = "viewer",
  ) => {
    setDialog(action)
    setTarget(userId)
    setRole(next)
    setError("")
  }
  const apply = async () => {
    if (!project || busy || !target || !canManage) return
    setBusy(true)
    setError("")
    await new Promise((r) => setTimeout(r, 500))
    if (fail) {
      setFail(false)
      setError("Изменение не применено. Выбор сохранён — повторите попытку.")
      setBusy(false)
      return
    }
    const ok =
      dialog === "add"
        ? id.assignMember(project.id, target, role)
        : dialog === "role"
          ? id.changeMember(project.id, target, role)
          : id.removeMember(project.id, target)
    if (ok) {
      setNotice(
        dialog === "remove"
          ? "Доступ участника к проекту прекращён. Материалы сохранены."
          : `Доступ обновлён: ${selected?.name} — ${projectRoleLabel[role]}.`,
      )
      setDialog(null)
    } else
      setError(
        "Действие недоступно: проверьте членство, роль и актуальные полномочия.",
      )
    setBusy(false)
  }
  return (
    <Shell
      screen="members"
      go={go}
      project={ctx.current}
      projectTab={ctx.current ? "chats" : undefined}
    >
      <div className="page members-page">
        <button
          className="back-link"
          onClick={() =>
            ctx.current ? ctx.openProject(ctx.current.id) : go("organization")
          }
        >
          <Icon name="chevron" size={14} />
          {ctx.current ? "К проекту" : "К организации"}
        </button>
        {!project ? (
          <StateCard
            icon="lock"
            title="Участники недоступны"
            text="Нет доступа к этому проекту или полномочия на управление его членством."
          >
            <Button onClick={() => ctx.openList()}>Доступные проекты</Button>
          </StateCard>
        ) : (
          <>
            <div className="page-head compact">
              <div>
                <div className="eyebrow">
                  {id.organization.name} ·{" "}
                  {project.visibility === "team" ? "TEAM" : "PERSONAL"}
                </div>
                <h1>Участники проекта</h1>
                <p className="muted">{project.name}</p>
              </div>
              <Button
                variant="primary"
                icon="users"
                disabled={!canManage || eligible.length === 0}
                title={
                  !canManage
                    ? "Управление доступно OWNER или уполномоченному администратору"
                    : eligible.length === 0
                      ? "Все доступные сотрудники уже назначены"
                      : undefined
                }
                onClick={() => open("add")}
              >
                Добавить участника
              </Button>
            </div>
            {!ctx.current && (
              <div className="membership-boundary">
                <Icon name="lock" size={20} />
                <div>
                  <strong>
                    Административное управление без чтения содержимого
                  </strong>
                  <p>
                    Вы видите метаданные членства. Документы, чаты, исследования
                    и черновики не раскрываются по организационной роли.
                  </p>
                </div>
              </div>
            )}
            <OwnershipPanel project={project} />
            <div className="members-layout">
              <section>
                {notice && (
                  <p className="success-message" role="status">
                    <Icon name="check" size={16} />
                    {notice}
                  </p>
                )}
                <div className="library-toolbar">
                  <label className="library-search">
                    <Icon name="search" size={16} />
                    <input
                      aria-label="Поиск участников"
                      placeholder="Имя или рабочий email"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <select
                    aria-label="Фильтр роли участника"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="all">Все роли</option>
                    <option value="owner">Владелец</option>
                    <option value="editor">Редактор</option>
                    <option value="viewer">Просмотр</option>
                  </select>
                </div>
                <div className="membership-table">
                  <div className="membership-table-head">
                    <span>Сотрудник</span>
                    <span>Роль в проекте</span>
                    <span>Действия</span>
                  </div>
                  {rows.map((m) => (
                    <div className="membership-row" key={m.userId}>
                      <div className="member-person">
                        <span className="avatar">
                          {initials(m.person.name)}
                        </span>
                        <div>
                          <strong>
                            {m.person.name}
                            {m.userId === id.userId && <small> · вы</small>}
                          </strong>
                          <small>{m.person.email}</small>
                        </div>
                      </div>
                      <Badge tone={m.role === "owner" ? "info" : "neutral"}>
                        {projectRoleLabel[m.role]}
                      </Badge>
                      <div className="member-actions">
                        {m.role === "owner" ? (
                          <span className="help">Единственный OWNER</span>
                        ) : (
                          <>
                            <button
                              className="text-action"
                              disabled={!canManage || m.userId === id.userId}
                              onClick={() =>
                                open(
                                  "role",
                                  m.userId,
                                  m.role as Exclude<Role, "owner">,
                                )
                              }
                            >
                              Изменить роль
                            </button>
                            <button
                              className="text-action danger-text"
                              disabled={!canManage || m.userId === id.userId}
                              onClick={() => open("remove", m.userId)}
                            >
                              Удалить доступ
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {!rows.length && (
                  <StateCard
                    icon="search"
                    title="Участники не найдены"
                    text="Измените запрос или фильтр роли."
                  >
                    <Button
                      onClick={() => {
                        setQuery("")
                        setFilter("all")
                      }}
                    >
                      Сбросить фильтры
                    </Button>
                  </StateCard>
                )}
                {!canManage && (
                  <p className="library-footnote">
                    <Icon name="lock" size={14} />
                    {project.status === "restricted"
                      ? "Обычные изменения членства приостановлены. Для снятия ограничения используется отдельное предложение преемнику с принятием."
                      : "Управлять участниками может OWNER проекта или уполномоченный Org Admin. EDITOR и VIEWER не меняют членство."}
                  </p>
                )}
                {project.visibility === "personal" && (
                  <p className="demo-notice">
                    PERSONAL имеет одного владельца. Добавление участников и
                    смена типа существующего проекта не входят в MVP.
                  </p>
                )}
                <details className="work-demo-details">
                  <summary>Демонстрационные состояния</summary>
                  <label className="demo-check">
                    <input
                      type="checkbox"
                      checked={fail}
                      onChange={(e) => setFail(e.target.checked)}
                    />
                    Ошибка изменения состава
                  </label>
                </details>
              </section>
              <aside className="membership-guide">
                <div className="eyebrow">Граница доступа</div>
                <h2>Роль — внутри проекта</h2>
                <div>
                  <strong>Владелец</strong>
                  <p>
                    Управляет участниками и метаданными проекта. Другой OWNER не
                    назначается сменой обычной роли.
                  </p>
                </div>
                <div>
                  <strong>Редактор</strong>
                  <p>
                    Создаёт и редактирует доступные материалы. Не управляет
                    участниками; удаляет только своё.
                  </p>
                </div>
                <div>
                  <strong>Просмотр</strong>
                  <p>
                    Читает доступное. Не изменяет текст, не запускает и не
                    отменяет AI-задачи.
                  </p>
                </div>
                <p className="demo-notice">
                  Личные PRIVATE-чаты не становятся общими после добавления
                  участника. Авторство материалов при удалении сотрудника не
                  меняется.
                </p>
              </aside>
            </div>
          </>
        )}
      </div>
      {dialog && project && (
        <Dialog
          label={
            dialog === "add"
              ? "Добавить участника"
              : dialog === "role"
                ? "Изменить роль участника"
                : "Удалить доступ участника"
          }
          onClose={() => !busy && setDialog(null)}
        >
          <div className="dialog-head">
            <h2>
              {dialog === "add"
                ? "Назначить доступ к проекту"
                : dialog === "role"
                  ? "Изменить роль участника"
                  : "Прекратить доступ к проекту?"}
            </h2>
            <p className="muted">{project.name}</p>
          </div>
          <div className="dialog-body">
            {dialog === "add" ? (
              <>
                <label className="field">
                  <span>Сотрудник организации</span>
                  <select
                    aria-label="Сотрудник организации"
                    value={target}
                    disabled={busy}
                    onChange={(e) => setTarget(e.target.value)}
                  >
                    <option value="">Выберите сотрудника</option>
                    {eligible.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.email}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="help">
                  Только действующие сотрудники «{id.organization.name}».
                  Назначение роли применяется явно, отдельное вступление в
                  Organization здесь не выполняется.
                </p>
                {id.orgRole === "owner" ? (
                  <button
                    className="text-action"
                    onClick={() => {
                      setDialog(null)
                      go("organization")
                    }}
                  >
                    Нужного сотрудника нет? Пригласить в организацию
                  </button>
                ) : (
                  <p className="help">
                    Для нового сотрудника сначала потребуется приглашение от
                    Owner организации.
                  </p>
                )}
              </>
            ) : (
              <div className="invite-identity">
                <Icon name="user" size={18} />
                <div>
                  <strong>{selected?.name}</strong>
                  <small>{selected?.email}</small>
                </div>
              </div>
            )}
            {dialog !== "remove" ? (
              <label className="field">
                <span>Роль в проекте</span>
                <select
                  aria-label="Назначаемая роль"
                  value={role}
                  disabled={busy}
                  onChange={(e) =>
                    setRole(e.target.value as Exclude<Role, "owner">)
                  }
                >
                  <option value="viewer">Просмотр — только чтение</option>
                  <option value="editor">Редактор — работа с содержимым</option>
                </select>
                <small>
                  OWNER не назначается этим действием. Передача владения —
                  отдельный процесс.
                </small>
              </label>
            ) : (
              <>
                <p>
                  Сотрудник потеряет доступ к материалам этого проекта. Его
                  документы и черновики останутся, авторство сохранится.
                </p>
                <p className="assumption">
                  Членство в организации и доступ к другим проектам не
                  изменятся. PRIVATE-чаты не раскрываются остальным участникам.
                </p>
              </>
            )}
            {dialog === "role" && role === "viewer" && (
              <p className="assumption">
                После применения редактирование, загрузки и AI-действия станут
                недоступны. Уже открытый экран должен использовать актуальные
                права.
              </p>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="dialog-foot">
            <Button disabled={busy} onClick={() => setDialog(null)}>
              Отмена
            </Button>
            <Button
              variant="primary"
              disabled={busy || !target || !canManage}
              onClick={apply}
            >
              {busy
                ? "Применяем…"
                : dialog === "remove"
                  ? "Прекратить доступ"
                  : "Применить доступ"}
            </Button>
          </div>
        </Dialog>
      )}
    </Shell>
  )
}
