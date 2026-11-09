"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
  createWorkspace,
  workspacesListQueryOptions,
  type Workspace,
} from "@/entities/workspace";
import { isApiError } from "@/shared/api";
import { Button, Input } from "@/shared/ui";
import {
  createWorkspaceSchema,
  type CreateWorkspaceFormValues,
} from "../model/create-workspace-schema";
import styles from "./create-workspace-form.module.scss";

export interface CreateWorkspaceFormProps {
  onCreated?: (workspace: Workspace) => void;
}

/** Creates a PERSONAL or TEAM Workspace via POST /workspaces (W-002). */
export function CreateWorkspaceForm({ onCreated }: CreateWorkspaceFormProps) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateWorkspaceFormValues>({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: { name: "", description: "", visibility: "PERSONAL" },
  });

  const mutation = useMutation({
    mutationFn: createWorkspace,
    onSuccess: async (workspace) => {
      await queryClient.invalidateQueries({
        queryKey: workspacesListQueryOptions.queryKey,
      });
      reset({ name: "", description: "", visibility: "PERSONAL" });
      setFormError(null);
      onCreated?.(workspace);
    },
  });

  async function onSubmit(values: CreateWorkspaceFormValues) {
    setFormError(null);
    try {
      const description = values.description?.trim();
      await mutation.mutateAsync({
        name: values.name.trim(),
        description: description ? description : null,
        visibility: values.visibility,
      });
    } catch (err) {
      if (isApiError(err) && err.code === "VALIDATION_ERROR") {
        setFormError("Проверьте название, тип и описание.");
      } else {
        setFormError("Не удалось создать проект. Попробуйте ещё раз.");
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Input
        id="workspace-name"
        label="Название"
        autoComplete="off"
        disabled={isSubmitting}
        error={errors.name?.message}
        {...register("name")}
      />
      <div className={styles.field}>
        <label className={styles.label} htmlFor="workspace-visibility">
          Тип
        </label>
        <select
          id="workspace-visibility"
          className={styles.select}
          disabled={isSubmitting}
          {...register("visibility")}
        >
          <option value="PERSONAL">Личный</option>
          <option value="TEAM">Командный</option>
        </select>
        {errors.visibility?.message ? (
          <p role="alert" className="form-error">
            {errors.visibility.message}
          </p>
        ) : null}
      </div>
      <Input
        id="workspace-description"
        label="Описание"
        autoComplete="off"
        disabled={isSubmitting}
        hint="Необязательно. Участников можно добавить только в командный проект."
        error={errors.description?.message}
        {...register("description")}
      />
      {formError ? (
        <p role="alert" className="form-error">
          {formError}
        </p>
      ) : null}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Создание…" : "Создать проект"}
      </Button>
    </form>
  );
}
