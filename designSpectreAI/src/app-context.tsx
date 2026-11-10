import { createContext, useContext } from "react"
import type { Project, Visibility } from "./data/projects"
import type { Screen } from "./components/ui"
import type { AuthView } from "./data/identity"
import type { DemoIdentity } from "./use-demo-identity"
import type { AuditEvent, AuditInput, DeletionOperation } from "./data/audit"

export type ProjectTab = "chats" | "docs" | "research" | "drafts"
export type Sim = {
  slow: boolean
  searchError: boolean
  listError: boolean
  createError: boolean
  noProjects: boolean
}
export type ManageAction = "rename" | "archive" | "restore" | "delete"
export type Route = {
  screen: Screen
  projectId: string
  tab: ProjectTab
  scenario: string
  documentName?: string
  documentVersion?: number
  prompt?: string
  chatId?: string
  draftId?: string
  researchId?: string
  researchContextId?: string
  authView?: AuthView
  accessRequestId?: string
  token?: string
  list: { query: string; visibility: "all" | Visibility; nonce: number }
}
export type AppCtx = {
  auditEvents: AuditEvent[]
  recordAudit: (event: AuditInput) => void
  deletions: DeletionOperation[]
  deleteProject: (id: string, name: string, fail: boolean) => Promise<string>
  auditFailure: boolean
  setAuditFailure: (fail: boolean) => void
  projects: Project[]
  identity: DemoIdentity
  openAuth: (view?: AuthView, token?: string) => void
  login: (userId: string) => void
  finishInvite: () => void
  logout: (expired?: boolean) => void
  switchUser: (userId: string) => void
  switchOrganization: (orgId: string) => void
  openMembers: (projectId: string) => void
  openAccessRequest: (requestId: string) => void
  recents: Project[]
  pinned: Project[]
  togglePin: (id: string) => void
  pinLimit: number
  current?: Project
  route: Route
  readOnly: { is: boolean; reason: string }
  sim: Sim
  toggleSim: (k: keyof Sim) => void
  go: (s: Screen, scenario?: string) => void
  openProject: (id: string, tab?: ProjectTab, scenario?: string) => void
  openDocument: (
    projectId: string,
    name: string,
    screen?: "analysis" | "review",
    scenario?: string,
    version?: number,
  ) => void
  startChat: (prompt: string, documentName?: string, researchContextId?: string) => void
  openChat: (id: string, projectId?: string) => void
  openDraft: (id: string) => void
  openResearch: (id?: string) => void
  setLeaveGuard: (guard: ((proceed: () => void) => boolean) | null) => void
  openList: (o?: { query?: string; visibility?: "all" | Visibility }) => void
  openPalette: () => void
  openCreate: (o?: { visibility?: Visibility; name?: string }) => void
  manage: (p: Project, a: ManageAction) => void
}

const Ctx = createContext<AppCtx | null>(null)
export const AppProvider = Ctx.Provider
export function useApp() {
  const c = useContext(Ctx)
  if (!c) throw new Error("AppProvider is missing")
  return c
}
