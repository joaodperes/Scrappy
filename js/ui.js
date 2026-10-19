// ui.js – HUD updates, hit marker, leaderboard name modal
import { player, roomConfig } from './gameState.js';
import { WDEFS, curWep, refreshSlotHUD } from './weapons.js';
import { getLoadout, hasEnergyConverter, getEffectiveStats } from './progression.js';

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
    const hud = document.getElementById('hud');
    if (hud) hud.appendChild(heatContainer);
    else document.body.appendChild(heatContainer); // fallback
  }

  const W    = WDEFS[curWep];
  const fill = document.getElementById('heatBarFill');
  const rTxt = document.getElementById('reloadText');

  const isEnergy = W && (W.useHeat || (curWep === 'PLASMA' && hasEnergyConverter()));

  if (isEnergy) {
    heatContainer.style.display = 'block';
    
    // Read heat directly from the weapon definition!
    fill.style.width      = ((W.heat || 0) * 100) + '%';
    fill.style.background = W.isOverheated ? '#ff3333' : (curWep === 'ION' ? '#cc00ff' : '#00ffff');
    
    if (rTxt) {
      rTxt.style.display = W.isOverheated ? 'block' : 'none';
      if (W.isOverheated) rTxt.textContent = 'OVERHEATED!';
    }
  } else if (player.isReloading) {
    heatContainer.style.display = 'block';
    // Use the dynamically saved max timer
    const maxTime = player.maxReloadTimer || 1.6;
    const progress = Math.max(0, Math.min(100, (1 - (player.reloadTimer / maxTime)) * 100));
    if (fill) { fill.style.width = progress + '%'; fill.style.background = '#888888'; }
    if (rTxt) { rTxt.style.display = 'block'; rTxt.textContent = 'RELOADING...'; }
  } else {
    heatContainer.style.display = 'none';
  }

  // Add a hint near the ammo/heat counter
  let modeHint = document.getElementById('plasmaModeHint');
  const currentLoadout = getLoadout(curWep);

  if (curWep === 'PLASMA' && currentLoadout.attachments?.special === 'dual_trigger') {
    if (!modeHint) {
        modeHint = document.createElement('div');
        modeHint.id = 'plasmaModeHint';
        modeHint.style.cssText = 'position:fixed;bottom:160px;left:50%;transform:translateX(-50%);color:#d8f030;font-family:monospace;font-size:14px;text-shadow:1px 1px #000;';
        document.body.appendChild(modeHint);
    }
    modeHint.style.display = 'block';
    modeHint.innerText = `[V] MODE: ${player.plasmaAltMode ? 'SNIPER' : 'BURST'}`;
  } 
  else if (curWep === 'FLAMETHROWER' && currentLoadout.attachments?.special === 'thermal_blast') {
    if (!modeHint) {
        modeHint = document.createElement('div');
        modeHint.id = 'plasmaModeHint';
        modeHint.style.cssText = 'position:fixed;bottom:160px;left:50%;transform:translateX(-50%);color:#E85E76;font-family:monospace;font-size:14px;text-shadow:1px 1px #000;';
        document.body.appendChild(modeHint);
    }
    modeHint.style.display = 'block';
    modeHint.innerText = `[V] THERMAL BLAST`;
  } 
  else if (modeHint) {
      modeHint.style.display = 'none';
  }

  // Dynamic crosshair based on current weapon spread
  const crosshair = document.getElementById('crosshair');
  if (crosshair) {
    // Calculate effective spread
      const W = WDEFS[curWep];
      const EW = getEffectiveStats(curWep, W);
      let baseSpread = (EW.spread || 0) * 100; // Convert to percentage-like value
      
      // Scale: 0 spread = 4px crosshair, 15 spread = 20px crosshair
      const crossSize = 4 + (baseSpread * 1.2);
      crosshair.style.width = crossSize + 'px';
      crosshair.style.height = crossSize + 'px';
      
      // For Chaingun, make it really obvious
      if (curWep === 'CHAINGUN') {
          crosshair.style.boxShadow = `0 0 ${crossSize/2}px rgba(255,255,200,0.5)`;
      } else {
          crosshair.style.boxShadow = '0 0 0 1px rgba(0,0,0,.5),0 0 5px rgba(255,255,180,.4)';
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

// FFA/TDM score overlay used by pvp.js. Separate from the legacy TDM HUD.
let _ffaHud = null;
export function updateFfaHUD(rows = [], timeLeft = 0, myId = null) {
  if (!_ffaHud || !_ffaHud.isConnected) {
    _ffaHud = document.getElementById('ffaHud');
    if (!_ffaHud) {
      _ffaHud = document.createElement('div');
      _ffaHud.id = 'ffaHud';
      _ffaHud.style.cssText = [
        'position:fixed;top:12px;right:12px;z-index:700',
        'background:rgba(9,12,16,.85);border:1px solid #557733',
        'color:#d8f030;min-width:190px;padding:8px 11px',
        'font:12px "Courier New",monospace;pointer-events:none',
      ].join(';');
      document.body.appendChild(_ffaHud);
    }
  }
  _ffaHud.style.display = 'block';
  _ffaHud.replaceChildren();
  const sec = Math.max(0, Math.floor(Number(timeLeft) || 0));
  const header = document.createElement('div');
  header.textContent = roomConfig.roundDuration===0?'MATCH  NO TIME LIMIT': 'MATCH  ' + Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  header.style.cssText = 'font-weight:bold;margin-bottom:6px;border-bottom:1px solid #557733;padding-bottom:5px';
  _ffaHud.appendChild(header);
  for (const [i, row] of rows.slice(0, 8).entries()) {
    const line = document.createElement('div');
    line.style.cssText = 'display:flex;justify-content:space-between;gap:15px;margin:3px 0';
    if (row.id === myId) line.style.color = '#15cab6';
    const name = document.createElement('span');
    name.textContent = (i + 1) + '. ' + String(row.name || 'PLAYER').slice(0, 24);
    const score = document.createElement('span');
    score.textContent = String(Number(row.score) || 0);
    line.append(name, score);
    _ffaHud.appendChild(line);
  }
}
export function hideFfaHUD() {
  const el = _ffaHud || document.getElementById('ffaHud');
  if (el) el.style.display = 'none';
  hideRoomConfigBanner();
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
