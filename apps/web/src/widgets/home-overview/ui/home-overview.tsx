"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { SessionMeta, sessionMeQueryOptions } from "@/entities/session";
import { workspacesListQueryOptions } from "@/entities/workspace";
import { Button } from "@/shared/ui";
import styles from "./home-overview.module.scss";

/**
 * Home dashboard (Make Home): greeting + recent workspaces + session.
 * Full projects UI lives on /projects (F5a).
 */
export function HomeOverview() {
  const { data } = useQuery(sessionMeQueryOptions);
  const workspaces = useQuery(workspacesListQueryOptions);
  if (!data) return null;

  const firstName = data.user.email.split("@")[0] ?? data.user.email;
  const items = workspaces.data?.items ?? [];

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div>
          <p className={styles.org}>
            Организация · <code>{data.organization.id}</code>
          </p>
          <h1>Добрый день, {firstName}</h1>
          <p className="lead">
            Продолжите работу по проекту или начните новую задачу.
          </p>
        </div>
        <Link href="/projects">
          <Button type="button">Новая задача</Button>
        </Link>
      </div>

      <div className={styles.columns}>
        <section>
          <h2 className={styles.sectionTitle}>Недавние проекты</h2>
          {workspaces.isPending ? (
            <p className={styles.attention}>Загрузка проектов…</p>
          ) : null}
          {!workspaces.isPending && items.length === 0 ? (
            <div className={styles.empty}>
              <strong>У вас пока нет проектов</strong>
              <p>
                Создайте личный проект на странице{" "}
                <Link href="/projects">Все проекты</Link>.
              </p>
            </div>
          ) : null}
          {items.length > 0 ? (
            <ul className={styles.recentList}>
              {items.slice(0, 5).map((ws) => (
                <li key={ws.id}>
                  <Link href="/projects">{ws.name}</Link>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section>
          <h2 className={styles.sectionTitle}>Требует внимания</h2>
          <p className={styles.attention}>Нет задач, требующих внимания.</p>

          <div className={styles.sessionCard} style={{ marginTop: 28 }}>
            <h2 className={styles.sectionTitle}>Сессия</h2>
            <SessionMeta session={data} />
          </div>
        </section>
      </div>
    </div>
  );
}
