"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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

/**
 * Product chrome from Make: sidebar + topbar + desktop gate.
 * Requires session via TanStack Query; 401 → /login. No demo/localStorage state.
 */
export function AppShell({ children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
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
  const projectsActive = pathname === "/projects" || pathname.startsWith("/projects/");
  const mattersActive = pathname === "/matters" || pathname.startsWith("/matters/");

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

        <button
          type="button"
          className={styles.sideSearch}
          disabled
          title="Поиск проектов появится в следующем срезе"
          aria-label="Поиск проектов (скоро)"
        >
          <Icon name="search" size={16} />
          <span className={styles.sideSearchLabel}>Поиск</span>
          <kbd className={styles.sideSearchKbd}>Ctrl K</kbd>
        </button>

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
            href="/projects"
            className={classNames(styles.navItem, projectsActive && styles.navItemActive)}
            title="Все проекты"
          >
            <Icon name="folder" />
            <span className={styles.navLabel}>Все проекты</span>
          </Link>
          <button
            type="button"
            className={styles.navItem}
            disabled
            title="Скоро"
          >
            <Icon name="user" />
            <span className={styles.navLabel}>Личные</span>
          </button>
          <button
            type="button"
            className={styles.navItem}
            disabled
            title="Скоро"
          >
            <Icon name="users" />
            <span className={styles.navLabel}>Проекты команды</span>
          </button>

          <p className={styles.navGroup}>Дела</p>
          <Link
            href="/matters"
            className={classNames(styles.navItem, mattersActive && styles.navItemActive)}
            title="Все дела"
          >
            <Icon name="folder" />
            <span className={styles.navLabel}>Все дела</span>
          </Link>

          <p className={styles.navGroup}>Служебное</p>
          <Link href="/system" className={styles.navItem} title="Карта системы">
            <Icon name="map" />
            <span className={styles.navLabel}>Карта системы</span>
          </Link>
        </nav>

        <div className={styles.sidebarBottom}>
          <button
            type="button"
            className={styles.navItem}
            disabled
            title="Организация — следующий срез"
          >
            <Icon name="users" />
            <span className={styles.navLabel}>Организация</span>
          </button>

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
          <span className="muted" aria-hidden>
            {data.organization.role}
          </span>
        </header>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
