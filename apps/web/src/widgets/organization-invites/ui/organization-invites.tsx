"use client";

import { useQuery } from "@tanstack/react-query";
import { invitationsListQueryOptions, type Invitation } from "@/entities/invitation";
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

/** Org Owner: list / create / resend / revoke invitations (S4c UI). */
export function OrganizationInvites() {
  const sessionQuery = useQuery(sessionMeQueryOptions);
  const organizationId = sessionQuery.data?.organization.id ?? "";
  const orgRole = (sessionQuery.data?.organization.role ?? "").toLowerCase();
  const isOwner = orgRole === "owner";

  const listQuery = useQuery({
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

  if (!isOwner) {
    return (
      <div className={styles.page}>
        <div className={styles.head}>
          <div>
            <h1>Организация</h1>
            <p className={styles.lead}>
              Приглашения в организацию может создавать и отзывать только
              владелец (owner).
            </p>
          </div>
        </div>
        <p className={styles.notice} role="status">
          Ваша роль: {sessionQuery.data?.organization.role ?? "—"}. Управление
          участниками и TEAM-проектами — в следующих срезах.
        </p>
      </div>
    );
  }

  const { data, error, isPending, isError, isFetching } = listQuery;

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div>
          <h1>Организация</h1>
          <p className={styles.lead}>
            Приглашения по email (роли admin или member). Письма в MVP не
            отправляются — в development API может вернуть dev-токен.
          </p>
        </div>
      </div>

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

        <section className={styles.panel} aria-labelledby="invite-create-title">
          <h2 id="invite-create-title" className={styles.sectionTitle}>
            Новое приглашение
          </h2>
          <CreateInvitationForm organizationId={organizationId} />
        </section>
      </div>
    </div>
  );
}
