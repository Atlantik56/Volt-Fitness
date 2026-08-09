# Training Program Architecture

## Canonical source

The weekly VOLT program lives in `lib/training-program/`:

- `types.ts` — typed `TrainingProgram → Week → Session` contract;
- `definitions.ts` — registered legacy v1 and Plan v2 schedules;
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
- `volt-training@2`: Plan v2 from Week 4.

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

## Adding Plan v3

1. Create a `TrainingProgramDefinition` with the same stable program id, a new
   version and `effectiveFromWeek` (for example Week 9).
2. Define its weeks/sessions and reference reusable catalog or Swim workouts.
3. Add it to `TRAINING_PROGRAMS`.
4. Add registry, identity and VOLT↔Swim agreement tests.

Home, Plan, workout execution, History and Analytics require no schedule
changes. A test-only v3 fixture in `tests/training-program.test.ts` demonstrates
this without activating Plan v3 for the user.

## Immutable after use

Never mutate or remove a program version, session id, workout reference or
workout content after a workout based on it has started. Add a new version
instead. Never rewrite `workout_drafts`, `workout_logs`, Swim actuals,
`plan_key`, `program_start` or historical `week_schedule_changes` to adopt a
future program.
