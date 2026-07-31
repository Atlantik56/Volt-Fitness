import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { exerciseMediaFor, exerciseNames } from "../app/exercise-catalog.ts";
import { exerciseVideoId } from "../app/exercise-videos.ts";
import { home } from "../app/personal-data.ts";

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

test("незнакомое/произвольное (добавленное вне плана) название упражнения даёт null, а не выдуманные данные", () => {
  assert.equal(exerciseMediaFor("Совершенно новое упражнение, которого нет в программе"), null);
  assert.equal(exerciseMediaFor(""), null);
});

test("отсутствие медиа для добавленного упражнения — это ожидаемый null, обрабатываемый карточкой как fallback, а не сломанные данные", () => {
  const media = exerciseMediaFor("Внеплановая планка");
  assert.equal(media, null);
});
