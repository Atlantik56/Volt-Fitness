export type AuthState = { authenticated: boolean; setupRequired: boolean };

export function createAuthStatusClient(
  request: () => Promise<Response>,
  clock: () => number = Date.now,
  ttlMs = 5_000,
) {
  let cached: { value: AuthState; expiresAt: number } | null = null;
  let pending: Promise<AuthState> | null = null;
  let generation = 0;
  const peek = () => cached && cached.expiresAt > clock() ? cached.value : null;
  return {
    peek,
    invalidate() { generation++; cached = null; pending = null; },
    load(force = false): Promise<AuthState> {
      const value = peek();
      if (!force && value) return Promise.resolve(value);
      if (pending) return pending;
      const started = generation;
      const operation = request().then(async response => {
        if (!response.ok) throw new Error("Не удалось проверить авторизацию");
        const value: unknown = await response.json();
        if (!value || typeof value !== "object" || !("authenticated" in value) || !("setupRequired" in value)
          || typeof value.authenticated !== "boolean" || typeof value.setupRequired !== "boolean") {
          throw new Error("Некорректный ответ авторизации");
        }
        if (started !== generation) throw new Error("Проверка авторизации устарела");
        const state = { authenticated: value.authenticated, setupRequired: value.setupRequired };
        cached = { value: state, expiresAt: clock() + ttlMs };
        return state;
      }).finally(() => { if (pending === operation) pending = null; });
      pending = operation;
      return operation;
    },
  };
}

export const authStatusClient = createAuthStatusClient(() => fetch("/api/auth/status", { cache: "no-store" }));

export function invalidateAuthStatus() {
  authStatusClient.invalidate();
  if (typeof window !== "undefined") window.dispatchEvent(new Event("volt-auth-invalidated"));
}
