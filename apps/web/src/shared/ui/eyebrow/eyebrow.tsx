import type { HTMLAttributes, ReactNode } from "react";
import { classNames } from "@/shared/lib";
import styles from "./eyebrow.module.scss";

export interface EyebrowProps extends HTMLAttributes<HTMLParagraphElement> {
  children: ReactNode;
}

/** Uppercase meta label above a page or section title (Make eyebrow). */
export function Eyebrow({ children, className, ...rest }: EyebrowProps) {
  return (
    <p className={classNames(styles.eyebrow, className)} {...rest}>
      {children}
    </p>
  );
}
