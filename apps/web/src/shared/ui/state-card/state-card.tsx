import type { ReactNode } from "react";
import { classNames } from "@/shared/lib";
import { Icon, type IconName } from "../icon";
import styles from "./state-card.module.scss";

export interface StateCardProps {
  icon?: IconName;
  title: string;
  text?: string;
  tone?: "neutral" | "danger" | "accent";
  children?: ReactNode;
  className?: string;
}

/**
 * Empty / error / deferred surface for product screens (D-024).
 * Not a substitute for access control — messaging only.
 */
export function StateCard({
  icon = "folder",
  title,
  text,
  tone = "neutral",
  children,
  className,
}: StateCardProps) {
  return (
    <div
      className={classNames(
        styles.card,
        tone === "danger" && styles.danger,
        tone === "accent" && styles.accent,
        className,
      )}
      role={tone === "danger" ? "alert" : undefined}
    >
      <span
        className={classNames(
          styles.icon,
          tone === "danger" && styles.iconDanger,
          tone === "accent" && styles.iconAccent,
        )}
        aria-hidden
      >
        <Icon name={icon} size={20} />
      </span>
      <h2 className={styles.title}>{title}</h2>
      {text ? <p className={styles.text}>{text}</p> : null}
      {children ? <div className={styles.actions}>{children}</div> : null}
    </div>
  );
}
