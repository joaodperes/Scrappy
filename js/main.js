// main.js – entry point, game loop, solo/pvp/loadout/dev-mode orchestration
import { scene, camera, engine, navPlugin } from './scene.js';
import { texturesReady, setOnTexturesReady, M } from './textures.js';
import { ensureAudio } from './audio.js';
import { resetBarrels, updateBarrels } from './level.js';
import { setupLighting } from './lighting.js';
import { setWeapon, inventory, WDEFS, setActiveSlot, animWeapon,
         initAttachmentVisuals, wepModels, wepGroup, curWep } from './weapons.js';
import { enemies, projs, pickups, weaponDrops, _sparkPool, particles, player, cb } from './gameState.js';
import { rebuildMeshMap, hitRobot, updateEnemies } from './enemies.js';
import { updateProjs  } from './projectiles.js';
import { updateParticles } from './particles.js';
import { updatePickups, updateWeaponDrops, tryPickupWeapon, initSecretKits, initWeaponSpawns } from './pickups.js';
import { updateWaves, setCurWave, setWaveOn, setWaveDly, curWave, launchWave, getWaveComposition } from './waves.js';
import { updatePlayer, setupInput, hurtPlayer, PH, resetPlayer, resetWeaponHeat, keys, movePlayerBody } from './player.js';
import { updateHUD, tickHitMarker, wireDeathSubmit, showHitMarker, hideFfaHUD } from './ui.js';
import { submitScore, renderLeaderboard } from './leaderboard.js';
import { startFfa, stopFfa, updateFfa, isFfaActive, isFfaInPreLobby, showFfaLobby, isLocalDead, togglePvpScoreboard, checkFfaHitScan } from './pvp.js';
import { loadProfile, getLevelProgress, levelFromTotalXp } from './progression.js';
import { showLoadout } from './loadout.js';
import { getCurrentMap, setCurrentMap, MAPS, getMapMeta, buildMap, isHardModeUnlocked, isMapUnlocked, registerCommunityMaps } from './mapManager.js';
import { initRoomFlow, showPlayPage } from './roomFlow.js';
import { setHardModeOpeningModifier } from './hardModeRules.js';
import { showLeaderboardPage } from './leaderboardPage.js';

let gameRunning = false;
let paused      = false;
// Make scene and navPlugin available globally for level builders
window.__levelScene = scene;
window.__levelNavPlugin = navPlugin;

loadProfile();

