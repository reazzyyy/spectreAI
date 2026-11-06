"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { logout } from "@/entities/session";
import { Button } from "@/shared/ui";

/** Calls POST /auth/logout then navigates to /login. */
export function LogoutButton() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  async function onLogout() {
    setPending(true);
    try {
      await logout();
    } catch {
      // Cookie clear is best-effort; still leave the UI.
    } finally {
      await queryClient.resetQueries({ queryKey: ["session"] });
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <Button type="button" variant="secondary" onClick={() => void onLogout()} disabled={pending}>
      {pending ? "Выход…" : "Выйти"}
    </Button>
  );
}
