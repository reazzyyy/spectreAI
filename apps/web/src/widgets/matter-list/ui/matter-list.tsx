"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { mattersListQueryOptions } from "@/entities/matter";
import { CreateMatterForm } from "@/features/create-matter";
import { isApiError } from "@/shared/api";
import styles from "./matter-list.module.scss";

/**
 * Org Matters list + create (CRM-01/02 thin). Client link — later.
 */
export function MatterList() {
  const router = useRouter();
  const { data, error, isPending, isError, isFetching } = useQuery(
    mattersListQueryOptions,
  );

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div>
          <h1>Дела</h1>
          <p className={styles.lead}>
            Юридические дела организации. После создания их можно привязать к
            проекту на карточке Workspace.
          </p>
        </div>
      </div>

      <div className={styles.layout}>
        <section aria-labelledby="matter-list-title">
          <h2 id="matter-list-title" className={styles.sectionTitle}>
            Все дела
            {isFetching && !isPending ? (
              <span className={styles.status}> · обновление…</span>
            ) : null}
          </h2>

          {isPending ? (
            <p className={styles.status} role="status">
              Загрузка дел…
            </p>
          ) : null}

          {isError ? (
            <p className={styles.error} role="alert">
              {isApiError(error) && error.status === 401
                ? "Сессия истекла. Войдите снова."
                : "Не удалось загрузить список дел."}
            </p>
          ) : null}

          {data && data.items.length === 0 ? (
            <div className={styles.empty}>Пока нет дел. Создайте справа.</div>
          ) : null}

          {data && data.items.length > 0 ? (
            <ul className={styles.list}>
              {data.items.map((matter) => (
                <li key={matter.id} className={styles.item}>
                  <p className={styles.itemName}>
                    <Link href={`/matters/${matter.id}`}>{matter.title}</Link>
                  </p>
                  <div className={styles.meta}>
                    <span>{matter.status}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className={styles.panel} aria-labelledby="matter-create-title">
          <h2 id="matter-create-title" className={styles.sectionTitle}>
            Новое дело
          </h2>
          <CreateMatterForm
            onCreated={(matter) => {
              router.push(`/matters/${matter.id}`);
            }}
          />
        </section>
      </div>
    </div>
  );
}
