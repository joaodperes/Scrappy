// waves.js – wave composition and spawning for solo mode
import { enemies } from './gameState.js';
import { spawnBot } from './enemies.js';
import { sfx } from './audio.js';

export let curWave = 0, waveOn = false, waveDly = 1.8;
export function setCurWave(v)  { curWave  = v; }
export function setWaveOn(v)   { waveOn   = v; }
export function setWaveDly(v)  { waveDly  = v; }

export function getWaveComposition(idx) {
  // Fixed waves 0-7: hand-tuned gentle ramp-up.
  // Heavy/sniper/drone are introduced gradually so the player has time to get weapons.
  const fixed = [
    [{type:'scout',  count:2}],                                                              // 1
    [{type:'scout',  count:3}],                                                              // 2
    [{type:'scout',  count:3}, {type:'drone',  count:1}],                                   // 3
    [{type:'scout',  count:4}, {type:'drone',  count:1}],                                   // 4
    [{type:'scout',  count:3}, {type:'heavy',  count:1}],                                   // 5
    [{type:'scout',  count:4}, {type:'heavy',  count:2}],                                   // 6
    [{type:'scout',  count:3}, {type:'heavy',  count:2}, {type:'sniper', count:1}],         // 7
    [{type:'scout',  count:4}, {type:'heavy',  count:2}, {type:'sniper', count:2}, {type:'drone', count:2}], // 8
    [{type:'scout',  count:3}, {type:'heavy',  count:2}, {type:'sniper', count:2}, {type:'drone', count:2}, {type:'pistol', count:1}], // 9
    [{type:'scout',  count:3}, {type:'heavy',  count:2}, {type:'sniper', count:2}, {type:'drone', count:2}, {type:'pistol', count:1}, {type:'shotgun', count:1}], // 10
    [{type:'scout',  count:3}, {type:'heavy',  count:2}, {type:'sniper', count:2}, {type:'drone', count:2}, {type:'pistol', count:1}, {type:'shotgun', count:1}, {type:'rocket', count:1}], // 11
  ];
  if (idx < fixed.length) return fixed[idx];
  const e = idx - (fixed.length - 1);
  const comp = [];
  comp.push({ type:'scout',    count: Math.min(3 + e*2, 14) });
  comp.push({ type:'heavy',   count: Math.min(1 + Math.floor(e*1.1), 9) });
  comp.push({ type:'sniper',  count: Math.min(Math.floor(e*0.8), 7) });
  if (e > 2) comp.push({ type:'drone',   count: Math.min(1 + Math.floor((e-2)*0.7), 7) });
  if (e > 3) comp.push({ type:'pistol',  count: Math.min(1 + Math.floor((e-3)*0.5), 5) });
  if (e > 4) comp.push({ type:'shotgun', count: Math.min(1 + Math.floor((e-4)*0.5), 5) });
  if (e > 5) comp.push({ type:'rocket',  count: Math.min(1 + Math.floor((e-5)*0.5), 4) });
  return comp;
}

// Spawn points ordered FAR→MID relative to player start (-19, -12) so waves
// enter from the wider map perimeter before collapsing inward.
// Coordinates match the new Smelting District map.
const SPAWNS = [
  // Perimeter / high ground
  [ 14,  7, 44], [  8,  7, 44], [ 20,  7, 44], [ -25, 7, -44], [ -22, 7, -40],
  [ 34,  3,-18], [ -40, 2.5, 26],
  // Far quadrants
  [ 26,  0, 18], [ 22,  0, 12], [ 28,  0,  6], [ 20, 0, 20],
  [ -30, 0,-26], [ -26, 0,-22], [ -14, 0,-28], [ -24, 0,-12],
  [ 34,  0,-34], [ 38, 0,-16], [ -44, 0, 24], [ -36, 0, 28],
  // Mid-distance routes (kept away from immediate spawn bubble)
  [ -4,  0, 18], [  4, 0, 18], [ 0, 0, 20], [ 8, 0, 0], [ 12, 0, 6],
  [ -9,-1.5, -4], [ 8,-1.5, 4], [ 0,-1.5, -6],
];

export function launchWave(idx) {
  // Scale enemy stats by wave: starts at 40% strength, reaches 100% at wave 6,
  // then continues scaling up for an ever-increasing challenge.
  // Formula: scale = clamp(0.40 + idx * 0.10, 0.40, ...)
  const scale = Math.max(0.40, 0.40 + idx * 0.10);

  const comp = getWaveComposition(idx);
  let si = 0;
  for (const grp of comp) {
    for (let i = 0; i < grp.count; i++) {
      const sp = SPAWNS[si % SPAWNS.length];
      // Reduced jitter ±1 unit (was ±2.5) to prevent edge spawns going OOB
      spawnBot(grp.type, sp[0]+(Math.random()-.5)*2, sp[1], sp[2]+(Math.random()-.5)*2, scale);
      si++;
    }
  }
  waveOn = true;
  sfx.wave();
  const el = document.getElementById('waveAnnounce');
  if (el) { el.textContent = 'WAVE '+(idx+1); el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),2800); }
  const wd = document.getElementById('waveDisplay');
  if (wd) wd.textContent = 'WAVE '+(idx+1);
}

export function updateWaves(dt, gameRunning) {
  if (!gameRunning) return;
  if (waveOn) {
    if (enemies.filter(e=>e.alive).length === 0) {
      waveOn = false; waveDly = 4.5;
    }
  } else {
    waveDly -= dt;
    if (waveDly <= 0) { launchWave(curWave); curWave++; }
  }
}
