"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orgMembersListQueryOptions } from "@/entities/org-member";
import { sessionMeQueryOptions } from "@/entities/session";
import {
  revokeWorkspaceMember,
  upsertWorkspaceMember,
  workspaceMembersQueryOptions,
  type WorkspaceMemberRole,
  type WorkspaceVisibility,
} from "@/entities/workspace";
import { isApiError } from "@/shared/api";
import { Button } from "@/shared/ui";
import styles from "./workspace-members-panel.module.scss";

export interface WorkspaceMembersPanelProps {
  workspaceId: string;
  visibility: WorkspaceVisibility;
  ownerUserId: string;
}

/**
 * Workspace members (W-006/W-008). Add/revoke only for TEAM; PERSONAL shows notice.
 * Candidates come from org directory (SEC-01 / F5j).
 */
export function WorkspaceMembersPanel({
  workspaceId,
  visibility,
  ownerUserId,
}: WorkspaceMembersPanelProps) {
  const queryClient = useQueryClient();
  const isTeam = visibility === "TEAM";
  const sessionQuery = useQuery(sessionMeQueryOptions);
  const organizationId = sessionQuery.data?.organization.id ?? "";

  const membersQuery = useQuery({
    ...workspaceMembersQueryOptions(workspaceId),
    enabled: isTeam,
  });
  const orgMembersQuery = useQuery({
    ...orgMembersListQueryOptions(organizationId),
    enabled: isTeam && organizationId.length > 0,
  });

  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<WorkspaceMemberRole>("EDITOR");
  const [formError, setFormError] = useState<string | null>(null);

  const emailByUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of orgMembersQuery.data?.items ?? []) {
      map.set(member.userId, member.email);
    }
    return map;
  }, [orgMembersQuery.data]);

  const alreadyMemberIds = useMemo(() => {
    const set = new Set<string>();
    for (const member of membersQuery.data?.items ?? []) {
      if (member.status === "ACTIVE") {
        set.add(member.userId);
      }
    }
    set.add(ownerUserId);
    return set;
  }, [membersQuery.data, ownerUserId]);

  const candidates = useMemo(
    () =>
      (orgMembersQuery.data?.items ?? []).filter(
        (m) => m.status === "active" && !alreadyMemberIds.has(m.userId),
      ),
    [orgMembersQuery.data, alreadyMemberIds],
  );

  async function invalidate(): Promise<void> {
    await queryClient.invalidateQueries({
      queryKey: workspaceMembersQueryOptions(workspaceId).queryKey,
    });
  }

  const upsert = useMutation({
    mutationFn: () =>
      upsertWorkspaceMember(workspaceId, {
        userId: userId.trim().toLowerCase(),
        role,
      }),
    onSuccess: async () => {
      setUserId("");
      setFormError(null);
      await invalidate();
    },
  });

  const revoke = useMutation({
    mutationFn: (targetUserId: string) =>
      revokeWorkspaceMember(workspaceId, targetUserId),
    onSuccess: async () => {
      setFormError(null);
      await invalidate();
    },
  });

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!userId) {
      setFormError("Выберите сотрудника.");
      return;
    }
    try {
      await upsert.mutateAsync();
    } catch (err) {
      if (isApiError(err) && (err.status === 404 || err.code === "NOT_FOUND")) {
        setFormError("Нет прав или пользователь недоступен.");
      } else if (isApiError(err) && err.code === "VALIDATION_ERROR") {
        setFormError("Проверьте сотрудника и роль (EDITOR или VIEWER).");
      } else {
        setFormError("Не удалось добавить участника.");
      }
    }
  }

  async function onRevoke(targetUserId: string) {
    setFormError(null);
    try {
      await revoke.mutateAsync(targetUserId);
    } catch {
      setFormError("Не удалось отозвать участника.");
    }
  }

  const busy = upsert.isPending || revoke.isPending;
  const activeItems =
    membersQuery.data?.items.filter((m) => m.status === "ACTIVE") ?? [];

  return (
    <section className={styles.panel} aria-labelledby="workspace-members-title">
      <h2 id="workspace-members-title" className={styles.sectionTitle}>
        Участники
      </h2>

      {!isTeam ? (
        <p className={styles.notice}>
          Участники доступны только для командных проектов. Создайте проект с типом
          «Командный».
        </p>
      ) : null}

      {isTeam && membersQuery.isPending ? (
        <p className={styles.status} role="status">
          Загрузка участников…
        </p>
      ) : null}

      {isTeam && membersQuery.isError ? (
        <p className={styles.error} role="alert">
          {isApiError(membersQuery.error) && membersQuery.error.status === 404
            ? "Нет прав на управление участниками."
            : "Не удалось загрузить участников."}
        </p>
      ) : null}

      {isTeam && membersQuery.data && activeItems.length === 0 ? (
        <p className={styles.empty}>Пока нет участников (кроме владельца).</p>
      ) : null}

      {isTeam && activeItems.length > 0 ? (
        <ul className={styles.list}>
          {activeItems.map((member) => (
            <li key={member.id} className={styles.item}>
              <div>
                <p className={styles.title}>
                  {emailByUserId.get(member.userId) ?? member.userId}
                </p>
                <span className={styles.meta}>{member.role}</span>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void onRevoke(member.userId)}
              >
                Отозвать
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {isTeam ? (
        <form className={styles.form} onSubmit={(e) => void onAdd(e)} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="member-user-id">
              Сотрудник
            </label>
            <select
              id="member-user-id"
              className={styles.control}
              value={userId}
              disabled={busy || orgMembersQuery.isPending}
              onChange={(e) => setUserId(e.target.value)}
            >
              <option value="">Выберите…</option>
              {candidates.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.email} ({member.role})
                </option>
              ))}
            </select>
            {candidates.length === 0 && !orgMembersQuery.isPending ? (
              <p className={styles.notice}>
                Нет доступных сотрудников. Пригласите через «Организация».
              </p>
            ) : null}
          </div>
          <div className={`${styles.field} ${styles.fieldNarrow}`}>
            <label className={styles.label} htmlFor="member-role">
              Роль
            </label>
            <select
              id="member-role"
              className={styles.control}
              value={role}
              disabled={busy}
              onChange={(e) => setRole(e.target.value as WorkspaceMemberRole)}
            >
              <option value="EDITOR">EDITOR</option>
              <option value="VIEWER">VIEWER</option>
            </select>
          </div>
          <Button type="submit" disabled={busy || !userId}>
            {upsert.isPending ? "Добавление…" : "Добавить"}
          </Button>
        </form>
      ) : null}

      {formError ? (
        <p className={styles.error} role="alert">
          {formError}
        </p>
      ) : null}
    </section>
  );
}
