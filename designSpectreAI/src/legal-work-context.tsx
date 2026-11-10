import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useApp } from "./app-context"
import { useWorkspace } from "./workspace-context"
import {
  draftProposal,
  seedDrafts,
  type DraftAI,
  type LegalDraft,
  type Research,
  type ResearchConfig,
} from "./data/legal-work"
import type { SourceRef } from "./data/workspace"

type LegalWork = {
  researches: Research[]
  drafts: LegalDraft[]
  runResearch: (
    projectId: string,
    config: ResearchConfig,
    id?: string,
  ) => string | undefined
  saveResearch: (id: string) => void
  stopResearch: (id: string) => void
  createDraft: (
    projectId: string,
    title: string,
    kind: string,
    text?: string,
    sources?: SourceRef[],
    researchId?: string,
  ) => string | undefined
  changeDraft: (
    id: string,
    patch: Partial<Pick<LegalDraft, "text" | "title">>,
  ) => void
  saveDraft: (id: string, recover?: boolean) => void
  setSaveOutcome: (id: string, outcome: LegalDraft["saveOutcome"]) => void
  discardDraft: (id: string) => void
  resolveConflict: (id: string, choice: "mine" | "theirs") => void
  restore: (id: string, version: number) => void
  removeDraft: (id: string) => void
  runAI: (
    id: string,
    mode: DraftAI["mode"],
    outcome: DraftAI["outcome"],
  ) => void
  stopAI: (id: string) => void
  acceptAI: (id: string) => void
  rejectAI: (id: string) => void
  canReadDraft: (draft: LegalDraft) => boolean
}
const Context = createContext<LegalWork | null>(null)
const stamp = () =>
  new Date().toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
