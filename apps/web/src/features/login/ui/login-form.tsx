"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/entities/session";
import { isApiError } from "@/shared/api";

/**
 * Scaffold login: email + password + organizationId (existing POST /auth/login).
 * Uniform failure copy — do not enumerate accounts (matches API 401).
 */
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      await login({
        email: email.trim(),
        password,
        organizationId: organizationId.trim(),
      });
      router.replace("/");
      router.refresh();
    } catch (err) {
      if (isApiError(err) && (err.status === 401 || err.code === "UNAUTHENTICATED")) {
        setError("Неверный email, пароль или организация.");
      } else if (isApiError(err) && err.code === "VALIDATION_ERROR") {
        setError("Проверьте формат email и UUID организации.");
      } else {
        setError("Не удалось войти. Попробуйте ещё раз.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={pending}
        />
      </div>
      <div className="field">
        <label htmlFor="password">Пароль</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={pending}
        />
      </div>
      <div className="field">
        <label htmlFor="organizationId">ID организации</label>
        <input
          id="organizationId"
          name="organizationId"
          type="text"
          autoComplete="off"
          required
          spellCheck={false}
          value={organizationId}
          onChange={(e) => setOrganizationId(e.target.value)}
          disabled={pending}
          aria-describedby="organizationId-hint"
        />
        <p id="organizationId-hint" className="hint">
          UUID организации из membership (scaffold; способ входа ещё не CONFIRMED).
        </p>
      </div>
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={pending}>
        {pending ? "Вход…" : "Войти"}
      </button>
    </form>
  );
}
