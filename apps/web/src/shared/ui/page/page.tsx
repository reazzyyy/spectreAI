import type { HTMLAttributes, ReactNode } from "react";
import { classNames } from "@/shared/lib";
import styles from "./page.module.scss";

export interface PageProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** `default` = 1040 (lists); `wide` = 1240 (org / members). */
  width?: "default" | "wide";
}

/** Centered product page column (Make .page). */
export function Page({
  children,
  width = "default",
  className,
  ...rest
}: PageProps) {
  return (
    <div
      className={classNames(
        styles.page,
        width === "wide" ? styles.wide : styles.default,
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
