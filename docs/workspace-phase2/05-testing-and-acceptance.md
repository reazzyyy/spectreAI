# Workspace Phase 2 — тестирование и критерии приёмки

**Статус:** обязательные критерии для Workspace Phase 2; дополняют `docs/22-testing-and-quality-strategy.md`.  
**Связанные документы:** `DECISIONS-ADDENDUM.md`, `02-data-model-and-rls.md`, `03-api-auth-and-invitations.md`, `04-lifecycle-admin-grants-and-export.md`.

## 1. Общие правила

- Тестировать на PostgreSQL той же основной версии/возможностей, что и production, включая RLS.
- Запускать тесты под runtime DB role, а не только под migration/table-owner role.
- Не использовать SQLite для проверки RLS.
- Все security tests должны проверять фактический HTTP/API или DB behavior, а не только helper function.
- Использовать синтетические данные.
- Не отправлять реальные клиентские документы во внешний AI; действует D-012/O-002.
- Для каждого разрешённого действия тестировать запрещённый аналог.
- Не утверждать, что RLS работает, если тесты выполнялись только под superuser или owner role.

## 2. Workspace product tests

### 2.1 Создание и типы

- Пользователь с active OrganizationMembership может создать PERSONAL Workspace.
- Только разрешённые роли могут создать TEAM Workspace.
- Workspace всегда имеет organizationId из ActorContext, а не из body.
- PERSONAL получает ownerUserId текущего пользователя.
- TEAM получает owner и валидный набор участников.
- Нельзя создать Workspace для другой Organization подменой organizationId.
- Workspace может существовать без Client и Matter.
- Client link может быть пустым или указывать только на Client той же Organization.
- Несколько Matter могут быть связаны с одним Workspace.
- Один Matter может быть связан с несколькими Workspace.
- Дублирующая WorkspaceMatter связь запрещена.
- Cross-org Client/Matter link отклоняется и на API, и на DB constraint уровне.

### 2.2 Workspace role tests

- OWNER может выполнять разрешённые операции управления.
- EDITOR может читать/создавать/редактировать в пределах согласованной матрицы.
- VIEWER может читать, но не создавать/изменять.
- VIEWER не может управлять участниками, ролями, ownership, архивом или удалением.
- EDITOR не может управлять участниками/ролями/ownership или удалять Workspace.
- Нельзя повысить собственную роль через PATCH.
- Org Admin не становится Workspace OWNER автоматически.
- Удаление membership немедленно прекращает доступ.
- Неизвестная/отозванная роль — deny by default.

## 3. Chat visibility tests

- `PRIVATE` chat видит creator; другой Workspace member не видит его через list/get/search.
- `WORKSPACE` chat видят только участники Workspace с правом чтения.
- Message endpoint проверяет доступ к родительскому Chat.
- Нельзя получить Message по прямому ID, если нет доступа к Chat.
- Изменение visibility на WORKSPACE требует явного действия и подтверждения.
- Org Admin без grant не видит private/shared chat content.
- Admin grant не открывает private chat, если он не включён в approved scope.

## 4. PostgreSQL RLS tests — блокирующие

### 4.1 Tenant isolation

Создать две Organizations A и B, пользователей и объекты.

Под runtime role и context A:
- SELECT не возвращает rows B;
- UPDATE rows B не меняет их;
- DELETE rows B не удаляет их;
- INSERT с organizationId B отклоняется;
- join/subquery не позволяет извлечь B через Client, Matter, Workspace, Chat, Document, Message, Research, Draft, AIJob, chunks или audit;
- поиск FTS/pgvector не возвращает chunks B.

Повторить симметрично для context B.

### 4.2 Fail-closed context

- Без `app.current_user_id` и `app.current_organization_id` tenant query не возвращает данные.
- Некорректный UUID/context приводит к отказу, а не к unrestricted query.
- Context A не сохраняется после завершения transaction.
- При повторном использовании pool connection следующий request B не видит данные A.
- Ошибка/rollback транзакции не оставляет actor context на connection.
- Клиент не может передать произвольные GUC values через HTTP и получить доступ.

### 4.3 Workspace-level policies

- Пользователь A, член Organization, но не Workspace W, не читает content W.
- PERSONAL Workspace доступен owner, но не соседнему Organization member.
- TEAM Workspace доступен owner и active members.
- Revoked WorkspaceMember сразу перестаёт давать доступ.
- PRIVATE chat ограничен creator.
- WORKSPACE chat доступен членам Workspace.
- Org Admin без grant не читает content.
- Org Admin с валидным approved grant читает только одобренный scope и только пока grant active.
- Expired/revoked grant не даёт доступа.
- Grant не разрешает UPDATE/DELETE/INSERT.
- Нельзя расширить scope подменой workspaceId/resourceId.

### 4.4 Role bypass tests

