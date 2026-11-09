"use client";

import { useQuery } from "@tanstack/react-query";
import { invitationsListQueryOptions, type Invitation } from "@/entities/invitation";
import { orgMembersListQueryOptions } from "@/entities/org-member";
import { sessionMeQueryOptions } from "@/entities/session";
import { CreateInvitationForm } from "@/features/create-invitation";
import { InvitationActions } from "@/features/manage-invitations";
import { isApiError } from "@/shared/api";
import styles from "./organization-invites.module.scss";

function invitationStatusLabel(invitation: Invitation): string {
  if (invitation.acceptedAt) return "принято";
  if (invitation.revokedAt) return "отозвано";
  if (new Date(invitation.expiresAt).getTime() < Date.now()) return "истекло";
  return "ожидает";
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

/**
 * Organization page: member directory (SEC-01) for any org member;
 * invitations manage for Owner only (S4c).
 */
export function OrganizationInvites() {
  const sessionQuery = useQuery(sessionMeQueryOptions);
  const organizationId = sessionQuery.data?.organization.id ?? "";
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

  if (sessionQuery.isPending) {
    return (
      <div className={styles.page}>
        <p className={styles.status} role="status">
          Загрузка сессии…
        </p>
      </div>
    );
  }

  const { data, error, isPending, isError, isFetching } = invitesQuery;

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div>
          <h1>Организация</h1>
          <p className={styles.lead}>
            Состав организации (SEC-01). Приглашения создаёт только владелец
            (owner).
          </p>
        </div>
      </div>

      <section aria-labelledby="org-members-title" className={styles.membersBlock}>
        <h2 id="org-members-title" className={styles.sectionTitle}>
          Сотрудники
          {membersQuery.isFetching && !membersQuery.isPending ? (
            <span className={styles.status}> · обновление…</span>
          ) : null}
        </h2>

        {membersQuery.isPending ? (
          <p className={styles.status} role="status">
            Загрузка сотрудников…
          </p>
        ) : null}

        {membersQuery.isError ? (
          <p className={styles.error} role="alert">
            {isApiError(membersQuery.error) && membersQuery.error.status === 401
              ? "Сессия истекла. Войдите снова."
              : isApiError(membersQuery.error) && membersQuery.error.status === 404
                ? "Нет доступа к составу организации."
                : "Не удалось загрузить сотрудников."}
          </p>
        ) : null}

        {membersQuery.data && membersQuery.data.items.length === 0 ? (
          <div className={styles.empty}>Пока нет сотрудников.</div>
        ) : null}

        {membersQuery.data && membersQuery.data.items.length > 0 ? (
          <ul className={styles.list}>
            {membersQuery.data.items.map((member) => (
              <li key={member.userId} className={styles.item}>
                <div className={styles.itemMain}>
                  <p className={styles.itemEmail}>{member.email}</p>
                  <div className={styles.meta}>
                    <span>{member.role}</span>
                    <span>{member.status}</span>
                    <span className={styles.userId} title={member.userId}>
                      {member.userId}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {!isOwner ? (
        <p className={styles.notice} role="status">
          Ваша роль: {sessionQuery.data?.organization.role ?? "—"}. Приглашать
          новых сотрудников может только owner.
        </p>
      ) : (
        <div className={styles.layout}>
          <section aria-labelledby="invite-list-title">
            <h2 id="invite-list-title" className={styles.sectionTitle}>
              Приглашения
              {isFetching && !isPending ? (
                <span className={styles.status}> · обновление…</span>
              ) : null}
            </h2>

            {isPending ? (
              <p className={styles.status} role="status">
                Загрузка приглашений…
              </p>
            ) : null}

            {isError ? (
              <p className={styles.error} role="alert">
                {isApiError(error) && error.status === 401
                  ? "Сессия истекла. Войдите снова."
                  : isApiError(error) && error.status === 404
                    ? "Нет доступа к приглашениям этой организации."
                    : "Не удалось загрузить список приглашений."}
              </p>
            ) : null}

            {data && data.items.length === 0 ? (
              <div className={styles.empty}>
                Пока нет приглашений. Создайте справа.
              </div>
            ) : null}

            {data && data.items.length > 0 ? (
              <ul className={styles.list}>
                {data.items.map((invitation) => (
                  <li key={invitation.id} className={styles.item}>
                    <div className={styles.itemMain}>
                      <p className={styles.itemEmail}>
                        {invitation.emailNormalized}
                      </p>
                      <div className={styles.meta}>
                        <span>{invitation.role}</span>
                        <span>{invitationStatusLabel(invitation)}</span>
                        <span>до {formatWhen(invitation.expiresAt)}</span>
                        <span>отправок: {invitation.sendCount}</span>
                      </div>
                    </div>
                    <InvitationActions
                      organizationId={organizationId}
                      invitation={invitation}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section
            className={styles.panel}
            aria-labelledby="invite-create-title"
          >
            <h2 id="invite-create-title" className={styles.sectionTitle}>
              Новое приглашение
            </h2>
            <CreateInvitationForm organizationId={organizationId} />
          </section>
        </div>
      )}
    </div>
  );
}
