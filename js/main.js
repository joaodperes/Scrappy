// main.js  entry point, game loop, solo/pvp/loadout/dev-mode orchestration
import { scene, camera, engine, navPlugin } from './scene.js';
import { texturesReady, setOnTexturesReady, M } from './textures.js';
import { ensureAudio } from './audio.js';
import { buildLevel, resetBarrels, updateBarrels } from './level.js';
import { setupLighting } from './lighting.js';
import { setWeapon, inventory, WDEFS, setActiveSlot, animWeapon,
         initAttachmentVisuals, wepModels, wepGroup, curWep } from './weapons.js';
import { enemies, projs, pickups, weaponDrops, _sparkPool, particles, player, cb } from './gameState.js';
import { rebuildMeshMap, hitRobot, updateEnemies } from './enemies.js';
import { updateProjs  } from './projectiles.js';
import { updateParticles } from './particles.js';
import { updatePickups, updateWeaponDrops, tryPickupWeapon, initSecretKits, initWeaponSpawns } from './pickups.js';
import { updateWaves, setCurWave, setWaveOn, setWaveDly, curWave, launchWave, getWaveComposition } from './waves.js';
import { updatePlayer, setupInput, hurtPlayer, PH, resetPlayer, keys, movePlayerBody } from './player.js';
import { updateHUD, tickHitMarker, wireDeathSubmit, showHitMarker, hideFfaHUD } from './ui.js';
import { submitScore, renderLeaderboard } from './leaderboard.js';
import { startFfa, updateFfa, isFfaActive, isFfaInPreLobby, showFfaLobby } from './pvp.js';;
import { loadProfile } from './progression.js';
import { showLoadout } from './loadout.js';
import { getCurrentMap, setCurrentMap, markLevelBuilt, isLevelBuilt, MAPS } from './mapManager.js';

let gameRunning = false;
let paused      = false;

loadProfile();
import('./progression.js').then(({ ensureDisplayName, profile }) => {
    ensureDisplayName(); // non-blocking; modal appears if name missing
});

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
  // Capture Hard Mode state BEFORE resetting everything
  player.hardMode = document.getElementById('hardModeToggle')?.checked || false;
  ensureAudio();
  player.hp = 100; player.armor = 0; player.score = 0;
  player.yVel = 0; player.onGround = true; player.buffs = {};

  for (const [k, w] of Object.entries(WDEFS)) {
      w.ammo = (k === 'PISTOL') ? Infinity : 0;
      if (w.useHeat) {
          w.heat = 0;
          w.isOverheated = false;
      }
      if (w.magSize) {
          w.currentMag = w.magSize;
      }
  }
  inventory[2] = 'PISTOL'; inventory[1] = null; inventory[0] = null;
  setActiveSlot(2);

  setCurWave(startWave);
  setWaveOn(false);
  setWaveDly(startWave > 0 ? 0.5 : 1.8);

  _clearEntities();
  resetBarrels();
  
  // ── Rebuild level for selected map ─────────────────────────
  const currentMap = getCurrentMap();

  // Clear ALL existing meshes from previous level
  // But save weapon model meshes first
  const weaponMeshes = new Set();
  for (const [k, node] of Object.entries(wepModels)) {
    node.getChildMeshes().forEach(m => weaponMeshes.add(m));
  }

  // Dispose all scene nodes that aren't permanently needed
  scene.meshes.slice().forEach(m => {
      // ---  Add `|| weaponMeshes.has(m)` to protect the gun geometry! ---
      if (m.name === '_playerBody' || m.name.startsWith('wep_') || m.name.startsWith('wm_') || weaponMeshes.has(m)) return;
      m.dispose();
  });
  // Clear lights
  scene.lights.forEach(l => { if (!l.name.startsWith('hemi') && !l.name.startsWith('fill')) l.dispose(); });
  // Reset global level arrays
  if (window._hazardZones) window._hazardZones.length = 0;
  if (window._movingPlatforms) window._movingPlatforms.length = 0;
  if (window._powerSwitches) window._powerSwitches.length = 0;

  if (currentMap === 'jungle') {
    import('./levelJungle.js').then(mod => {
      mod.buildJungleLevel();
      window._hazardZones = mod.hazardZones;
      window._movingPlatforms = mod.movingPlatforms;
      window._powerSwitches = mod.powerSwitches;
      finishStart();
    });
  } else {
    buildLevel();
    window._hazardZones = []; // No hazards in scrapyard
    window._movingPlatforms = [];
    window._powerSwitches = [];
    finishStart();
  }
  
  function finishStart() {
    rebuildMeshMap();
    
    // Spawn in a safe, open area depending on the map
    if (getCurrentMap() === 'jungle') {
        resetPlayer(15, PH + 1, -55); 
    } else {
        resetPlayer(-19, PH, -12);
    }
    
    _hideAllScreens();
    document.getElementById('hud').style.display = 'block';
    setWeapon('PISTOL');
    // After resetting player
    wepGroup.setEnabled(true);
    const model = wepModels[curWep];
    if (model) model.setEnabled(true);
    updateHUD();
    gameRunning = true;
    paused = false;
    initSecretKits();
    initWeaponSpawns();
    document.getElementById('c').requestPointerLock();
  }
}

