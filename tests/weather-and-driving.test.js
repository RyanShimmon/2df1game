import {driveQualifyingOuting} from "./qualifying-driver.js";
import test from "node:test";
import assert from "node:assert/strict";
import {Race,TRACK,PIT_LANE,APEXES,TYRES,sample,samplePit,angleDiff,clamp,targetSpeed,grip,updateTrackLimits,tyreRuleMet,} from '../src/core.js';
import {newCareer} from './career-fixture.js';
import {
  createWeather,
  advanceWeather,
  trackWater,
  tyreWeatherGrip,
  forecast,
} from "../src/weather.js";
import {
  createWeekend,
  QualifyingRun,
  recordLap,
  finishQualifyingStage,
  migrateWeekend,
  weekendSchedule,
  prepareRace,
  startRaceWeather,
  finishRemainingQualifying,
} from "../src/weekend.js";
const upgrades = { engine: 0, aero: 0, tyres: 0, crew: 0 },
  profile = { driverName: "Test", teamIndex: 2 };
const make = () =>
  new Race({ laps: 12, fuel: 14, tyre: "M", weather: "dry" }, upgrades);
test("rain builds water and grip changes; the circuit dries gradually and unevenly", () => {
  const w = createWeather("wetToDry",{seed:42});
  for (let i = 0; i < 1600; i++) advanceWeather(w, 0.1);
  assert.ok(w.rain > 0.7);
  assert.ok(w.wetness > 0.7);
  const wet = w.wetness;
  advanceWeather(w,w.points.find(p=>p[1]===0)[0]-w.elapsed+30);
  assert.equal(w.rain, 0);
  assert.ok(w.wetness > 0 && w.wetness < wet);
  assert.ok(new Set(w.sectors.map((s) => s.toFixed(3))).size > 1);
  assert.ok(
    trackWater(w, 100, TRACK.length, 0) < trackWater(w, 100, TRACK.length, 50),
  );
  advanceWeather(w,600);
  assert.ok(w.wetness < 0.05);
  assert.match(forecast(w), /Dry/);
});
test("slicks, intermediates and wets each have a useful grip window", () => {
  const g = (t, w) => TYRES[t].grip * tyreWeatherGrip(t, w);
  assert.ok(g("S", 0) > g("I", 0) && g("S", 0) > g("W", 0));
  assert.ok(g("I", 0.4) > g("S", 0.4) && g("I", 0.4) > g("W", 0.4));
  assert.ok(g("W", 0.9) > g("I", 0.9) && g("W", 0.9) > g("S", 0.9));
});
test("wet tyre use waives the dry compound requirement", () => {
  const r = make();r.player.raceFormat="grandPrix";
  assert.equal(tyreRuleMet(r.player), false);
  r.player.used.add("I");
  assert.equal(tyreRuleMet(r.player), true);
});
test("pit service requires stopping in the box and holds the car until complete", () => {
  const r = make(),
    p = r.player;
  r.autoPitLimiter=false;
  p.speed = 70;
  p.s = TRACK.pitEntry;
  r.pitLimiter = true;
  r.nextTyre = "H";
  r.enterPit(p);
  p.pit.distance = p.pit.boxDistance;
  p.speed = 50;
  r.stepPit(p, 1 / 60, { throttle: true });
  assert.equal(p.pit.stage, "entry");
  assert.equal(p.stops, 0);
  p.pit.distance = p.pit.boxDistance;
  p.speed = 0;
  r.stepPit(p, 1 / 60, { brake: true });
  assert.equal(p.pit.stage, "service");
  const position = p.pit.distance;
  for (let i = 0; i < 60; i++)
    r.stepPit(p, 1 / 60, { throttle: true, reverse: true });
  assert.equal(p.pit.stage, "service");
  assert.equal(p.pit.distance, position);
  assert.equal(p.speed, 0);
  assert.equal(p.stops, 0);
  for (let i = 0; i < 360 && !p.pit.serviced; i++)
    r.stepPit(p, 1 / 60, { throttle: true });
  assert.equal(p.stops, 1);
  assert.ok(p.pit.serviced);
  for (let i = 0; i < 10; i++) r.stepPit(p, 1 / 60, { throttle: true });
  assert.ok(p.pit.distance > position);
});
test("overshooting a pit box cannot skip service; reverse recovers the stop", () => {
  const r = make(),
    p = r.player;
  r.autoPitLimiter=false;
  p.speed = 0;
  p.s = TRACK.pitEntry;
  r.enterPit(p);
  p.pit.distance = p.pit.boxDistance + 95;
  for (let i = 0; i < 120; i++) r.stepPit(p, 1 / 60, { throttle: true });
  assert.ok(p.pit);
  assert.equal(p.stops, 0);
  assert.equal(p.pit.distance, p.pit.boxDistance + 100);
  p.speed = 0;
  for (let i = 0; i < 360; i++) {
    const gap = p.pit.distance - p.pit.boxDistance;
    r.stepPit(p, 1 / 60, gap > 12 ? { reverse: true } : { brake: true });
    if (p.pit.stage === "service") break;
  }
  assert.equal(p.pit.stage, "service");
});
test("three distinct track-limit warnings precede a five-second penalty; continuous excursions count once", () => {
  const p = make().player;
  const cross = () => {
    let messages = [];
    for (let i = 0; i < 30; i++) {
      const m = updateTrackLimits(p, 1 / 60, 85);
      if (m) messages.push(m);
    }
    for (let i = 0; i < 30; i++) updateTrackLimits(p, 1 / 60, 0);
    return messages;
  };
  for (let i = 1; i <= 3; i++) {
    assert.equal(cross().length, 1);
    assert.equal(p.trackLimits, i);
    assert.equal(p.penalty, 0);
  }
  assert.match(cross()[0], /5-second/);
  assert.equal(p.penalty, 5);
  assert.equal(p.penalties, 1);
  assert.equal(p.penaltySecondsTotal, 5);
});
test("apex markers lie on the inside of real corners", () => {
  assert.ok(APEXES.length >= 6);
  for (const a of APEXES) {
    const p = sample(a.s);
    assert.ok(Math.hypot(a.x - p.x, a.y - p.y) < TRACK.width / 2);
    assert.ok(Math.abs(a.k) > 0.002/(TRACK.layoutScale || 1));
  }
});
test("AI traffic does not teleport and committed passing sides stay stable", () => {
  const r = make();
  r.countdown = 0;
  r.player.player = false;
  let maximum = 0;
  for (let i = 0; i < 1200; i++) {
    const before = r.cars.map((c) => ({
      x: c.x,
      y: c.y,
      pit: !!c.pit,
      finished: c.finished,
    }));
    r.step(1 / 60);
    for (let j = 0; j < 22; j++) {
      const c = r.cars[j],
        old = before[j];
      if (!old.pit && !c.pit && !old.finished && !c.finished)
        maximum = Math.max(maximum, Math.hypot(c.x - old.x, c.y - old.y));
    }
  }
  assert.ok(maximum < 15, `Largest normal frame jump: ${maximum}`);
  const c = r.cars[0],
    other = r.cars[1];
  c.s = 100;
  other.s = 160;
  c.offset = 0;
  other.offset = 10;
  c.passUntil = 0;
  r.time = 50;
  r.traffic = [c, other];
  r.stepAI(c, 1 / 60);
  const lane = c.passOffset;
  other.offset = -20;
  r.time = 50.5;
  r.traffic = [c, other];
  r.stepAI(c, 1 / 60);
  assert.equal(c.passOffset, lane);
});
test("top speed takes sustained acceleration and steering costs exit pace", () => {
  const simulate = (steer) => {
    const r = make();
    r.cars = [r.player];
    r.player.pace = 1;
    let first300 = null,
      first329 = null;
    for (let i = 0; i < 3600; i++) {
      const p = r.player;
      p.fuel = 1;
      p.x = sample(0).x;
      p.y = sample(0).y;
      p.s = 0;
      p.angle = 0;
      r.stepPlayer(p, 1 / 60, { throttle: true, steer });
      if (p.speed > 300 && first300 === null) first300 = i / 60;
      if (p.speed > 329 && first329 === null) first329 = i / 60;
    }
    return { speed: r.player.speed, first300, first329 };
  };
  const straight = simulate(0),
    turning = simulate(0.7);
  assert.ok(straight.first300 > 5);
  assert.ok(straight.first329 > straight.first300 + 6 && straight.first329 < 40);
  assert.ok(turning.first300 > straight.first300 + 1);
  assert.ok(turning.first329 === null ? turning.speed < 329 : turning.first329 > straight.first329 + 2);
});
test("career distance is set by the weekend and old saves gain wet tyres without losing wear", () => {
  const c = newCareer(profile);
  c.round = 3;
  const w = createWeekend(c, { laps: 8, fuel: 9.5, tyre: "M" });
  assert.equal(w.setup.laps, weekendSchedule(3).laps);
  assert.equal(w.setup.laps, 32);
  w.inventories.forEach((inv) => inv.splice(13));
  w.inventories[21][3].wear = 0.42;
  delete w.weather;
  migrateWeekend(w);
  assert.equal(w.inventories[21].length, 20);
  assert.equal(w.inventories[21][3].wear, 0.42);
  assert.equal(w.inventories[21].filter((t) => t.compound === "I").length, 5);
  finishRemainingQualifying(w, upgrades, profile);
  const r = make();
  prepareRace(r, w, "M1");
  assert.equal(r.laps, 32);
  assert.equal(r.weather, w.weather);
});
test("a soft set survives two complete dry qualifying outings with useful grip", () => {
  const c = newCareer(profile),
    w = createWeekend(c, { laps: 16, fuel: 18, tyre: "S" });
  w.weather = createWeather("dry");
  const drive = () => {
    const q = new QualifyingRun(w, "S1", upgrades, profile);
    driveQualifyingOuting(q);
    assert.equal(q.player.stops,1);
    assert.ok(q.player.garage);
    q.endRun();
    return q;
  };
  drive();
  const set = w.inventories[21].find((t) => t.id === "S1");
  assert.ok(set.wear < 0.3, `First outing wear ${set.wear}`);
  recordLap(w, 21, 1, 1);
  finishQualifyingStage(w, upgrades, profile);
  const second = drive();
  assert.ok(set.wear < 0.6, `Two outing wear ${set.wear}`);
  assert.ok(grip(second.player) > 0.65);
});

