# Training Program Architecture

## Canonical source

The weekly VOLT program lives in `lib/training-program/`:

- `types.ts` — typed `TrainingProgram → Week → Session` contract;
- `definitions.ts` — registered legacy v1, Plan v2 and Plan v3 schedules;
- `workout-catalog.ts` — reusable Strength/Bike/legacy workout definitions;
- `registry.ts` — validation and effective-program/week resolver.

`app/personal-data.ts` is now only a compatibility adapter. It converts the
resolved program week into the existing `HomeWeekDay` shape used by Home, Plan,
Coach and the workout flow. UI components must not define their own schedule.

## Versioning and effective programs

Every definition has stable `id`, numeric `version` and `effectiveFromWeek`.
The registry selects the latest effective definition for a requested program
week. Current entries are:

- `volt-training@1`: immutable legacy Weeks 1–3;
- `volt-training@2`: Plan v2 / Foundation for Weeks 4–8;
- `volt-training@3`: восемь определений Plan v3 (внутренние Weeks 9–16),
  активируемые только явным пользовательским стартом.

Each resolved session carries `programIdentity`:
`programId + programVersion + weekIndex + sessionId`. New workout snapshots
persist that identity. `planKey()` keeps the old hash payload when identity is
absent, so existing drafts/logs retain their keys; versioned snapshots use a
v2 payload and cannot silently become another program version.

## VOLT and VOLT Swim

Plan v2 sessions contain explicit Swim references such as
`foundation@2 / w4d3`. `lib/swim/services.ts` resolves calendar dates through
the same program week and `week_schedule_changes`; it no longer distributes
pending Foundation workouts sequentially over a separate Swim calendar.
Completed or open legacy Swim drafts remain pinned to their recorded dates and
existing plan keys. Foundation Weeks 1–3 stay unchanged as historical workout
definitions; canonical shared scheduling starts at effective Week 4.

Plan v3 references the available `endurance@1` Swim program for its relative
Weeks 1–8 (stable internal identities retain Weeks 9–16).
Its three weekly Swim identities are still resolved by the canonical weekly
program, so Home, Plan and VOLT Swim agree on the exact relative Days 1, 3 and
5. Completing Foundation does not start Endurance automatically.

## Active Plan v3 contract

Plan v3 keeps the weekly rhythm `Strength + Swim / optional Bike / Swim /
Strength / Swim / Rest / Rest`. Strength sessions use cable, selectorized and
supported machines; no future session uses home dumbbells or heavy leg work.
Bike progression increases duration before resistance and excludes heavy gears
or standing pedalling. Swim uses freestyle/backstroke/easy drills only, without
breaststroke, butterfly, aggressive kick or max-effort testing.

`profile.training_plan_v3_started_at` is nullable and is never populated by a
migration or deploy. The authenticated start endpoint atomically stores the
server date in `Europe/Moscow`; repeat calls return the stored date. Before that
date exists, v3 is preview-only and Plan v2 remains the active future schedule.
After activation, elapsed whole days select the relative day and week even when
Day 1 is not Monday. All surfaces use `buildProgramDayForDate()` /
`buildHomeWeek()`; no second calendar is created.

Home, Plan, workout execution, History and Analytics require no schedule
changes outside the canonical resolver.

## Adding the next plan version

1. Create a `TrainingProgramDefinition` with the same stable program id, a new
   version and the next `effectiveFromWeek`.
2. Define its weeks/sessions and reference reusable catalog or Swim workouts.
3. Add it to `TRAINING_PROGRAMS`.
4. Add registry, identity and VOLT↔Swim agreement tests.

## Immutable after use

Never mutate or remove a program version, session id, workout reference or
workout content after a workout based on it has started. Add a new version
instead. Never rewrite `workout_drafts`, `workout_logs`, Swim actuals,
`plan_key`, `program_start` or historical `week_schedule_changes` to adopt a
future program.
