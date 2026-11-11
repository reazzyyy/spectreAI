import type { ReactNode } from "react";
import { Eyebrow, Icon, SyntheticModeBanner } from "@/shared/ui";
import styles from "./auth-layout.module.scss";

export interface AuthLayoutProps {
  /** Form card body (below title). */
  children: ReactNode;
  /** Card heading (styled locally — no :global CSS Modules). */
  title: string;
  /** Small eyebrow above the form title (default: team workspace). */
  cardEyebrow?: string;
  /** Optional footer under the card (links, meta). */
  footer?: ReactNode;
}

/**
 * Split auth chrome from Make: story panel + form column.
 * No demo identity / hash routing — product session flows only.
 */
export function AuthLayout({
  children,
  title,
  cardEyebrow = "Рабочее пространство команды",
  footer,
}: AuthLayoutProps) {
  return (
    <div className={styles.layout}>
      <aside className={styles.story} aria-label="О продукте">
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden>
            С
          </span>
          <strong>НейроЮрист Спектр</strong>
        </div>

        <div className={styles.storyContent}>
          <Eyebrow className={styles.eyebrow}>
            Юридическая работа · единый контекст
          </Eyebrow>
          <h1>
            От материалов дела
            <br />к проверяемой позиции.
          </h1>
          <p className={styles.storyLead}>
            Документы, исследования и черновики — в проекте. Доступ к каждому
            рабочему контексту назначается отдельно.
          </p>

          <div className={styles.diagram}>
            <div>
              <Icon name="users" size={19} />
              <span>Организация</span>
              <small>Сотрудники и политики</small>
            </div>
            <Icon name="chevron" size={16} />
            <div>
              <Icon name="folder" size={19} />
              <span>Проект</span>
              <small>Участники и материалы</small>
            </div>
          </div>

          <div className={styles.securityNote}>
            <Icon name="lock" size={17} />
            <p>
              Членство в организации и административная роль не дают
              автоматического доступа к содержимому проектов.
            </p>
          </div>
        </div>

        <p className={styles.storyFooter}>
          Светлая рабочая среда для российских юридических команд
        </p>
      </aside>

      <main className={styles.main}>
        <div className={styles.bannerSlot}>
          <SyntheticModeBanner />
        </div>
        <div className={styles.card}>
          <Eyebrow className={styles.eyebrow}>{cardEyebrow}</Eyebrow>
          <h1 className={styles.title}>{title}</h1>
          {children}
        </div>
        {footer ? <div className={styles.mainFooter}>{footer}</div> : null}
      </main>
    </div>
  );
}
