import {driveQualifyingOuting} from "./qualifying-driver.js";
import test from "node:test";
import {createWeather} from "../src/weather.js";
import assert from "node:assert/strict";
import {Race,TRACK,sample,angleDiff,clamp,targetSpeed,resources,grip,settleCareer,PIT_LANE,} from '../src/core.js';
import {newCareer} from './career-fixture.js';
import {
  Q_STAGES,
  tyreAllocation,
  selectableSets,
  createWeekend,
  validWeekend,
  QualifyingRun,
  recordLap,
  stageOrder,
  finishQualifyingStage,
  finishRemainingQualifying,
  prepareRace,
} from "../src/weekend.js";
const setup = { laps: 8, fuel: 9.5, tyre: "M" },
  profile = { driverName: "Alex", teamIndex: 2 },
  upgrades = { engine: 0, aero: 0, tyres: 0, crew: 0 };
const create = () => createWeekend(newCareer(profile), setup);
test("limited weekend stock shares four general-use dry sets and a reserved Q3 Soft", () => {
  const inv = tyreAllocation();
  assert.equal(inv.length, 20);
  assert.equal(
    inv.filter((t) => ["S", "M", "H"].includes(t.compound)).length,
    13,
  );
  assert.equal(inv.filter((t) => t.returned).length, 12);
  assert.deepEqual(selectableSets(inv, "Q1").map(t=>t.id), ["H1","M1","S1","S2","I1","I2","W1"]);
  assert.equal(selectableSets(inv,"R").length,8);
  assert.ok(!selectableSets(inv, "Q2").some((t) => t.id === "S3"));
  assert.ok(selectableSets(inv, "Q3").some((t) => t.id === "S3"));
  assert.equal(Q_STAGES[2].duration, 13 * 60);
});
test("22→16→10 knockouts set final positions by their own stage, with fresh stage times", () => {
  const w = create();
  recordLap(w, 21, 1, 1);
  finishQualifyingStage(w, upgrades, profile);
  assert.equal(w.active.length, 16);
  assert.ok(w.active.includes(21));
  assert.equal(w.grid.length, 6);
  assert.equal(w.phase, "Q2");
  assert.equal(w.results.length, 0);
  recordLap(w, 21, 1, 1);
  finishQualifyingStage(w, upgrades, profile);
  assert.equal(w.active.length, 10);
  assert.equal(w.grid.length, 12);
  assert.equal(w.phase, "Q3");
  recordLap(w, 21, 1, 1);
  finishQualifyingStage(w, upgrades, profile);
  assert.equal(w.phase, "R");
  assert.equal(w.grid.length, 22);
  assert.equal(new Set(w.grid).size, 22);
  assert.equal(w.grid[0], 21);
  assert.equal(w.sessions.length, 3);
  assert.ok(w.inventories[21].find((t) => t.id === "S3").returned);
});
test("eliminated driver keeps their position, and unused reserved Q3 set becomes race available", () => {
  const w = create();
  finishQualifyingStage(w, upgrades, profile);
  assert.ok(!w.active.includes(21));
  finishRemainingQualifying(w, upgrades, profile);
  assert.equal(w.grid.indexOf(21), 21);
  assert.ok(selectableSets(w.inventories[21], "R").some((t) => t.id === "S3"));
});
test("equal times are resolved by earliest lap, and worse later laps never replace best", () => {
  const w = create();
  recordLap(w, 2, 20, 10);
  recordLap(w, 1, 20, 9);
  recordLap(w, 1, 22, 12);
  assert.equal(stageOrder(w)[0], 1);
  assert.equal(w.results.find((r) => r.id === 1).time, 20);
});
test("qualifying runs one timed lap between its out and in laps, returning to the serviced box", () => {
  const w = create();
  const q = new QualifyingRun(w, "S1", upgrades, profile);
  w.weather=createWeather("dry",{seed:1});
  driveQualifyingOuting(q);
  assert.equal(q.player.stops,1);
  assert.ok(q.player.garage);
  assert.equal(q.player.qLaps,1);
  assert.ok(q.player.bestLap < TRACK.length/160);
  assert.ok(w.results.some((r) => r.id === 21));
  assert.ok(w.inventories[21].find((t) => t.id === "S1").wear > 0.1);
  assert.ok(w.runInProgress);
  q.endRun();
  assert.ok(!w.runInProgress);
  assert.ok(w.elapsed > 50);
});
test("off-track flying lap is deleted", () => {
  const w = create(),
    q = new QualifyingRun(w, "S1", upgrades, profile),
    p = q.player;
  q.cars = [p];
  p.garage=false;
  p.pit=null;
  p.qState="timed";
  p.s = TRACK.length * 2 - 1;
  p.qStart = 1;
  p.qInvalid = true;
  q.time = 30;
  const loc = sample(p.s);
  p.x = loc.x;
  p.y = loc.y;
  p.angle = loc.angle;
  p.speed = 100;
  q.step(0.05, { throttle: true });
  assert.equal(p.qLaps, 1);
  assert.ok(!w.results.some((r) => r.id === 21));
});
test("race grid and worn starting set carry over; qualifying compounds do not satisfy race tyre rule", () => {
  const w = create();
  const set = w.inventories[21].find((t) => t.id === "S1");
  set.wear = 0.55;
  set.used = true;
  finishRemainingQualifying(w, upgrades, profile);
  const r = new Race(setup, upgrades, "career", profile);
  prepareRace(r, w, "S1");
  assert.equal(r.player.wear, 0.55);
  assert.equal(r.player.tyre, "S");
  assert.equal(r.player.used.size, 1);
  assert.ok(grip(r.player) < grip({ ...r.player, wear: 0 }));
  resources(r.player, 0.1, 100);
  assert.equal(set.wear, r.player.wear);
  assert.equal(r.order().indexOf(r.player), w.grid.indexOf(21));
});
test("pit stop mounts a real used set without refreshing its condition, or inventing unavailable sets", () => {
  const w = create();
  finishRemainingQualifying(w, upgrades, profile);
  const r = new Race(setup, upgrades, "career", profile);
  prepareRace(r, w, "M1");
  const used = w.inventories[21].find((t) => t.id === "S1");
  used.wear = 0.6;
  used.used = true;
  r.nextSetId = "S1";
  r.player.speed = 70;
  r.pitLimiter = true;
  r.enterPit(r.player);
  for (let i = 0; i < 5000 && r.player.pit; i++) {
    const p = r.player.pit,
      remaining = p.boxDistance - p.distance;
    r.stepPit(
      r.player,
      1 / 60,
      !p.serviced && remaining < (r.player.speed * r.player.speed) / 480 + 15
        ? { brake: true }
        : { throttle: true },
    );
  }
  assert.equal(r.player.pit, null);
  assert.equal(r.player.tyreSet.id, "S1");
  assert.ok(r.player.wear >= 0.6);
  r.player.tyreInventory.forEach((t) => (t.returned = true));
  r.enterPit(r.player);
  assert.equal(r.player.pit, null);
});
test("race cannot bypass qualifying; weekend serializes and next career round gets fresh allocation", () => {
  const c = newCareer(profile),
    w = createWeekend(c, setup);
  assert.ok(validWeekend(JSON.parse(JSON.stringify(w)), c));
  assert.throws(() =>
    prepareRace(new Race(setup, upgrades, "career", profile), w, "M1"),
  );
  c.weekend = w;
  settleCareer(c, {
    position: 12,
    legal: true,
    dnf: false,
    contacts: 0,
    penalties: 0,
  });
  assert.equal(c.weekend, null);
  const next = createWeekend(c, setup);
  assert.equal(next.phase, "Q1");
  assert.ok(next.inventories[21].every((t) => t.wear === 0));
});
