// main.js  entry point, game loop, solo/pvp/loadout/dev-mode orchestration
import { scene, camera, engine } from './scene.js';
import { texturesReady, setOnTexturesReady } from './textures.js';
import { ensureAudio } from './audio.js';
import { buildLevel, resetBarrels, updateBarrels } from './level.js';
import { setupLighting } from './lighting.js';
import { setWeapon, inventory, WDEFS, setActiveSlot, animWeapon, initAttachmentVisuals } from './weapons.js';
import { enemies, projs, pickups, weaponDrops, _sparkPool, particles, player } from './gameState.js';
import { rebuildMeshMap, hitRobot, updateEnemies } from './enemies.js';
import { updateProjs } from './projectiles.js';
import { updateParticles } from './particles.js';
import { updatePickups, updateWeaponDrops, tryPickupWeapon, initSecretKits, initWeaponSpawns } from './pickups.js';
import { updateWaves, setCurWave, setWaveOn, setWaveDly, curWave, launchWave, getWaveComposition } from './waves.js';
import { updatePlayer, setupInput, hurtPlayer, PH, resetPlayer } from './player.js';
import { updateHUD, tickHitMarker, wireDeathSubmit, showHitMarker, hideFfaHUD } from './ui.js';
import { submitScore, renderLeaderboard } from './leaderboard.js';
import { startFfa, updateFfa, isFfaActive, isFfaInPreLobby, showFfaLobby } from './pvp.js';
import { cb } from './gameState.js';
import { loadProfile } from './progression.js';
import { showLoadout } from './loadout.js';

let gameRunning = false;
let paused      = false;

loadProfile();

// ── Callbacks ──────────────────────────────────────────────────
cb.hitRobot      = hitRobot;
cb.hurtPlayer    = hurtPlayer;
cb.markHudDirty  = () => updateHUD();
cb.endGame       = endGame;
cb.showHitMarker = showHitMarker;
cb.isGameRunning = () => gameRunning;

// ── Input ──────────────────────────────────────────────────────
setupInput(
  () => gameRunning,
  () => paused,
  togglePause,
  () => tryPickupWeapon(gameRunning, paused),
);

document.addEventListener('keydown', e => {
  if (e.code === 'F2') {
    if (scene.debugLayer.isVisible()) scene.debugLayer.hide();
    else scene.debugLayer.show({ overlay: true });
  }
});

// ── Entity clear ───────────────────────────────────────────────
function _clearEntities() {
  for (const e of enemies) { e.group.getChildMeshes().forEach(m => m.dispose()); e.group.dispose(); }
  enemies.length = 0;
  for (const p of projs) {
    if (p.g) { p.g.getChildMeshes().forEach(m => m.dispose()); p.g.dispose(); }
    else if (p.mesh) p.mesh.dispose();
    if (p.light) p.light.dispose();
  }
  projs.length = 0;
  for (const p of pickups) {
    if (p.mesh) p.mesh.dispose();
    if (p.ring) p.ring.dispose();
    if (p.light) p.light.dispose();
  }
  pickups.length = 0;
  for (const p of weaponDrops) {
    p.mesh.getChildMeshes().forEach(m => m.dispose()); p.mesh.dispose();
    p.ring.dispose(); p.light.dispose();
  }
  weaponDrops.length = 0;
  for (const sp of _sparkPool) { sp.active = false; sp.mesh.setEnabled(false); }
  particles.length = 0;
}

function _hideAllScreens() {
  ['menuScreen','deathScreen','victoryScreen','pvpEndScreen'].forEach(id => {
    const s = document.getElementById(id); if (s) s.className = 'screen hidden';
  });
  const pl = document.getElementById('pvpLobby'); if (pl) pl.style.display = 'none';
  hideFfaHUD();
  const ro = document.getElementById('ffaRespawnOverlay'); if (ro) ro.style.display = 'none';
  const cb2 = document.getElementById('ffaConfigBanner');  if (cb2) cb2.style.display = 'none';
}

