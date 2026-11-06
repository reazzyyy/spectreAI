"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
  updateWorkspace,
  workspaceDetailQueryOptions,
  workspacesListQueryOptions,
  type Workspace,
} from "@/entities/workspace";
import { isApiError } from "@/shared/api";
import { Button, Input } from "@/shared/ui";
import {
  editWorkspaceSchema,
  type EditWorkspaceFormValues,
} from "../model/edit-workspace-schema";
import styles from "./edit-workspace-form.module.scss";

export interface EditWorkspaceFormProps {
  workspace: Workspace;
}

/**
 * Owner rename / description edit (WS-04 / WS-05) via PATCH /workspaces/:id.
 * Client/Matter linking stays out of this slice.
 */
export function EditWorkspaceForm({ workspace }: EditWorkspaceFormProps) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<EditWorkspaceFormValues>({
    resolver: zodResolver(editWorkspaceSchema),
    defaultValues: {
      name: workspace.name,
      description: workspace.description ?? "",
    },
  });

  useEffect(() => {
    reset({
      name: workspace.name,
      description: workspace.description ?? "",
    });
  }, [workspace.id, workspace.name, workspace.description, reset]);

  const mutation = useMutation({
    mutationFn: (values: EditWorkspaceFormValues) => {
      const description = values.description.trim();
      return updateWorkspace(workspace.id, {
        name: values.name.trim(),
        description: description.length > 0 ? description : null,
      });
    },
    onSuccess: async (updated) => {
      queryClient.setQueryData(
        workspaceDetailQueryOptions(workspace.id).queryKey,
        updated,
      );
      await queryClient.invalidateQueries({
        queryKey: workspacesListQueryOptions.queryKey,
      });
      reset({
        name: updated.name,
        description: updated.description ?? "",
      });
      setFormError(null);
      setSaved(true);
    },
  });

  async function onSubmit(values: EditWorkspaceFormValues) {
    setSaved(false);
    setFormError(null);
    try {
      await mutation.mutateAsync(values);
    } catch (err) {
      if (isApiError(err) && (err.status === 404 || err.code === "NOT_FOUND")) {
        setFormError("Проект не найден или недоступен.");
      } else if (isApiError(err) && err.code === "VALIDATION_ERROR") {
        setFormError("Проверьте название и описание.");
      } else if (isApiError(err) && err.status === 403) {
        setFormError("Недостаточно прав для изменения проекта.");
      } else {
        setFormError("Не удалось сохранить. Попробуйте ещё раз.");
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Input
        id="edit-workspace-name"
        label="Название"
        autoComplete="off"
        disabled={isSubmitting}
        error={errors.name?.message}
        {...register("name")}
      />
      <Input
        id="edit-workspace-description"
        label="Описание"
        autoComplete="off"
        disabled={isSubmitting}
        error={errors.description?.message}
        {...register("description")}
      />
      {formError ? (
        <p role="alert" className="form-error">
          {formError}
        </p>
      ) : null}
      {saved && !isDirty ? (
        <p role="status" className={styles.saved}>
          Сохранено.
        </p>
      ) : null}
      <Button type="submit" disabled={isSubmitting || !isDirty}>
        {isSubmitting ? "Сохранение…" : "Сохранить"}
      </Button>
    </form>
  );
}
