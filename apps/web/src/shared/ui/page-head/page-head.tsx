import type { HTMLAttributes, ReactNode } from "react";
import { classNames } from "@/shared/lib";
import { Eyebrow } from "../eyebrow";
import styles from "./page-head.module.scss";

/** `title` is heading content, so the native HTML `title` attribute is omitted. */
export interface PageHeadProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
}

/**
 * Standard product page header (Make page-head):
 * optional eyebrow, h1, muted lead, trailing actions.
 */
export function PageHead({
  title,
  eyebrow,
  description,
  actions,
  compact = false,
  className,
  ...rest
}: PageHeadProps) {
  return (
    <div
      className={classNames(
        styles.head,
        compact && styles.compact,
        className,
      )}
      {...rest}
    >
      <div className={styles.main}>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h1 className={styles.title}>{title}</h1>
        {description ? (
          <p className={styles.description}>{description}</p>
        ) : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
