// Отображаемый статус карточки активной тренировки (app/active-workout.tsx).
// "Выполнено" — подтверждённый факт: draft.status==="completed" выставляется
// только внутри confirmWorkoutDraft после реального сохранения workout_log
// (lib/active-workout-service.ts). Раньше статус вычислялся тернарной цепочкой
// с веткой "иначе — выполнено", которая ошибочно накрывала любой статус, не
// равный буквально "active"/"awaiting_confirmation" — например транзиентный
// "planned". Здесь "выполнено" и "ожидает подтверждения" проверяются явным
// равенством, а любой другой статус (включая непредвиденный) безопасно
// считается активной, незавершённой сессией — никогда не выполненной.

export function activeWorkoutStatusLabel(status: string): string {
  if (status === "completed") return "ТРЕНИРОВКА ВЫПОЛНЕНА";
  if (status === "awaiting_confirmation") return "ОЖИДАЕТ ПОДТВЕРЖДЕНИЯ";
  return "ТРЕНИРОВКА ИДЁТ";
}

export function isActiveWorkoutView(status: string): boolean {
  return status !== "awaiting_confirmation" && status !== "completed";
}
