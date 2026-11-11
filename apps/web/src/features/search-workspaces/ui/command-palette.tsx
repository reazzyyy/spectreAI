"use client";

import {
  createElement,
  Fragment,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { clientsListQueryOptions } from "@/entities/client";
import { mattersListQueryOptions } from "@/entities/matter";
import {
  workspacesListQueryOptions,
  type WorkspaceVisibility,
} from "@/entities/workspace";
import { Badge, Button, Dialog, Icon } from "@/shared/ui";
import { classNames } from "@/shared/lib";
import {
  normalizeSearchText,
  recentWorkspaceHits,
  searchWorkspaces,
  tokenizeSearchQuery,
  type SearchVisibilityFilter,
  type WorkspaceSearchHit,
} from "../model/search-workspaces";
import styles from "./command-palette.module.scss";

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

const FILTERS: { id: SearchVisibilityFilter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "PERSONAL", label: "Личные" },
  { id: "TEAM", label: "Командные" },
];

const VIS_LABEL: Record<WorkspaceVisibility, string> = {
  PERSONAL: "Личный",
  TEAM: "Команда",
};

function highlight(text: string, tokens: string[]): ReactNode {
  if (!tokens.length || !text) return text;
  const lower = normalizeSearchText(text);
  const marks: [number, number][] = [];
  for (const t of tokens) {
    let i = lower.indexOf(t);
    while (i !== -1) {
      marks.push([i, i + t.length]);
      i = lower.indexOf(t, i + t.length);
    }
  }
  if (!marks.length) return text;
  marks.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const m of marks) {
    const last = merged[merged.length - 1];
    if (last && m[0] <= last[1]) last[1] = Math.max(last[1], m[1]);
    else merged.push([...m]);
  }
  const out: ReactNode[] = [];
  let pos = 0;
  merged.forEach(([s, e], k) => {
    if (s > pos) out.push(text.slice(pos, s));
    out.push(
      createElement("mark", { key: k, className: styles.mark }, text.slice(s, e)),
    );
    pos = e;
  });
  if (pos < text.length) out.push(text.slice(pos));
  return createElement(Fragment, null, ...out);
}

/**
 * Global project search popup (Make CommandPalette).
 * Client-side over GET /workspaces (+ clients/matters for related match).
 * Remount via `key` from AppShell on each open to reset local state.
 */
