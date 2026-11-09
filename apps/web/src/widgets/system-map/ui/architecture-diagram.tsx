"use client";

import { useId, useMemo, useState } from "react";
import styles from "./architecture-diagram.module.scss";
import mapStyles from "./system-map.module.scss";

type Status = "now" | "partial" | "later";
type ViewId = "runtime" | "domain" | "login" | "workspace" | "ai";

type NodeDef = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub: string;
  status: Status;
  why: string;
};

type EdgeDef = {
  id: string;
  d: string;
  label?: string;
  labelX?: number;
  labelY?: number;
  future?: boolean;
};

const STATUS_LABEL: Record<Status, string> = {
  now: "Есть",
  partial: "Частично",
  later: "Потом",
};

const STATUS_CHIP: Record<Status, string> = {
  now: mapStyles.chipNow,
  partial: mapStyles.chipPartial,
  later: mapStyles.chipLater,
};

const VIEWS: { id: ViewId; label: string }[] = [
  { id: "runtime", label: "Runtime" },
  { id: "domain", label: "Домен" },
  { id: "login", label: "Сценарий: логин" },
  { id: "workspace", label: "Сценарий: пространства" },
  { id: "ai", label: "Сценарий: AI" },
];

const RUNTIME_NODES: NodeDef[] = [
  {
    id: "browser",
    x: 40,
    y: 48,
    w: 150,
    h: 78,
    title: "Browser",
    sub: "человек + UI",
    status: "now",
    why: "Только витрина. Cookie и CSRF уходят сами; права здесь не решаются.",
  },
  {
    id: "web",
    x: 260,
    y: 48,
    w: 168,
    h: 78,
    title: "Next.js Web",
    sub: ":3001 · FSD",
    status: "now",
    why: "Рендер страниц и same-origin proxy `/api/v1` → Nest. Не хранит секреты доступа.",
  },
  {
    id: "api",
    x: 500,
    y: 48,
    w: 176,
    h: 78,
    title: "NestJS API",
    sub: ":3000 · /api/v1",
    status: "now",
    why: "Единая дверь: сессия → актёр → политики `@spectre/access` → ответ. Чужой UUID ≠ доступ.",
  },
  {
    id: "access",
    x: 500,
    y: 170,
    w: 176,
    h: 72,
    title: "Access policies",
    sub: "org / workspace",
    status: "now",
    why: "Общие правила: Client/Matter в своей org; Workspace по роли; Org Admin без авто-чтения контента.",
  },
  {
    id: "db",
    x: 760,
    y: 48,
    w: 140,
    h: 78,
    title: "PostgreSQL",
    sub: "Prisma + RLS",
    status: "partial",
    why: "Источник правды. RLS — вторая ограда по организации; полный ACL контента ещё наращиваем.",
  },
  {
    id: "redis",
    x: 760,
    y: 170,
    w: 140,
    h: 72,
    title: "Redis",
    sub: "очередь ai-jobs",
    status: "partial",
    why: "Имя очереди зарегистрировано. Воркера, который бы обрабатывал jobs, пока нет.",
  },
  {
    id: "ai",
    x: 500,
    y: 290,
    w: 176,
    h: 78,
    title: "AI Gateway",
    sub: "Synthetic only",
    status: "now",
    why: "Серверный адаптер. Сейчас только синтетика без сети; OpenAI запрещён до закрытия O-002.",
  },
  {
    id: "worker",
    x: 760,
    y: 290,
    w: 140,
    h: 78,
    title: "Worker",
    sub: "документы / OCR",
    status: "later",
    why: "Будущий процесс: забрать job → извлечь текст → (потом) эмбеддинги. В коде ещё нет.",
  },
];

