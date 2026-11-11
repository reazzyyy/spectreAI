"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { workspaceDetailQueryOptions } from "@/entities/workspace";
import { EditWorkspaceForm } from "@/features/edit-workspace";
import { WorkspaceMembersPanel } from "@/features/manage-workspace-members";
import { WorkspaceMattersPanel } from "@/features/manage-workspace-matters";
import { isApiError } from "@/shared/api";
import { Button, StateCard } from "@/shared/ui";
import {
  ProjectBar,
  type ProjectBarPanel,
  type ProjectTabId,
} from "./project-bar";
import styles from "./workspace-detail.module.scss";

export interface WorkspaceDetailProps {
  workspaceId: string;
}

/**
 * Workspace screen: full-width sticky ProjectBar + centered body (Make).
 * Чаты — empty chrome until Phase 5A; Access keeps ProjectBar visible.
 */
export function WorkspaceDetail({ workspaceId }: WorkspaceDetailProps) {
  const [tab, setTab] = useState<ProjectTabId>("chats");
  const [panel, setPanel] = useState<ProjectBarPanel>("tab");
  const { data, error, isPending, isError } = useQuery(
    workspaceDetailQueryOptions(workspaceId),
  );

  if (isPending) {
    return (
      <div className={styles.body}>
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
      <div className={styles.center}>
        <StateCard
          icon="lock"
          title={
            notFound ? "Проект недоступен" : "Не удалось загрузить проект"
          }
          text={
            notFound
              ? "Проекта нет или у вас нет к нему доступа. Проверьте ссылку или найдите проект через поиск."
              : isApiError(error) && error.status === 401
                ? "Сессия истекла. Войдите снова."
                : "Проверьте соединение и повторите попытку."
          }
        >
          <Link href="/projects">
            <Button type="button" variant="secondary">
              Все проекты
            </Button>
          </Link>
        </StateCard>
      </div>
    );
  }

  const bodyClass =
    panel === "access"
      ? styles.bodyMembers
      : panel === "tab" && tab === "chats"
        ? styles.bodyNarrow
        : styles.body;

  return (
    <div className={styles.screen}>
      <ProjectBar
        workspace={data}
        activeTab={tab}
        panel={panel}
        onTabChange={(next) => {
          setTab(next);
          setPanel("tab");
        }}
        onOpenAccess={() => setPanel("access")}
        onAction={(action) => {
          if (action === "rename") setPanel("settings");
        }}
        tabCounts={{ chats: 0, docs: 0, research: 0, drafts: 0 }}
      />

      <div className={bodyClass}>
        {panel === "tab" && tab === "chats" ? (
          <div className={styles.chatsEmpty}>
            <StateCard
              icon="folder"
              tone="accent"
              title="Пока нет чатов"
              text="Чаты появятся после Phase 5A. Composer и ответы ИИ не показываем заранее — без фиктивных действий."
            />
          </div>
        ) : null}

        {panel === "access" ? (
          <WorkspaceMembersPanel
            workspaceId={workspaceId}
            workspaceName={data.name}
            visibility={data.visibility}
            ownerUserId={data.ownerUserId}
            onBack={() => setPanel("tab")}
          />
        ) : null}

        {panel === "settings" ? (
          <>
            <div className={styles.pageHead}>
              <h2 className={styles.pageTitle}>Параметры проекта</h2>
              <p className={styles.pageLead}>
                Название, описание, клиент и связанные юридические дела.
              </p>
            </div>
            {data.description ? (
              <p className={styles.description}>{data.description}</p>
            ) : null}
            <EditWorkspaceForm workspace={data} />
            <div className={styles.mattersBlock}>
              <WorkspaceMattersPanel workspaceId={workspaceId} />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
