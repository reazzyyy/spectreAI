# `@spectre/api`

NestJS HTTP API scaffold. Global prefix: `/api/v1`. Default port: `3000`.

## Run

```bash
pnpm --filter @spectre/api dev
pnpm --filter @spectre/api test
pnpm --filter @spectre/api build
```

## Modules (AS-IS)

| Path | Role |
|---|---|
| `src/main.ts` | Bootstrap |
| `src/app.module.ts` | Controllers + DI wiring |
| `src/health/` | Liveness |
| `src/matters/` | Read Matter via `@spectre/access` + in-memory synthetic fixtures |
| `src/ai/` | Provider status + synthetic generate |
| `src/auth/` | `ACTOR_CONTEXT` + `ActorGuard` (no real sessions yet) |
| `src/http/` | Uniform error JSON |
| `src/queue/` | BullMQ queue name/helpers; **no worker** |

## Hard boundaries

- Default `ACTOR_CONTEXT` is `null` → Matters return `401`.
- Matter data in HTTP path is **not** from Prisma; fixtures live in `synthetic-matters.ts`.
- AI path uses only `@spectre/ai-gateway` Synthetic provider.

Full inventory: `docs/26-codebase-current-state.md`.
