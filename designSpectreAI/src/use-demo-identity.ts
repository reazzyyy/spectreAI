import { useEffect, useRef, useState } from "react"
import type { Project, Role } from "./data/projects"
import {
  DEMO_PASSWORD,
  orgMembersSeed,
  organizations,
  peopleSeed,
  seedProjectMembers,
  type Invitation,
  type OrgMembership,
  type Person,
  type ResetLink,
} from "./data/identity"
import type {
  OwnershipLedger,
  OwnershipOffer,
  LifecycleResult,
} from "./data/ownership"

export function useDemoIdentity(allProjects: Project[]) {
  const [people, setPeople] = useState(peopleSeed)
  const [orgMembers, setOrgMembers] = useState(orgMembersSeed)
  const [projectMembers, setProjectMembers] = useState(() =>
    seedProjectMembers(allProjects),
  )
  const [userId, setUserId] = useState("elena")
  const [orgId, setOrgId] = useState("vector")
  const [session, setSession] =
    useState<"active" | "signed-out" | "expired" | "revoked">(() =>
      /^#\/(login|forgot-password|reset-password|invite)/.test(location.hash)
        ? "signed-out"
        : "active",
    )
  const [invitations, setInvitations] = useState<Invitation[]>([
    {
      id: "invite-irina",
      orgId: "vector",
      email: "irina@example.test",
      status: "pending",
      expiresAt: Date.now() + 7 * 86400000,
    },
    {
      id: "invite-existing",
      orgId: "praktika",
      email: "alex@example.test",
      status: "pending",
      expiresAt: Date.now() + 7 * 86400000,
    },
  ])
  const [resets, setResets] = useState<ResetLink[]>([])
  const [lifecycle, setLifecycle] = useState<OwnershipLedger>({
    offers: [],
    restricted: {},
    departures: [],
  })
  const live = useRef({
    people,
    orgMembers,
    projectMembers,
    invitations,
    resets,
    userId,
    orgId,
    session,
    allProjects,
    lifecycle,
  })
  live.current = {
    people,
    orgMembers,
    projectMembers,
    invitations,
    resets,
    userId,
    orgId,
    session,
    allProjects,
    lifecycle,
  }
  const passwords = useRef<Record<string, string>>(
    Object.fromEntries(peopleSeed.map((p) => [p.id, DEMO_PASSWORD])),
  )
  const user = people.find((p) => p.id === userId) ?? peopleSeed[0]
  const organization = organizations.find((o) => o.id === orgId)!
  const orgRole = orgMembers.find(
    (m) => m.userId === userId && m.orgId === orgId,
  )?.role
  const activeOrganizations = organizations.filter((o) =>
    orgMembers.some((m) => m.userId === userId && m.orgId === o.id),
  )
  const inOrg = (personId: string, organizationId = orgId) =>
    orgMembers.some((m) => m.orgId === organizationId && m.userId === personId)
  const projectOrg = (p: Project) => p.organizationId ?? "vector"
  const isOrgManager =
    session === "active" && (orgRole === "owner" || orgRole === "admin")
  const canManage = (projectId: string) => {
    const state = live.current
    const p = state.allProjects.find((p) => p.id === projectId)
    const membership = state.orgMembers.find(
      (m) => m.userId === state.userId && m.orgId === state.orgId,
    )
    return (
      !!p &&
      state.userId === userId &&
      state.orgId === orgId &&
      state.session === "active" &&
      !!membership &&
      projectOrg(p) === state.orgId &&
      p.visibility === "team" &&
      p.status === "active" &&
      !state.lifecycle.restricted[projectId] &&
      (membership.role === "owner" ||
        membership.role === "admin" ||
        state.projectMembers[projectId]?.some(
          (m) => m.userId === state.userId && m.role === "owner",
        ))
    )
  }
  const projectView = (p: Project): Project =>
    lifecycle.restricted[p.id] && p.status !== "deleting"
      ? {
          ...p,
          previousStatus: p.status === "archived" ? "archived" : "active",
          status: "restricted",
        }
      : p
  const accessibleProjects =
    session !== "active" || !inOrg(userId)
      ? []
      : allProjects.flatMap((p) => {
          const member = projectMembers[p.id]?.find((m) => m.userId === userId)
          return projectOrg(p) === orgId && member
            ? [
                {
                  ...projectView(p),
                  role: member.role,
                  memberCount: projectMembers[p.id].filter((m) =>
                    inOrg(m.userId),
                  ).length,
                },
              ]
            : []
        })
  const activate = (id: string, organizationId?: string) => {
    const membership = orgMembers.find(
      (m) => m.userId === id && (!organizationId || m.orgId === organizationId),
    )
    if (!membership) return false
    setUserId(id)
    setOrgId(membership.orgId)
    setSession("active")
    return true
  }
  type Snapshot = typeof live.current
  const orgMember = (
    actorId: string,
    organizationId: string,
    state: Snapshot = live.current,
  ) =>
    state.orgMembers.find(
      (m) => m.userId === actorId && m.orgId === organizationId,
    )
  const isManager = (
    actorId: string,
    organizationId: string,
    state: Snapshot = live.current,
  ) => {
    const role = orgMember(actorId, organizationId, state)?.role
    return role === "owner" || role === "admin"
  }
  const sameActor = () =>
    live.current.session === "active" &&
    live.current.userId === userId &&
    live.current.orgId === orgId
  const commit = (
    change: Partial<Pick<Snapshot, "projectMembers" | "orgMembers" | "lifecycle">>,
  ) => {
    const next = { ...live.current, ...change }
    live.current = next
    if (change.projectMembers) setProjectMembers(change.projectMembers)
    if (change.orgMembers) setOrgMembers(change.orgMembers)
    if (change.lifecycle) setLifecycle(change.lifecycle)
  }
  useEffect(() => {
    const timer = window.setInterval(() => {
      const state = live.current
      const now = Date.now()
      if (
        !state.lifecycle.offers.some(
          (o) => o.status === "pending" && o.expiresAt <= now,
        )
      )
        return
      const next = {
        ...state.lifecycle,
        offers: state.lifecycle.offers.map((o) =>
          o.status === "pending" && o.expiresAt <= now
            ? {
                ...o,
                status: "expired" as const,
                closedAt: now,
                reason: "Срок предложения истёк.",
              }
            : o,
        ),
      }
      live.current = { ...state, lifecycle: next }
      setLifecycle(next)
    }, 1000)
    return () => clearInterval(timer)
  }, [])
  const canProposeOwnership = (projectId: string) => {
    const state = live.current
    const p = state.allProjects.find((p) => p.id === projectId)
    if (
      !sameActor() ||
      !p ||
      projectOrg(p) !== orgId ||
      p.visibility !== "team" ||
      p.status === "deleting" ||
      !orgMember(userId, orgId)
    )
      return false
    return state.lifecycle.restricted[projectId]
      ? isManager(userId, orgId)
      : p.status === "active" &&
          !!state.projectMembers[projectId]?.some(
            (m) => m.userId === userId && m.role === "owner",
          )
  }
  const ownershipCandidates = (projectId: string) => {
    const state = live.current
    const p = state.allProjects.find((p) => p.id === projectId)
    if (!p || projectOrg(p) !== orgId) return []
    return (state.projectMembers[projectId] ?? [])
      .filter(
        (m) =>
          m.role !== "owner" &&
          m.userId !== userId &&
          !!orgMember(m.userId, orgId),
      )
      .map((m) => ({
        ...m,
        person: state.people.find((p) => p.id === m.userId)!,
      }))
      .filter((m) => m.person)
  }
  const proposeOwnership = (
    projectId: string,
    toId: string,
  ): LifecycleResult => {
    const state = live.current
    if (
      !canProposeOwnership(projectId) ||
      !ownershipCandidates(projectId).some((m) => m.userId === toId)
    )
      return {
        ok: false,
        message:
          "Нет полномочий или получатель больше не является допустимым участником проекта.",
      }
    if (
      state.lifecycle.offers.some(
        (o) =>
          o.projectId === projectId &&
          o.status === "pending" &&
          o.expiresAt > Date.now(),
      )
    )
      return {
        ok: false,
        message:
          "В проекте уже есть ожидающее предложение. Сначала отзовите его или дождитесь решения.",
      }
    const owner = state.projectMembers[projectId]?.find(
      (m) => m.role === "owner",
    )
    const recovery = !!state.lifecycle.restricted[projectId]
    const offer: OwnershipOffer = {
      id: crypto.randomUUID(),
      orgId,
      projectId,
      mode: recovery ? "recovery" : "handover",
      fromId: recovery
        ? state.lifecycle.restricted[projectId].formerOwnerId
        : owner?.userId,
      toId,
      createdById: userId,
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 86400000,
      status: "pending",
    }
    commit({
      lifecycle: {
        ...state.lifecycle,
        offers: [
          offer,
          ...state.lifecycle.offers.map((o) =>
            o.status === "pending" && o.expiresAt <= Date.now()
              ? {
                  ...o,
                  status: "expired" as const,
                  closedAt: Date.now(),
                  reason: "Срок предложения истёк.",
                }
              : o,
          ),
        ],
      },
    })
    return {
      ok: true,
      message: recovery
        ? "Преемнику отправлено предложение. До принятия TEAM остаётся ограниченным."
        : "Предложение отправлено на 7 дней. До принятия текущий OWNER не меняется.",
    }
  }
  const respondOwnership = (
    offerId: string,
    action: "accept" | "decline" | "cancel",
  ): LifecycleResult => {
    const state = live.current
    const offer = state.lifecycle.offers.find((o) => o.id === offerId)
    if (
      !sameActor() ||
      !offer ||
      offer.orgId !== orgId ||
      offer.status !== "pending"
    )
      return {
        ok: false,
        message:
          "Предложение уже закрыто или действие недоступно. Роли не изменены.",
      }
    if (offer.expiresAt <= Date.now()) {
      commit({
        lifecycle: {
          ...state.lifecycle,
          offers: state.lifecycle.offers.map((o) =>
            o.id === offerId
              ? {
                  ...o,
                  status: "expired",
                  closedAt: Date.now(),
                  reason: "Срок предложения истёк.",
                }
              : o,
          ),
        },
      })
      return {
        ok: false,
        message: "Срок предложения истёк. Требуется новое предложение.",
      }
    }
    const p = state.allProjects.find((p) => p.id === offer.projectId)
    const members = state.projectMembers[offer.projectId] ?? []
    const target = members.find(
      (m) => m.userId === offer.toId && m.role !== "owner",
    )
    const owners = members.filter((m) => m.role === "owner")
    const valid =
      p &&
      p.visibility === "team" &&
      p.status !== "deleting" &&
      orgMember(offer.toId, offer.orgId) &&
      target &&
      (offer.mode === "recovery"
        ? !!state.lifecycle.restricted[offer.projectId] &&
          owners.length === 0 &&
          isManager(offer.createdById, offer.orgId)
        : p.status === "active" &&
          !state.lifecycle.restricted[offer.projectId] &&
          owners.length === 1 &&
          owners[0].userId === offer.fromId &&
          !!orgMember(offer.fromId!, offer.orgId))
    if (!valid) {
      commit({
        lifecycle: {
          ...state.lifecycle,
          offers: state.lifecycle.offers.map((o) =>
            o.id === offerId
              ? {
                  ...o,
                  status: "invalidated",
                  closedAt: Date.now(),
                  reason:
                    "Членство или владение изменилось; требуется новое предложение.",
                }
              : o,
          ),
        },
      })
      return {
        ok: false,
        message:
          "Предложение аннулировано: изменились условия доступа. Роли не изменены.",
      }
    }
    if (
      action === "cancel"
        ? offer.createdById !== userId || !canProposeOwnership(offer.projectId)
        : offer.toId !== userId
    )
      return {
        ok: false,
        message:
          "Решение может принять только получатель, отзыв — действующий отправитель.",
      }
    const status =
      action === "accept"
        ? "accepted"
        : action === "decline"
          ? "declined"
          : "cancelled"
    const nextLedger: OwnershipLedger = {
      ...state.lifecycle,
      restricted: { ...state.lifecycle.restricted },
      offers: state.lifecycle.offers.map((o) =>
        o.id === offerId ? { ...o, status, closedAt: Date.now() } : o,
      ),
    }
    if (action === "accept") {
      const nextMembers = members.map((m) =>
        m.userId === offer.toId
          ? { ...m, role: "owner" as const }
          : m.role === "owner"
            ? { ...m, role: "viewer" as const }
            : m,
      )
      delete nextLedger.restricted[offer.projectId]
      commit({
        projectMembers: {
          ...state.projectMembers,
          [offer.projectId]: nextMembers,
        },
        lifecycle: nextLedger,
      })
    } else commit({ lifecycle: nextLedger })
    return {
      ok: true,
      message:
        action === "accept"
          ? offer.mode === "recovery"
            ? "Преемник принял владение. Исходный режим проекта восстановлен; уволенный сотрудник не получил доступ обратно."
            : "Владение передано. Прежний OWNER теперь VIEWER; PRIVATE-чаты не раскрыты."
          : action === "decline"
            ? "Предложение отклонено. Владение и доступы не изменены."
            : "Предложение отозвано. Владение и доступы не изменены.",
    }
  }
  const offboardImpact = (targetId: string) => {
    const state = live.current
    const projects = state.allProjects.filter(
      (p) =>
        projectOrg(p) === orgId &&
        state.projectMembers[p.id]?.some((m) => m.userId === targetId),
    )
    return {
      teamCount: projects.filter((p) => p.visibility === "team").length,
      personalCount: projects.filter((p) => p.visibility === "personal").length,
      ownedTeamIds: projects
        .filter(
          (p) =>
            p.visibility === "team" &&
            p.status !== "deleting" &&
            state.projectMembers[p.id].some(
              (m) => m.userId === targetId && m.role === "owner",
            ),
        )
        .map((p) => p.id),
      cancelledOffers: state.lifecycle.offers.filter(
        (o) =>
          o.orgId === orgId &&
          o.status === "pending" &&
          [o.toId, o.fromId, o.createdById].includes(targetId),
      ).length,
    }
  }
  const offboard = (targetId: string, demoRemote = false): LifecycleResult => {
    const state = live.current
    const target = orgMember(targetId, orgId)
    const remoteAdmin = state.orgMembers.find(
      (m) => m.orgId === orgId && m.role === "admin" && m.userId !== targetId,
    )
    const operatorId = demoRemote ? remoteAdmin?.userId : userId
    if (
      !sameActor() ||
      !target ||
      target.role !== "member" ||
      !operatorId ||
      !isManager(operatorId, orgId) ||
      (demoRemote ? targetId !== userId : targetId === userId)
    )
      return {
        ok: false,
        message:
          "Отзыв недоступен. Изменение организационных Owner/Admin находится за пределами этого workflow.",
      }
    const impact = offboardImpact(targetId)
    const restricted = { ...state.lifecycle.restricted }
    impact.ownedTeamIds.forEach((projectId) => {
      restricted[projectId] = { formerOwnerId: targetId, since: Date.now() }
    })
    const offers = state.lifecycle.offers.map((o) =>
      o.orgId === orgId &&
      o.status === "pending" &&
      [o.toId, o.fromId, o.createdById].includes(targetId)
        ? {
            ...o,
            status: "invalidated" as const,
            closedAt: Date.now(),
            reason: "Членство стороны в организации прекращено.",
          }
        : o,
    )
    const nextMembers = { ...state.projectMembers }
    state.allProjects
      .filter((p) => projectOrg(p) === orgId)
      .forEach((p) => {
        nextMembers[p.id] = (nextMembers[p.id] ?? []).filter(
          (m) => m.userId !== targetId,
        )
      })
    commit({
      orgMembers: state.orgMembers.filter(
        (m) => !(m.orgId === orgId && m.userId === targetId),
      ),
      projectMembers: nextMembers,
      lifecycle: {
        restricted,
        offers,
        departures: [
          {
            id: crypto.randomUUID(),
            orgId,
            userId: targetId,
            byId: operatorId,
            at: Date.now(),
            ...impact,
          },
          ...state.lifecycle.departures,
        ],
      },
    })
    if (targetId === userId) setSession("revoked")
    return {
      ok: true,
      message: `Доступ сотрудника прекращён. Ограничено TEAM: ${impact.ownedTeamIds.length}. Ожидающие передачи аннулированы, материалы не удалены.`,
    }
  }
  return {
    user,
    userId,
    orgId,
    orgRole,
    organization,
    people,
    orgMembers,
    projectMembers,
    invitations,
    resets,
    session,
    activeOrganizations,
    accessibleProjects,
    accessProjectMetadata: allProjects
      .filter((p) => p.visibility === "team")
      .map((p) => ({ id: p.id, orgId: projectOrg(p), status: p.status })),
    isOrgManager,
    canManage,
    inOrg,
    lifecycle,
    canProposeOwnership,
    ownershipCandidates,
    proposeOwnership,
    acceptOwnership: (offerId: string) => respondOwnership(offerId, "accept"),
    declineOwnership: (offerId: string) => respondOwnership(offerId, "decline"),
    cancelOwnership: (offerId: string) => respondOwnership(offerId, "cancel"),
    expireOwnership: (offerId: string) => {
      const state = live.current
      if (!sameActor()) return
      commit({
        lifecycle: {
          ...state.lifecycle,
          offers: state.lifecycle.offers.map((o) =>
            o.id === offerId && o.orgId === orgId && o.status === "pending"
              ? {
                  ...o,
                  status: "expired",
                  expiresAt: 0,
                  closedAt: Date.now(),
                  reason: "Срок предложения истёк (демо).",
                }
              : o,
          ),
        },
      })
    },
    offboardImpact,
    offboardMember: (targetId: string) => offboard(targetId),
    demoRevokeCurrentMembership: () => offboard(userId, true),
    adminProjects: isOrgManager
      ? allProjects
          .filter((p) => projectOrg(p) === orgId && p.visibility === "team")
          .map(projectView)
      : [],
    canActorEdit: (projectId: string, actorId: string) => {
      const p = allProjects.find((p) => p.id === projectId)
      return (
        !!p &&
        p.status === "active" &&
        !lifecycle.restricted[projectId] &&
        inOrg(actorId, projectOrg(p)) &&
        !!projectMembers[projectId]?.some(
          (m) => m.userId === actorId && m.role !== "viewer",
        )
      )
    },
    activate,
    endSession: (reason: "signed-out" | "expired" | "revoked") =>
      setSession(reason),
    switchOrg: (id: string) => {
      if (session === "active" && inOrg(userId, id)) setOrgId(id)
    },
    authenticate: (email: string, password: string) => {
      const person = people.find(
        (p) => p.email.toLowerCase() === email.trim().toLowerCase(),
      )
      return person &&
        passwords.current[person.id] === password &&
        orgMembers.some((m) => m.userId === person.id)
        ? person.id
        : undefined
    },
    requestReset: (email: string) => {
      const id = crypto.randomUUID()
      setResets((all) => [
        ...all,
        {
          id,
          email: email.trim().toLowerCase(),
          expiresAt: Date.now() + 3600000,
          used: false,
        },
      ])
      return id
    },
    completeReset: (id: string, password: string) => {
      const reset = live.current.resets.find(
        (r) => r.id === id && !r.used && r.expiresAt > Date.now(),
      )
      if (!reset) return false
      const person = live.current.people.find(
        (p) => p.email.toLowerCase() === reset.email,
      )
      if (person) passwords.current[person.id] = password
      setResets((all) =>
        all.map((r) => (r.id === id ? { ...r, used: true } : r)),
      )
      return true
    },
    expireReset: (id: string) =>
      setResets((all) =>
        all.map((r) => (r.id === id ? { ...r, expiresAt: 0 } : r)),
      ),
    acceptInvitation: (
      id: string,
      name: string,
      password: string,
      existingId?: string,
    ) => {
      const invite = live.current.invitations.find(
        (i) =>
          i.id === id && i.status === "pending" && i.expiresAt > Date.now(),
      )
      if (!invite) return undefined
      const known = live.current.people.find(
        (p) => p.email.toLowerCase() === invite.email,
      )
      if (known && existingId !== known.id) return undefined
      const person: Person = known ?? {
        id: crypto.randomUUID(),
        email: invite.email,
        name: name.trim(),
      }
      if (!known && !name.trim()) return undefined
      if (!known) {
        setPeople((all) => [...all, person])
        passwords.current[person.id] = password
      }
      const membership: OrgMembership = {
        userId: person.id,
        orgId: invite.orgId,
        role: "member",
      }
      setOrgMembers((all) =>
        all.some((m) => m.orgId === invite.orgId && m.userId === person.id)
          ? all
          : [...all, membership],
      )
      setInvitations((all) =>
        all.map((i) => (i.id === id ? { ...i, status: "accepted" } : i)),
      )
      setUserId(person.id)
      setOrgId(invite.orgId)
      setSession("active")
      return person.id
    },
    requestInvitation: (id: string) =>
      setInvitations((all) =>
        all.map((i) => (i.id === id ? { ...i, requested: true } : i)),
      ),
    invite: (email: string) => {
      if (
        live.current.session !== "active" ||
        live.current.userId !== userId ||
        live.current.orgId !== orgId ||
        orgRole !== "owner"
      )
        return undefined
      const address = email.trim().toLowerCase()
      if (
        people.some((p) => p.email.toLowerCase() === address && inOrg(p.id)) ||
        invitations.some(
          (i) =>
            i.orgId === orgId &&
            i.email === address &&
            i.status === "pending" &&
            i.expiresAt > Date.now(),
        )
      )
        return undefined
      const id = crypto.randomUUID()
      setInvitations((all) => [
        {
          id,
          orgId,
          email: address,
          status: "pending",
          expiresAt: Date.now() + 7 * 86400000,
        },
        ...all,
      ])
      return id
    },
    revokeInvitation: (id: string) => {
      if (session === "active" && orgRole === "owner")
        setInvitations((all) =>
          all.map((i) =>
            i.id === id && i.orgId === orgId && i.status === "pending"
              ? { ...i, status: "revoked" }
              : i,
          ),
        )
    },
    resendInvitation: (id: string) => {
      const old = invitations.find(
        (i) => i.id === id && i.orgId === orgId && i.status !== "accepted",
      )
      if (!old || session !== "active" || orgRole !== "owner") return undefined
      if (people.some((p) => p.email === old.email && inOrg(p.id)))
        return undefined
      const next = crypto.randomUUID()
      setInvitations((all) => [
        {
          ...old,
          id: next,
          requested: false,
          status: "pending",
          expiresAt: Date.now() + 7 * 86400000,
        },
        ...all.map((i) =>
          i.orgId === old.orgId &&
          i.email === old.email &&
          i.status === "pending"
            ? { ...i, status: "revoked" as const }
            : i,
        ),
      ])
      return next
    },
    expireInvitation: (id: string) =>
      setInvitations((all) =>
        all.map((i) => (i.id === id ? { ...i, expiresAt: 0 } : i)),
      ),
    assignMember: (
      projectId: string,
      targetId: string,
      role: Exclude<Role, "owner">,
    ) => {
      if (
        !canManage(projectId) ||
        !orgMember(targetId, orgId) ||
        targetId === userId ||
        live.current.projectMembers[projectId]?.some(
          (m) => m.userId === targetId,
        )
      )
        return false
      commit({
        projectMembers: {
          ...live.current.projectMembers,
          [projectId]: [
            ...(live.current.projectMembers[projectId] ?? []),
            { userId: targetId, role },
          ],
        },
      })
      return true
    },
    changeMember: (
      projectId: string,
      targetId: string,
      role: Exclude<Role, "owner">,
    ) => {
      const target = live.current.projectMembers[projectId]?.find(
        (m) => m.userId === targetId,
      )
      if (
        !canManage(projectId) ||
        !target ||
        target.role === "owner" ||
        targetId === userId ||
        !orgMember(targetId, orgId)
      )
        return false
      commit({
        projectMembers: {
          ...live.current.projectMembers,
          [projectId]: live.current.projectMembers[projectId].map((m) =>
            m.userId === targetId ? { ...m, role } : m,
          ),
        },
      })
      return true
    },
    removeMember: (projectId: string, targetId: string) => {
      const target = live.current.projectMembers[projectId]?.find(
        (m) => m.userId === targetId,
      )
      if (
        !canManage(projectId) ||
        !target ||
        target.role === "owner" ||
        targetId === userId
      )
        return false
      const state = live.current
      commit({
        projectMembers: {
          ...state.projectMembers,
          [projectId]: state.projectMembers[projectId].filter(
            (m) => m.userId !== targetId,
          ),
        },
        lifecycle: {
          ...state.lifecycle,
          offers: state.lifecycle.offers.map((o) =>
            o.projectId === projectId &&
            o.status === "pending" &&
            [o.fromId, o.toId].includes(targetId)
              ? {
                  ...o,
                  status: "invalidated",
                  closedAt: Date.now(),
                  reason: "Участник больше не имеет доступа к проекту.",
                }
              : o,
          ),
        },
      })
      return true
    },
    registerProject: (projectId: string) =>
      setProjectMembers((all) => ({
        ...all,
        [projectId]: [{ userId, role: "owner" }],
      })),
  }
}
export type DemoIdentity = ReturnType<typeof useDemoIdentity>
