"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { aiGenerationQueryOptions } from "@/entities/ai-generation";
import {
  conversationListQueryOptions,
  createConversation,
  type Conversation,
  type ConversationVisibility,
} from "@/entities/conversation";
import {
  messageHistoryQueryOptions,
  sendMessage,
  type Message,
} from "@/entities/message";
import { SendMessageForm } from "@/features/send-chat-message";
import { isApiError } from "@/shared/api";
import {
  Avatar,
  Badge,
  Button,
  Dialog,
  Eyebrow,
  Icon,
  StateCard,
  SyntheticModeBanner,
} from "@/shared/ui";
import styles from "./chat-workspace.module.scss";

export interface ChatWorkspaceProps {
  workspaceId: string;
}

const PROMPT_IDEAS = [
  "Какие риски есть в условии об ответственности?",
  "Как уточнить базу расчёта неустойки?",
] as const;

function conversationLabel(conversation: Conversation): string {
  if (conversation.title?.trim()) {
    return conversation.title.trim();
  }
  return "Новый диалог";
}

function visibilityCopy(visibility: ConversationVisibility): string {
  return visibility === "WORKSPACE" ? "Участники проекта" : "Личный чат";
}

function pairTurns(messages: Message[]): Array<{
  user: Message;
  assistant: Message | null;
}> {
  const chronological = [...messages].reverse();
  const pairs: Array<{ user: Message; assistant: Message | null }> = [];
  for (let i = 0; i < chronological.length; i += 1) {
    const msg = chronological[i]!;
    if (msg.role !== "user") {
      continue;
    }
    const next = chronological[i + 1];
    const assistant =
      next && next.role === "assistant" ? next : null;
    if (assistant) {
      i += 1;
    }
    pairs.push({ user: msg, assistant });
  }
  return pairs;
}

/**
 * Make-aligned project chats: ask bar + row list, then ChatScreen workspace.
 * Context remains conversation_only — no DocumentVersion / materials picker.
 */
