# Реализация и проверка

## Перед изменением

1. Определить screen spec и затронутые component/foundation docs.
2. Проверить текущую реализацию, данные и все применимые состояния.
3. Открыть утверждённый reference; если его нет, не создавать новый дизайн молча.

## Во время реализации

- Использовать общие semantic CSS tokens и явные component variants.
- Не размещать inline hex/blur/shadow в JSX.
- Сохранять ref, keyboard, accessible name и disabled/loading semantics.
- Ошибка не удаляет сохранённые данные; loading сохраняет геометрию.
- Не менять schema, architecture, navigation и соседние экраны без scope.

## Definition of Done

- Сравнение с эталоном или явно отмеченное отсутствие эталона.
- Desktop и `360–412px`; без overflow и перекрытия navigation.
- Keyboard/focus, WCAG 2.2 AA target, zoom 200%, reduced motion.
- Loading, empty, error, offline, disabled, active/complete по применимости.
- Targeted tests, затем обязательные repository checks для code change.
- Для documentation-only: проверить Markdown links и `git diff --check`.

## Эталонные изображения

Хранить в Git в стабильном каталоге, использовать понятные неизменяемые имена и
ссылаться относительным путём из screen spec. Не оптимизировать, перекодировать,
кропать или заменять утверждённый файл без явного решения. В PR указать источник,
статус утверждения и перечень добавленных/заменённых эталонов.
