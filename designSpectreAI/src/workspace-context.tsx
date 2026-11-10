import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useApp } from "./app-context"
import { AdminAccessProvider } from "./admin-access-context"
import { incompleteSourceRefs, MAX_SELECTED_SOURCES, searchSelectedSamples, searchWorkspaceSamples, validChatSources } from "./lib/chat-context"
import {
  seedMaterials,
  sampleText,
  type Conversation,
  type Material,
  type SourceRef,
  type AIOutcome,
  type ChatContextMode,
  type ChatComposerState,
} from "./data/workspace"

type AddInput = {
  name: string
  size: number
  duplicate: "skip" | "version" | "copy"
}
type Workspace = {
  materials: Material[]
  conversations: Conversation[]
  add: (
    projectId: string,
    files: AddInput[],
    outcome: Material["outcome"],
  ) => void
  retry: (id: string) => void
  rename: (id: string, name: string) => void
  remove: (id: string) => void
  ask: (
    projectId: string,
    prompt: string,
    sources: SourceRef[],
    chatId?: string,
    outcome?: AIOutcome,
    researchId?: string,
    researchRunId?: string,
    contextMode?: ChatContextMode,
    searchFailure?: boolean,
  ) => string | undefined
  getComposer: (projectId: string, slot: string) => ChatComposerState | undefined
  saveComposer: (projectId: string, slot: string, state: ChatComposerState) => void
  clearComposer: (projectId: string, slot: string) => void
  stop: (id: string) => void
  share: (id: string) => void
}
const WorkspaceContext = createContext<Workspace | null>(null)
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const ctx = useApp()
  const [materials, setMaterials] = useState(seedMaterials)
  const [composers, setComposers] = useState<Record<string, {
    actorId: string
    projectId: string
    slot: string
    state: ChatComposerState
  }>>({})
  const [conversations, setConversations] = useState<Conversation[]>([
    {
      id: "ch1",
      creatorId: "elena",
      projectId: "sever",
      title: "Риски условия о неустойке",
      visibility: "PRIVATE",
      turns: [
        {
          id: "turn-seed",
          actorId: "elena",
          prompt: "Какие риски есть в демонстрационном условии о неустойке?",
          status: "succeeded",
          at: 0,
          sources: [{ id: "sever-0", version: 2 }],
          partial: false,
        },
      ],
    },
  ])
  const canEdit = (projectId: string) => {
    const p = ctx.projects.find((p) => p.id === projectId)
    return !!p && p.status === "active" && p.role !== "viewer"
  }
  const permissionRef = useRef(ctx.identity)
  permissionRef.current = ctx.identity
  const canReadChat = (c: Conversation) =>
    ctx.projects.some((p) => p.id === c.projectId && p.status !== "deleting") &&
    (c.visibility === "WORKSPACE" ||
      (c.creatorId ?? "elena") === ctx.identity.userId)
  const composerKey = (projectId: string, slot: string) =>
    JSON.stringify([ctx.identity.userId, ctx.identity.orgId, projectId, slot])
  const canCompose = (projectId: string, slot: string) =>
    canEdit(projectId) && (!slot.startsWith("chat:") || conversations.some((c) =>
      c.id === slot.slice(5) && c.projectId === projectId && canReadChat(c),
    ))
  useEffect(() => {
    setComposers((all) => {
      const allowed = Object.entries(all).filter(([, record]) =>
        ctx.identity.session === "active" &&
        ctx.identity.canActorEdit(record.projectId, record.actorId) &&
        (!record.slot.startsWith("chat:") || conversations.some((c) =>
          c.id === record.slot.slice(5) && c.projectId === record.projectId &&
          (c.visibility === "WORKSPACE" || (c.creatorId ?? "elena") === record.actorId),
        )),
      )
      return allowed.length === Object.keys(all).length ? all : Object.fromEntries(allowed)
    })
  }, [ctx.identity, conversations])
  // Timers live above screens: leaving a page does not freeze the demo job.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now()
      setMaterials((all) =>
        all.map((m) => {
          if (now - m.stepAt < 1000) return m
          const stage =
            m.stage === "queued"
              ? "extracting"
              : m.stage === "extracting"
                ? m.outcome === "ready" || m.outcome === "partial"
                  ? "indexing"
                  : m.outcome
                : m.stage === "indexing"
                  ? "ready"
                  : m.stage
          return stage === m.stage ? m : { ...m, stage, stepAt: now }
        }),
      )
      setConversations((all) =>
        all.map((c) => ({
          ...c,
          turns: c.turns.map((t) => {
            if (
              ["queued", "running"].includes(t.status) &&
              !permissionRef.current.canActorEdit(
                c.projectId,
                t.actorId ?? c.creatorId ?? "elena",
              )
            )
              return { ...t, status: "cancelled" as const, partial: false, cancelReason: "access" as const }
            const elapsed = now - t.at
            return t.status === "queued" && elapsed >= 700
              ? { ...t, status: "running" as const }
              : t.status === "running" && elapsed >= 2500
                ? { ...t, status: t.outcome ?? "succeeded" as const }
                : t
          }),
        })),
      )
    }, 350)
    return () => clearInterval(timer)
  }, [])
  const add: Workspace["add"] = (projectId, files, outcome) => {
    if (!canEdit(projectId)) return
    if (files.some((file) => file.duplicate !== "skip" || !materials.some((m) => m.projectId === projectId && m.name === file.name && m.stage !== "forbidden")))
      ctx.recordAudit({ category: "material", projectId, action: "Материалы поставлены в обработку", result: "pending" })
    setMaterials((all) => {
      const next = [...all]
      for (const file of files) {
        const existing = next.find(
          (m) =>
            m.projectId === projectId &&
            m.stage !== "forbidden" &&
            m.name === file.name,
        )
        if (existing && file.duplicate === "skip") continue
        const version = {
          number:
            existing && file.duplicate === "version"
              ? existing.versions.length + 1
              : 1,
          text: outcome === "partial" ? sampleText.split("\n\n").slice(0, 3).join("\n\n") : sampleText,
          extraction: outcome === "partial" ? "partial" as const : "complete" as const,
          at: "Только что",
        }
        if (existing && file.duplicate === "version") {
          next[next.indexOf(existing)] = {
            ...existing,
            bytes: file.size,
            processingActorId: ctx.identity.userId,
            stage: "queued",
            outcome,
            stepAt: Date.now(),
            versions: [...existing.versions, version],
          }
        } else {
          let name = file.name
          let n = 2
          while (next.some((m) => m.projectId === projectId && m.name === name))
            name = file.name.replace(/(\.[^.]+)$/, ` (${n++})$1`)
          next.unshift({
            id: crypto.randomUUID(),
            projectId,
            name,
            bytes: file.size,
            author: ctx.identity.user.name,
            authorId: ctx.identity.userId,
            processingActorId: ctx.identity.userId,
            date: "2026-10-27",
            stage: "queued",
            outcome,
            stepAt: Date.now(),
            versions: [version],
          })
        }
      }
      return next
    })
  }
  const ask: Workspace["ask"] = (
    projectId,
    prompt,
    sources,
    chatId,
    outcome = "succeeded",
    researchId,
    researchRunId,
    contextMode = "selected",
    searchFailure = false,
  ) => {
    if (!canEdit(projectId) || !prompt.trim()) return
    const existing = conversations.find(
      (c) => c.id === chatId && c.projectId === projectId,
    )
    if (existing && !canReadChat(existing)) return
    if (
      existing?.turns.some(
        (t) => t.status === "queued" || t.status === "running",
      )
    )
      return
    // Never silently drop a revoked selection and send a different scope.
    if (contextMode === "selected" &&
      (sources.length > MAX_SELECTED_SOURCES ||
      validChatSources(sources, materials, projectId, true).length !== sources.length)) return
    const search = contextMode === "workspace"
      ? searchWorkspaceSamples(materials, projectId, prompt, 3, searchFailure)
      : sources.length ? searchSelectedSamples(materials, projectId, prompt, sources, searchFailure) : undefined
    const resolvedSources = search?.sources ?? sources
    const retrievalFailed = search?.summary.outcome === "failed"
    const id = existing?.id ?? crypto.randomUUID()
    const turn = {
      id: crypto.randomUUID(),
      actorId: ctx.identity.userId,
      prompt: prompt.trim(),
      status: "queued" as const,
      outcome: retrievalFailed ? "failed" as const : outcome,
      at: Date.now(),
      partial: false,
      sources: resolvedSources,
      contextMode,
      contextSources: contextMode === "selected" ? sources.map((s) => ({ ...s })) : undefined,
      searchSummary: search?.summary,
      failureStage: retrievalFailed ? "retrieval" as const : undefined,
      incompleteSources: incompleteSourceRefs(resolvedSources, materials, projectId),
    }
    setConversations((all) =>
      existing
        ? all.map((c) =>
            c.id === id ? { ...c, turns: [...c.turns, turn] } : c,
          )
        : [
            {
              id,
              creatorId: ctx.identity.userId,
              projectId,
              title: prompt.trim().slice(0, 70),
              visibility: "PRIVATE",
              researchId,
              researchRunId,
              turns: [turn],
            },
            ...all,
          ],
    )
    ctx.recordAudit({ category: "ai", projectId, objectId: turn.id, action: "AI-задача поставлена в очередь", result: "pending" })
    return id
  }
  const value: Workspace = {
    materials: materials.filter((m) =>
      ctx.projects.some((p) => p.id === m.projectId && p.status !== "deleting"),
    ),
    conversations: conversations.filter(canReadChat),
    add,
    ask,
    getComposer: (projectId, slot) => canCompose(projectId, slot)
      ? composers[composerKey(projectId, slot)]?.state : undefined,
    saveComposer: (projectId, slot, state) => {
      if (!canCompose(projectId, slot)) return
      const key = composerKey(projectId, slot)
      setComposers((all) => JSON.stringify(all[key]?.state) === JSON.stringify(state) ? all : {
        ...all, [key]: { actorId: ctx.identity.userId, projectId, slot, state },
      })
    },
    clearComposer: (projectId, slot) => {
      const key = composerKey(projectId, slot)
      setComposers((all) => {
        if (!all[key]) return all
        const next = { ...all }
        delete next[key]
        return next
      })
    },
    retry: (id) =>
      setMaterials((all) =>
        all.map((m) =>
          m.id === id && canEdit(m.projectId)
            ? { ...m, processingActorId: ctx.identity.userId, stage: "queued", outcome: "ready", stepAt: Date.now() }
            : m,
        ),
      ),
    rename: (id, name) =>
      setMaterials((all) =>
        all.map((m) =>
          m.id === id &&
          canEdit(m.projectId) &&
          name.trim() &&
          !all.some(
            (other) =>
              other.projectId === m.projectId &&
              other.id !== id &&
              other.name === name.trim(),
          )
            ? { ...m, name: name.trim() }
            : m,
        ),
      ),
    remove: (id) =>
      setMaterials((all) =>
        all.filter((m) => {
          const p = ctx.projects.find((p) => p.id === m.projectId)
          return (
            m.id !== id ||
            !canEdit(m.projectId) ||
            (p?.role !== "owner" && m.authorId !== ctx.identity.userId) ||
            m.stage === "forbidden"
          )
        }),
      ),
    stop: (id) =>
      setConversations((all) =>
        all.map((c) =>
          c.id !== id || !canEdit(c.projectId) || !canReadChat(c)
            ? c
            : {
                ...c,
                turns: c.turns.map((t) =>
                  (t.status === "running" || t.status === "queued") &&
                  (t.actorId === ctx.identity.userId ||
                    ctx.projects.some(
                      (p) => p.id === c.projectId && p.role === "owner",
                    ))
                    ? {
                        ...t,
                        status: "cancelled",
                        partial: t.status === "running",
                        cancelReason: "user" as const,
                      }
                    : t,
                ),
              },
        ),
      ),
    share: (id) =>
      setConversations((all) =>
        all.map((c) =>
          c.id === id && canEdit(c.projectId) && canReadChat(c)
            ? { ...c, visibility: "WORKSPACE" }
            : c,
        ),
      ),
  }
  const auditedValue: Workspace = {
    ...value,
    rename: (id, name) => {
      const m = value.materials.find((m) => m.id === id)
      if (!m || !canEdit(m.projectId) || !name.trim() || name.trim() === m.name ||
        value.materials.some((other) => other.id !== id && other.projectId === m.projectId && other.name === name.trim())) return
      value.rename(id, name)
      ctx.recordAudit({ category: "material", projectId: m.projectId, objectId: id, action: "Материал переименован", result: "success" })
    },
    remove: (id) => {
      const m = value.materials.find((m) => m.id === id)
      const p = ctx.projects.find((p) => p.id === m?.projectId)
      if (!m || !canEdit(m.projectId) || m.stage === "forbidden" ||
        (p?.role !== "owner" && m.authorId !== ctx.identity.userId)) return
      value.remove(id)
      ctx.recordAudit({ category: "material", projectId: m.projectId, objectId: id, action: "Материал удалён; зависимые источники закрыты", result: "success" })
    },
    retry: (id) => {
      const m = value.materials.find((m) => m.id === id)
      if (!m || !canEdit(m.projectId)) return
      value.retry(id)
      ctx.recordAudit({ category: "material", projectId: m.projectId, objectId: id, action: "Обработка материала запущена повторно", result: "pending" })
    },
    share: (id) => {
      const c = value.conversations.find((c) => c.id === id)
      if (!c || !canEdit(c.projectId) || c.visibility === "WORKSPACE") return
      value.share(id)
      ctx.recordAudit({ category: "membership", projectId: c.projectId, objectId: id, action: "Чат опубликован для участников проекта", result: "success" })
    },
    stop: (id) => {
      const c = value.conversations.find((c) => c.id === id)
      if (!c || !canEdit(c.projectId) || !c.turns.some((t) =>
        ["queued", "running"].includes(t.status) &&
        (t.actorId === ctx.identity.userId || ctx.projects.some((p) => p.id === c.projectId && p.role === "owner")))) return
      value.stop(id)
      ctx.recordAudit({ category: "ai", projectId: c.projectId, objectId: id, action: "AI-задача остановлена", result: "success" })
    },
  }
  return (
    <WorkspaceContext.Provider value={auditedValue}>
      <AdminAccessProvider materials={materials}>{children}</AdminAccessProvider>
    </WorkspaceContext.Provider>
  )
}
export function useWorkspace() {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error("WorkspaceProvider is missing")
  return value
}
