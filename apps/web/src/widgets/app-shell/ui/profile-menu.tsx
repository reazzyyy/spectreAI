"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { logout, type AuthSession } from "@/entities/session";
import { displayNameFromEmail, orgRoleLabel } from "@/shared/lib";
import { Avatar, Icon } from "@/shared/ui";
import styles from "./app-shell.module.scss";

export interface ProfileMenuProps {
  session: AuthSession;
  collapsed: boolean;
}

/**
 * Make ProfileMenu: avatar + name/org in sidebar; fixed popup with org/home/logout.
 * Display name is derived from email until User.name exists in the API.
 */
export function ProfileMenu({ session, collapsed }: ProfileMenuProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const displayName = displayNameFromEmail(session.user.email);
  const orgName = session.organization.name || "Организация";

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function onLogout() {
    setLogoutPending(true);
    try {
      await logout();
    } catch {
      /* best-effort cookie clear */
    } finally {
      await queryClient.resetQueries({ queryKey: ["session"] });
      setOpen(false);
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <div className={styles.profileMenuAnchor} ref={ref}>
      <button
        type="button"
        className={styles.profileTrigger}
        aria-label="Меню профиля"
        aria-expanded={open}
        aria-haspopup="menu"
        title={`${displayName} · ${orgName}`}
        onClick={() => setOpen((v) => !v)}
      >
        <Avatar label={session.user.email} />
        {!collapsed ? (
          <span className={styles.profileText}>
            <strong>{displayName}</strong>
            <small>{orgName}</small>
          </span>
        ) : null}
      </button>

      {open ? (
        <div className={styles.profileMenu} role="menu">
          <div className={styles.profileMenuHeading}>
            <strong>{displayName}</strong>
            <small>{session.user.email}</small>
            <span>{orgRoleLabel(session.organization.role)}</span>
          </div>
          <Link
            href="/organization"
            role="menuitem"
            className={styles.profileMenuItem}
            onClick={() => setOpen(false)}
          >
            <Icon name="users" size={16} />
            Организация и сотрудники
          </Link>
          <Link
            href="/"
            role="menuitem"
            className={styles.profileMenuItem}
            onClick={() => setOpen(false)}
          >
            <Icon name="home" size={16} />
            На главную
          </Link>
          <button
            type="button"
            role="menuitem"
            className={styles.profileMenuItem}
            disabled={logoutPending}
            onClick={() => void onLogout()}
          >
            <Icon name="arrow" size={16} />
            {logoutPending ? "Выход…" : "Выйти"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
