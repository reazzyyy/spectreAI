"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createInvitation,
  invitationsListQueryOptions,
  resendInvitation,
  revokeInvitation,
  type Invitation,
  type InvitableRole,
} from "@/entities/invitation";
import { orgMembersListQueryOptions } from "@/entities/org-member";
import { sessionMeQueryOptions } from "@/entities/session";
import { ChangeOrgMemberRole } from "@/features/change-org-member-role";
import { isApiError } from "@/shared/api";
import { displayNameFromEmail, orgRoleLabel } from "@/shared/lib";
import {
  Avatar,
  Badge,
  Button,
  Dialog,
  Icon,
  Page,
  PageHead,
  SearchField,
  Select,
  TextAction,
} from "@/shared/ui";
import styles from "./organization-invites.module.scss";

function invitationStatus(invitation: Invitation): {
  label: string;
  tone: "success" | "info" | "warning" | "neutral";
  actionable: boolean;
} {
  if (invitation.acceptedAt) {
    return { label: "Принято", tone: "success", actionable: false };
  }
  if (invitation.revokedAt) {
    return { label: "Отозвано", tone: "warning", actionable: false };
  }
  const expired = new Date(invitation.expiresAt).getTime() < Date.now();
  if (expired) {
    return { label: "Истекло", tone: "warning", actionable: false };
  }
  return { label: "Ожидает принятия", tone: "info", actionable: true };
}

function invitationHint(invitation: Invitation): string {
  if (invitation.acceptedAt) {
    return "Членство принято; TEAM-доступ назначается отдельно";
  }
  if (invitation.revokedAt) {
    return "Приглашение отозвано";
  }
  if (new Date(invitation.expiresAt).getTime() < Date.now()) {
    return "Срок приглашения истёк";
  }
  return "Приглашение в Organization, не в проект";
}

/**
 * Make Organization page: boundary banner, staff directory, owner invitations.
 * Admin grant / offboard / TEAM admin list — not in current API slice.
 */
