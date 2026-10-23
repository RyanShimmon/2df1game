import test from "node:test";
import assert from "node:assert/strict";
import {
  Race,
  TRACK,
  TYRES,
  grip,
  resources,
  sample,
  nearest,
  newCareer,
  loadCareer,
  buyUpgrade,
  settleCareer,
  targetSpeed,
  clamp,
  angleDiff,
  TEAMS,
  normalizeProfile,
  PIT_LANE,
  samplePit,
  pitPoint,
  acceleration,
} from "../src/core.js";
const setup = { laps: 16, tyre: "M", fuel: 18.5 };
function pitInputs(car) {
  const p = car.pit;
  if (!p) return {};
  const remaining = p.boxDistance - p.distance;
  return !p.serviced && remaining < (car.speed * car.speed) / 480 + 15
    ? { brake: true }
    : { throttle: true };
}

test("track sampling wraps and nearest point preserves distance", () => {
  for (let s = 0; s < TRACK.length; s += 93) {
    const p = sample(s),
      n = nearest(p.x, p.y);
    assert.ok(Math.abs(n.s - s) < 0.01);
    assert.ok(n.dist < 0.01);
  }
  assert.equal(sample(0).x, sample(TRACK.length).x);
});
test("22 cars, 11 team palettes and an independent player car", () => {
  const r = new Race(
    setup,
    { engine: 1, aero: 0, tyres: 0, crew: 0 },
    "career",
  );
  assert.equal(r.cars.length, 22);
  assert.equal(new Set(r.cars.map((c) => c.team.name)).size, 11);
  assert.equal(r.player.upgrades.engine, 1);
  assert.ok(r.player.pace < r.cars[0].pace);
});
test("softs are faster but wear much faster; saving reduces fuel and wear", () => {
  const make = (tyre) => ({
    tyre,
    wear: 0,
    tyreAge: 600,
    fuel: 20,
    upgrades: {},
  });
  const s = make("S"),
    m = make("M"),
    h = make("H"),
    save = make("M");
  assert.ok(grip(s) > grip(m) && grip(m) > grip(h));
  resources(s, 1, TRACK.length);
  resources(m, 1, TRACK.length);
  resources(h, 1, TRACK.length);
  resources(save, 1, TRACK.length, 0.72);
  assert.ok(s.wear > m.wear && m.wear > h.wear);
  assert.ok(save.wear < m.wear && save.fuel > m.fuel);
  m.wear = 0.95;
  assert.ok(grip(m) < grip(h));
});
test("pit stop changes tyres without refuelling; speeding penalty is served", () => {
  const r = new Race(setup, { engine: 0, aero: 0, tyres: 0, crew: 0 });
  r.autoPitLimiter=false;
  const p = r.player;
  p.speed = 140;
  p.s = TRACK.pitEntry;
  r.nextTyre = "H";
  r.enterPit(p);
  assert.equal(p.penalties, 1);
  r.pitLimiter = true;
  const fuel = p.fuel;
  let duration = 0;
  while (p.pit && duration < 30) {
    r.stepPit(p, 1 / 60, pitInputs(p));
    duration += 1 / 60;
  }
  assert.equal(p.pit, null);
  assert.equal(p.tyre, "H");
  assert.equal(p.stops, 1);
  assert.equal(p.used.size, 2);
  assert.ok(p.fuel < fuel);
  assert.ok(duration > 19);
});
test("pit crew upgrade reduces service time", () => {
  const duration = (crew) => {
    const r = new Race(setup, { crew });
    r.pitRandom=()=>1;
    r.player.speed = 70;
    r.pitLimiter = true;
    r.enterPit(r.player);
    let t = 0;
    while (r.player.pit) {
      r.stepPit(r.player, 1 / 60, pitInputs(r.player));
      t += 1 / 60;
    }
    return t;
  };
  assert.ok(duration(0) - duration(4) > 1.3);
});
test("AI completes race, consumes fuel and satisfies compound rule", () => {
  const r = new Race(
    { ...setup, laps: 8, fuel: 10 },
    { engine: 0, aero: 0, tyres: 0, crew: 0 },
  );
  r.player.player = false;
  r.countdown = 0;
  for (let i = 0; i < 60 * 700 && !r.done; i++) r.step(1 / 60);
  assert.ok(r.done);
  assert.ok(!r.result.dnf);
  assert.ok(r.result.legal);
  assert.ok(r.player.stops >= 1);
  assert.ok(r.player.fuel < 10);
});
test("player can accelerate, steer, brake and run out of fuel", () => {
  const r = new Race(setup, { engine: 0, aero: 0, tyres: 0, crew: 0 });
  r.countdown = 0;
  r.cars = [r.player];
  r.player.x = 1050;
  r.player.y = 1350;
  r.player.angle = 0;
  r.player.s = 350;
  for (let i = 0; i < 120; i++) r.step(1 / 60, { throttle: true });
  assert.ok(r.player.speed > 100);
  const before = r.player.speed;
  r.step(1 / 60, { brake: true, steer: 1 });
  assert.ok(r.player.speed < before);
  assert.notEqual(r.player.angle, 0);
  r.player.fuel = 0;
  for (let i = 0; i < 2000 && !r.done; i++) r.step(1 / 60);
  assert.ok(r.player.dnf);
});
test("career upgrades charge once, reject overspending and persist correctly", () => {
  const c = newCareer();
  assert.ok(buyUpgrade(c, "engine"));
  assert.equal(c.cash, 1000);
  assert.equal(c.upgrades.engine, 1);
  assert.equal(buyUpgrade(c, "aero"), false);
  const storage = { getItem: () => JSON.stringify(c) };
  assert.deepEqual(loadCareer(storage), c);
  assert.deepEqual(loadCareer({ getItem: () => "{bad" }), newCareer());
});
test("sponsor only pays when condition is met; DNF and illegal result cannot score", () => {
  const c = newCareer();
  c.sponsor = "top15";
  const result = {
    position: 15,
    legal: true,
    dnf: false,
    contacts: 0,
    penalties: 0,
  };
  const r = settleCareer(c, result);
  assert.equal(r.bonus, 6500);
  assert.equal(c.round, 2);
  assert.equal(c.sponsor, null);
  c.sponsor = "points";
  const illegal = settleCareer(c, { ...result, position: 1, legal: false });
  assert.equal(illegal.points, 0);
  assert.equal(illegal.bonus, 0);
  c.sponsor = "finish";
  assert.equal(settleCareer(c, { ...result, dnf: true }).bonus, 0);
});
test("clean sponsor checks collisions and pit penalties, season rolls over", () => {
  const c = newCareer();
  c.sponsor = "clean";
  assert.equal(
    settleCareer(c, {
      position: 12,
      legal: true,
      dnf: false,
      contacts: 3,
      penalties: 0,
    }).bonus,
    0,
  );
  c.round = 12;
  c.sponsor = "points";
  const r = settleCareer(c, {
    position: 1,
    legal: true,
    dnf: false,
    contacts: 0,
    penalties: 0,
  });
  assert.equal(r.points, 25);
  assert.equal(r.bonus, 10000);
  assert.equal(r.seasonBonus, 3750);
  assert.equal(c.round, 1);
  assert.equal(c.season, 2);
});
test("one-stop and two-stop strategies are competitive over a long 24-lap race", () => {
  // Controlled driver, no traffic: isolate resource/pace tradeoffs from overtaking.
  function run(compounds, stints) {
    const r = new Race(
      { laps: 24, tyre: compounds[0], fuel: 27.6 },
      { engine: 0, aero: 0, tyres: 0, crew: 0 },
    );
    r.countdown = 0;
    // Fix service at its midpoint so random 2.3–5.5s stops do not skew this pace comparison.
    r.pitRandom = () => .5;
    const c = r.player;
    c.player = false;
    c.pace = 1;
    c.s = 0;
    c.offset = 0;
    r.cars = [c];
    let stint = 0;
    r.stepAI = (c, dt) => {
      if (
        stint < stints.length &&
        c.s >= (stints[stint] - 1) * TRACK.length + TRACK.pitEntry
      ) {
        r.enterPit(c);
        c.pit.nextTyre = compounds[++stint];
        return;
      }
      const target = targetSpeed(c) * (1 - c.fuel * 0.002),
        accel = acceleration(c);
      c.speed += clamp(target - c.speed, -220 * dt, accel * dt);
      const d = c.speed * dt;
      c.s += d;
      resources(c, dt, d, 1);
    };
    for (let i = 0; i < 60 * 1000 && !r.done; i++) r.step(1 / 60);
    assert.ok(r.done && r.result.legal && !r.result.dnf);
    assert.equal(c.stops, stints.length);
    return r.time;
  }
  const times = [
    run(["M", "H"], [10]),
    run(["H", "M"], [14]),
    run(["S", "M", "S"], [7, 17]),
    run(["S", "H", "S"], [7, 17]),
  ];
  assert.ok(
    Math.max(...times) - Math.min(...times) < 8,
    `Strategy spread: ${times}`,
  );
});
test("player steering physics can complete a legal race with a requested pit stop", () => {
  const r = new Race(
    { laps: 8, tyre: "M", fuel: 9.5 },
    { engine: 0, aero: 0, tyres: 0, crew: 0 },
  );
  r.countdown = 0;
  // Drive through the same public input path as keyboard controls.
  for (let i = 0; i < 60 * 700 && !r.done; i++) {
    const p = r.player;
    if (p.s > TRACK.length * 4 && !p.stops && !p.pit) {
      r.pitRequested = true;
      r.nextTyre = "H";
      r.pitLimiter = true;
    }
    if (p.stops && !p.pit) r.pitLimiter = false;
    const goal = sample(p.s + clamp(p.speed * 0.55, 35, 100));
    if(r.pitRequested && p.s%TRACK.length>TRACK.pitEntry-400) {
      const offset=104*clamp((p.s%TRACK.length-TRACK.pitEntry+400)/240,0,1);
      goal.x-=Math.sin(goal.angle)*offset;goal.y+=Math.cos(goal.angle)*offset;
    }
    const desired = Math.atan2(goal.y - p.y, goal.x - p.x);
    let target = targetSpeed(p) * 0.82;
    if (r.pitRequested && p.s % TRACK.length > TRACK.pitEntry - 220)
      target = 72;
    r.step(
      1 / 60,
      p.pit
        ? pitInputs(p)
        : {
            steer: clamp(angleDiff(desired, p.angle) * 3.5, -1, 1),
            throttle: p.speed < target,
            brake: p.speed > target + 3,
          },
    );
  }
  assert.ok(r.done && r.result.legal && !r.result.dnf);
  assert.equal(r.result.stops, 1);
  assert.equal(r.result.penalties, 0);
  assert.ok(r.result.fuel > 0);
  assert.ok(r.result.bestLap < 45);
});

