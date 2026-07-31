// AI-9 доработка — быстрый компактный ввод подходов вида "45×8, 45×8, 45×7"
// (docs/ACTIVE_WORKOUT_SPRINTS.md, AI-9, п.3). Чистая детерминированная функция
// без LLM: парсер только разбирает текст, все числовые границы (вес/повторы)
// совпадают с тем, что уже проверяет lib/active-workout-service.ts на сервере,
// чтобы предпросмотр на клиенте не расходился с серверной валидацией.

export type ParsedSet = { weight: number; reps: number };
export type ParseSetsResult = { ok: true; sets: ParsedSet[] } | { ok: false; error: string };

const MAX_SETS = 20;
const SET_PATTERN = /^(\d+(?:\.\d+)?)\s*[×xXхХ]\s*(\d+)$/;

// Разделитель подходов — запятая/точка с запятой/перенос строки. Запятая без
// пробела сразу после неё между цифрами трактуется как десятичный разделитель
// веса ("45,5×8" → 45.5), запятая с пробелом или перед не-цифрой — разделитель
// подходов ("45×8, 45×8"). Это осознанное ограничение: если ввести подряд
// несколько подходов через запятую без пробела и без десятичных весов
// ("45×8,46×7"), результат может быть неоднозначным — интерфейс подсказывает
// использовать пробел после запятой или точку с запятой.
function protectDecimalCommas(input: string): string {
  return input.replace(/(\d),(?=\d)/g, "$1.");
}

export function parseCompactSets(input: string): ParseSetsResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: "Введите хотя бы один подход, например 45×8" };
  const normalized = protectDecimalCommas(trimmed);
  const tokens = normalized.split(/[,;\n]+/).map(x => x.trim()).filter(Boolean);
  if (!tokens.length) return { ok: false, error: "Введите хотя бы один подход, например 45×8" };
  if (tokens.length > MAX_SETS) return { ok: false, error: `Слишком много подходов (максимум ${MAX_SETS})` };
  const sets: ParsedSet[] = [];
  for (const token of tokens) {
    const match = token.match(SET_PATTERN);
    if (!match) return { ok: false, error: `Не удалось разобрать «${token}» — используйте формат «вес×повторы», например 45×8` };
    const weight = Number(match[1]);
    const reps = Number(match[2]);
    if (!Number.isFinite(weight) || weight < 0 || weight > 500) return { ok: false, error: `Некорректный вес в «${token}» — от 0 до 500 кг` };
    if (!Number.isFinite(reps) || reps < 0 || reps > 100000) return { ok: false, error: `Некорректные повторы в «${token}»` };
    sets.push({ weight, reps });
  }
  return { ok: true, sets };
}
