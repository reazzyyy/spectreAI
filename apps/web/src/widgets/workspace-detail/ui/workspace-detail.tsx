"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { workspaceDetailQueryOptions } from "@/entities/workspace";
import { EditWorkspaceForm } from "@/features/edit-workspace";
import { WorkspaceMattersPanel } from "@/features/manage-workspace-matters";
import { isApiError } from "@/shared/api";
import styles from "./workspace-detail.module.scss";

const VISIBILITY_LABEL = {
  PERSONAL: "Личный",
  TEAM: "Команда",
} as const;

export interface WorkspaceDetailProps {
  workspaceId: string;
}

/**
 * Workspace card (WS-03/04/05 + WS-08 matters): detail, edit, Matter links.
 * Members / Client / TEAM create / chat — later slices.
 */
export function WorkspaceDetail({ workspaceId }: WorkspaceDetailProps) {
  const { data, error, isPending, isError } = useQuery(
    workspaceDetailQueryOptions(workspaceId),
  );

  if (isPending) {
    return (
      <div className={styles.page}>
        <p className={styles.status} role="status">
          Загрузка проекта…
        </p>
      </div>
    );
  }

  if (isError || !data) {
    const notFound =
      isApiError(error) && (error.status === 404 || error.code === "NOT_FOUND");
    return (
      <div className={styles.page}>
        <Link href="/projects" className={styles.back}>
          ← Все проекты
        </Link>
        <p className={styles.error} role="alert">
          {notFound
            ? "Проект не найден или недоступен."
            : isApiError(error) && error.status === 401
              ? "Сессия истекла. Войдите снова."
              : "Не удалось загрузить проект."}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Link href="/projects" className={styles.back}>
        ← Все проекты
      </Link>

      <div className={styles.head}>
        <p className={styles.meta}>
          <span>{VISIBILITY_LABEL[data.visibility] ?? data.visibility}</span>
          <span>·</span>
          <span>{data.status}</span>
        </p>
        <h1>{data.name}</h1>
        {data.description ? <p className="lead">{data.description}</p> : null}
      </div>

      <section className={styles.panel} aria-labelledby="workspace-edit-title">
        <h2 id="workspace-edit-title" className={styles.sectionTitle}>
          Параметры
        </h2>
        <EditWorkspaceForm workspace={data} />
      </section>

      <WorkspaceMattersPanel workspaceId={workspaceId} />
    </div>
  );
}
