"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { sessionMeQueryOptions } from "@/entities/session";
import { workspacesListQueryOptions } from "@/entities/workspace";
import { displayNameFromEmail } from "@/shared/lib";
import { Button, Icon, Page, PageHead, StateCard } from "@/shared/ui";
import styles from "./home-overview.module.scss";

const VISIBILITY_LABEL = {
  PERSONAL: "Личное",
  TEAM: "Команда",
} as const;

/**
 * Home dashboard (Make Home): greeting, «Новая задача» menu, recent rows, attention.
 */
export function HomeOverview() {
  const router = useRouter();
  const { data } = useQuery(sessionMeQueryOptions);
  const workspaces = useQuery(workspacesListQueryOptions);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointer(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  if (!data) return null;

  const firstName = displayNameFromEmail(data.user.email);
  const items = workspaces.data?.items ?? [];

  return (
    <Page>
      <PageHead
        eyebrow={data.organization.name || "Организация"}
        title={`Добрый день, ${firstName}`}
        description="Продолжите работу по проекту или начните новую задачу."
        actions={
          <div className={styles.menuAnchor} ref={menuRef}>
            <Button
              type="button"
              icon="plus"
              onClick={() => setMenuOpen((v) => !v)}
            >
              Новая задача
            </Button>
            {menuOpen ? (
              <div className={styles.menu} role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    setMenuOpen(false);
                    router.push("/projects?create=1");
                  }}
                >
                  <Icon name="folder" size={16} />
                  Создать проект
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  disabled
                  title="Проверка документа — после документов проекта"
                >
                  <Icon name="folder" size={16} />
                  Проверить документ
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  disabled
                  title="Чаты — после Phase 5A"
                >
                  <Icon name="search" size={16} />
                  Задать вопрос
                </button>
              </div>
            ) : null}
          </div>
        }
      />

      <div className={styles.columns}>
        <section>
          <div className={styles.sectionRow}>
            <h2 className={styles.sectionTitle}>Недавние проекты</h2>
            {items.length > 0 ? (
              <Link href="/projects" className={styles.allLink}>
                Все проекты ({items.length})
              </Link>
            ) : null}
          </div>

          {workspaces.isPending ? (
            <p className={styles.attention} role="status">
              Загрузка проектов…
            </p>
          ) : null}

          {!workspaces.isPending && items.length === 0 ? (
            <StateCard
              icon="folder"
              title="У вас пока нет проектов"
              text="Создайте проект: в нём будут чаты, документы и материалы по одной задаче."
            >
              <Link href="/projects?create=1">
                <Button type="button" icon="plus">
                  Создать проект
                </Button>
              </Link>
            </StateCard>
          ) : null}

          {items.length > 0 ? (
            <ul className={styles.rows}>
              {items.slice(0, 5).map((ws) => (
                <li key={ws.id}>
                  <Link href={`/projects/${ws.id}`} className={styles.row}>
                    <span className={styles.rowMain}>
                      <strong>{ws.name}</strong>
                      <span className={styles.rowMeta}>
                        {ws.description?.trim() || "Без описания"}
                      </span>
                    </span>
                    <span className={styles.kind}>
                      {VISIBILITY_LABEL[ws.visibility] ?? ws.visibility}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section>
          <h2 className={styles.sectionTitle}>Требует внимания</h2>
          <p className={styles.attention}>Нет задач, требующих внимания.</p>
        </section>
      </div>
    </Page>
  );
}
