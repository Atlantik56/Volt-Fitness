# Архив legacy UI

Здесь фиксируется происхождение удалённого UI-кода без переноса исполняемых
`.ts`/`.tsx` файлов в документацию. Историю и точное содержимое всегда можно
восстановить через указанный Git SHA.

## Training session flow

- Последняя ревизия с legacy-кодом:
  `bacfbb747f88a8e088fdf8c86f9e2ae7bbe6f5fc`.
- Удалённые entrypoint и helpers: `app/training-session.tsx`,
  `app/training-session-model.ts`, `app/exercise-replacements.ts`,
  `lib/coach-feedback.ts` и их изолированные тесты.
- Причина удаления: flow недостижим из актуальных Next routes и связан только
  со своими legacy helpers/tests.
- Актуальная замена: `app/active-workout.tsx`,
  `lib/active-workout-service.ts` и общий lifecycle `workout_drafts` →
  `workout_logs`, включая FIT linkage и серверное подтверждение.

Для просмотра удалённого файла используйте, например:
`git show bacfbb747f88a8e088fdf8c86f9e2ae7bbe6f5fc:app/training-session.tsx`.
