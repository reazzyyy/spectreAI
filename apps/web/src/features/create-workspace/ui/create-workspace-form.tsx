"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
  createWorkspace,
  workspacesListQueryOptions,
} from "@/entities/workspace";
import { isApiError } from "@/shared/api";
import { Button, Input } from "@/shared/ui";
import {
  createWorkspaceSchema,
  type CreateWorkspaceFormValues,
} from "../model/create-workspace-schema";

export interface CreateWorkspaceFormProps {
  onCreated?: () => void;
}

/**
 * Creates a PERSONAL Workspace via POST /workspaces (W-002 / S3).
 * TEAM create is out of UI scope until API allows it.
 */
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
    defaultValues: { name: "", description: "" },
  });

  const mutation = useMutation({
    mutationFn: createWorkspace,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: workspacesListQueryOptions.queryKey,
      });
      reset();
      setFormError(null);
      onCreated?.();
    },
  });

  async function onSubmit(values: CreateWorkspaceFormValues) {
    setFormError(null);
    try {
      const description = values.description?.trim();
      await mutation.mutateAsync({
        name: values.name.trim(),
        description: description ? description : null,
        visibility: "PERSONAL",
      });
    } catch (err) {
      if (isApiError(err) && err.code === "VALIDATION_ERROR") {
        setFormError("Проверьте название и описание.");
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
      <Input
        id="workspace-description"
        label="Описание"
        autoComplete="off"
        disabled={isSubmitting}
        hint="Необязательно. Командные проекты появятся позже."
        error={errors.description?.message}
        {...register("description")}
      />
      {formError ? (
        <p role="alert" className="form-error">
          {formError}
        </p>
      ) : null}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Создание…" : "Создать личный проект"}
      </Button>
    </form>
  );
}
