# Training Program Architecture

## Canonical source

The weekly VOLT program lives in `lib/training-program/`:

- `types.ts` — typed `TrainingProgram → Week → Session` contract;
- `definitions.ts` — registered immutable legacy v1, Plan v2, Plan v3 and Plan v4 schedules;
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
  сохранённые для истории;
- `volt-training@4`: восемь определений Plan v4 (внутренние Weeks 17–24),
  текущая `ACTIVE_PROGRAM_VERSION`.

Each resolved session carries `programIdentity`:
`programId + programVersion + weekIndex + sessionId`, plus `cycleId` for a
restartable active cycle. New workout snapshots
persist that identity. `planKey()` keeps the old hash payload when identity is
absent, so existing drafts/logs retain their keys; versioned snapshots use a
versioned payload and cannot silently become another program version or cycle.

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

## Active-cycle contract

The active schedule is selected by the one open row in `training_plan_cycles`,
not by a v3 profile date. `ACTIVE_PROGRAM_VERSION` only selects which version a
new start activates. The program's `effectiveFromWeek` determines its definition
offset, so v3 starts from 9 and v4 from 17 without a hidden default `8`.

Plan v4 keeps `Swim technique / Strength A / seated Bike quality / Strength B /
Swim aerobic-or-endurance / long Bike / Rest`. The Friday Swim is required
until the user explicitly selects its declared Bike alternative. Bike work
excludes heavy gears and standing pedalling.

`profile.training_plan_v3_started_at` is nullable and is never populated with a
hard-coded date by a migration or deploy. The authenticated start endpoint
atomically stores the server date in `Europe/Moscow` only after the user confirms
the action in the interface; for compatibility it records only v3 starts.
Current active state comes from the open cycle. After activation, the click
date is the cycle boundary, while program days stay
aligned to the calendar week: Monday is Day 1, Wednesday is Day 3 and Friday is
Day 5. A mid-week activation enables only that date and the remaining days of
Week 1; it never shifts Swim away from Monday/Wednesday/Friday. All surfaces use
`buildProgramDayForDate()` / `buildHomeWeek()`; no second calendar is created.

`training_plan_cycles` preserves every activation boundary. A partial unique
index permits only one open cycle per `program_id`, regardless of version.
Starting a new version closes the used old cycle and creates a new row; it does
not rewrite the old row into the new version. The boundary is no earlier than
the day after the latest completed identity in the old cycle. «Начать цикл
заново» closes the current cycle on the day before that safe boundary, creates
a new cycle and moves the visible counter to Week 1 at the same calendar
weekday. It never deletes `workout_logs`, linked strength rows, completed drafts,
imports or measurements. Only future `week_schedule_changes`, legacy schedule
overrides and unused planned drafts are cleared. Active or awaiting-confirmation
workouts block restart until the user completes or cancels them.

Cycle-aware `programIdentity` prevents completed Swim/Cycling/Strength slots
from an older cycle from completing the same slot in the new cycle. Main Plan,
VOLT Swim and VOLT Cycling all derive their date/session from the same current
cycle and canonical weekly resolver. Historical cycles remain available to
Analytics for correct plan-vs-fact reconstruction. A shared overlay resolver
supplies Home, Plan, Swim, Cycling, Widget, Analytics, Coach and import
matching. Swim returns `unresolved` instead of compensating for a calendar
mismatch with the nearest workout.

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
