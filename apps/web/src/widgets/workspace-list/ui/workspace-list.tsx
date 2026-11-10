"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  workspacesListQueryOptions,
  type WorkspaceVisibility,
} from "@/entities/workspace";
import { CreateWorkspaceForm } from "@/features/create-workspace";
import { isApiError } from "@/shared/api";
import { Button, StateCard } from "@/shared/ui";
import { classNames } from "@/shared/lib";
import styles from "./workspace-list.module.scss";

const VISIBILITY_LABEL = {
  PERSONAL: "Личный",
  TEAM: "Команда",
} as const;

type VisibilityTab = "all" | WorkspaceVisibility;

function parseVisibility(raw: string | null): VisibilityTab {
  const value = (raw ?? "").toUpperCase();
  if (value === "PERSONAL" || value === "TEAM") return value;
  return "all";
}

/**
 * Projects list: GET /workspaces + client search/visibility filter + create.
 * Query: `?visibility=PERSONAL|TEAM`, `?create=1` opens create panel.
 */
export function WorkspaceList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const visibility = parseVisibility(searchParams.get("visibility"));
  const showCreate = searchParams.get("create") === "1";
  const [query, setQuery] = useState("");

  const { data, error, isPending, isError, isFetching, refetch } = useQuery(
    workspacesListQueryOptions,
  );

  const filtered = useMemo(() => {
    const items = data?.items ?? [];
    const q = query.trim().toLowerCase();
    return items.filter((ws) => {
      if (visibility !== "all" && ws.visibility !== visibility) return false;
      if (!q) return true;
      const hay = `${ws.name} ${ws.description ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data?.items, query, visibility]);

  function setVisibilityTab(next: VisibilityTab) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("visibility");
    else params.set("visibility", next);
    const qs = params.toString();
    router.replace(qs ? `/projects?${qs}` : "/projects");
  }

  function openCreate() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("create", "1");
    router.replace(`/projects?${params.toString()}`);
  }

  function closeCreate() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("create");
    const qs = params.toString();
    router.replace(qs ? `/projects?${qs}` : "/projects");
  }

  const hasFilters = visibility !== "all" || query.trim() !== "";
  const totalKnown = data?.items.length ?? 0;

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div>
          <h1>Проекты</h1>
          <p className={styles.lead} aria-live="polite">
            {isPending
              ? "Загрузка…"
              : `${filtered.length} ${pluralProjects(filtered.length)}${
                  hasFilters && totalKnown !== filtered.length
                    ? ` из ${totalKnown}`
                    : ""
                }`}
            {isFetching && !isPending ? " · обновление…" : ""}
          </p>
        </div>
        <Button type="button" onClick={openCreate}>
          Создать проект
        </Button>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchGrow}>
          <label className={styles.visibleLabel} htmlFor="proj-search">
            Поиск проектов
          </label>
          <input
            id="proj-search"
            className={styles.searchField}
            type="search"
            placeholder="Название или описание"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.filters} role="tablist" aria-label="Тип проекта">
        {(
          [
            ["all", "Все"],
            ["PERSONAL", "Личные"],
            ["TEAM", "Командные"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={visibility === id}
            className={classNames(
              styles.tab,
              visibility === id && styles.tabActive,
            )}
            onClick={() => setVisibilityTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {showCreate ? (
        <section className={styles.createPanel} aria-labelledby="workspace-create-title">
          <div className={styles.createHead}>
            <h2 id="workspace-create-title" className={styles.sectionTitle}>
              Новый проект
            </h2>
            <Button type="button" variant="secondary" onClick={closeCreate}>
              Скрыть
            </Button>
          </div>
          <CreateWorkspaceForm
            onCreated={(workspace) => {
              router.push(`/projects/${workspace.id}`);
            }}
          />
        </section>
      ) : null}

      {isError ? (
        <StateCard
          icon="warning"
          tone="danger"
          title="Не удалось загрузить проекты"
          text={
            isApiError(error) && error.status === 401
              ? "Сессия истекла. Войдите снова."
              : "Проверьте соединение и повторите попытку."
          }
        >
          <Button type="button" onClick={() => void refetch()}>
            Повторить
          </Button>
        </StateCard>
      ) : null}

      {isPending && !data ? (
        <div className={styles.skeleton} aria-label="Загрузка">
          <i />
          <i />
          <i />
          <i />
        </div>
      ) : null}

      {!isPending && !isError && data && filtered.length === 0 ? (
        totalKnown === 0 ? (
          <StateCard
            icon="folder"
            title="У вас пока нет проектов"
            text="Создайте проект, чтобы хранить чаты, документы и материалы по одной задаче."
          >
            <Button type="button" onClick={openCreate}>
              Создать проект
            </Button>
          </StateCard>
        ) : (
          <StateCard
            icon="search"
            title="Ничего не найдено"
            text="Измените запрос или сбросьте фильтры."
          >
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setQuery("");
                setVisibilityTab("all");
              }}
            >
              Сбросить фильтры
            </Button>
          </StateCard>
        )
      ) : null}

      {filtered.length > 0 ? (
        <ul className={styles.list}>
          {filtered.map((ws) => (
            <li key={ws.id} className={styles.item}>
              <div className={styles.itemMain}>
                <p className={styles.itemName}>
                  <Link href={`/projects/${ws.id}`}>{ws.name}</Link>
                </p>
                {ws.description ? (
                  <p className={styles.itemSub}>{ws.description}</p>
                ) : null}
              </div>
              <div className={styles.itemMeta}>
                <span className={styles.badge}>
                  {VISIBILITY_LABEL[ws.visibility] ?? ws.visibility}
                </span>
                <span className={styles.metaMuted}>{ws.status}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function pluralProjects(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "проект";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "проекта";
  return "проектов";
}