function checkpoint(d: LegalDraft, label: string): LegalDraft {
  return {
    ...d,
    versions: [
      ...d.versions,
      {
        number: d.versions.length + 1,
        text: d.text,
        title: d.title,
        label,
        at: stamp(),
      },
    ],
  }
}
export function LegalWorkProvider({ children }: { children: ReactNode }) {
  const ctx = useApp()
  const ws = useWorkspace()
  const [researches, setResearches] = useState<Research[]>([])
  const [drafts, setDrafts] = useState(seedDrafts)
  const permissions = useRef(ctx.projects)
  permissions.current = ctx.projects
  const identityRef = useRef(ctx.identity)
  identityRef.current = ctx.identity
  const previousActor = useRef(
    `${ctx.identity.userId}:${ctx.identity.orgId}:${ctx.identity.session}`,
  )
  const previousProjects = useRef(ctx.projects.map((p) => p.id))
  const projectAccessKey = ctx.projects
    .map((p) => `${p.id}:${p.role}`)
    .join("|")
  useEffect(() => {
    const actor = `${ctx.identity.userId}:${ctx.identity.orgId}:${ctx.identity.session}`
    const changed = previousActor.current !== actor
    const removed = previousProjects.current.filter(
      (id) => !ctx.projects.some((p) => p.id === id),
    )
    if (changed || removed.length)
      setDrafts((all) =>
        all.map((d) =>
          changed || removed.includes(d.projectId)
            ? {
                ...d,
                text: d.savedText,
                title: d.savedTitle,
                saveStatus: "saved",
                editRevision:
                  d.editRevision +
                  (d.text !== d.savedText || d.title !== d.savedTitle ? 1 : 0),
                ai:
                  d.ai && ["queued", "running"].includes(d.ai.status)
                    ? { ...d.ai, status: "cancelled" }
                    : d.ai,
              }
            : d,
        ),
      )
    previousActor.current = actor
    previousProjects.current = ctx.projects.map((p) => p.id)
  }, [
    ctx.identity.userId,
    ctx.identity.orgId,
    ctx.identity.session,
    projectAccessKey,
  ])
  const canEdit = (projectId: string) =>
    permissions.current.some(
      (p) => p.id === projectId && p.status === "active" && p.role !== "viewer",
    )
  const canReadDraft = (d: LegalDraft) =>
    ctx.projects.some((p) => p.id === d.projectId && p.status !== "deleting") &&
    d.sources.every((s) =>
      ws.materials.some(
        (m) =>
          m.projectId === d.projectId &&
          m.id === s.id &&
          m.stage !== "forbidden" &&
          m.versions.some((v) => v.number === s.version),
      ),
    ) &&
    (!d.researchId ||
      researches.some(
        (r) => r.projectId === d.projectId && r.id === d.researchId,
      ))
  const update = (id: string, fn: (d: LegalDraft) => LegalDraft) =>
    setDrafts((all) =>
      all.map((d) =>
        d.id === id && canEdit(d.projectId) && canReadDraft(d) ? fn(d) : d,
      ),
    )
  useEffect(() => {
    const tick = window.setInterval(() => {
      const now = Date.now()
      setResearches((all) => {
        if (
          !all.some((r) =>
            r.runs.some((run) => ["queued", "running"].includes(run.status)),
          )
        )
          return all
        return all.map((r) => ({
          ...r,
          runs: r.runs.map((run) =>
            ["queued", "running"].includes(run.status) &&
            !identityRef.current.canActorEdit(
              r.projectId,
              run.actorId ?? "elena",
            )
              ? { ...run, status: "cancelled" }
              : run.status === "queued" && now - run.at > 650
                ? { ...run, status: "running" }
                : run.status === "running" && now - run.at > 2400
                  ? {
                      ...run,
                      status:
                        run.outcome === "failed"
                          ? "failed"
                          : run.outcome === "timed_out"
                            ? "timed_out"
                            : "succeeded",
                    }
                  : run,
          ),
        }))
      })
      setDrafts((all) => {
        let changed = false
        const next = all.map((d) => {
          if (!canEdit(d.projectId)) {
            if (
              d.ai &&
              ["queued", "running"].includes(d.ai.status) &&
              !identityRef.current.canActorEdit(
                d.projectId,
                d.ai.actorId ?? "elena",
              )
            ) {
              changed = true
              return { ...d, ai: { ...d.ai, status: "cancelled" as const } }
            }
            return d
          }
          let result = d
          if (
            d.saveStatus === "dirty" &&
            d.title.trim() &&
            now - d.touchedAt >= 2000
          )
            result = {
              ...d,
              saveStatus: "saving",
              saveAt: now,
              manualSave: false,
            }
          if (d.saveStatus === "saving" && now - d.saveAt > 550) {
            if (d.saveOutcome === "error")
              result = { ...d, saveStatus: "error" }
            else if (d.saveOutcome === "conflict") {
              const remote = `${d.savedText}\n\nПримечание другого редактора: необходимо уточнить расчёт.`
              const external = checkpoint(
                { ...d, text: remote },
                "Изменения другого редактора",
              )
              result = {
                ...external,
                text: d.text,
                savedText: remote,
                saveStatus: "conflict",
              }
            } else {
              result = {
                ...(d.manualSave ? checkpoint(d, "Ручное сохранение") : d),
                savedText: d.text,
                savedTitle: d.title,
                saveStatus: "saved",
                manualSave: false,
              }
            }
          }
          const ai = result.ai
          if (ai?.status === "queued" && now - ai.at > 600)
            result = { ...result, ai: { ...ai, status: "running" } }
          else if (ai?.status === "running" && now - ai.at > 1900)
            result = {
              ...result,
              ai: {
                ...ai,
                status: ai.outcome === "failed" ? "failed" : "succeeded",
              },
            }
          if (result !== d) changed = true
          return result
        })
        return changed ? next : all
      })
    }, 250)
    return () => clearInterval(tick)
  }, [])
  const value: LegalWork = {
    researches: researches.filter((r) =>
      ctx.projects.some((p) => p.id === r.projectId && p.status !== "deleting"),
    ),
    drafts: drafts.filter((d) =>
      ctx.projects.some((p) => p.id === d.projectId && p.status !== "deleting"),
    ),
    canReadDraft,
    runResearch: (projectId, config, id) => {
      if (
        !canEdit(projectId) ||
        !config.question.trim() ||
        !config.legalDate ||
        (!config.norms && !config.practice)
      )
        return
      const existing = researches.find(
        (r) => r.id === id && r.projectId === projectId,
      )
      if (existing?.runs.some((r) => ["queued", "running"].includes(r.status)))
        return
      const researchId = existing?.id ?? crypto.randomUUID()
      const run = {
        id: crypto.randomUUID(),
        actorId: ctx.identity.userId,
        question: config.question.trim(),
        at: Date.now(),
        outcome: config.outcome,
        status: "queued" as const,
      }
      setResearches((all) =>
        existing
          ? all.map((r) =>
              r.id === researchId
                ? { ...r, runs: [...r.runs, run], saved: false }
                : r,
            )
          : [
              { id: researchId, projectId, config, runs: [run], saved: false },
              ...all,
            ],
      )
      return researchId
    },
    saveResearch: (id) =>
      setResearches((all) =>
        all.map((r) =>
          r.id === id && canEdit(r.projectId) ? { ...r, saved: true } : r,
        ),
      ),
    stopResearch: (id) =>
      setResearches((all) =>
        all.map((r) =>
          r.id === id && canEdit(r.projectId)
            ? {
                ...r,
                runs: r.runs.map((run) =>
                  ["queued", "running"].includes(run.status) &&
                  (run.actorId === ctx.identity.userId ||
                    ctx.projects.some(
                      (p) => p.id === r.projectId && p.role === "owner",
                    ))
                    ? { ...run, status: "cancelled" }
                    : run,
                ),
              }
            : r,
        ),
      ),
    createDraft: (
      projectId,
      title,
      kind,
      text = "",
      sources = [],
      researchId,
    ) => {
      if (!canEdit(projectId) || !title.trim()) return
      const id = crypto.randomUUID()
      const d: LegalDraft = {
        id,
        projectId,
        title: title.trim(),
        savedTitle: title.trim(),
        kind,
        text,
        savedText: text,
        author: ctx.identity.user.name,
        authorId: ctx.identity.userId,
        editRevision: 0,
        touchedAt: 0,
        saveAt: 0,
        saveStatus: "saved",
        saveOutcome: "success",
        manualSave: false,
        sources,
        researchId,
        versions: [
          {
            number: 1,
            title: title.trim(),
            text,
            label: "Создание черновика",
            at: stamp(),
          },
        ],
      }
      if (!canReadDraft(d)) return
      setDrafts((all) => [d, ...all])
      return id
    },
    changeDraft: (id, patch) =>
      update(id, (d) => ({
        ...d,
        ...patch,
        editRevision: d.editRevision + 1,
        touchedAt: Date.now(),
        saveStatus:
          d.saveStatus === "conflict"
            ? "conflict"
            : d.saveStatus === "error"
              ? "error"
              : "dirty",
      })),
    saveDraft: (id, recover = false) =>
      update(id, (d) =>
        d.saveStatus === "conflict" ||
        d.saveStatus === "saving" ||
        !d.title.trim()
          ? d
          : {
              ...d,
              saveStatus: "saving",
              saveAt: Date.now(),
              manualSave: true,
              saveOutcome: recover ? "success" : d.saveOutcome,
            },
      ),
    setSaveOutcome: (id, saveOutcome) =>
      update(id, (d) => ({ ...d, saveOutcome })),
    discardDraft: (id) =>
      update(id, (d) => ({
        ...d,
        text: d.savedText,
        title: d.savedTitle,
        saveStatus: "saved",
        editRevision: d.editRevision + 1,
      })),
    resolveConflict: (id, choice) =>
      update(id, (d) => {
        if (d.saveStatus !== "conflict") return d
        if (choice === "mine")
          return {
            ...checkpoint(d, "Разрешение конфликта — моя редакция"),
            savedText: d.text,
            savedTitle: d.title,
            saveStatus: "saved",
            saveOutcome: "success",
          }
        const preserved = checkpoint(d, "Моя редакция до разрешения конфликта")
        return {
          ...checkpoint(
            { ...preserved, text: d.savedText, title: d.savedTitle },
            "Принята сохранённая редакция",
          ),
          saveStatus: "saved",
          saveOutcome: "success",
          editRevision: d.editRevision + 1,
        }
      }),
    restore: (id, version) =>
      update(id, (d) => {
        const selected = d.versions.find((v) => v.number === version)
        if (!selected) return d
        const last = d.versions.slice(-1)[0]
        const preserved =
          d.text !== last?.text || d.title !== last?.title
            ? checkpoint(d, "Рабочая редакция перед восстановлением")
            : d
        const restored = checkpoint(
          { ...preserved, text: selected.text, title: selected.title },
          `Восстановлена версия ${version}`,
        )
        return {
          ...restored,
          savedText: restored.text,
          savedTitle: restored.title,
          saveStatus: "saved",
          editRevision: d.editRevision + 1,
        }
      }),
    removeDraft: (id) =>
      setDrafts((all) =>
        all.filter(
          (d) =>
            d.id !== id ||
            !canEdit(d.projectId) ||
            !canReadDraft(d) ||
            (d.authorId !== ctx.identity.userId &&
              !ctx.projects.some(
                (p) => p.id === d.projectId && p.role === "owner",
              )),
        ),
      ),
    runAI: (id, mode, outcome) =>
      update(id, (d) =>
        !d.text.trim() || ["queued", "running"].includes(d.ai?.status ?? "")
          ? d
          : {
              ...d,
              ai: {
                mode,
                actorId: ctx.identity.userId,
                outcome,
                status: "queued",
                at: Date.now(),
                baseRevision: d.editRevision,
                baseText: d.text,
                proposedText: draftProposal(d.text, mode),
              },
            },
      ),
    stopAI: (id) =>
      update(id, (d) =>
        d.ai &&
        ["queued", "running"].includes(d.ai.status) &&
        (d.ai.actorId === ctx.identity.userId ||
          ctx.projects.some((p) => p.id === d.projectId && p.role === "owner"))
          ? { ...d, ai: { ...d.ai, status: "cancelled" } }
          : d,
      ),
    acceptAI: (id) =>
      update(id, (d) => {
        if (
          !d.ai ||
          d.ai.status !== "succeeded" ||
          d.ai.mode === "review" ||
          d.ai.outcome !== "success" ||
          d.ai.resolved ||
          d.ai.baseRevision !== d.editRevision ||
          d.saveStatus === "conflict"
        )
          return d
        const base =
          d.text !== d.savedText ? checkpoint(d, "Ручные правки перед AI") : d
        const next = checkpoint(
          { ...base, text: d.ai.proposedText },
          "Принятые AI-правки",
        )
        return {
          ...next,
          ai: { ...d.ai, resolved: true },
          editRevision: d.editRevision + 1,
          saveStatus: "dirty",
          touchedAt: Date.now(),
        }
      }),
    rejectAI: (id) =>
      update(id, (d) => (d.ai ? { ...d, ai: { ...d.ai, resolved: true } } : d)),
  }
  return <Context.Provider value={value}>{children}</Context.Provider>
}
export function useLegalWork() {
  const value = useContext(Context)
  if (!value) throw new Error("LegalWorkProvider is missing")
  return value
}