// ── Solo PvE ───────────────────────────────────────────────────
function startGame(startWave = 0) {
  ensureAudio();
  player.hp = 100; player.armor = 0; player.score = 0;
  player.yVel = 0; player.onGround = true; player.buffs = {};

  for (const [k, w] of Object.entries(WDEFS)) w.ammo = (k === 'PISTOL') ? Infinity : 0;
  inventory[2] = 'PISTOL'; inventory[1] = null; inventory[0] = null;
  setActiveSlot(2);

  setCurWave(startWave);
  setWaveOn(false);
  setWaveDly(startWave > 0 ? 0.5 : 1.8);

  _clearEntities();
  resetBarrels();
  rebuildMeshMap();
  resetPlayer(-19, PH, -12);

  _hideAllScreens();
  document.getElementById('hud').style.display = 'block';
  setWeapon('PISTOL'); updateHUD();
  gameRunning = true; paused = false;
  initSecretKits();
  initWeaponSpawns();
  document.getElementById('c').requestPointerLock();
}

function endGame() {
  gameRunning = false;
  document.exitPointerLock();
  document.getElementById('hud').style.display = 'none';
  document.getElementById('deathStats').textContent =
    `FINAL SCORE: ${player.score}   \u2014   WAVES: ${curWave}`;
  const inp = document.getElementById('playerNameInput');
  const btn = document.getElementById('submitScoreBtn');
  //if (inp) { inp.value = ''; inp.disabled = false; }
  if (btn) { btn.disabled = false; btn.textContent = 'SUBMIT SCORE'; }
  document.getElementById('deathScreen').className = 'screen visible';
}

// ── Pause ──────────────────────────────────────────────────────
function togglePause() {
  // Pause unavailable during multiplayer or while in the pre-game lobby
  if (isFfaActive() || isFfaInPreLobby()) return;
  paused = !paused;
  const overlay = document.getElementById('pauseOverlay');
  if (overlay) {
    overlay.style.display = paused ? 'flex' : 'none';
    const ml = document.getElementById('pauseModeLabel');
    if (ml) ml.textContent = '— SOLO —';
  }
  if (paused) document.exitPointerLock();
  else document.getElementById('c').requestPointerLock();
}

// ── FFA / PvP ──────────────────────────────────────────────────
function openFfaLobby() {
  document.getElementById('menuScreen').className = 'screen hidden';
  showFfaLobby({
    onBack: () => {
      document.getElementById('menuScreen').className = 'screen visible';
      renderLeaderboard();
    },
    onStart: ({ name, server, roomId, config, isHost }) => {
      ensureAudio();

      // ── Start a completely fresh game environment ───────────
      // Reset player state
      player.hp = 100; player.armor = 0; player.score = 0;
      player.yVel = 0; player.onGround = true; player.buffs = {};

      // Reset weapons to defaults
      for (const [k, w] of Object.entries(WDEFS)) w.ammo = (k === 'PISTOL') ? Infinity : 0;
      inventory[2] = 'PISTOL'; inventory[1] = null; inventory[0] = null;
      setActiveSlot(2);

      // Clear all entities
      _clearEntities();
      resetBarrels();
      rebuildMeshMap();
      resetPlayer(-19, PH, -12);

      // Hide menus, but keep HUD hidden until game actually starts (pre-lobby)
      _hideAllScreens();
      document.getElementById('hud').style.display = 'none';
      gameRunning = false;  // NOT yet running — game starts when host clicks START
      paused = false;

      // ── onGameStart fires when server broadcasts roundStart ─
      const onGameStart = () => {
        gameRunning = true;
        document.getElementById('hud').style.display = 'block';
        setWeapon('PISTOL');
        updateHUD();
        document.getElementById('c').requestPointerLock();
        initSecretKits();
        initWeaponSpawns();
      };

      startFfa(server, name, roomId, config, isHost, onGameStart, (winner, scoreRows) => {
        gameRunning = false;
        document.exitPointerLock();
        hideFfaHUD();
        document.getElementById('hud').style.display = 'none';

        const es = document.getElementById('pvpEndScreen');
        if (es) es.className = 'screen visible';
        const res = document.getElementById('pvpEndResult');
        if (res) res.textContent = (winner ?? 'GAME OVER') + ' WINS';
        const sc = document.getElementById('pvpEndScore');
        if (sc && scoreRows?.length) {
          sc.textContent = scoreRows.slice(0, 5)
            .map((r, i) => `${i + 1}. ${r.name}  ${r.score} frags`)
            .join('   |   ');
        }
      });
    },
  });
}

