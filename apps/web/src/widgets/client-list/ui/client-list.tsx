"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { clientsListQueryOptions } from "@/entities/client";
import { CreateClientForm } from "@/features/create-client";
import { isApiError } from "@/shared/api";
import styles from "./client-list.module.scss";

/** Org Clients list + create (CRM-01 thin). */
export function ClientList() {
  const router = useRouter();
  const { data, error, isPending, isError, isFetching } = useQuery(
    clientsListQueryOptions,
  );

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div>
          <h1>Клиенты</h1>
          <p className={styles.lead}>
            Клиенты организации. Позже их можно будет связать с делами и
            проектами.
          </p>
        </div>
      </div>

      <div className={styles.layout}>
        <section aria-labelledby="client-list-title">
          <h2 id="client-list-title" className={styles.sectionTitle}>
            Все клиенты
            {isFetching && !isPending ? (
              <span className={styles.status}> · обновление…</span>
            ) : null}
          </h2>

          {isPending ? (
            <p className={styles.status} role="status">
              Загрузка клиентов…
            </p>
          ) : null}

          {isError ? (
            <p className={styles.error} role="alert">
              {isApiError(error) && error.status === 401
                ? "Сессия истекла. Войдите снова."
                : "Не удалось загрузить список клиентов."}
            </p>
          ) : null}

          {data && data.items.length === 0 ? (
            <div className={styles.empty}>
              Пока нет клиентов. Создайте справа.
            </div>
          ) : null}

          {data && data.items.length > 0 ? (
            <ul className={styles.list}>
              {data.items.map((client) => (
                <li key={client.id} className={styles.item}>
                  <p className={styles.itemName}>
                    <Link href={`/clients/${client.id}`}>{client.name}</Link>
                  </p>
                  <div className={styles.meta}>
                    <span>{client.status}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className={styles.panel} aria-labelledby="client-create-title">
          <h2 id="client-create-title" className={styles.sectionTitle}>
            Новый клиент
          </h2>
          <CreateClientForm
            onCreated={(client) => {
              router.push(`/clients/${client.id}`);
            }}
          />
        </section>
      </div>
    </div>
  );
}