export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SearchVisibilityFilter>("all");
  const [active, setActive] = useState(0);

  const workspacesQuery = useQuery({
    ...workspacesListQueryOptions,
    enabled: open,
  });
  const clientsQuery = useQuery({
    ...clientsListQueryOptions,
    enabled: open,
  });
  const mattersQuery = useQuery({
    ...mattersListQueryOptions,
    enabled: open,
  });

  const q = query.trim();
  const tokens = useMemo(() => tokenizeSearchQuery(q), [q]);

  const result = useMemo(() => {
    const workspaces = workspacesQuery.data?.items ?? [];
    const clients = clientsQuery.data?.items ?? [];
    const matters = mattersQuery.data?.items ?? [];
    if (!q) {
      return {
        items: recentWorkspaceHits(workspaces, clients, matters, filter),
        total: 0,
      };
    }
    return searchWorkspaces({
      workspaces,
      clients,
      matters,
      query: q,
      visibility: filter,
      limit: 8,
    });
  }, [
    q,
    filter,
    workspacesQuery.data?.items,
    clientsQuery.data?.items,
    mattersQuery.data?.items,
  ]);

  const items = result.items;
  const activeIndex =
    items.length === 0 ? 0 : Math.min(active, items.length - 1);

  function openWorkspace(id: string) {
    onClose();
    router.push(`/projects/${encodeURIComponent(id)}`);
  }

  function openCreate(name?: string) {
    onClose();
    const params = new URLSearchParams({ create: "1" });
    if (name?.trim()) params.set("name", name.trim());
    router.push(`/projects?${params.toString()}`);
  }

  function openAllResults() {
    onClose();
    const params = new URLSearchParams();
    if (filter === "PERSONAL" || filter === "TEAM") {
      params.set("visibility", filter);
    }
    if (q) params.set("q", q);
    const qs = params.toString();
    router.push(qs ? `/projects?${qs}` : "/projects");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(items.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && items[activeIndex]) {
      e.preventDefault();
      openWorkspace(items[activeIndex]!.workspace.id);
    }
  }

  const loading =
    open &&
    (workspacesQuery.isPending ||
      clientsQuery.isPending ||
      mattersQuery.isPending);
  const failed =
    workspacesQuery.isError || clientsQuery.isError || mattersQuery.isError;
  const showEmpty = Boolean(q) && !loading && !failed && items.length === 0;
  const createLabel =
    q.length > 30
      ? `Создать проект «${q.slice(0, 30)}…»`
      : q
        ? `Создать проект «${q}»`
        : "Создать проект";

  return (
    <Dialog
      open={open}
      title="Поиск проектов"
      variant="palette"
      onClose={onClose}
    >
      <div className={styles.inputRow}>
        <Icon name="search" size={18} />
        <input
          className={styles.input}
          data-autofocus
          role="combobox"
          aria-expanded={items.length > 0}
          aria-controls="palette-list"
          aria-activedescendant={
            items[activeIndex] ? `palette-opt-${activeIndex}` : undefined
          }
          aria-autocomplete="list"
          aria-label="Название проекта, клиента или дела"
          placeholder="Найти проект по названию, клиенту или делу"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <kbd className={styles.kbd}>Esc</kbd>
      </div>

      <div className={styles.filters} role="tablist" aria-label="Тип проекта">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            className={classNames(
              styles.filter,
              filter === f.id && styles.filterActive,
            )}
            onClick={() => {
              setFilter(f.id);
              setActive(0);
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className={styles.body}>
        {!q ? <p className={styles.label}>Недавние</p> : null}
        {q && !loading && !failed ? (
          <p className={styles.label}>Найдено: {result.total}</p>
        ) : null}

        <div
          id="palette-list"
          className={styles.list}
          role="listbox"
          aria-label="Результаты"
        >
          {items.map((hit, i) => (
            <PaletteItem
              key={hit.workspace.id}
              hit={hit}
              index={i}
              active={i === activeIndex}
              tokens={tokens}
              onHover={() => setActive(i)}
              onSelect={() => openWorkspace(hit.workspace.id)}
            />
          ))}
        </div>

        {loading ? <p className={styles.hint}>Загрузка проектов…</p> : null}

        {showEmpty ? (
          <div className={styles.empty}>
            <p>
              <strong>Нет проектов по запросу «{q}»</strong>
            </p>
            <Button type="button" onClick={() => openCreate(q)}>
              {createLabel}
            </Button>
          </div>
        ) : null}

        {failed ? (
          <div className={styles.empty}>
            <p>
              <strong>Не удалось выполнить поиск</strong>
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void workspacesQuery.refetch();
                void clientsQuery.refetch();
                void mattersQuery.refetch();
              }}
            >
              Повторить
            </Button>
          </div>
        ) : null}

        {!q && !loading && items.length === 0 ? (
          <p className={styles.hint}>Проектов пока нет. Создайте первый.</p>
        ) : null}

        <span className={styles.live} aria-live="polite">
          {q && !loading && !failed ? `Найдено проектов: ${result.total}` : ""}
        </span>
      </div>

      <div className={styles.footer}>
        <span className={styles.muted}>↑↓ выбор · Enter открыть</span>
        <span className={styles.spacer} />
        {q && result.total > 0 ? (
          <button type="button" className={styles.ghost} onClick={openAllResults}>
            Все результаты ({result.total})
          </button>
        ) : null}
        <button
          type="button"
          className={styles.ghost}
          onClick={() => openCreate(q)}
        >
          <Icon name="plus" size={14} />
          Создать проект
        </button>
      </div>
    </Dialog>
  );
}

function PaletteItem({
  hit,
  index,
  active,
  tokens,
  onHover,
  onSelect,
}: {
  hit: WorkspaceSearchHit;
  index: number;
  active: boolean;
  tokens: string[];
  onHover: () => void;
  onSelect: () => void;
}) {
  const clientLine = hit.clientName ?? "Без клиента";
  const matterLine = hit.matterTitle ? ` · ${hit.matterTitle}` : "";
  return (
    <button
      type="button"
      id={`palette-opt-${index}`}
      role="option"
      aria-selected={active}
      className={classNames(styles.item, active && styles.itemActive)}
      onMouseMove={onHover}
      onClick={onSelect}
    >
      <span className={styles.main}>
        <strong title={hit.workspace.name}>
          {highlight(hit.workspace.name, tokens)}
        </strong>
        <small title={`${clientLine}${matterLine}`}>
          {hit.clientName
            ? highlight(hit.clientName, tokens)
            : "Без клиента"}
          {hit.matterTitle ? (
            <> · {highlight(hit.matterTitle, tokens)}</>
          ) : null}
        </small>
      </span>
      {hit.workspace.status === "ARCHIVED" ? <Badge>Архив</Badge> : null}
      {hit.workspace.status === "PENDING_DELETION" ? (
        <Badge tone="warning">Удаляется</Badge>
      ) : null}
      <span className={styles.kind}>
        {VIS_LABEL[hit.workspace.visibility]}
      </span>
    </button>
  );
}
