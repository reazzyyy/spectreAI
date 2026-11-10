import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AppProvider,
  type AppCtx,
  type ManageAction,
  type ProjectTab,
  type Route,
  type Sim,
} from "./app-context"
import { CommandPalette } from "./components/CommandPalette"
import { CreateProjectDialog } from "./components/CreateProjectDialog"
import { ManageProjectDialog } from "./components/ManageProjectDialog"
import type { Screen } from "./components/ui"
import {
  PROTO_NOW,
  seedProjects,
  type Project,
  type Visibility,
} from "./data/projects"
import { AnalysisScreen } from "./screens/Analysis"
import { ChatScreen } from "./screens/Chat"
import { DraftScreen } from "./screens/Draft"
import { HomeScreen } from "./screens/Home"
import { ProjectScreen } from "./screens/Project"
import { ReviewScreen } from "./screens/Review"
import { ProjectsScreen } from "./screens/Projects"
import { docsFor } from "./data/documents"
import { WorkspaceProvider } from "./workspace-context"
import { LegalWorkProvider } from "./legal-work-context"
import { ResearchScreen } from "./screens/Research"
import { useDemoIdentity } from "./use-demo-identity"
import { secondProject, departingPersonalProject, type AuthView } from "./data/identity"
import { AuthScreen } from "./screens/Auth"
import { MembersScreen } from "./screens/Members"
import { OrganizationScreen } from "./screens/Organization"
import { AuditScreen } from "./screens/Audit"
import { NotificationsScreen } from "./screens/Notifications"
import { NotificationProvider } from "./notification-context"
import { DeleteProjectDialog } from "./components/DeleteProjectDialog"
import { deletionError, type AuditEvent, type AuditInput, type DeletionOperation } from "./data/audit"

type Overlay = { type: "palette" } | {
  type: "create"
  visibility: Visibility
  name: string
} | { type: "manage"; id: string; action: ManageAction } | null

const tabs: ProjectTab[] = ["chats", "docs", "research", "drafts"]
const PIN_LIMIT = 6
const deep: Screen[] = ["chat", "analysis", "review", "draft", "research"]

function routeToHash(r: Route) {
  if (r.screen === "auth") {
    const path = r.authView === "invite" ? "invite" : r.authView === "reset" ? "reset-password" : r.authView === "forgot" ? "forgot-password" : "login"
    return `#/${path}${r.token ? `?token=${encodeURIComponent(r.token)}` : ""}`
  }
  if (r.screen === "organization") return `#/organization${r.accessRequestId ? "?request=" + encodeURIComponent(r.accessRequestId) : ""}`
  if (r.screen === "notifications") return "#/notifications"
  if (r.screen === "audit") return `#/audit${r.scenario !== "default" ? "?project=" + encodeURIComponent(r.scenario) : ""}`
  if (r.screen === "home") return "#/"
  if (r.screen === "projects") {
    const q = new URLSearchParams()
    if (r.list.visibility !== "all") q.set("type", r.list.visibility)
    if (r.list.query) q.set("q", r.list.query)
    return `#/projects${q.toString() ? "?" + q : ""}`
  }
  if (r.screen === "project")
    return `#/projects/${encodeURIComponent(r.projectId)}/${r.tab}`
  const q = new URLSearchParams()
  if (r.documentName && (r.screen === "analysis" || r.screen === "review"))
    q.set("doc", r.documentName)
  if (r.documentVersion && (r.screen === "analysis" || r.screen === "review"))
    q.set("version", String(r.documentVersion))
  if (r.screen === "chat" && r.chatId) q.set("chat", r.chatId)
  if (r.screen === "chat" && !r.chatId && r.researchContextId) q.set("context", r.researchContextId)
  if (r.screen === "draft" && r.draftId) q.set("draft", r.draftId)
  if (r.screen === "research") {
    if (r.researchId) q.set("research", r.researchId)
    else q.set("new", "1")
  }
  if (r.scenario !== "default") q.set("view", r.scenario)
  return `#/projects/${encodeURIComponent(r.projectId)}/${r.screen}${
    q.size ? "?" + q : ""
  }`
}