function endGame() {
    gameRunning = false;
    document.exitPointerLock();
    document.getElementById('hud').style.display = 'none';
    document.getElementById('deathStats').textContent =
        `FINAL SCORE: ${player.score}   \u2014   WAVES: ${curWave}`;
    const inp = document.getElementById('playerNameInput');
    const btn = document.getElementById('submitScoreBtn');
    // ← Pre-fill from persistent profile
    import('./progression.js').then(({ profile }) => {
        if (inp && profile.displayName) inp.value = profile.displayName;
    });
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
      for (const [k, w] of Object.entries(WDEFS)) {
        w.ammo = (k === 'PISTOL') ? Infinity : 0;
        if (w.useHeat) {
            w.heat = 0;
            w.isOverheated = false;
        }
        if (w.magSize) {
            w.currentMag = w.magSize;
        }
      }
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
  
  document.getElementById('lbStandardBtn')?.addEventListener('click', () => {
    const btnS = document.getElementById('lbStandardBtn');
    const btnH = document.getElementById('lbHardBtn');
    if (btnS && btnH) {
        btnS.style.borderColor = '#15CAB6'; btnS.style.color = '#15CAB6';
        btnH.style.borderColor = '#5F6B6D'; btnH.style.color = '#ADAEB5';
    }
    import('./leaderboard.js').then(mod => {
        if (mod.setLeaderboardMode) mod.setLeaderboardMode('solo');
        if (mod.renderLeaderboard) mod.renderLeaderboard();
    });
  });

  document.getElementById('lbHardBtn')?.addEventListener('click', () => {
    const btnS = document.getElementById('lbStandardBtn');
    const btnH = document.getElementById('lbHardBtn');
    if (btnS && btnH) {
        btnH.style.borderColor = '#15CAB6'; btnH.style.color = '#15CAB6';
        btnS.style.borderColor = '#5F6B6D'; btnS.style.color = '#ADAEB5';
    }
    import('./leaderboard.js').then(mod => {
        if (mod.setLeaderboardMode) mod.setLeaderboardMode('hard');
        if (mod.renderLeaderboard) mod.renderLeaderboard();
    });
  });

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
    if (!document.getElementById('pauseQuitBtn')) {
      const firstBtn = pauseOverlay.querySelector('button');
      const qb = document.createElement('button');
      qb.id = 'pauseQuitBtn';
      qb.textContent = 'QUIT TO MENU';
      qb.className = firstBtn?.className ?? '';
      qb.style.marginTop = '10px';
      qb.style.opacity = '0.75'; // visually distinct from Resume
      qb.onclick = () => {
          // Stop the game but do NOT submit to leaderboard
          paused = false;
          gameRunning = false;
          document.exitPointerLock();
          document.getElementById('pauseOverlay').style.display = 'none';
          document.getElementById('hud').style.display = 'none';
          import('./progression.js').then(({ saveProfile }) => saveProfile()); // save progress
          import('./leaderboard.js').then(({ renderLeaderboard }) => renderLeaderboard());
          document.getElementById('menuScreen').className = 'screen visible';
      };
      pauseOverlay.appendChild(qb);
    }
  }
})();

// ── Score submission ───────────────────────────────────────────
wireDeathSubmit((name, score) => {
    const mode = player.hardMode ? 'hard' : 'solo';
    const finalName = player.hardMode ? `[HARD] ${name}` : name;
    submitScore(finalName, score, curWave, mode, getCurrentMap());
});

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
document.getElementById('resumeBtn')?.addEventListener('mousedown', (e) => {
  e.stopPropagation(); // Prevents the click from getting confused with the background
  if (typeof togglePause === 'function') togglePause();
});
document.getElementById('pauseOverlay')?.addEventListener('click', e => {
  if (e.target === e.currentTarget && paused) togglePause();
});
// ── Map selector change handler ──────────────────────────────
document.getElementById('mapDropdown')?.addEventListener('change', (e) => {
  setCurrentMap(e.target.value);
  renderLeaderboard();
  const mapInfo = MAPS[e.target.value];
  // Update level description if you have one
  const descEl = document.getElementById('mapDesc');
  if (descEl) descEl.textContent = mapInfo?.desc || '';
  const mapDropdown = document.getElementById('mapDropdown');
  const jungleOption = mapDropdown?.querySelector('option[value="jungle"]');
  if (jungleOption && typeof isMapUnlocked === 'function') {
    if (!isMapUnlocked('jungle')) {
      jungleOption.disabled = true;
      jungleOption.textContent += ' (Level 5+)';
    } else {
      jungleOption.disabled = false;
    }
  }
});

