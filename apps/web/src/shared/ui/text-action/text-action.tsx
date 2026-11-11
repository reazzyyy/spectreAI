import type { ButtonHTMLAttributes, ReactNode } from "react";
import { classNames } from "@/shared/lib";
import styles from "./text-action.module.scss";

export interface TextActionProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  /** Destructive accent (revoke / exclude). */
  danger?: boolean;
}

/** Inline text control (Make text-action) — not a filled Button. */
export function TextAction({
  children,
  className,
  danger = false,
  type = "button",
  ...rest
}: TextActionProps) {
  return (
    <button
      type={type}
      className={classNames(styles.action, danger && styles.danger, className)}
      {...rest}
    >
      {children}
    </button>
  );
}