test("pit lane stays wide and smooth with forward-facing edge connections", () => {
  assert.ok(PIT_LANE.width >= 70);
  for (const p of PIT_LANE.pts) {
    if (p.progress > 400 && p.progress < PIT_LANE.span - 400) {
      const n = nearest(p.x, p.y);
      assert.ok(
        n.dist > TRACK.width / 2 + PIT_LANE.width / 2,
        `Lane intersects road at ${p.progress}`,
      );
    }
  }
  for (const [d, s] of [
    [0, TRACK.pitEntry],
    [PIT_LANE.length, TRACK.pitExit],
  ]) {
    const a = samplePit(d),
      b = sample(s);
    assert.ok(Math.abs(Math.hypot(a.x-b.x,a.y-b.y)-TRACK.width/2)<.01);
    assert.ok(Math.cos(angleDiff(a.angle,b.angle))>.5);
  }
  let previous = samplePit(0).angle;
  for (let d = 2; d < PIT_LANE.length; d += 2) {
    const p = samplePit(d);
    assert.ok(Math.abs(angleDiff(p.angle, previous)) < 0.04);
    previous = p.angle;
  }
});
test("P limiter state caps road and pit speed; disabling it allows acceleration", () => {
  const r = new Race(setup, { engine: 0, aero: 0, tyres: 0, crew: 0 });
  r.cars = [r.player];
  r.countdown = 0;
  r.autoPitLimiter=false;
  r.togglePitLimiter();
  r.player.speed = 150;
  r.stepPlayer(r.player, 1 / 60, { throttle: true });
  assert.equal(r.player.speed, 80);
  r.player.s = TRACK.pitEntry;
  r.player.offset = 0;
  r.enterPit(r.player);
  for (let i = 0; i < 30; i++) r.stepPit(r.player, 1 / 60, { throttle: true });
  assert.equal(r.player.speed, 80);
  assert.equal(r.player.penalties, 0);
  r.togglePitLimiter();
  for (let i = 0; i < 30; i++) r.stepPit(r.player, 1 / 60, { throttle: true });
  assert.ok(r.player.speed > 100);
  assert.equal(r.player.penalties, 1);
});
test("player reaches 330 km/h with enough straight-line acceleration", () => {
  const r = new Race(
    { laps: 8, tyre: "M", fuel: 0 },
    { engine: 0, aero: 0, tyres: 0, crew: 0 },
  );
  const p = r.player;
  p.fuel = 0.1;
  p.pace = 1;
  // Keep car on a long straight while exercising the real acceleration path.
  for (let i = 0; i < 1100; i++) {
    p.fuel = 1;
    p.x = 1050;
    p.y = 1350;
    p.angle = 0;
    r.stepPlayer(p, 1 / 60, { throttle: true });
  }
  assert.ok(p.speed > 329 && p.speed <= 330, `Speed: ${p.speed}`);
});