const RUNTIME_EDGES: EdgeDef[] = [
  {
    id: "e-browser-web",
    d: "M190 87 H260",
    label: "HTTPS · pages",
    labelX: 198,
    labelY: 78,
  },
  {
    id: "e-web-api",
    d: "M428 87 H500",
    label: "rewrite /api/v1",
    labelX: 430,
    labelY: 78,
  },
  {
    id: "e-api-access",
    d: "M588 126 V170",
    label: "authz",
    labelX: 598,
    labelY: 148,
  },
  {
    id: "e-api-db",
    d: "M676 87 H760",
    label: "Prisma + GUC",
    labelX: 688,
    labelY: 78,
  },
  {
    id: "e-api-redis",
    d: "M676 100 C720 100, 720 200, 760 200",
    label: "enqueue (имя)",
    labelX: 700,
    labelY: 148,
  },
  {
    id: "e-api-ai",
    d: "M588 126 V290",
    label: "generateText",
    labelX: 598,
    labelY: 250,
  },
  {
    id: "e-redis-worker",
    d: "M830 242 V290",
    label: "consume",
    labelX: 838,
    labelY: 268,
    future: true,
  },
  {
    id: "e-worker-db",
    d: "M760 329 H700 C660 329, 660 120, 760 100",
    label: "потом: текст/индекс",
    labelX: 640,
    labelY: 220,
    future: true,
  },
];

const DOMAIN_NODES: NodeDef[] = [
  {
    id: "org",
    x: 360,
    y: 36,
    w: 180,
    h: 70,
    title: "Organization",
    sub: "тенант / фирма",
    status: "now",
    why: "Граница данных. Всё ниже принадлежит одной организации.",
  },
  {
    id: "user",
    x: 80,
    y: 150,
    w: 150,
    h: 70,
    title: "User",
    sub: "аккаунт",
    status: "now",
    why: "Человек. Сам по себе без membership никуда не входит.",
  },
  {
    id: "membership",
    x: 280,
    y: 150,
    w: 160,
    h: 70,
    title: "OrgMembership",
    sub: "связь user↔org",
    status: "now",
    why: "Билет в организацию. Без активного членства login → отказ.",
  },
  {
    id: "client",
    x: 500,
    y: 150,
    w: 140,
    h: 70,
    title: "Client",
    sub: "контрагент",
    status: "now",
    why: "Для кого ведут дела. Виден любому члену своей org (scaffold).",
  },
  {
    id: "matter",
    x: 700,
    y: 150,
    w: 140,
    h: 70,
    title: "Matter",
    sub: "дело",
    status: "now",
    why: "Конкретное дело, привязано к Client. Можно линковать в Workspace.",
  },
  {
    id: "workspace",
    x: 280,
    y: 280,
    w: 170,
    h: 74,
    title: "Workspace",
    sub: "PERSONAL / TEAM",
    status: "partial",
    why: "Место будущих чатов и документов. Create PERSONAL есть; TEAM create закрыт.",
  },
  {
    id: "wsmember",
    x: 80,
    y: 290,
    w: 150,
    h: 70,
    title: "WS Member",
    sub: "EDITOR / VIEWER",
    status: "now",
    why: "Кто видит командное пространство. PERSONAL — по сути только owner.",
  },
  {
    id: "wsmatter",
    x: 520,
    y: 290,
    w: 160,
    h: 70,
    title: "WS ↔ Matter",
    sub: "M:N link",
    status: "now",
    why: "Дело может висеть в нескольких пространствах; пространство — на нескольких делах.",
  },
  {
    id: "invite",
    x: 740,
    y: 290,
    w: 140,
    h: 70,
    title: "Invitation",
    sub: "hash token",
    status: "partial",
    why: "Приглашение в org. В БД хеш, не секрет. Email — stub; UI accept — потом.",
  },
];

