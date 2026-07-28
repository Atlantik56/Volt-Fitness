// "Вечерний прогресс" — не модуль контроля алкоголя. Идея: не осуждать, а помогать
// замечать прогресс маленькими шагами. Поэтому здесь нет "серий трезвых дней" — только
// нейтральные факты (время первой банки, ужин, сон и т.д.) и закономерности, посчитанные
// из реальных данных.

const CALORIES_PER_BEER = 150;

export type EveningInputs = {
  workout: boolean;
  dinner: boolean;
  walk: boolean;
  waterLiters: number;
  sleepHours: number;
  beers: number;
  firstDrinkTime: string; // "HH:MM" или ""
};

export type EveningChecklistItem = { label: string; done: boolean };

export type EveningResult = {
  score: number; // 0..10
  total: number;
  title: string;
  items: EveningChecklistItem[];
  firstDrinkNote: string | null;
};

export const EVENING_SUBTITLES = {
  noData: "Как прошёл твой вечер",
  partial: "Продолжить вечернюю запись",
  newInsight: "Есть новый вывод",
  neutral: "Посмотреть изменения",
} as const;

export function timeToMinutes(t: string): number | null {
  if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToLabel(mins: number): string {
  const m = Math.round(Math.abs(mins));
  const h = Math.floor(m / 60), r = m % 60;
  if (h && r) return `${h} ч ${r} мин`;
  if (h) return `${h} ч`;
  return `${r} мин`;
}

export function avg(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

const WEEKDAYS = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
export function weekdayLabel(dateIso: string): string {
  return WEEKDAYS[new Date(`${dateIso}T00:00:00`).getDay()];
}

export function describeFirstDrink(firstDrinkTime: string, avgFirstDrinkMinutes: number | null): string | null {
  const mins = timeToMinutes(firstDrinkTime);
  if (mins == null) return null;
  if (avgFirstDrinkMinutes == null) return `Первая банка сегодня в ${firstDrinkTime}.`;
  const delta = mins - avgFirstDrinkMinutes;
  if (Math.abs(delta) < 10) return "Первая банка сегодня примерно как обычно.";
  return delta > 0
    ? `Первая банка была на ${minutesToLabel(delta)} позже обычного.`
    : `Первая банка была на ${minutesToLabel(delta)} раньше обычного.`;
}

export function computeEveningScore(inputs: EveningInputs, avgFirstDrinkMinutes: number | null): EveningResult {
  const items: EveningChecklistItem[] = [];
  const add = (label: string, done: boolean) => items.push({ label, done });

  add("Тренировка", inputs.workout);
  add("Ужин", inputs.dinner);
  add("Прогулка", inputs.walk);
  add("Вода", inputs.waterLiters >= 1.5);
  add("Сон", inputs.sleepHours >= 7);

  const firstDrinkMins = timeToMinutes(inputs.firstDrinkTime);
  if (firstDrinkMins == null) {
    add(inputs.beers > 0 ? "Алкоголь без отметки времени" : "Без алкоголя сегодня", inputs.beers === 0);
  } else if (avgFirstDrinkMinutes != null) {
    add("Первая банка позже среднего", firstDrinkMins > avgFirstDrinkMinutes);
  }

  const done = items.filter(i => i.done).length;
  const total = items.length;
  const score = total ? Math.round((done / total) * 10) : 0;
  const title = score >= 7 ? "Отличный вечер!" : score >= 4 ? "Есть небольшой прогресс" : "Сегодня есть что улучшить";
  const firstDrinkNote = describeFirstDrink(inputs.firstDrinkTime, avgFirstDrinkMinutes);
  return { score, total, title, items, firstDrinkNote };
}

function lowerFirst(s: string): string {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

export function buildEveningCoachMessage(result: EveningResult, patterns: string[]): { title: string; text: string } {
  if (result.score >= 7) {
    return {
      title: "Отличный вечер!",
      text: patterns[0]
        ? `Спасибо за честную запись. Кстати, заметен один вывод: ${lowerFirst(patterns[0])}`
        : "Спасибо за честную запись. Есть прогресс — и это главное.",
    };
  }
  if (result.score >= 4) {
    return {
      title: "Есть небольшой прогресс",
      text: patterns[0]
        ? `Заметен вывод: ${lowerFirst(patterns[0])}`
        : "Небольшие изменения уже работают. Продолжай маленькими шагами.",
    };
  }
  return {
    title: "Сегодня получилось не так, как планировалось",
    text: "Спасибо за честную запись. Давай посмотрим, что могло повлиять — и завтра попробуем один небольшой шаг вместо максимальной нагрузки.",
  };
}

function shiftDates(dates: Set<string>, deltaDays: number): Set<string> {
  const out = new Set<string>();
  for (const iso of dates) {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() + deltaDays);
    out.add(d.toISOString().slice(0, 10));
  }
  return out;
}

export type EveningWeeklyStats = {
  avgFirstDrinkMinutes: number | null;
  avgFirstDrinkLabel: string | null;
  changeMinutes: number | null;
  betterEveningsCount: number;
  caloriesSaved: number;
  bestEveningLabel: string | null;
};

export function computeEveningWeeklyStats(activity: any[], weekDates: Set<string>, _today: string): EveningWeeklyStats {
  const withDrink = activity
    .map((a: any) => ({ date: a.date, mins: timeToMinutes(a.firstDrinkTime) }))
    .filter((x: any) => x.mins != null) as { date: string; mins: number }[];

  const avgFirstDrinkMinutes = withDrink.length ? avg(withDrink.map(x => x.mins)) : null;
  const avgFirstDrinkLabel = avgFirstDrinkMinutes != null
    ? `${String(Math.floor(avgFirstDrinkMinutes / 60)).padStart(2, "0")}:${String(Math.round(avgFirstDrinkMinutes % 60)).padStart(2, "0")}`
    : null;

  const thisWeek = withDrink.filter(x => weekDates.has(x.date));
  const lastWeekDates = shiftDates(weekDates, -7);
  const lastWeek = withDrink.filter(x => lastWeekDates.has(x.date));
  const avgThisWeek = thisWeek.length ? avg(thisWeek.map(x => x.mins)) : null;
  const avgLastWeek = lastWeek.length ? avg(lastWeek.map(x => x.mins)) : null;
  const changeMinutes = avgThisWeek != null && avgLastWeek != null ? avgThisWeek - avgLastWeek : null;

  const allBeers = activity.filter((a: any) => a.beers != null).map((a: any) => Number(a.beers) || 0);
  const avgBeersOverall = allBeers.length ? avg(allBeers) : 0;
  const weekRows = activity.filter((a: any) => weekDates.has(a.date) && a.beers != null);
  const weekBeers = weekRows.map((a: any) => Number(a.beers) || 0);

  const caloriesSaved = Math.max(0, Math.round((avgBeersOverall - (weekBeers.length ? avg(weekBeers) : 0)) * weekBeers.length * CALORIES_PER_BEER));
  const betterEveningsCount = weekRows.filter((a: any) => (Number(a.beers) || 0) < avgBeersOverall).length;
  const bestDay = [...weekRows].sort((a: any, b: any) => (Number(a.beers) || 0) - (Number(b.beers) || 0))[0];
  const bestEveningLabel = bestDay ? weekdayLabel(bestDay.date) : null;

  return { avgFirstDrinkMinutes, avgFirstDrinkLabel, changeMinutes, betterEveningsCount, caloriesSaved, bestEveningLabel };
}

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function findEveningPatterns(activity: any[], workouts: any[]): string[] {
  const patterns: string[] = [];
  const workoutDates = new Set(workouts.map((w: any) => w.date));
  const withDrink = activity
    .map((a: any) => ({ date: a.date, mins: timeToMinutes(a.firstDrinkTime), beers: Number(a.beers) || 0, dinner: !!a.dinner }))
    .filter((x: any) => x.mins != null) as { date: string; mins: number; beers: number; dinner: boolean }[];

  const trainMins = withDrink.filter(x => workoutDates.has(x.date)).map(x => x.mins);
  const noTrainMins = withDrink.filter(x => !workoutDates.has(x.date)).map(x => x.mins);
  if (trainMins.length >= 3 && noTrainMins.length >= 3 && avg(trainMins) - avg(noTrainMins) >= 20) {
    patterns.push("В тренировочные дни ты обычно начинаешь пить позже.");
  }

  const withDinner = withDrink.filter(x => x.dinner).map(x => x.beers);
  const withoutDinner = withDrink.filter(x => !x.dinner).map(x => x.beers);
  if (withDinner.length >= 3 && withoutDinner.length >= 3 && avg(withoutDinner) - avg(withDinner) >= 1) {
    patterns.push("После полноценного ужина количество алкоголя обычно меньше.");
  }

  const beerRows = activity.filter((a: any) => a.beers != null);
  const fri = beerRows.filter((a: any) => new Date(`${a.date}T00:00:00`).getDay() === 5).map((a: any) => Number(a.beers) || 0);
  const others = beerRows.filter((a: any) => new Date(`${a.date}T00:00:00`).getDay() !== 5).map((a: any) => Number(a.beers) || 0);
  if (fri.length >= 2 && others.length >= 5 && avg(fri) - avg(others) >= 1) {
    patterns.push("По пятницам желание выпить обычно выше.");
  }

  const cutoff14 = daysAgoIso(14), cutoff7 = daysAgoIso(7);
  const last14 = activity.filter((a: any) => a.date >= cutoff14);
  const week1 = last14.filter((a: any) => a.date < cutoff7);
  const week2 = last14.filter((a: any) => a.date >= cutoff7);
  const sleepW1 = week1.filter((a: any) => Number(a.sleepHours) > 0).map((a: any) => Number(a.sleepHours));
  const sleepW2 = week2.filter((a: any) => Number(a.sleepHours) > 0).map((a: any) => Number(a.sleepHours));
  const activeW1 = week1.filter((a: any) => Number(a.activeMinutes) > 0).map((a: any) => Number(a.activeMinutes));
  const activeW2 = week2.filter((a: any) => Number(a.activeMinutes) > 0).map((a: any) => Number(a.activeMinutes));
  if (sleepW1.length >= 3 && sleepW2.length >= 3 && activeW1.length >= 3 && activeW2.length >= 3) {
    const sleepDelta = avg(sleepW2) - avg(sleepW1);
    const activeDelta = avg(activeW2) - avg(activeW1);
    if (sleepDelta >= 0.3 && activeDelta >= 10) {
      patterns.push("За последние две недели сон улучшился одновременно с ростом активности.");
    }
  }

  return patterns;
}
