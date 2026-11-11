"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { clientsListQueryOptions } from "@/entities/client";
import {
  matterDetailQueryOptions,
  mattersListQueryOptions,
  updateMatter,
  type Matter,
} from "@/entities/matter";
import { isApiError } from "@/shared/api";
import { Button, Input, Select } from "@/shared/ui";
import {
  editMatterSchema,
  type EditMatterFormValues,
} from "../model/edit-matter-schema";
import styles from "./edit-matter-form.module.scss";

export interface EditMatterFormProps {
  matter: Matter;
}

/** Edit Matter title/status/client via PATCH /matters/:id (F5f). */
export function EditMatterForm({ matter }: EditMatterFormProps) {
  const queryClient = useQueryClient();
  const clientsQuery = useQuery(clientsListQueryOptions);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const status =
    matter.status === "archived" ? "archived" : ("active" as const);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<EditMatterFormValues>({
    resolver: zodResolver(editMatterSchema),
    defaultValues: {
      title: matter.title,
      status,
      clientId: matter.clientId ?? "",
    },
  });

  useEffect(() => {
    reset({
      title: matter.title,
      status: matter.status === "archived" ? "archived" : "active",
      clientId: matter.clientId ?? "",
    });
  }, [matter.id, matter.title, matter.status, matter.clientId, reset]);

  const mutation = useMutation({
    mutationFn: (values: EditMatterFormValues) =>
      updateMatter(matter.id, {
        title: values.title.trim(),
        status: values.status,
        clientId: values.clientId === "" ? null : values.clientId,
      }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(
        matterDetailQueryOptions(matter.id).queryKey,
        updated,
      );
      await queryClient.invalidateQueries({
        queryKey: mattersListQueryOptions.queryKey,
      });
      reset({
        title: updated.title,
        status: updated.status === "archived" ? "archived" : "active",
        clientId: updated.clientId ?? "",
      });
      setFormError(null);
      setSaved(true);
    },
  });

  async function onSubmit(values: EditMatterFormValues) {
    setSaved(false);
    setFormError(null);
    try {
      await mutation.mutateAsync(values);
    } catch (err) {
      if (isApiError(err) && (err.status === 404 || err.code === "NOT_FOUND")) {
        setFormError("Дело не найдено или недоступно.");
      } else if (isApiError(err) && err.code === "VALIDATION_ERROR") {
        setFormError("Проверьте название, статус и клиента.");
      } else {
        setFormError("Не удалось сохранить. Попробуйте ещё раз.");
      }
    }
  }

  const clients = clientsQuery.data?.items ?? [];

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Input
        id="edit-matter-title"
        label="Название"
        autoComplete="off"
        disabled={isSubmitting}
        error={errors.title?.message}
        {...register("title")}
      />
      <Select
        id="edit-matter-status"
        label="Статус"
        className={styles.field}
        disabled={isSubmitting}
        {...register("status")}
      >
        <option value="active">active</option>
        <option value="archived">archived</option>
      </Select>
      <div className={styles.field}>
        <Select
          id="edit-matter-client"
          label="Клиент"
          disabled={isSubmitting || clientsQuery.isPending}
          {...register("clientId")}
        >
          <option value="">Без клиента</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </Select>
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