test("qualifying pit requests use the marked physical box, change sets and refuel without settling the race", () => {
  const w = createWeekend(newCareer(profile), {
    laps: 16,
    fuel: 18,
    tyre: "S",
  });
  w.weather = createWeather("dry");
  const q = new QualifyingRun(w, "S1", upgrades, profile),
    p = q.player;
  p.garage=false;
  p.pit=null;
  p.qState="in";
  q.requestPit();
  q.nextSetId = "S2";
  q.nextTyre = "S";
  p.s = TRACK.pitEntry - 1;
  let loc = samplePit(0);
  p.x = loc.x-Math.cos(loc.angle);
  p.y = loc.y-Math.sin(loc.angle);
  p.angle = loc.angle;
  p.speed = 80;
  for (let i = 0; i < 30 && !p.pit; i++) q.step(1 / 60, { throttle: true });
  assert.ok(p.pit);
  for (let i = 0; i < 4000 && p.stops === 0; i++) {
    const remaining = p.pit.boxDistance - p.pit.distance;
    q.step(
      1 / 60,
      remaining < (p.speed * p.speed) / 480 + 15
        ? { brake: true }
        : { throttle: true },
    );
  }
  assert.equal(p.stops, 1);
  assert.equal(p.tyreSet.id, "S2");
  assert.ok(p.fuel > 3.6 && p.fuel < 4.0);
  assert.equal(w.phase, "Q1");
  assert.equal(p.qStart, null);
});
test("late pit requests wait for the next entry instead of teleporting cars backwards", () => {
  const r = make(),
    p = r.player;
  p.s = TRACK.pitEntry + 120;
  let loc = sample(p.s);
  p.x = loc.x;
  p.y = loc.y;
  p.angle = loc.angle;
  p.speed = 80;
  r.requestPit();
  const before = p.s;
  r.stepPlayer(p, 1 / 60, { throttle: true });
  assert.equal(p.pit, null);
  assert.ok(p.s >= before);
});

