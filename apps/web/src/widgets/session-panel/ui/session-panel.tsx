"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchMe, SessionMeta, type AuthSession } from "@/entities/session";
import { LogoutButton } from "@/features/logout";
import { isApiError } from "@/shared/api";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; session: AuthSession }
  | { status: "error"; message: string };

/**
 * Home session block: GET /auth/me; 401 → /login; composes entity meta + logout feature.
 */
export function SessionPanel() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const session = await fetchMe();
        if (!cancelled) setState({ status: "ready", session });
      } catch (err) {
        if (cancelled) return;
        if (isApiError(err) && (err.status === 401 || err.code === "UNAUTHENTICATED")) {
          router.replace("/login");
          return;
        }
        setState({
          status: "error",
          message: "Не удалось загрузить сессию.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (state.status === "loading") {
    return <p role="status">Проверка сессии…</p>;
  }

  if (state.status === "error") {
    return (
      <div>
        <p role="alert">{state.message}</p>
        <p>
          <a href="/login">Перейти ко входу</a>
        </p>
      </div>
    );
  }

  return (
    <section aria-labelledby="session-heading">
      <h2 id="session-heading">Сессия</h2>
      <SessionMeta session={state.session} />
      <LogoutButton />
    </section>
  );
}