export function OrganizationInvites() {
  const queryClient = useQueryClient();
  const sessionQuery = useQuery(sessionMeQueryOptions);
  const organizationId = sessionQuery.data?.organization.id ?? "";
  const sessionUserId = sessionQuery.data?.user.id ?? "";
  const orgRole = (sessionQuery.data?.organization.role ?? "").toLowerCase();
  const isOwner = orgRole === "owner";

  const membersQuery = useQuery({
    ...orgMembersListQueryOptions(organizationId),
    enabled: organizationId.length > 0,
  });
  const invitesQuery = useQuery({
    ...invitationsListQueryOptions(organizationId),
    enabled: isOwner && organizationId.length > 0,
  });

  const [query, setQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitableRole>("member");
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);

  const staff = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (membersQuery.data?.items ?? []).filter((m) => {
      if (!q) return true;
      return (
        m.email.toLowerCase().includes(q) ||
        displayNameFromEmail(m.email).toLowerCase().includes(q)
      );
    });
  }, [membersQuery.data?.items, query]);

  async function invalidateInvites() {
    await queryClient.invalidateQueries({
      queryKey: invitationsListQueryOptions(organizationId).queryKey,
    });
  }

  const createMut = useMutation({
    mutationFn: () =>
      createInvitation(organizationId, {
        email: email.trim().toLowerCase(),
        role,
      }),
    onSuccess: async (invitation) => {
      setFormError(null);
      setDevToken(invitation.devToken ?? null);
      setNotice(
        "Приглашение создано на 7 дней. Реальное письмо не отправлено.",
      );
      setEmail("");
      setRole("member");
      setInviteOpen(false);
      await invalidateInvites();
    },
  });

  const resendMut = useMutation({
    mutationFn: (invitationId: string) =>
      resendInvitation(organizationId, invitationId),
    onSuccess: async (updated) => {
      setDevToken(updated.devToken ?? null);
      setNotice(
        "Создана новая ссылка на 7 дней. Предыдущая ссылка отозвана.",
      );
      await invalidateInvites();
    },
  });

  const revokeMut = useMutation({
    mutationFn: (invitationId: string) =>
      revokeInvitation(organizationId, invitationId),
    onSuccess: async () => {
      setRevokeId(null);
      setNotice("Приглашение отозвано.");
      await invalidateInvites();
    },
  });

  const inviteBusy = createMut.isPending;
  const actionsBusy = resendMut.isPending || revokeMut.isPending;

  async function onCreateInvite() {
    setFormError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormError("Укажите корректный email.");
      return;
    }
    try {
      await createMut.mutateAsync();
    } catch (err) {
      if (isApiError(err) && err.status === 404) {
        setFormError("Приглашения доступны только владельцу организации.");
      } else if (isApiError(err) && err.code === "VALIDATION_ERROR") {
        setFormError(
          "Сотрудник уже в организации либо для этого email есть действующее приглашение.",
        );
      } else {
        setFormError(
          "Не удалось подготовить приглашение. Повторите попытку.",
        );
      }
    }
  }

  if (sessionQuery.isPending) {
    return (
      <Page width="wide">
        <p className={styles.status} role="status">
          Загрузка сессии…
        </p>
      </Page>
    );
  }

  return (
    <Page width="wide">
      <PageHead
        eyebrow="Организация · отдельно от проектов"
        title="Организация"
        description="Сотрудники и приглашения"
        actions={<Badge tone="info">{orgRoleLabel(orgRole)}</Badge>}
      />

      <div className={styles.boundary}>
        <Icon name="lock" size={20} />
        <div className={styles.boundaryBody}>
          <strong>Администрирование не равно чтению материалов</strong>
          <p>
            Доступ в TEAM назначается отдельно. Ни Owner организации, ни Org
            Admin не получают автоматический доступ к документам и личным чатам.
          </p>
        </div>
      </div>

      {notice ? (
        <p className={styles.success} role="status">
          {notice}
          {devToken ? (
            <span className={styles.devLink}>
              {" "}
              <Link
                href={`/invite/accept?token=${encodeURIComponent(devToken)}`}
              >
                Открыть страницу принятия
              </Link>
            </span>
          ) : null}
        </p>
      ) : null}

      <section className={styles.section} aria-labelledby="org-staff-title">
        <div className={styles.sectionRow}>
          <h2 id="org-staff-title">
            Сотрудники
            <span className={styles.count}>{staff.length}</span>
          </h2>
          <Button
            type="button"
            variant="primary"
            icon="plus"
            disabled={!isOwner}
            title={
              isOwner
                ? undefined
                : "Приглашения отправляет Owner организации"
            }
            onClick={() => {
              setFormError(null);
              setInviteOpen(true);
            }}
          >
            Пригласить сотрудника
          </Button>
        </div>

        <SearchField
          className={styles.search}
          aria-label="Поиск сотрудников организации"
          placeholder="Имя или рабочий email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {membersQuery.isPending ? (
          <p className={styles.status} role="status">
            Загрузка сотрудников…
          </p>
        ) : null}

        {membersQuery.isError ? (
          <p className={styles.error} role="alert">
            {isApiError(membersQuery.error) &&
            membersQuery.error.status === 401
              ? "Сессия истекла. Войдите снова."
              : isApiError(membersQuery.error) &&
                  membersQuery.error.status === 404
                ? "Нет доступа к составу организации."
                : "Не удалось загрузить сотрудников."}
          </p>
        ) : null}

        <div className={styles.people}>
          {staff.map((member) => {
            const active = member.status === "active";
            return (
              <div className={styles.person} key={member.userId}>
                <Avatar label={member.email} />
                <div className={styles.personMeta}>
                  <strong>
                    {displayNameFromEmail(member.email)}
                    {member.userId === sessionUserId ? (
                      <span className={styles.you}> · вы</span>
                    ) : null}
                  </strong>
                  <small>{member.email}</small>
                </div>
                <Badge className={styles.roleBadge}>
                  {orgRoleLabel(member.role)}
                </Badge>
                <span className={styles.state}>
                  <i
                    className={`${styles.stateDot} ${active ? "" : styles.stateDotMuted}`}
                    aria-hidden
                  />
                  {active ? "Активен" : "Отозван"}
                </span>
                {isOwner ? (
                  <div className={styles.controls}>
                    {member.role === "owner" ? (
                      <small className={styles.controlsHint}>
                        Организационная роль — отдельный процесс
                      </small>
                    ) : (
                      <ChangeOrgMemberRole
                        organizationId={organizationId}
                        member={member}
                      />
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        {!membersQuery.isPending && staff.length === 0 ? (
          <p className={styles.note}>По запросу нет сотрудников.</p>
        ) : null}
      </section>

      {isOwner ? (
        <section className={styles.section} aria-labelledby="org-invites-title">
          <div className={styles.sectionRow}>
            <h2 id="org-invites-title">
              Приглашения
              <span className={styles.count}>
                {invitesQuery.data?.items.length ?? 0}
              </span>
            </h2>
            <small className={styles.sectionHint}>Срок — 7 дней</small>
          </div>

          {invitesQuery.isPending ? (
            <p className={styles.status} role="status">
              Загрузка приглашений…
            </p>
          ) : null}

          {invitesQuery.isError ? (
            <p className={styles.error} role="alert">
              {isApiError(invitesQuery.error) &&
              invitesQuery.error.status === 401
                ? "Сессия истекла. Войдите снова."
                : isApiError(invitesQuery.error) &&
                    invitesQuery.error.status === 404
                  ? "Нет доступа к приглашениям этой организации."
                  : "Не удалось загрузить список приглашений."}
            </p>
          ) : null}

          <div className={styles.inviteTable}>
            {(invitesQuery.data?.items ?? []).map((invitation) => {
              const status = invitationStatus(invitation);
              return (
                <div className={styles.inviteRow} key={invitation.id}>
                  <div className={styles.inviteMain}>
                    <strong>{invitation.emailNormalized}</strong>
                    <small>{invitationHint(invitation)}</small>
                  </div>
                  <Badge tone={status.tone} className={styles.inviteBadge}>
                    {status.label}
                  </Badge>
                  <div className={styles.actions}>
                    {status.actionable ? (
                      <>
                        <TextAction
                          danger
                          disabled={actionsBusy}
                          onClick={() => setRevokeId(invitation.id)}
                        >
                          Отозвать
                        </TextAction>
                        <TextAction
                          disabled={actionsBusy}
                          onClick={() => resendMut.mutate(invitation.id)}
                        >
                          Выдать заново
                        </TextAction>
                      </>
                    ) : null}
                    {!status.actionable && !invitation.acceptedAt ? (
                      <TextAction
                        disabled={actionsBusy}
                        onClick={() => resendMut.mutate(invitation.id)}
                      >
                        Выдать заново
                      </TextAction>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          {invitesQuery.data && invitesQuery.data.items.length === 0 ? (
            <p className={styles.note}>Нет приглашений.</p>
          ) : null}
          {resendMut.isError ? (
            <p className={styles.error} role="alert">
              Не удалось повторно выдать приглашение.
            </p>
          ) : null}
        </section>
      ) : (
        <p className={styles.note} role="status">
          Приглашать и менять роли может только Owner организации. Ваша роль:{" "}
          {orgRoleLabel(orgRole)}.
        </p>
      )}

      <Dialog
        title="Пригласить сотрудника"
        open={inviteOpen}
        onClose={() => {
          if (!inviteBusy) setInviteOpen(false);
        }}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={inviteBusy}
              onClick={() => setInviteOpen(false)}
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={inviteBusy || !isOwner}
              onClick={() => void onCreateInvite()}
            >
              {inviteBusy ? "Подготавливаем…" : "Создать приглашение"}
            </Button>
          </>
        }
      >
        <p className={styles.muted}>Организация</p>
        <div className={styles.dialogField}>
          <label htmlFor="org-invite-email">Рабочий email</label>
          <input
            id="org-invite-email"
            data-autofocus
            type="email"
            aria-label="Email приглашения"
            value={email}
            disabled={inviteBusy}
            placeholder="name@example.test"
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Select
          id="org-invite-role"
          label="Роль в организации"
          className={styles.dialogField}
          value={role}
          disabled={inviteBusy}
          onChange={(e) => setRole(e.target.value as InvitableRole)}
        >
          <option value="member">Сотрудник</option>
          <option value="admin">Администратор</option>
        </Select>
        <p className={styles.dialogNotice}>
          Приглашение действует 7 дней. После принятия сотрудник станет членом
          организации, но не получит доступ ко всем проектам. Роль в TEAM
          назначается отдельно.
        </p>
        <p className={styles.dialogHelp}>
          В scaffold письмо не отправляется. После создания доступна страница
          принятия по dev-токену.
        </p>
        {formError ? (
          <p className={styles.error} role="alert">
            {formError}
          </p>
        ) : null}
      </Dialog>

      <Dialog
        title="Отозвать приглашение?"
        open={Boolean(revokeId)}
        onClose={() => {
          if (!revokeMut.isPending) setRevokeId(null);
        }}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={revokeMut.isPending}
              onClick={() => setRevokeId(null)}
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={revokeMut.isPending || !revokeId}
              onClick={() => {
                if (revokeId) revokeMut.mutate(revokeId);
              }}
            >
              Отозвать приглашение
            </Button>
          </>
        }
      >
        <p className={styles.dialogHelp}>
          Старая ссылка больше не позволит принять членство. Это не увольнение
          уже принятого сотрудника и не удаление материалов.
        </p>
        {revokeMut.isError ? (
          <p className={styles.error} role="alert">
            Не удалось отозвать приглашение.
          </p>
        ) : null}
      </Dialog>
    </Page>
  );
}
