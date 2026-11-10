"use client";

import Link from "next/link";
import type { Workspace, WorkspaceVisibility } from "@/entities/workspace";
import { classNames } from "@/shared/lib";
import styles from "./project-bar.module.scss";

export type ProjectTabId = "overview" | "chats" | "docs" | "research" | "drafts";

export interface ProjectBarProps {
  workspace: Workspace;
  activeTab: ProjectTabId;
  onTabChange: (tab: ProjectTabId) => void;
}

const VISIBILITY_LABEL: Record<WorkspaceVisibility, string> = {
  PERSONAL: "Личный",
  TEAM: "Команда",
};

const TABS: {
  id: ProjectTabId;
  label: string;
  enabled: boolean;
  title?: string;
}[] = [
  { id: "overview", label: "Обзор", enabled: true },
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
 * Project chrome: name, visibility/status, tabs.
 * Only Обзор and Чаты (placeholder) are interactive until Phase 5A / docs scope.
 */
export function ProjectBar({ workspace, activeTab, onTabChange }: ProjectBarProps) {
  return (
    <div className={styles.bar}>
      <div className={styles.top}>
        <div className={styles.titleBlock}>
          <Link href="/projects" className={styles.back}>
            ← Все проекты
          </Link>
          <h1 className={styles.name}>{workspace.name}</h1>
        </div>
        <div className={styles.badges}>
          <span className={styles.badge}>
            {VISIBILITY_LABEL[workspace.visibility] ?? workspace.visibility}
          </span>
          <span className={styles.status}>{workspace.status}</span>
        </div>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Разделы проекта">
        {TABS.map((tab) => {
          const selected = activeTab === tab.id;
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
            </button>
          );
        })}
      </div>
    </div>
  );
}
