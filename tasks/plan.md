# Implementation Plan: Phase 2 — Workspace + membership (+ RLS foundation)

> **Статус:** **утверждён** владельцем продукта (2026-11-03). S0 в работе; S1+ — после merge S0.  
> **Дата:** 2026-11-03  
> **Канон:** `docs/decisions-log.md` (W-001–W-020), `docs/workspace-phase2/`, `docs/CURSOR-INSTRUCTIONS-WORKSPACE-PHASE2.md`, ADR-0003, AS-IS `docs/26`.  
> **S0 note:** `docs/workspace-phase2/S0-rls-foundation-and-inventory.md`.  
> **Roadmap:** Фаза 2 («пространство и членство»). Чат / документы / grant / purge — отдельные последующие фазы roadmap; в этом плане помечены как **позже**, чтобы не giant-PR.

Если журнал и этот план расходятся — приоритет у журнала. OPEN (O-011–O-013, O-009, O-010) не «додумывать» в коде.

---

## 1. Audit snapshot (AS-IS, проверено 2026-11-03)

### Уже есть
- Стек D-008; Prisma: Organization, Client, Matter, User, OrganizationMembership, Session.
- Cookie login Email+Password+OrganizationId; ActorGuard на Client/Matter; org-isolation в `@spectre/access` + e2e.
- SyntheticAIProvider; очередь имя `ai-jobs` **без worker**.
- Web FSD login; CI: migrate + `pnpm test` на Postgres `pgvector/pg16`.
- `Matter.workspaceId` nullable **без FK** (legacy scaffold).

### Нет
- Моделей Workspace / WorkspaceMember / WorkspaceMatter.
- RLS, отдельных migration vs runtime DB roles.
- Workspace API, invitations, bootstrap seed, CSRF slice.
- Chat / Document / AdminGrant / Audit storage / worker.
- Auth на `GET|POST /ai/*` (документированный долг AS-IS).

### Конфликты / OPEN (не кодировать молча)
| Тема | Статус |
|---|---|
| Invite TTL / resend | **O-011** — конфиг, не «72h CONFIRMED» |
| Confirmer удаления Workspace | **O-012** — не фаза membership |
| EDITOR удаляет чужой контент | **O-013** — контент ещё не в этой фазе |
| CSRF механизм | **PROPOSED** — выбрать после Origin/cookie analysis (**W-014**) |
| SQL helpers / SECURITY DEFINER | **PROPOSED** — после Prisma tx + PG docs |
| Export / гости / MFA | **W-017 / W-018 / W-013** — out of MVP |

### Legacy Matter.workspaceId
1. Перед drop: проверить данные (локально/CI сейчас ожидаемо все `NULL`).  
2. Ввести `WorkspaceMatter` → backfill непустых → код на join → **отдельная** contract-migration на drop колонки.  
3. До backfill **не удалять** поле.

### DB credentials (блокер RLS)
Сейчас один user `spectre` = table owner (compose/CI/`.env.example`). Для **W-020** нужны минимум:
- migration/owner role;
- runtime app role **без** SUPERUSER / BYPASSRLS / ownership tenant tables;
- отдельные URL в `.env.example` + CI.

---

## 2. Цель Phase 2 (продуктовый выход)

Участник видит **только свои** Workspace. Чужой UUID Workspace/Client/Matter не даёт доступ. Org Admin **управляет членством** без авто-чтения контента (**W-005**, D-006). PostgreSQL RLS на **существующих + новых** tenant tables как fail-closed слой (**W-020**); NestJS authz остаётся обязательным.

**Не цель этой фазы:** загрузка файлов, чат UI, admin grant UI, purge/delete dual-confirm, export, rate-limit каркас целиком, OpenAI.

---

## 3. Порядок slices (отдельные PR → `main`)

Каждый slice: ветка `feature/…` или `chore/…`, тесты, обновление AS-IS/README в том же PR (rule 07). Не сливать 0–3 в один PR.

