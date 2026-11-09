"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { clientDetailQueryOptions } from "@/entities/client";
import { EditClientForm } from "@/features/edit-client";
import { isApiError } from "@/shared/api";
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
      <div className={styles.page}>
        <p className={styles.status} role="status">
          Загрузка клиента…
        </p>
      </div>
    );
  }

  if (isError || !data) {
    const notFound =
      isApiError(error) && (error.status === 404 || error.code === "NOT_FOUND");
    return (
      <div className={styles.page}>
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
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Link href="/clients" className={styles.back}>
        ← Все клиенты
      </Link>

      <div className={styles.head}>
        <p className={styles.meta}>
          <span>{data.status}</span>
        </p>
        <h1>{data.name}</h1>
      </div>

      <section className={styles.panel} aria-labelledby="client-edit-title">
        <h2 id="client-edit-title" className={styles.sectionTitle}>
          Параметры
        </h2>
        <EditClientForm client={data} />
      </section>
    </div>
  );
}
