import assert from "node:assert/strict";
import test from "node:test";
import { applyRecoveryLimiter, fromStrengthProposal, type DisciplineProposal } from "../lib/progression-contract.ts";
import {
  BIKE_MAX_DURATION_MINUTES, SWIM_MIN_HISTORY,
  buildBikeProgression, buildSwimProgression, type BikeSession, type SwimSession,
} from "../lib/progression-swim-bike.ts";
import type { ProgressionProposal } from "../lib/progression-engine.ts";
import type { RecoveryLimiter } from "../lib/recovery-baseline.ts";

const swimSession = (over: Partial<SwimSession> = {}): SwimSession =>
  ({ date: "2026-09-02", distanceMeters: 1200, paceSecondsPer100m: 180, avgSwolf: 48, ...over });
const bikeSession = (over: Partial<BikeSession> = {}): BikeSession =>
  ({ date: "2026-09-02", durationSeconds: 1800, avgWatts: 120, normalizedWatts: 130, ...over });
const blocked: RecoveryLimiter = { allowGrowth: false, reasonCode: "recovery-below-baseline", reason: "Показатели заметно ниже обычных (сон 2.1 ч против обычных 4.6 ч).", usedSignals: ["сон 2.1 ч"], limitedData: false };
const allowed: RecoveryLimiter = { allowGrowth: true, reasonCode: "recovery-normal", reason: "Восстановление в пределах обычного.", usedSignals: [], limitedData: false };

// ---------- Общий контракт ----------

test("a strength decision keeps its meaning when converted to the shared shape", () => {
  const proposal: ProgressionProposal = {
    exercise: "Тяга верхнего блока", action: "increase", reasonCode: "two-easy-increase",
    reason: "Два лёгких подхода подряд.", usedSignals: ["два подряд «Легко»"], limitedData: false,
    from: { weight: 40, reps: 12 }, to: { weight: 42.5, reps: 12 },
  };
  const shared = fromStrengthProposal(proposal);
  assert.equal(shared.discipline, "strength");
  assert.equal(shared.action, "increase");
  assert.equal(shared.reasonCode, "two-easy-increase");
  assert.equal(shared.from, "40 кг × 12");
  assert.equal(shared.to, "42.5 кг × 12");
});

test("a bodyweight exercise reads as reps, not as zero kilograms", () => {
  const shared = fromStrengthProposal({
    exercise: "Планка", action: "increase", reasonCode: "two-easy-increase", reason: "", usedSignals: [], limitedData: false,
    from: { weight: 0, reps: 30 }, to: { weight: 0, reps: 35 },
  });
  assert.equal(shared.from, "30 повт. (вес тела)");
});

test("poor recovery withholds growth in every discipline without reducing the load", () => {
  for (const proposal of [
    buildSwimProgression([swimSession(), swimSession({ avgSwolf: 47 }), swimSession({ avgSwolf: 47 })]),
    buildBikeProgression([bikeSession(), bikeSession(), bikeSession()]),
  ] as DisciplineProposal[]) {
    assert.equal(proposal.action, "increase", "исходно рост разрешён");
    const limited = applyRecoveryLimiter(proposal, blocked);
    assert.equal(limited.action, "maintain");
    assert.equal(limited.reasonCode, "recovery-blocks-growth");
    assert.equal(limited.to, limited.from, "нагрузка не снижается, а остаётся прежней");
    assert.ok(limited.usedSignals.includes("сон 2.1 ч"));
  }
});

test("the limiter never turns a hold or a deload into something harsher", () => {
  const hold: DisciplineProposal = { discipline: "swim", subject: "Плавание", action: "maintain", reasonCode: "swim-swolf-worse", reason: "SWOLF ухудшился.", usedSignals: [], limitedData: false, from: "1200 м", to: "1200 м" };
  assert.deepEqual(applyRecoveryLimiter(hold, blocked), hold);
  const deload: DisciplineProposal = { ...hold, action: "deload", reasonCode: "pain-deload" };
  assert.deepEqual(applyRecoveryLimiter(deload, blocked), deload);
});

test("good recovery leaves the decision untouched", () => {
  const proposal = buildSwimProgression([swimSession(), swimSession({ avgSwolf: 47 }), swimSession({ avgSwolf: 47 })]);
  assert.deepEqual(applyRecoveryLimiter(proposal, allowed), proposal);
});

// ---------- Бассейн ----------

test("technique outranks distance: a faster pace with worse SWOLF stops the volume", () => {
  const proposal = buildSwimProgression([
    swimSession({ paceSecondsPer100m: 175, avgSwolf: 54 }),
    swimSession({ paceSecondsPer100m: 186, avgSwolf: 48 }),
    swimSession(),
  ]);
  assert.equal(proposal.action, "maintain");
  assert.equal(proposal.reasonCode, "swim-technique-decay");
  assert.match(proposal.reason, /распад техники/);
});

test("steady technique earns a distance step", () => {
  const proposal = buildSwimProgression([swimSession({ avgSwolf: 47 }), swimSession({ avgSwolf: 48 }), swimSession()]);
  assert.equal(proposal.action, "increase");
  assert.equal(proposal.from, "1200 м");
  assert.equal(proposal.to, "1300 м");
});

test("too little swim history is stated, not guessed around", () => {
  const proposal = buildSwimProgression([swimSession(), swimSession()]);
  assert.equal(proposal.action, "maintain");
  assert.equal(proposal.limitedData, true);
  assert.match(proposal.reason, new RegExp(`из ${SWIM_MIN_HISTORY}`));
});

// ---------- Вело ----------

test("a calm ride earns more minutes, and the power reading is quoted", () => {
  const proposal = buildBikeProgression([bikeSession(), bikeSession(), bikeSession()]);
  assert.equal(proposal.action, "increase");
  assert.equal(proposal.from, "30 мин");
  assert.equal(proposal.to, "35 мин");
  assert.ok(proposal.usedSignals.includes("130 Вт"));
});

test("without power the ride still progresses by time, and says so", () => {
  const noPower = bikeSession({ avgWatts: null, normalizedWatts: null });
  const proposal = buildBikeProgression([noPower, noPower, noPower]);
  assert.equal(proposal.action, "increase");
  assert.equal(proposal.limitedData, true);
  assert.match(proposal.reason, /Мощность не пишется/);
});

test("duration stops at the cycle cap instead of growing forever", () => {
  const long = bikeSession({ durationSeconds: BIKE_MAX_DURATION_MINUTES * 60 });
  const proposal = buildBikeProgression([long, long, long]);
  assert.equal(proposal.action, "maintain");
  assert.equal(proposal.reasonCode, "bike-duration-cap");
});