// ── Callbacks ──────────────────────────────────────────────────
cb.hitRobot      = hitRobot;
cb.hurtPlayer    = hurtPlayer;
cb.markHudDirty  = () => updateHUD();
cb.endGame       = endGame;
cb.showHitMarker = showHitMarker;
cb.isGameRunning = () => gameRunning;
cb.isPvpActive = isFfaActive;
cb.isPvpDead = isLocalDead;
cb.pvpHitscan = checkFfaHitScan;
cb.resetWeaponHeat = resetWeaponHeat;

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
function startGame(startWave = 0, hardModifier = 'auto') {
  setHardModeOpeningModifier(hardModifier);
  if (isFfaActive()) stopFfa();
  // Capture Hard Mode state BEFORE resetting everything
  player.hardMode = document.getElementById('hardModeToggle')?.checked || false;
  ensureAudio();
  player.hp = 100; player.armor = 0; player.score = 0;
  player.yVel = 0; player.onGround = true; player.buffs = {};

  import('./progression.js').then(({ getLoadout }) => {
    for (const [k, w] of Object.entries(WDEFS)) {
      if (w.useHeat) {
          w.heat = 0;
          w.isOverheated = false;
      }
      if (w.magSize) {
          w.currentMag = w.magSize;
      }
      const loadout = getLoadout(k);
      const hasEndless = loadout?.attachments?.special === 'endless_magazine';
      w.ammo = hasEndless ? Infinity : (w.startAmmo || 0);
    }
  });
  inventory[2] = 'PISTOL'; inventory[1] = null; inventory[0] = null;
  setActiveSlot(2);

  setCurWave(startWave);
  setWaveOn(false);
  setWaveDly(startWave > 0 ? 0.5 : 1.8);

  _clearEntities();
  resetBarrels();

  const currentMap = getCurrentMap();

  const weaponMeshes = new Set();
  for (const [k, node] of Object.entries(wepModels)) {
    node.getChildMeshes().forEach(m => weaponMeshes.add(m));
  }
  scene.meshes.slice().forEach(m => {
      if (m.name === '_playerBody' || m.name.startsWith('wep_') || m.name.startsWith('wm_') || weaponMeshes.has(m)) return;
      m.dispose();
  });
  scene.lights.forEach(l => {
    if (!l.name.startsWith('hemi') && !l.name.startsWith('fill') && l.name !== 'lanternLight' && !l.name.startsWith('burnLight')) {
        l.dispose();
    }
  });
  if (window._hazardZones) window._hazardZones.length = 0;
  if (window._movingPlatforms) window._movingPlatforms.length = 0;
  if (window._powerSwitches) window._powerSwitches.length = 0;

  // Set globals for level builders
  window.__levelScene = scene;
  window.__levelNavPlugin = navPlugin;

  buildMap(currentMap).then(({ hazardZones, movingPlatforms, powerSwitches }) => {
    window._hazardZones = hazardZones;
    window._movingPlatforms = movingPlatforms;
    window._powerSwitches = powerSwitches;
    
    finishStart();
  });
  
  function finishStart() {
    rebuildMeshMap();

    const meta = getMapMeta(currentMap);
    resetPlayer(meta.spawn.x, PH + meta.spawn.yOffset, meta.spawn.z);

    _hideAllScreens();
    document.getElementById('hud').style.display = 'block';
    setWeapon('PISTOL');
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
    import('./progression.js').then(({ profile, flushProfileToCloud }) => {
      if (inp && profile.displayName) inp.value = profile.displayName;
      flushProfileToCloud();
  });
    if (btn) { btn.disabled = false; btn.textContent = 'SUBMIT SCORE'; }
    document.getElementById('deathScreen').className = 'screen visible';
}

// ── Pause ──────────────────────────────────────────────────────
function togglePause() {
  if (isFfaInPreLobby()) return;
  if (isFfaActive()) { togglePvpScoreboard(); return; }
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

      player.hp = 100; player.armor = 0; player.score = 0;
      player.yVel = 0; player.onGround = true; player.buffs = {};

      import('./progression.js').then(({ getLoadout }) => {
        for (const [k, w] of Object.entries(WDEFS)) {
          if (w.useHeat) {
              w.heat = 0;
              w.isOverheated = false;
          }
          if (w.magSize) {
              w.currentMag = w.magSize;
          }
          const loadout = getLoadout(k);
          const hasEndless = loadout?.attachments?.special === 'endless_magazine';
          w.ammo = hasEndless ? Infinity : (w.startAmmo || 0);
        }
      });
      inventory[2] = 'PISTOL'; inventory[1] = null; inventory[0] = null;
      setActiveSlot(2);

      _clearEntities();
      resetBarrels();
      rebuildMeshMap();
      const currentMap = getCurrentMap();
      const meta = getMapMeta(currentMap);
      resetPlayer(meta.spawn.x, PH + meta.spawn.yOffset, meta.spawn.z);

      _hideAllScreens();
      document.getElementById('hud').style.display = 'none';
      gameRunning = false;
      paused = false;

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
      const overlay = document.getElementById('pauseOverlay');
      if (overlay) overlay.style.display = 'flex';
    } else {
      document.getElementById('menuScreen').className = 'screen visible';
      renderLeaderboard();
    }
  });
}

function _populateMapDropdown() {
  const mapDropdown = document.getElementById('mapDropdown');
  if (!mapDropdown) return;
  const mapEntries = Object.values(MAPS);
  if (mapEntries.length === 0) {
    console.warn('[UI] MAPS is empty – using hardcoded fallback options.');
    return;
  }
  mapDropdown.innerHTML = '';
  for (const m of mapEntries) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `${m.icon} ${m.name}`;
    mapDropdown.appendChild(opt);
  }
}

