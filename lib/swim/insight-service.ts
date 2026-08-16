// AI Coach контракт для VOLT Swim (архитектура Sprint 2; наполнение — Sprint 4,
// см. docs/volt-swim/SPRINTS.md). Сервис возвращает типизированный список для
// текущих Swim consumers, не смешивая presentation и генерацию инсайтов.
import type { SwimInsight } from "@/lib/swim/types";

export function getSwimInsights(): SwimInsight[] {
  return [];
}
