"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  SessionMeta,
  sessionMeQueryOptions,
} from "@/entities/session";
import { LogoutButton } from "@/features/logout";
import { isApiError } from "@/shared/api";

/**
 * Home session block: GET /auth/me via TanStack Query; 401 → /login.
 */
export function SessionPanel() {
  const router = useRouter();
  const { data, error, isPending, isError } = useQuery(sessionMeQueryOptions);

  useEffect(() => {
    if (!isError || !error) return;
    if (isApiError(error) && (error.status === 401 || error.code === "UNAUTHENTICATED")) {
      router.replace("/login");
    }
  }, [error, isError, router]);

  if (isPending) {
    return <p role="status">Проверка сессии…</p>;
  }

  if (isError) {
    if (isApiError(error) && (error.status === 401 || error.code === "UNAUTHENTICATED")) {
      return <p role="status">Перенаправление на вход…</p>;
    }
    return (
      <div>
        <p role="alert">Не удалось загрузить сессию.</p>
        <p>
          <a href="/login">Перейти ко входу</a>
        </p>
      </div>
    );
  }

  return (
    <section aria-labelledby="session-heading">
      <h2 id="session-heading">Сессия</h2>
      <SessionMeta session={data} />
      <LogoutButton />
    </section>
  );
}
