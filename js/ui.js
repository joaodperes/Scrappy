// ui.js – HUD updates, hit marker, leaderboard name modal
import { player } from './gameState.js';
import { WDEFS, inventory, curWep, refreshSlotHUD } from './weapons.js';

export function updateHUD() {
  const hp  = document.getElementById('hpBar');
  const arm = document.getElementById('armorBar');
  const sc  = document.getElementById('scoreDisplay');
  if (hp)  hp.style.width  = (player.hp / player.maxHp * 100) + '%';
  if (arm) arm.style.width = (player.armor / player.maxArmor * 100) + '%';
  if (sc)  sc.textContent  = 'SCORE: ' + player.score;

  const buffEl = document.getElementById('buffDisplay');
  if (buffEl) {
    buffEl.innerHTML = '';
    for (const [key, time] of Object.entries(player.buffs)) {
      if (time > 0) {
        const name = key.replace('_', ' ').toUpperCase();
        const tStr = Math.ceil(time) + 's';
        buffEl.innerHTML += `<div>&#9889; ${name} [${tStr}]</div>`;
      }
    }
  }

  // Heat & Reload Overlay
  let heatContainer = document.getElementById('heatBarContainer');
  if (!heatContainer) {
    heatContainer = document.createElement('div');
    heatContainer.id = 'heatBarContainer';
    heatContainer.style.cssText = [
      'position:fixed;bottom:120px;left:50%;transform:translateX(-50%)',
      'width:260px;height:12px;background:rgba(0,0,0,0.8)',
      'border:2px solid #333;display:none;z-index:100;box-shadow:0 0 10px rgba(0,0,0,0.5)',
    ].join(';');
    heatContainer.innerHTML = [
      '<div id="heatBarFill" style="width:0%;height:100%;background:#00ffff;transition:width 0.05s,background 0.2s"></div>',
      '<div id="reloadText" style="position:absolute;top:-28px;width:100%;text-align:center;',
      'color:#fff;font-size:18px;font-weight:bold;display:none;',
      'text-shadow:0 0 6px #000;letter-spacing:2px">RELOADING...</div>',
    ].join('');
    document.body.appendChild(heatContainer);
  }

  const W    = WDEFS[curWep];
  const fill = document.getElementById('heatBarFill');
  const rTxt = document.getElementById('reloadText');

  if (W && W.useHeat) {
    heatContainer.style.display = 'block';
    fill.style.width      = ((player.wepHeat || 0) * 100) + '%';
    fill.style.background = player.overheated ? '#ff3333' : (curWep === 'ION' ? '#cc00ff' : '#00ffff');
    if (rTxt) {
      rTxt.style.display = player.overheated ? 'block' : 'none';
      if (player.overheated) rTxt.textContent = 'OVERHEATED!';
    }
  } else if (player.isReloading) {
    heatContainer.style.display = 'block';
    // Calculate progress: Max timer is 1.6s
    const progress = Math.max(0, Math.min(100, (1 - (player.reloadTimer / 1.6)) * 100));
    if (fill) { fill.style.width = progress + '%'; fill.style.background = '#888888'; }
    if (rTxt) { rTxt.style.display = 'block'; rTxt.textContent = 'RELOADING...'; }
  } else {
    heatContainer.style.display = 'none';
  }

  // Add a hint near the ammo/heat counter
  let modeHint = document.getElementById('plasmaModeHint');

  if (curWep === 'PLASMA') {
    // Create the element if it's missing
    if (!modeHint) {
        modeHint = document.createElement('div');
        modeHint.id = 'plasmaModeHint';
        modeHint.style.cssText = 'position:fixed;bottom:160px;left:50%;transform:translateX(-50%);color:#d8f030;font-family:monospace;font-size:14px;text-shadow:1px 1px #000;';
        document.body.appendChild(modeHint);
    }
    modeHint.style.display = 'block';
    // Use player.plasmaAltMode (ensure this is initialized in gameState.js or player.js)
    modeHint.innerText = `[V] MODE: ${player.plasmaAltMode ? 'BURST' : 'AUTO'}`;
  } else if (modeHint) {
      modeHint.style.display = 'none';
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

// ── FFA HUD: live scoreboard + timer ─────────────────────────
let _ffaHudEl = null;

export function updateFfaHUD(scoreRows, timeLeft, localId) {
  if (!_ffaHudEl) {
    _ffaHudEl = document.createElement('div');
    _ffaHudEl.id = 'ffaHud';
    _ffaHudEl.style.cssText = [
      'position:fixed;top:14px;left:50%;transform:translateX(-50%)',
      'min-width:260px;max-width:380px',
      'background:rgba(0,0,0,.68);border:1px solid #333',
      'padding:8px 14px;z-index:800',
      'font-family:"Courier New",monospace;font-size:13px',
      'pointer-events:none;user-select:none',
    ].join(';');
    document.body.appendChild(_ffaHudEl);
  }

  const m = Math.floor(timeLeft / 60);
  const s = String(Math.floor(timeLeft % 60)).padStart(2, '0');
  const timer = `<div style="text-align:center;color:#d8f030;font-weight:bold;font-size:15px;margin-bottom:6px;letter-spacing:2px">${m}:${s}</div>`;

  const MEDALS = ['🥇','🥈','🥉'];
  const rows = (scoreRows ?? []).slice(0, 8).map((r, i) => {
    const isYou = localId ? r.id === localId : i === 0;
    const medal = MEDALS[i] ?? `${i + 1}.`;
    const col   = isYou ? '#d8f030' : '#aaa';
    const bold  = isYou ? 'font-weight:bold;' : '';
    return `<div style="display:flex;justify-content:space-between;gap:10px;color:${col};${bold}padding:2px 0">
      <span style="min-width:22px;color:#557733">${medal}</span>
      <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_esc(r.name)}${isYou ? ' ◀' : ''}</span>
      <span style="font-weight:bold;color:#d8f030">${r.score}</span>
    </div>`;
  }).join('');

  _ffaHudEl.innerHTML = timer + rows;
  _ffaHudEl.style.display = 'block';
}

export function hideFfaHUD() {
  if (_ffaHudEl) _ffaHudEl.style.display = 'none';
}

// ── Room config banner ────────────────────────────────────────
let _configBannerEl = null;

export function showRoomConfigBanner(cfg) {
  if (!cfg) return;
  if (!_configBannerEl) {
    _configBannerEl = document.createElement('div');
    _configBannerEl.id = 'ffaConfigBanner';
    _configBannerEl.style.cssText = [
      'position:fixed;bottom:80px;left:50%;transform:translateX(-50%)',
      'background:rgba(0,0,0,.72);border:1px solid #333',
      'padding:6px 14px;z-index:800;max-width:480px;text-align:center',
      'font-family:"Courier New",monospace;font-size:11px;color:#557733',
      'pointer-events:none;user-select:none;letter-spacing:1px',
    ].join(';');
    document.body.appendChild(_configBannerEl);
  }

  const tags = [];
  const pct = v => (v >= 1 ? '+' : '') + Math.round((v - 1) * 100) + '%';

  if (cfg.instagib)      tags.push('⚡ INSTAGIB');
  if (cfg.infiniteAmmo)  tags.push('∞ INFINITE AMMO');
  if (cfg.lowGravity)    tags.push('🌙 LOW GRAVITY');
  if (cfg.bigHead)       tags.push('👤 BIG HEAD');
  if (cfg.friendlyFire)  tags.push('💥 FRIENDLY FIRE');
  if (cfg.damageMult  !== 1) tags.push('DMG ' + pct(cfg.damageMult));
  if (cfg.speedMult   !== 1) tags.push('SPD ' + pct(cfg.speedMult));
  if (cfg.gravityMult !== 1 && !cfg.lowGravity) tags.push('GRAV ' + pct(cfg.gravityMult));
  if (cfg.jumpMult    !== 1) tags.push('JUMP ' + pct(cfg.jumpMult));
  if (cfg.healthMult  !== 1) tags.push('HP ' + pct(cfg.healthMult));
  if (cfg.armorMult   !== 1) tags.push('ARM ' + pct(cfg.armorMult));
  if (cfg.reloadMult  !== 1) tags.push('FIRE RATE ' + pct(2 - cfg.reloadMult));
  if (!cfg.weaponSpawns)  tags.push('NO WEP SPAWNS');
  if (!cfg.healthSpawns)  tags.push('NO HEALTH');
  if (!cfg.armorSpawns)   tags.push('NO ARMOR');
  if (cfg.addBots)        tags.push(`${cfg.botCount ?? 4} BOTS`);

  if (tags.length === 0) { _configBannerEl.style.display = 'none'; return; }

  _configBannerEl.innerHTML = tags.map(t => `<span style="color:#d8f030;margin:0 6px">${_esc(t)}</span>`).join('<span style="color:#333">|</span>');
  _configBannerEl.style.display = 'block';
  setTimeout(() => { if (_configBannerEl) _configBannerEl.style.display = 'none'; }, 12000);
}

export function hideRoomConfigBanner() {
  if (_configBannerEl) _configBannerEl.style.display = 'none';
}

function _esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export function updatePvpHUD(redScore, blueScore, timeLeft) {
  const el = document.getElementById('pvpHud');
  if (!el) return;
  const m = Math.floor(timeLeft/60), s = String(Math.floor(timeLeft%60)).padStart(2,'0');
  el.innerHTML =
    `<span style="color:#ff4433">RED ${redScore}</span>` +
    `<span style="color:#aaa;margin:0 12px">${m}:${s}</span>` +
    `<span style="color:#4499ff">BLUE ${blueScore}</span>`;
}
