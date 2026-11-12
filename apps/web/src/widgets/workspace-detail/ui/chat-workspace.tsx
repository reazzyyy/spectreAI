"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { aiGenerationQueryOptions } from "@/entities/ai-generation";
import {
  conversationListQueryOptions,
  type Conversation,
} from "@/entities/conversation";
import { messageHistoryQueryOptions } from "@/entities/message";
import { CreateConversationForm } from "@/features/create-conversation";
import { SendMessageForm } from "@/features/send-chat-message";
import { isApiError } from "@/shared/api";
import { StateCard, SyntheticModeBanner } from "@/shared/ui";
import { classNames } from "@/shared/lib";
import styles from "./chat-workspace.module.scss";

export interface ChatWorkspaceProps {
  workspaceId: string;
}

function conversationLabel(conversation: Conversation): string {
  if (conversation.title?.trim()) {
    return conversation.title.trim();
  }
  return conversation.visibility === "PRIVATE" ? "Личный чат" : "Чат проекта";
}

function visibilityLabel(visibility: Conversation["visibility"]): string {
  return visibility === "PRIVATE" ? "личный" : "проект";
}

/**
 * Project chats tab: conversation list + thread + Synthetic composer (Phase 5 UI).
 * Context is conversation_only — no DocumentVersion picker.
 */
export function ChatWorkspace({ workspaceId }: ChatWorkspaceProps) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingGenerationId, setPendingGenerationId] = useState<string | null>(
    null,
  );

  const listQuery = useQuery(conversationListQueryOptions(workspaceId));
  const conversations = listQuery.data?.items ?? [];

  const effectiveId = useMemo(() => {
    if (selectedId && conversations.some((c) => c.id === selectedId)) {
      return selectedId;
    }
    return conversations[0]?.id ?? null;
  }, [conversations, selectedId]);

  const selected = conversations.find((c) => c.id === effectiveId) ?? null;

  const messagesQuery = useQuery({
    ...messageHistoryQueryOptions(effectiveId ?? ""),
    enabled: Boolean(effectiveId),
  });

  const generationQuery = useQuery(
    aiGenerationQueryOptions(pendingGenerationId),
  );

  useEffect(() => {
    const status = generationQuery.data?.status;
    if (!pendingGenerationId || !status) {
      return;
    }
    if (
      status === "succeeded" ||
      status === "failed" ||
      status === "cancelled" ||
      status === "timed_out"
    ) {
      void queryClient.invalidateQueries({
        queryKey: messageHistoryQueryOptions(effectiveId ?? "").queryKey,
      });
      void queryClient.invalidateQueries({
        queryKey: conversationListQueryOptions(workspaceId).queryKey,
      });
      setPendingGenerationId(null);
    }
  }, [
    effectiveId,
    generationQuery.data?.status,
    pendingGenerationId,
    queryClient,
    workspaceId,
  ]);

  const chronological = useMemo(() => {
    const items = messagesQuery.data?.items ?? [];
    return [...items].reverse();
  }, [messagesQuery.data?.items]);

  const generating =
    pendingGenerationId !== null &&
    (!generationQuery.data ||
      !["succeeded", "failed", "cancelled", "timed_out"].includes(
        generationQuery.data.status,
      ));

  return (
    <div className={styles.root}>
      <div className={styles.bannerWrap}>
        <SyntheticModeBanner />
      </div>

      <CreateConversationForm
        workspaceId={workspaceId}
        onCreated={(created) => setSelectedId(created.id)}
      />

      {listQuery.isPending ? (
        <p className={styles.status} role="status">
          Загрузка чатов…
        </p>
      ) : null}

      {listQuery.isError ? (
        <p className={styles.error} role="alert">
          {isApiError(listQuery.error) && listQuery.error.status === 401
            ? "Сессия истекла. Войдите снова."
            : "Не удалось загрузить чаты."}
        </p>
      ) : null}

      {!listQuery.isPending && conversations.length === 0 ? (
        <div className={styles.emptyInline}>
          <StateCard
            icon="folder"
            tone="accent"
            title="Пока нет чатов"
            text="Создайте личный или проектный чат. Ответы идут через SyntheticAIProvider; документы в контекст не подключаются."
          />
        </div>
      ) : null}

      {conversations.length > 0 ? (
        <div className={styles.layout}>
          <aside className={styles.sidebar} aria-label="Список чатов">
            <h2 className={styles.sidebarHead}>Чаты</h2>
            <ul className={styles.list}>
              {conversations.map((conversation) => {
                const active = conversation.id === effectiveId;
                return (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      className={classNames(
                        styles.itemButton,
                        active && styles.itemActive,
                      )}
                      aria-current={active ? "true" : undefined}
                      onClick={() => setSelectedId(conversation.id)}
                    >
                      <span className={styles.itemTitle}>
                        {conversationLabel(conversation)}
                      </span>
                      <span className={styles.itemMeta}>
                        {visibilityLabel(conversation.visibility)}
                        {conversation.lastMessageAt
                          ? ` · ${new Date(conversation.lastMessageAt).toLocaleString("ru-RU")}`
                          : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <section className={styles.thread} aria-label="Переписка">
            {selected ? (
              <>
                <header className={styles.threadHead}>
                  <h2 className={styles.threadTitle}>
                    {conversationLabel(selected)}
                  </h2>
                  <p className={styles.threadMeta}>
                    Видимость: {visibilityLabel(selected.visibility)}. Контекст:
                    только сообщения чата.
                  </p>
                </header>

                <div className={styles.messages} role="log" aria-live="polite">
                  {messagesQuery.isPending ? (
                    <p className={styles.status} role="status">
                      Загрузка сообщений…
                    </p>
                  ) : null}
                  {messagesQuery.isError ? (
                    <p className={styles.error} role="alert">
                      Не удалось загрузить сообщения.
                    </p>
                  ) : null}
                  {!messagesQuery.isPending && chronological.length === 0 ? (
                    <p className={styles.status}>
                      Нет сообщений. Напишите первое ниже.
                    </p>
                  ) : null}
                  {chronological.map((message) => (
                    <article
                      key={message.id}
                      className={classNames(
                        styles.bubble,
                        message.role === "user"
                          ? styles.bubbleUser
                          : styles.bubbleAssistant,
                      )}
                    >
                      <span className={styles.role}>
                        {message.role === "user" ? "Вы" : "Ассистент"}
                      </span>
                      <div>{message.content}</div>
                    </article>
                  ))}
                  {generating ? (
                    <p className={styles.status} role="status">
                      Генерация ответа…
                      {generationQuery.data?.status
                        ? ` (${generationQuery.data.status})`
                        : ""}
                    </p>
                  ) : null}
                </div>

                <SendMessageForm
                  conversationId={selected.id}
                  disabled={generating}
                  onSent={(result) => {
                    setPendingGenerationId(result.generationId);
                  }}
                />
              </>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
