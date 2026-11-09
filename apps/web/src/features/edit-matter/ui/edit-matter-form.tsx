"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
  matterDetailQueryOptions,
  mattersListQueryOptions,
  updateMatter,
  type Matter,
} from "@/entities/matter";
import { isApiError } from "@/shared/api";
import { Button, Input } from "@/shared/ui";
import {
  editMatterSchema,
  type EditMatterFormValues,
} from "../model/edit-matter-schema";
import styles from "./edit-matter-form.module.scss";

export interface EditMatterFormProps {
  matter: Matter;
}

/** Edit Matter title/status via PATCH /matters/:id. */
export function EditMatterForm({ matter }: EditMatterFormProps) {
  const queryClient = useQueryClient();
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
    defaultValues: { title: matter.title, status },
  });

  useEffect(() => {
    reset({
      title: matter.title,
      status: matter.status === "archived" ? "archived" : "active",
    });
  }, [matter.id, matter.title, matter.status, reset]);

  const mutation = useMutation({
    mutationFn: (values: EditMatterFormValues) =>
      updateMatter(matter.id, {
        title: values.title.trim(),
        status: values.status,
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
        setFormError("Проверьте название и статус.");
      } else {
        setFormError("Не удалось сохранить. Попробуйте ещё раз.");
      }
    }
  }

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
      <div className={styles.field}>
        <label className={styles.label} htmlFor="edit-matter-status">
          Статус
        </label>
        <select
          id="edit-matter-status"
          className={styles.select}
          disabled={isSubmitting}
          {...register("status")}
        >
          <option value="active">active</option>
          <option value="archived">archived</option>
        </select>
        {errors.status?.message ? (
          <p role="alert" className="form-error">
            {errors.status.message}
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
