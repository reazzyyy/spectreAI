# Phase 2 — remaining debt (backlog)

**Статус:** живой бэклог после закрытия каркаса Workspace + F5 UI (2026-11-09).  
**Не смешивать** с Фазой 3 (documents): эти пункты не блокируют старт upload-среза, но остаются открытыми до отдельных PR / решений владельца.

Канон: `docs/decisions-log.md`, `docs/workspace-phase2/`, AS-IS `docs/26`.

## Security / access

| ID | Долг | Примечание |
|---|---|---|
| W-020+ | Workspace-membership / chat / grant RLS policies | Сейчас только org-tenant GUC; Nest authz не снимается |
| ACL-07 | Полная матрица `docs/07` для Client/Matter | Сейчас org-membership isolation scaffold |
| W-010 / O-012 | Удаление TEAM Workspace + dual confirmation | Confirmer model OPEN |
| W-009 | Ownership transfer PERSONAL/TEAM | Нет HTTP/UI |
| O-013 | EDITOR vs чужой контент (delete) | Не кодировать без решения |
| W-008 UX | Org Admin manage members **без** content read | API частично; UI не подчёркивает разделение |

## Auth / invitations

| ID | Долг | Примечание |
|---|---|---|
| Email | Delivery provider для invitations | Stub + `devToken` only |
| O-011 | CONFIRMED invite TTL | Config `INVITE_TTL_HOURS`; не хардкодить «72h» в journal |
| Session | Idle timeout 24h (`docs/12`) | Только абсолютные 7d |
| Audit | Login/logout/invite audit events | Нет |
| Rate limit | Каркас abuse protection | Нет (W-019: тарифы не в MVP, технические лимиты нужны) |

## Product / CRM

| ID | Долг | Примечание |
|---|---|---|
| WS-11 | Delete / archive Workspace UI+API | Статусы enum есть; flow нет |
| MEM-05/06 | VIEWER/EDITOR UX nuances | Thin |
| CRM-07 | Hard delete Client/Matter | Out of slice; D-019 later |
| `created_by` | Поле на Client/Matter (`docs/06`) | OPEN / отложено |

## CI / quality (optional chores)

| ID | Долг | Примечание |
|---|---|---|
| Chromatic | Publish gate | Нужен `CHROMATIC_PROJECT_TOKEN` |
| CI | lint / typecheck / build jobs | Сейчас `test` + `web-e2e` |

## Как брать из бэклога

1. Отдельная короткоживущая ветка на один семантический долг.
2. Не блокировать Фазу 3/4 этими пунктами, кроме случаев, где без них нельзя безопасно хранить контент (тогда stop + решение).
3. После закрытия — вычеркнуть здесь и обновить AS-IS.