const DOMAIN_EDGES: EdgeDef[] = [
  { id: "d-org-mem", d: "M400 106 V150", label: "1..*", labelX: 408, labelY: 128 },
  { id: "d-user-mem", d: "M230 185 H280", label: "N", labelX: 242, labelY: 176 },
  { id: "d-org-client", d: "M480 90 H570 V150", label: "clients", labelX: 520, labelY: 80 },
  { id: "d-client-matter", d: "M640 185 H700", label: "1..*", labelX: 652, labelY: 176 },
  { id: "d-org-ws", d: "M390 106 V280", label: "workspaces", labelX: 398, labelY: 220 },
  { id: "d-ws-member", d: "M280 317 H230", label: "members", labelX: 232, labelY: 308 },
  { id: "d-ws-link", d: "M450 317 H520", label: "links", labelX: 462, labelY: 308 },
  { id: "d-matter-link", d: "M770 220 V290 H680", label: "matters", labelX: 780, labelY: 250 },
  { id: "d-org-invite", d: "M520 90 H810 V290", label: "invites", labelX: 820, labelY: 180 },
];

const SCENARIO_FLOW: Record<
  Exclude<ViewId, "runtime" | "domain">,
  { title: string; steps: string[]; nodes: string[]; edges: string[] }
> = {
  login: {
    title: "Логин",
    steps: [
      "Browser → Web: форма email / password / organizationId",
      "Web → API: POST /auth/login (Origin в allowlist)",
      "API проверяет пароль + membership, пишет Session",
      "Ответ + cookies spectre_sid и spectre_csrf",
    ],
    nodes: ["browser", "web", "api", "db"],
    edges: ["e-browser-web", "e-web-api", "e-api-db"],
  },
  workspace: {
    title: "Список пространств",
    steps: [
      "Browser шлёт cookie сессии на GET /workspaces",
      "API достаёт актёра из Session (org только отсюда)",
      "Access: только PERSONAL owner / TEAM member",
      "Postgres (+ GUC актёра) отдаёт видимые строки",
    ],
    nodes: ["browser", "web", "api", "access", "db"],
    edges: ["e-browser-web", "e-web-api", "e-api-access", "e-api-db"],
  },
  ai: {
    title: "Синтетический AI",
    steps: [
      "POST /ai/generate с dataClass=synthetic",
      "API → AI Gateway (без внешней сети)",
      "Несинтетика блокируется политикой",
      "Очередь ai-jobs пока не участвует (воркера нет)",
    ],
    nodes: ["browser", "web", "api", "ai", "redis", "worker"],
    edges: ["e-browser-web", "e-web-api", "e-api-ai", "e-api-redis", "e-redis-worker"],
  },
};

function statusClass(status: Status): string {
  if (status === "now") return styles.nodeNow;
  if (status === "partial") return styles.nodePartial;
  return styles.nodeLater;
}

function NodeIcon({ id }: { id: string }) {
  const common = { className: styles.iconStroke, "aria-hidden": true as const };
  switch (id) {
    case "browser":
      return (
        <g transform="translate(14, 18)">
          <rect x="0" y="0" width="22" height="16" rx="2" {...common} />
          <path d="M0 5 H22 M6 20 H16" {...common} />
        </g>
      );
    case "web":
      return (
        <g transform="translate(14, 16)">
          <path d="M4 4 H20 V20 H4 Z" {...common} />
          <path d="M4 9 H20 M9 9 V20" {...common} />
        </g>
      );
    case "api":
      return (
        <g transform="translate(14, 16)">
          <rect x="2" y="3" width="20" height="18" rx="2" {...common} />
          <path d="M7 9 H17 M7 13 H17 M7 17 H14" {...common} />
        </g>
      );
    case "access":
      return (
        <g transform="translate(14, 16)">
          <path d="M12 3 L20 7 V12 C20 17 16 20 12 21 C8 20 4 17 4 12 V7 Z" {...common} />
        </g>
      );
    case "db":
      return (
        <g transform="translate(14, 14)">
          <ellipse cx="12" cy="6" rx="9" ry="4" {...common} />
          <path d="M3 6 V18 C3 20 7 22 12 22 C17 22 21 20 21 18 V6" {...common} />
          <path d="M3 12 C3 14 7 16 12 16 C17 16 21 14 21 12" {...common} />
        </g>
      );
    case "redis":
      return (
        <g transform="translate(14, 16)">
          <path d="M4 8 H20 L17 18 H7 Z" {...common} />
          <path d="M8 8 V4 H16 V8" {...common} />
        </g>
      );
    case "ai":
      return (
        <g transform="translate(14, 16)">
          <circle cx="12" cy="12" r="8" {...common} />
          <path d="M12 6 V12 L16 14" {...common} />
        </g>
      );
    case "worker":
      return (
        <g transform="translate(14, 16)">
          <circle cx="12" cy="12" r="4" {...common} />
          <path
            d="M12 4 V6 M12 18 V20 M4 12 H6 M18 12 H20 M6.5 6.5 L8 8 M16 16 L17.5 17.5 M17.5 6.5 L16 8 M8 16 L6.5 17.5"
            {...common}
          />
        </g>
      );
    case "org":
      return (
        <g transform="translate(14, 14)">
          <path d="M4 20 V8 L12 4 L20 8 V20" {...common} />
          <path d="M9 20 V14 H15 V20" {...common} />
        </g>
      );
    case "user":
      return (
        <g transform="translate(14, 14)">
          <circle cx="12" cy="8" r="4" {...common} />
          <path d="M4 20 C4 15 8 13 12 13 C16 13 20 15 20 20" {...common} />
        </g>
      );
    default:
      return (
        <g transform="translate(14, 16)">
          <rect x="4" y="4" width="16" height="16" rx="2" {...common} />
        </g>
      );
  }
}

