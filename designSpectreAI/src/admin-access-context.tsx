import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useApp } from "./app-context"
import {
  applyAccessAction,
  canReadAccessObject,
  emptyAccessLedger,
  reconcileAccess,
  type AccessAction,
  type AccessEnvironment,
} from "./data/admin-access"
import type { Material } from "./data/workspace"

function useAccessState(materials: Material[]) {
  const { identity } = useApp()
  const [ledger, setLedger] = useState(emptyAccessLedger)
  const [now, setNow] = useState(Date.now)
  const [auditFailure, setAuditFailure] = useState(false)
  const objects = materials.flatMap((m) => {
    // Include all tenants for lifecycle reconciliation, never expose content here.
    const p = identity.accessProjectMetadata.find((p) => p.id === m.projectId)
    if (
      !p ||
      m.stage !== "ready" ||
      !m.versions.length ||
      p.status === "deleting"
    )
      return []
    return [
      {
        id: m.id,
        projectId: m.projectId,
        orgId: p.orgId,
        version: m.versions[m.versions.length - 1].number,
      },
    ]
  })
  const env: AccessEnvironment = {
    userId: identity.userId,
    orgId: identity.orgId,
    active: identity.session === "active",
    members: identity.orgMembers,
    objects,
    now,
  }
  const live = useRef({ ledger, env, materials, auditFailure })
  live.current = { ledger, env, materials, auditFailure }
  const effective = reconcileAccess(ledger, env)
  useEffect(() => {
    const refresh = () => {
      const state = live.current
      const time = Date.now()
      const next = reconcileAccess(state.ledger, { ...state.env, now: time })
      live.current = { ...state, ledger: next }
      setLedger(next)
      setNow(time)
    }
    const timer = window.setInterval(refresh, 500)
    window.addEventListener("focus", refresh)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener("focus", refresh)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [])
  const execute = async (action: AccessAction) => {
    const actor = `${identity.userId}:${identity.orgId}`
    await new Promise((resolve) => setTimeout(resolve, 350))
    const state = live.current
    if (`${state.env.userId}:${state.env.orgId}` !== actor || !state.env.active)
      return "Сессия изменилась. Действие не выполнено."
    const result = applyAccessAction(
      state.ledger,
      { ...state.env, now: Date.now() },
      action,
      !state.auditFailure,
    )
    live.current = { ...state, ledger: result.ledger }
    setLedger(result.ledger)
    return result.error
  }
  return {
    ledger: effective,
    env,
    now,
    execute,
    auditFailure,
    setAuditFailure,
    read: (requestId: string) => {
      const state = live.current
      if (
        !canReadAccessObject(
          state.ledger,
          { ...state.env, now: Date.now() },
          requestId,
        )
      )
        return undefined
      const r = state.ledger.requests.find((r) => r.id === requestId)!
      const m = state.materials.find((m) => m.id === r.object.id)
      const version = m?.versions.find((v) => v.number === r.object.version)
      return m && version
        ? { name: m.name, text: version.text, version: version.number, extraction: version.extraction ?? "complete" }
        : undefined
    },
    expireDemo: (requestId: string) => {
      const state = live.current
      const r = state.ledger.requests.find((r) => r.id === requestId)
      if (
        !r ||
        r.orgId !== state.env.orgId ||
        r.requesterId !== state.env.userId ||
        r.status !== "active"
      )
        return
      const next = reconcileAccess(
        {
          ...state.ledger,
          requests: state.ledger.requests.map((r) =>
            r.id === requestId ? { ...r, expiresAt: Date.now() - 1 } : r,
          ),
        },
        { ...state.env, now: Date.now() },
      )
      live.current = { ...state, ledger: next }
      setLedger(next)
    },
  }
}
type AccessContextValue = ReturnType<typeof useAccessState>
const AccessContext = createContext<AccessContextValue | null>(null)
export function AdminAccessProvider({
  materials,
  children,
}: {
  materials: Material[]
  children: ReactNode
}) {
  const value = useAccessState(materials)
  return (
    <AccessContext.Provider value={value}>{children}</AccessContext.Provider>
  )
}
export function useAdminAccess() {
  const value = useContext(AccessContext)
  if (!value) throw new Error("AdminAccessProvider is missing")
  return value
}
