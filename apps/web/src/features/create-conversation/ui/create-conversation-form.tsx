"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
  conversationListQueryOptions,
  createConversation,
  type Conversation,
} from "@/entities/conversation";
import { isApiError } from "@/shared/api";
import { Button, Input, Select } from "@/shared/ui";
import {
  createConversationSchema,
  type CreateConversationFormValues,
} from "../model/create-conversation-schema";
import styles from "./create-conversation-form.module.scss";

export interface CreateConversationFormProps {
  workspaceId: string;
  onCreated?: (conversation: Conversation) => void;
}

/** Creates PRIVATE or WORKSPACE conversation in the current project. */
export function CreateConversationForm({
  workspaceId,
  onCreated,
}: CreateConversationFormProps) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateConversationFormValues>({
    resolver: zodResolver(createConversationSchema),
    defaultValues: {
      visibility: "PRIVATE",
      title: "",
    },
  });

  const mutation = useMutation({
    mutationFn: (values: CreateConversationFormValues) =>
      createConversation(workspaceId, {
        visibility: values.visibility,
        title: values.title?.trim() ? values.title.trim() : null,
      }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({
        queryKey: conversationListQueryOptions(workspaceId).queryKey,
      });
      reset({ visibility: "PRIVATE", title: "" });
      setFormError(null);
      onCreated?.(created);
    },
  });

  async function onSubmit(values: CreateConversationFormValues) {
    setFormError(null);
    try {
      await mutation.mutateAsync(values);
    } catch (err) {
      if (isApiError(err) && err.status === 401) {
        setFormError("Сессия истекла. Войдите снова.");
      } else if (isApiError(err) && (err.status === 403 || err.status === 404)) {
        setFormError("Нет права создавать чат в этом проекте.");
      } else {
        setFormError("Не удалось создать чат. Попробуйте ещё раз.");
      }
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <Select
        id="create-conversation-visibility"
        label="Видимость"
        className={styles.visibility}
        {...register("visibility")}
      >
        <option value="PRIVATE">Личный</option>
        <option value="WORKSPACE">Проект</option>
      </Select>
      {errors.visibility ? (
        <p className={styles.error} role="alert">
          {errors.visibility.message}
        </p>
      ) : null}
      <Input
        id="create-conversation-title"
        label="Название"
        className={styles.fieldGrow}
        placeholder="Необязательно"
        error={errors.title?.message}
        {...register("title")}
      />
      <Button type="submit" icon="plus" disabled={isSubmitting || mutation.isPending}>
        Новый чат
      </Button>
      {formError ? (
        <p className={styles.error} role="alert">
          {formError}
        </p>
      ) : null}
    </form>
  );
}