function DiagramNode({
  node,
  selected,
  dimmed,
  onSelect,
}: {
  node: NodeDef;
  selected: boolean;
  dimmed: boolean;
  onSelect: (id: string) => void;
}) {
  const label = STATUS_LABEL[node.status];
  return (
    <g
      className={[
        styles.node,
        statusClass(node.status),
        selected ? styles.nodeSelected : "",
        dimmed ? styles.nodeDimmed : "",
      ]
        .filter(Boolean)
        .join(" ")}
      transform={`translate(${node.x}, ${node.y})`}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      aria-label={`${node.title}: ${node.why}`}
      onClick={() => onSelect(node.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(node.id);
        }
      }}
    >
      <rect className={styles.nodeBody} width={node.w} height={node.h} rx={6} />
      <NodeIcon id={node.id} />
      <text className={styles.nodeTitle} x={48} y={28}>
        {node.title}
      </text>
      <text className={styles.nodeSub} x={48} y={46}>
        {node.sub}
      </text>
      <rect className={styles.statusBadge} x={48} y={54} width={52} height={16} rx={3} />
      <text className={styles.statusText} x={56} y={65}>
        {label}
      </text>
    </g>
  );
}

/**
 * Interactive system-design board: runtime topology, domain graph, animated request paths.
 */
