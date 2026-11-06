import type { ButtonHTMLAttributes, ReactNode } from "react";
import { classNames } from "@/shared/lib";
import styles from "./button.module.scss";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "primary" | "secondary";
}

/** Shared submit/action control — tokens from global SCSS (D-024). */
export function Button({
  children,
  className,
  variant = "primary",
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={classNames(
        styles.button,
        variant === "secondary" && styles.secondary,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
