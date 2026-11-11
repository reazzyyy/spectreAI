/** Human-readable label from an email local-part (until User.name exists). */
export function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Org membership role → RU label for chrome (not an ACL claim). */
export function orgRoleLabel(role: string): string {
  const r = role.toLowerCase();
  if (r === "owner") return "Владелец";
  if (r === "admin") return "Администратор";
  if (r === "member") return "Сотрудник";
  return role || "Нет членства";
}
