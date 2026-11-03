# Workspace Phase 2 — API, authentication, invitations and CSRF

**Статус:** продуктовые решения B1–B4 подтверждены; endpoint names/payloads ниже — проектный контракт (`PROPOSED`) до сверки с текущими NestJS DTO, error format и API conventions.  
**Связанные документы:** `DECISIONS-ADDENDUM.md`, `docs/11-api-conventions.md`, `docs/12-authentication-and-sessions.md`, `docs/26-codebase-current-state.md`.

## 1. Аутентификация MVP

### 1.1 Подтверждённая схема

- Email + Password + Organization ID.
- Первая Organization и первый Owner создаются через контролируемый seed/bootstrap.
- Публичная self-registration отсутствует.
- Owner приглашает сотрудников по email.
- MFA/SSO не входят в MVP.
- Organization ID выбирает tenant context, но не является секретом и не доказывает полномочия.

Текущий scaffold уже имеет `POST /api/v1/auth/login` с email, password и organizationId, HttpOnly cookie и серверный ActorContext. Не ломать этот контракт без необходимости; проверить фактическую реализацию и тесты.

### 1.2 Login flow

1. Принять email, password, organizationId.
2. Нормализовать email по единому правилу.
3. Проверить credentials и active User.
4. Проверить active Organization и active OrganizationMembership в указанной Organization.
5. Создать серверную Session, сохранить только hash токена.
6. Привязать Session к userId + organizationId.
7. Установить HttpOnly cookie с Secure в production и корректным SameSite.
8. Записать security audit event без пароля/токена.
9. Вернуть минимальный user/organization context.

Не доверять userId/role/organizationId из последующих клиентских запросов. Actor context строится из проверенной Session и повторно валидированного membership.

### 1.3 Session revocation

При отзыве OrganizationMembership:
- сессия, связанная с этой Organization, должна перестать авторизовывать операции;
- при необходимости отозвать её явно;
- каждая защищённая операция повторно проверяет active membership;
- ранее созданные сессии не сохраняют доступ после увольнения.

Не менять согласованные текущие session TTL значения без отдельного решения; в текущей документации часть параметров остаётся proposal.

## 2. Bootstrap первой Organization

- Bootstrap запускается контролируемо оператором/владельцем продукта, не публичным endpoint.
- Создаёт Organization и первого пользователя с ролью `owner`.
- Не хранить bootstrap password в репозитории, Dockerfile, migration или seed fixture для production.
- Production bootstrap secret поступает из защищённой конфигурации и после использования ротируется/удаляется.
- Seed для локальной разработки должен быть явно dev-only и использовать синтетические данные.
- Операция должна быть идемпотентной или иметь защиту от случайного повторного создания нескольких первых Owner.

## 3. Приглашения в Organization

### 3.1 Кто приглашает

Подтверждённый MVP путь: приглашения сотрудников инициирует Owner Organization.

Org Admin может управлять существующим Organization membership и Workspace membership в пределах своих полномочий, но расширение права создавать новые Organization invitations не считать автоматически подтверждённым.

### 3.2 Модель OrganizationInvitation

Минимальные поля:

- `id`;
- `organizationId`;
- `emailNormalized`;
- `role` (только допустимые для приглашения роли; не позволять приглашением выдать Owner без отдельного процесса);
- `tokenHash`;
- `invitedByUserId`;
- `createdAt`;
- `expiresAt`;
- `acceptedAt`;
- `revokedAt`;
- `lastSentAt` / `sendCount` — если нужно для rate limiting.

Точный срок приглашения — OPEN. Не зашивать 72 часа как подтверждённое решение. Срок должен быть конфигурируемым до продуктового подтверждения.

### 3.3 Create / resend / revoke

Предлагаемые endpoints:

| Метод | Endpoint | Назначение |
|---|---|---|
| POST | `/api/v1/organizations/:organizationId/invitations` | Создать приглашение |
| GET | `/api/v1/organizations/:organizationId/invitations` | Список активных/истёкших приглашений для уполномоченного Owner |
| POST | `/api/v1/organizations/:organizationId/invitations/:invitationId/resend` | Перевыпустить token / отправить повторно |
| DELETE | `/api/v1/organizations/:organizationId/invitations/:invitationId` | Отозвать приглашение |
| POST | `/api/v1/invitations/accept` | Принять приглашение |

