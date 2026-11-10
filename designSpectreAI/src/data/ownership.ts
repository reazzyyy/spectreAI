export type OwnershipStatus = "pending" | "accepted" | "declined" | "cancelled" | "expired" | "invalidated"
export type OwnershipOffer = {
  id: string
  orgId: string
  projectId: string
  mode: "handover" | "recovery"
  fromId?: string
  toId: string
  createdById: string
  createdAt: number
  expiresAt: number
  status: OwnershipStatus
  closedAt?: number
  reason?: string
}
export type RestrictedProject = {
  formerOwnerId: string
  since: number
}
export type Departure = {
  id: string
  orgId: string
  userId: string
  byId: string
  at: number
  teamCount: number
  ownedTeamIds: string[]
  personalCount: number
  cancelledOffers: number
}
export type OwnershipLedger = {
  offers: OwnershipOffer[]
  restricted: Record<string, RestrictedProject>
  departures: Departure[]
}
export type LifecycleResult = {
  ok: boolean
  message: string
}
export const ownershipStatusLabel: Record<OwnershipStatus, string> = {
  pending: "Ожидает принятия",
  accepted: "Передача завершена",
  declined: "Получатель отказался",
  cancelled: "Предложение отозвано",
  expired: "Срок истёк",
  invalidated: "Предложение аннулировано",
}
export const lifecycleDate = (at: number) =>
  new Date(at).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  })
