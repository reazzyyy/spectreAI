"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  invitationsListQueryOptions,
  resendInvitation,
  revokeInvitation,
  type Invitation,
} from "@/entities/invitation";
import { isApiError } from "@/shared/api";
import { Button } from "@/shared/ui";
import styles from "./invitation-actions.module.scss";

export interface InvitationActionsProps {
  organizationId: string;
  invitation: Invitation;
}

function isActionable(invitation: Invitation): boolean {
  return invitation.acceptedAt === null && invitation.revokedAt === null;
}

/** Resend / revoke for a pending org invitation (owner only). */
export function InvitationActions({
  organizationId,
  invitation,
}: InvitationActionsProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: invitationsListQueryOptions(organizationId).queryKey,
    });

  const resend = useMutation({
    mutationFn: () => resendInvitation(organizationId, invitation.id),
    onSuccess: async (updated) => {
      setError(null);
      setDevToken(updated.devToken ?? null);
      await invalidate();
    },
  });

  const revoke = useMutation({
    mutationFn: () => revokeInvitation(organizationId, invitation.id),
    onSuccess: async () => {
      setError(null);
      setDevToken(null);
      await invalidate();
    },
  });

  if (!isActionable(invitation)) {
    return null;
  }

  const busy = resend.isPending || revoke.isPending;

  async function onResend() {
    setError(null);
    try {
      await resend.mutateAsync();
    } catch (err) {
      setError(
        isApiError(err) && err.status === 404
          ? "Приглашение уже недоступно."
          : "Не удалось повторно отправить.",
      );
    }
  }

  async function onRevoke() {
    setError(null);
    try {
      await revoke.mutateAsync();
    } catch (err) {
      setError(
        isApiError(err) && err.status === 404
          ? "Приглашение уже недоступно."
          : "Не удалось отозвать приглашение.",
      );
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.row}>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => void onResend()}
        >
          {resend.isPending ? "Отправка…" : "Повторно"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => void onRevoke()}
        >
          {revoke.isPending ? "Отзыв…" : "Отозвать"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      {devToken ? (
        <p className={styles.devToken} role="status">
          Dev-токен: <code>{devToken}</code>
        </p>
      ) : null}
    </div>
  );
}
