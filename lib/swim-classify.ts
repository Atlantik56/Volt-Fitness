// Плавание пока не отдельная колонка в БД — определяется по свободному тексту
// type/title согласованно с lib/fit-import-service.ts (draftFamily). Единая
// функция здесь не даёт VOLT Swim завести другой вариант того же регэкспа.
export function isSwimActivity(type: string, title: string): boolean {
  return /плав|бассейн/i.test(`${type} ${title}`);
}
