"use client";

import { useMemo, useState } from "react";
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
import { displayNameFromEmail } from "@/shared/lib";
import {
  Avatar,
  Badge,
  Button,
  Dialog,
  Eyebrow,
  Icon,
  Page,
  PageHead,
  SearchField,
  Select,
  StateCard,
  TextAction,
} from "@/shared/ui";
import styles from "./workspace-members-panel.module.scss";

type RoleFilter = "all" | "owner" | WorkspaceMemberRole;

export interface WorkspaceMembersPanelProps {
  workspaceId: string;
  workspaceName: string;
  visibility: WorkspaceVisibility;
  ownerUserId: string;
  onBack: () => void;
}

type Row = {
  key: string;
  userId: string;
  email: string;
  label: string;
  role: "owner" | WorkspaceMemberRole;
  isOwner: boolean;
  isSelf: boolean;
};

function roleLabel(role: "owner" | WorkspaceMemberRole): string {
  if (role === "owner") return "Владелец";
  if (role === "EDITOR") return "Редактор";
  return "Просмотр";
}

function roleBadgeTone(
  role: "owner" | WorkspaceMemberRole,
): "info" | "neutral" | "success" {
  if (role === "owner") return "info";
  if (role === "EDITOR") return "success";
  return "neutral";
}

/**
 * Make Members page: back link, head, membership table + sticky role guide.
 * TEAM: upsert/revoke via members API. PERSONAL: read-only owner row (W-002/W-006).
 */
