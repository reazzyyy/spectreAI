import type { AccessLedger } from "./admin-access"
import type { AuditEvent, DeletionOperation } from "./audit"
import type { OwnershipOffer } from "./ownership"

export type NotificationCategory = "security" | "documents" | "ai"
export type NotificationTarget = {
  kind: "access"
  requestId: string
} | {
  kind: "members"
  projectId: string
} | {
  kind: "document"
  projectId: string
  documentId: string
  version: number
} | {
  kind: "chat"
  projectId: string
  chatId: string
} | {
  kind: "deletion"
  operationId: string
} | { kind: "organization" }
export type AppNotification = {
  id: string
  orgId: string
  recipients: string[]
  at: number
  title: string
  category: NotificationCategory
  target: NotificationTarget
}
export type NotificationPreferences = {
  documents: boolean
  ai: boolean
}
export type NotificationViewer = {
  userId: string
  orgId: string
  active: boolean
}
export const defaultNotificationPreferences = (): NotificationPreferences => ({
  documents: true,
  ai: true,
})
const accessTitles: Record<string, string> = {
  "Запрос создан": "Запрос на временный доступ",
  "Read-only доступ выдан": "Временный доступ одобрен",
  "Запрос отклонён": "В запросе доступа отказано",
  "Доступ отозван": "Временный доступ отозван",
  "Срок доступа истёк": "Срок временного доступа истёк",
  "Доступ прекращён": "Временный доступ прекращён",
}
const ownershipTitles: Record<OwnershipOffer["status"], string> = {
  pending: "Предложение владения ожидает решения",
  accepted: "Передача владения завершена",
  declined: "Предложение владения отклонено",
  cancelled: "Предложение владения отозвано",
  expired: "Срок предложения владения истёк",
  invalidated: "Предложение владения больше не действует",
}
export function securityNotifications(
  ledger: AccessLedger,
  offers: OwnershipOffer[],
  audit: AuditEvent[],
  deletions: DeletionOperation[],
): AppNotification[] {
  const items: AppNotification[] = []
  for (const event of ledger.events) {
    if (
      event.subjectId &&
      ["Согласующий назначен", "Полномочия согласующего отозваны"].includes(
        event.action,
      )
    ) {
      items.push({
        id: `authority:${event.id}`,
        orgId: event.orgId,
        at: event.at,
        recipients: [event.subjectId],
        title: event.action,
        category: "security",
        target: { kind: "organization" },
      })
      continue
    }
    const request = ledger.requests.find((r) => r.id === event.requestId)
    const title = accessTitles[event.action]
    if (!request || !title) continue
    items.push({
      // Reconciliation may render an expiry before the timer commits its event.
      // A semantic key keeps read state stable across that render.
      id: `access:${request.id}:${event.action}`,
      orgId: request.orgId,
      recipients: [...new Set([request.requesterId, request.approverId])],
      at: event.at,
      title,
      category: "security",
      target: { kind: "access", requestId: request.id },
    })
  }
  for (const offer of offers) {
    const base = {
      orgId: offer.orgId,
      recipients: [
        ...new Set([
          offer.toId,
          offer.createdById,
          ...(offer.fromId ? [offer.fromId] : []),
        ]),
      ],
      category: "security" as const,
      target: { kind: "members" as const, projectId: offer.projectId },
    }
    items.push({
      ...base,
      id: `ownership:${offer.id}:created`,
      at: offer.createdAt,
      title:
        offer.mode === "recovery"
          ? "Предложено принятие владения TEAM"
          : "Предложение передачи владения",
    })
    if (offer.closedAt)
      items.push({
        ...base,
        id: `ownership:${offer.id}:${offer.status}`,
        at: offer.closedAt,
        title: ownershipTitles[offer.status],
      })
  }
  for (const event of audit) {
    if (
      event.category !== "membership" ||
      !event.projectId ||
      !event.objectId ||
      !(
        event.action.startsWith("Участник добавлен") ||
        event.action.startsWith("Роль участника изменена") ||
        event.action === "Доступ участника отозван"
      )
    )
      continue
    items.push({
      id: `membership:${event.id}`,
      orgId: event.orgId,
      recipients: [event.objectId],
      at: event.at,
      title:
        event.action === "Доступ участника отозван"
          ? "Ваш доступ к проекту отозван"
          : "Ваш доступ к проекту изменён",
      category: "security",
      target: { kind: "members", projectId: event.projectId },
    })
  }
  for (const op of deletions) {
    if (!op.finishedAt) continue
    items.push({
      id: `deletion:${op.id}`,
      orgId: op.orgId,
      recipients: [op.actorId],
      at: op.finishedAt,
      title: "Удаление проекта завершено в демомодели",
      category: "security",
      target: { kind: "deletion", operationId: op.id },
    })
  }
  return items
}
export function visibleNotifications(
  items: AppNotification[],
  viewer: NotificationViewer,
  preferences: NotificationPreferences,
) {
  if (!viewer.active) return []
  return [
    ...new Map(
      items
        .filter(
          (n) =>
            n.orgId === viewer.orgId &&
            n.recipients.includes(viewer.userId) &&
            (n.category === "security" || preferences[n.category]),
        )
        .map((n) => [n.id, n]),
    ).values(),
  ].sort((a, b) => b.at - a.at || a.id.localeCompare(b.id))
}
