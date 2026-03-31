// waves.js – wave composition and spawning for solo mode
import { enemies } from './gameState.js';
import { spawnBot } from './enemies.js';
import { sfx } from './audio.js';

export let curWave = 0, waveOn = false, waveDly = 1.8;
export function setCurWave(v)  { curWave  = v; }
export function setWaveOn(v)   { waveOn   = v; }
export function setWaveDly(v)  { waveDly  = v; }

// ── Wave introduction schedule ────────────────────────────────
// Bot types are introduced gradually so the player has time to acquire weapons.
// 'pistol' bot is deferred until wave 11 (after the first boss on wave 10).
// 'grenadier' is introduced on wave 14 — one wave after the full roster appears.
// Boss waves occur every 10th wave (wave 10, 20, 30 …).
//
// NON-BOSS TYPES in introduction order:
//   Wave 1 : scout
//   Wave 3 : drone
//   Wave 5 : heavy
//   Wave 7 : sniper
//   Wave 11: pistol    (first time, one wave after the wave-10 boss)
//   Wave 12: shotgun
//   Wave 13: rocket
//   Wave 14: grenadier (introduced after all other types are known)
//
// Once ALL non-boss types have been introduced (wave ≥ 14) the "open pool"
// kicks in and any type can spawn in any count, with the total bot budget
// growing every wave so difficulty keeps rising.

const _INTRO_WAVE = {
  scout:     1,
  drone:     3,
  heavy:     5,
  sniper:    7,
  pistol:    11,   // must be > 10 (first boss wave)
  shotgun:   12,
  rocket:    13,
  grenadier: 14,
};

// All non-boss types in the order they become available
const _BOT_POOL = ['scout', 'drone', 'heavy', 'sniper', 'pistol', 'shotgun', 'rocket', 'grenadier'];

function _isBossWave(idx) {
  // idx is 0-based; wave number = idx + 1.
  // Boss on waves 10, 20, 30 … → idx 9, 19, 29 …
  return (idx + 1) % 10 === 0;
}

export function getWaveComposition(idx) {
  const waveNum = idx + 1; // human-readable wave number

  // ── BOSS WAVES (10, 20, 30 …) ────────────────────────────────
  if (_isBossWave(idx)) {
    // Scale minion count by boss number (1× on wave 10, 2× on wave 20, …)
    const bossNum = Math.floor(waveNum / 10);
    // Minions: only types already introduced by the PREVIOUS wave
    const availableMinions = _BOT_POOL.filter(t => _INTRO_WAVE[t] < waveNum);
    const comp = [{ type: 'giantbot', count: 1 }];
    for (const t of availableMinions) {
      comp.push({ type: t, count: bossNum });
    }
    return comp;
  }

  // ── INTRODUCTION PHASE (waves 1–12 hand-tuned) ───────────────
  // All types introduced by this wave
  const available = _BOT_POOL.filter(t => _INTRO_WAVE[t] <= waveNum);

  if (waveNum <= 14) {
    // Hand-tuned ramp while types are being introduced one-by-one
    const fixed = {
      1:  [{ type:'scout', count:2 }],
      2:  [{ type:'scout', count:3 }],
      3:  [{ type:'scout', count:3 }, { type:'drone', count:1 }],
      4:  [{ type:'scout', count:4 }, { type:'drone', count:2 }],
      5:  [{ type:'scout', count:4 }, { type:'drone', count:1 }, { type:'heavy', count:1 }],
      6:  [{ type:'scout', count:4 }, { type:'drone', count:2 }, { type:'heavy', count:2 }],
      7:  [{ type:'scout', count:4 }, { type:'drone', count:2 }, { type:'heavy', count:2 }, { type:'sniper', count:1 }],
      8:  [{ type:'scout', count:5 }, { type:'drone', count:2 }, { type:'heavy', count:2 }, { type:'sniper', count:2 }],
      9:  [{ type:'scout', count:5 }, { type:'drone', count:3 }, { type:'heavy', count:3 }, { type:'sniper', count:2 }],
      // wave 10 = boss (handled above)
      11: [{ type:'scout', count:4 }, { type:'drone', count:2 }, { type:'heavy', count:2 }, { type:'sniper', count:2 }, { type:'pistol', count:1 }],
      12: [{ type:'scout', count:4 }, { type:'drone', count:2 }, { type:'heavy', count:2 }, { type:'sniper', count:2 }, { type:'pistol', count:2 }, { type:'shotgun', count:1 }],
      13: [{ type:'scout', count:4 }, { type:'drone', count:2 }, { type:'heavy', count:2 }, { type:'sniper', count:2 }, { type:'pistol', count:2 }, { type:'shotgun', count:2 }, { type:'rocket', count:1 }],
      14: [{ type:'scout', count:4 }, { type:'drone', count:2 }, { type:'heavy', count:2 }, { type:'sniper', count:2 }, { type:'pistol', count:2 }, { type:'shotgun', count:2 }, { type:'rocket', count:1 }, { type:'grenadier', count:1 }],
    };
    if (fixed[waveNum]) return fixed[waveNum];
  }

  // ── OPEN POOL (wave 15+): all types available, random mix ────
  // Base budget grows by +1 bot roughly every 2 waves beyond wave 14, with a
  // minimum to keep things spicy and a maximum to avoid slideshow performance.
  const extraWaves = waveNum - 14;
  const budget = Math.min(8 + Math.floor(extraWaves * 0.6), 28);

  const comp = [];
  let remaining = budget;

  // Shuffle the pool so every wave feels different
  const shuffled = _BOT_POOL.slice().sort(() => Math.random() - 0.5);

  for (const t of shuffled) {
    if (remaining <= 0) break;
    // Each type gets at least 1 and at most ~40% of the remaining budget
    const max = Math.max(1, Math.floor(remaining * 0.4));
    const count = 1 + Math.floor(Math.random() * max);
    comp.push({ type: t, count: Math.min(count, remaining) });
    remaining -= count;
  }

  // Guarantee at least scouts fill any leftover budget slots
  if (remaining > 0) {
    const scoutEntry = comp.find(c => c.type === 'scout');
    if (scoutEntry) scoutEntry.count += remaining;
    else comp.push({ type: 'scout', count: remaining });
  }

  return comp;
}

// Spawn points ordered FAR→MID relative to player start (-19, -12) so waves
// enter from the wider map perimeter before collapsing inward.
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
  const scale = Math.max(0.40, 0.40 + idx * 0.10);
  const isBoss = _isBossWave(idx);
  const waveLabel = isBoss ? '⚠ BOSS WAVE ' + (idx + 1) + ' ⚠' : 'WAVE ' + (idx + 1);

  const comp = getWaveComposition(idx);
  let si = 0;
  for (const grp of comp) {
    for (let i = 0; i < grp.count; i++) {
      const sp = SPAWNS[si % SPAWNS.length];
      spawnBot(grp.type, sp[0]+(Math.random()-.5)*2, sp[1], sp[2]+(Math.random()-.5)*2, scale);
      si++;
    }
  }
  waveOn = true;
  sfx.wave();

  const el = document.getElementById('waveAnnounce');
  if (el) {
    el.textContent = waveLabel;
    el.style.color = isBoss ? '#f44' : '';
    el.classList.add('show');
    setTimeout(() => { el.classList.remove('show'); el.style.color = ''; }, isBoss ? 3800 : 2800);
  }
  const wd = document.getElementById('waveDisplay');
  if (wd) wd.textContent = 'WAVE ' + (idx + 1);
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
