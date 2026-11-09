"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
  clientsListQueryOptions,
  createClient,
  type Client,
} from "@/entities/client";
import { isApiError } from "@/shared/api";
import { Button, Input } from "@/shared/ui";
import {
  createClientSchema,
  type CreateClientFormValues,
} from "../model/create-client-schema";

export interface CreateClientFormProps {
  onCreated?: (client: Client) => void;
}

/** Creates a Client via POST /clients (CRM-01 thin). */
export function CreateClientForm({ onCreated }: CreateClientFormProps) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateClientFormValues>({
    resolver: zodResolver(createClientSchema),
    defaultValues: { name: "" },
  });

  const mutation = useMutation({
    mutationFn: createClient,
    onSuccess: async (client) => {
      await queryClient.invalidateQueries({
        queryKey: clientsListQueryOptions.queryKey,
      });
      reset();
      setFormError(null);
      onCreated?.(client);
    },
  });

  async function onSubmit(values: CreateClientFormValues) {
    setFormError(null);
    try {
      await mutation.mutateAsync({
        name: values.name.trim(),
        status: "active",
      });
    } catch (err) {
      if (isApiError(err) && err.code === "VALIDATION_ERROR") {
        setFormError("Проверьте название клиента.");
      } else {
        setFormError("Не удалось создать клиента. Попробуйте ещё раз.");
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Input
        id="client-name"
        label="Название"
        autoComplete="organization"
        disabled={isSubmitting}
        error={errors.name?.message}
        {...register("name")}
      />
      {formError ? (
        <p role="alert" className="form-error">
          {formError}
        </p>
      ) : null}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Создание…" : "Создать клиента"}
      </Button>
    </form>
  );
}