// ── Loadout ────────────────────────────────────────────────────
function openLoadout(returnToGame = false) {
  if (!returnToGame) document.getElementById('menuScreen').className = 'screen hidden';
  showLoadout(() => {
    if (returnToGame) {
      // Game stays paused — re-show pause overlay so player can resume or quit
      const overlay = document.getElementById('pauseOverlay');
      if (overlay) overlay.style.display = 'flex';
    } else {
      document.getElementById('menuScreen').className = 'screen visible';
      renderLeaderboard();
    }
  });
}

// ── Dev mode: wave selector ────────────────────────────────────
function showDevWaveSelector() {
  document.getElementById('devWavePanel')?.remove();

  const FONT = '"Courier New",monospace';
  const panel = document.createElement('div');
  panel.id = 'devWavePanel';
  panel.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:1200;overflow-y:auto;display:flex;flex-direction:column;align-items:center;padding:24px 16px 48px;font-family:${FONT};color:#d8f030`;

  const h = document.createElement('div');
  h.style.cssText = 'font-size:16px;letter-spacing:4px;margin-bottom:4px;text-shadow:0 0 8px #d8f030';
  h.textContent = '⚙ DEV MODE — WAVE SELECTOR';
  panel.appendChild(h);

  const sub = document.createElement('div');
  sub.style.cssText = 'font-size:11px;color:#557733;margin-bottom:18px;letter-spacing:1px';
  sub.textContent = 'Click a wave to start there · Boss waves marked ⚠';
  panel.appendChild(sub);

  // Wave grid 1-20
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;max-width:680px;width:100%';

  for (let w = 1; w <= 20; w++) {
    const idx  = w - 1;
    const comp = getWaveComposition(idx);
    const isBoss = comp.some(c => c.type === 'giantbot');

    const btn = document.createElement('button');
    btn.style.cssText = [
      `background:${isBoss ? '#220000' : '#0d0d0d'}`,
      `border:1px solid ${isBoss ? '#882200' : '#2a2a2a'}`,
      `color:${isBoss ? '#ff6644' : '#d8f030'}`,
      'padding:8px 6px;cursor:pointer;text-align:left',
      `font-family:${FONT};font-size:11px`,
    ].join(';');

    const total = comp.reduce((s, c) => s + c.count, 0);
    const lines = comp.map(c => `${c.count}× ${c.type}`).join('\n');
    btn.innerHTML = `<div style="font-size:15px;font-weight:bold;margin-bottom:4px">${isBoss ? '⚠ ' : ''}Wave ${w}</div>
      <div style="font-size:9px;color:#557733;white-space:pre-line">${lines}</div>
      <div style="font-size:9px;color:#aaa;margin-top:4px">${total} bots total</div>`;

    btn.onclick = () => { panel.remove(); startGame(idx); };
    grid.appendChild(btn);
  }
  panel.appendChild(grid);

  // Custom wave input
  const cr = document.createElement('div');
  cr.style.cssText = 'display:flex;gap:10px;align-items:center;margin-top:18px';
  cr.innerHTML = `<span style="font-size:12px;color:#aaa">Custom wave #</span>`;
  const ci = document.createElement('input');
  ci.type = 'number'; ci.min = 1; ci.max = 999; ci.value = 21;
  ci.style.cssText = `width:70px;background:#111;border:1px solid #444;color:#d8f030;padding:5px 7px;font-family:${FONT};font-size:13px`;
  const cgo = document.createElement('button');
  cgo.textContent = 'START';
  cgo.style.cssText = `background:#1a2800;border:1px solid #557733;color:#d8f030;padding:6px 16px;cursor:pointer;font-family:${FONT};font-size:12px`;
  cgo.onclick = () => { panel.remove(); startGame(Math.max(0, parseInt(ci.value) - 1) || 0); };
  cr.appendChild(ci); cr.appendChild(cgo);
  panel.appendChild(cr);

  // Spawn individual bot
  const spawnSect = document.createElement('div');
  spawnSect.style.cssText = 'margin-top:20px;width:100%;max-width:680px';
  spawnSect.innerHTML = `<div style="font-size:11px;color:#557733;letter-spacing:2px;margin-bottom:8px;border-bottom:1px solid #222;padding-bottom:4px">SPAWN SINGLE BOT (for mechanic testing)</div>`;

  const botRow = document.createElement('div');
  botRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px';
  ['scout','heavy','sniper','drone','shotgun','rocket','grenadier','giantbot','pistol'].forEach(type => {
    const b = document.createElement('button');
    b.textContent = type;
    b.style.cssText = `background:#0d0d0d;border:1px solid #333;color:#d8f030;padding:6px 12px;cursor:pointer;font-family:${FONT};font-size:11px`;
    b.onclick = () => {
      panel.remove();
      if (!gameRunning) startGame(0);
      setTimeout(() => import('./enemies.js').then(({ spawnBot }) => spawnBot(type, 0, 0, 8, 1.0)), 150);
    };
    botRow.appendChild(b);
  });
  spawnSect.appendChild(botRow);
  panel.appendChild(spawnSect);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕ CLOSE';
  closeBtn.style.cssText = `margin-top:20px;background:transparent;border:1px solid #333;color:#557733;padding:7px 22px;cursor:pointer;font-family:${FONT};font-size:12px`;
  closeBtn.onclick = () => panel.remove();
  panel.appendChild(closeBtn);

  document.body.appendChild(panel);
}