// ── Inject UI elements ────────────────────────────────────────
(function _injectUIElements() {
  const startBtn = document.getElementById('startBtn');
  if (startBtn) {
    const container = startBtn.parentElement;
    if (!document.getElementById('devBtn')) {
      const db = document.createElement('button');
      db.id = 'devBtn';
      db.textContent = '⚙ DEV';
      db.className = startBtn.className;
      db.style.opacity = '0.45';
      db.style.fontSize = '11px';
      if (!window.DEV_MODE) db.style.display = 'none';
      container.appendChild(db);
    }

    // ── Menu overhaul: Solo/map-dropdown/hard-mode collapse into one PLAY
    // button → Play page (Create Room / Browse Rooms). Now using the real
    // index.html structure: #mapSelectSection wraps the map dropdown AND
    // the hard-mode label/checkbox/description as one block, so hiding
    // that single container is clean — no stray label text left behind
    // (pvpBtn is already commented out in the markup, nothing to hide).
    const mapSelectSection = document.getElementById('mapSelectSection');
    if (mapSelectSection) mapSelectSection.style.display = 'none';
    startBtn.style.display = 'none';
    // The button is in index.html so Firebase can reveal it even when
    // authentication finishes before this module completes initialization.
    const playBtn = document.getElementById('playBtn');
    if (playBtn) {
      playBtn.style.display = window.__scrappyAuthenticated ? 'inline-block' : 'none';
      playBtn.onclick = () => {
        if (!window.__scrappyAuthenticated) return;
        document.getElementById('menuScreen').className = 'screen hidden';
        showPlayPage();
      };
    }

    // ── Leaderboard moves to its own subpage. #leaderboardSection (the
    // STANDARD/HARD toggle + score list) gets relocated into it on first
    // open rather than duplicated — see leaderboardPage.js.
    const leaderboardSection = document.getElementById('leaderboardSection');
    if (leaderboardSection) leaderboardSection.style.display = 'none';
    if (!document.getElementById('leaderboardsBtn')) {
      const lbBtn = document.createElement('button');
      lbBtn.id = 'leaderboardsBtn';
      lbBtn.textContent = '🏆 LEADERBOARDS';
      lbBtn.className = 'btn-sm';
      lbBtn.style.marginTop = '8px';
      lbBtn.style.display = window.__scrappyAuthenticated ? 'inline-block' : 'none';
      lbBtn.onclick = () => {
        document.getElementById('menuScreen').className = 'screen hidden';
        showLeaderboardPage();
      };
      container.appendChild(lbBtn);
    }
  }
  
  document.getElementById('lbStandardBtn')?.addEventListener('click', () => {
    const btnS = document.getElementById('lbStandardBtn');
    const btnH = document.getElementById('lbHardBtn');
    if (btnS && btnH) {
        btnS.style.borderColor = '#15CAB6'; btnS.style.color = '#15CAB6';
        btnH.style.borderColor = '#5F6B6D'; btnH.style.color = '#ADAEB5';
    }
    Promise.all([import('./leaderboard.js'), import('./leaderboardPage.js')]).then(([mod, lbPage]) => {
        if (mod.setLeaderboardMode) mod.setLeaderboardMode('solo');
        if (mod.renderLeaderboard) mod.renderLeaderboard(lbPage.getLeaderboardPageMapId());
    });
  });

  document.getElementById('lbHardBtn')?.addEventListener('click', () => {
    const btnS = document.getElementById('lbStandardBtn');
    const btnH = document.getElementById('lbHardBtn');
    if (btnS && btnH) {
        btnH.style.borderColor = '#15CAB6'; btnH.style.color = '#15CAB6';
        btnS.style.borderColor = '#5F6B6D'; btnS.style.color = '#ADAEB5';
    }
    Promise.all([import('./leaderboard.js'), import('./leaderboardPage.js')]).then(([mod, lbPage]) => {
        if (mod.setLeaderboardMode) mod.setLeaderboardMode('hard');
        if (mod.renderLeaderboard) mod.renderLeaderboard(lbPage.getLeaderboardPageMapId());
    });
  });

  const pauseOverlay = document.getElementById('pauseOverlay');
  if (pauseOverlay) {
    if (!document.getElementById('pauseModeLabel')) {
      const ml = document.createElement('div');
      ml.id = 'pauseModeLabel';
      ml.style.cssText = 'font-size:12px;color:#557733;letter-spacing:2px;margin-bottom:8px';
      ml.textContent = '— SOLO —';
      pauseOverlay.prepend(ml);
    }
    const pauseContainer = document.getElementById('pauseBtnContainer');
    if (!document.getElementById('pauseLoadoutBtn')) {
      const pl = document.createElement('button');
      pl.id = 'pauseLoadoutBtn';
      pl.textContent = 'LOADOUT';
      pl.className = 'btn';
      pl.style.paddingLeft = '0'; pl.style.paddingRight = '0'; pl.style.textAlign = 'center';
      pl.onclick = () => {
        document.getElementById('pauseOverlay').style.display = 'none';
        document.exitPointerLock();
        openLoadout(true);
      };
      if (pauseContainer) pauseContainer.appendChild(pl);
    }
    if (!document.getElementById('pauseQuitBtn')) {
      const qb = document.createElement('button');
      qb.id = 'pauseQuitBtn';
      qb.textContent = 'QUIT TO MENU';
      qb.className = 'btn';
      qb.style.paddingLeft = '0'; qb.style.paddingRight = '0'; qb.style.textAlign = 'center';
      qb.style.opacity = '0.75';
      qb.onclick = () => {
          paused = false;
          gameRunning = false;
          document.exitPointerLock();
          document.getElementById('pauseOverlay').style.display = 'none';
          document.getElementById('hud').style.display = 'none';
          import('./progression.js').then(({ saveProfile, flushProfileToCloud }) => {
              saveProfile();
              flushProfileToCloud();
          });
          import('./leaderboard.js').then(({ renderLeaderboard }) => renderLeaderboard());
          document.getElementById('menuScreen').className = 'screen visible';
      };
      if (pauseContainer) pauseContainer.appendChild(qb);
    }
  }
})();

