# Архив неиспользуемых компонентов Swim

Проверено на main bb0e8e1 (7 октября 2026). Десять компонентов старой стартовой страницы не импортируются действующими route/page/layout, другими компонентами, библиотеками или тестами; внутренние ссылки остаются внутри удалённой группы.

Удалены только ai-coach-preview, empty-state, last-swim-card, metric-card, program-card, quick-actions, status-badge, swim-hero, weekly-activity-card, workout-card из app/swim/components. Исходники восстанавливаются из Git: `git show bb0e8e1:app/swim/components/<name>.tsx`.

Старую ветку chore/volt-cleanup (ab788b4) целиком не переносим. Её список из 63 путей содержит вновь используемые training-session, exercise-replacements, coach-feedback, упражнения и фоны. Действующие компоненты, общий GlassPanel, CSS-классы, ассеты, маршруты, БД и тесты сохранены.