// ── Inject UI elements missing from existing HTML ─────────────
(function _injectUIElements() {
  const startBtn = document.getElementById('startBtn');
  if (startBtn) {
    const container = startBtn.parentElement;

    if (!document.getElementById('loadoutBtn')) {
      const lb = document.createElement('button');
      lb.id = 'loadoutBtn';
      lb.textContent = 'LOADOUT';
      lb.className = startBtn.className;
      startBtn.after(lb);
    }

    if (!document.getElementById('devBtn')) {
      const db = document.createElement('button');
      db.id = 'devBtn';
      db.textContent = '⚙ DEV';
      db.className = startBtn.className;
      db.style.opacity = '0.45';
      db.style.fontSize = '11px';
      // Hidden in production — set window.DEV_MODE = true in the browser
      // console (or a dev-only script) to reveal it.
      if (!window.DEV_MODE) db.style.display = 'none';
      container.appendChild(db);
    }
  }

  // Inject mode label + loadout button into pause overlay
  const pauseOverlay = document.getElementById('pauseOverlay');
  if (pauseOverlay) {
    if (!document.getElementById('pauseModeLabel')) {
      const ml = document.createElement('div');
      ml.id = 'pauseModeLabel';
      ml.style.cssText = 'font-size:12px;color:#557733;letter-spacing:2px;margin-bottom:8px';
      ml.textContent = '— SOLO —';
      pauseOverlay.prepend(ml);
    }
    if (!document.getElementById('pauseLoadoutBtn')) {
      const firstBtn = pauseOverlay.querySelector('button');
      const pl = document.createElement('button');
      pl.id = 'pauseLoadoutBtn';
      pl.textContent = 'LOADOUT';
      pl.className = firstBtn?.className ?? '';
      pl.onclick = () => {
        // Do NOT unpause here — the game loop keeps running=paused while
        // the loadout panel is open. On close, the pause overlay reappears.
        document.getElementById('pauseOverlay').style.display = 'none';
        document.exitPointerLock();
        openLoadout(true);
      };
      pauseOverlay.appendChild(pl);
    }
  }
})();

