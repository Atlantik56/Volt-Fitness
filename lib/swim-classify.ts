// Плавание пока не отдельная колонка в БД — определяется по свободному тексту
// type/title, тем же способом, что app/training-session-model.ts (activityKindOf)
// и lib/fit-import-service.ts (draftFamily). Единая функция здесь — чтобы
// VOLT Swim не завёл третий, слегка другой вариант того же регэкспа.
export function isSwimActivity(type: string, title: string): boolean {
  return /плав|бассейн/i.test(`${type} ${title}`);
}
