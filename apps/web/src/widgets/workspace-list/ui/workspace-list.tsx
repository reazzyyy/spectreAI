"use client";

import { useQuery } from "@tanstack/react-query";
import { workspacesListQueryOptions } from "@/entities/workspace";
import { CreateWorkspaceForm } from "@/features/create-workspace";
import { isApiError } from "@/shared/api";
import styles from "./workspace-list.module.scss";

const VISIBILITY_LABEL = {
  PERSONAL: "Личный",
  TEAM: "Команда",
} as const;

/**
 * Projects list (Make «Все проекты»): GET /workspaces + create PERSONAL.
 * Detail / TEAM create / search — later slices.
 */
export function WorkspaceList() {
  const { data, error, isPending, isError, isFetching } = useQuery(
    workspacesListQueryOptions,
  );

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div>
          <h1>Проекты</h1>
          <p className={styles.lead}>
            Пространства организации, к которым у вас есть доступ. Сейчас можно
            создать личный проект; командный — позже.
          </p>
        </div>
      </div>

      <div className={styles.layout}>
        <section aria-labelledby="workspace-list-title">
          <h2 id="workspace-list-title" className={styles.sectionTitle}>
            Все проекты
            {isFetching && !isPending ? (
              <span className={styles.status}> · обновление…</span>
            ) : null}
          </h2>

          {isPending ? (
            <p className={styles.status} role="status">
              Загрузка проектов…
            </p>
          ) : null}

          {isError ? (
            <p className={styles.error} role="alert">
              {isApiError(error) && error.status === 401
                ? "Сессия истекла. Войдите снова."
                : "Не удалось загрузить список проектов."}
            </p>
          ) : null}

          {data && data.items.length === 0 ? (
            <div className={styles.empty}>
              Пока нет проектов. Создайте личный справа.
            </div>
          ) : null}

          {data && data.items.length > 0 ? (
            <ul className={styles.list}>
              {data.items.map((ws) => (
                <li key={ws.id} className={styles.item}>
                  <div>
                    <p className={styles.itemName}>{ws.name}</p>
                    {ws.description ? (
                      <p className={styles.meta}>{ws.description}</p>
                    ) : null}
                  </div>
                  <div className={styles.meta}>
                    <span>{VISIBILITY_LABEL[ws.visibility] ?? ws.visibility}</span>
                    <span>·</span>
                    <span>{ws.status}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className={styles.panel} aria-labelledby="workspace-create-title">
          <h2 id="workspace-create-title" className={styles.sectionTitle}>
            Новый проект
          </h2>
          <CreateWorkspaceForm />
        </section>
      </div>
    </div>
  );
}
