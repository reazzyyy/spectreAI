"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  acceptInvitation,
  type AcceptInvitationResult,
} from "@/entities/invitation";
import { isApiError } from "@/shared/api";
import { Button, Icon, Input } from "@/shared/ui";
import {
  acceptInvitationSchema,
  type AcceptInvitationFormValues,
} from "../model/accept-invitation-schema";
import styles from "./accept-invitation-form.module.scss";

export interface AcceptInvitationFormProps {
  /** Prefill from `?token=` (dev outbox / email link later). */
  initialToken?: string;
}

/**
 * Accept org invite via POST /invitations/accept.
 * New user: password ≥12. Existing: session email must match; leave password empty.
 */
export function AcceptInvitationForm({
  initialToken = "",
}: AcceptInvitationFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<AcceptInvitationResult | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AcceptInvitationFormValues>({
    resolver: zodResolver(acceptInvitationSchema),
    defaultValues: {
      token: initialToken,
      password: "",
    },
  });

  async function onSubmit(values: AcceptInvitationFormValues) {
    setFormError(null);
    try {
      const accepted = await acceptInvitation({
        token: values.token.trim(),
        password: values.password.length > 0 ? values.password : undefined,
      });
      setResult(accepted);
    } catch (err) {
      if (isApiError(err) && err.status === 404) {
        setFormError(
          "Приглашение не найдено, отозвано или уже принято. Запросите новое.",
        );
      } else if (isApiError(err) && err.status === 403) {
        setFormError(
          "Нужна сессия пользователя с email из приглашения. Войдите и повторите, либо создайте аккаунт паролем.",
        );
      } else if (isApiError(err) && err.code === "VALIDATION_ERROR") {
        setFormError(
          "Для нового пользователя укажите пароль не короче 12 символов.",
        );
      } else if (isApiError(err) && err.code === "CSRF_REJECTED") {
        setFormError("CSRF отклонён. Обновите страницу и попробуйте снова.");
      } else {
        setFormError("Не удалось принять приглашение. Попробуйте ещё раз.");
      }
    }
  }

  if (result) {
    return (
      <div className={styles.result} role="status">
        <p>
          Приглашение принято. Роль: <strong>{result.role}</strong>.
        </p>
        <p>
          Сессия здесь не создаётся — войдите с email приглашения и ID
          организации.
        </p>
        <Button
          type="button"
          className={styles.submit}
          onClick={() => {
            router.push("/login");
          }}
        >
          Перейти ко входу
          <Icon name="arrow" size={16} />
        </Button>
      </div>
    );
  }

  return (
    <form
      className={styles.form}
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      aria-busy={isSubmitting}
    >
      <p className={styles.intro}>
        Новый пользователь задаёт пароль (≥12). Существующий — сначала входит,
        затем принимает токен без пароля.
      </p>
      <Input
        id="invite-token"
        label="Токен приглашения"
        autoComplete="off"
        spellCheck={false}
        disabled={isSubmitting}
        hint="Из письма или dev-токена на странице «Организация»."
        error={errors.token?.message}
        {...register("token")}
      />
      <Input
        id="invite-password"
        label="Пароль (новый пользователь)"
        type="password"
        autoComplete="new-password"
        disabled={isSubmitting}
        hint="Оставьте пустым, если уже вошли под email из приглашения."
        error={errors.password?.message}
        {...register("password")}
      />
      {formError ? (
        <p role="alert" className={styles.error}>
          {formError}
        </p>
      ) : null}
      <Button type="submit" className={styles.submit} disabled={isSubmitting}>
        {isSubmitting ? "Принятие…" : "Принять приглашение"}
        <Icon name="arrow" size={16} />
      </Button>
      <Link href="/login" className={styles.backLink}>
        Назад ко входу
      </Link>
    </form>
  );
}
