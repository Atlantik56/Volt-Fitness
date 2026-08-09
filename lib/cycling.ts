export const CYCLING_SLOT_ID = "bike-zone-2";

export const CYCLING_LOAD_FEEDBACK_VALUES = ["", "calm", "discomfort", "pain"] as const;
export type CyclingLoadFeedback = (typeof CYCLING_LOAD_FEEDBACK_VALUES)[number];

export const CYCLING_LOAD_FEEDBACK_LABELS: Record<Exclude<CyclingLoadFeedback, "">, string> = {
  calm: "Спокойно / без дискомфорта",
  discomfort: "Небольшой дискомфорт",
  pain: "Боль",
};

type CyclingCandidate = {
  id?: unknown;
  type?: unknown;
  title?: unknown;
  name?: unknown;
};

const normalizedText = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е");

// Единственный classifier Cycling для Plan, workout snapshots/logs и FIT
// matching. Это намеренно не regex, размноженный по UI-компонентам.
export function isCyclingSlot(candidate: CyclingCandidate | string | null | undefined): boolean {
  if (typeof candidate === "string") return isCyclingText(candidate);
  if (!candidate) return false;
  if (normalizedText(candidate.id) === CYCLING_SLOT_ID) return true;
  return isCyclingText([candidate.type, candidate.title, candidate.name].filter(Boolean).join(" "));
}

function isCyclingText(value: string): boolean {
  const normalized = normalizedText(value);
  return (
    /(^|\s|[/—-])bike($|\s|[/—-])/.test(normalized) ||
    normalized.includes("indoor cycling") ||
    normalized.includes("cycling") ||
    normalized.includes("велосипед")
  );
}

export function isCyclingWorkoutRecord(workout: CyclingCandidate | null | undefined): boolean {
  return isCyclingSlot(workout);
}
