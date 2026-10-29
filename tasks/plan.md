# Implementation Plan: Auth scaffold (sessions)

## Overview

Минимальный Auth scaffold поверх текущего монорепо: Prisma `User`, `OrganizationMembership`, `Session`; login создаёт серверную сессию (HttpOnly cookie); `ACTOR_CONTEXT` берётся только из сессии с повторной проверкой membership. E2e: без сессии `401`; чужой Matter → `404`. Это не полный MVP из `docs/12`.

**Подтверждено запросом / каноном:** isolation Matter; серверный актёр; e2e 401/404; MFA/SSO **OUT OF SCOPE** (**O-008** остаётся OPEN).

**Scaffold-defaults (не CONFIRMED в journal):** email+password; TTL сессии 7 дней; `organizationId` фиксируется в `Session` при login.

## Architecture Decisions

- Trunk — `main`. Ветка: `feature/auth-session-scaffold`.
- `POST /auth/login` `{ email, password, organizationId }` → opaque cookie `spectre_sid` + `Session.tokenHash` (SHA-256). JSON без токена/пароля.
- REQUEST-scoped `ACTOR_CONTEXT`: cookie → Session → User `active` → Membership `active`. Клиентский org/userId не доверять.
- Prisma модель `Session` соответствует `AuthSession` в `docs/12` (урезанный subset + `organizationId` для binding актёра).
- OUT OF SCOPE: MFA/SSO (O-008), invitations, register, recovery, CSRF token, web login UI, logout-all, audit store.

## Task List

### Phase 1: Plan and schema
- [x] Task 1: план в `tasks/` (`docs/auth-session-plan`)
- [x] Task 2: Prisma User / OrganizationMembership / Session + миграция (`feature/auth-session-scaffold`)

### Phase 2: Session API and actor
- [x] Task 3: login / logout / me + SessionService (argon2, cookie)
- [x] Task 4: ACTOR_CONTEXT из сессии; ActorGuard; membership re-check

### Phase 3: Proof and docs
- [x] Task 5: e2e без cookie 401; login org A → Matter A 200 / Matter B 404
- [x] Task 6: AS-IS + README; зафиксировать OUT OF SCOPE O-008

### Checkpoint: Auth scaffold
- [x] `pnpm --filter @spectre/db validate` + migrate deploy
- [x] `pnpm --filter @spectre/api test`
- [x] `pnpm --filter @spectre/api build`
- [x] Docs/README обновлены в том же изменении

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Клиент подменит org | Высокий | org только из Session; membership на каждый request |
| Утечка существования email | Средний | единый 401 на login fail |
| Docs/12 шире кода | Средний | AS-IS: scaffold subset, не MVP auth |

## Open Questions / OUT OF SCOPE

- **O-008 MFA/SSO** — не трогать в этой итерации.
- CSRF double-submit / Origin gate — до browser mutating forms с web.
- UI логина в `@spectre/web` — отдельная задача.
