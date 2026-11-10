import type { Project } from "./projects"

export type AuditEvent = {
  id: string
  orgId: string
  actorId: string
  at: number
  action: string
  category: "project" | "access" | "membership" | "material" | "ai"
  projectId?: string
  projectName?: string
  objectId?: string
  approverId?: string
  result: "success" | "failed" | "pending"
}
export type AuditInput = Omit<AuditEvent, "id" | "orgId" | "actorId" | "at">
export type AuditViewer = {
  active: boolean
  orgId: string
  userId: string
  orgRole?: string
  projectIds: string[]
}
export function canReadAudit(event: AuditEvent, viewer: AuditViewer) {
  return (
    viewer.active &&
    event.orgId === viewer.orgId &&
    (viewer.orgRole === "owner" ||
      (!!event.projectId && viewer.projectIds.includes(event.projectId)) ||
      (event.category === "access" && event.approverId === viewer.userId))
  )
}
export type DeletionOperation = {
  id: string
  orgId: string
  actorId: string
  projectId: string
  projectName: string
  startedAt: number
  finishedAt?: number
  status: "deleting" | "completed"
}
export function deletionError(
  project: Project | undefined,
  active: boolean,
  confirmedName: string,
  auditAvailable: boolean,
) {
  if (!active || !project || project.role !== "owner")
    return "Право OWNER или доступ к проекту утрачены. Удаление не выполнено."
  if (project.status !== "active" && project.status !== "archived")
    return "Проект уже удаляется или ограничен. Новая операция не создана."
  if (confirmedName !== project.name)
    return "Название изменилось или введено неточно. Проверьте подтверждение."
  if (!auditAvailable)
    return "Обязательный аудит недоступен. Проект не изменён — повторите после восстановления аудита."
  return ""
}
