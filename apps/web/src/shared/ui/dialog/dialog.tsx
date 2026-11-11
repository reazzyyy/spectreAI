"use client";

import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { classNames } from "@/shared/lib";
import styles from "./dialog.module.scss";

export interface DialogProps {
  /** Accessible title (visible for modal; screen-reader for palette). */
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  /** Optional footer actions (Cancel / Submit). */
  footer?: ReactNode;
  /** `palette` — command-search panel (Make CommandPalette). */
  variant?: "modal" | "palette";
}

/**
 * Modal overlay + dialog panel (Make Dialog). Escape / backdrop click closes.
 * Focus moves to first focusable / [data-autofocus] on open.
 */
export function Dialog({
  title,
  open,
  onClose,
  children,
  className,
  footer,
  variant = "modal",
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const isPalette = variant === "palette";

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const root = panelRef.current;
    const focusTarget =
      root?.querySelector<HTMLElement>("[data-autofocus]") ??
      root?.querySelector<HTMLElement>(
        "input:not([disabled]),textarea:not([disabled]),select:not([disabled]),button:not([disabled])",
      );
    focusTarget?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !panelRef.current) return;
    const focusable = [
      ...panelRef.current.querySelectorAll<HTMLElement>(
        'input:not([disabled]),textarea:not([disabled]),select:not([disabled]),button:not([disabled]),[href],[tabindex]:not([tabindex="-1"])',
      ),
    ].filter((el) => el.tabIndex !== -1);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function onBackdrop(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className={classNames(styles.overlay, isPalette && styles.overlayPalette)}
      onMouseDown={onBackdrop}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={classNames(
          styles.dialog,
          isPalette && styles.dialogPalette,
          className,
        )}
        onKeyDown={onKeyDown}
      >
        <div className={classNames(styles.head, isPalette && styles.headSr)}>
          <h2 id={titleId} className={styles.headTitle}>
            {title}
          </h2>
        </div>
        <div className={classNames(styles.body, isPalette && styles.bodyPalette)}>
          {children}
        </div>
        {footer ? <div className={styles.foot}>{footer}</div> : null}
      </div>
    </div>
  );
}
