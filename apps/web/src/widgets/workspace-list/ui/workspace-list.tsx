"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { clientsListQueryOptions } from "@/entities/client";
import {
  workspacesListQueryOptions,
  type WorkspaceVisibility,
} from "@/entities/workspace";
import { CreateWorkspaceForm } from "@/features/create-workspace";
import { isApiError } from "@/shared/api";
import { classNames } from "@/shared/lib";
import {
  Badge,
  Button,
  Page,
  PageHead,
  SearchField,
  Select,
  StateCard,
} from "@/shared/ui";
import styles from "./workspace-list.module.scss";

const VISIBILITY_LABEL = {
  PERSONAL: "Личное",
  TEAM: "Команда",
} as const;

type VisibilityTab = "all" | WorkspaceVisibility;
type SortKey = "name" | "status";

function parseVisibility(raw: string | null): VisibilityTab {
  const value = (raw ?? "").toUpperCase();
  if (value === "PERSONAL" || value === "TEAM") return value;
  return "all";
}

/**
 * Projects list (Make Projects): pill filters, proj-row table, create dialog.
 */
export function WorkspaceList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const visibility = parseVisibility(searchParams.get("visibility"));
  const showCreate = searchParams.get("create") === "1";
  const createNamePrefill = searchParams.get("name") ?? "";
  const urlQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(urlQuery);
  const [prevUrlQuery, setPrevUrlQuery] = useState(urlQuery);
  const [sort, setSort] = useState<SortKey>("name");
  if (urlQuery !== prevUrlQuery) {
    setPrevUrlQuery(urlQuery);
    setQuery(urlQuery);
  }

  const { data, error, isPending, isError, isFetching, refetch } = useQuery(
    workspacesListQueryOptions,
  );
  const clients = useQuery(clientsListQueryOptions);
  const clientsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of clients.data?.items ?? []) map.set(c.id, c.name);
    return map;
  }, [clients.data?.items]);

  const filtered = useMemo(() => {
    const items = [...(data?.items ?? [])];
    const q = query.trim().toLowerCase();
    const next = items.filter((ws) => {
      if (visibility !== "all" && ws.visibility !== visibility) return false;
      if (!q) return true;
      const client = ws.clientId ? (clientsById.get(ws.clientId) ?? "") : "";
      const hay = `${ws.name} ${ws.description ?? ""} ${client}`.toLowerCase();
      return hay.includes(q);
    });
    next.sort((a, b) => {
      if (sort === "status") return a.status.localeCompare(b.status, "ru");
      return a.name.localeCompare(b.name, "ru");
    });
    return next;
  }, [data?.items, query, visibility, sort, clientsById]);

  function setVisibilityTab(next: VisibilityTab) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("visibility");
    else params.set("visibility", next);
    const qs = params.toString();
    router.replace(qs ? `/projects?${qs}` : "/projects");
  }

  function openCreate(name?: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("create", "1");
    if (name?.trim()) params.set("name", name.trim());
    else params.delete("name");
    router.replace(`/projects?${params.toString()}`);
  }

  function closeCreate() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("create");
    params.delete("name");
    const qs = params.toString();
    router.replace(qs ? `/projects?${qs}` : "/projects");
  }

  const hasFilters = visibility !== "all" || query.trim() !== "";
  const totalKnown = data?.items.length ?? 0;

  return (
    <Page>
      <PageHead
        title="Проекты"
        description={
          <span aria-live="polite">
            {isPending
              ? "Загрузка…"
              : `${filtered.length} ${pluralProjects(filtered.length)}${
                  hasFilters && totalKnown !== filtered.length
                    ? ` из ${totalKnown}`
                    : ""
                }`}
            {isFetching && !isPending ? " · обновление…" : ""}
          </span>
        }
        actions={
          <Button type="button" icon="plus" onClick={() => openCreate()}>
            Создать проект
          </Button>
        }
      />

      <div className={styles.toolbar}>
        <SearchField
          className={styles.searchGrow}
          aria-label="Поиск проектов"
          placeholder="Название, клиент или описание"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Select
          aria-label="Сортировка"
          className={styles.sortSelect}
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
        >
          <option value="name">По названию</option>
          <option value="status">По статусу</option>
        </Select>
      </div>

      <div className={styles.filters}>
        <div className={styles.pillTabs} role="tablist" aria-label="Тип проекта">
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
                styles.pill,
                visibility === id && styles.pillActive,
              )}
              onClick={() => setVisibilityTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <CreateWorkspaceForm
        open={showCreate}
        onClose={closeCreate}
        defaultVisibility={visibility === "all" ? "PERSONAL" : visibility}
        defaultName={createNamePrefill}
        onCreated={(workspace) => {
          router.push(`/projects/${workspace.id}`);
        }}
      />

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
            <Button type="button" icon="plus" onClick={() => openCreate()}>
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
            {query.trim() ? (
              <Button
                type="button"
                icon="plus"
                onClick={() => openCreate(query.trim())}
              >
                Создать проект «{query.trim().slice(0, 30)}»
              </Button>
            ) : null}
          </StateCard>
        )
      ) : null}

      {filtered.length > 0 ? (
        <div className={styles.table} role="list" aria-label="Проекты">
          {filtered.map((ws) => {
            const clientName = ws.clientId
              ? (clientsById.get(ws.clientId) ?? null)
              : null;
            return (
              <div key={ws.id} className={styles.row} role="listitem">
                <Link href={`/projects/${ws.id}`} className={styles.main}>
                  <span className={styles.name}>
                    {ws.name}
                    {ws.status === "ARCHIVED" ? (
                      <Badge>Архив</Badge>
                    ) : null}
                    {ws.status === "PENDING_DELETION" ? (
                      <Badge tone="warning">Удаляется</Badge>
                    ) : null}
                  </span>
                  <small>
                    {clientName ?? "Без клиента"}
                    {ws.description ? ` · ${ws.description}` : ""}
                  </small>
                </Link>
                <span className={styles.kind}>
                  {VISIBILITY_LABEL[ws.visibility] ?? ws.visibility}
                </span>
                <span className={styles.when}>{ws.status}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </Page>
  );
}

function pluralProjects(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "проект";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "проекта";
  return "проектов";
}
