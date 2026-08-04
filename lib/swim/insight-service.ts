// AI Coach контракт для VOLT Swim (архитектура Sprint 2; наполнение — Sprint 4,
// см. docs/volt-swim/SPRINTS.md). Сервис уже возвращает типизированный список,
// а не placeholder-строку, чтобы UI (AiCoachPreview) и будущий генератор
// инсайтов не менялись местами при подключении реальной логики.
import type { SwimInsight } from "@/lib/swim/types";

export function getSwimInsights(): SwimInsight[] {
  return [];
}