// ── Score submission ───────────────────────────────────────────
wireDeathSubmit((name, score) => {
    const mode = player.hardMode ? 'hard' : 'solo';
    const finalName = player.hardMode ? `[HARD] ${name}` : name;
    submitScore(finalName, score, curWave, mode, getCurrentMap());
});

// ── UI Refresh ────────────────────────────────────────────────
function refreshMenuUI() {
  const currentMapId = getCurrentMap();
  const hasHardMode = isHardModeUnlocked(currentMapId);
  const lvlData = getLevelProgress();
  
  const hardModeToggle = document.getElementById('hardModeToggle');
  const hardModeDesc = document.getElementById('hardModeDesc');
  if (hardModeToggle && hardModeDesc) {
    hardModeToggle.disabled = !hasHardMode;
    if (hasHardMode) {
        hardModeDesc.textContent = "Hard modifiers rotate every 3 waves · 2× Score.";
        hardModeDesc.style.color = "#E85E76";
    } else {
        hardModeToggle.checked = false; 
        hardModeDesc.textContent = "Unlock by clearing a boss wave";
        hardModeDesc.style.color = "#848591";
    }
  }

  const pvpBtn = document.getElementById('pvpBtn');
  if (pvpBtn) {
      if (lvlData.level >= 5) {
          pvpBtn.disabled = false;
          pvpBtn.textContent = '⚔️ PvP TDM';
          pvpBtn.title = '';
      } else {
          pvpBtn.disabled = true;
          pvpBtn.textContent = '🔒 PvP (LVL 5)';
          pvpBtn.title = 'Reach Player Level 5 to Unlock';
      }
  }

  const mapDropdown = document.getElementById('mapDropdown');
  if (mapDropdown && Object.values(MAPS).length > 0) {
    for (const m of Object.values(MAPS)) {
      if (m.id === 'scrapyard') continue;
      const opt = mapDropdown.querySelector(`option[value="${m.id}"]`);
      if (!opt) continue;
      const unlocked = isMapUnlocked(m.id);
      opt.disabled = !unlocked;
      opt.textContent = unlocked ? `${m.icon} ${m.name}` : `🔒 ${m.name} (${m.unlockHint})`;
      if (!unlocked && mapDropdown.value === m.id) {
        mapDropdown.value = 'scrapyard';
        setCurrentMap('scrapyard');
      }
    }
  }
}
window.refreshMenuUI = refreshMenuUI;

