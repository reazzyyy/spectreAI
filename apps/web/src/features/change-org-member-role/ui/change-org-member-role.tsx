"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  orgMembersListQueryOptions,
  updateOrgMemberRole,
  type AssignableOrgRole,
  type OrgMember,
} from "@/entities/org-member";
import { isApiError } from "@/shared/api";
import styles from "./change-org-member-role.module.scss";

export interface ChangeOrgMemberRoleProps {
  organizationId: string;
  member: OrgMember;
}

/**
 * Owner-only: set org membership to admin|member (SEC-03 thin).
 * Owner rows are not editable here.
 */
export function ChangeOrgMemberRole({
  organizationId,
  member,
}: ChangeOrgMemberRoleProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (role: AssignableOrgRole) =>
      updateOrgMemberRole(organizationId, member.userId, { role }),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({
        queryKey: orgMembersListQueryOptions(organizationId).queryKey,
      });
    },
  });

  if (member.role === "owner" || member.status !== "active") {
    return <span>{member.role}</span>;
  }

  async function onChange(role: AssignableOrgRole) {
    if (role === member.role) return;
    setError(null);
    try {
      await mutation.mutateAsync(role);
    } catch (err) {
      if (isApiError(err) && err.status === 404) {
        setError("Нет прав или участник недоступен.");
      } else if (isApiError(err) && err.code === "VALIDATION_ERROR") {
        setError("Эту роль нельзя назначить.");
      } else {
        setError("Не удалось изменить роль.");
      }
    }
  }

  return (
    <div className={styles.wrap}>
      <select
        id={`org-role-${member.userId}`}
        className={styles.select}
        aria-label={`Роль ${member.email}`}
        value={member.role}
        disabled={mutation.isPending}
        onChange={(e) => void onChange(e.target.value as AssignableOrgRole)}
      >
        <option value="member">member</option>
        <option value="admin">admin</option>
      </select>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
