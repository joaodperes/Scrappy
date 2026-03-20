// main.js  entry point, game loop, solo/pvp mode orchestration  (Babylon.js port)
import { scene, camera, engine } from './scene.js';
import { texturesReady, setOnTexturesReady } from './textures.js';
import { ensureAudio } from './audio.js';
import { buildLevel, resetBarrels, updateBarrels } from './level.js';
import { setupLighting } from './lighting.js';
import { setWeapon, inventory, WDEFS, setActiveSlot, animWeapon } from './weapons.js';
import { enemies, projs, pickups, weaponDrops, _sparkPool, particles, player } from './gameState.js';
import { rebuildMeshMap, hitRobot, updateEnemies } from './enemies.js';
import { updateProjs } from './projectiles.js';
import { updateParticles } from './particles.js';
import { updatePickups, updateWeaponDrops, tryPickupWeapon, initSecretKits } from './pickups.js';
import { updateWaves, setCurWave, setWaveOn, setWaveDly, curWave } from './waves.js';
import { updatePlayer, setupInput, hurtPlayer, PH, resetPlayer } from './player.js';
import { updateHUD, tickHitMarker, wireDeathSubmit, showHitMarker } from './ui.js';
import { submitScore, renderLeaderboard } from './leaderboard.js';
import { startPvp, updatePvp, isPvpActive } from './pvp.js';
import { cb } from './gameState.js';

let gameRunning = false;
let paused      = false;

//  Register cross-module callbacks 
cb.hitRobot       = hitRobot;
cb.hurtPlayer     = hurtPlayer;
cb.markHudDirty   = () => updateHUD();
cb.endGame        = endGame;
cb.showHitMarker  = showHitMarker;
cb.isGameRunning  = () => gameRunning;

//  Input setup 
setupInput(
  () => gameRunning,
  () => paused,
  togglePause,
  () => tryPickupWeapon(gameRunning, paused),
);

//  Dev: toggle Babylon Inspector with F2
document.addEventListener('keydown', e => {
  if (e.code === 'F2') {
    if (scene.debugLayer.isVisible()) scene.debugLayer.hide();
    else scene.debugLayer.show({ overlay: true });
  }
});

//  Solo game 
function startGame() {
  ensureAudio();
  player.hp=100; player.armor=0; player.score=0; player.yVel=0; player.onGround=true;

  // Reset weapons
  for (const [k,w] of Object.entries(WDEFS)) w.ammo = (k==='PISTOL') ? Infinity : 0;
  inventory[2]='PISTOL'; inventory[1]=null; inventory[0]=null;
  setActiveSlot(2);

  // Reset wave state
  setCurWave(0); setWaveOn(false); setWaveDly(1.8);

  // Clear old entities
  for (const e of enemies) { e.group.getChildMeshes().forEach(m => m.dispose()); e.group.dispose(); } enemies.length=0;
  for (const p of projs) {
    if (p.g) { p.g.getChildMeshes().forEach(m => m.dispose()); p.g.dispose(); }
    else if (p.mesh) p.mesh.dispose();
    if (p.light) p.light.dispose();
  } projs.length=0;
  for (const p of pickups) { 
      if (p.mesh) p.mesh.dispose(); 
      if (p.ring) p.ring.dispose(); 
      if (p.light) p.light.dispose(); 
  } pickups.length=0;
  for (const p of weaponDrops) { p.mesh.getChildMeshes().forEach(m=>m.dispose()); p.mesh.dispose(); p.ring.dispose(); p.light.dispose(); } weaponDrops.length=0;
  for (const sp of _sparkPool) { sp.active=false; sp.mesh.setEnabled(false); }
  particles.length=0;
  resetBarrels();
  rebuildMeshMap();

  // Start on loading bay floor (confirmed large slab at x[-30,-8] z[-32,8])
  resetPlayer(-19, PH, -12);

  document.getElementById('menuScreen').className='screen hidden';
  document.getElementById('deathScreen').className='screen hidden';
  document.getElementById('victoryScreen').className='screen hidden';
  const pvpEnd = document.getElementById('pvpEndScreen');
  if (pvpEnd) pvpEnd.className='screen hidden';
  document.getElementById('hud').style.display='block';
  document.getElementById('pvpHud').style.display='none';

  setWeapon('PISTOL'); updateHUD();
  gameRunning=true; paused=false;
  document.getElementById('c').requestPointerLock();
}

function endGame() {
  gameRunning=false;
  document.exitPointerLock();
  document.getElementById('hud').style.display='none';
  document.getElementById('deathStats').textContent =
    `FINAL SCORE: ${player.score}   \u2014   WAVES: ${curWave}`;
  const inp = document.getElementById('playerNameInput');
  const btn = document.getElementById('submitScoreBtn');
  if (inp) { inp.value=''; inp.disabled=false; }
  if (btn) { btn.disabled=false; btn.textContent='SUBMIT SCORE'; }
  document.getElementById('deathScreen').className='screen visible';
}

