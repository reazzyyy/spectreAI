import type { Project, Role } from "./projects"

export type Person = {
  id: string
  name: string
  email: string
}
export type OrgRole = "owner" | "admin" | "member"
export type OrgMembership = {
  userId: string
  orgId: string
  role: OrgRole
}
export type ProjectMember = {
  userId: string
  role: Role
}
export type Invitation = {
  id: string
  orgId: string
  email: string
  status: "pending" | "accepted" | "revoked"
  expiresAt: number
  requested?: boolean
}
export type ResetLink = {
  id: string
  email: string
  expiresAt: number
  used: boolean
}
export type AuthView = "login" | "forgot" | "reset" | "invite"
export const DEMO_PASSWORD = "SpectrumDemo1!"
export const organizations = [
  { id: "vector", name: "Вектор Право", description: "Юридическая команда" },
  {
    id: "praktika",
    name: "Практика • консалтинг",
    description: "Отдельная организация",
  },
]
export const peopleSeed: Person[] = [
  { id: "elena", name: "Елена Крылова", email: "elena@example.test" },
  { id: "alex", name: "Алексей Волков", email: "alex@example.test" },
  { id: "daria", name: "Дарья Смирнова", email: "daria@example.test" },
  { id: "marina", name: "Марина Белова", email: "marina@example.test" },
  { id: "oleg", name: "Олег Соколов", email: "oleg@example.test" },
  { id: "nikita", name: "Никита Орлов", email: "nikita@example.test" },
  { id: "anna", name: "Анна Морозова", email: "anna@example.test" },
  { id: "pavel", name: "Павел Лебедев", email: "pavel@example.test" },
]
export const orgMembersSeed: OrgMembership[] = [
  ...peopleSeed.map((p) => ({
    userId: p.id,
    orgId: "vector",
    role:
      p.id === "elena"
        ? "owner" as const
        : p.id === "oleg"
          ? "admin" as const
          : "member" as const,
  })),
  { userId: "elena", orgId: "praktika", role: "owner" },
]
export const secondProject: Project = {
  id: "praktika-1",
  organizationId: "praktika",
  name: "Правовое заключение",
  visibility: "personal",
  status: "active",
  role: "owner",
  memberCount: 1,
  createdAt: "2026-10-27T10:00:00",
  updatedAt: "2026-10-27T10:00:00",
}
export const departingPersonalProject: Project = {
  id: "alex-personal", organizationId: "vector", ownerUserId: "alex", name: "Личные рабочие заметки",
  visibility: "personal", status: "active", role: "owner", memberCount: 1,
  createdAt: "2026-10-27T10:00:00", updatedAt: "2026-10-27T10:00:00",
}
export function seedProjectMembers(
  projects: Project[],
): Record<string, ProjectMember[]> {
  return Object.fromEntries(
    projects.map((p) => {
      if (p.visibility === "personal")
        return [p.id, [{ userId: p.ownerUserId ?? "elena", role: "owner" }]]
      const others = ["alex", "daria", "marina", "nikita", "anna", "pavel"]
        .slice(0, Math.max(1, p.memberCount - 1))
        .map((userId, i) => ({
          userId,
          role:
            p.role !== "owner" && i === 0
              ? "owner" as const
              : userId === "daria"
                ? "viewer" as const
                : "editor" as const,
        }))
      return [p.id, [{ userId: "elena", role: p.role }, ...others]]
    }),
  )
}
export const initials = (name: string) =>
  name
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
export const orgRoleLabel: Record<OrgRole, string> = {
  owner: "Owner организации",
  admin: "Org Admin",
  member: "Сотрудник",
}
export const projectRoleLabel: Record<Role, string> = {
  owner: "Владелец",
  editor: "Редактор",
  viewer: "Просмотр",
}
