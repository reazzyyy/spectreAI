import type { ReactNode } from "react";
import { classNames } from "@/shared/lib";
import styles from "./badge.module.scss";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}

/** Soft pill label (Make Badge). */
export function Badge({
  children,
  tone = "neutral",
  className,
}: BadgeProps) {
  return (
    <span
      className={classNames(
        styles.badge,
        tone === "success" && styles.success,
        tone === "warning" && styles.warning,
        tone === "danger" && styles.danger,
        tone === "info" && styles.info,
        className,
      )}
    >
      {children}
    </span>
  );
}
