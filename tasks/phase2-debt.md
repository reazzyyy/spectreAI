# Phase 2 — remaining debt (backlog)

**Статус:** живой бэклог после закрытия каркаса Workspace + F5 UI (2026-11-09); сверка решений 2026-11-10 (D-025–D-031).  
**Не смешивать** с Фазой 3/4 documents: эти пункты не блокируют upload/extract, кроме случаев safety (тогда stop + решение).

Канон: `docs/decisions-log.md`, `docs/workspace-phase2/`, AS-IS `docs/26`.

## Security / access

| ID | Долг | Примечание |
|---|---|---|
| W-020+ | Workspace-membership / chat / grant RLS policies | Org-tenant GUC есть; membership policies — hardening slice |
| ACL-07 | Полная матрица `docs/07` для Client/Matter | Сейчас org-membership isolation scaffold |
| W-010 / O-012 | Удаление TEAM Workspace + dual confirmation | Confirmer model **OPEN** — не кодировать |
| W-009 | Ownership transfer PERSONAL/TEAM | Нет HTTP/UI |
| ~~O-013~~ | EDITOR vs чужой контент (delete) | **Закрыт D-029** — кодировать delete только по правилу |
| W-008 UX | Org Admin manage members **без** content read | API частично; UI не подчёркивает разделение |

## Auth / invitations

| ID | Долг | Примечание |
|---|---|---|
| Email | Delivery provider для invitations | Stub + `devToken` only |
| ~~O-011~~ | Invite TTL | **Закрыт D-028:** `INVITE_TTL_HOURS`, default 72h |
| Session | Idle timeout 24h (`docs/12`) | Только абсолютные 7d |
| Audit | Login/logout/invite audit events | Thin `audit_events` — hardening/backlog |
| Rate limit | Каркас abuse protection | W-019 technical limits — hardening slice |

## Product / CRM

| ID | Долг | Примечание |
|---|---|---|
| WS-11 | Delete / archive Workspace UI+API | Статусы enum есть; flow ждёт O-012 |
| MEM-05/06 | VIEWER/EDITOR UX nuances | Thin |
| CRM-07 | Hard delete Client/Matter | Out of slice; D-019 later |
| `created_by` | Поле на Client/Matter (`docs/06`) | Нужно для D-029 на Client/Matter; Document уже имеет `uploadedByUserId` |

## CI / quality (optional chores)

| ID | Долг | Примечание |
|---|---|---|
| Chromatic | Publish gate | Нужен `CHROMATIC_PROJECT_TOKEN` |
| CI | lint / typecheck / build jobs | Сейчас `test` + `web-e2e` |

## Как брать из бэклога

1. Отдельная короткоживущая ветка на один семантический долг.
2. Не блокировать Фазу 3/4 этими пунктами, кроме случаев, где без них нельзя безопасно хранить контент (тогда stop + решение).
3. После закрытия — вычеркнуть здесь и обновить AS-IS.
