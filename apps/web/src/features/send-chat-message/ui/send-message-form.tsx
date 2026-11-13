"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { messageHistoryQueryOptions, sendMessage } from "@/entities/message";
import type { SendMessageResponse } from "@/entities/message";
import { isApiError } from "@/shared/api";
import { Button, Icon } from "@/shared/ui";
import {
  sendMessageSchema,
  type SendMessageFormValues,
} from "../model/send-message-schema";
import styles from "./send-message-form.module.scss";

export interface SendMessageFormProps {
  conversationId: string;
  disabled?: boolean;
  /** Prefill when opening a new dialog from the project ask bar. */
  initialContent?: string;
  onSent?: (result: SendMessageResponse) => void;
}

/** Make-aligned sticky composer → POST message + Synthetic generation (D-012). */
export function SendMessageForm({
  conversationId,
  disabled = false,
  initialContent = "",
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
    defaultValues: { content: initialContent },
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
    <div className={styles.area}>
      <p className={styles.contextLine}>
        <Icon name="folder" size={15} />
        Контекст: только история этого чата (conversation_only)
      </p>
      <form className={styles.composer} onSubmit={handleSubmit(onSubmit)} noValidate>
        <label className={styles.label} htmlFor="send-message-content">
          Ваш вопрос
        </label>
        <textarea
          id="send-message-content"
          className={styles.textarea}
          rows={2}
          placeholder="Например, уточните условие об ответственности"
          disabled={busy}
          aria-invalid={errors.content ? true : undefined}
          aria-describedby={
            errors.content ? "send-message-content-error" : undefined
          }
          {...register("content")}
        />
        <div className={styles.footer}>
          <span>SyntheticAIProvider · документы в контекст пока не подключаются</span>
          <Button type="submit" icon="arrow" disabled={busy}>
            {mutation.isPending ? "Отправка…" : "Отправить"}
          </Button>
        </div>
        {errors.content ? (
          <p id="send-message-content-error" className={styles.error} role="alert">
            {errors.content.message}
          </p>
        ) : null}
        {formError ? (
          <p className={styles.error} role="alert">
            {formError}
          </p>
        ) : null}
      </form>
      <p className={styles.disclaimer}>
        ИИ может ошибаться. Проверяйте выводы. Синтетический режим — до закрытия
        O-002.
      </p>
    </div>
  );
}