// ── Texture gate ───────────────────────────────────────────────
const _gatedBtns = ['startBtn','pvpBtn','loadoutBtn','respawnBtn','victoryBtn'];
const _loadMsg   = document.getElementById('loadMsg');

function _setLoadingDone() {
  _gatedBtns.forEach(id => { const el = document.getElementById(id); if (el) { el.disabled = false; el.style.opacity = ''; } });
  if (_loadMsg) _loadMsg.style.display = 'none';
  refreshMenuUI(); 
}
if (!texturesReady) {
  _gatedBtns.forEach(id => { const el = document.getElementById(id); if (el) { el.disabled = true; el.style.opacity = '0.4'; } });
  if (_loadMsg) _loadMsg.style.display = 'block';
  setOnTexturesReady(_setLoadingDone);
}

// ── Button bindings ────────────────────────────────────────────
document.getElementById('startBtn')    ?.addEventListener('click', () => startGame(0));
document.getElementById('victoryBtn')  ?.addEventListener('click', () => startGame(0));
const _returnToMenu = () => {
  document.getElementById('deathScreen').className  = 'screen hidden';
  document.getElementById('menuScreen').className   = 'screen visible';
  renderLeaderboard();
  refreshMenuUI();
};
document.getElementById('respawnBtn')?.addEventListener('click', _returnToMenu);
document.getElementById('victoryMenuBtn')?.addEventListener('click', _returnToMenu);
document.getElementById('loadoutBtn')  ?.addEventListener('click', () => openLoadout(false));
document.getElementById('pvpBtn')      ?.addEventListener('click', openFfaLobby);

document.getElementById('pvpEndPlayAgain')?.addEventListener('click', () => {
  if(isFfaActive())stopFfa();
  document.getElementById('pvpEndScreen').className = 'screen hidden';
  document.getElementById('menuScreen').className   = 'screen visible';
  renderLeaderboard();
});
document.getElementById('pvpBackBtn')?.addEventListener('click', () => {
  document.getElementById('pvpLobby').style.display = 'none';
  document.getElementById('menuScreen').className   = 'screen visible';
});
document.getElementById('resumeBtn')?.addEventListener('mousedown', (e) => {
  e.stopPropagation();
  if (typeof togglePause === 'function') togglePause();
});
document.getElementById('pauseOverlay')?.addEventListener('click', e => {
  if (e.target === e.currentTarget && paused) togglePause();
});
document.getElementById('mapDropdown')?.addEventListener('change', (e) => {
  setCurrentMap(e.target.value);
  renderLeaderboard();
  refreshMenuUI();
  const mapInfo = MAPS[e.target.value];
  const descEl = document.getElementById('mapDesc');
  if (descEl) descEl.textContent = mapInfo?.desc || '';
});

// ── Init ───────────────────────────────────────────────────────
setupLighting();
_populateMapDropdown();
renderLeaderboard();
initAttachmentVisuals();
engine.resize();
refreshMenuUI();
// Load community catalog without blocking built-in map startup.
registerCommunityMaps().then(ids=>{
  if(!ids.length)return;
  const before=getCurrentMap();
  _populateMapDropdown();
  const dropdown=document.getElementById('mapDropdown');
  if(dropdown)dropdown.value=before;
  refreshMenuUI();
  console.info('[maps] Registered community maps:',ids);
}).catch(err=>console.warn('[maps] Could not register custom maps:',err));
window.addEventListener('resize', () => engine.resize());

