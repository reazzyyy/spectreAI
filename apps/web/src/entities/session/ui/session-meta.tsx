import type { AuthSession } from "../model/types";

/** Read-only session fields for display (entity UI). */
export function SessionMeta({ session }: { session: AuthSession }) {
  const { user, organization } = session;

  return (
    <dl className="session-meta">
      <div>
        <dt>Email</dt>
        <dd>{user.email}</dd>
      </div>
      <div>
        <dt>Организация</dt>
        <dd>
          <code>{organization.id}</code>
        </dd>
      </div>
      <div>
        <dt>Роль</dt>
        <dd>{organization.role}</dd>
      </div>
    </dl>
  );
}
