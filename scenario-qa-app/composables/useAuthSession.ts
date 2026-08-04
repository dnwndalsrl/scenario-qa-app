export interface AuthSession {
  authenticated: boolean;
  user: { id: string; email?: string } | null;
}

export function useAuthSession() {
  return useState<AuthSession | null>("auth-session", () => null);
}