// Competitive room runtime, using the EXISTING WebSocket and FFA renderer.
// All map work must finish before network handlers replay queued start events.
let selectedMatchLoadout={primary:'SMG',secondary:'SHOTGUN'};
async function launchCompetitiveRoom(cfg,session) {
  try {
    ensureAudio();
    gameRunning=false;paused=false;
    player.hardMode=false;
    player.hp=100;player.armor=0;player.score=0;
    player.onGround=true;player.yVel=0;player.buffs={};
    setCurrentMap(cfg.mapId);
    _clearEntities();
    const weaponMeshes=new Set();
    for(const node of Object.values(wepModels))node.getChildMeshes().forEach(m=>weaponMeshes.add(m));
    scene.meshes.slice().forEach(m=>{
      if(m.name==='_playerBody'||m.name.startsWith('wep_')||m.name.startsWith('wm_')||weaponMeshes.has(m))return;
      m.dispose();
    });
    scene.lights.slice().forEach(l=>{
      if(!l.name.startsWith('hemi')&&!l.name.startsWith('fill')&&l.name!=='lanternLight'&&!l.name.startsWith('burnLight'))l.dispose();
    });
    window.__levelScene=scene;window.__levelNavPlugin=navPlugin;
    const map=await buildMap(cfg.mapId);
    window._hazardZones=map.hazardZones;
    window._movingPlatforms=map.movingPlatforms;
    window._powerSwitches=map.powerSwitches;
    rebuildMeshMap();
    const meta=getMapMeta(cfg.mapId);
    resetPlayer(meta.spawn.x,PH+meta.spawn.yOffset,meta.spawn.z);
    for(const def of Object.values(WDEFS)){
      if(def.useHeat){def.heat=0;def.isOverheated=false}
      if(def.magSize)def.currentMag=def.magSize;
      def.ammo=def.startAmmo||0;
    }
    inventory[0]=cfg.mode==='gunGame'?'PISTOL':(selectedMatchLoadout.primary||'SMG');
    inventory[1]=cfg.mode==='gunGame'?null:(selectedMatchLoadout.secondary||'SHOTGUN');
    inventory[2]=cfg.mode==='gunGame'?null:'PISTOL';
    setActiveSlot(0);
    const name=profileDisplayName();
    const onGameStart=()=>{
      session.closeLobby();
      _hideAllScreens();
      gameRunning=true;paused=false;
      setWeapon(inventory[0]);
      wepGroup.setEnabled(true);
      document.getElementById('hud').style.display='block';
      updateHUD();
      document.getElementById('c').requestPointerLock().catch(()=>{});
    };
    const onRoundEnd=(winner,rows)=>{
      gameRunning=false;
      document.exitPointerLock();
      hideFfaHUD();
      document.getElementById('hud').style.display='none';
      const screen=document.getElementById('pvpEndScreen');
      if(screen)screen.className='screen visible';
      const result=document.getElementById('pvpEndResult');
      if(result)result.textContent=(winner||'DRAW')+' WINS';
      const score=document.getElementById('pvpEndScore');
      if(score)score.textContent=(rows||[]).map((p,i)=>`${i+1}. ${p.name}: ${p.score}`).join('   ');
    };
    // Bot fill remains disabled until it is driven by server-side player AI.
    startFfa('',name,session.welcome.roomId,{...cfg,addBots:false,weaponSpawns:false},
      !!session.welcome.isHost,onGameStart,onRoundEnd,session);
  } catch(error) {
    console.error('[match] Could not initialize network match:',error);
    session.socket?.close();
    session.closeLobby();
    document.getElementById('menuScreen').className='screen visible';
  }
}
function profileDisplayName(){
  return document.getElementById('playerNameInput')?.value||'PLAYER';
}

// Survival is the only mode with a real match behind it right now — the
// Create Room screen hands off a plain {mapId, hardMode} config here, and
// this just routes it into the existing solo flow. TDM/FFA/Gun Game don't
// have a hookup yet (their match runtime is a later phase); roomFlow.js
// tells the player that plainly instead of pretending Start works.
initRoomFlow({
  onSelectLoadout: (cfg,onChosen)=>{
    showLoadout(slots=>{
      selectedMatchLoadout=slots;
      onChosen?.(slots);
    },cfg.mode);
  },
  onStartMatch: launchCompetitiveRoom,
  onStartSurvival: (cfg) => {
    setCurrentMap(cfg.mapId);
    const hmToggle = document.getElementById('hardModeToggle');
    if (hmToggle) hmToggle.checked = !!cfg.hardMode;
    startGame(0,cfg.hardModifier||'auto');
  },
});