export function WorkspaceMembersPanel({
  workspaceId,
  workspaceName,
  visibility,
  ownerUserId,
  onBack,
}: WorkspaceMembersPanelProps) {
  const queryClient = useQueryClient();
  const isTeam = visibility === "TEAM";
  const sessionQuery = useQuery(sessionMeQueryOptions);
  const sessionUserId = sessionQuery.data?.user.id ?? "";
  const sessionEmail = sessionQuery.data?.user.email ?? "";
  const organizationId = sessionQuery.data?.organization.id ?? "";
  const isOwner = Boolean(sessionUserId && sessionUserId === ownerUserId);
  const canManage = isOwner && isTeam;

  const membersQuery = useQuery({
    ...workspaceMembersQueryOptions(workspaceId),
    enabled: isTeam,
  });
  const orgMembersQuery = useQuery({
    ...orgMembersListQueryOptions(organizationId),
    enabled: isTeam && organizationId.length > 0,
  });

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pickUserId, setPickUserId] = useState("");
  const [pickRole, setPickRole] = useState<WorkspaceMemberRole>("EDITOR");
  const [formError, setFormError] = useState<string | null>(null);

  const emailByUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of orgMembersQuery.data?.items ?? []) {
      map.set(member.userId, member.email);
    }
    if (sessionUserId && sessionEmail) {
      map.set(sessionUserId, sessionEmail);
    }
    return map;
  }, [orgMembersQuery.data?.items, sessionEmail, sessionUserId]);

  const rows = useMemo((): Row[] => {
    const ownerEmail =
      emailByUserId.get(ownerUserId) ??
      (sessionUserId === ownerUserId ? sessionEmail : "");
    const ownerRow: Row = {
      key: `owner:${ownerUserId}`,
      userId: ownerUserId,
      email: ownerEmail || "—",
      label: ownerEmail ? displayNameFromEmail(ownerEmail) : "Владелец проекта",
      role: "owner",
      isOwner: true,
      isSelf: sessionUserId === ownerUserId,
    };

    if (!isTeam) {
      return [ownerRow];
    }

    const memberRows = (membersQuery.data?.items ?? [])
      .filter((m) => m.status === "ACTIVE" && m.userId !== ownerUserId)
      .map((m) => {
        const email = emailByUserId.get(m.userId) ?? "";
        return {
          key: m.id,
          userId: m.userId,
          email: email || m.userId,
          label: email ? displayNameFromEmail(email) : m.userId.slice(0, 8),
          role: m.role,
          isOwner: false,
          isSelf: m.userId === sessionUserId,
        } satisfies Row;
      });

    return [ownerRow, ...memberRows];
  }, [
    emailByUserId,
    isTeam,
    membersQuery.data?.items,
    ownerUserId,
    sessionEmail,
    sessionUserId,
  ]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (roleFilter !== "all" && row.role !== roleFilter) return false;
      if (!q) return true;
      return (
        row.label.toLowerCase().includes(q) ||
        row.email.toLowerCase().includes(q)
      );
    });
  }, [query, roleFilter, rows]);

  const alreadyMemberIds = useMemo(() => {
    const set = new Set<string>();
    for (const member of membersQuery.data?.items ?? []) {
      if (member.status === "ACTIVE") set.add(member.userId);
    }
    set.add(ownerUserId);
    return set;
  }, [membersQuery.data?.items, ownerUserId]);

  const candidates = useMemo(
    () =>
      (orgMembersQuery.data?.items ?? []).filter(
        (m) => m.status === "active" && !alreadyMemberIds.has(m.userId),
      ),
    [alreadyMemberIds, orgMembersQuery.data?.items],
  );

  async function invalidateMembers(): Promise<void> {
    await queryClient.invalidateQueries({
      queryKey: workspaceMembersQueryOptions(workspaceId).queryKey,
    });
  }

  const upsert = useMutation({
    mutationFn: (input: { userId: string; role: WorkspaceMemberRole }) =>
      upsertWorkspaceMember(workspaceId, input),
    onSuccess: async () => {
      setFormError(null);
      await invalidateMembers();
    },
  });

  const revoke = useMutation({
    mutationFn: (targetUserId: string) =>
      revokeWorkspaceMember(workspaceId, targetUserId),
    onSuccess: async () => {
      setFormError(null);
      await invalidateMembers();
    },
  });

  const busy = upsert.isPending || revoke.isPending;

  async function handleAdd() {
    setFormError(null);
    if (!pickUserId) {
      setFormError("Выберите сотрудника организации.");
      return;
    }
    try {
      await upsert.mutateAsync({ userId: pickUserId, role: pickRole });
      setDialogOpen(false);
      setPickUserId("");
      setPickRole("EDITOR");
    } catch (err) {
      if (isApiError(err) && (err.status === 404 || err.code === "NOT_FOUND")) {
        setFormError("Нет прав или пользователь недоступен.");
      } else if (isApiError(err) && err.code === "VALIDATION_ERROR") {
        setFormError("Проверьте сотрудника и роль (Редактор или Просмотр).");
      } else {
        setFormError("Не удалось добавить участника.");
      }
    }
  }

  async function handleRoleChange(
    userId: string,
    role: WorkspaceMemberRole,
  ) {
    setFormError(null);
    try {
      await upsert.mutateAsync({ userId, role });
    } catch {
      setFormError("Не удалось изменить роль.");
    }
  }

  async function handleRemove(userId: string) {
    setFormError(null);
    try {
      await revoke.mutateAsync(userId);
    } catch {
      setFormError("Не удалось исключить участника.");
    }
  }

  const visibilityLabel = visibility === "PERSONAL" ? "PERSONAL" : "TEAM";
  const addDisabledReason = !isTeam
    ? "PERSONAL имеет одного владельца. Добавление участников не входит в MVP."
    : !isOwner
      ? "Управление доступно OWNER или уполномоченному администратору"
      : undefined;

  return (
    <Page width="wide">
      <button type="button" className={styles.back} onClick={onBack}>
        <Icon name="chevron" size={14} className={styles.backIcon} />
        К проекту
      </button>

      <PageHead
        compact
        eyebrow={`Организация · ${visibilityLabel}`}
        title="Участники проекта"
        description={workspaceName}
        actions={
          <Button
            type="button"
            variant="primary"
            icon="users"
            disabled={!canManage || busy}
            title={addDisabledReason}
            onClick={() => {
              setFormError(null);
              setDialogOpen(true);
            }}
          >
            Добавить участника
          </Button>
        }
      />

      <div className={styles.layout}>
        <section>
          <div className={styles.toolbar}>
            <SearchField
              className={styles.search}
              aria-label="Поиск участников"
              placeholder="Имя или рабочий email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Select
              aria-label="Фильтр роли участника"
              className={styles.filter}
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
            >
              <option value="all">Все роли</option>
              <option value="owner">Владелец</option>
              <option value="EDITOR">Редактор</option>
              <option value="VIEWER">Просмотр</option>
            </Select>
          </div>

          {isTeam && membersQuery.isPending ? (
            <p className={styles.status} role="status">
              Загрузка участников…
            </p>
          ) : null}

          {isTeam && membersQuery.isError ? (
            <StateCard
              tone="danger"
              icon="warning"
              title="Не удалось загрузить участников"
              text={
                isApiError(membersQuery.error) &&
                membersQuery.error.status === 404
                  ? "Нет прав на просмотр состава проекта."
                  : "Проверьте доступ к проекту и повторите."
              }
            >
              <Button
                type="button"
                variant="secondary"
                onClick={() => void membersQuery.refetch()}
              >
                Повторить
              </Button>
            </StateCard>
          ) : null}

          {formError ? (
            <p className={styles.error} role="alert">
              {formError}
            </p>
          ) : null}

          <div className={styles.table}>
            <div className={styles.tableHead}>
              <span>Сотрудник</span>
              <span>Роль в проекте</span>
              <span>Действия</span>
            </div>
            {filteredRows.length === 0 ? (
              <p className={styles.status}>Нет участников по фильтру.</p>
            ) : (
              filteredRows.map((row) => (
                <div key={row.key} className={styles.row}>
                  <div className={styles.person}>
                    <Avatar
                      size="md"
                      label={row.email === "—" ? row.label : row.email}
                    />
                    <div className={styles.personMeta}>
                      <strong>
                        {row.label}
                        {row.isSelf ? (
                          <span className={styles.you}> · вы</span>
                        ) : null}
                      </strong>
                      <small>{row.email}</small>
                    </div>
                  </div>
                  <Badge tone={roleBadgeTone(row.role)}>
                    {roleLabel(row.role)}
                  </Badge>
                  <div className={styles.actions}>
                    {row.isOwner ? (
                      <span className={styles.help}>Единственный OWNER</span>
                    ) : canManage ? (
                      <>
                        <Select
                          aria-label={`Роль ${row.label}`}
                          className={styles.filter}
                          value={row.role}
                          disabled={busy}
                          onChange={(e) =>
                            void handleRoleChange(
                              row.userId,
                              e.target.value as WorkspaceMemberRole,
                            )
                          }
                        >
                          <option value="EDITOR">Редактор</option>
                          <option value="VIEWER">Просмотр</option>
                        </Select>
                        <TextAction
                          danger
                          disabled={busy}
                          onClick={() => void handleRemove(row.userId)}
                        >
                          Исключить
                        </TextAction>
                      </>
                    ) : (
                      <span className={styles.help}>Только просмотр</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <p className={styles.footnote}>
            <Icon name="lock" size={14} />
            Управлять участниками может OWNER проекта или уполномоченный Org
            Admin. EDITOR и VIEWER не меняют членство.
          </p>
          {!isTeam ? (
            <p className={styles.notice}>
              PERSONAL имеет одного владельца. Добавление участников и смена
              типа существующего проекта не входят в MVP.
            </p>
          ) : null}
        </section>

        <aside className={styles.guide}>
          <Eyebrow>Граница доступа</Eyebrow>
          <h2>Роль — внутри проекта</h2>
          <div className={styles.guideBlock}>
            <strong>Владелец</strong>
            <p>
              Управляет участниками и метаданными проекта. Другой OWNER не
              назначается сменой обычной роли.
            </p>
          </div>
          <div className={styles.guideBlock}>
            <strong>Редактор</strong>
            <p>
              Создаёт и редактирует доступные материалы. Не управляет
              участниками; удаляет только своё.
            </p>
          </div>
          <div className={styles.guideBlock}>
            <strong>Просмотр</strong>
            <p>
              Читает доступное. Не изменяет текст, не запускает и не отменяет
              AI-задачи.
            </p>
          </div>
          <p className={styles.guideNotice}>
            Личные PRIVATE-чаты не становятся общими после добавления
            участника. Авторство материалов при удалении сотрудника не меняется.
          </p>
        </aside>
      </div>

      <Dialog
        title="Добавить участника"
        open={dialogOpen}
        onClose={() => {
          if (!busy) setDialogOpen(false);
        }}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => setDialogOpen(false)}
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={busy || !pickUserId}
              onClick={() => void handleAdd()}
            >
              Добавить
            </Button>
          </>
        }
      >
        <div className={styles.dialogField}>
          <Select
            id="member-user"
            label="Сотрудник организации"
            value={pickUserId}
            disabled={busy || orgMembersQuery.isPending}
            onChange={(e) => setPickUserId(e.target.value)}
          >
            <option value="">Выберите…</option>
            {candidates.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.email}
              </option>
            ))}
          </Select>
          {candidates.length === 0 && !orgMembersQuery.isPending ? (
            <p className={styles.notice}>
              Нет доступных сотрудников. Пригласите через «Организация».
            </p>
          ) : null}
        </div>
        <Select
          id="member-role"
          label="Роль в проекте"
          value={pickRole}
          disabled={busy}
          onChange={(e) =>
            setPickRole(e.target.value as WorkspaceMemberRole)
          }
        >
          <option value="EDITOR">Редактор</option>
          <option value="VIEWER">Просмотр</option>
        </Select>
      </Dialog>
    </Page>
  );
}
