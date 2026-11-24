const LABELS: Record<string, string> = {
  active: "Активно",
  archived: "Архив",
  pending_deletion: "Удаляется",
  revoked: "Отозван",
  uploading: "Загрузка",
  uploaded: "Загружен",
  processing: "Обработка",
  ready: "Готов",
  processing_failed: "Ошибка обработки",
  deletion_pending: "К удалению",
  deleted: "Удалён",
};

/**
 * User-facing status. Known API enums become Russian; an unknown value stays
 * visible so a new server status is not silently dropped.
 */
export function statusLabel(status: string): string {
  const key = status.trim().toLowerCase();
  return LABELS[key] ?? status;
}
