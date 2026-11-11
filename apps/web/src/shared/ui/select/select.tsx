import { forwardRef, type SelectHTMLAttributes, type ReactNode } from "react";
import { classNames } from "@/shared/lib";
import styles from "./select.module.scss";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  children: ReactNode;
  /** Optional visible label; pair with `id` for a11y. */
  label?: string;
}

/** Native select styled to Make controls (RHF-compatible via ref). */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ children, className, label, id, ...rest }, ref) {
    const control = (
      <select
        id={id}
        ref={ref}
        className={classNames(styles.select, !label && className)}
        {...rest}
      >
        {children}
      </select>
    );

    if (!label) return control;

    return (
      <label className={classNames(styles.field, className)} htmlFor={id}>
        <span className={styles.label}>{label}</span>
        {control}
      </label>
    );
  },
);
