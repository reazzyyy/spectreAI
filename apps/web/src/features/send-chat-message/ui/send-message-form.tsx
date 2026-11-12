"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { messageHistoryQueryOptions, sendMessage } from "@/entities/message";
import type { SendMessageResponse } from "@/entities/message";
import { isApiError } from "@/shared/api";
import { Button } from "@/shared/ui";
import {
  sendMessageSchema,
  type SendMessageFormValues,
} from "../model/send-message-schema";
import styles from "./send-message-form.module.scss";

export interface SendMessageFormProps {
  conversationId: string;
  disabled?: boolean;
  onSent?: (result: SendMessageResponse) => void;
}

/** Sends a user message and enqueues Synthetic generation (D-012). */
export function SendMessageForm({
  conversationId,
  disabled = false,
  onSent,
}: SendMessageFormProps) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SendMessageFormValues>({
    resolver: zodResolver(sendMessageSchema),
    defaultValues: { content: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: SendMessageFormValues) => {
      const idempotencyKey =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      return sendMessage(
        conversationId,
        { content: values.content.trim() },
        { idempotencyKey },
      );
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: messageHistoryQueryOptions(conversationId).queryKey,
      });
      reset({ content: "" });
      setFormError(null);
      onSent?.(result);
    },
  });

  async function onSubmit(values: SendMessageFormValues) {
    setFormError(null);
    try {
      await mutation.mutateAsync(values);
    } catch (err) {
      if (isApiError(err) && err.status === 401) {
        setFormError("Сессия истекла. Войдите снова.");
      } else if (isApiError(err) && (err.status === 403 || err.status === 404)) {
        setFormError("Нет доступа к этому чату.");
      } else if (isApiError(err) && err.status === 422) {
        setFormError("Сообщение отклонено. Проверьте текст.");
      } else {
        setFormError("Не удалось отправить. Попробуйте ещё раз.");
      }
    }
  }

  const busy = disabled || isSubmitting || mutation.isPending;

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className={styles.composer}>
        <label className={styles.label} htmlFor="send-message-content">
          Сообщение
        </label>
        <textarea
          id="send-message-content"
          className={styles.textarea}
          rows={3}
          placeholder="Спросите по истории этого чата…"
          disabled={busy}
          aria-invalid={errors.content ? true : undefined}
          aria-describedby={
            errors.content ? "send-message-content-error" : "send-message-hint"
          }
          {...register("content")}
        />
        {errors.content ? (
          <p id="send-message-content-error" className={styles.error} role="alert">
            {errors.content.message}
          </p>
        ) : (
          <p id="send-message-hint" className={styles.hint}>
            Ответ только из истории чата (conversation_only). Документы в контекст
            пока не подключаются.
          </p>
        )}
      </div>
      <div className={styles.actions}>
        <p className={styles.hint}>Режим: SyntheticAIProvider (D-012)</p>
        <Button type="submit" disabled={busy}>
          {mutation.isPending ? "Отправка…" : "Отправить"}
        </Button>
      </div>
      {formError ? (
        <p className={styles.error} role="alert">
          {formError}
        </p>
      ) : null}
    </form>
  );
}
