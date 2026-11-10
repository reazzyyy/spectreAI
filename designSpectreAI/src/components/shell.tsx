import { useEffect, useState, type ReactNode } from "react"
import { useApp, type Sim } from "../app-context"
import { type Project } from "../data/projects"
import { type ProjectTab } from "../app-context"
import { ProjectBar } from "./ProjectBar"
import { Icon, IconButton, NavigationLink, type Screen } from "./ui"
import { ProfileMenu } from "./ProfileMenu"
import { useNotifications } from "../notification-context"

function ProjectRow({
  p,
  pinned = false,
  active,
}: {
  p: Project
  pinned?: boolean
  active: boolean
}) {
  const ctx = useApp()
  const full = !pinned && ctx.pinned.length >= ctx.pinLimit
  const label = pinned
    ? `Открепить проект ${p.name}`
    : full
      ? `Нельзя закрепить больше ${ctx.pinLimit} проектов`
      : `Закрепить проект ${p.name}`
  return (
    <div className={`nav-row ${pinned ? "is-pinned" : ""}`}>
      <NavigationLink
        className={`nav-item recent ${active ? "active" : ""}`}
        href={`#/projects/${encodeURIComponent(p.id)}/chats`}
        onNavigate={() => ctx.openProject(p.id)}
        title={p.name}
      >
        <span className="nav-text">{p.name}</span>
      </NavigationLink>
      <button
        className="pin-btn"
        aria-label={label}
        aria-pressed={pinned}
        aria-disabled={full}
        title={
          pinned
            ? "Открепить (только для вас)"
            : full
              ? label
              : "Закрепить (только для вас)"
        }
        onClick={() => !full && ctx.togglePin(p.id)}
      >
        <Icon name="pin" size={14} />
      </button>
    </div>
  )
}

