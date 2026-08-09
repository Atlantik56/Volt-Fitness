export const LOGIN_IP_LIMIT = 5;
export const LOGIN_ACCOUNT_LIMIT = 20;
export const LOGIN_BLOCK_MS = 15 * 60_000;

export type LoginAttempt = { failures: number; blockedUntil: number };

export function trustedClientIp(headers: Headers) {
  const value = headers.get("x-real-ip")?.trim();
  if (!value || value.includes(",") || value.length > 64) return "proxy-unknown";
  return value;
}

export function loginThrottleKeys(headers: Headers, username: string) {
  return [
    { key: `login:ip:${trustedClientIp(headers)}`, limit: LOGIN_IP_LIMIT },
    { key: `login:account:${username}`, limit: LOGIN_ACCOUNT_LIMIT },
  ];
}

export function nextLoginFailure(previous: LoginAttempt | undefined, limit: number, now: number): LoginAttempt {
  const failures = (previous?.failures || 0) + 1;
  return failures >= limit
    ? { failures: 0, blockedUntil: now + LOGIN_BLOCK_MS }
    : { failures, blockedUntil: 0 };
}
