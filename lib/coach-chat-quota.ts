export const COACH_CHAT_DAILY_LIMIT = 40;
export const COACH_CHAT_TIME_ZONE = "Europe/Moscow";

type QuotaStore = {
  get(key: string): string | null;
  set(key: string, value: string): void;
};

export function dateInTimeZone(now: Date, timeZone = COACH_CHAT_TIME_ZONE): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const quotaKey = (date: string) => `coach_chat_count_${date}`;

export function reserveDailyQuota(store: QuotaStore, date: string, limit = COACH_CHAT_DAILY_LIMIT): boolean {
  const key = quotaKey(date);
  const count = Math.max(0, Number(store.get(key)) || 0);
  if (count >= limit) return false;
  store.set(key, String(count + 1));
  return true;
}

export function releaseDailyQuota(store: QuotaStore, date: string): void {
  const key = quotaKey(date);
  const count = Math.max(0, Number(store.get(key)) || 0);
  store.set(key, String(Math.max(0, count - 1)));
}
