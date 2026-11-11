import type { ButtonHTMLAttributes, ReactNode } from "react";
import { classNames } from "@/shared/lib";
import { Icon, type IconName } from "../icon";
import styles from "./button.module.scss";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  icon?: IconName;
}

/** Shared control — Make Button (primary / secondary / ghost + optional icon). */
export function Button({
  children,
  className,
  variant = "primary",
  icon,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={classNames(
        styles.button,
        variant === "secondary" && styles.secondary,
        variant === "ghost" && styles.ghost,
        className,
      )}
      {...rest}
    >
      {icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </button>
  );
}