// ── Init ───────────────────────────────────────────────────────
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
  // Update moving platforms and stick the player to them
  if (window._movingPlatforms && window._movingPlatforms.length > 0) {
      for (const plat of window._movingPlatforms) {
          if (!plat._moveData || plat._moveData.paused) continue;
          const md = plat._moveData;
          
          if (md.waitTimer > 0) {
              md.waitTimer -= dt;
              continue;
          }
          
          // Store the old position before moving
          const oldPos = plat.position.clone();
          
          md.t += dt * md.speed * md.dir;
          if (md.t > 1) { md.t = 1; md.dir = -1; md.waitTimer = md.waitTime; }
          if (md.t < 0) { md.t = 0; md.dir = 1; md.waitTimer = md.waitTime; }
          
          const t = md.t;
          plat.position.x = md.start.x + (md.end.x - md.start.x) * t;
          plat.position.y = md.start.y + (md.end.y - md.start.y) * t;
          plat.position.z = md.start.z + (md.end.z - md.start.z) * t;

          // Calculate how much the platform moved this frame
          const delta = plat.position.subtract(oldPos);

          // If the player is standing on it, apply the exact same movement
          if (player.onGround) {
              const dx = camera.position.x - plat.position.x;
              const dz = camera.position.z - plat.position.z;
              const dy = camera.position.y - plat.position.y;
              
              // Basic boundary check (width/depth approx 5 units, height within 2.5 units above platform)
              if (Math.abs(dx) < 3.5 && Math.abs(dz) < 3.5 && dy > 0 && dy < 2.5) {
                  movePlayerBody(delta);
              }
          }
      }
  }

 // Check hazard zones (lava / spike damage) — uses FEET position, not camera eye
  if (window._hazardZones && window._hazardZones.length > 0) {
    for (const haz of window._hazardZones) {
      const px = camera.position.x;
      const pz = camera.position.z;
      const pfeet = camera.position.y - PH; // feet = eye - stand height
      const hx = haz.position.x;
      const hz = haz.position.z;
      const hy = haz.position.y;
      const hw = haz.metadata.halfWidth;
      const hd = haz.metadata.halfDepth;
      // halfHeight explicitly set on jungle hazards (0.45-0.55); fallback 0.8 for others
      const hh = haz.metadata.halfHeight ?? 0.8;
      if (px > hx - hw && px < hx + hw &&
          pfeet >= hy - hh && pfeet <= hy + hh &&
          pz > hz - hd && pz < hz + hd) {
          hurtPlayer((haz.metadata?.dps || 15) * dt, { hazardType: haz.metadata.hazardType });
      }
    }
  }

  // Show power switch hint
  let switchHintEl = document.getElementById('switchHint');
  if (typeof window._powerSwitches !== 'undefined') {
    let nearSwitch = false;
    for (const sw of window._powerSwitches) {
      const dist = BABYLON.Vector3.Distance(camera.position, sw.position);
      if (dist < 3) {
        nearSwitch = true;
        if (!switchHintEl) {
          switchHintEl = document.createElement('div');
          switchHintEl.id = 'switchHint';
          switchHintEl.style.cssText = [
            'position:fixed;bottom:110px;left:50%;transform:translateX(-50%)',
            'color:#00ff88;font-family:monospace;font-size:16px',
            'font-weight:bold;text-shadow:0 0 8px #00ff88',
            'pointer-events:none;opacity:0;transition:opacity .2s',
          ].join(';');
          document.body.appendChild(switchHintEl);
        }
        switchHintEl.textContent = '[F] ACTIVATE SWITCH';
        switchHintEl.style.opacity = '1';
        break;
      }
    }
    if (!nearSwitch && switchHintEl) {
      switchHintEl.style.opacity = '0';
    }
  }

  // Check power switch interaction
  if (window._powerSwitches && window._powerSwitches.length > 0 && keys['KeyF']) {
    for (const sw of window._powerSwitches) {
      const dist = BABYLON.Vector3.Distance(camera.position, sw.position);
      if (dist < 3 && sw.metadata?.interactive && !sw.metadata._cooldown) {
        sw.metadata.activated = !sw.metadata.activated;
        sw.metadata._cooldown = true;
        setTimeout(() => { sw.metadata._cooldown = false; }, 500);
        
        // Toggle platforms
        const platforms = sw.metadata.targetPlatforms || [];
        for (const plat of platforms) {
          plat.setEnabled(sw.metadata.activated);
          plat._moveData.paused = !sw.metadata.activated;
        }
        
        // Visual feedback
        sw.metadata.ring.material = sw.metadata.activated ? M.ledRed : M.ledGreen;
        sw.material.emissiveColor = sw.metadata.activated 
          ? new BABYLON.Color3(0.8, 0, 0.2) 
          : new BABYLON.Color3(0, 0.8, 0.2);
        
        import('./particles.js').then(({ spawnSparks }) => {
          spawnSparks(sw.position, sw.metadata.activated ? 0x00ff88 : 0xff4400, 12);
        });
      }
    }
  }
  scene.render();
});
