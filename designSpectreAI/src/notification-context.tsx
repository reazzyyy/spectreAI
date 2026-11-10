import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useApp } from "./app-context"
import { useAdminAccess } from "./admin-access-context"
import { useWorkspace } from "./workspace-context"
import {
  defaultNotificationPreferences,
  securityNotifications,
  visibleNotifications,
  type AppNotification,
  type NotificationPreferences,
} from "./data/notifications"

function useNotificationState() {
  const ctx = useApp()
  const access = useAdminAccess()
  const ws = useWorkspace()
  const id = ctx.identity
  const key = `${id.userId}:${id.orgId}`
  const [readByUser, setReadByUser] = useState<Record<string, string[]>>({})
  const [preferencesByUser, setPreferencesByUser] =
    useState<Record<string, NotificationPreferences>>({})
  const [jobs, setJobs] = useState<AppNotification[]>([])
  const startedAt = useRef(Date.now())
  const readIds = readByUser[key] ?? []
  const preferences = preferencesByUser[key] ?? defaultNotificationPreferences()
  const viewer = {
    userId: id.userId,
    orgId: id.orgId,
    active: id.session === "active" && id.inOrg(id.userId),
  }
  const items = visibleNotifications(
    [
      ...securityNotifications(
        access.ledger,
        id.lifecycle.offers,
        ctx.auditEvents,
        ctx.deletions,
      ),
      ...jobs,
    ],
    viewer,
    preferences,
  )
  const live = useRef({ key, viewer, items })
  live.current = { key, viewer, items }
  useEffect(() => {
    if (!viewer.active) return
    const completed: AppNotification[] = []
    for (const m of ws.materials) {
      if (
        m.stepAt <= startedAt.current ||
        !["ready", "error", "ocr"].includes(m.stage)
      )
        continue
      const project = ctx.projects.find(
        (p) => p.id === m.projectId && p.status !== "deleting",
      )
      if (!project) continue
      completed.push({
        id: `document:${m.id}:${m.versions.length}:${m.stepAt}`,
        orgId: id.orgId,
        recipients: [m.processingActorId ?? m.authorId],
        at: m.stepAt,
        title:
          m.stage === "ready" && m.versions.slice(-1)[0]?.extraction === "partial"
            ? "Документ извлечён частично — проверьте полноту"
            : m.stage === "ready"
            ? "Обработка документа завершена"
            : m.stage === "ocr"
              ? "Для документа требуется OCR"
              : "Ошибка обработки документа",
        category: "documents",
        target: {
          kind: "document",
          projectId: m.projectId,
          documentId: m.id,
          version: m.versions.length,
        },
      })
    }
    for (const c of ws.conversations) {
      for (const turn of c.turns) {
        if (
          turn.at <= startedAt.current ||
          ["queued", "running"].includes(turn.status)
        )
          continue
        completed.push({
          id: `chat:${turn.id}:${turn.status}`,
          orgId: id.orgId,
          recipients: [turn.actorId ?? c.creatorId ?? "elena"],
          at: Date.now(),
          title:
            turn.failureStage === "retrieval" && turn.status === "failed"
              ? "Не удалось найти источники для Chat"
              : turn.status === "succeeded" && !!turn.incompleteSources?.length
                ? "Предварительный ответ Chat готов — извлечение неполное"
                : turn.status === "succeeded"
              ? "Ответ Chat AI готов"
              : turn.status === "cancelled"
                ? "Задача Chat AI остановлена"
                : "Задача Chat AI завершилась с ошибкой",
          category: "ai",
          target: { kind: "chat", projectId: c.projectId, chatId: c.id },
        })
      }
    }
    if (!completed.length) return
    setJobs((all) => {
      const fresh = completed.filter((n) => !all.some((old) => old.id === n.id))
      return fresh.length ? [...all, ...fresh] : all
    })
  }, [ws.materials, ws.conversations, ctx.projects, id.orgId, viewer.active])
  const mark = (notificationId: string, read: boolean) => {
    const state = live.current
    if (
      !state.viewer.active ||
      !state.items.some((n) => n.id === notificationId)
    )
      return
    setReadByUser((all) => {
      const previous = all[state.key] ?? []
      return {
        ...all,
        [state.key]: read
          ? [...new Set([...previous, notificationId])]
          : previous.filter((n) => n !== notificationId),
      }
    })
  }
  const savePreferences = async (
    next: NotificationPreferences,
    fail: boolean,
  ) => {
    const actor = live.current.key
    await new Promise((resolve) => setTimeout(resolve, 350))
    const state = live.current
    if (!state.viewer.active || state.key !== actor)
      return "Сессия изменилась. Настройки не сохранены."
    if (fail)
      return "Не удалось сохранить настройки. Выбор сохранён — повторите попытку."
    setPreferencesByUser((all) => ({ ...all, [actor]: next }))
    return ""
  }
  return {
    items,
    preferences,
    readIds,
    mark,
    savePreferences,
    unreadCount: items.filter((n) => !readIds.includes(n.id)).length,
    markAll: () => {
      const state = live.current
      if (!state.viewer.active) return
      setReadByUser((all) => ({
        ...all,
        [state.key]: [
          ...new Set([
            ...(all[state.key] ?? []),
            ...state.items.map((n) => n.id),
          ]),
        ],
      }))
    },
    open: (notificationId: string) => {
      const n = live.current.items.find((item) => item.id === notificationId)
      if (!n || !live.current.viewer.active) return false
      mark(n.id, true)
      const target = n.target
      if (target.kind === "organization") {
        ctx.go("organization")
        return true
      }
      if (target.kind === "access") {
        const r = access.ledger.requests.find((r) => r.id === target.requestId)
        if (
          !r ||
          r.orgId !== id.orgId ||
          (r.requesterId !== id.userId &&
            r.approverId !== id.userId &&
            id.orgRole !== "owner")
        )
          return false
        ctx.openAccessRequest(r.id)
        return true
      }
      if (target.kind === "deletion") {
        const op = ctx.deletions.find(
          (op) =>
            op.id === target.operationId &&
            op.orgId === id.orgId &&
            (op.actorId === id.userId || id.orgRole === "owner"),
        )
        if (!op) return false
        ctx.go("audit", op.projectId)
        return true
      }
      const project = ctx.projects.find(
        (p) => p.id === target.projectId && p.status !== "deleting",
      )
      if (target.kind === "members") {
        if (
          !project &&
          !id.adminProjects.some(
            (p) => p.id === target.projectId && p.status !== "deleting",
          )
        )
          return false
        ctx.openMembers(target.projectId)
        return true
      }
      if (!project) return false
      if (target.kind === "document") {
        const m = ws.materials.find(
          (m) =>
            m.id === target.documentId &&
            m.projectId === project.id &&
            m.stage !== "forbidden",
        )
        if (!m || !m.versions.some((v) => v.number === target.version))
          return false
        ctx.openDocument(
          project.id,
          m.name,
          "analysis",
          "default",
          target.version,
        )
        return true
      }
      if (
        !ws.conversations.some(
          (c) => c.id === target.chatId && c.projectId === project.id,
        )
      )
        return false
      ctx.openChat(target.chatId, project.id)
      return true
    },
  }
}
const NotificationContext =
  createContext<ReturnType<typeof useNotificationState> | null>(null)
export function NotificationProvider({ children }: { children: ReactNode }) {
  const value = useNotificationState()
  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  )
}
export function useNotifications() {
  const value = useContext(NotificationContext)
  if (!value) throw new Error("NotificationProvider is missing")
  return value
}
