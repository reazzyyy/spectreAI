# `@spectre/api`

NestJS HTTP API scaffold. Global prefix: `/api/v1`. Default port: `3000`.

## Prerequisites

- `docker compose up -d` (Postgres + Redis)
- `.env` from `.env.example` (`DATABASE_URL`)
- `pnpm --filter @spectre/db migrate:deploy`

## Run

```bash
pnpm --filter @spectre/api dev
pnpm --filter @spectre/api test
pnpm --filter @spectre/api build
```

E2e seeds two organizations/matters in Postgres and asserts cross-org `GET /matters/:id` → `404`.

## Modules (AS-IS)

| Path | Role |
|---|---|
| `src/main.ts` | Bootstrap |
| `src/app.module.ts` | Controllers + DI wiring |
| `src/db/` | `PrismaService` from `@spectre/db` |
| `src/health/` | Liveness |
| `src/matters/` | Read Matter via Prisma + `@spectre/access` |
| `src/ai/` | Provider status + synthetic generate |
| `src/auth/` | `ACTOR_CONTEXT` + `ActorGuard` (no real sessions yet) |
| `src/http/` | Uniform error JSON |
| `src/queue/` | BullMQ queue name/helpers; **no worker** |

## Hard boundaries

- Default `ACTOR_CONTEXT` is `null` → Matters return `401`.
- Matter reads use Postgres through `@spectre/db`; organization isolation is enforced by `MatterAccess` (foreign/missing → identical `NOT_FOUND`).
- AI path uses only `@spectre/ai-gateway` Synthetic provider.

Full inventory: `docs/26-codebase-current-state.md`.
