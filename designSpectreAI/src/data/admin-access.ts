import type { OrgMembership } from "./identity"

export type AccessObject = {
  id: string
  projectId: string
  orgId: string
  version: number
}
export type AccessRequest = {
  id: string
  orgId: string
  requesterId: string
  approverId: string
  object: AccessObject
  reason: string
  minutes: 15 | 30 | 60
  status: "pending" | "active" | "rejected" | "revoked" | "expired"
  createdAt: number
  decidedAt?: number
  expiresAt?: number
  closedReason?: string
}
export type AccessEvent = {
  id: string
  requestId?: string
  orgId: string
  actorId: string
  subjectId?: string
  action: string
  at: number
}
export type AccessLedger = {
  approvers: Record<string, string[]>
  requests: AccessRequest[]
  events: AccessEvent[]
}
export type AccessEnvironment = {
  userId: string
  orgId: string
  active: boolean
  members: OrgMembership[]
  objects: AccessObject[]
  now: number
}
export type AccessAction = {
  type: "appoint"
  userId: string
  enabled: boolean
} | {
  type: "request"
  objectId: string
  approverId: string
  reason: string
  minutes: number
} | {
  type: "approve" | "reject" | "revoke" | "open"
  requestId: string
}

export const emptyAccessLedger = (): AccessLedger => ({
  approvers: {},
  requests: [],
  events: [],
})
export const accessStatusLabel: Record<AccessRequest["status"], string> = {
  pending: "Ожидает решения",
  active: "Доступ действует",
  rejected: "Отказано",
  revoked: "Отозван",
  expired: "Срок истёк",
}
const member = (env: AccessEnvironment, userId: string, orgId = env.orgId) =>
  env.members.find((m) => m.orgId === orgId && m.userId === userId)
export const isAccessManager = (env: AccessEnvironment, userId = env.userId) =>
  ["owner", "admin"].includes(member(env, userId)?.role ?? "")
export const isAccessApprover = (
  ledger: AccessLedger,
  env: AccessEnvironment,
  userId = env.userId,
) => !!member(env, userId) && !!ledger.approvers[env.orgId]?.includes(userId)
const sameObject = (a: AccessObject, b: AccessObject) =>
  a.id === b.id &&
  a.orgId === b.orgId &&
  a.projectId === b.projectId &&
  a.version === b.version