function togglePause() {
  paused = !paused;
  document.getElementById('pauseOverlay').style.display = paused ? 'flex' : 'none';
  if (paused) document.exitPointerLock();
  else document.getElementById('c').requestPointerLock();
}

//  PvP mode 
function startPvpMode() {
  const name   = (document.getElementById('pvpName')?.value   || 'ANON').trim();
  const room   = (document.getElementById('pvpRoom')?.value   || 'default').trim();
  const server = (document.getElementById('pvpServer')?.value || 'ws://localhost:8080').trim();

  ensureAudio();
  player.hp=100; player.armor=0; player.yVel=0; player.onGround=true;

  for (const e of enemies) { e.group.getChildMeshes().forEach(m => m.dispose()); e.group.dispose(); } enemies.length=0;
  for (const p of projs) {
    if (p.g) { p.g.getChildMeshes().forEach(m => m.dispose()); p.g.dispose(); }
    else if (p.mesh) p.mesh.dispose();
    if (p.light) p.light.dispose();
  } projs.length=0;
  for (const p of pickups) { p.mesh.dispose(); p.ring.dispose(); p.light.dispose(); } pickups.length=0;
  resetBarrels();

  document.getElementById('menuScreen').className='screen hidden';
  document.getElementById('pvpLobby').style.display='none';
  document.getElementById('hud').style.display='block';
  document.getElementById('pvpHud').style.display='flex';

  gameRunning = true; paused = false;
  document.getElementById('c').requestPointerLock();

  startPvp(server, name, room, (winner, red, blue) => {
    gameRunning=false;
    document.exitPointerLock();
    document.getElementById('hud').style.display='none';
    document.getElementById('pvpHud').style.display='none';
    const es = document.getElementById('pvpEndScreen');
    if (es) es.className='screen visible';
    const res = document.getElementById('pvpEndResult');
    if (res) res.textContent = winner;
    const sc  = document.getElementById('pvpEndScore');
    if (sc)  sc.textContent = `RED ${red}  \u2013  BLUE ${blue}`;
  });
}

//  Score submission 
wireDeathSubmit((name, score) => submitScore(name, score, curWave, 'solo'));

//  Texture-loading gate ─────────────────────────────────────────────────────
// Disable play buttons while LibreQuake textures are downloading, then
// re-enable them once the LoadingManager fires its onLoad callback.
const _gatedBtns = ['startBtn', 'pvpBtn', 'pvpStartBtn', 'respawnBtn', 'victoryBtn'];
const _loadMsg   = document.getElementById('loadMsg');

function _setLoadingDone() {
  _gatedBtns.forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.disabled = false; el.style.opacity = ''; }
  });
  if (_loadMsg) _loadMsg.style.display = 'none';
}

if (!texturesReady) {
  _gatedBtns.forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.disabled = true; el.style.opacity = '0.4'; }
  });
  if (_loadMsg) _loadMsg.style.display = 'block';
  setOnTexturesReady(_setLoadingDone);
}
// ─────────────────────────────────────────────────────────────────────────────

//  Button bindings 
document.getElementById('startBtn')?.addEventListener('click',   startGame);
document.getElementById('respawnBtn')?.addEventListener('click', startGame);
document.getElementById('victoryBtn')?.addEventListener('click', startGame);
document.getElementById('pvpStartBtn')?.addEventListener('click', startPvpMode);
document.getElementById('pvpEndPlayAgain')?.addEventListener('click', () => {
  document.getElementById('pvpEndScreen').className='screen hidden';
  document.getElementById('menuScreen').className='screen visible';
  renderLeaderboard();
});
document.getElementById('pvpBackBtn')?.addEventListener('click', () => {
  document.getElementById('pvpLobby').style.display='none';
  document.getElementById('menuScreen').className='screen visible';
});
document.getElementById('pvpBtn')?.addEventListener('click', () => {
  document.getElementById('menuScreen').className='screen hidden';
  document.getElementById('pvpLobby').style.display='flex';
});
document.getElementById('pauseOverlay')?.addEventListener('click', () => { if (paused) togglePause(); });

//  Init 
buildLevel();
initSecretKits();
setupLighting();
renderLeaderboard();

engine.resize();
window.addEventListener('resize', () => engine.resize());
//  Game loop 
let hudTimer = 0;
engine.runRenderLoop(() => {
  let dt = engine.getDeltaTime() / 1000;
  if (dt < 0.001) dt = 0.001;
  if (dt > 0.05) dt = 0.05;
  
  if (gameRunning && !paused) {
    updatePlayer(dt, gameRunning, paused);
    
    // Added the timer tick 
    hudTimer += dt;
    if (hudTimer >= 1.0) { // Every 1 full second
        if (cb.markHudDirty) cb.markHudDirty();
        hudTimer = 0;
    }

    if (isPvpActive()) {
      updatePvp(dt);
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
