"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { login } from "@/entities/session";
import { isApiError } from "@/shared/api";
import { Button, Input } from "@/shared/ui";
import {
  loginSchema,
  type LoginFormValues,
} from "../model/login-schema";

/**
 * Login: email + password + organizationId via RHF+Zod (D-024) → POST /auth/login.
 * Uniform failure copy — do not enumerate accounts (matches API 401).
 */
export function LoginForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      organizationId: "",
    },
  });

  async function onSubmit(values: LoginFormValues) {
    setFormError(null);
    try {
      await login({
        email: values.email.trim(),
        password: values.password,
        organizationId: values.organizationId.trim(),
      });
      router.replace("/");
      router.refresh();
    } catch (err) {
      if (isApiError(err) && (err.status === 401 || err.code === "UNAUTHENTICATED")) {
        setFormError("Неверный email, пароль или организация.");
      } else if (isApiError(err) && err.code === "VALIDATION_ERROR") {
        setFormError("Проверьте формат email и UUID организации.");
      } else {
        setFormError("Не удалось войти. Попробуйте ещё раз.");
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Input
        id="email"
        label="Email"
        type="email"
        autoComplete="username"
        disabled={isSubmitting}
        error={errors.email?.message}
        {...register("email")}
      />
      <Input
        id="password"
        label="Пароль"
        type="password"
        autoComplete="current-password"
        disabled={isSubmitting}
        error={errors.password?.message}
        {...register("password")}
      />
      <Input
        id="organizationId"
        label="ID организации"
        type="text"
        autoComplete="off"
        spellCheck={false}
        disabled={isSubmitting}
        hint="UUID организации из membership (scaffold; product seed/invite UI ещё впереди)."
        error={errors.organizationId?.message}
        {...register("organizationId")}
      />
      {formError ? (
        <p role="alert" className="form-error">
          {formError}
        </p>
      ) : null}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Вход…" : "Войти"}
      </Button>
    </form>
  );
}
