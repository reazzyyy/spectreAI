import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/widgets/app-shell";

/** Authenticated product chrome (shell). Login/system stay outside this group. */
export default function ProductLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div role="status">Загрузка…</div>}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
