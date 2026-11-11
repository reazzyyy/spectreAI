"use client";

import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { clientsListQueryOptions } from "@/entities/client";
import { mattersListQueryOptions } from "@/entities/matter";
import {
  createWorkspace,
  linkWorkspaceMatter,
  workspacesListQueryOptions,
  type Workspace,
  type WorkspaceVisibility,
} from "@/entities/workspace";
import { isApiError } from "@/shared/api";
import { Button, Dialog } from "@/shared/ui";
import { classNames } from "@/shared/lib";
import {
  createWorkspaceSchema,
  type CreateWorkspaceFormValues,
} from "../model/create-workspace-schema";
import { EntityPicker } from "./entity-picker";
import styles from "./create-workspace-form.module.scss";

export interface CreateWorkspaceFormProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (workspace: Workspace) => void;
  /** Prefill from list filter PERSONAL|TEAM. */
  defaultVisibility?: WorkspaceVisibility;
  /** Prefill name (e.g. from command palette empty-state create). */
  defaultName?: string;
}

/**
 * Create Workspace modal (Make CreateProjectDialog) → POST /workspaces (+ optional matter link).
 */
export function CreateWorkspaceForm({
  open,
  onClose,
  onCreated,
  defaultVisibility = "PERSONAL",
  defaultName = "",
}: CreateWorkspaceFormProps) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const clientsQuery = useQuery({
    ...clientsListQueryOptions,
    enabled: open,
  });
  const mattersQuery = useQuery({
    ...mattersListQueryOptions,
    enabled: open,
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateWorkspaceFormValues>({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: {
      name: defaultName,
      description: "",
      visibility: defaultVisibility,
      clientId: "",
      matterId: "",
    },
  });

  const visibility = watch("visibility");
  const clientId = watch("clientId") ?? "";
  const matterId = watch("matterId") ?? "";

  const clientOptions = useMemo(
    () =>
      (clientsQuery.data?.items ?? []).map((c) => ({
        id: c.id,
        name: c.name,
      })),
    [clientsQuery.data?.items],
  );

  const matterOptions = useMemo(() => {
    const items = mattersQuery.data?.items ?? [];
    return items
      .filter((m) => !clientId || !m.clientId || m.clientId === clientId)
      .map((m) => ({ id: m.id, name: m.title }));
  }, [mattersQuery.data?.items, clientId]);

  useEffect(() => {
    if (!open) return;
    reset({
      name: defaultName,
      description: "",
      visibility: defaultVisibility,
      clientId: "",
      matterId: "",
    });
    setFormError(null);
  }, [open, defaultVisibility, defaultName, reset]);

  const mutation = useMutation({
    mutationFn: async (values: CreateWorkspaceFormValues) => {
      const description = values.description?.trim();
      const client =
        values.clientId && values.clientId.length > 0 ? values.clientId : null;
      const workspace = await createWorkspace({
        name: values.name.trim(),
        description: description ? description : null,
        visibility: values.visibility,
        clientId: client,
      });
      const matter =
        values.matterId && values.matterId.length > 0 ? values.matterId : null;
      if (matter) {
        await linkWorkspaceMatter(workspace.id, matter);
      }
      return workspace;
    },
    onSuccess: async (workspace) => {
      await queryClient.invalidateQueries({
        queryKey: workspacesListQueryOptions.queryKey,
      });
      setFormError(null);
      onCreated?.(workspace);
      onClose();
    },
  });

  async function onSubmit(values: CreateWorkspaceFormValues) {
    setFormError(null);
    try {
      await mutation.mutateAsync(values);
    } catch (err) {
      if (isApiError(err) && err.code === "VALIDATION_ERROR") {
        setFormError(
          "Проверьте название, тип, клиента и дело. Чужой client/matter отклоняется API.",
        );
      } else {
        setFormError(
          "Не удалось создать проект. Введённые данные сохранены — попробуйте ещё раз.",
        );
      }
    }
  }

  const nameReg = register("name");
  const busy = isSubmitting || mutation.isPending;

  return (
    <Dialog
      open={open}
      title="Создать проект"
      onClose={onClose}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={onClose}
          >
            Отмена
          </Button>
          <Button type="submit" form="create-workspace-form" disabled={busy}>
            {busy ? "Создание…" : formError ? "Повторить" : "Создать"}
          </Button>
        </>
      }
    >
      <form
        id="create-workspace-form"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        aria-busy={busy}
      >
        <div className={styles.field}>
          <label className={styles.label} htmlFor="workspace-name">
            Название
          </label>
          <input
            id="workspace-name"
            className={styles.control}
            autoComplete="off"
            maxLength={160}
            disabled={busy}
            data-autofocus
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "workspace-name-error" : undefined}
            {...nameReg}
          />
          {errors.name?.message ? (
            <p id="workspace-name-error" className={styles.fieldError} role="alert">
              {errors.name.message}
            </p>
          ) : null}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="workspace-description">
            Описание <span className={styles.optional}>· необязательно</span>
          </label>
          <textarea
            id="workspace-description"
            className={classNames(styles.control, styles.textarea)}
            rows={2}
            maxLength={2000}
            disabled={busy}
            {...register("description")}
          />
          {errors.description?.message ? (
            <p className={styles.fieldError} role="alert">
              {errors.description.message}
            </p>
          ) : null}
        </div>

        <div className={styles.field}>
          <span className={styles.label} id="workspace-visibility-label">
            Тип
          </span>
          <div
            className={styles.segmented}
            role="radiogroup"
            aria-labelledby="workspace-visibility-label"
          >
            {(
              [
                ["PERSONAL", "Личное"],
                ["TEAM", "Командное"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={visibility === value}
                className={classNames(
                  styles.segment,
                  visibility === value && styles.segmentActive,
                )}
                disabled={busy}
                onClick={() =>
                  setValue("visibility", value, { shouldValidate: true })
                }
              >
                {label}
              </button>
            ))}
          </div>
          <input type="hidden" {...register("visibility")} />
          <p className={styles.help}>
            {visibility === "PERSONAL"
              ? "Проект виден только вам."
              : "Доступ получат только добавленные участники. Администратор организации не получает доступ к содержимому автоматически."}
          </p>
        </div>

        <EntityPicker
          label="Клиент"
          options={clientOptions}
          value={clientId}
          disabled={busy || clientsQuery.isPending}
          placeholder={
            clientsQuery.isPending ? "Загрузка клиентов…" : "Найдите клиента"
          }
          onChange={(id) => {
            setValue("clientId", id, { shouldValidate: true });
            const matter = mattersQuery.data?.items.find((m) => m.id === matterId);
            if (matter?.clientId && id && matter.clientId !== id) {
              setValue("matterId", "", { shouldValidate: true });
            }
          }}
        />

        <EntityPicker
          label="Юридическое дело"
          options={matterOptions}
          value={matterId}
          disabled={busy || mattersQuery.isPending}
          placeholder={
            mattersQuery.isPending ? "Загрузка дел…" : "Найдите дело"
          }
          onChange={(id) => {
            setValue("matterId", id, { shouldValidate: true });
            const matter = mattersQuery.data?.items.find((m) => m.id === id);
            if (matter?.clientId && !clientId) {
              setValue("clientId", matter.clientId, { shouldValidate: true });
            }
          }}
        />

        {formError ? (
          <p role="alert" className={styles.error}>
            {formError}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
