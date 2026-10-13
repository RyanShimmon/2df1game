const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const patterns = {
  dry: [
    [0, 0],
    [2000, 0],
  ],
  showers: [
    [0, 0],
    [45, 0.2],
    [90, 0.85],
    [165, 0.85],
    [195, 0],
    [2000, 0],
  ],
  wetToDry: [
    [0, 0.75],
    [65, 0.65],
    [120, 0],
    [2000, 0],
  ],
  lateRain: [
    [0, 0],
    [130, 0],
    [180, 0.9],
    [320, 0.9],
    [370, 0],
    [2000, 0],
  ],
};
export function createWeather(pattern = "showers") {
  if (!patterns[pattern]) pattern = "showers";
  const wet = pattern === "wetToDry" ? 0.65 : 0;
  return {
    version: 1,
    pattern,
    elapsed: 0,
    rain: patterns[pattern][0][1],
    wetness: wet,
    sectors: Array.from({ length: 32 }, () => wet),
  };
}
export function rainAt(state, t = state.elapsed) {
  const points = patterns[state.pattern] || patterns.showers;
  for (let i = 1; i < points.length; i++) {
    if (t <= points[i][0]) {
      const a = points[i - 1],
        b = points[i],
        f = clamp((t - a[0]) / (b[0] - a[0]), 0, 1);
      return a[1] + (b[1] - a[1]) * f;
    }
  }
  return points.at(-1)[1];
}
export function advanceWeather(state, dt) {
  if (!state) return;
  state.elapsed += dt;
  state.rain = rainAt(state);
  state.sectors =
    state.sectors || Array.from({ length: 32 }, () => state.wetness || 0);
  for (let i = 0; i < 32; i++) {
    const drainage = 0.8 + (i % 7) * 0.07;
    const dryRate = state.rain > 0.01 ? 0.0013 : 0.0038;
    state.sectors[i] = clamp(
      state.sectors[i] +
        (state.rain * 0.012 - (1 - state.rain) * dryRate * drainage) * dt,
      0,
      1,
    );
  }
  state.wetness = state.sectors.reduce((a, b) => a + b, 0) / 32;
}
export function trackWater(state, s, length, offset = 0) {
  if (!state) return 0;
  const index =
    Math.floor(((((s % length) + length) % length) / length) * 32) % 32;
  const base = state.sectors?.[index] ?? state.wetness ?? 0;
  const lineDrying =
    state.rain < 0.1 ? 0.08 * (1 - clamp(Math.abs(offset) / 50, 0, 1)) : 0;
  return clamp(base - lineDrying, 0, 1);
}
export function tyreWeatherGrip(compound, water) {
  if (compound === "I")
    return clamp(
      0.68 + 0.40 * Math.sin(Math.PI * clamp(water / 0.85, 0, 1)) + .05*(1-clamp(water/.25,0,1)),
      0.65,
      1.08,
    );
  if (compound === "W") return 0.48 + 0.59 * clamp(water / 0.75, 0, 1) + .08*(1-clamp(water/.45,0,1));
  const slickGrip=Math.max(0.18,1-0.88*water**.72);
  const moisture=Math.sqrt(clamp(water,0,1));
  // Dry compound advantages fade in damp conditions; all slicks remain much
  // weaker than intermediates in real rain, with hard > medium > soft.
  return slickGrip*(compound==='H' ? 1+.20*moisture : compound==='S' ? 1-.30*moisture : 1);
}
export function recommendedTyre(water) {
  return water > 0.64 ? "W" : water > 0.17 ? "I" : "M";
}
export function forecast(state) {
  if (!state) return "Dry";
  const now = state.rain;
  if (now > 0.08) {
    const stop = (patterns[state.pattern] || []).find(
      (p) => p[0] > state.elapsed && p[1] === 0,
    );
    return `${now > 0.6 ? "Heavy rain" : "Rain"}${stop ? " · easing in " + Math.ceil((stop[0] - state.elapsed) / 60) + " min" : ""}`;
  }
  const next = (patterns[state.pattern] || []).find(
    (p) => p[0] > state.elapsed && p[1] > 0.05,
  );
  return next
    ? "Rain approaching · " + Math.ceil((next[0] - state.elapsed) / 60) + " min"
    : state.wetness > 0.08
      ? "Rain stopped · track drying"
      : "Dry forecast";
}

// Surface forecast uses the same drainage model as the circuit simulation.
export function weatherTimeline(state, horizon=360, interval=15) {
  const projected=JSON.parse(JSON.stringify(state));
  const points=[{time:state.elapsed,rain:state.rain,water:state.wetness}];
  for(let t=interval;t<=horizon;t+=interval) {
    advanceWeather(projected,interval);
    points.push({time:projected.elapsed,rain:projected.rain,water:projected.wetness});
  }
  return points;
}
