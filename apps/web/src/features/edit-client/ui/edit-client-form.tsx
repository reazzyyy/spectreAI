"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
  clientDetailQueryOptions,
  clientsListQueryOptions,
  updateClient,
  type Client,
} from "@/entities/client";
import { isApiError } from "@/shared/api";
import { Button, Input } from "@/shared/ui";
import {
  editClientSchema,
  type EditClientFormValues,
} from "../model/edit-client-schema";
import styles from "./edit-client-form.module.scss";

export interface EditClientFormProps {
  client: Client;
}

/** Edit Client name/status via PATCH /clients/:id. */
export function EditClientForm({ client }: EditClientFormProps) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<EditClientFormValues>({
    resolver: zodResolver(editClientSchema),
    defaultValues: {
      name: client.name,
      status: client.status === "archived" ? "archived" : "active",
    },
  });

  useEffect(() => {
    reset({
      name: client.name,
      status: client.status === "archived" ? "archived" : "active",
    });
  }, [client.id, client.name, client.status, reset]);

  const mutation = useMutation({
    mutationFn: (values: EditClientFormValues) =>
      updateClient(client.id, {
        name: values.name.trim(),
        status: values.status,
      }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(
        clientDetailQueryOptions(client.id).queryKey,
        updated,
      );
      await queryClient.invalidateQueries({
        queryKey: clientsListQueryOptions.queryKey,
      });
      reset({
        name: updated.name,
        status: updated.status === "archived" ? "archived" : "active",
      });
      setFormError(null);
      setSaved(true);
    },
  });

  async function onSubmit(values: EditClientFormValues) {
    setSaved(false);
    setFormError(null);
    try {
      await mutation.mutateAsync(values);
    } catch (err) {
      if (isApiError(err) && (err.status === 404 || err.code === "NOT_FOUND")) {
        setFormError("Клиент не найден или недоступен.");
      } else if (isApiError(err) && err.code === "VALIDATION_ERROR") {
        setFormError("Проверьте название и статус.");
      } else {
        setFormError("Не удалось сохранить. Попробуйте ещё раз.");
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Input
        id="edit-client-name"
        label="Название"
        autoComplete="organization"
        disabled={isSubmitting}
        error={errors.name?.message}
        {...register("name")}
      />
      <div className={styles.field}>
        <label className={styles.label} htmlFor="edit-client-status">
          Статус
        </label>
        <select
          id="edit-client-status"
          className={styles.select}
          disabled={isSubmitting}
          {...register("status")}
        >
          <option value="active">active</option>
          <option value="archived">archived</option>
        </select>
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
