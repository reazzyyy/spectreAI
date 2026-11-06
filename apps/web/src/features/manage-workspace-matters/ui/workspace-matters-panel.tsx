"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { mattersListQueryOptions } from "@/entities/matter";
import {
  linkWorkspaceMatter,
  unlinkWorkspaceMatter,
  workspaceMattersQueryOptions,
} from "@/entities/workspace";
import { isApiError } from "@/shared/api";
import { Button } from "@/shared/ui";
import styles from "./workspace-matters-panel.module.scss";

export interface WorkspaceMattersPanelProps {
  workspaceId: string;
}

/**
 * Linked Matters for a Workspace (WS-08/WS-10 unlink).
 * Creates Matters elsewhere — out of this slice.
 */
export function WorkspaceMattersPanel({ workspaceId }: WorkspaceMattersPanelProps) {
  const queryClient = useQueryClient();
  const linksQuery = useQuery(workspaceMattersQueryOptions(workspaceId));
  const mattersQuery = useQuery(mattersListQueryOptions);
  const [selectedMatterId, setSelectedMatterId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const linkedIds = useMemo(
    () => new Set((linksQuery.data?.items ?? []).map((item) => item.matterId)),
    [linksQuery.data],
  );

  const matterById = useMemo(() => {
    const map = new Map<string, string>();
    for (const matter of mattersQuery.data?.items ?? []) {
      map.set(matter.id, matter.title);
    }
    return map;
  }, [mattersQuery.data]);

  const availableMatters = useMemo(
    () => (mattersQuery.data?.items ?? []).filter((m) => !linkedIds.has(m.id)),
    [mattersQuery.data, linkedIds],
  );

  async function invalidateLinks(): Promise<void> {
    await queryClient.invalidateQueries({
      queryKey: workspaceMattersQueryOptions(workspaceId).queryKey,
    });
  }

  const linkMutation = useMutation({
    mutationFn: (matterId: string) => linkWorkspaceMatter(workspaceId, matterId),
    onSuccess: async () => {
      setSelectedMatterId("");
      setFormError(null);
      await invalidateLinks();
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (matterId: string) => unlinkWorkspaceMatter(workspaceId, matterId),
    onSuccess: async () => {
      setFormError(null);
      await invalidateLinks();
    },
  });

  async function onLink(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!selectedMatterId) {
      setFormError("Выберите дело.");
      return;
    }
    try {
      await linkMutation.mutateAsync(selectedMatterId);
    } catch (err) {
      if (isApiError(err) && err.code === "VALIDATION_ERROR") {
        setFormError("Нельзя привязать это дело.");
      } else if (isApiError(err) && (err.status === 404 || err.code === "NOT_FOUND")) {
        setFormError("Проект или дело недоступны.");
      } else {
        setFormError("Не удалось привязать дело.");
      }
    }
  }

  async function onUnlink(matterId: string) {
    setFormError(null);
    try {
      await unlinkMutation.mutateAsync(matterId);
    } catch {
      setFormError("Не удалось отвязать дело.");
    }
  }

  const busy = linkMutation.isPending || unlinkMutation.isPending;

  return (
    <section className={styles.panel} aria-labelledby="workspace-matters-title">
      <h2 id="workspace-matters-title" className={styles.sectionTitle}>
        Связанные дела
      </h2>

      {linksQuery.isPending || mattersQuery.isPending ? (
        <p className={styles.status} role="status">
          Загрузка дел…
        </p>
      ) : null}

      {linksQuery.isError || mattersQuery.isError ? (
        <p className={styles.error} role="alert">
          Не удалось загрузить связанные дела.
        </p>
      ) : null}

      {linksQuery.data && linksQuery.data.items.length === 0 ? (
        <p className={styles.empty}>Пока нет связанных дел.</p>
      ) : null}

      {linksQuery.data && linksQuery.data.items.length > 0 ? (
        <ul className={styles.list}>
          {linksQuery.data.items.map((link) => (
            <li key={link.matterId} className={styles.item}>
              <div>
                <p className={styles.title}>
                  {matterById.get(link.matterId) ?? "Дело"}
                </p>
                <p className={styles.meta}>
                  <code>{link.matterId}</code>
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void onUnlink(link.matterId)}
              >
                Отвязать
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {mattersQuery.data && mattersQuery.data.items.length === 0 ? (
        <p className={styles.empty}>
          В организации ещё нет дел. Создание дел появится в следующем срезе.
        </p>
      ) : null}

      {availableMatters.length > 0 ? (
        <form className={styles.form} onSubmit={(e) => void onLink(e)}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="link-matter">
              Привязать дело
            </label>
            <select
              id="link-matter"
              className={styles.select}
              value={selectedMatterId}
              disabled={busy}
              onChange={(e) => setSelectedMatterId(e.target.value)}
            >
              <option value="">Выберите дело…</option>
              {availableMatters.map((matter) => (
                <option key={matter.id} value={matter.id}>
                  {matter.title}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={busy || !selectedMatterId}>
            {linkMutation.isPending ? "Привязка…" : "Привязать"}
          </Button>
        </form>
      ) : null}

      {formError ? (
        <p className={styles.error} role="alert">
          {formError}
        </p>
      ) : null}
    </section>
  );
}