test("career identity is validated, saved and reset along with all progress", () => {
  const c = newCareer({ driverName: "  Alex Racer  ", teamIndex: 2 });
  assert.equal(c.profile.driverName, "Alex Racer");
  assert.deepEqual(loadCareer({ getItem: () => JSON.stringify(c) }), c);
  assert.equal(normalizeProfile({ driverName: "   ", teamIndex: 2 }), null);
  assert.equal(normalizeProfile({ driverName: "Alex", teamIndex: 99 }), null);
  assert.equal(
    newCareer({ driverName: "a".repeat(40), teamIndex: 1 }).profile.driverName
      .length,
    24,
  );
  c.cash = 99000;
  c.upgrades.engine = 3;
  c.round = 4;
  c.points = 25;
  c.sponsor = "points";
  c.history.push({ position: 1 });
  const reset = newCareer();
  assert.equal(reset.profile, null);
  assert.equal(reset.cash, 7000);
  assert.equal(reset.round, 1);
  assert.equal(reset.points, 0);
  assert.equal(reset.upgrades.engine, 0);
  assert.equal(reset.sponsor, null);
  assert.deepEqual(reset.history, []);
});
test("older saves receive a default identity without losing career progress", () => {
  const c = newCareer();
  delete c.profile;
  c.cash = 15000;
  c.upgrades.aero = 2;
  c.round = 3;
  const loaded = loadCareer({ getItem: () => JSON.stringify(c) });
  assert.deepEqual(loaded.profile, { driverName: "Driver", teamIndex: 10 });
  assert.equal(loaded.cash, 15000);
  assert.equal(loaded.upgrades.aero, 2);
  assert.equal(loaded.round, 3);
});
test("every selected team preserves 22 cars, two seats per team and starter pace", () => {
  for (let i = 0; i < TEAMS.length; i++) {
    const r = new Race(
      setup,
      { engine: 0, aero: 0, tyres: 0, crew: 0 },
      "career",
      { driverName: "Alex Racer", teamIndex: i },
    );
    assert.equal(r.player.team.name, TEAMS[i].name);
    assert.equal(r.player.name, "Alex Racer");
    assert.equal(r.player.pace, 0.94);
    assert.equal(r.cars.length, 22);
    assert.equal(r.order().indexOf(r.player), 21);
    for (const t of TEAMS)
      assert.equal(r.cars.filter((c) => c.team.name === t.name).length, 2);
  }
});
