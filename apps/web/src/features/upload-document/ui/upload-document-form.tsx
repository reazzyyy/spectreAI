"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import {
  uploadWorkspaceDocuments,
  workspaceDocumentsQueryOptions,
  type Document,
} from "@/entities/document";
import type { Workspace } from "@/entities/workspace";
import { isApiError } from "@/shared/api";
import { Button, Input, Select } from "@/shared/ui";
import {
  uploadDocumentSchema,
  type UploadDocumentFormValues,
} from "../model/upload-document-schema";
import styles from "./upload-document-form.module.scss";

export interface UploadDocumentFormProps {
  workspaces: Workspace[];
  workspaceId?: string;
  onUploaded?: (documents: Document[]) => void;
}

/** Multipart upload into a content-mutable Workspace (DOC-02 thin). */
export function UploadDocumentForm({
  workspaces,
  workspaceId,
  onUploaded,
}: UploadDocumentFormProps) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UploadDocumentFormValues>({
    resolver: zodResolver(uploadDocumentSchema),
    defaultValues: {
      workspaceId: workspaceId ?? workspaces[0]?.id ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: ({
      workspaceId: wsId,
      files,
    }: {
      workspaceId: string;
      files: File[];
    }) => uploadWorkspaceDocuments(wsId, files),
    onSuccess: async (response, variables) => {
      await queryClient.invalidateQueries({
        queryKey: workspaceDocumentsQueryOptions(variables.workspaceId).queryKey,
      });
      reset({ workspaceId: variables.workspaceId });
      setFormError(null);
      onUploaded?.(response.items);
    },
  });

  async function onSubmit(values: UploadDocumentFormValues) {
    setFormError(null);
    const files = Array.from(values.files as FileList | File[]);
    try {
      await mutation.mutateAsync({
        workspaceId: values.workspaceId,
        files,
      });
    } catch (err) {
      if (isApiError(err) && err.code === "VALIDATION_ERROR") {
        setFormError("Файл отклонён: формат, размер или число файлов.");
      } else if (isApiError(err) && err.status === 404) {
        setFormError("Нет права загружать в этот проект.");
      } else {
        setFormError("Не удалось загрузить. Попробуйте ещё раз.");
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className={styles.field}>
        <Select
          id="document-workspace"
          label="Проект"
          disabled={isSubmitting || Boolean(workspaceId)}
          {...register("workspaceId")}
        >
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.name}
            </option>
          ))}
        </Select>
        {errors.workspaceId?.message ? (
          <p role="alert" className={styles.error}>
            {errors.workspaceId.message}
          </p>
        ) : null}
      </div>

      <Controller
        name="files"
        control={control}
        render={({ field: { onChange, name } }) => (
          <Input
            id="document-files"
            label="Файлы (PDF, DOCX, TXT)"
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,text/plain"
            multiple
            name={name}
            disabled={isSubmitting || workspaces.length === 0}
            error={errors.files?.message as string | undefined}
            onChange={(event) => onChange(event.target.files)}
          />
        )}
      />

      {formError ? (
        <p role="alert" className={styles.error}>
          {formError}
        </p>
      ) : null}
      <Button type="submit" disabled={isSubmitting || workspaces.length === 0}>
        {isSubmitting ? "Загрузка…" : "Загрузить"}
      </Button>
    </form>
  );
}
