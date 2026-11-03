/** Session profile from login/me (scaffold subset of docs/12). */
export type AuthSession = {
  user: { id: string; email: string };
  organization: { id: string; role: string };
};

export type LoginInput = {
  email: string;
  password: string;
  organizationId: string;
};