```text
S0  Foundation inventory + DB role topology (docs/chore, no product API)
 │
S1  Schema Workspace* + Matter backfill path + RLS on current tenant tables + harness
 │
S2  @spectre/access Workspace policies + Actor context for RLS (set_config)
 │
S3  Workspace HTTP API (list/create/get/patch, members, matter links) + e2e
 │
S4a CSRF technical slice (before new mutating web forms)     ──┐
S4b Dev bootstrap seed (W-012)                                ├── can parallel after S3 API exists
S4c Invitations API (hash token; TTL from config / O-011)     ─┘
 │
─── граница roadmap «Фаза 2 done» (ниже — следующие фазы roadmap) ───
 │
S5  Chat PRIVATE/WORKSPACE (+ Message ACL)     → roadmap Фаза 5 (после docs pipeline или тонкий stub)
S6  Admin grant                                → roadmap Фаза 9
S7  Archive + dual-confirm delete + purge      → roadmap Фаза 10 (блок O-012 на confirmer)
S8  Hardening: worker revalidation, rate limit, adversarial
```

### Slice 0 — Foundation / inventory (**chore/docs**)
**Зачем:** зафиксировать RLS inventory и роль topology до SQL.

**Acceptance:**
- [ ] Таблица inventory: все текущие tenant tables (`organizations`? memberships, clients, matters, users?, sessions) + будущие Workspace*; для каждой: RLS нужна? org-only vs workspace-scoped.
- [ ] Описание migration vs runtime roles; запрет BYPASSRLS; как Nest ставит transaction-local GUC.
- [ ] Rollback notes для S1.
- [ ] Короткая запись в `tasks/` или `docs/workspace-phase2/` working note **без** повышения PROPOSED SQL до CONFIRMED.

**Scope:** Small–Medium (docs + возможно stub scripts). **Deps:** none.

### Slice 1 — DB foundation (**feature**)
**Зачем:** сущности + RLS на том, что уже есть + harness под runtime role.

**Acceptance:**
- [ ] Prisma: `Workspace`, `WorkspaceMember`, `WorkspaceMatter` (+ enums visibility/status/role по канону 02); composite org constraints где реализуемо.
- [ ] Legacy: backfill script/migration для непустого `Matter.workspaceId` → `WorkspaceMatter`; колонка пока остаётся.
- [ ] SQL: `ENABLE` + `FORCE ROW LEVEL SECURITY` на согласованном inventory; fail-closed без GUC.
- [ ] Runtime role в compose/CI/`.env.example`; app использует runtime URL.
- [ ] Integration tests **под runtime role** (не owner): cross-org deny SELECT/INSERT/UPDATE; no-context deny; pool context не протекает.
- [ ] Existing Client/Matter e2e зелёные под новым runtime role.
- [ ] AS-IS + `packages/db` README обновлены.

**Deps:** S0. **Risk:** Prisma interactive transactions + `SET LOCAL` — сверить Prisma 7 docs (Context7) до выбора helper.

### Slice 2 — Authorization layer (**feature**)
**Зачем:** единая политика Workspace в `@spectre/access`, без копипасты в контроллерах.

**Acceptance:**
- [ ] API: resolve access PERSONAL (owner only) / TEAM (owner + active member role).
- [ ] Роли OWNER (via `ownerUserId`) / EDITOR / VIEWER; Org Admin **не** читает content.
- [ ] Org Admin / Owner org могут manage members **без** content read (**W-008**).
- [ ] Unit tests: cross-org, org-member без membership, PERSONAL чужой, role escalation deny.
- [ ] Каждый DB touch пользовательских данных идёт через tx + actor GUC (обёртка в api/db).

**Deps:** S1.

### Slice 3 — Workspace HTTP API (**feature**)
**Зачем:** вертикальный срез «участник видит свои пространства».

**Acceptance (минимум):**
- [ ] Session required; `organizationId` только из ActorContext.
- [ ] `GET` list своих Workspace; `POST` create PERSONAL (и TEAM только если матрица разрешает — иначе stop/OPEN).
- [ ] `GET`/`PATCH` по id → одинаковый `404` чужому/другому org.
- [ ] Members: add/list/update role/revoke для Owner (+ Org Admin manage без content).
- [ ] Link/unlink Matter через `WorkspaceMatter`; cross-org Client/Matter → `422`/`404` по конвенции; DB constraint тоже.
- [ ] E2e негативы как в roadmap Фаза 2.
- [ ] Audit events **тонкие** (кто/что/когда/ids) если уже есть место; иначе явный OUT + follow-up — не логировать секреты.
- [ ] AS-IS HTTP table обновлена; web UI Workspace **можно отложить** (API-first), либо минимальный list после CSRF.

**Deps:** S2. **CSRF:** чисто API cookie-mutating с Origin check — согласовать с S4a; новые web forms только после S4a.

