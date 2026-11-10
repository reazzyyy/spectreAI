# Implementation Plan: Phase 3 — document upload (thin slice)

> **Статус:** в работе (старт 2026-11-09).  
> **Предыдущий план:** Frontend D-024 + F5a–F5k — **закрыт** в `main` (см. git history / `tasks/todo.md`).  
> **Канон:** D-010 / D-017, `docs/13`, Workspace W-005, AS-IS `docs/26`.  
> **Не цель этого плана:** OCR/worker (Фаза 4), chat, RAG, OpenAI, export, hard delete, выбор production object storage (**O-003**).

---

## Overview

Первый вертикальный срез Фазы 3: метаданные Document в PostgreSQL, приватный **локальный** storage adapter (scaffold, не хостер), upload/list/get/download HTTP с проверкой Workspace content ACL, негативные тесты формата/размера/org isolation, тонкий web UI библиотеки.

## Architecture Decisions

- **Принадлежность:** Document → Organization + Workspace (W-005 content via `WorkspaceAccess`).
- **Версии:** в этом срезе одна «версия» flattened на Document (`storageKey`, mime, size, checksum); отдельная `DocumentVersion` — позже.
- **Storage:** `LocalObjectStorage` под `DOCUMENT_STORAGE_ROOT` (default `.data/documents`); ключ не публичный URL; знание `storageKey` ≠ доступ.
- **Статус:** после upload — `uploaded` (обработка/OCR — Фаза 4; скан без текста не обещается — ворота E).
- **Лимиты:** PDF/DOCX/TXT; ≤ 25 МБ/файл; ≤ 10 файлов/запрос; magic-bytes + extension; ZIP/exe/макросы отклонять (DOCX — zip-based, отдельная проверка структуры).
- **Доступ:** list/get/download — `canReadContent`; upload — `canMutateContent` (OWNER/EDITOR); чужой org/workspace → `404`.
- **RLS:** tenant org GUC на `documents` (как clients/workspaces); workspace-membership policies — долг W-020 (`tasks/phase2-debt.md`).

## Task List (slices → PR в `main`)

```text
D3a  Prisma Document + migration + tenant RLS + LocalObjectStorage
D3b  DocumentAccess + HTTP upload/list/get/download + e2e isolation/validation
D3c  Web: entity + /documents list/upload thin UI + nav
Docs AS-IS / README / todo sync
```

### Acceptance (D3a–D3c)

- [x] Upload TXT/PDF/DOCX в доступный Workspace → метаданные + файл на диске
- [x] List только content-visible workspace; чужой documentId → 404
- [x] >25 МБ / bad type / >10 files → 422
- [x] UI: выбрать workspace, загрузить, увидеть список (без preview/OCR)
- [x] AS-IS + READMEs обновлены; storage root не в git

### Out of scope

Worker/AIJob, extracted text, download UI polish, soft-delete/purge D-019, S3 provider, Chromatic.

## Risks

- DOCX = ZIP: нельзя отклонять все PK-файлы; нужна проверка openxml-структуры.
- Local disk ≠ production storage; AS-IS помечает scaffold до O-003.
- Не логировать имена/пути клиентских документов сверх id/status.