test("an entire changing-weather race reaches the finish and AI changes between wet and dry tyres", () => {
  const r = new Race(
    // Longer fronts can cover a whole short race. Use the long Velocity event
    // and a known clearing to exercise the complete wet-to-dry crossover.
    { track:"velocity", laps: 24, tyre: "M", fuel: 28, weather: "wetToDry", aiSeed:42, weatherSeed:4 },
    upgrades,
  );
  r.player.player = false;
  r.countdown = 0;
  for (let i = 0; i < 108000 && !r.done; i++) r.step(1 / 60);
  assert.ok(r.done && !r.result.dnf);
  assert.ok(r.player.used.has("I") || r.player.used.has("W"));
  // A reactive strategy can cover wet-to-dry conditions in two or more stops.
  assert.ok(r.player.stops >= 2);
  assert.ok(["S", "M", "H"].includes(r.player.history.at(-1).tyre));
  assert.ok(r.weather.wetness < 0.12);
  assert.ok(r.result.legal);
});
test("unserved five-second penalties remain in the finish time and delay classification", () => {
  const r = make(),
    p = r.player;
  r.cars = [p];
  r.countdown = 0;
  p.used.add("H");
  p.penalty = 5;
  p.penaltySecondsTotal = 5;
  p.s = r.laps * TRACK.length - 2;
  const loc = sample(p.s);
  p.x = loc.x;
  p.y = loc.y;
  p.angle = loc.angle;
  p.speed = 90;
  for (let i = 0; i < 10 && !p.finished; i++)
    r.step(1 / 60, { throttle: true });
  assert.ok(p.finished);
  assert.ok(!r.done);
  const official = p.finishTime;
  for (let i = 0; i < 320 && !r.done; i++) r.step(1 / 60);
  assert.ok(r.done);
  assert.equal(r.result.time, official);
  assert.ok(r.result.time > 5);
});
test("teams have separate pit bays and a busy teammate prevents another service starting", () => {
  const r = make(),
    mate = r.cars[20],
    p = r.player;
  assert.notEqual(r.pitBoxForCar(r.cars[0]), r.pitBoxForCar(r.cars[2]));
  mate.s = TRACK.pitEntry;
  mate.speed = 0;
  r.enterPit(mate);
  mate.pit.distance = mate.pit.boxDistance;
  r.stepPit(mate, 0.01);
  assert.equal(mate.pit.stage, "service");
  p.s = TRACK.pitEntry;
  p.speed = 50;
  r.enterPit(p);
  p.pit.distance = p.pit.boxDistance - 40;
  r.stepPit(p, 0.01, { throttle: true });
  assert.equal(p.pit.stage, "entry");
  assert.equal(p.speed, 0);
  assert.equal(p.stops, 0);
});