Все endpoints требуют серверной авторизации, tenant scope, audit event и rate limiting.

При повторной отправке безопаснее выпускать новый токен, инвалидируя предыдущий. Не возвращать существующий raw token из БД.

### 3.4 Token handling

- Токен — криптографически случайный, одноразовый.
- В БД хранится только криптографический hash.
- Сравнение — безопасным способом.
- Token не попадает в обычные логи, аналитические события, error messages или audit payload.
- При принятии проверяются срок, revoke/used status, совпадение нормализованного email и целевая Organization.
- Token используется атомарно: две параллельные попытки не должны создать два членства.
- Повторное принятие не меняет существующую роль и не дублирует membership.

### 3.5 Accept flow

1. Пользователь открывает ссылку приглашения.
2. Backend проверяет приглашение и показывает минимальную информацию об Organization без раскрытия лишних данных.
3. Если User отсутствует — создаётся аккаунт с password setup и необходимой проверкой владения email.
4. Если User существует — требуется войти под этим аккаунтом.
5. Email аккаунта должен совпасть с адресом приглашения.
6. Backend создаёт OrganizationMembership в транзакции.
7. Invitation помечается accepted.
8. Пользователь получает доступ только к Organization, но не автоматически ко всем TEAM Workspace.
9. Workspace Owner или Org Admin назначает его в нужные TEAM Workspace с ролью.

Нельзя принимать приглашение под другим email или менять Organization ID в payload, чтобы попасть в другой tenant.

### 3.6 Email delivery

Использовать серверный email adapter, не привязывая доменную логику к конкретному провайдеру. Конкретный SMTP/API провайдер и требования к размещению/обработке email данных остаются отдельным инфраструктурным решением.

В production raw invite token передаётся только через защищённую ссылку в email. Не выводить его в API response или лог. В dev разрешён отдельный локальный mail catcher/test adapter, если он не включён в production.

## 4. Workspace API

Предлагаемые REST endpoints; точные DTO и response envelope привести к `docs/11-api-conventions.md` и текущему NestJS exception format.

### 4.1 Workspace CRUD

| Метод | Endpoint | Назначение |
|---|---|---|
| GET | `/api/v1/workspaces` | Список доступных пространств |
| POST | `/api/v1/workspaces` | Создать PERSONAL или TEAM |
| GET | `/api/v1/workspaces/:workspaceId` | Получить метаданные и доступный пользователю summary |
| PATCH | `/api/v1/workspaces/:workspaceId` | Изменить разрешённые метаданные |
| POST | `/api/v1/workspaces/:workspaceId/archive` | Архивировать |
| POST | `/api/v1/workspaces/:workspaceId/restore` | Восстановить из архива |
| POST | `/api/v1/workspaces/:workspaceId/deletion-request` | Запросить удаление |
| POST | `/api/v1/workspaces/:workspaceId/deletion-confirmation` | Второе подтверждение |

`DELETE /workspaces/:id` не должен выполнять немедленный hard delete. Использовать явный двухэтапный workflow.

### 4.2 Workspace members

| Метод | Endpoint | Назначение |
|---|---|---|
| GET | `/api/v1/workspaces/:workspaceId/members` | Список участников |
| POST | `/api/v1/workspaces/:workspaceId/members` | Добавить участника |
| PATCH | `/api/v1/workspaces/:workspaceId/members/:userId` | Изменить роль |
| DELETE | `/api/v1/workspaces/:workspaceId/members/:userId` | Удалить участника |
| POST | `/api/v1/workspaces/:workspaceId/ownership-transfer` | Передать владение |

Добавлять можно только active Organization members той же Organization. Нельзя добавить внешний email напрямую как Workspace member: сначала требуется Organization invitation и active membership.

### 4.3 Client/Matter links

