"use client";

import { useEffect, useRef, useState } from "react";
import type { Workspace, WorkspaceVisibility } from "@/entities/workspace";
import { useOpenCommandPalette } from "@/features/search-workspaces";
import { Badge, Button, Icon, IconButton } from "@/shared/ui";
import { classNames } from "@/shared/lib";
import styles from "./project-bar.module.scss";

/** Make ProjectTab — no separate «Обзор» chrome tab. */
export type ProjectTabId = "chats" | "docs" | "research" | "drafts";

export type ProjectBarPanel = "tab" | "access" | "settings";

export type ProjectBarAction = "rename" | "archive" | "delete";

export interface ProjectBarProps {
  workspace: Workspace;
  activeTab: ProjectTabId;
  panel: ProjectBarPanel;
  onTabChange: (tab: ProjectTabId) => void;
  onOpenAccess: () => void;
  onAction: (action: ProjectBarAction) => void;
  /** Optional tab counts (Make tab-count); omitted tabs show no badge. */
  tabCounts?: Partial<Record<ProjectTabId, number>>;
}

const VISIBILITY_LABEL: Record<WorkspaceVisibility, string> = {
  PERSONAL: "Личное",
  TEAM: "Команда",
};

const TABS: {
  id: ProjectTabId;
  label: string;
  enabled: boolean;
  title?: string;
}[] = [
  { id: "chats", label: "Чаты", enabled: true },
  {
    id: "docs",
    label: "Документы",
    enabled: false,
    title: "Документы проекта — в следующем срезе",
  },
  {
    id: "research",
    label: "Исследования",
    enabled: false,
    title: "Скоро",
  },
  {
    id: "drafts",
    label: "Черновики",
    enabled: false,
    title: "Скоро",
  },
];

/**
 * Sticky project chrome (Make ProjectBar): switcher → palette, Access, ⋮ menu, tabs.
 */
export function ProjectBar({
  workspace,
  activeTab,
  panel,
  onTabChange,
  onOpenAccess,
  onAction,
  tabCounts,
}: ProjectBarProps) {
  const openPalette = useOpenCommandPalette();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const canManage =
    workspace.status === "ACTIVE" || workspace.status === "ARCHIVED";

  useEffect(() => {
    if (!menuOpen) return;
    function onPointer(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const accessLabel =
    workspace.visibility === "PERSONAL" ? "Доступ" : "Участники";

  return (
    <div className={styles.bar}>
      <div className={styles.top}>
        <button
          type="button"
          className={styles.switch}
          title="Перейти в другой проект (Ctrl K)"
          onClick={openPalette}
        >
          <strong className={styles.switchName}>{workspace.name}</strong>
          <Icon name="down" size={16} />
        </button>

        <span className={styles.kind}>
          {VISIBILITY_LABEL[workspace.visibility]}
        </span>
        {workspace.status === "ARCHIVED" ? <Badge>Архив</Badge> : null}
        {workspace.status === "PENDING_DELETION" ? (
          <Badge tone="warning">Удаляется</Badge>
        ) : null}

        <span className={styles.spacer} />

        <Button
          type="button"
          variant="ghost"
          icon="users"
          className={panel === "access" ? styles.ghostActive : undefined}
          onClick={onOpenAccess}
        >
          {accessLabel}
        </Button>

        <div className={styles.menuAnchor} ref={menuRef}>
          <IconButton
            icon="more"
            label={`Действия: ${workspace.name}`}
            active={menuOpen}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          />
          {menuOpen ? (
            <div className={styles.menu} role="menu">
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                disabled={workspace.status !== "ACTIVE"}
                title={
                  workspace.status !== "ACTIVE"
                    ? "Переименование доступно для активного проекта"
                    : undefined
                }
                onClick={() => {
                  setMenuOpen(false);
                  onAction("rename");
                }}
              >
                Переименовать
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                disabled
                title="Архивация Workspace — в следующем срезе"
              >
                Архивировать
              </button>
              <button
                type="button"
                role="menuitem"
                className={classNames(styles.menuItem, styles.menuDanger)}
                disabled={!canManage}
                title="Удаление Workspace — dual confirmation, следующий срез"
              >
                Удалить проект
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Разделы проекта">
        {TABS.map((tab) => {
          const selected = panel === "tab" && activeTab === tab.id;
          const count = tabCounts?.[tab.id];
          if (!tab.enabled) {
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                className={styles.tab}
                disabled
                title={tab.title}
                aria-selected={false}
              >
                {tab.label}
                {count !== undefined ? (
                  <span className={styles.tabCount}>{count}</span>
                ) : (
                  <span className={styles.tabCount}>0</span>
                )}
              </button>
            );
          }
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              className={classNames(styles.tab, selected && styles.tabActive)}
              aria-selected={selected}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
              <span className={styles.tabCount}>
                {count !== undefined ? count : 0}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
