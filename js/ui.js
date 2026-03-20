// ui.js – HUD updates, hit marker, leaderboard name modal
import { player } from './gameState.js';
import { WDEFS, inventory, refreshSlotHUD } from './weapons.js';

export function updateHUD() {
  const hp  = document.getElementById('hpBar');
  const arm = document.getElementById('armorBar');
  const sc  = document.getElementById('scoreDisplay');
  if (hp)  hp.style.width  = (player.hp / player.maxHp * 100) + '%';
  if (arm) arm.style.width = (player.armor / player.maxArmor * 100) + '%';
  if (sc)  sc.textContent  = 'SCORE: ' + player.score;

  const buffEl = document.getElementById('buffDisplay');
  if (buffEl) {
    buffEl.innerHTML = ''; // Clear it out
    for (const [key, time] of Object.entries(player.buffs)) {
      if (time > 0) {
        const name = key.replace('_', ' ').toUpperCase();
        const tStr = Math.ceil(time) + 's';
        buffEl.innerHTML += `<div>&#9889; ${name} [${tStr}]</div>`;
      }
    }
  }
  refreshSlotHUD();
}

let hitMarkerT = 0;
export function showHitMarker() {
  const hm = document.getElementById('hitMarker');
  if (hm) hm.classList.add('show');
  hitMarkerT = .2;
}
export function tickHitMarker(dt) {
  if (hitMarkerT > 0) {
    hitMarkerT -= dt;
    if (hitMarkerT <= 0) { const hm=document.getElementById('hitMarker'); if(hm) hm.classList.remove('show'); }
  }
}

// ── Death-screen score submit form ───────────────────────────
// Called by main.js after endGame() so the form is wired up once
export function wireDeathSubmit(onSubmit) {
  const btn = document.getElementById('submitScoreBtn');
  const inp = document.getElementById('playerNameInput');
  if (!btn || !inp) return;
  btn.addEventListener('click', () => {
    const name = inp.value.trim() || 'ANON';
    onSubmit(name, player.score);
    btn.disabled = true;
    btn.textContent = '✓ SUBMITTED';
  });
}

// ── PvP round timer / team scores HUD ────────────────────────
export function updatePvpHUD(redScore, blueScore, timeLeft) {
  const el = document.getElementById('pvpHud');
  if (!el) return;
  const m = Math.floor(timeLeft/60), s = String(Math.floor(timeLeft%60)).padStart(2,'0');
  el.innerHTML =
    `<span style="color:#ff4433">RED ${redScore}</span>` +
    `<span style="color:#aaa;margin:0 12px">${m}:${s}</span>` +
    `<span style="color:#4499ff">BLUE ${blueScore}</span>`;
}