// ── Score submission ───────────────────────────────────────────
wireDeathSubmit((name, score) => submitScore(name, score, curWave, 'solo'));

// ── Texture gate ───────────────────────────────────────────────
const _gatedBtns = ['startBtn','pvpBtn','loadoutBtn','respawnBtn','victoryBtn'];
const _loadMsg   = document.getElementById('loadMsg');

function _setLoadingDone() {
  _gatedBtns.forEach(id => { const el = document.getElementById(id); if (el) { el.disabled = false; el.style.opacity = ''; } });
  if (_loadMsg) _loadMsg.style.display = 'none';
}
if (!texturesReady) {
  _gatedBtns.forEach(id => { const el = document.getElementById(id); if (el) { el.disabled = true; el.style.opacity = '0.4'; } });
  if (_loadMsg) _loadMsg.style.display = 'block';
  setOnTexturesReady(_setLoadingDone);
}

// ── Button bindings ────────────────────────────────────────────
document.getElementById('startBtn')    ?.addEventListener('click', () => startGame(0));
document.getElementById('victoryBtn')  ?.addEventListener('click', () => startGame(0));
// After death, go back to main menu (not instant-restart)
document.getElementById('respawnBtn')?.addEventListener('click', () => {
  document.getElementById('deathScreen').className  = 'screen hidden';
  document.getElementById('menuScreen').className   = 'screen visible';
  renderLeaderboard();
});
document.getElementById('loadoutBtn')  ?.addEventListener('click', () => openLoadout(false));
document.getElementById('devBtn')      ?.addEventListener('click', showDevWaveSelector);
document.getElementById('pvpBtn')      ?.addEventListener('click', openFfaLobby);

document.getElementById('pvpEndPlayAgain')?.addEventListener('click', () => {
  document.getElementById('pvpEndScreen').className = 'screen hidden';
  document.getElementById('menuScreen').className   = 'screen visible';
  renderLeaderboard();
});
document.getElementById('pvpBackBtn')?.addEventListener('click', () => {
  document.getElementById('pvpLobby').style.display = 'none';
  document.getElementById('menuScreen').className   = 'screen visible';
});
document.getElementById('pauseOverlay')?.addEventListener('click', e => {
  if (e.target === e.currentTarget && paused) togglePause();
});

// ── Init ───────────────────────────────────────────────────────
buildLevel();
setupLighting();
renderLeaderboard();
initAttachmentVisuals();   // build attachment visual geometry for all weapons
engine.resize();
window.addEventListener('resize', () => engine.resize());

// ── Game loop ──────────────────────────────────────────────────
let hudTimer = 0;
engine.runRenderLoop(() => {
  let dt = engine.getDeltaTime() / 1000;
  if (dt < 0.001) dt = 0.001;
  if (dt > 0.05)  dt = 0.05;

  // During FFA pre-lobby: keep network ticking and scene rendering,
  // but don't run gameplay systems or move the player
  if (isFfaInPreLobby()) {
    updateFfa(dt);  // handles position broadcast only in pre-lobby
    scene.render();
    return;
  }

  if (gameRunning && !paused) {
    updatePlayer(dt, gameRunning, paused);

    hudTimer += dt;
    if (hudTimer >= 1.0) { cb.markHudDirty?.(); hudTimer = 0; }

    if (isFfaActive()) {
      updateFfa(dt);
    } else {
      updateEnemies(dt);
      updateProjs(dt);
      updatePickups(dt);
      updateWeaponDrops(dt);
      updateWaves(dt, gameRunning);
      updateBarrels(dt);
    }
    updateParticles(dt);
    animWeapon(dt);
    tickHitMarker(dt);
  }
  scene.render();
});