// ── Game loop ──────────────────────────────────────────────────
let hudTimer = 0;
engine.runRenderLoop(() => {
  let dt = engine.getDeltaTime() / 1000;
  if (dt < 0.001) dt = 0.001;
  if (dt > 0.05)  dt = 0.05;

  // FFA pre-lobby: only network updates, skip game logic
  if (isFfaInPreLobby()) {
    updateFfa(dt);
    scene.render();
    return;
  }

  if (isFfaActive() && isLocalDead()) {
    updateFfa(dt);
    scene.render();
    return;
  }

  // Main game updates – skip if game not running, or paused
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

    // Moving platforms
    if (window._movingPlatforms && window._movingPlatforms.length > 0) {
      for (const plat of window._movingPlatforms) {
        if (!plat._moveData || plat._moveData.paused) continue;
        const md = plat._moveData;
        if (md.waitTimer > 0) {
          md.waitTimer -= dt;
          continue;
        }
        const oldPos = plat.position.clone();
        md.t += dt * md.speed * md.dir;
        if (md.t > 1) { md.t = 1; md.dir = -1; md.waitTimer = md.waitTime; }
        if (md.t < 0) { md.t = 0; md.dir = 1; md.waitTimer = md.waitTime; }
        const t = md.t;
        plat.position.x = md.start.x + (md.end.x - md.start.x) * t;
        plat.position.y = md.start.y + (md.end.y - md.start.y) * t;
        plat.position.z = md.start.z + (md.end.z - md.start.z) * t;
        const delta = plat.position.subtract(oldPos);
        if (player.onGround) {
          const dx = camera.position.x - plat.position.x;
          const dz = camera.position.z - plat.position.z;
          const dy = camera.position.y - plat.position.y;
          if (Math.abs(dx) < 3.5 && Math.abs(dz) < 3.5 && dy > 0 && dy < 2.5) {
            movePlayerBody(delta);
          }
        }
      }
    }

    // Hazard zones
    if (!isFfaActive() && window._hazardZones && window._hazardZones.length > 0) {
      for (const haz of window._hazardZones) {
        const px = camera.position.x;
        const pz = camera.position.z;
        const pfeet = camera.position.y - PH;
        const hx = haz.position.x;
        const hz = haz.position.z;
        const hy = haz.position.y;
        const hw = haz.metadata.halfWidth;
        const hd = haz.metadata.halfDepth;
        const hh = haz.metadata.halfHeight ?? 0.8;
        if (px > hx - hw && px < hx + hw &&
            pfeet >= hy - hh && pfeet <= hy + hh &&
            pz > hz - hd && pz < hz + hd) {
          hurtPlayer((haz.metadata?.dps || 15) * dt, { hazardType: haz.metadata.hazardType });
        }
      }
    }

    // Power switch hint
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

    // Power switch interaction
    if (window._powerSwitches && window._powerSwitches.length > 0 && keys['KeyF']) {
      for (const sw of window._powerSwitches) {
        const dist = BABYLON.Vector3.Distance(camera.position, sw.position);
        if (dist < 3 && sw.metadata?.interactive && !sw.metadata._cooldown) {
          sw.metadata.activated = !sw.metadata.activated;
          sw.metadata._cooldown = true;
          setTimeout(() => { sw.metadata._cooldown = false; }, 500);
          const platforms = sw.metadata.targetPlatforms || [];
          for (const plat of platforms) {
            plat.setEnabled(sw.metadata.activated);
            plat._moveData.paused = !sw.metadata.activated;
          }
          const swLights = sw.metadata.targetLights || [];
          for (const light of swLights) light.setEnabled(!sw.metadata.activated);
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
  }

  // Always render the scene
  scene.render();
});