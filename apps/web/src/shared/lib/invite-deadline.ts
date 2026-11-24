const DATE = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Absolute deadline from the invitation `expiresAt` the server already stored.
 * The UI must not invent a 7-day lifetime: the default in invite-config is 72h,
 * and INVITE_TTL_HOURS can change it.
 */
export function inviteDeadlineLabel(expiresAt: string): string {
  const end = new Date(expiresAt);
  if (Number.isNaN(end.getTime())) return "срок задаёт сервер";
  return DATE.format(end);
}
