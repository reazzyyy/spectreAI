"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { clientsListQueryOptions } from "@/entities/client";
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
 * Owner edit name/description/client (WS-04/05/07) via PATCH /workspaces/:id.
 */
export function EditWorkspaceForm({ workspace }: EditWorkspaceFormProps) {
  const queryClient = useQueryClient();
  const clientsQuery = useQuery(clientsListQueryOptions);
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
      clientId: workspace.clientId ?? "",
    },
  });

  useEffect(() => {
    reset({
      name: workspace.name,
      description: workspace.description ?? "",
      clientId: workspace.clientId ?? "",
    });
  }, [
    workspace.id,
    workspace.name,
    workspace.description,
    workspace.clientId,
    reset,
  ]);

  const mutation = useMutation({
    mutationFn: (values: EditWorkspaceFormValues) => {
      const description = values.description.trim();
      return updateWorkspace(workspace.id, {
        name: values.name.trim(),
        description: description.length > 0 ? description : null,
        clientId: values.clientId === "" ? null : values.clientId,
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
        clientId: updated.clientId ?? "",
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
        setFormError("Проверьте название, описание и клиента.");
      } else if (isApiError(err) && err.status === 403) {
        setFormError("Недостаточно прав для изменения проекта.");
      } else {
        setFormError("Не удалось сохранить. Попробуйте ещё раз.");
      }
    }
  }

  const clients = clientsQuery.data?.items ?? [];

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
      <div className={styles.field}>
        <label className={styles.label} htmlFor="edit-workspace-client">
          Клиент
        </label>
        <select
          id="edit-workspace-client"
          className={styles.select}
          disabled={isSubmitting || clientsQuery.isPending}
          {...register("clientId")}
        >
          <option value="">Без клиента</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
        {clients.length === 0 && !clientsQuery.isPending ? (
          <p className={styles.saved}>
            Клиентов пока нет — создайте на странице «Все клиенты».
          </p>
        ) : null}
        {errors.clientId?.message ? (
          <p role="alert" className="form-error">
            {errors.clientId.message}
          </p>
        ) : null}
      </div>
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