test("Grand Prix weather gets a new forecast timeline while keeping qualifying surface water", () => {
  const w = createWeekend(newCareer(profile), {
    laps: 16,
    tyre: "M",
    fuel: 18,
  });
  w.weather.elapsed = 800;
  w.weather.wetness = 0.45;
  w.weather.sectors.fill(0.45);
  startRaceWeather(w);
  assert.equal(w.weather.elapsed, 0);
  assert.equal(w.weather.wetness, 0.45);
  assert.ok(w.weather.sectors.every((v) => v === 0.45));
  advanceWeather(w.weather, 10);
  const elapsed = w.weather.elapsed;
  startRaceWeather(w);
  assert.equal(w.weather.elapsed, elapsed);
});

test("pre-weather soft wear is migrated once to the new lifetime without erasing set history", () => {
  const w = createWeekend(newCareer(profile), {
    laps: 16,
    tyre: "S",
    fuel: 18,
  });
  w.inventories.forEach((inv) => inv.splice(13));
  delete w.weather;
  delete w.tyreModelVersion;
  const set = w.inventories[21].find((t) => t.id === "S1");
  set.wear = 0.56;
  set.used = true;
  set.distance = TRACK.length * 3;
  migrateWeekend(w);
  assert.ok(Math.abs(set.wear - 0.2912) < 0.0001);
  assert.equal(set.used, true);
  assert.equal(set.distance, TRACK.length * 3);
  const wear = set.wear;
  migrateWeekend(w);
  assert.equal(set.wear, wear);
});