| Метод | Endpoint | Назначение |
|---|---|---|
| PUT | `/api/v1/workspaces/:workspaceId/client` | Установить/заменить optional Client link |
| DELETE | `/api/v1/workspaces/:workspaceId/client` | Убрать Client link |
| POST | `/api/v1/workspaces/:workspaceId/matters` | Добавить Matter link |
| DELETE | `/api/v1/workspaces/:workspaceId/matters/:matterId` | Убрать Matter link |
| GET | `/api/v1/workspaces/:workspaceId/matters` | Список связанных Matter |

Перед созданием связи проверять одинаковый organizationId у Workspace и Client/Matter. Удаление link не удаляет сам Client/Matter и не удаляет контент Workspace.

### 4.4 Chat visibility

При создании чата клиент выбирает допустимый режим `PRIVATE` или `WORKSPACE`, но backend проверяет права и принудительно устанавливает owner/creator из ActorContext.

Не принимать `createdByUserId` как доверенное поле. Для `PRIVATE` проверять creator; для `WORKSPACE` — active Workspace membership и role.

## 5. Admin grant API

Предлагаемые endpoints:

| Метод | Endpoint | Назначение |
|---|---|---|
| POST | `/api/v1/admin-grants` | Запросить временный доступ к Workspace |
| GET | `/api/v1/admin-grants/:grantId` | Статус запроса для участников процесса |
| POST | `/api/v1/admin-grants/:grantId/approve` | Одобрить независимым approver |
| POST | `/api/v1/admin-grants/:grantId/reject` | Отклонить |
| POST | `/api/v1/admin-grants/:grantId/revoke` | Отозвать активный grant |

Обязательные поля запроса:
- `workspaceId`;
- `reason` — обязательное объяснение;
- `requestedScope` — по умолчанию только `content:read`; более узкий scope предпочтителен.

Backend сам определяет requester из Session и Organization role. Approver не может совпадать с requester и должен иметь `admin_grant:approve` на момент одобрения.

TTL не более 60 минут. Продление запрещено. Новый срок — новый request + approval.

## 6. CSRF

### 6.1 Требование

Все cookie-authenticated mutating endpoints должны иметь CSRF protection. CORS не заменяет CSRF. `SameSite` — дополнительный слой, не единственная защита.

B4 требует выделить CSRF техническим срезом до добавления следующих mutating-форм и массовых mutating endpoints.

### 6.2 Минимальные проверки

- Валидировать `Origin` для browser requests против allowlist ожидаемых origins.
- При необходимости проверять `Referer` как дополнительный сигнал.
- Использовать утверждённый CSRF token pattern: synchronizer token или double-submit cookie.
- Не помещать CSRF secret в URL.
- Защитить login/logout и все state-changing operations в соответствии с threat model.
- GET/HEAD/OPTIONS не должны менять состояние.
- Отклонять cross-origin mutating requests до выполнения бизнес-логики.
- Добавить integration/e2e тесты на валидный и невалидный token/origin.

Точный механизм (synchronizer vs double-submit) выбрать после проверки доменной схемы, Next rewrite, cookie attributes и deployment topology. Не реализовывать одновременно несколько несовместимых схем без необходимости.

**CONFIRMED (W-014a, 2026-11-04):** scaffold — Origin allowlist (`WEB_ORIGIN`) + double-submit cookie (`spectre_csrf` + `X-CSRF-Token`). Synchronizer не используется. AS-IS: `docs/26-codebase-current-state.md`.

## 7. Технические лимиты

Тарифных квот в MVP нет, но обязательны:
- rate limiting на login, invite, resend, accept, admin grant, workspace mutations;
- лимиты тела HTTP request;
- D-010/D-017 file limits: 25 MB/file, max 10 files/operation, PDF/DOCX/TXT;
- лимиты на число параллельных AI jobs и ресурсы worker, конкретные значения — после load/cost testing (O-007);
- pagination и bounded query limits;
- защита от массового создания Workspace/invitations;
- idempotency/optimistic concurrency для критичных операций, где возможны повторы.

Не добавлять тарифные ограничения на количество Workspace/пользователей без нового решения.
