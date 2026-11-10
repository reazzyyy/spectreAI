"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { workspaceDocumentsQueryOptions } from "@/entities/document";
import { workspacesListQueryOptions } from "@/entities/workspace";
import { UploadDocumentForm } from "@/features/upload-document";
import { isApiError } from "@/shared/api";
import styles from "./document-list.module.scss";

/**
 * Thin document library: pick Workspace → list + upload (DOC-01/02).
 * No preview/OCR/worker status beyond `uploaded`.
 */
export function DocumentList() {
  const workspacesQuery = useQuery(workspacesListQueryOptions);
  const workspaces = workspacesQuery.data?.items ?? [];
  const [workspaceId, setWorkspaceId] = useState<string>("");

  const effectiveWorkspaceId =
    workspaceId && workspaces.some((ws) => ws.id === workspaceId)
      ? workspaceId
      : (workspaces[0]?.id ?? "");

  const documentsQuery = useQuery(
    workspaceDocumentsQueryOptions(effectiveWorkspaceId),
  );

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div>
          <h1>Документы</h1>
          <p className={styles.lead}>
            Загрузка PDF, DOCX и TXT в проект. Обработка текста и OCR — в следующих
            срезах; сейчас сохраняется оригинал со статусом uploaded.
          </p>
        </div>
      </div>

      <div className={styles.layout}>
        <section aria-labelledby="document-list-title">
          <div className={styles.toolbar}>
            <label htmlFor="document-list-workspace">
              Проект
              <select
                id="document-list-workspace"
                className={styles.select}
                value={effectiveWorkspaceId}
                disabled={workspacesQuery.isPending || workspaces.length === 0}
                onChange={(event) => setWorkspaceId(event.target.value)}
              >
                {workspaces.length === 0 ? (
                  <option value="">Нет доступных проектов</option>
                ) : null}
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <h2 id="document-list-title" className={styles.sectionTitle}>
            Файлы проекта
            {documentsQuery.isFetching && !documentsQuery.isPending ? (
              <span className={styles.status}> · обновление…</span>
            ) : null}
          </h2>

          {workspacesQuery.isPending ? (
            <p className={styles.status} role="status">
              Загрузка проектов…
            </p>
          ) : null}

          {workspacesQuery.isError ? (
            <p className={styles.error} role="alert">
              {isApiError(workspacesQuery.error) &&
              workspacesQuery.error.status === 401
                ? "Сессия истекла. Войдите снова."
                : "Не удалось загрузить проекты."}
            </p>
          ) : null}

          {!workspacesQuery.isPending && workspaces.length === 0 ? (
            <div className={styles.empty}>
              Сначала создайте проект на странице «Проекты».
            </div>
          ) : null}

          {effectiveWorkspaceId && documentsQuery.isPending ? (
            <p className={styles.status} role="status">
              Загрузка документов…
            </p>
          ) : null}

          {documentsQuery.isError ? (
            <p className={styles.error} role="alert">
              Не удалось загрузить список документов.
            </p>
          ) : null}

          {documentsQuery.data && documentsQuery.data.items.length === 0 ? (
            <div className={styles.empty}>Пока нет файлов. Загрузите справа.</div>
          ) : null}

          {documentsQuery.data && documentsQuery.data.items.length > 0 ? (
            <ul className={styles.list}>
              {documentsQuery.data.items.map((doc) => (
                <li key={doc.id} className={styles.item}>
                  <p className={styles.itemName}>{doc.title}</p>
                  <div className={styles.meta}>
                    <span>{doc.originalFileName}</span>
                    <span>{doc.status}</span>
                    <span>{Math.max(1, Math.round(doc.byteSize / 1024))} КБ</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className={styles.panel} aria-labelledby="document-upload-title">
          <h2 id="document-upload-title" className={styles.sectionTitle}>
            Загрузить
          </h2>
          {workspaces.length > 0 ? (
            <UploadDocumentForm
              workspaces={workspaces}
              workspaceId={effectiveWorkspaceId}
              onUploaded={() => {
                /* list invalidates via mutation */
              }}
            />
          ) : (
            <p className={styles.status}>Нет проекта для загрузки.</p>
          )}
        </section>
      </div>
    </div>
  );
}
