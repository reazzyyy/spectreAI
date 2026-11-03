"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { logout } from "@/entities/session";

/** Calls POST /auth/logout then navigates to /login. */
export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onLogout() {
    setPending(true);
    try {
      await logout();
    } catch {
      // Cookie clear is best-effort; still leave the UI.
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <button type="button" onClick={() => void onLogout()} disabled={pending}>
      {pending ? "Выход…" : "Выйти"}
    </button>
  );
}
