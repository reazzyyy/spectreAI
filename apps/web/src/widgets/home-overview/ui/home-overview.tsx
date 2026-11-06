"use client";

import { useQuery } from "@tanstack/react-query";
import { SessionMeta, sessionMeQueryOptions } from "@/entities/session";
import { Button } from "@/shared/ui";
import styles from "./home-overview.module.scss";

/**
 * Home dashboard (Make Home, slim F2): greeting + empty projects + session.
 * No mock projects / ownership inbox until Workspace UI API is wired.
 */
export function HomeOverview() {
  const { data } = useQuery(sessionMeQueryOptions);
  if (!data) return null;

  const firstName = data.user.email.split("@")[0] ?? data.user.email;

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
        <Button type="button" disabled title="Создание проекта — следующий срез">
          Новая задача
        </Button>
      </div>

      <div className={styles.columns}>
        <section>
          <h2 className={styles.sectionTitle}>Недавние проекты</h2>
          <div className={styles.empty}>
            <strong>У вас пока нет проектов в этом интерфейсе</strong>
            <p>
              API Workspace уже есть; список и создание проектов появятся в следующем
              срезе UI. Пока можно проверить сессию и карту системы.
            </p>
          </div>
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
