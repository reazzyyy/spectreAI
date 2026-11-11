"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { clientDetailQueryOptions } from "@/entities/client";
import { EditClientForm } from "@/features/edit-client";
import { isApiError } from "@/shared/api";
import { Page, PageHead } from "@/shared/ui";
import styles from "./client-detail.module.scss";

export interface ClientDetailProps {
  clientId: string;
}

/** Client card: GET detail + PATCH name/status (F5e). */
export function ClientDetail({ clientId }: ClientDetailProps) {
  const { data, error, isPending, isError } = useQuery(
    clientDetailQueryOptions(clientId),
  );

  if (isPending) {
    return (
      <Page>
        <p className={styles.status} role="status">
          Загрузка клиента…
        </p>
      </Page>
    );
  }

  if (isError || !data) {
    const notFound =
      isApiError(error) && (error.status === 404 || error.code === "NOT_FOUND");
    return (
      <Page>
        <Link href="/clients" className={styles.back}>
          ← Все клиенты
        </Link>
        <p className={styles.error} role="alert">
          {notFound
            ? "Клиент не найден или недоступен."
            : isApiError(error) && error.status === 401
              ? "Сессия истекла. Войдите снова."
              : "Не удалось загрузить клиента."}
        </p>
      </Page>
    );
  }

  return (
    <Page>
      <Link href="/clients" className={styles.back}>
        ← Все клиенты
      </Link>

      <PageHead
        compact
        eyebrow={data.status}
        title={data.name}
      />

      <section className={styles.panel} aria-labelledby="client-edit-title">
        <h2 id="client-edit-title" className={styles.sectionTitle}>
          Параметры
        </h2>
        <EditClientForm client={data} />
      </section>
    </Page>
  );
}
