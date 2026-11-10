"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { sessionMeQueryOptions } from "@/entities/session";
import { LogoutButton } from "@/features/logout";
import { isApiError } from "@/shared/api";
import { Icon, SyntheticModeBanner } from "@/shared/ui";
import { classNames } from "@/shared/lib";
import styles from "./app-shell.module.scss";

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
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1000px)");
    const sync = () => setCollapsed(mq.matches);
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

  return (
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

        <Link
          href="/projects"
          className={styles.sideSearch}
          title="Поиск проектов на странице списка"
          aria-label="Поиск проектов"
        >
          <Icon name="search" size={16} />
          <span className={styles.sideSearchLabel}>Поиск</span>
          <kbd className={styles.sideSearchKbd}>Ctrl K</kbd>
        </Link>

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
          </Link>

          <p className={styles.navGroup}>Дела</p>
          <Link
            href="/matters"
            className={classNames(styles.navItem, mattersActive && styles.navItemActive)}
            title="Все дела"
          >
            <Icon name="folder" />
            <span className={styles.navLabel}>Все дела</span>
          </Link>

          <p className={styles.navGroup}>Клиенты</p>
          <Link
            href="/clients"
            className={classNames(styles.navItem, clientsActive && styles.navItemActive)}
            title="Все клиенты"
          >
            <Icon name="users" />
            <span className={styles.navLabel}>Все клиенты</span>
          </Link>

          <p className={styles.navGroup}>Документы</p>
          <Link
            href="/documents"
            className={classNames(
              styles.navItem,
              documentsActive && styles.navItemActive,
            )}
            title="Документы"
          >
            <Icon name="folder" />
            <span className={styles.navLabel}>Библиотека</span>
          </Link>

          <p className={styles.navGroup}>Служебное</p>
          <Link href="/system" className={styles.navItem} title="Карта системы">
            <Icon name="map" />
            <span className={styles.navLabel}>Карта системы</span>
          </Link>
        </nav>

        <div className={styles.sidebarBottom}>
          <Link
            href="/organization"
            className={classNames(
              styles.navItem,
              organizationActive && styles.navItemActive,
            )}
            title="Организация"
          >
            <Icon name="users" />
            <span className={styles.navLabel}>Организация</span>
          </Link>

          <div className={styles.profile}>
            <Icon name="user" size={16} />
            <div className={styles.profileMeta}>
              <span className={styles.profileEmail} title={data.user.email}>
                {data.user.email}
              </span>
            </div>
            <button
              type="button"
              className={styles.iconButton}
              aria-label={collapsed ? "Развернуть навигацию" : "Свернуть навигацию"}
              onClick={() => setCollapsed((value) => !value)}
            >
              <Icon name="sidebar" size={16} />
            </button>
          </div>
          <LogoutButton />
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <SyntheticModeBanner />
          <span className={styles.topbarMeta} aria-hidden>
            {data.organization.role}
          </span>
        </header>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
