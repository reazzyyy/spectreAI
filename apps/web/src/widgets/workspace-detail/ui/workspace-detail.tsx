"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { workspaceDetailQueryOptions } from "@/entities/workspace";
import { EditWorkspaceForm } from "@/features/edit-workspace";
import { WorkspaceMembersPanel } from "@/features/manage-workspace-members";
import { WorkspaceMattersPanel } from "@/features/manage-workspace-matters";
import { isApiError } from "@/shared/api";
import { StateCard } from "@/shared/ui";
import { ProjectBar, type ProjectTabId } from "./project-bar";
import styles from "./workspace-detail.module.scss";

export interface WorkspaceDetailProps {
  workspaceId: string;
}

/**
 * Workspace card: project-bar + overview (edit/matters/members).
 * Чаты — StateCard до Phase 5A API (без composer).
 */
export function WorkspaceDetail({ workspaceId }: WorkspaceDetailProps) {
  const [tab, setTab] = useState<ProjectTabId>("overview");
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
      <ProjectBar workspace={data} activeTab={tab} onTabChange={setTab} />

      {tab === "chats" ? (
        <StateCard
          icon="folder"
          tone="accent"
          title="Чаты появятся после Phase 5A"
          text="Conversation / Message API ещё не подключены. Composer и ответы ИИ не показываем заранее — без фиктивных действий. До готовности бэкенда работайте с обзором проекта."
        >
          <button
            type="button"
            className={styles.textButton}
            onClick={() => setTab("overview")}
          >
            Вернуться к обзору
          </button>
        </StateCard>
      ) : null}

      {tab === "overview" ? (
        <>
          {data.description ? (
            <p className={styles.description}>{data.description}</p>
          ) : null}

          <section className={styles.panel} aria-labelledby="workspace-edit-title">
            <h2 id="workspace-edit-title" className={styles.sectionTitle}>
              Параметры
            </h2>
            <EditWorkspaceForm workspace={data} />
          </section>

          <WorkspaceMembersPanel
            workspaceId={workspaceId}
            visibility={data.visibility}
            ownerUserId={data.ownerUserId}
          />

          <WorkspaceMattersPanel workspaceId={workspaceId} />
        </>
      ) : null}
    </div>
  );
}