function Sidebar({ screen, go }: { screen: Screen; go: (s: Screen) => void }) {
  const ctx = useApp()
  const notifications = useNotifications()
  const recentList = ctx.recents.filter(
    (r) => !ctx.pinned.some((q) => q.id === r.id),
  )
  const [collapsed, setCollapsed] = useState(
    () => window.matchMedia("(max-width: 1000px)").matches,
  )
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1000px)")
    const on = (e: MediaQueryListEvent) => setCollapsed(e.matches)
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  const active = ctx.projects.filter((p) => p.status === "active")
  const personal = active.filter((p) => p.visibility === "personal").length
  const team = active.filter((p) => p.visibility === "team").length
  const inProject = ["project", "chat", "analysis", "review", "draft", "research", "members"].includes(
    screen,
  )
  const list = ctx.route.list.visibility
  const lists = screen === "projects"
  const soon = "Экран не входит в первую итерацию"
  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="brand">
        <span className="brand-mark">С</span>
        {!collapsed && <span>Спектр</span>}
      </div>
      <button
        className="side-search"
        onClick={ctx.openPalette}
        title="Поиск проектов (Ctrl K)"
        aria-label="Поиск проектов"
      >
        <Icon name="search" size={16} />
        {!collapsed && (
          <>
            <span className="side-search-label">Поиск</span>
            <kbd>Ctrl K</kbd>
          </>
        )}
      </button>
      <button
        className="side-create"
        onClick={() => ctx.openCreate()}
        title="Создать проект"
      >
        <Icon name="plus" size={16} />
        {!collapsed && <span>Создать проект</span>}
      </button>
      <nav className="nav" aria-label="Основная навигация">
        <button
          className={`nav-item ${screen === "home" ? "active" : ""}`}
          onClick={() => go("home")}
          title="Главная"
        >
          <Icon name="home" />
          {!collapsed && <span>Главная</span>}
        </button>
        {!collapsed && ctx.pinned.length > 0 && (
          <>
            <p className="nav-group">Закреплённые · {ctx.pinned.length}</p>
            {ctx.pinned.map((p: Project) => (
              <ProjectRow
                key={p.id}
                p={p}
                pinned
                active={inProject && ctx.route.projectId === p.id}
              />
            ))}
          </>
        )}
        {!collapsed && recentList.length > 0 && (
          <>
            <p className="nav-group">Недавние</p>
            {recentList.map((p: Project) => (
              <ProjectRow
                key={p.id}
                p={p}
                active={inProject && ctx.route.projectId === p.id}
              />
            ))}
          </>
        )}
        <p className={`nav-group ${collapsed ? "hidden" : ""}`}>Проекты</p>
        <button
          className={`nav-item ${lists && list === "all" ? "active" : ""}`}
          onClick={() => ctx.openList()}
          title="Все проекты"
        >
          <Icon name="folder" />
          {!collapsed && <span>Все проекты</span>}
        </button>
        <button
          className={`nav-item ${lists && list === "personal" ? "active" : ""}`}
          onClick={() => ctx.openList({ visibility: "personal" })}
          title="Личные"
        >
          <Icon name="user" />
          {!collapsed && (
            <>
              <span>Личные</span>
              <span className="nav-count">{personal}</span>
            </>
          )}
        </button>
        <button
          className={`nav-item ${lists && list === "team" ? "active" : ""}`}
          onClick={() => ctx.openList({ visibility: "team" })}
          title="Проекты команды"
        >
          <Icon name="users" />
          {!collapsed && (
            <>
              <span>Проекты команды</span>
              <span className="nav-count">{team}</span>
            </>
          )}
        </button>
        {!collapsed && <p className="nav-group">Справочники</p>}
        <button className="nav-item" disabled title={soon}>
          <Icon name="file" />
          {!collapsed && <span>Клиенты</span>}
        </button>
        <button className="nav-item" disabled title={soon}>
          <Icon name="layers" />
          {!collapsed && <span>Юридические дела</span>}
        </button>
      </nav>
      <div className="sidebar-bottom">
        <button className={`nav-item ${screen === "notifications" ? "active" : ""}`} onClick={() => go("notifications")} title="Уведомления" aria-label="Уведомления">
          <Icon name="bell" />
          {!collapsed && <><span>Уведомления</span>{notifications.unreadCount > 0 && <span className="nav-count">{notifications.unreadCount > 99 ? "99+" : notifications.unreadCount}</span>}</>}
        </button>
        <button className={`nav-item ${screen === "audit" ? "active" : ""}`} onClick={() => go("audit")} title="Журнал аудита">
          <Icon name="layers" />
          {!collapsed && <span>Журнал аудита</span>}
        </button>
        <button className={`nav-item ${screen === "organization" ? "active" : ""}`} onClick={() => go("organization")} title="Организация и сотрудники">
          <Icon name="users" />
          {!collapsed && <span>Организация</span>}
        </button>
        <div className="profile">
          <ProfileMenu collapsed={collapsed} />
          <IconButton
            icon="sidebar"
            label={collapsed ? "Развернуть навигацию" : "Свернуть навигацию"}
            onClick={() => setCollapsed(!collapsed)}
          />
        </div>
      </div>
    </aside>
  )
}

type DemoProps = {
  items: { id: string; label: string }[]
  current: string
  set: (id: string) => void
}

export function Shell({
  screen,
  go,
  children,
  panel,
  panelOpen,
  setPanelOpen,
  demo,
  project,
  projectTab,
}: {
  screen: Screen
  go: (s: Screen) => void
  children: ReactNode
  panel?: ReactNode
  panelOpen?: boolean
  setPanelOpen?: (v: boolean) => void
  demo?: DemoProps
  project?: Project
  projectTab?: ProjectTab
}) {
  const ctx = useApp()
  const notifications = useNotifications()
  return (
    <div className="app-shell">
      <div className="desktop-required">
        <span className="brand-mark">С</span>
        <h1>Рабочее пространство для большого экрана</h1>
        <p>
          Макет рассчитан на ширину от 1280 px. Увеличьте окно или откройте его
          на компьютере. Полный мобильный редактор не входит в текущий MVP.
        </p>
      </div>
      <Sidebar screen={screen} go={go} />
      <main className="main">
        <header className="topbar">
          <span
            className="demo-tag"
            title="Все организации, проекты, документы и источники в прототипе вымышлены"
          >
            Демо-данные
          </span>
          <div className="top-actions">
            <button className={`icon-button notification-bell ${screen === "notifications" ? "active" : ""}`} aria-label={`Центр уведомлений: ${notifications.unreadCount} непрочитанных`} onClick={() => go("notifications")} title="Центр уведомлений">
              <Icon name="bell" size={18} />
              {notifications.unreadCount > 0 && <span aria-hidden="true" className="notification-bell-count">{notifications.unreadCount > 99 ? "99+" : notifications.unreadCount}</span>}
            </button>
            <IconButton
              icon="search"
              label="Поиск проектов (Ctrl K)"
              onClick={ctx.openPalette}
            />
            {panel && setPanelOpen && (
              <IconButton
                icon="panel"
                label={panelOpen ? "Скрыть панель" : "Показать панель"}
                active={panelOpen}
                onClick={() => setPanelOpen(!panelOpen)}
              />
            )}
          </div>
        </header>
        {project && projectTab && (
          <ProjectBar project={project} tab={projectTab} />
        )}
        <div className="content">{children}</div>
      </main>
      {panel && panelOpen && <aside className="context-panel">{panel}</aside>}
      <DemoPanel demo={demo} />
    </div>
  )
}