function invalidReason(
  request: AccessRequest,
  ledger: AccessLedger,
  env: AccessEnvironment,
) {
  const scoped = { ...env, orgId: request.orgId }
  if (!isAccessManager(scoped, request.requesterId))
    return "Членство или административные полномочия заявителя прекращены."
  if (!isAccessApprover(ledger, scoped, request.approverId))
    return "Полномочия назначенного согласующего прекращены."
  if (!env.objects.some((o) => sameObject(o, request.object)))
    return "Объект или согласованная версия больше недоступны."
  return ""
}
function event(
  env: AccessEnvironment,
  action: string,
  requestId?: string,
  orgId = env.orgId,
): AccessEvent {
  return {
    id: crypto.randomUUID(),
    requestId,
    orgId,
    actorId: env.userId,
    action,
    at: env.now,
  }
}
// Expiry and invalidation are independent of the open screen and current tenant.
export function reconcileAccess(
  ledger: AccessLedger,
  env: AccessEnvironment,
): AccessLedger {
  const events: AccessEvent[] = []
  const requests = ledger.requests.map((r) => {
    if (r.status !== "active" && r.status !== "pending") return r
    const reason = invalidReason(r, ledger, env)
    const expired = r.status === "active" && (r.expiresAt ?? 0) <= env.now
    if (!reason && !expired) return r
    events.push({
      ...event(
        env,
        expired ? "Срок доступа истёк" : "Доступ прекращён",
        r.id,
        r.orgId,
      ),
      actorId: "system",
    })
    return {
      ...r,
      status: expired ? "expired" as const : "revoked" as const,
      closedReason: expired
        ? "Согласованный срок истёк. Продление недоступно."
        : reason,
    }
  })
  return events.length
    ? { ...ledger, requests, events: [...ledger.events, ...events] }
    : ledger
}
export function canReadAccessObject(
  ledger: AccessLedger,
  env: AccessEnvironment,
  requestId: string,
) {
  const r = ledger.requests.find((r) => r.id === requestId)
  return !!(
    env.active &&
    r &&
    r.orgId === env.orgId &&
    r.requesterId === env.userId &&
    r.status === "active" &&
    (r.expiresAt ?? 0) > env.now &&
    !invalidReason(r, ledger, env)
  )
}
export function applyAccessAction(
  input: AccessLedger,
  env: AccessEnvironment,
  action: AccessAction,
  auditAvailable = true,
): {
  ledger: AccessLedger
  error?: string
} {
  const ledger = reconcileAccess(input, env)
  const fail = (error: string) => ({ ledger, error })
  if (!env.active || !member(env, env.userId))
    return fail("Сессия или членство прекращены. Действие не выполнено.")
  if (action.type === "appoint") {
    if (
      member(env, env.userId)?.role !== "owner" ||
      !member(env, action.userId)
    )
      return fail("Назначать согласующих может только Owner организации.")
    if (!auditAvailable)
      return fail(
        "Не удалось записать обязательное событие. Полномочия не изменены.",
      )
    const ids = ledger.approvers[env.orgId] ?? []
    const next = {
      ...ledger,
      approvers: {
        ...ledger.approvers,
        [env.orgId]: action.enabled
          ? [...new Set([...ids, action.userId])]
          : ids.filter((id) => id !== action.userId),
      },
      events: [
        ...ledger.events,
        {
          ...event(
            env,
            action.enabled
              ? "Согласующий назначен"
              : "Полномочия согласующего отозваны",
          ),
          subjectId: action.userId,
        },
      ],
    }
    return { ledger: reconcileAccess(next, env) }
  }
  if (action.type === "request") {
    if (!isAccessManager(env))
      return fail("Запрос доступен только администратору организации.")
    const object = env.objects.find(
      (o) => o.id === action.objectId && o.orgId === env.orgId,
    )
    if (!object) return fail("Выберите доступный объект TEAM.")
    if (!action.reason.trim() || action.reason.trim().length > 500)
      return fail(
        "Укажите причину от 1 до 500 символов без содержимого документов.",
      )
    if (![15, 30, 60].includes(action.minutes))
      return fail("Допустимый срок: 15, 30 или 60 минут.")
    if (
      action.approverId === env.userId ||
      !isAccessApprover(ledger, env, action.approverId)
    )
      return fail(
        "Нет независимого уполномоченного согласующего. Доступ не выдаётся.",
      )
    if (
      ledger.requests.some(
        (r) =>
          r.orgId === env.orgId &&
          r.requesterId === env.userId &&
          r.object.id === object.id &&
          ["pending", "active"].includes(r.status),
      )
    )
      return fail(
        "Для этого объекта уже есть ожидающий запрос или активный доступ. Продление запрещено.",
      )
    if (!auditAvailable)
      return fail(
        "Не удалось записать обязательное событие. Запрос не отправлен; доступ не выдан.",
      )
    const request: AccessRequest = {
      id: crypto.randomUUID(),
      orgId: env.orgId,
      requesterId: env.userId,
      approverId: action.approverId,
      object,
      reason: action.reason.trim(),
      minutes: action.minutes as AccessRequest["minutes"],
      status: "pending",
      createdAt: env.now,
    }
    return {
      ledger: {
        ...ledger,
        requests: [...ledger.requests, request],
        events: [...ledger.events, event(env, "Запрос создан", request.id)],
      },
    }
  }
  const r = ledger.requests.find(
    (r) => r.id === action.requestId && r.orgId === env.orgId,
  )
  if (!r) return fail("Запрос недоступен.")
  if (action.type === "open") {
    if (!canReadAccessObject(ledger, env, r.id))
      return fail("Разрешение не действует. Материалы закрыты.")
    if (!auditAvailable)
      return fail(
        "Не удалось записать начало просмотра. Материалы не открыты; повторите попытку.",
      )
    return {
      ledger: {
        ...ledger,
        events: [
          ...ledger.events,
          event(env, "Read-only просмотр открыт", r.id),
        ],
      },
    }
  }
  if (action.type === "revoke") {
    if (
      !["pending", "active"].includes(r.status) ||
      (![r.requesterId, r.approverId].includes(env.userId) &&
        member(env, env.userId)?.role !== "owner")
    )
      return fail("Нет права отозвать этот запрос или доступ.")
    // Denial never waits for audit recovery; record the local revocation event.
    const updated = {
      ...r,
      status: "revoked" as const,
      closedReason:
        "Досрочно отозван. Повторный доступ требует нового запроса.",
    }
    return {
      ledger: {
        ...ledger,
        requests: ledger.requests.map((item) =>
          item.id === r.id ? updated : item,
        ),
        events: [...ledger.events, event(env, "Доступ отозван", r.id)],
      },
    }
  }
  if (
    r.status !== "pending" ||
    r.approverId !== env.userId ||
    r.requesterId === env.userId ||
    !isAccessApprover(ledger, env)
  )
    return fail("Решение недоступно: нужны актуальные независимые полномочия.")
  if (!auditAvailable)
    return fail(
      "Не удалось записать обязательное событие. Решение не применено; доступ не выдан. Повторите попытку.",
    )
  const updated: AccessRequest = {
    ...r,
    status: action.type === "approve" ? "active" : "rejected",
    decidedAt: env.now,
    expiresAt:
      action.type === "approve" ? env.now + r.minutes * 60_000 : undefined,
    closedReason:
      action.type === "reject"
        ? "Назначенный согласующий отклонил запрос."
        : undefined,
  }
  return {
    ledger: {
      ...ledger,
      requests: ledger.requests.map((item) =>
        item.id === r.id ? updated : item,
      ),
      events: [
        ...ledger.events,
        event(
          env,
          action.type === "approve"
            ? "Read-only доступ выдан"
            : "Запрос отклонён",
          r.id,
        ),
      ],
    },
  }
}
