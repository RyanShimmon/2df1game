// Audible idle from the start sequence, with explicit mute / pause handling.
export function engineSoundFrame(race,paused,muted,throttle=false) {
  const active=!!race && !paused && !race.done && !muted;
  const speed=Math.abs(race?.player.speed || 0);
  return {active,frequency:120+speed*1.3+(speed%45)*4+
    (race?.countdown>0 && throttle ? 160 : 0),gain:active ? .018 : 0};
}
