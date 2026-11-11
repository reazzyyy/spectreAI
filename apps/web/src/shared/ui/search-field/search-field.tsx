import type { InputHTMLAttributes } from "react";
import { classNames } from "@/shared/lib";
import { Icon } from "../icon";
import styles from "./search-field.module.scss";

export interface SearchFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Accessible name (required for the bare input). */
  "aria-label": string;
}

/** Icon + input search control (Make library-search). */
export function SearchField({
  className,
  "aria-label": ariaLabel,
  ...rest
}: SearchFieldProps) {
  return (
    <label className={classNames(styles.field, className)}>
      <Icon name="search" size={16} />
      <input type="search" aria-label={ariaLabel} {...rest} />
    </label>
  );
}
