"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { login } from "@/entities/session";
import { isApiError } from "@/shared/api";
import { Button, Icon, Input } from "@/shared/ui";
import {
  loginSchema,
  type LoginFormValues,
} from "../model/login-schema";
import styles from "./login-form.module.scss";

/**
 * Login: email + password + organizationId via RHF+Zod (D-024) → POST /auth/login.
 * Layout/copy aligned with Make auth card; no demo fill / fake recovery.
 */
export function LoginForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
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
        setFormError(
          "Не удалось войти. Проверьте email, пароль и организацию или восстановите доступ.",
        );
      } else if (isApiError(err) && err.code === "VALIDATION_ERROR") {
        setFormError("Проверьте формат email и UUID организации.");
      } else {
        setFormError("Не удалось войти. Попробуйте ещё раз.");
      }
    }
  }

  const passwordReg = register("password");

  return (
    <form
      className={styles.form}
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      aria-busy={isSubmitting}
    >
      <p className={styles.intro}>
        Используйте аккаунт своей организации. Свободной регистрации в MVP нет.
      </p>

      <Input
        id="email"
        label="Рабочий email"
        type="email"
        autoComplete="username"
        placeholder="name@example.test"
        disabled={isSubmitting}
        error={errors.email?.message}
        {...register("email")}
      />

      <Input
        id="organizationId"
        label="ID организации"
        type="text"
        autoComplete="organization"
        spellCheck={false}
        disabled={isSubmitting}
        hint="UUID организации из membership (W-011)."
        error={errors.organizationId?.message}
        {...register("organizationId")}
      />

      <div>
        <label className={styles.fieldLabel} htmlFor="password">
          Пароль
        </label>
        <div className={styles.passwordWrap}>
          <input
            id="password"
            className={styles.passwordInput}
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            disabled={isSubmitting}
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? "password-error" : undefined}
            {...passwordReg}
          />
          <button
            type="button"
            className={styles.toggle}
            disabled={isSubmitting}
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? "Скрыть" : "Показать"}
          </button>
        </div>
        {errors.password?.message ? (
          <p id="password-error" className={styles.error} role="alert">
            {errors.password.message}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        className={styles.forgot}
        disabled
        title="Восстановление пароля — в следующем срезе"
      >
        Забыли пароль?
      </button>

      {formError ? (
        <p role="alert" className={styles.error}>
          {formError}
        </p>
      ) : null}

      <Button type="submit" className={styles.submit} disabled={isSubmitting}>
        {isSubmitting ? "Обрабатываем…" : "Войти"}
        <Icon name="arrow" size={16} />
      </Button>

      <div className={styles.note}>
        <p>
          Режим synthetic/test: ответы моделей и обработка идут через
          SyntheticAIProvider до закрытия O-002.
        </p>
      </div>
    </form>
  );
}
