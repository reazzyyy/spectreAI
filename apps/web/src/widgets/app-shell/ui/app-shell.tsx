"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { sessionMeQueryOptions } from "@/entities/session";
import { workspacesListQueryOptions } from "@/entities/workspace";
import {
  CommandPalette,
  PaletteControllerProvider,
} from "@/features/search-workspaces";
import { isApiError } from "@/shared/api";
import { Icon, IconButton, SyntheticModeBanner } from "@/shared/ui";
import { classNames } from "@/shared/lib";
import styles from "./app-shell.module.scss";
import { ProfileMenu } from "./profile-menu";

export interface AppShellProps {
  children: ReactNode;
}

type VisibilityFilter = "all" | "PERSONAL" | "TEAM";

function projectsHref(visibility: VisibilityFilter): string {
  if (visibility === "all") return "/projects";
  return `/projects?visibility=${visibility}`;
}

/**
 * Product chrome: sidebar + topbar + desktop gate (IA from design reference).
 * Session via TanStack Query; 401 → /login. No demo/localStorage state.
 */
export function AppShell({ children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data, error, isPending, isError } = useQuery(sessionMeQueryOptions);
  const workspaces = useQuery(workspacesListQueryOptions);
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteKey, setPaletteKey] = useState(0);

  const openPalette = useCallback(() => {
    setPaletteKey((k) => k + 1);
    setPaletteOpen(true);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1000px)");
    /** Narrow viewports force collapse; wide screens keep the user's toggle. */
    const sync = () => {
      if (mq.matches) setCollapsed(true);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!isError || !error) return;
    if (isApiError(error) && (error.status === 401 || error.code === "UNAUTHENTICATED")) {
      router.replace("/login");
    }
  }, [error, isError, router]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteKey((k) => k + 1);
        setPaletteOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (isPending) {
    return (
      <div className={styles.loading} role="status">
        Проверка сессии…
      </div>
    );
  }

  if (isError) {
    if (isApiError(error) && (error.status === 401 || error.code === "UNAUTHENTICATED")) {
      return (
        <div className={styles.redirect} role="status">
          Перенаправление на вход…
        </div>
      );
    }
    return (
      <div className={styles.loading}>
        <p role="alert">Не удалось загрузить сессию.</p>
        <p>
          <a href="/login">Перейти ко входу</a>
        </p>
      </div>
    );
  }

  const homeActive = pathname === "/";
  const onProjects = pathname === "/projects" || pathname.startsWith("/projects/");
  const listVisibility = (searchParams.get("visibility") ?? "").toUpperCase();
  const projectsAllActive =
    pathname === "/projects" && listVisibility !== "PERSONAL" && listVisibility !== "TEAM";
  const projectsPersonalActive = pathname === "/projects" && listVisibility === "PERSONAL";
  const projectsTeamActive = pathname === "/projects" && listVisibility === "TEAM";
  const mattersActive = pathname === "/matters" || pathname.startsWith("/matters/");
  const clientsActive = pathname === "/clients" || pathname.startsWith("/clients/");
  const documentsActive =
    pathname === "/documents" || pathname.startsWith("/documents/");
  const organizationActive =
    pathname === "/organization" || pathname.startsWith("/organization/");
  const systemActive = pathname === "/system" || pathname.startsWith("/system/");
  const wsItems = workspaces.data?.items ?? [];
  const personalCount = wsItems.filter((w) => w.visibility === "PERSONAL").length;
  const teamCount = wsItems.filter((w) => w.visibility === "TEAM").length;
  const recentNav = wsItems.slice(0, 5);

  return (
    <PaletteControllerProvider openPalette={openPalette}>
    <div className={styles.shell}>
      <div className={styles.desktopRequired}>
        <span className={styles.brandMark} aria-hidden>
          С
        </span>
        <h1>Рабочее пространство для большого экрана</h1>
        <p>
          Макет рассчитан на ширину от 1280 px. Увеличьте окно или откройте его на
          компьютере. Полный мобильный редактор не входит в текущий MVP.
        </p>
      </div>

      <aside
        className={classNames(styles.sidebar, collapsed && styles.collapsed)}
        aria-label="Основная навигация"
      >
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden>
            С
          </span>
          <span className={styles.navLabel}>Спектр</span>
        </div>

        <button
          type="button"
          className={styles.sideSearch}
          title="Поиск проектов"
          aria-label="Поиск проектов"
          aria-haspopup="dialog"
          aria-expanded={paletteOpen}
          onClick={openPalette}
        >
          <Icon name="search" size={16} />
          <span className={styles.sideSearchLabel}>Поиск</span>
          <kbd className={styles.sideSearchKbd}>Ctrl K</kbd>
        </button>

        <Link
          href="/projects?create=1"
          className={styles.sideCreate}
          title="Создать проект"
        >
          <Icon name="plus" size={16} />
          <span className={styles.navLabel}>Создать проект</span>
        </Link>

        <nav className={styles.nav}>
          <Link
            href="/"
            className={classNames(styles.navItem, homeActive && styles.navItemActive)}
            title="Главная"
          >
            <Icon name="home" />
            <span className={styles.navLabel}>Главная</span>
          </Link>

          {!collapsed && recentNav.length > 0 ? (
            <>
              <p className={styles.navGroup}>Недавние</p>
              {recentNav.map((ws) => (
                <Link
                  key={ws.id}
                  href={`/projects/${ws.id}`}
                  className={classNames(
                    styles.navItem,
                    styles.navItemRecent,
                    pathname.startsWith(`/projects/${ws.id}`) &&
                      styles.navItemActive,
                  )}
                  title={ws.name}
                >
                  <span className={styles.navLabel}>{ws.name}</span>
                </Link>
              ))}
            </>
          ) : null}

          <p className={styles.navGroup}>Проекты</p>
          <Link
            href={projectsHref("all")}
            className={classNames(
              styles.navItem,
              (projectsAllActive || (onProjects && pathname !== "/projects")) &&
                styles.navItemActive,
            )}
            title="Все проекты"
            aria-current={projectsAllActive ? "page" : undefined}
          >
            <Icon name="folder" />
            <span className={styles.navLabel}>Все проекты</span>
          </Link>
          <Link
            href={projectsHref("PERSONAL")}
            className={classNames(
              styles.navItem,
              projectsPersonalActive && styles.navItemActive,
            )}
            title="Личные"
            aria-current={projectsPersonalActive ? "page" : undefined}
          >
            <Icon name="user" />
            <span className={styles.navLabel}>Личные</span>
            {!collapsed ? (
              <span className={styles.navCount}>{personalCount}</span>
            ) : null}
          </Link>
          <Link
            href={projectsHref("TEAM")}
            className={classNames(
              styles.navItem,
              projectsTeamActive && styles.navItemActive,
            )}
            title="Проекты команды"
            aria-current={projectsTeamActive ? "page" : undefined}
          >
            <Icon name="users" />
            <span className={styles.navLabel}>Проекты команды</span>
            {!collapsed ? (
              <span className={styles.navCount}>{teamCount}</span>
            ) : null}
          </Link>

          <p className={styles.navGroup}>Справочники</p>
          <Link
            href="/clients"
            className={classNames(styles.navItem, clientsActive && styles.navItemActive)}
            title="Клиенты"
          >
            <Icon name="users" />
            <span className={styles.navLabel}>Клиенты</span>
          </Link>
          <Link
            href="/matters"
            className={classNames(styles.navItem, mattersActive && styles.navItemActive)}
            title="Юридические дела"
          >
            <Icon name="folder" />
            <span className={styles.navLabel}>Юридические дела</span>
          </Link>
          <Link
            href="/documents"
            className={classNames(
              styles.navItem,
              documentsActive && styles.navItemActive,
            )}
            title="Библиотека документов"
          >
            <Icon name="folder" />
            <span className={styles.navLabel}>Документы</span>
          </Link>
        </nav>

        <div className={styles.sidebarBottom}>
          <Link
            href="/organization"
            className={classNames(
              styles.navItem,
              organizationActive && styles.navItemActive,
            )}
            title="Организация и сотрудники"
          >
            <Icon name="users" />
            <span className={styles.navLabel}>Организация</span>
          </Link>
          <Link
            href="/system"
            className={classNames(styles.navItem, systemActive && styles.navItemActive)}
            title="Карта системы"
          >
            <Icon name="map" />
            <span className={styles.navLabel}>Карта системы</span>
          </Link>

          <div className={styles.profile}>
            <ProfileMenu session={data} collapsed={collapsed} />
            <IconButton
              icon="sidebar"
              label={
                collapsed ? "Развернуть навигацию" : "Свернуть навигацию"
              }
              onClick={() => setCollapsed((value) => !value)}
            />
          </div>
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <SyntheticModeBanner />
          <div className={styles.topActions}>
            <IconButton
              icon="search"
              label="Поиск проектов (Ctrl K)"
              size={18}
              onClick={openPalette}
            />
          </div>
        </header>
        <div className={styles.content}>{children}</div>
      </div>

      <CommandPalette
        key={paletteKey}
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
    </div>
    </PaletteControllerProvider>
  );
}