export function ChatWorkspace({ workspaceId }: ChatWorkspaceProps) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ask, setAsk] = useState("");
  const [visibility, setVisibility] =
    useState<ConversationVisibility>("PRIVATE");
  const [composerSeed, setComposerSeed] = useState("");
  const [pendingGenerationId, setPendingGenerationId] = useState<string | null>(
    null,
  );
  const [startError, setStartError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const listQuery = useQuery(conversationListQueryOptions(workspaceId));
  const conversations = listQuery.data?.items ?? [];

  const selected =
    selectedId && conversations.some((c) => c.id === selectedId)
      ? (conversations.find((c) => c.id === selectedId) ?? null)
      : selectedId
        ? ({ id: selectedId } as Conversation)
        : null;

  const messagesQuery = useQuery({
    ...messageHistoryQueryOptions(selectedId ?? ""),
    enabled: Boolean(selectedId),
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
        queryKey: messageHistoryQueryOptions(selectedId ?? "").queryKey,
      });
      void queryClient.invalidateQueries({
        queryKey: conversationListQueryOptions(workspaceId).queryKey,
      });
      setPendingGenerationId(null);
    }
  }, [
    generationQuery.data?.status,
    pendingGenerationId,
    queryClient,
    selectedId,
    workspaceId,
  ]);

  const pairs = useMemo(
    () => pairTurns(messagesQuery.data?.items ?? []),
    [messagesQuery.data?.items],
  );

  const generating =
    pendingGenerationId !== null &&
    (!generationQuery.data ||
      !["succeeded", "failed", "cancelled", "timed_out"].includes(
        generationQuery.data.status,
      ));

  const startMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const title = prompt.trim().slice(0, 120) || null;
      const created = await createConversation(workspaceId, {
        visibility,
        title,
      });
      if (prompt.trim()) {
        const idempotencyKey =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `start-${Date.now()}`;
        const sent = await sendMessage(
          created.id,
          { content: prompt.trim() },
          { idempotencyKey },
        );
        return { created, generationId: sent.generationId };
      }
      return { created, generationId: null as string | null };
    },
    onSuccess: async ({ created, generationId }) => {
      await queryClient.invalidateQueries({
        queryKey: conversationListQueryOptions(workspaceId).queryKey,
      });
      setSelectedId(created.id);
      setAsk("");
      setComposerSeed("");
      setStartError(null);
      if (generationId) {
        setPendingGenerationId(generationId);
      }
    },
  });

  async function startDialog(prompt: string) {
    setStartError(null);
    try {
      await startMutation.mutateAsync(prompt);
    } catch (err) {
      if (isApiError(err) && err.status === 401) {
        setStartError("Сессия истекла. Войдите снова.");
      } else if (isApiError(err) && (err.status === 403 || err.status === 404)) {
        setStartError("Нет права создавать чат в этом проекте.");
      } else {
        setStartError("Не удалось начать диалог. Попробуйте ещё раз.");
      }
    }
  }

  if (selectedId) {
    const title =
      selected && "title" in selected && selected.title != null
        ? conversationLabel(selected as Conversation)
        : "Новый диалог";
    const vis =
      selected && "visibility" in selected
        ? (selected as Conversation).visibility
        : visibility;

    return (
      <div className={styles.root}>
        <div className={styles.banner}>
          <SyntheticModeBanner />
        </div>
        <div className={styles.workspace}>
          <header className={styles.head}>
            <div className={styles.headMain}>
              <Eyebrow>Диалог по материалам</Eyebrow>
              <h1 className={styles.title}>{title}</h1>
              <p className={styles.meta}>
                <Icon
                  name={vis === "WORKSPACE" ? "users" : "lock"}
                  size={14}
                />
                {visibilityCopy(vis)}
                <span>·</span>
                контекст: история чата
              </p>
            </div>
            <div className={styles.headActions}>
              {vis === "PRIVATE" ? (
                <Button
                  type="button"
                  variant="secondary"
                  icon="users"
                  onClick={() => setShareOpen(true)}
                >
                  Открыть проекту
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                icon="plus"
                disabled={startMutation.isPending}
                onClick={() => void startDialog("")}
              >
                Новый чат
              </Button>
            </div>
          </header>

          <Dialog
            title="Открыть историю участникам проекта"
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            footer={
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShareOpen(false)}
                >
                  Отмена
                </Button>
                <Button type="button" disabled title="PATCH visibility ещё не в API">
                  Открыть участникам
                </Button>
              </>
            }
          >
            <h2 className={styles.shareTitle}>Открыть весь диалог проекту?</h2>
            <p className={styles.shareBody}>
              Участники проекта увидят историю вопросов и доступные им ответы.
              Проверьте, нет ли в переписке личных или конфиденциальных сведений.
            </p>
            <p className={styles.shareWarn}>
              Это явное раскрытие всей истории. Вернуть чат в PRIVATE в MVP
              нельзя. Серверное переключение visibility (PATCH) подключится
              отдельным срезом — подтверждение пока недоступно.
            </p>
          </Dialog>

          {messagesQuery.isError ? (
            <p className={styles.error} role="alert">
              Не удалось загрузить сообщения.
            </p>
          ) : null}

          {!messagesQuery.isPending && pairs.length === 0 && !generating ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>
                <Icon name="chat" size={24} />
              </span>
              <h2>Начните с юридического вопроса</h2>
              <p>
                Ответ строится только по истории этого чата.
                <br />
                Подключение документов к контексту — в следующих срезах (6A).
              </p>
              <div className={styles.promptIdeas}>
                {PROMPT_IDEAS.map((idea) => (
                  <button
                    key={idea}
                    type="button"
                    onClick={() => setComposerSeed(idea)}
                  >
                    {idea}
                    <Icon name="arrow" size={14} />
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className={styles.turns} role="log" aria-live="polite">
            {messagesQuery.isPending ? (
              <p className={styles.status} role="status">
                Загрузка сообщений…
              </p>
            ) : null}
            {pairs.map(({ user, assistant }, index) => (
              <section key={user.id}>
                <div className={styles.question}>
                  <Avatar label="Вы" size="sm" />
                  <p>{user.content}</p>
                  <span className={styles.questionNumber}>{index + 1}</span>
                </div>
                {assistant ? (
                  <article className={styles.answer}>
                    <div className={styles.answerLabel}>
                      <Icon name="sparkle" size={15} />
                      Синтетический ответ
                    </div>
                    <p className={styles.answerBody}>{assistant.content}</p>
                  </article>
                ) : null}
              </section>
            ))}
            {generating ? (
              <div className={styles.progress} role="status">
                <span className={styles.progressSymbol}>
                  <Icon name="sparkle" size={18} />
                </span>
                <div>
                  <strong>
                    {generationQuery.data?.status === "queued"
                      ? "Запрос в очереди"
                      : "Готовим синтетический ответ"}
                  </strong>
                  <p>SyntheticAIProvider · только история чата</p>
                  <div className={styles.skeleton} aria-hidden>
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <SendMessageForm
            key={`${selectedId}:${composerSeed}`}
            conversationId={selectedId}
            disabled={generating}
            initialContent={composerSeed}
            onSent={(result) => {
              setComposerSeed("");
              setPendingGenerationId(result.generationId);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.banner}>
        <SyntheticModeBanner />
      </div>

      <div className={styles.ask}>
        <div className={styles.askGrow}>
          <label className={styles.askLabel} htmlFor="project-ask-q">
            Новый вопрос
          </label>
          <input
            id="project-ask-q"
            className={styles.askInput}
            placeholder="Задайте вопрос по материалам проекта"
            value={ask}
            disabled={startMutation.isPending}
            onChange={(event) => setAsk(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void startDialog(ask);
              }
            }}
          />
        </div>
        <Button
          type="button"
          icon="arrow"
          disabled={startMutation.isPending}
          onClick={() => void startDialog(ask)}
        >
          Начать диалог
        </Button>
      </div>

      <div className={styles.askMeta}>
        <label className={styles.visibilityField}>
          Видимость
          <select
            value={visibility}
            disabled={startMutation.isPending}
            onChange={(event) =>
              setVisibility(event.target.value as ConversationVisibility)
            }
          >
            <option value="PRIVATE">Личный</option>
            <option value="WORKSPACE">Проект</option>
          </select>
        </label>
      </div>

      {startError ? (
        <p className={styles.error} role="alert">
          {startError}
        </p>
      ) : null}

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
        <StateCard
          icon="chat"
          tone="accent"
          title="В проекте пока нет чатов"
          text="Начните первый диалог: задайте вопрос выше. Документы в контекст пока не подключаются (conversation_only)."
        >
          <Button
            type="button"
            icon="arrow"
            disabled={startMutation.isPending}
            onClick={() => void startDialog("")}
          >
            Создать первый чат
          </Button>
        </StateCard>
      ) : null}

      {conversations.length > 0 ? (
        <>
          <h2 className={styles.sectionTitle}>Чаты проекта</h2>
          <div className={styles.rows}>
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                className={styles.row}
                onClick={() => setSelectedId(conversation.id)}
              >
                <span className={styles.rowMain}>
                  <strong>{conversationLabel(conversation)}</strong>
                  <small>
                    {visibilityCopy(conversation.visibility)}
                    {conversation.lastMessageAt
                      ? ` · ${new Date(conversation.lastMessageAt).toLocaleString("ru-RU")}`
                      : ""}
                  </small>
                </span>
                <Badge tone={conversation.visibility === "WORKSPACE" ? "info" : "neutral"}>
                  {conversation.visibility === "WORKSPACE" ? "Проект" : "Личный"}
                </Badge>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