### Slice 4a — CSRF (**W-014**) (**feature**)
**Acceptance:** механизм выбран и задокументирован; invalid/missing/cross-origin → reject; login/logout поведение зафиксировано; e2e; AS-IS.

### Slice 4b — Bootstrap seed (**W-012**) (**feature**)
**Acceptance:** dev-only seed/bootstrap создаёт Org+Owner; не в image/repo secrets; идемпотентность/защита от двойного owner; README how-to login.

### Slice 4c — Invitations (**feature**)
**Acceptance:** create/resend/revoke/accept; token CSPRNG, в DB только hash; replay/email mismatch reject; TTL из config (**O-011**); Owner не выдаётся invite’ом; audit без raw token. Email adapter может быть stub/outbox в dev.

**Deps для 4\*:** S3 для Workspace-adjacent; CSRF до mutating **UI**. Invite API после S4a если вызывается из браузера с cookie.

---

## 4. Явно позже (не блокирует «Фаза 2 membership done»)

| Slice | Roadmap | Примечание |
|---|---|---|
| S5 Chat | Фаза 5 | Нужен контентный контур; RLS inventory расширить до Chat/Message |
| S6 Admin grant | Фаза 9 | D-013/016, W-015/016; без email — O-010 |
| S7 Lifecycle delete | Фаза 10 | Dual confirm; **O-012** стопит confirmer matrix |
| S8 Hardening | поперечно | Rate limit (**W-019**), worker revalidate, auth на `/ai` |

Optional thin fix **вне** критического пути: `ActorGuard` на `/ai/*` (не полный W-019).

---

## 5. Тест-план (минимум до «Фаза 2 done»)

Сверять с `docs/workspace-phase2/05-testing-and-acceptance.md` §2 и §4 (tenant + fail-closed + workspace membership); chat/grant/delete — когда дойдут S5–S7.

| Класс | Примеры |
|---|---|
| API | чужой org UUID → 404; org member без WorkspaceMember → нет content; VIEWER не mutate; нельзя сменить orgId через body |
| RLS runtime | Org A context не видит B; без GUC — пусто/deny; connection reuse |
| Regression | Client/Matter CRU e2e; login/me/logout |
| Invite (4c) | replay, expiry, email mismatch |

Команды проверки среза: `pnpm --filter @spectre/db migrate:deploy` → `pnpm test` (+ точечные filter). Lint/build web — если UI трогали.

---

## 6. Риски и rollback

| Risk | Mitigation |
|---|---|
| Один DB user = owner ломает смысл RLS | S1 вводит runtime role до объявления W-020 «готово» |
| Prisma + `SET LOCAL` на adapter-pg | Spike в S0/S1; interactive transaction обязателен |
| Giant schema+API PR | Жёстко резать S0→S3 |
| Drop `Matter.workspaceId` рано | Только после backfill + code switch + отдельный PR |
| Додумать O-011/O-012/O-013 | Stop + вопрос владельцу |
| CSRF пропущен до web forms | S4a gate перед Workspace UI |

Rollback: reverse migration per slice; feature flags не обязательны на scaffold, но RLS SQL должен быть обратимым скриптом down/forward в migration notes.

---

## 7. Критерий «Фаза 2 закрыта» (roadmap)

- [ ] S0–S3 влиты в `main` с зелёным CI.
- [ ] RLS harness на runtime role зелёный для inventory **текущих** tenant + Workspace* tables.
- [ ] Негативные e2e membership из §5.
- [ ] AS-IS честно отражает API/схему; Workspace **не** объявлен «полным MVP».
- [ ] S4a минимум до любых новых cookie mutating forms в web; S4b рекомендуется для DX; S4c — следующий вертикальный кусок после membership API.

---

## 8. Решение владельца — **утверждено** (2026-11-03)

Зафиксированные assumptions:
1. «Фаза 2 done» = **S0–S3** (+ желательно S4a/S4b); invitations/chat/grant — отдельно.
2. Workspace **web UI** откладывается после API; любой list UI — только после CSRF (**S4a**).
3. В **S3** сначала только создание **PERSONAL**; **TEAM create** — stop до отдельного решения (кто вправе создавать).
4. Auth на `/ai` и rate limit **не** входят в Phase 2 done.

Рабочий артефакт S0: `docs/workspace-phase2/S0-rls-foundation-and-inventory.md`.
