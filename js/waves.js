import { enemies, player } from './gameState.js';
import { spawnBot } from './enemies.js';
import { sfx } from './audio.js';
import { getCurrentMap, getWaveConfig } from './mapManager.js';
import { getHardWaveRules, applyHardWaveCount, setActiveHardWave } from './hardModeRules.js';

export let curWave = 0, waveOn = false, waveDly = 1.8;
export function setCurWave(v)  { curWave  = v; }
export function setWaveOn(v)   { waveOn   = v; }
export function setWaveDly(v)  { waveDly  = v; }

function _isBossWave(idx) { return (idx + 1) % 10 === 0; }

export function getWaveComposition(idx) {
  const waveNum = idx + 1;
  const map = getCurrentMap();
  const scenario = getWaveConfig(map);
  const hardRules=player.hardMode?getHardWaveRules(map,waveNum):null;

  let currentPool = [...(scenario.botPool || ['scout'])];
  if (player.hardMode && scenario.hardPool) {
    currentPool = currentPool.concat(scenario.hardPool);
  }

  if (_isBossWave(idx)) {
    const bossNum = Math.floor(waveNum / 10);
    const numBosses = (player.hardMode && waveNum >= 20) ? bossNum : 1;
    const comp = [{ type: 'giantbot', count: numBosses }];
    const pool = scenario.bossPool || currentPool;
    const shuffled = pool.slice().sort(() => Math.random() - 0.5);
    const minionCount = Math.min(bossNum * 3, 8);
    for (let i = 0; i < minionCount && i < shuffled.length; i++) {
      comp.push({ type: shuffled[i], count: 1 });
    }
    return applyHardWaveCount(comp,hardRules);
  }

  // Safely check if the fixed wave exists
  if (scenario.fixed && scenario.fixed[waveNum]) {
    const raw = scenario.fixed[waveNum];
    return applyHardWaveCount(_sanitizeWave(raw, currentPool),hardRules);
  }

  // Open pool 
  const baseBudget = Math.max(4, 4 + Math.floor(waveNum * 1.2)); 
  const multiplier = (scenario.budgetMultiplier || 1.0)*(hardRules?.budget||1);
  const budget = Math.min(Math.floor(baseBudget * multiplier), 45);
  const comp = [];
  let remaining = budget;
  
  const shuffled = currentPool.slice().sort(() => Math.random() - 0.5);
  for (const t of shuffled) {
    if (remaining <= 0) break;
    const max = Math.max(1, Math.floor(remaining * 0.4));
    const count = 1 + Math.floor(Math.random() * max);
    comp.push({ type: t, count: Math.min(count, remaining) });
    remaining -= count;
  }
  
  if (remaining > 0) {
    // Dynamically fallback to the map's native bot pool instead of hardcoding 'scout'
    const fallbackBot = currentPool[0] || 'scout';
    const fallbackEntry = comp.find(c => c.type === fallbackBot);
    if (fallbackEntry) fallbackEntry.count += remaining;
    else comp.push({ type: fallbackBot, count: remaining });
  }
  
  return applyHardWaveCount(comp,hardRules);
}

function _sanitizeWave(composition, pool) {
  const sanitized = [];
  for (const entry of composition) {
    if (pool.includes(entry.type)) {
      sanitized.push(entry);
    } else {
      const replacement = pool[Math.floor(Math.random() * pool.length)];
      sanitized.push({ type: replacement, count: entry.count });
    }
  }
  return sanitized;
}

export function launchWave(idx) {
  const map = getCurrentMap();
  const scenario = getWaveConfig(map);
  const hardRules=player.hardMode?getHardWaveRules(map,idx+1):null;
  setActiveHardWave(hardRules);
  const spawns = scenario.spawns || getWaveConfig('scrapyard').spawns;
  const scale = Math.max(0.40, 0.40 + idx * 0.10);
  const isBoss = _isBossWave(idx);
  const baseLabel = isBoss ? '⚠ BOSS WAVE ' + (idx + 1) + ' ⚠' : 'WAVE ' + (idx + 1);
  const waveLabel=hardRules?baseLabel+' · '+hardRules.modifier.label:baseLabel;
  const comp = getWaveComposition(idx);
  let si = 0;
  for (const grp of comp) {
    if (grp.type === 'giantbot' && grp.count > 1) {
      for (let i = 0; i < grp.count; i++) {
        setTimeout(() => {
          const sp = i % 2 === 0 ? [25, 0, 25] : [-25, 0, -25];
          spawnBot('giantbot', sp[0], sp[1], sp[2], scale);
        }, i * 3000);
      }
    } else {
      for (let i = 0; i < grp.count; i++) {
        const sp = spawns[si % spawns.length];
        spawnBot(grp.type, sp[0]+(Math.random()-.5)*2, sp[1], sp[2]+(Math.random()-.5)*2, scale);
        si++;
      }
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
      const completedWaveIdx = curWave - 1;
      const completedWaveNum = completedWaveIdx + 1;
      const isBoss = (completedWaveNum % 10 === 0);
      import('./progression.js').then(({ recordWaveComplete }) => {
        recordWaveComplete(completedWaveNum, isBoss, getCurrentMap());
      });
      waveOn = false; waveDly = 4.5;
    }
  } else {
    waveDly -= dt;
    if (waveDly <= 0) { launchWave(curWave); curWave++; }
  }
}

export function getBossPoolForCurrentMap() {
  const map = getCurrentMap();
  return getWaveConfig(map).bossPool || getWaveConfig('scrapyard').bossPool;
}