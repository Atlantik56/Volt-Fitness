import assert from "node:assert/strict";
import test from "node:test";
import { getExerciseById, listExercises } from "../lib/swim/exercise-catalog.ts";

test("listExercises возвращает непустой каталог с уникальными id", () => {
  const exercises = listExercises();
  assert.ok(exercises.length >= 11);
  const ids = new Set(exercises.map((x) => x.id));
  assert.equal(ids.size, exercises.length);
});

test("getExerciseById находит существующее упражнение и его обязательные поля", () => {
  const freestyle = getExerciseById("freestyle");
  assert.ok(freestyle);
  assert.equal(freestyle?.name, "Freestyle");
  assert.equal(freestyle?.futureVideoId, null);
  assert.ok(Array.isArray(freestyle?.primaryMuscles));
});

test("getExerciseById возвращает null для неизвестного id", () => {
  assert.equal(getExerciseById("nonexistent"), null);
});