- Runtime role не владеет tenant tables.
- Runtime role не имеет SUPERUSER/BYPASSRLS.
- `FORCE ROW LEVEL SECURITY` включён на требуемых таблицах.
- Миграции могут включать RLS, но приложение не использует migration credentials.
- Тестовый helper не отключает RLS.
- Auth bootstrap functions не предоставляют произвольный SELECT к бизнес-таблицам.

## 5. Auth/invitation tests

- Login требует корректные email/password/organizationId.
- Неверная пара user/org не создаёт Session.
- Пользователь без active membership не входит в Organization.
- Invitation token хранится только как hash.
- Истёкший/отозванный/использованный token не принимается.
- Email mismatch не позволяет принять приглашение.
- Две параллельные accept попытки создают максимум одно membership.
- Повторный accept идемпотентен или возвращает безопасную ошибку без изменения role.
- Invitation не может назначить Owner без отдельного разрешённого процесса.
- Org membership не даёт автоматический доступ ко всем Workspace.
- При revoke membership сессия теряет доступ.

## 6. CSRF tests

- Mutating cookie-authenticated request без CSRF token отклоняется.
- Неверный token отклоняется.
- Cross-origin Origin отклоняется.
- Валидный same-origin запрос проходит.
- GET/HEAD/OPTIONS не меняют состояние.
- CORS allowlist не используется как единственная CSRF защита.
- CSRF защита работает через фактический Next rewrite/deployment origin, а не только в unit tests.

## 7. Admin grant tests

- Org Admin без grant не читает Workspace content.
- Requester не может approve собственный grant.
- Approver без `admin_grant:approve` не может approve.
- Approver должен иметь активное membership и permission на момент одобрения.
- Grant не активируется до approval.
- TTL никогда не превышает 60 минут.
- Grant не продлевается.
- Новый grant требует нового approval.
- Expired/revoked grant отказывает даже при наличии кэша.
- Grant read-only: все mutating actions отклоняются.
- Audit events создаются для request/approve/reject/revoke/use/expire.
- Audit не содержит content, full prompt/response, tokens или secrets.

## 8. Lifecycle tests

- Archive не удаляет данные и может быть отменён уполномоченным лицом.
- Deletion request сам по себе не удаляет данные.
- Requester не может выполнить второе подтверждение.
- Без независимого confirmer deletion не запускается.
- После подтверждения Workspace немедленно недоступен обычным пользователям.
- Cleanup workflow удаляет оригиналы и производные в пределах D-019 ≤24h.
- Search/FTS/vector/cache не возвращают данные после tombstone.
- AIJob result после deletion недоступен.
- Restore из backup повторно применяет deletion journal.
- Retention backups остаётся 35 дней по D-020.

## 9. Acceptance criteria

Phase 2 не считается готовой, пока:

1. Workspace/WorkspaceMember/WorkspaceMatter модель и миграции согласованы.
2. `Matter.workspaceId` legacy field обработан безопасным expand/backfill/contract планом.
3. RLS включён и forced на всех tenant-owned таблицах из inventory.
4. API runtime role не имеет bypass privileges.
5. RLS integration tests проходят под runtime role.
6. NestJS проверяет Workspace role и object ACL на всех endpoints.
7. Личные и общие чаты имеют разную visibility и тесты.
8. Admin grant реализован с independent approval, TTL ≤60m, no renewal, read-only.
9. Invitations работают с одноразовым hash token и active membership.
10. CSRF срез завершён до включения mutating Workspace forms.
11. Revoke membership немедленно отзывает доступ в API, search, files и AI jobs.
12. Архивирование и двухэтапное удаление не нарушают D-019/D-020.
13. Audit events фиксируют security-sensitive operations без утечки контента.
14. Все изменения сопровождаются миграциями, rollback/restore notes, тестами и обновлением AS-IS после отдельного разрешения на изменение кода.
15. В отчёте Cursor явно перечислены реально выполненные команды и результаты; непроведённые проверки не называются успешными.

## 10. Минимальный adversarial test matrix

| Сценарий | Ожидаемый результат |
|---|---|
| Org A user → Org B Workspace | Deny / не раскрывать существование |
| Org member, не Workspace member → TEAM content | Deny |
| Другой member → PRIVATE chat | Deny |
| VIEWER → PATCH document | Deny |
| EDITOR → change member role | Deny |
| Org Admin без grant → read content | Deny |
| Org Admin с expired grant → read content | Deny |
| Requester → approve own grant | Deny |
| User removed from org → old session | Deny |
| User removed from Workspace → old document URL | Deny |
| Worker job actor lost membership → result | Cancel/deny |
| No RLS context → tenant query | Deny |
| Pool connection reused across tenants | No context leakage |
| Direct SQL under runtime role → other tenant row | Deny |
