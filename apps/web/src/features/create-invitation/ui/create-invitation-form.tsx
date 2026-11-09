"use client";

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
  createInvitation,
  invitationsListQueryOptions,
  type Invitation,
} from "@/entities/invitation";
import { isApiError } from "@/shared/api";
import { Button, Input } from "@/shared/ui";
import {
  createInvitationSchema,
  type CreateInvitationFormValues,
} from "../model/create-invitation-schema";
import styles from "./create-invitation-form.module.scss";

export interface CreateInvitationFormProps {
  organizationId: string;
  onCreated?: (invitation: Invitation) => void;
}

/** Creates an org invitation via POST …/invitations (owner only). */
export function CreateInvitationForm({
  organizationId,
  onCreated,
}: CreateInvitationFormProps) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateInvitationFormValues>({
    resolver: zodResolver(createInvitationSchema),
    defaultValues: { email: "", role: "member" },
  });

  const mutation = useMutation({
    mutationFn: (values: CreateInvitationFormValues) =>
      createInvitation(organizationId, {
        email: values.email.trim().toLowerCase(),
        role: values.role,
      }),
    onSuccess: async (invitation) => {
      await queryClient.invalidateQueries({
        queryKey: invitationsListQueryOptions(organizationId).queryKey,
      });
      reset({ email: "", role: "member" });
      setFormError(null);
      setDevToken(invitation.devToken ?? null);
      onCreated?.(invitation);
    },
  });

  async function onSubmit(values: CreateInvitationFormValues) {
    setFormError(null);
    try {
      await mutation.mutateAsync(values);
    } catch (err) {
      if (isApiError(err) && err.status === 404) {
        setFormError("Приглашения доступны только владельцу организации.");
      } else if (isApiError(err) && err.code === "VALIDATION_ERROR") {
        setFormError(
          "Проверьте email и роль. Возможно, пользователь уже в организации.",
        );
      } else {
        setFormError("Не удалось отправить приглашение. Попробуйте ещё раз.");
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Input
        id="invite-email"
        label="Email"
        type="email"
        autoComplete="email"
        disabled={isSubmitting}
        error={errors.email?.message}
        {...register("email")}
      />
      <div className={styles.field}>
        <label className={styles.label} htmlFor="invite-role">
          Роль
        </label>
        <select
          id="invite-role"
          className={styles.select}
          disabled={isSubmitting}
          {...register("role")}
        >
          <option value="member">member</option>
          <option value="admin">admin</option>
        </select>
        {errors.role?.message ? (
          <p role="alert" className="form-error">
            {errors.role.message}
          </p>
        ) : null}
      </div>
      {formError ? (
        <p role="alert" className="form-error">
          {formError}
        </p>
      ) : null}
      {devToken ? (
        <div className={styles.devToken} role="status">
          Dev-токен (только вне production, не логируйте):
          <code>{devToken}</code>
          <p>
            <Link
              href={`/invite/accept?token=${encodeURIComponent(devToken)}`}
            >
              Открыть страницу принятия
            </Link>
          </p>
        </div>
      ) : null}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Отправка…" : "Пригласить"}
      </Button>
    </form>
  );
}
