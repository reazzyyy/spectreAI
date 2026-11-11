"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { matterDetailQueryOptions } from "@/entities/matter";
import { EditMatterForm } from "@/features/edit-matter";
import { isApiError } from "@/shared/api";
import { Page, PageHead } from "@/shared/ui";
import styles from "./matter-detail.module.scss";

export interface MatterDetailProps {
  matterId: string;
}

/** Matter card: GET detail + PATCH title/status (F5d). */
export function MatterDetail({ matterId }: MatterDetailProps) {
  const { data, error, isPending, isError } = useQuery(
    matterDetailQueryOptions(matterId),
  );

  if (isPending) {
    return (
      <Page>
        <p className={styles.status} role="status">
          Загрузка дела…
        </p>
      </Page>
    );
  }

  if (isError || !data) {
    const notFound =
      isApiError(error) && (error.status === 404 || error.code === "NOT_FOUND");
    return (
      <Page>
        <Link href="/matters" className={styles.back}>
          ← Все дела
        </Link>
        <p className={styles.error} role="alert">
          {notFound
            ? "Дело не найдено или недоступно."
            : isApiError(error) && error.status === 401
              ? "Сессия истекла. Войдите снова."
              : "Не удалось загрузить дело."}
        </p>
      </Page>
    );
  }

  return (
    <Page>
      <Link href="/matters" className={styles.back}>
        ← Все дела
      </Link>

      <PageHead compact eyebrow={data.status} title={data.title} />

      <section className={styles.panel} aria-labelledby="matter-edit-title">
        <h2 id="matter-edit-title" className={styles.sectionTitle}>
          Параметры
        </h2>
        <EditMatterForm matter={data} />
      </section>
    </Page>
  );
}