export function ArchitectureDiagram() {
  const markerId = useId().replace(/:/g, "");
  const [view, setView] = useState<ViewId>("runtime");
  const [selectedId, setSelectedId] = useState<string>("api");

  const isDomain = view === "domain";
  const nodes = isDomain ? DOMAIN_NODES : RUNTIME_NODES;
  const edges = isDomain ? DOMAIN_EDGES : RUNTIME_EDGES;
  const scenario = view === "runtime" || view === "domain" ? null : SCENARIO_FLOW[view];

  const activeNodeIds = useMemo(() => {
    if (!scenario) return null;
    return new Set(scenario.nodes);
  }, [scenario]);

  const activeEdgeIds = useMemo(() => {
    if (!scenario) return null;
    return new Set(scenario.edges);
  }, [scenario]);

  const selected = nodes.find((n) => n.id === selectedId) ?? nodes[0];

  function selectView(next: ViewId) {
    setView(next);
    if (next === "domain") setSelectedId("org");
    else if (next === "login") setSelectedId("browser");
    else if (next === "workspace") setSelectedId("access");
    else if (next === "ai") setSelectedId("ai");
    else setSelectedId("api");
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar} role="tablist" aria-label="Вид схемы">
        <span className={styles.toolbarLabel}>Вид:</span>
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            className={`${styles.tab} ${view === v.id ? styles.tabActive : ""}`}
            onClick={() => selectView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>

      <p className={styles.hint}>
        Кликни блок — справа снизу «зачем он нужен». В сценариях подсвечивается путь запроса и
        бежит анимация по стрелкам.
      </p>

      <div className={styles.board}>
        <div className={styles.boardInner}>
          <svg
            className={styles.canvas}
            viewBox="0 0 940 400"
            role="img"
            aria-label={
              isDomain
                ? "Доменная модель: Organization, User, Client, Matter, Workspace"
                : "Runtime-схема: Browser, Next.js, NestJS, PostgreSQL, Redis, AI Gateway"
            }
          >
            <defs>
              <marker
                id={`arrow-${markerId}`}
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L6,3 L0,6 Z" fill="#8b93a1" />
              </marker>
              <marker
                id={`arrow-active-${markerId}`}
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L6,3 L0,6 Z" fill="#2f5d9f" />
              </marker>
            </defs>

            {!isDomain && (
              <>
                <text className={styles.laneLabel} x="40" y="28">
                  Client
                </text>
                <text className={styles.laneLabel} x="500" y="28">
                  Control plane
                </text>
                <text className={styles.laneLabel} x="760" y="28">
                  Data / jobs
                </text>
              </>
            )}
            {isDomain && (
              <text className={styles.laneLabel} x="40" y="24">
                Domains · кто к кому относится
              </text>
            )}

            {edges.map((edge) => {
              const active = activeEdgeIds?.has(edge.id) ?? false;
              const dim = activeEdgeIds != null && !active;
              return (
                <g key={edge.id} opacity={dim ? 0.25 : 1}>
                  <path
                    d={edge.d}
                    className={[
                      styles.edge,
                      edge.future ? styles.edgeFuture : "",
                      active ? styles.edgeActive : "",
                      !edge.future && !active ? styles.edgeDashed : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    markerEnd={
                      active
                        ? `url(#arrow-active-${markerId})`
                        : `url(#arrow-${markerId})`
                    }
                  />
                  <path
                    d={edge.d}
                    className={`${styles.edgeFlow} ${active ? styles.edgeFlowVisible : ""}`}
                  />
                  {edge.label && edge.labelX != null && edge.labelY != null && (
                    <text
                      className={`${styles.edgeLabel} ${active ? styles.edgeLabelActive : ""}`}
                      x={edge.labelX}
                      y={edge.labelY}
                    >
                      {edge.label}
                    </text>
                  )}
                </g>
              );
            })}

            {nodes.map((node) => (
              <DiagramNode
                key={node.id}
                node={node}
                selected={selected?.id === node.id}
                dimmed={activeNodeIds != null && !activeNodeIds.has(node.id)}
                onSelect={setSelectedId}
              />
            ))}
          </svg>
        </div>
      </div>

      <div className={styles.detail} aria-live="polite">
        {scenario ? (
          <>
            <h3 className={styles.detailTitle}>
              Поток: {scenario.title}
              <span className={`${mapStyles.chip} ${mapStyles.chipNow}`}>сценарий</span>
            </h3>
            <p className={styles.detailMeta}>Анимация на стрелках = путь запроса сейчас</p>
            <ul className={styles.flowList}>
              {scenario.steps.map((step, i) => (
                <li key={step}>
                  <span className={styles.flowNum}>{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
            {selected && (
              <p className={styles.detailBody}>
                <strong>{selected.title}.</strong> {selected.why}
              </p>
            )}
          </>
        ) : (
          selected && (
            <>
              <h3 className={styles.detailTitle}>
                {selected.title}
                <span className={`${mapStyles.chip} ${STATUS_CHIP[selected.status]}`}>
                  {STATUS_LABEL[selected.status]}
                </span>
              </h3>
              <p className={styles.detailMeta}>{selected.sub}</p>
              <p className={styles.detailBody}>{selected.why}</p>
            </>
          )
        )}
      </div>
    </div>
  );
}