function hashToRoute(hash: string, prev: Route): Route | null {
  const [path, qs = ""] = hash.replace(/^#/, "").split("?")
  const parts = path.split("/").filter(Boolean)
  const q = new URLSearchParams(qs)
  if (parts.length === 0)
    return { ...prev, screen: "home", scenario: "default" }
  const authViews: Record<string, AuthView> = { login: "login", "forgot-password": "forgot", "reset-password": "reset", invite: "invite" }
  if (authViews[parts[0]]) return { ...prev, screen: "auth", authView: authViews[parts[0]], token: q.get("token") ?? undefined, scenario: "default" }
  if (parts[0] === "organization") return { ...prev, screen: "organization", accessRequestId: q.get("request") ?? undefined, scenario: "default" }
  if (parts[0] === "notifications") return { ...prev, screen: "notifications", scenario: "default" }
  if (parts[0] === "audit") return { ...prev, screen: "audit", scenario: q.get("project") ?? "default" }
  if (parts[0] !== "projects") return null
  if (parts.length === 1) {
    const type = q.get("type")
    return {
      ...prev,
      screen: "projects",
      scenario: "default",
      list: {
        query: q.get("q") ?? "",
        visibility: type === "personal" || type === "team" ? type : "all",
        nonce: prev.list.nonce + 1,
      },
    }
  }
  const id = decodeURIComponent(parts[1])
  const last = parts[2] ?? "chats"
  if (last === "members") return { ...prev, screen: "members", projectId: id, scenario: "default" }
  if (deep.includes(last as Screen) && (last !== "research" || q.has("research") || q.has("new"))) {
    const documentName = q.get("doc") ?? undefined
    const doc = docsFor(id).find((d) => d.name === documentName)
    return {
      ...prev,
      screen: last as Screen,
      projectId: id,
      documentName,
      documentVersion: q.has("version") ? Number(q.get("version")) : undefined,
      prompt: undefined,
      chatId: q.get("chat") ?? undefined,
      draftId: q.get("draft") ?? undefined,
      researchId: q.get("research") ?? undefined,
      researchContextId: q.get("context") ?? undefined,
      scenario:
        q.get("view") ??
        (last === "analysis" ? doc?.scenario : undefined) ??
        "default",
    }
  }
  return {
    ...prev,
    screen: "project",
    projectId: id,
    tab: tabs.includes(last as ProjectTab) ? last as ProjectTab : "chats",
    scenario: "default",
  }
}

export default function App() {
  const [all, setAll] = useState<Project[]>([...seedProjects, secondProject, departingPersonalProject])
  const identity = useDemoIdentity(all)
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [auditFailure, setAuditFailure] = useState(false)
  const [deletions, setDeletions] = useState<DeletionOperation[]>([])
  const deletionRef = useRef(deletions)
  deletionRef.current = deletions
  const auditFailureRef = useRef(auditFailure)
  auditFailureRef.current = auditFailure
  const deleting = useRef(new Set<string>())
  const identityRef = useRef(identity)
  identityRef.current = identity
  const recordAudit = (event: AuditInput) => {
    const actor = identityRef.current
    if (actor.session !== "active") return
    const project = actor.accessibleProjects.find((p) => p.id === event.projectId)
    setAuditEvents((events) => [{
      ...event,
      projectName: event.projectName ?? project?.name,
      id: crypto.randomUUID(),
      orgId: actor.orgId,
      actorId: actor.userId,
      at: Date.now(),
    }, ...events])
  }
  useEffect(() => {
    const timer = window.setInterval(() => {
      const finished = deletionRef.current.filter((op) => op.status === "deleting" && Date.now() - op.startedAt >= 1800)
      if (!finished.length) return
      const ids = new Set(finished.map((op) => op.projectId))
      const now = Date.now()
      const next = deletionRef.current.map((op) => ids.has(op.projectId) ? { ...op, status: "completed" as const, finishedAt: now } : op)
      deletionRef.current = next
      setDeletions(next)
      setAll((projects) => projects.filter((p) => !ids.has(p.id)))
      setAuditEvents((events) => [...finished.map((op): AuditEvent => ({
        id: `${op.id}:completed`, orgId: op.orgId, actorId: op.actorId,
        at: now, projectId: op.projectId, projectName: op.projectName,
        objectId: op.id, action: "Удаление активных данных завершено (демо)",
        category: "project", result: "success",
      })), ...events])
    }, 300)
    return () => clearInterval(timer)
  }, [])
  const [sim, setSim] = useState<Sim>({
    slow: false,
    searchError: false,
    listError: false,
    createError: false,
    noProjects: false,
  })
  const [recentIds, setRecentIds] = useState<string[]>(() =>
    seedProjects
      .filter((p) => p.status === "active")
      .slice(0, 8)
      .map((p) => p.id),
  )
  // Закрепление личное: хранится только для текущего пользователя.
  const [pinSets, setPinSets] = useState<Record<string, string[]>>(() => {
    try {
      const existing = localStorage.getItem("spectrum.demo.pins")
      return existing ? JSON.parse(existing) : { "elena:vector": JSON.parse(localStorage.getItem("pinnedProjects") ?? "[]") }
    } catch {
      return {}
    }
  })
  const pinKey = `${identity.userId}:${identity.orgId}`
  const pinnedIds = pinSets[pinKey] ?? []
  const setPinnedIds = useCallback((fn: (ids: string[]) => string[]) => setPinSets((sets) => ({ ...sets, [pinKey]: fn(sets[pinKey] ?? []) })), [pinKey])
  useEffect(() => {
    try {
      localStorage.setItem("spectrum.demo.pins", JSON.stringify(pinSets))
    } catch {
      /* хранилище недоступно */
    }
  }, [pinSets])
  const [route, setRoute] = useState<Route>(() => {
    const base: Route = {
      screen: "home",
      projectId: "sever",
      tab: "chats",
      scenario: "default",
      list: { query: "", visibility: "all", nonce: 0 },
    }
    return hashToRoute(window.location.hash, base) ?? base
  })
  const [overlay, setOverlay] = useState<Overlay>(null)
  const leaveGuard = useRef<((proceed: () => void) => boolean) | null>(null)
  const routeRef = useRef(route)
  routeRef.current = route
  const setLeaveGuard = useCallback((guard: ((proceed: () => void) => boolean) | null) => { leaveGuard.current = guard }, [])
  const navigate = useCallback((next: (r: Route) => Route) => {
    const proceed = () => setRoute(next)
    if (!leaveGuard.current?.(proceed)) proceed()
  }, [])

  const projects = useMemo(
    () => (sim.noProjects ? [] : identity.accessibleProjects),
    [identity.accessibleProjects, sim.noProjects],
  )
  const current = projects.find((p) => p.id === route.projectId)
  const recents = useMemo(
    () =>
      [...new Set([...recentIds, ...projects.map((p) => p.id)])]
        .map((id) => projects.find((p) => p.id === id))
        .filter((p): p is Project => !!p)
        .slice(0, 5),
    [recentIds, projects],
  )

  const pinned = useMemo(
    () =>
      pinnedIds
        .map((id) => projects.find((p) => p.id === id))
        .filter((p): p is Project => !!p),
    [pinnedIds, projects],
  )
  const togglePin = useCallback(
    (id: string) =>
      setPinnedIds((ids) =>
        ids.includes(id)
          ? ids.filter((x) => x !== id)
          : ids.length >= PIN_LIMIT
            ? ids
            : [...ids, id],
      ),
    [setPinnedIds],
  )

  const readOnly = !current
    ? { is: true, reason: "Проект недоступен." }
    : current.status === "restricted"
      ? { is: true, reason: "TEAM в ограниченном режиме: только чтение. Изменения и новые AI-задачи заблокированы до принятия владения преемником." }
    : current.status === "archived"
      ? { is: true, reason: "Проект в архиве: доступен только просмотр." }
      : current.status === "deleting"
        ? {
            is: true,
            reason: "Проект удаляется. Данные скоро станут недоступны.",
          }
        : current.role === "viewer"
          ? {
              is: true,
              reason: "У вас роль «Просмотр»: изменять материалы нельзя.",
            }
          : { is: false, reason: "" }

  const go = useCallback(
    (screen: Screen, scenario = "default") =>
      navigate((r) => ({ ...r, screen, scenario, accessRequestId: undefined, draftId: screen === "draft" ? r.draftId : undefined })),
    [],
  )
  const openDocument = useCallback(
    (
      projectId: string,
      name: string,
      screen: "analysis" | "review" = "analysis",
      scenario = "default",
      version?: number,
    ) => {
      navigate((r) => ({
        ...r,
        screen,
        projectId,
        tab: "docs",
        documentName: name,
        documentVersion: version,
        scenario,
      }))
      setRecentIds((ids) =>
        [projectId, ...ids.filter((x) => x !== projectId)].slice(0, 8),
      )
    },
    [],
  )
  const startChat = useCallback(
    (prompt: string, documentName?: string, researchContextId?: string) =>
      navigate((r) => ({
        ...r,
        screen: "chat",
        scenario: "new",
        prompt,
        documentName,
        documentVersion: undefined,
        chatId: undefined,
        researchContextId,
      })),
    [],
  )
  const openChat = useCallback(
    (id: string, projectId?: string) =>
      navigate((r) => ({
        ...r,
        projectId: projectId ?? r.projectId,
        screen: "chat",
        scenario: "default",
        chatId: id,
        prompt: undefined,
        documentName: undefined,
        documentVersion: undefined,
        researchContextId: undefined,
      })),
    [],
  )
  const openProject = useCallback(
    (id: string, tab: ProjectTab = "chats", scenario = "default") => {
      navigate((r) => ({
        ...r,
        screen: "project",
        projectId: id,
        tab,
        scenario,
        documentName: undefined,
        documentVersion: undefined,
        prompt: undefined,
      }))
      setRecentIds((ids) => [id, ...ids.filter((x) => x !== id)].slice(0, 8))
    },
    [],
  )
  const openList = useCallback(
    (o: { query?: string; visibility?: "all" | Visibility } = {}) =>
      navigate((r) => ({
        ...r,
        screen: "projects",
        scenario: "default",
        list: {
          query: o.query ?? "",
          visibility: o.visibility ?? "all",
          nonce: r.list.nonce + 1,
        },
      })),
    [],
  )
  const openDraft = useCallback((id: string) => navigate((r) => ({ ...r, screen: "draft", draftId: id, scenario: "default" })), [navigate])
  const openResearch = useCallback((id?: string) => navigate((r) => ({ ...r, screen: "research", researchId: id, scenario: "default" })), [navigate])
  const toHome = () => { setOverlay(null); setRoute((r) => ({ ...r, screen: "home", scenario: "default", prompt: undefined, documentName: undefined, documentVersion: undefined, chatId: undefined, draftId: undefined, researchId: undefined, researchContextId: undefined, token: undefined })) }
  const sessionAction = (fn: () => void, forced = false) => {
    if (forced) { leaveGuard.current = null; fn() }
    else if (!leaveGuard.current?.(fn)) fn()
  }
  const openAuth = (view: AuthView = "login", token?: string) => sessionAction(() => {
    identity.endSession("signed-out"); setOverlay(null); setRoute((r) => ({ ...r, screen: "auth", authView: view, token, scenario: "default" }))
  })
  const logout = (expired = false) => sessionAction(() => {
    identity.endSession(expired ? "expired" : "signed-out"); setOverlay(null); setRoute((r) => ({ ...r, screen: "auth", authView: "login", token: undefined, scenario: "default" }))
  }, expired)
  const login = (userId: string) => { if (identity.activate(userId)) toHome() }
  const switchUser = (userId: string) => sessionAction(() => { if (identity.activate(userId)) toHome() })
  const switchOrganization = (orgId: string) => sessionAction(() => { identity.switchOrg(orgId); toHome() })
  const openMembers = (projectId: string) => navigate((r) => ({ ...r, screen: "members", projectId, scenario: "default" }))
  const openAccessRequest = (requestId: string) => navigate((r) => ({ ...r, screen: "organization", accessRequestId: requestId, scenario: "default" }))

  // Адрес отражает экран и проект: работают кнопки браузера «назад/вперёд», обновление и копирование ссылки.
  useEffect(() => {
    const next = routeToHash(route)
    if (
      window.location.hash !== next &&
      !(next === "#/" && window.location.hash === "")
    )
      window.history.pushState(null, "", next) // без навигации: не перезагружает превью
  }, [
    route.screen,
    route.projectId,
    route.tab,
    route.documentName,
    route.documentVersion,
    route.chatId,
    route.draftId,
    route.researchId,
    route.researchContextId,
    route.authView,
    route.accessRequestId,
    route.token,
    route.scenario,
    route.list.query,
    route.list.visibility,
  ]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onHash = () => {
      const previous = routeRef.current
      const next = hashToRoute(window.location.hash, previous)
      if (!next || routeToHash(next) === routeToHash(previous)) return
      const proceed = () => setRoute(next)
      if (next.screen === "auth" && identityRef.current.session === "active") {
        const signOut = () => { identityRef.current.endSession("signed-out"); setOverlay(null); proceed() }
        if (leaveGuard.current?.(signOut)) window.history.replaceState(null, "", routeToHash(previous))
        else signOut()
      }
      else if (leaveGuard.current?.(proceed)) window.history.replaceState(null, "", routeToHash(previous))
      else proceed()
    }
    window.addEventListener("hashchange", onHash)
    window.addEventListener("popstate", onHash)
    return () => {
      window.removeEventListener("hashchange", onHash)
      window.removeEventListener("popstate", onHash)
    }
  }, [])
  useEffect(() => {
    if (identity.session !== "active" && route.screen !== "auth") setRoute((r) => ({ ...r, screen: "auth", authView: "login", token: undefined, scenario: "default" }))
  }, [identity.session, route.screen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyK") {
        e.preventDefault()
        setOverlay((o) => (o?.type === "palette" ? null : { type: "palette" }))
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const update = (id: string, patch: Partial<Project>) => {
    const actor = identityRef.current
    const project = actor.accessibleProjects.find((p) => p.id === id)
    if (actor.session !== "active" || !project || project.role !== "owner" || project.status === "restricted" || project.status === "deleting" || project.status === "archived" && patch.status !== "active") return
    recordAudit({
      category: "project", projectId: id, result: "success",
      action: patch.name ? "Название проекта изменено" : patch.status === "archived" ? "Проект архивирован" : "Проект восстановлен",
    })
    setAll((list) =>
      list.map((p) =>
        p.id === id
          ? { ...p, ...patch, updatedAt: PROTO_NOW.toISOString() }
          : p,
      ),
    )
  }
  const deleteProject: AppCtx["deleteProject"] = async (id, name, fail) => {
    const actor = identityRef.current
    const key = `${actor.userId}:${actor.orgId}`
    if (deleting.current.has(id)) return "Операция уже запущена. Дубликат не создан."
    const initial = actor.accessibleProjects.find((p) => p.id === id)
    const invalid = deletionError(initial, actor.session === "active", name, !auditFailureRef.current)
    if (invalid) return invalid
    deleting.current.add(id)
    await new Promise((resolve) => setTimeout(resolve, 450))
    const live = identityRef.current
    const project = live.accessibleProjects.find((p) => p.id === id)
    const error = `${live.userId}:${live.orgId}` !== key
      ? "Сессия изменилась. Удаление не выполнено."
      : deletionError(project, live.session === "active", name, !auditFailureRef.current)
    if (error || fail) {
      deleting.current.delete(id)
      if (fail && !error) recordAudit({ category: "project", projectId: id, action: "Не удалось запустить удаление", result: "failed" })
      return error || "Ошибка запуска. Проект не изменён. Подтверждение сохранено — можно повторить."
    }
    const op: DeletionOperation = {
      id: crypto.randomUUID(), orgId: live.orgId, actorId: live.userId,
      projectId: id, projectName: project!.name, startedAt: Date.now(), status: "deleting",
    }
    const next = [op, ...deletionRef.current]
    deletionRef.current = next
    setDeletions(next)
    recordAudit({ category: "project", projectId: id, objectId: op.id, action: "Удаление подтверждено OWNER дважды и запущено", result: "pending" })
    setAll((projects) => projects.map((p) => p.id === id ? { ...p, status: "deleting" } : p))
    leaveGuard.current = null
    setRoute((r) => ({ ...r, screen: "audit", scenario: "default" }))
    return ""
  }

  const ctx: AppCtx = {
    openAccessRequest,
    auditEvents, recordAudit, deletions, deleteProject, auditFailure, setAuditFailure,
    identity: {
      ...identity,
      assignMember: (id, userId, role) => {
        const ok = identity.assignMember(id, userId, role)
        if (ok) recordAudit({ category: "membership", projectId: id, objectId: userId, action: `Участник добавлен · ${role.toUpperCase()}`, result: "success" })
        return ok
      },
      changeMember: (id, userId, role) => {
        const ok = identity.changeMember(id, userId, role)
        if (ok) recordAudit({ category: "membership", projectId: id, objectId: userId, action: `Роль участника изменена · ${role.toUpperCase()}`, result: "success" })
        return ok
      },
      removeMember: (id, userId) => {
        const ok = identity.removeMember(id, userId)
        if (ok) recordAudit({ category: "membership", projectId: id, objectId: userId, action: "Доступ участника отозван", result: "success" })
        return ok
      },
    }, openAuth, login, finishInvite: toHome, logout, switchUser, switchOrganization, openMembers,
    projects,
    recents,
    pinned,
    togglePin,
    pinLimit: PIN_LIMIT,
    current,
    route,
    readOnly,
    sim,
    toggleSim: (k) => setSim((s) => ({ ...s, [k]: !s[k] })),
    go,
    openProject,
    openDocument,
    startChat,
    openChat,
    openDraft,
    openResearch,
    setLeaveGuard,
    openList,
    openPalette: () => setOverlay({ type: "palette" }),
    openCreate: (o = {}) =>
      setOverlay({
        type: "create",
        visibility: o.visibility ?? "personal",
        name: o.name ?? "",
      }),
    manage: (p, action) => {
      if (p.role === "owner") setOverlay({ type: "manage", id: p.id, action })
    },
  }

  const props = {
    go,
    scenario: route.scenario,
    setScenario: (s: string) => setRoute((r) => ({ ...r, scenario: s })),
  }
  const managed =
    overlay?.type === "manage"
      ? projects.find((p) => p.id === overlay.id)
      : undefined
  const projectUnavailable = deep.includes(route.screen) && (!current || current.status === "deleting")

  return (
    <AppProvider value={ctx}>
      <WorkspaceProvider>
        <LegalWorkProvider>
        <NotificationProvider>
        {identity.session === "active" && route.screen !== "auth" ? <>
        {route.screen === "home" && <HomeScreen {...props} />}
        {route.screen === "projects" && (
          <ProjectsScreen key={route.list.nonce} {...props} />
        )}
        {route.screen === "project" && (
          <ProjectScreen key={route.projectId} {...props} />
        )}
        {projectUnavailable && <ProjectScreen {...props} />}
        {!projectUnavailable && route.screen === "chat" && (
          <ChatScreen
            key={`${route.projectId}:${route.chatId ?? "new"}:${route.documentName ?? ""}`}
            {...props}
          />
        )}
        {!projectUnavailable && route.screen === "analysis" && (
          <AnalysisScreen
            key={`${route.projectId}:${route.documentName}:${route.documentVersion}`}
            {...props}
          />
        )}
        {!projectUnavailable && route.screen === "review" && (
          <ReviewScreen key={route.projectId} {...props} />
        )}
        {!projectUnavailable && route.screen === "draft" && (
          <DraftScreen key={`${route.projectId}:${route.draftId ?? "default"}`} {...props} />
        )}
        {!projectUnavailable && route.screen === "research" && <ResearchScreen key={`${route.projectId}:${route.researchId ?? "new"}`} {...props} />}
        {route.screen === "members" && <MembersScreen {...props} />}
        {route.screen === "organization" && <OrganizationScreen {...props} />}
        {route.screen === "audit" && <AuditScreen key={`${identity.userId}:${identity.orgId}:${route.scenario}`} {...props} />}
        {route.screen === "notifications" && <NotificationsScreen key={`${identity.userId}:${identity.orgId}`} {...props} />}

        {overlay?.type === "palette" && (
          <CommandPalette onClose={() => setOverlay(null)} />
        )}
        {overlay?.type === "create" && (
          <CreateProjectDialog
            initialVisibility={overlay.visibility}
            initialName={overlay.name}
            failNext={sim.createError}
            onClose={() => setOverlay(null)}
            onCreate={(p) => {
              if (identityRef.current.session !== "active" || identityRef.current.userId !== identity.userId || identityRef.current.orgId !== identity.orgId) return
              setAll((l) => [{ ...p, organizationId: identity.orgId, clientId: identity.orgId === "vector" ? p.clientId : undefined, matterId: identity.orgId === "vector" ? p.matterId : undefined }, ...l])
              identity.registerProject(p.id)
              recordAudit({ category: "project", projectId: p.id, projectName: p.name, action: "Проект создан", result: "success" })
              setOverlay(null)
              openProject(p.id)
            }}
          />
        )}
        </> : <AuthScreen key={`${route.authView ?? "login"}:${route.token ?? ""}`} />}
        {identity.session === "active" && route.screen !== "auth" && overlay?.type === "manage" && managed && (
          overlay.action === "delete" ? <DeleteProjectDialog
            key={managed.id}
            project={managed}
            onClose={() => setOverlay(null)}
          /> : <ManageProjectDialog
            project={managed}
            action={overlay.action}
            onClose={() => setOverlay(null)}
            onApply={(patch) => {
              update(managed.id, patch)
              setOverlay(null)
            }}
          />
        )}
        </NotificationProvider>
        </LegalWorkProvider>
      </WorkspaceProvider>
    </AppProvider>
  )
}
