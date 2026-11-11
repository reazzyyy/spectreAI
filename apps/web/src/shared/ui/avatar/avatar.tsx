import { classNames } from "@/shared/lib";
import styles from "./avatar.module.scss";

export interface AvatarProps {
  /** Source string for initials (name or email). */
  label: string;
  size?: "sm" | "md";
  className?: string;
}

/** Initials circle (Make Avatar). */
export function initialsFromLabel(label: string): string {
  const cleaned = label.trim();
  if (!cleaned) return "?";
  const local = cleaned.includes("@")
    ? (cleaned.split("@")[0] ?? cleaned)
    : cleaned;
  const parts = local.split(/[._\s-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return local.slice(0, 2).toUpperCase() || "?";
}

export function Avatar({ label, size = "sm", className }: AvatarProps) {
  return (
    <span
      className={classNames(
        styles.avatar,
        size === "md" ? styles.md : styles.sm,
        className,
      )}
      aria-hidden
    >
      {initialsFromLabel(label)}
    </span>
  );
}
