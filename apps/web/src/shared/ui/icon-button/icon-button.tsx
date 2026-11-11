import type { ButtonHTMLAttributes } from "react";
import { classNames } from "@/shared/lib";
import { Icon, type IconName } from "../icon";
import styles from "./icon-button.module.scss";

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: IconName;
  /** Accessible name (visible label is icon-only). */
  label: string;
  active?: boolean;
  size?: number;
}

/** Square icon-only control (Make icon-button). */
export function IconButton({
  icon,
  label,
  active = false,
  size = 16,
  className,
  type = "button",
  title,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={title ?? label}
      className={classNames(styles.root, active && styles.active, className)}
      {...rest}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}
