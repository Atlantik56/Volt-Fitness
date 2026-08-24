import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { exerciseMediaFor, exerciseNames } from "../app/exercise-catalog.ts";
import { exerciseVideoId } from "../app/exercise-videos.ts";
import { exerciseReplacement } from "../app/exercise-replacements.ts";
import { home, planV2WeekCatalog, planV3WeekCatalog } from "../app/personal-data.ts";

// Сломанные карточки упражнений, п.2 — карточка на экране "Тренировка идёт"
// подтягивает изображение/описание по имени упражнения из того же каталога,
// что и остальная программа (не создаёт новых упражнений, не меняет
// personal-data.ts). Эти тесты фиксируют контракт resolver-функции
// exerciseMediaFor, которую использует компонент карточки (ExerciseThumbnail
// в app/active-workout.tsx); видео проверяется отдельно через уже
// существующий exerciseVideoId — оно ищется по имени независимо от snapshot.

test("карточка получает изображение и описание для упражнения из каталога программы", () => {
  const pushUp = home.find(([name]) => name === "Отжимания от пола")!;
  const media = exerciseMediaFor(pushUp[0]);
  assert.ok(media);
  assert.equal(media!.image, pushUp[3]);
  assert.equal(media!.description, pushUp[1]);
  assert.ok(media!.description.length > 0);
  assert.ok(existsSync(`public${media!.image}`));
});

test("карточка получает видео (кнопка «Показать пример») для упражнения, у которого есть ссылка", () => {
  const pushUp = home.find(([name]) => name === "Отжимания от пола")!;
  assert.ok(exerciseVideoId(pushUp[0]));
});

test("для каждого упражнения из каталога изображение существует в public/ (без битых ссылок)", () => {
  for (const name of exerciseNames) {
    const media = exerciseMediaFor(name);
    assert.ok(media, `нет медиа для "${name}"`);
    if (media!.image) assert.ok(existsSync(`public${media!.image}`), `битая ссылка на изображение для "${name}": ${media!.image}`);
  }
});

test("каталог сохраняет карточки уже начатого Plan v2 и добавляет упражнения Plan v3", () => {
  const planV2Name = planV2WeekCatalog.flatMap((day) => day.x).find(([name]) => name === "Machine Chest Press")?.[0];
  const planV3Name = planV3WeekCatalog.flatMap((day) => day.x).find(([name]) => name === "Жим от груди в тренажёре")?.[0];
  assert.ok(planV2Name);
  assert.ok(planV3Name);
  assert.ok(exerciseMediaFor(planV2Name));
  assert.ok(exerciseMediaFor(planV3Name));
});

test("активный каталог и AI больше не предлагают гантели, но legacy-медиа истории сохранено", () => {
  assert.ok(!exerciseNames.some((name) => /гантел|dumbbell/i.test(name)));
  assert.ok(!exerciseNames.map((name)=>exerciseReplacement(name)).some((replacement)=>/гантел|dumbbell/i.test(`${replacement.name} ${replacement.explanation} ${replacement.image}`)));
  const legacyDumbbell = home.find(([name]) => /гантел/i.test(name));
  assert.ok(legacyDumbbell);
  assert.ok(exerciseMediaFor(legacyDumbbell![0]));
});

test("незнакомое/произвольное (добавленное вне плана) название упражнения даёт null, а не выдуманные данные", () => {
  assert.equal(exerciseMediaFor("Совершенно новое упражнение, которого нет в программе"), null);
  assert.equal(exerciseMediaFor(""), null);
});

test("отсутствие медиа для добавленного упражнения — это ожидаемый null, обрабатываемый карточкой как fallback, а не сломанные данные", () => {
  const media = exerciseMediaFor("Внеплановая планка");
  assert.equal(media, null);
});
