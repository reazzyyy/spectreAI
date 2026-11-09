"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
  createMatter,
  mattersListQueryOptions,
  type Matter,
} from "@/entities/matter";
import { isApiError } from "@/shared/api";
import { Button, Input } from "@/shared/ui";
import {
  createMatterSchema,
  type CreateMatterFormValues,
} from "../model/create-matter-schema";

export interface CreateMatterFormProps {
  onCreated?: (matter: Matter) => void;
}

/** Creates a Matter via POST /matters (CRM-02 thin). Client link — later. */
export function CreateMatterForm({ onCreated }: CreateMatterFormProps) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateMatterFormValues>({
    resolver: zodResolver(createMatterSchema),
    defaultValues: { title: "" },
  });

  const mutation = useMutation({
    mutationFn: createMatter,
    onSuccess: async (matter) => {
      await queryClient.invalidateQueries({
        queryKey: mattersListQueryOptions.queryKey,
      });
      reset();
      setFormError(null);
      onCreated?.(matter);
    },
  });

  async function onSubmit(values: CreateMatterFormValues) {
    setFormError(null);
    try {
      await mutation.mutateAsync({
        title: values.title.trim(),
        status: "active",
      });
    } catch (err) {
      if (isApiError(err) && err.code === "VALIDATION_ERROR") {
        setFormError("Проверьте название дела.");
      } else {
        setFormError("Не удалось создать дело. Попробуйте ещё раз.");
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Input
        id="matter-title"
        label="Название дела"
        autoComplete="off"
        disabled={isSubmitting}
        error={errors.title?.message}
        {...register("title")}
      />
      {formError ? (
        <p role="alert" className="form-error">
          {formError}
        </p>
      ) : null}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Создание…" : "Создать дело"}
      </Button>
    </form>
  );
}