function DemoPanel({ demo }: { demo?: DemoProps }) {
  const ctx = useApp()
  const [open, setOpen] = useState(false)
  const toggles: { key: keyof Sim; label: string }[] = [
    { key: "slow", label: "Медленная сеть (показать загрузку)" },
    { key: "listError", label: "Ошибка списка проектов" },
    { key: "searchError", label: "Ошибка поиска" },
    { key: "createError", label: "Ошибка создания проекта" },
    { key: "noProjects", label: "Нет проектов" },
  ]
  const find = (f: (p: Project) => boolean) => ctx.projects.find(f)
  const actions = [
    {
      label: "Открыть архивный проект",
      p: find((p) => p.status === "archived"),
    },
    {
      label: "Открыть проект с ролью «Просмотр»",
      p: find((p) => p.role === "viewer" && p.status === "active"),
    },
    {
      label: "Открыть удаляемый проект",
      p: find((p) => p.status === "deleting"),
    },
  ]
  const run = (fn: () => void) => {
    fn()
    setOpen(false)
  }
  return (
    <div className="demo-panel">
      {open && (
        <div className="demo-menu" role="menu">
          {demo && demo.items.length > 0 && (
            <>
              <p>Состояния экрана</p>
              {demo.items.map((item) => (
                <button
                  key={item.id}
                  role="menuitemradio"
                  aria-checked={demo.current === item.id}
                  className={demo.current === item.id ? "active" : ""}
                  onClick={() => run(() => demo.set(item.id))}
                >
                  {item.label}
                </button>
              ))}
            </>
          )}
          <p>Проекты и поиск</p>
          {toggles.map((t) => (
            <button
              key={t.key}
              role="menuitemcheckbox"
              aria-checked={ctx.sim[t.key]}
              className={ctx.sim[t.key] ? "active" : ""}
              onClick={() => ctx.toggleSim(t.key)}
            >
              {ctx.sim[t.key] ? "✓ " : ""}
              {t.label}
            </button>
          ))}
          {actions.map((a) => (
            <button
              key={a.label}
              role="menuitem"
              disabled={!a.p}
              onClick={() => a.p && run(() => ctx.openProject(a.p!.id))}
            >
              {a.label}
            </button>
          ))}
          <button
            role="menuitem"
            onClick={() =>
              run(() => ctx.openProject("hidden", "chats", "forbidden"))
            }
          >
            Открыть недоступный проект
          </button>
        </div>
      )}
      <button className="demo-trigger" onClick={() => setOpen(!open)}>
        <Icon name="layers" size={16} />
        Состояния
      </button>
    </div>
  )
}

export function PanelHeader({
  title,
  onClose,
}: {
  title: string
  onClose: () => void
}) {
  return (
    <div className="panel-header">
      <h3>{title}</h3>
      <IconButton icon="close" label="Закрыть панель" onClick={onClose} />
    </div>
  )
}

export function Tabs({
  items,
  value,
  onChange,
}: {
  items: { id: string; label: string }[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item.id}
          role="tab"
          aria-selected={value === item.id}
          className={value === item.id ? "active" : ""}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
