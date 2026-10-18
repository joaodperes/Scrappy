// enemies.js – robot AI, spawning, hit/destroy, round timer, angry mode
const BABYLON = window.BABYLON;
import { scene, camera, navPlugin } from './scene.js';
import { M, robotTex, fireTex } from './textures.js';
import { makeScaledWeaponModel, ROBOT_DROPS, curWep, WDEFS  } from './weapons.js';
import { enemies, player, cb } from './gameState.js';
import { spawnSparks } from './particles.js';
import { fireEnemyShot, createYellowEMPStunArc } from './projectiles.js';
import { sfx } from './audio.js';
import { jumpPads } from './level.js';
import { botTravelTarget, botNavPath } from './botNavigation.js';
import { getCurrentMap, getWalkableSpawns } from './mapManager.js';
import { recordDamage, isWonderWeaponUnlocked  } from './progression.js';
import { getBossPoolForCurrentMap } from './waves.js';

// ── Mesh→enemy lookup ─────────────────────────────────────────
export const _meshToEnemy = new Map();
export function rebuildMeshMap() {
  _meshToEnemy.clear();
  for (const e of enemies) {
    if (!e.alive) continue;
    e.group.getChildMeshes().forEach(m => _meshToEnemy.set(m, e));
  }
}

// ── Boss types: railgun deals reduced damage, not instant-kill ─
const BOSS_TYPES = new Set(['giantbot']);

// ── Round timer & angry mode ──────────────────────────────────
let _gameTime    = 0;   // seconds since wave started, counts UP
let _roundTimer  = 0;   // seconds remaining, counts DOWN
let _angryMode   = false;
let _roundInit   = false;
let _totalKills  = 0;   // kills across all rounds
let _roundKills  = 0;   // kills this round
let _roundEnemies = 0;  // enemies spawned this round

export function initRoundTimer(numEnemies) {
  _roundTimer   = numEnemies * 30;
  _gameTime     = 0;
  _angryMode    = false;
  _roundInit    = true;
  _roundKills   = 0;
  _roundEnemies = numEnemies;
  _ensureTimerHUD();
  _resetTimerColour();
}
export function isAngryMode() { return _angryMode; }
export function getGameTime()  { return _gameTime; }

function _fmt(sec) {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function _resetTimerColour() {
  const rt = document.getElementById('_timerRound');
  if (rt) { rt.style.color = '#0ff'; rt.textContent = 'ROUND: --:--'; }
}

function _ensureTimerHUD() {
  if (document.getElementById('_timerHUD')) return;
  const div = document.createElement('div');
  div.id = '_timerHUD';
  div.style.cssText = `
    position:fixed; top:14px; right:18px; z-index:999;
    display:flex; flex-direction:column; align-items:flex-end; gap:4px;
    font-family:'Courier New',monospace; font-weight:bold; text-shadow:0 0 6px #000;
    pointer-events:none; user-select:none;
  `;
  div.innerHTML = `
    <div id="_timerGame"    style="font-size:13px;color:#aaa;">TIME: 0:00</div>
    <div id="_timerRound"   style="font-size:15px;color:#0ff;">ROUND: --:--</div>
    <div id="_killsTotal"   style="font-size:13px;color:#fa0;">KILLS: 0</div>
    <div id="_killsRound"   style="font-size:13px;color:#ff6;">ROUND: 0 / 0</div>
  `;
  document.body.appendChild(div);
}

function _tickTimers(dt) {
  // Auto-initialise if waves.js never called initRoundTimer() explicitly.
  // Also re-initialise after every wave completes (all enemies dead) so that
  // angry mode and the countdown reset cleanly for the next round.
  if (!_roundInit) {
    const alive = enemies.filter(e => e.alive).length;
    if (alive > 0) {
      _roundTimer   = alive * 30;
      _gameTime     = 0;
      _angryMode    = false;
      _roundInit    = true;
      _roundKills   = 0;
      _roundEnemies = alive;
      _ensureTimerHUD();
      _resetTimerColour();
    }
    return;
  }

  // Wave cleared – reset so next spawn triggers fresh countdown
  const aliveNow = enemies.filter(e => e.alive).length;
  if (aliveNow === 0) {
    const kr = document.getElementById('_killsRound');
    if (kr) kr.textContent = 'ROUND: ' + _roundKills + ' / ' + _roundEnemies;
    _roundInit  = false;
    _angryMode  = false;
    _resetTimerColour();
    return;
  }
  _gameTime += dt;
  _roundTimer = Math.max(0, _roundTimer - dt);

  const gt = document.getElementById('_timerGame');
  const rt = document.getElementById('_timerRound');
  const kt = document.getElementById('_killsTotal');
  const kr = document.getElementById('_killsRound');
  
  // Clamp visual kills to never exceed the wave's enemy count
  const displayKills = Math.min(_roundKills, _roundEnemies);
  
  if (gt) gt.textContent = 'TIME: ' + _fmt(_gameTime);
  if (kt) kt.textContent = 'KILLS: ' + _totalKills;
  if (kr) kr.textContent = 'ROUND: ' + displayKills + ' / ' + _roundEnemies;

  if (_angryMode) {
    if (rt) { rt.style.color = '#f44'; rt.textContent = '⚠ ANGRY MODE'; }
    return;
  }

  if (rt) { rt.style.color = '#0ff'; rt.textContent = 'ROUND: ' + _fmt(_roundTimer); }

  if (_roundTimer <= 0) {
    _angryMode = true;
    _activateAngryMode();
  }
}

function _activateAngryMode() {
  for (const e of enemies) {
    if (!e.alive) continue;
    // +60% damage, +50% speed, no distance slow-down
    e.dmg   = Math.round(e.dmg   * 1.6);
    e.speed = e.speed * 1.5;
    e.score = e.score * 2;     // 2× points
    _addRedArrow(e);
  }
  // Flash warning
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(255,0,0,0.22);z-index:1200;
    display:flex;align-items:center;justify-content:center;
    font-family:'Courier New',monospace;font-size:48px;font-weight:bold;
    color:#f44;text-shadow:0 0 20px #f00;pointer-events:none;
  `;
  overlay.textContent = '⚠ ENEMIES ENRAGED ⚠';
  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), 2800);
}

// ── Red arrow marker ──────────────────────────────────────────
function _addRedArrow(e) {
  if (e._arrowMesh) return;  // already has one
  const arrowMat = new BABYLON.StandardMaterial('arrowMat_' + e.group.name, scene);
  arrowMat.emissiveColor = new BABYLON.Color3(1, 0.08, 0.08);
  arrowMat.disableLighting = true;

  const shaft = BABYLON.MeshBuilder.CreateCylinder('aShaft', { diameter: 0.18, height: 0.65, tessellation: 8 }, scene);
  shaft.material = arrowMat;
  const head = BABYLON.MeshBuilder.CreateCylinder('aHead', { diameterTop: 0, diameterBottom: 0.50, height: 0.45, tessellation: 8 }, scene);
  head.material = arrowMat;

  // Parent both to a transform node so they move with the enemy
  const arrowNode = new BABYLON.TransformNode('arrow_' + e.group.name, scene);
  shaft.parent = arrowNode;
  head.parent  = arrowNode;
  shaft.position.y = 0;
  head.position.y  = -0.42;    // below shaft, pointing DOWN (cone tip points down)
  head.rotation.x  = Math.PI;  // flip: wide base up, tip down

  shaft.isPickable = false;
  head.isPickable  = false;

  e._arrowNode = arrowNode;
  e._arrowMat  = arrowMat;
}

function _updateArrow(e) {
  if (!e._arrowNode) return;
  const BASE_HEIGHT = (e.flyH > 0 ? e.flyH + 140 : 140);
  const bob = Math.sin(Date.now() * 0.003) * 0.25;
  e._arrowNode.position.set(
    e.group.position.x,
    e.group.position.y + BASE_HEIGHT + bob,
    e.group.position.z,
  );
}

// ── Wall-clearance ray ────────────────────────────────────────
// Probe whether moving in direction `dir` by `step` metres from (ox,oy,oz)
// would hit a wall.  Origin is at the BOT'S CURRENT position (not the
// destination) so walls between here and there are detected.
// Probe length = step + 0.85 margin; height = 1.0 (body centre).
function _wallInDir(ox, oy, oz, dir, step) {
  const origin = new BABYLON.Vector3(ox, oy + 1.0, oz);
  const ray = new BABYLON.Ray(origin, dir, step + 0.85);
  const hit = scene.pickWithRay(ray, m => m.checkCollisions && !m.metadata?.enemy && m.isEnabled());
  return !!hit?.hit;
}

// ── LOS check ─────────────────────────────────────────────────
const _losDir = new BABYLON.Vector3();
function _hasLOS(from, to) {
  _losDir.copyFrom(to).subtractInPlace(from);
  const dist = _losDir.length();
  if (dist < 0.1) return true;
  _losDir.scaleInPlace(1 / dist);
  const ray = new BABYLON.Ray(from, _losDir, dist - 0.3);
  const hit = scene.pickWithRay(ray, m => m.checkCollisions && !m.metadata?.enemy && m.isEnabled());
  return !hit?.hit;
}

// ── Robot mesh builder ────────────────────────────────────────
export function buildRobot(type) {
  const g = new BABYLON.TransformNode('robot_' + type, scene);
  let bW = 0.48, bH = 1.18, bD = 0.32, aL = 0.7, aW = 0.10,
    lW = 0.13, lH = 0.7, fL = 0.22, fH = 0.11,
    hW = 0.32, hH = 0.36, hD = 0.28;
  const sc = {
    scout:     { r: 72,  gr: 80, b: 72,  led: M.ledGreen,  flyH: 0   },
    heavy:     { r: 100, gr: 68, b: 48,  led: M.ledRed,    flyH: 0   },
    sniper:    { r: 45,  gr: 58, b: 78,  led: M.ledCyan,   flyH: 0   },
    drone:     { r: 52,  gr: 52, b: 88,  led: M.ledBlue,   flyH: 1.4 },
    pistol:    { r: 90,  gr: 90, b: 90,  led: M.ledWhite,  flyH: 0   },
    shotgun:   { r: 120, gr: 90, b: 60,  led: M.ledYellow, flyH: 0   },
    rocket:    { r: 80,  gr: 40, b: 40,  led: M.ledOrange, flyH: 0   },
    grenadier: { r: 55,  gr: 110, b: 55, led: M.ledGreen,  flyH: 0   },
    electron_bot: { r: 10,  gr: 180, b: 255, led: M.ledCyan, flyH: 0 },
    ion_sniper:   { r: 140, gr: 20,  b: 200, led: M.plasmaMat, flyH: 0 },
    medic_bot:    { r: 220, gr: 240, b: 220, led: M.ledGreen,  flyH: 0 },
    shield_bot:   { r: 80,  gr: 110, b: 160, led: M.ledCyan,   flyH: 0 },
    teleport_bot: { r: 40,  gr: 200, b: 240, led: M.ledCyan,   flyH: 0 },
    swarm_host:   { r: 60,  gr: 100, b: 40,  led: M.ledGreen,  flyH: 0 },
    rivet_bot:    { r: 130, gr: 85,  b: 35,  led: M.ledOrange, flyH: 0 },
    enforcer:     { r: 55,  gr: 65,  b: 80,  led: M.ledCyan,   flyH: 0 },
    tactician:    { r: 65,  gr: 78,  b: 60,  led: M.ledGreen,  flyH: 0 },
    burst_bot: { r: 160, gr: 90, b: 40,  led: M.ledOrange, flyH: 0 }, // Orange/Brown theme
    dmr_bot:   { r: 70,  gr: 100, b: 70, led: M.ledCyan,   flyH: 0 }, // Green/Grey theme
  }[type] || { r: 70, gr: 70, b: 70, led: M.ledGreen, flyH: 0 };
  const bmat = robotTex('r_' + type + '_' + Math.random().toString(36).slice(2), sc.r, sc.gr, sc.b);
  const led  = sc.led;

  function addBox(n, sx, sy, sz, mat, px, py, pz) {
    const m = BABYLON.MeshBuilder.CreateBox(n, { width: sx, height: sy, depth: sz }, scene);
    m.position.set(px, py, pz); m.material = mat; m.parent = g;
    m.checkCollisions = false; m.isPickable = true; m.metadata = { enemy: true }; return m;
  }
  function addSphere(n, r, mat, px, py, pz) {
    const m = BABYLON.MeshBuilder.CreateSphere(n, { diameter: r * 2, segments: 8 }, scene);
    m.position.set(px, py, pz); m.material = mat; m.parent = g;
    m.checkCollisions = false; m.isPickable = true; m.metadata = { enemy: true }; return m;
  }
  function addCyl(n, d, h, mat, px, py, pz, rx) {
    const m = BABYLON.MeshBuilder.CreateCylinder(n, { diameter: d, height: h, tessellation: 8 }, scene);
    m.position.set(px, py, pz); m.material = mat; m.parent = g;
    if (rx) m.rotation.x = rx;
    m.checkCollisions = false; m.isPickable = true; m.metadata = { enemy: true }; return m;
  }
  function addTorus(n, d, t, mat, px, py, pz) {
    const m = BABYLON.MeshBuilder.CreateTorus(n, { diameter: d, thickness: t, tessellation: 16 }, scene);
    m.position.set(px, py, pz); m.rotation.x = Math.PI / 2; m.material = mat; m.parent = g;
    m.checkCollisions = false; m.isPickable = true; m.metadata = { enemy: true }; return m;
  }

  if (type === 'drone') {
    addSphere('body', .58, bmat, 0, 1.5, 0); addTorus('ring', 1.24, .14, bmat, 0, 1.5, 0);
    addSphere('eye', .14, led, 0, 1.5, .58); addCyl('bbl', .08, .4, M.gunMetal, 0, 1.28, .75, Math.PI / 2);
    for (const s of [-1, 1]) { addBox('arm' + s, .72, .04, .1, M.gunMetal, s * .56, 1.72, 0); addCyl('rot' + s, .56, .04, led, s * .88, 1.76, 0, 0); }
  } else {
    if (type === 'heavy')   { bW=1.04; bH=1.65; bD=.65; aL=.88; aW=.16; lW=.24; lH=.65; fL=.34; fH=.14; hW=.52; hH=.40; hD=.36; }
    if (type === 'sniper')  { bW=.66; bH=1.1;  bD=.44; aL=.64; aW=.11; lW=.20; lH=.52; fL=.28; fH=.14; hW=.4;  hH=.31; hD=.29; }
    if (type === 'shotgun') { bW=.54; bH=1.12; bD=.34; aL=.72; aW=.12; lW=.16; lH=.68; fL=.25; fH=.12; hW=.34; hH=.33; hD=.26; }
    if (type === 'rocket')  { bW=.52; bH=1.15; bD=.36; aL=.74; aW=.13; lW=.17; lH=.70; fL=.28; fH=.13; hW=.36; hH=.34; hD=.29; }
    if (type === 'grenadier') { bW=.60; bH=1.20; bD=.42; aL=.70; aW=.13; lW=.18; lH=.65; fL=.28; fH=.13; hW=.38; hH=.34; hD=.30; }
    if (type === 'electron_bot') { bW=.50; bH=1.15; bD=.35; aL=.70; aW=.12; lW=.15; lH=.68; fL=.25; fH=.12; hW=.35; hH=.32; hD=.28; }
    if (type === 'ion_sniper')   { bW=.60; bH=1.1; bD=.40; aL=.64; aW=.12; lW=.18; lH=.55; fL=.28; fH=.13; hW=.38; hH=.30; hD=.28; }
    if (type === 'ninja') { bW=.45; bH=1.0; bD=.30; aL=.60; aW=.10; lW=.12; lH=.60; fL=.20; fH=.10; hW=.30; hH=.25; hD=.25; }
    if (type === 'armored') { bW=.80; bH=1.3; bD=.50; aL=.80; aW=.18; lW=.24; lH=.60; fL=.35; fH=.15; hW=.45; hH=.35; hD=.35; }
    if (type === 'rivet_bot') { bW=.78; bH=1.25; bD=.48; aL=.76; aW=.15; lW=.20; lH=.62; fL=.30; fH=.13; hW=.40; hH=.34; hD=.32; }
    if (type === 'enforcer')  { bW=.92; bH=1.40; bD=.58; aL=.80; aW=.17; lW=.26; lH=.62; fL=.36; fH=.15; hW=.48; hH=.38; hD=.34; }
    if (type === 'tactician') { bW=.56; bH=1.08; bD=.36; aL=.66; aW=.11; lW=.16; lH=.56; fL=.24; fH=.12; hW=.34; hH=.30; hD=.27; }
    if (type === 'burst_bot') { bW=.58; bH=1.12; bD=.38; aL=.70; aW=.12; lW=.18; lH=.64; fL=.26; fH=.12; hW=.36; hH=.32; hD=.28; }
    if (type === 'dmr_bot')   { bW=.52; bH=1.08; bD=.35; aL=.66; aW=.11; lW=.16; lH=.60; fL=.24; fH=.12; hW=.34; hH=.30; hD=.27; }
    const bY = bH / 2 + .28;
    const hY = bY + bH/2 + hH*.42;
    // ── medic_bot: white cross on chest + healing syringe arm ────
    if (type === 'medic_bot') {
        addBox('crossV', 0.06, 0.40, 0.06, M.ledGreen, 0, bY + bH * 0.30, bD * 0.52);
        addBox('crossH', 0.24, 0.06, 0.06, M.ledGreen, 0, bY + bH * 0.30, bD * 0.52);
        addCyl('syringe', 0.06, 0.38, M.ledWhite, bW/2 + aW/2, bY + bH * 0.18, 0.45, Math.PI / 2);
        addCyl('syrtip',  0.03, 0.12, M.ledGreen, bW/2 + aW/2, bY + bH * 0.18, 0.68, Math.PI / 2);
    }
    // ── shield_bot: broad forearm shield plate ───────────────────
    if (type === 'shield_bot') {
        const shMat = new BABYLON.StandardMaterial('shieldBotMat_' + Math.random(), scene);
        shMat.diffuseColor  = new BABYLON.Color3(0.12, 0.35, 0.65);
        shMat.emissiveColor = new BABYLON.Color3(0.08, 0.25, 0.55);
        shMat.alpha = 0.55; shMat.backFaceCulling = false;
        const shPlate = BABYLON.MeshBuilder.CreateBox('shPlate', { width: 0.10, height: 1.1, depth: 0.65 }, scene);
        shPlate.position.set(bW/2 + 0.22, bY, bD * 0.22);
        shPlate.material = shMat; shPlate.parent = g; shPlate.isPickable = true;
        shPlate.metadata = { enemy: true };
        addBox('shEdge', 0.04, 1.12, 0.67, M.ledCyan, bW/2 + 0.27, bY, bD * 0.22);
    }
    // ── teleport_bot: blink emitter rings ────────────────────────
    if (type === 'teleport_bot') {
        addTorus('blinkA', 0.55, 0.06, M.ledCyan,  0, bY + bH * 0.55, 0);
        addTorus('blinkB', 0.38, 0.04, M.ledBlue,  0, bY + bH * 0.40, 0);
        addSphere('core',  0.11, M.ledCyan, 0, bY + bH * 0.50, 0);
    }
    // ── swarm_host: bulbous abdomen + spawn port ─────────────────
    if (type === 'swarm_host') {
        addSphere('abdomen', 0.70, bmat, 0, bY - 0.10, -bD * 0.80);
        addCyl('port1', 0.14, 0.22, M.ledGreen,  0.20, bY - 0.10, -bD * 1.30, 0);
        addCyl('port2', 0.14, 0.22, M.ledGreen, -0.20, bY - 0.10, -bD * 1.30, 0);
        addBox('carapace', bW * 0.9, 0.10, bD * 1.6, M.ledGreen, 0, bY + bH * 0.55, -bD * 0.40);
    }
    // ── rivet_bot: riveted armour plate with visible stud heads ──
    if (type === 'rivet_bot') {
        addBox('plate', bW*0.85, bH*0.45, 0.05, M.gunMetal, 0, bY + bH*0.18, bD*0.52);
        const studRows = 2, studCols = 3;
        for (let r = 0; r < studRows; r++) for (let c = 0; c < studCols; c++) {
            const sx = (c - (studCols-1)/2) * bW*0.28;
            const sy = bY + bH*0.10 + r*bH*0.16;
            addCyl('rivetStud'+r+c, 0.05, 0.04, M.ledOrange, sx, sy, bD*0.55, Math.PI/2);
        }
        addCyl('shoulderL', 0.22, 0.16, M.gunMetal, bW/2+0.05, bY+bH*0.42, 0, Math.PI/2);
        addCyl('shoulderR', 0.22, 0.16, M.gunMetal, -bW/2-0.05, bY+bH*0.42, 0, Math.PI/2);
    }
    // ── enforcer: broad riot shield + reinforced visor ───────────
    if (type === 'enforcer') {
        const shMat = new BABYLON.StandardMaterial('enforcerShield_' + Math.random(), scene);
        shMat.diffuseColor  = new BABYLON.Color3(0.10, 0.14, 0.20);
        shMat.emissiveColor = new BABYLON.Color3(0.05, 0.45, 0.55);
        shMat.alpha = 0.6; shMat.backFaceCulling = false;
        const shield = BABYLON.MeshBuilder.CreateBox('enfShield', { width: 0.10, height: 1.3, depth: bD*1.3 }, scene);
        shield.position.set(0, bY, bD*0.55);
        shield.material = shMat; shield.parent = g; shield.isPickable = true;
        shield.metadata = { enemy: true };
        addTorus('enfShieldRim', 0.05, 0.02, M.ledCyan, 0, bY+bH*0.45, bD*0.55+0.05);
        addBox('visorBar', hW*0.9, 0.06, 0.05, M.ledCyan, 0, hY, hW*0.42);
    }
    // ── tactician: scope antenna + tactical data-pack ────────────
    if (type === 'tactician') {
        addCyl('antenna', 0.025, 0.42, M.gunMetal, 0, hY + hH*0.55, -hD*0.1, 0);
        addSphere('antennaTip', 0.05, M.ledGreen, 0, hY + hH*0.55 + 0.21, -hD*0.1);
        addBox('dataPack', bW*0.7, bH*0.34, 0.14, M.gunMetal, 0, bY + bH*0.10, -bD*0.62);
        addSphere('packLight', 0.04, M.ledGreen, 0, bY + bH*0.10, -bD*0.62 - 0.08);
    }
    if (type === 'giantbot') {
      addBox('core', bW * 0.6, bH * 0.4, bD * 1.5, M.ledOrange, 0, bY, bD * 0.2);
      
      // Muscular Arms
      const armL = addBox('armL', 0.45, 1.4, 0.45, bmat, bW/2 + 0.35, bY + 0.2, 0);
      const armR = addBox('armR', 0.45, 1.4, 0.45, bmat, -bW/2 - 0.35, bY + 0.2, 0);
      
      // Textured Cannons mounted to arms
      addCyl('shL', 0.5, 2.2, M.rustWall,  bW/2 + 0.4, bY + bH/2 + 0.1, 0.4, Math.PI/2);
      addCyl('shR', 0.5, 2.2, M.rustWall, -bW/2 - 0.4, bY + bH/2 + 0.1, 0.4, Math.PI/2);
      
      // Scary Horns/Spikes instead of a flat crown
      for (let i = -1; i <= 1; i += 2) {
          addCyl('horn' + i, 0.15, 0.9, M.ledRed, i * 0.4, hY + hH/2 + 0.3, -0.1, -Math.PI/5);
      }
    } else if (type === 'ninja') {
        // Glowing Katana on the right arm
        addBox('katana_blade', 0.02, 1.2, 0.08, M.ledCyan, bW/2+aW+0.05, bY+bH*.3, 0.4);
        addBox('katana_hilt', 0.04, 0.3, 0.10, M.black, bW/2+aW+0.05, bY+bH*.1, 0.1);
    } else if (type === 'armored') {
      // Main body
      addBox('body', bW, bH, bD, bmat, 0, bY, 0);
      addBox('hd', hW, hH, hD, bmat, 0, hY, 0);
      addBox('vis', hW*.78, .14, hW*.18, led, 0, hY, hW*.38);
      
      // Semi-transparent directional shield in front
      const shieldGeom = BABYLON.MeshBuilder.CreateBox('shieldVis', {
          width: 0.12, height: 1.6, depth: 0.9
      }, scene);
      shieldGeom.position.set(-bW*0.25, bY, bD*0.25);
      
      const shieldMat = new BABYLON.StandardMaterial('shieldArmor_' + Math.random(), scene);
      shieldMat.diffuseColor = new BABYLON.Color3(0.1, 0.3, 0.6);
      shieldMat.emissiveColor = new BABYLON.Color3(0.15, 0.5, 0.9);
      shieldMat.alpha = 0.4;
      shieldMat.specularColor = new BABYLON.Color3(0.6, 0.7, 0.9);
      shieldMat.specularPower = 96;
      shieldMat.backFaceCulling = false;
      shieldGeom.material = shieldMat;
      shieldGeom.parent = g;
      shieldGeom.isPickable = true;
      shieldGeom.metadata = { enemy: true, shield: true };
      
      // Store shield reference on the enemy object
      const shieldRef = shieldGeom;
      
      // Add a subtle glow ring around the shield edge
      const ringGeom = BABYLON.MeshBuilder.CreateTorus('shieldEdge', {
          diameter: 1.0, thickness: 0.05, tessellation: 16
      }, scene);
      ringGeom.position.copyFrom(shieldGeom.position);
      ringGeom.position.x -= 0.06;
      ringGeom.material = M.ledCyan;
      ringGeom.parent = g;
      ringGeom.isPickable = false;
      
      // Pulse animation for the shield
      shieldRef._pulseAnim = true;
      
      // Pistol on the right arm
      const wm = makeScaledWeaponModel('PISTOL', 0.6); wm.parent = g;
      wm.position.set(bW/2+aW/2, bY+bH*.18-.02, .42);
  }
    
    addBox('body', bW, bH, bD, bmat, 0, bY, 0);
    addBox('pan', bW*.55, bH*.38, .06, bmat, 0, bY, bW*.28);
    addSphere('glow', .08, led, 0, bY+.05, bW*.31);
    for (const s of [-1, 1]) { addBox('leg'+s, lW, lH, lW*1.2, bmat, s*(bW/2-.12), .22, 0); addBox('ft'+s, fL, fH, fL*1.1, bmat, s*(bW/2-.12), .03, .06); }
    addBox('hd', hW, hH, hD, bmat, 0, hY, 0);
    addBox('vis', hW*.78, .14, hW*.18, led, 0, hY, hW*.38);
    addBox('aL', aW, aW, aL, bmat,  bW/2+aW/2, bY+bH*.18, -aL*.1);
    addBox('aR', aW, aW, aL, bmat, -bW/2-aW/2, bY+bH*.18, -aL*.1);

    // ── Grenadier-specific extra geometry ──────────────────────────────
    if (type === 'grenadier') {
      // Ammo drum backpack — wide cylinder on the back
      addCyl('pack', .34, .48, bmat,  0, bY + bH*.15, -bD*.9, 0);
      // Two visible grenade rounds clipped to the drum
      addCyl('rnd1', .10, .22, M.ledGreen,  .13, bY + bH*.30, -bD*.9 - .05, Math.PI/2);
      addCyl('rnd2', .10, .22, M.ledGreen, -.13, bY + bH*.30, -bD*.9 - .05, Math.PI/2);
      // Over-shoulder launcher tube on the right arm
      addCyl('ltube', .12, .64, M.gunMetal, bW/2 + aW + .08, bY + bH*.30, .18, Math.PI/2);
      // Muzzle cap
      addCyl('lmuz', .16, .05, M.black,     bW/2 + aW + .08, bY + bH*.30, .52, Math.PI/2);
      // Green hazard stripe across the chest
      addBox('stripe', bW*.90, .06, .04, M.ledGreen, 0, bY + bH*.38, bD*.52);
    }
    const wn = type==='heavy'?'CHAINGUN' : type==='sniper'?'RAILGUN' : type==='pistol'?'PISTOL' : type==='shotgun'?'SHOTGUN' : type==='rocket'?'ROCKET' : type==='grenadier'?'GLAUNCHER' : type==='rivet_bot'?'RIVETER' : type==='enforcer'?'PHALANX' : type==='tactician'?'AEGIS' : type==='burst_bot'?'COMET' : type==='dmr_bot'?'DMR' : 'SMG';
    const ws = type==='heavy'?.62 : type==='sniper'?.50 : type==='pistol'?.44 : type==='shotgun'?.54 : type==='rocket'?.56 : type==='grenadier'?.56 : type==='rivet_bot'?.58 : type==='enforcer'?.60 : type==='tactician'?.48 : type==='burst_bot'?.50 : type==='dmr_bot'?.52 : .50;
    const wm = makeScaledWeaponModel(wn, ws); wm.parent = g;
    wm.position.set(bW/2+aW/2, bY+bH*.18-.02, .42); wm.rotation.y = 0;
    wm.getChildMeshes().forEach(c => { c.isPickable = false; });
  }

  const stat = {
    scout:   { hp:55,  maxHp:55,  spd:5.5, dmg:4,  range:26, rate:0.55,  pt:'bullet',  pv:26, score:100, mOY:1.0 }, // High RoF, low damage
    heavy:   { hp:200, maxHp:200, spd:1.2, dmg:12, range:24, rate:0.25, pt:'heavy',   pv:55, score:260, mOY:1.35 },     // Slow move, VERY high RoF
    sniper:  { hp:30,  maxHp:30,  spd:2.8, dmg:60, range:48, rate:5.0,  pt:'sniper',  pv:40, score:210, mOY:1.0 },     // Massive damage, slow RoF
    drone:   { hp:48,  maxHp:48,  spd:6.0, dmg:7,  range:22, rate:0.6,  pt:'plasma',  pv:24, score:155, mOY:0.5 }, // Balanced
    pistol:  { hp:30,  maxHp:30,  spd:4.2, dmg:7,  range:22, rate:0.65, pt:'bullet',  pv:22, score:70,  mOY:1.0 }, // Balanced
    shotgun: { hp:80,  maxHp:80,  spd:6.0, dmg:18, range:18, rate:1.1, pt:'shotgun', pv:18, score:140, mOY:1.0 },
    rocket:  { hp:120, maxHp:120, spd:2.0, dmg:40, range:28, rate:2.2, pt:'rocket',  pv:14, score:200, mOY:1.1 },
    giantbot:  { hp: 1500, maxHp: 1500, spd: 1.8, dmg: 45, range: 40, rate: 1.5, pt: 'rocket', pv: 20, score: 5000, mOY: 2.5, railgunImmune: true },
    electron_bot: { hp: 60, maxHp: 60, spd: 3.5, dmg: 15, range: 40, rate: 0.3, pt: 'electron', pv: 48, score: 160, mOY: 1.0 },
    ion_sniper:   { hp: 45,  maxHp: 45,  spd: 3.0, dmg: 45, range: 50, rate: 2.0, pt: 'ion', pv: 120, score: 200, mOY: 1.0 },
    grenadier: { hp:45, maxHp:45, spd:3.2, dmg:65, range:40, rate:2.5, pt:'grenade', pv:22, score:160, mOY:1.0 },
    ninja:     { hp:40, maxHp:40, spd:10, dmg:45, range:3.0, rate:0.8, pt:'melee', pv:0, score:150, mOY:1.0 },
    armored:   { hp:150, maxHp:150, spd:2.8, dmg:15, range:25, rate:0.8, pt:'heavy', pv:45, score:220, mOY:1.0 },
    medic_bot:   { hp:35, maxHp:35, spd:3.5, dmg:5,  range:20, rate:1.2, pt:'plasma', pv:20, score:130, mOY:1.0},
    shield_bot:  { hp:150, maxHp:150, spd:2.0, dmg:12, range:25, rate:0.8, pt:'heavy', pv:45, score:200, mOY:1.0},
    teleport_bot:{ hp:25, maxHp:25, spd:7.0, dmg:18, range:8, rate:0.4, pt:'melee', pv:0, score:160, mOY:1.0},
    swarm_host:  { hp:300, maxHp:300, spd:0, dmg:0, range:0, rate:0, pt:'none', pv:0, score:300, mOY:1.5},
    rivet_bot: { hp:95,  maxHp:95,  spd:3.2, dmg:16, range:24, rate:1.0, pt:'heavy',   pv:30, score:170, mOY:1.0 },
    enforcer:  { hp:165, maxHp:165, spd:2.1, dmg:13, range:16, rate:0.9, pt:'shotgun', pv:16, score:210, mOY:1.0 },
    tactician: { hp:50,  maxHp:50,  spd:3.4, dmg:26, range:42, rate:1.6, pt:'sniper',  pv:46, score:190, mOY:1.0 },
    burst_bot: { hp: 70, maxHp: 70, spd: 4.8, dmg: 14, range: 45, rate: 0.8, pt: 'bullet', pv: 35, score: 110, mOY: 1.0 },
    dmr_bot:   { hp: 40, maxHp: 40, spd: 3.5, dmg: 35, range: 40, rate: 2.0, pt: 'sniper', pv: 70, score: 130, mOY: 1.0 },
  }[type] || {};

  return {
    group: g, type, alive: true,
    hp: stat.hp, maxHp: stat.maxHp,
    speed: stat.spd, dmg: stat.dmg,
    range: stat.range, rate: stat.rate,
    projT: stat.pt, projV: stat.pv,
    score: stat.score,
    atkTimer: Math.random() * stat.rate,
    animT: Math.random() * 10,
    flyH: sc.flyH,
    muzzleOffY: stat.mOY || 1.0,
    _arrowNode: null, _arrowMat: null,
    _stuckTimer: 0,           // how long we've been stuck
    _stuckAngle: 0,           // random steering angle while stuck
  };
}

// ── Curated walkable spawn positions (Expanded for 5 Tiers & Kept away from walls) ───────
// Default set (used as the base for all maps unless overridden)
const DEFAULT_WALKABLE_SPAWNS = [
  // TIER 1: Main Floor (y = 0) — kept well clear of all centre walls
  [-30, 0,  30], [ 30, 0,  30], [-30, 0, -30], [ 30, 0, -30], // Far corners
  [-22, 0,   0], [ 22, 0,   0], [  0, 0,  26], [  0, 0, -26], // Mid-points (shifted from ±20/±20 to avoid wall proximity)

  // TIER 2: Mezzanine (y = 6)
  [-34, 6,  34], [ 34, 6,  34], [-34, 6, -34], [ 34, 6, -34],

  // TIER 3: Sniper Decks (y = 12)
  [  0, 12,  38], [-18, 12,  38], [ 18, 12,  38], // North Deck
  [  0, 12, -38], [-18, 12, -38], [ 18, 12, -38], // South Deck
  // T3 Side flanks (new geometry)
  [-36, 12,  10], [-36, 12, -10],                  // West flank
  [ 36, 12,  10], [ 36, 12, -10],                  // East flank

  // TIER 4: Corridor (y = 18) — x=0 keeps bots safely in the centre, away from walls at x=±12
  [ 0, 18,  20], [ 0, 18,  8], [ 0, 18, -8], [ 0, 18, -20],

  // TIER 5: The Summit (y = 24)
  // Moved to South platform (z = -16) to keep the North safe room strictly for players
  //[ 0, 24, -16], [-4, 24, -16], [ 4, 24, -16],
];

const MIN_SPAWN_DIST = 16; // Reduced so valid spawns actually work

export function spawnBot(type, _x, _spawnY, _z, scale = 1.0) {
  //console.log(`Attempting to spawn ${type} at ${_x}, ${_spawnY}, ${_z}`); 
  const mapId = getCurrentMap();
  let validSpawns = getWalkableSpawns(mapId); 
  if (type === 'giantbot') {
    validSpawns = validSpawns.filter(sp => sp[1] === 0);
  }
  const shuffled = validSpawns.slice().sort(() => Math.random() - 0.5);
  
  // Actually respect the passed-in Y coordinate as our fallback
  let px = _x, pz = _z, py = (_spawnY !== undefined) ? _spawnY : 0;
  
  for (const [cx, cy, cz] of shuffled) {
    const dx = cx - camera.position.x, dz = cz - camera.position.z;
    if (dx * dx + dz * dz >= MIN_SPAWN_DIST * MIN_SPAWN_DIST) {
      px = cx + (Math.random() - 0.5) * 2.0; 
      py = cy;
      pz = cz + (Math.random() - 0.5) * 2.0;
      break;
    }
  }
  const e = buildRobot(type);
  let hpMod = scale;
  let dmgMod = scale;
  let speedMod = scale;
    
  if (player.hardMode) {
    hpMod *= 1.3;
    dmgMod *= 1.2;
    speedMod *= 1.5;
    e.score *= 2; 
  }

  e.hp = Math.round(e.hp * hpMod); 
  e.maxHp = Math.round(e.maxHp * hpMod);
  e.dmg = Math.round(e.dmg * dmgMod);
  if (type === 'ninja') {
    e.speed = e.speed * speedMod;
  } else {
    e.speed = e.speed * speedMod * (0.85 + 0.15 * Math.min(scale, 2.0));
  }
  
  e._yaw = Math.random() * Math.PI * 2;
  e._wanderAngle = 0;
  e._wanderTimer = Math.random() * 2.5;
  e.speed *= 0.9 + Math.random() * 0.2; 
  if (type === 'giantbot') {
      e.group.scaling.set(3, 3, 3);
  }

  const rawSpawn = new BABYLON.Vector3(px, py + (e.flyH > 0 ? e.flyH : 0) + 0.5, pz);
  const snapped  = navPlugin.getClosestPoint(rawSpawn);
  if (snapped) {
    // Defense: If the dummy plugin just returned our exact query, remove the 0.5 height offset
    if (Math.abs(snapped.y - rawSpawn.y) < 0.001 && Math.abs(snapped.x - rawSpawn.x) < 0.001) {
        snapped.y -= 0.5;
    }
    px = snapped.x;
    py = snapped.y;
    pz = snapped.z;
    
    const dirs = [new BABYLON.Vector3(1,0,0), new BABYLON.Vector3(-1,0,0), new BABYLON.Vector3(0,0,1), new BABYLON.Vector3(0,0,-1)];
    for (const d of dirs) {
        const r = new BABYLON.Ray(new BABYLON.Vector3(px, py + 0.5, pz), d, 0.6);
        const h = scene.pickWithRay(r, m => m.checkCollisions && !m.metadata?.enemy && m.isEnabled());
        if (h?.hit) {
            px -= d.x * (0.6 - h.distance);
            pz -= d.z * (0.6 - h.distance);
        }
    }
  }

  e.group.position.set(px, py + (e.flyH > 0 ? e.flyH : 0), pz);
  
  if (isAngryMode()) { e.dmg = Math.round(e.dmg * 1.6); e.speed *= 1.5; e.score *= 2; _addRedArrow(e); }
  enemies.push(e);
  rebuildMeshMap();
}

export function hitRobot(e, dmg, isHeadshot = false, isExplosive = false, source = 'PLAYER') {
  if (!e.alive) return;

  // Railgun fires 9999 – cap it for boss-tier enemies so they need multiple shots - currently capped at 20% HP
  if (BOSS_TYPES.has(e.type) && dmg > e.maxHp * 0.20) {
    dmg = Math.round(e.maxHp * 0.20);
  }
  let actualDmg = Math.min(dmg, e.hp); // clamp so overkill doesn't inflate totals

  if (e.type === 'armored' || e.type === 'shield_bot') {
    const W = WDEFS[curWep];
    const isEnergy = W.useHeat || (curWep === 'PLASMA' && W.ammo === Infinity) || curWep === 'RAILGUN';
    const hasBypass = curWep === 'AEGIS' && getLoadout('AEGIS').attachments?.special === 'bypass_algorithms';
    
    // Check if player is behind the shield (shooting from the side/back)
    const toPlayer = camera.position.subtract(e.group.position);
    const botForward = new BABYLON.Vector3(Math.sin(e._yaw), 0, Math.cos(e._yaw));
    const dotProduct = BABYLON.Vector3.Dot(toPlayer.normalize(), botForward);
    
    if (dotProduct > 0 && !isEnergy && !hasBypass) {
        // Player is in front of shield and not using energy weapon - 50% damage reduction
        actualDmg = Math.round(actualDmg * 0.50);
        
        // Visual feedback - flash shield
        const shieldMesh = e.group.getChildMeshes().find(m => m.name.includes('shieldVis'));
        if (shieldMesh?.material) {
            shieldMesh.material.alpha = 0.8;
            setTimeout(() => { 
                if (shieldMesh?.material) shieldMesh.material.alpha = 0.4; 
            }, 150);
        }
    } else if (isEnergy) {
        // Energy weapons bypass the shield completely - full damage
        // No reduction applied
    }
}

  recordDamage(curWep, actualDmg);
  e.hp -= actualDmg;
  if (cb.showHitMarker) cb.showHitMarker();
  sfx.hit();
  // EMP rounds check
  import('./progression.js').then(({ getLoadout }) => {
      if (getLoadout(curWep).attachments?.special === 'emp_rounds' && Math.random() < 0.15 && e && e.alive) {
          e._empStunned = 1.0;
          
          sfx.plasma();
          spawnSparks(e.group.position.clone(), 0xffff00, 12);
          
          let shocksFired = 0;
          const shockInterval = setInterval(() => {
              // Ensure enemy still exists and hasn't been disposed
              if (e && e.group && !e.group.isDisposed() && e.alive && e._empStunned > 0) {
                  // Using camera.position instead of player.position
                  createYellowEMPStunArc(camera.position, e.group.position, scene);
                  shocksFired++;
              } else {
                  clearInterval(shockInterval);
              }

              if (shocksFired >= 5) clearInterval(shockInterval);
          }, 150);

          import('./progression.js').then(({ recordEmpStun }) => recordEmpStun());
      }
  });
 
  if (e.hp <= 0) destroyRobot(e, isHeadshot, isExplosive, source);
}

export function destroyRobot(e, isHeadshot = false, isExplosive = false, source = 'PLAYER') {
  e.alive = false;
  if (e._arrowNode) { e._arrowNode.getChildMeshes().forEach(m => m.dispose()); e._arrowNode.dispose(); }

  // ── Capture kill context NOW (synchronously) before any async/microtask delay ──
  // Reading curWep via the live ES-module binding is always instant and accurate.
  // The old pattern used nested dynamic imports (2 microtask ticks) so curWep
  // could have changed by the time recordKill ran — e.g. shotgun kill credited to SMG.
  const _killedWithWeapon  = curWep;
  const _killedWhileAir    = !player.onGround;
  const _killedWhileScoped = !!player.isScoped;
  
  // ── 1. RAYCAST: Find the floor beneath the dying bot using intersectsMesh
  //    (pickWithRay skips isPickable=false meshes, which all our floors are)
  const dropRay = new BABYLON.Ray(e.group.position, new BABYLON.Vector3(0, -1, 0), 120);
  let _closestDist = Infinity, _closestPt = null;
  for (const m of scene.meshes) {
    if (!m.isEnabled() || !m.checkCollisions || m.metadata?.enemy) continue;
    const info = dropRay.intersectsMesh(m, false);
    if (info.hit && info.distance < _closestDist) {
      _closestDist = info.distance;
      _closestPt   = info.pickedPoint;
    }
  }
  
  // Create our loot drop position
  const pos = e.group.position.clone();
  if (_closestPt) {
    pos.y = _closestPt.y + 0.5; // Snap loot to floor below
  } else {
    pos.y = 0.6; // Fallback to near ground if nothing found
  }

  spawnSparks(pos, 0xff8844, 16);
  sfx.robotDie();
  e.group.getChildMeshes().forEach(m => m.dispose());
  e.group.dispose();
  rebuildMeshMap();

  // ── 2. APPLY DOUBLE SCORE BUFF ──────────────────────────────
  let pointsToAward = e.score;
  const _doubleXp = (player.buffs?.double_score || 0) > 0; // ← capture NOW, before async
  if (_doubleXp) pointsToAward *= 2;
  player.score += pointsToAward;

  // ── 3. PROGRESSION: XP + kill tracking ──────────────────────
  import('./progression.js').then(({ awardXp, recordKill, XP_GRANTS, hasEnergyCoil }) => {
    const xpKey = 'kill' + e.type.charAt(0).toUpperCase() + e.type.slice(1);
    const xp    = XP_GRANTS[xpKey] ?? XP_GRANTS.killScout;
    const xpMult = _doubleXp ? 2 : 1;           // ← same flag, safe in closure
    awardXp(xp * xpMult);
    recordKill(e.type, _killedWithWeapon, {
      isJumping: _killedWhileAir,
      isScoped:  _killedWhileScoped,
      xpMult,                                    // ← passed through for weapon XP
      isHeadshot: isHeadshot,
      isExplosiveKill: isExplosive,
      source: source,
    });

    // ── Energy Coil: headshot kills on ION vent 40% heat ──────
    if (isHeadshot && _killedWithWeapon === 'ION' && hasEnergyCoil()) {
      player.wepHeat = Math.max(0, (player.wepHeat || 0) - 0.40);
    }
  });

  _totalKills++;
  _roundKills++;
  // Trigger Cosmic skin radiant flare if currently equipped on active weapon
    import('./progression.js').then(({ getLoadout }) => {
        const loadout = getLoadout();
        if (loadout[curWep]?.skin === 'cosmic') {
            import('./weapons.js').then(({ triggerCosmicGlow }) => triggerCosmicGlow());
        }
    });
  
  const names = 
  { scout:'Scout destroyed!',heavy:'Heavy down!',sniper:'Sniper eliminated!',drone:'Drone shot down!',pistol:'Pistol bot down!',shotgun:'Shotgunner destroyed!',
    rocket:'Rocket bot destroyed!',grenadier:'Grenadier down!',electron_bot:'Electron Bot destroyed!',ion_sniper:'Ion Sniper eliminated!',
    giantbot: '★ BOSS DEFEATED! ★', ninja: 'Ninja bot vanquished!', armored: 'Armored bot cracked!',
    medic_bot: 'Medic bot neutralised!', shield_bot: 'Shield bot breached!', teleport_bot: 'Teleport bot phased out!', swarm_host: 'Swarm host eliminated!',
    rivet_bot: 'Rivet bot dismantled!', enforcer_bot: 'Enforcer bot taken down!', tactician: 'Tactician bot destroyed!',
};
  const feed = document.getElementById('killFeed');
  if (feed) { 
      feed.textContent = (names[e.type] || 'Robot destroyed!') + (_angryMode ? ' [ENRAGED]' : ''); 
      clearTimeout(feed._t); 
      feed._t = setTimeout(() => feed.textContent = '', 2200); 
  }

  import('./pickups.js').then(({ spawnPickup, spawnWeaponDrop, spawnPowerup, spawnTypedPickup }) => {
   // --- EPIC BOSS LOOT EXPLOSION ---
    if (e.type === 'giantbot') {
        const pTypes = ['quad_damage', 'infinite_ammo', 'haste', 'double_score'];
        const pt = pTypes[Math.floor(Math.random() * pTypes.length)];
        spawnPowerup(pos, pt);
        spawnPickup(pos.add(new BABYLON.Vector3(0, 0,  1.5)));
        spawnPickup(pos.add(new BABYLON.Vector3(0, 0, -1.5)));
        // Build wonder weapon pool
        const wonderWeapons = ['THUNDERBOLT', 'SINGULARITY', 'PYROCLAST'];
        // Check if OMEGA_STORM is unlocked
        if (isWonderWeaponUnlocked('OMEGA_STORM')) {
            wonderWeapons.push('OMEGA_STORM');
        }
        const randomWW = wonderWeapons[Math.floor(Math.random() * wonderWeapons.length)];
        spawnWeaponDrop(pos, randomWW);
        return;
    } else if (e.type === 'ninja') {
      // --- FIXED DROPS ---
      spawnTypedPickup(pos.add(new BABYLON.Vector3( 0.6, 0, 0)), 'ammo');
      spawnTypedPickup(pos.add(new BABYLON.Vector3(-0.6, 0, 0)), 'armor');
      return;
    } else if (e.type === 'swarm_host') {
        spawnTypedPickup(pos.add(new BABYLON.Vector3( 0.6, 0,  0.6)), 'health');
        spawnTypedPickup(pos.add(new BABYLON.Vector3(-0.6, 0, -0.6)), 'armor');
        spawnTypedPickup(pos.add(new BABYLON.Vector3( 0,   0,  0.8)), 'ammo');
        return;
    } else {
      // --- NORMAL BOT LOOT ---
      if (e.type === 'medic_bot') {
        spawnTypedPickup(pos, 'health'); // Adds to standard drops for Medic bot
        }
      // 5% chance to drop a rare Powerup
      if (Math.random() < 0.05) { 
        const pTypes = ['quad_damage', 'infinite_ammo', 'haste', 'double_score'];
        const pt = pTypes[Math.floor(Math.random() * pTypes.length)];
        spawnPowerup(pos, pt);
      } 
      // Independent 30% chance to drop Health/Armor/Ammo
      if (Math.random() < 0.3) {
        spawnPickup(pos);
      }
      
      // ALWAYS drop the robot's standard weapon to prevent soft locks
      const dropWep = ROBOT_DROPS[e.type];
      if (dropWep) spawnWeaponDrop(pos, dropWep);

      // Crossbow Bolt Recovery Mechanic (Independent roll)
      if (curWep === 'CROSSBOW') {
          import('./progression.js').then(({ hasBoltRecovery }) => {
              // 10% base chance to recover a bolt, 60% if the attachment is equipped
              const recoveryChance = (typeof hasBoltRecovery === 'function' && hasBoltRecovery()) ? 0.60 : 0.10;
              
              if (Math.random() < recoveryChance) {
                  // Offset the bolt drop slightly so it doesn't perfectly overlap the standard weapon drop
                  const offsetPos = pos.add(new BABYLON.Vector3((Math.random() - 0.5) * 1.5, 0, (Math.random() - 0.5) * 1.5));
                  spawnWeaponDrop(offsetPos, 'CROSSBOW');
              }
          });
      }
    }
  });
  cb.markHudDirty?.();
}

// ── Reusable temporaries ──────────────────────────────────────
const _ePP     = new BABYLON.Vector3();
const _eMuzzle = new BABYLON.Vector3();
const _eDir    = new BABYLON.Vector3();
const _eSep    = new BABYLON.Vector3();
const _eLookAt = new BABYLON.Vector3();
const _eTry    = new BABYLON.Vector3();
const _STEER   = [0, Math.PI/4, -Math.PI/4, Math.PI/2, -Math.PI/2, (3*Math.PI)/4, -(3*Math.PI)/4, Math.PI];
const _STEER_SCOUT = [0, Math.PI/6, -Math.PI/6, Math.PI/3, -Math.PI/3, Math.PI/2, -Math.PI/2, (2*Math.PI)/3, -(2*Math.PI)/3, Math.PI];

function _rotY(v, a) { const c=Math.cos(a),s=Math.sin(a),nx=v.x*c-v.z*s,nz=v.x*s+v.z*c; v.x=nx; v.z=nz; }

// ── Off-navmesh leash ─────────────────────────────────────────
// Knockback (Phalanx / Thermal Backfire) and failed hop landings both
// skip the normal navmesh-clamped move, so a grounded bot can end up off
// the walkable mesh entirely with nothing to bring it back. If it sits
// >2.5u off the nearest navmesh point for over a second, snap it home.
// Skipped while genuinely mid-hop/jump, and for drones (handled below).
function _leashToNavmesh(e, dt) {
  if (e.flyH > 0 || e._hopY > 0) { e._leashTimer = 0; return; }
  const probe = new BABYLON.Vector3(e.group.position.x, e._floorY + 1.0, e.group.position.z);
  const safe = navPlugin.getClosestPoint(probe);
  const off = safe ? Math.hypot(safe.x - probe.x, safe.z - probe.z) : Infinity;
  e._leashTimer = off > 2.5 ? (e._leashTimer || 0) + dt : 0;
  if (e._leashTimer <= 1.0) return;
  if (safe) {
    e.group.position.x = safe.x; e.group.position.z = safe.z; e._floorY = safe.y;
  } else {
    e.group.position.x = 0; e.group.position.z = 0; e._floorY = 0; // last resort: map centre
  }
  e._hopY = 0; e._yVel = 0; e._leashTimer = 0;
}

export function updateEnemies(dt) {
  _tickTimers(dt);
  _ePP.copyFrom(camera.position);

  for (const e of enemies) {
    if (!e.alive) continue;
    // Process DOT effects (Flamethrower burns) and show burning visual
    if (e._dots && e._dots.length > 0) {
        for (let i = e._dots.length - 1; i >= 0; i--) {
            const dot = e._dots[i];
            e.hp -= dot.dmg * dt;
            dot.remaining -= dt;
            if (dot.remaining <= 0) {
                e._dots.splice(i, 1);
            }
        }
        
        // Create/update burning visual effect
        if (!e._burnMeshes) {
            e._burnMeshes = [];
            e._burnTimer = 0;
            
            // Create 3-5 small flame sprites around the enemy
            const flameCount = 5;
            const mat = new BABYLON.StandardMaterial('burnMat_' + e.group.name, scene);
            mat.diffuseTexture = fireTex;          // use the texture directly, not a material
            mat.emissiveTexture = fireTex;
            mat.emissiveColor = new BABYLON.Color3(0.5, 0.2, 0);
            mat.disableLighting = true;
            mat.alpha = 0.85;
            mat.useAlphaFromDiffuseTexture = true;
            mat.backFaceCulling = false;
            
            for (let i = 0; i < flameCount; i++) {
                const flame = BABYLON.MeshBuilder.CreatePlane('burnFlame_' + i, {
                    width: 0.3 + Math.random() * 0.3,
                    height: 0.5 + Math.random() * 0.4
                }, scene);
                flame.material = mat;
                flame.parent = e.group;
                flame.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
                flame.isPickable = false;
                
                // Random position around the enemy
                const angle = (i / flameCount) * Math.PI * 2 + Math.random();
                const radius = 0.5 + Math.random() * 0.5;
                flame.position.x = Math.cos(angle) * radius;
                flame.position.y = 0.5 + Math.random() * 0.8;
                flame.position.z = Math.sin(angle) * radius;
                
                // Store animation data
                flame._burnData = {
                    baseX: flame.position.x,
                    baseY: flame.position.y,
                    baseZ: flame.position.z,
                    speed: 2 + Math.random() * 4,
                    offset: Math.random() * Math.PI * 2,
                    scaleSpeed: 3 + Math.random() * 4
                };
                
                e._burnMeshes.push(flame);
            }
            
            // Also add an orange point light for glow
            e._burnLight = new BABYLON.PointLight('burnLight_' + e.group.name, e.group.position.clone(), scene);
            e._burnLight.diffuse = new BABYLON.Color3(1, 0.5, 0.1);
            e._burnLight.intensity = 0.5;
            e._burnLight.range = 3;
        }
        
        // Animate the burn effect
        e._burnTimer += dt;
        
        if (e._burnMeshes) {
            for (const flame of e._burnMeshes) {
                if (!flame || flame.isDisposed()) continue;
                const bd = flame._burnData;
                
                // Flicker scale
                const flicker = 0.7 + Math.sin(e._burnTimer * bd.scaleSpeed + bd.offset) * 0.3;
                flame.scaling.set(flicker, flicker * (1 + Math.random() * 0.3), 1);
                
                // Bob up and down
                flame.position.y = bd.baseY + Math.sin(e._burnTimer * bd.speed + bd.offset) * 0.3;
                
                // Slight horizontal drift
                flame.position.x = bd.baseX + Math.cos(e._burnTimer * bd.speed * 0.7) * 0.2;
                
                // Rotate for variety
                flame.rotation.z += dt * (1 + Math.random());
            }
            
            // Pulse the light
            if (e._burnLight) {
                e._burnLight.intensity = 0.3 + Math.sin(e._burnTimer * 8) * 0.3;
                e._burnLight.position.copyFrom(e.group.position);
            }
        }
        
        if (e.hp <= 0) {
            destroyRobot(e, false);
            continue;
        }
    } else {
        // Clean up burn visual when DOT expires
        if (e._burnMeshes) {
            for (const flame of e._burnMeshes) {
                if (flame && !flame.isDisposed()) flame.dispose();
            }
            e._burnMeshes = null;
            if (e._burnLight) {
                e._burnLight.dispose();
                e._burnLight = null;
            }
        }
    }

    // Process POISON effects (Crossbow Coated Tips)
    if (e._poisonDots && e._poisonDots.length > 0) {
        let totalDps = 0;
        for (let i = e._poisonDots.length - 1; i >= 0; i--) {
            const dot = e._poisonDots[i];
            totalDps += dot.dps;
            dot.remaining -= dt;
            if (dot.remaining <= 0) e._poisonDots.splice(i, 1);
        }
        
        if (totalDps > 0) {
            e.hp -= totalDps * dt;
            
            // Visual green aura effect (avoids shared material conflicts)
            if (!e._poisonAura) {
                e._poisonTimer = 0;
                const mat = new BABYLON.StandardMaterial('poisonMat_' + e.group.name, scene);
                mat.emissiveColor = new BABYLON.Color3(0.1, 0.9, 0.1);
                mat.alpha = 0.45;
                mat.disableLighting = true;
                
                e._poisonAura = BABYLON.MeshBuilder.CreateSphere('poisonAura', {diameter: 1.6, segments: 8}, scene);
                e._poisonAura.material = mat;
                e._poisonAura.parent = e.group;
                e._poisonAura.position.y = e.flyH > 0 ? 0.5 : 1.0;
                e._poisonAura.isPickable = false;
            }
            
            // Pulse the aura
            e._poisonTimer += dt;
            const pulse = 1.0 + Math.sin(e._poisonTimer * 6) * 0.15;
            if (e._poisonAura) e._poisonAura.scaling.setAll(pulse);
            
            if (e.hp <= 0) {
                destroyRobot(e, false, false, 'POISON');
                continue;
            }
        }
    } else if (e._poisonAura) {
        // Clean up aura when poison expires
        e._poisonAura.dispose();
        e._poisonAura = null;
    }
    // Process Bot Healing
    if (e._hots && e._hots.length > 0) {
        let totalHps = 0;
        for (let i = e._hots.length - 1; i >= 0; i--) {
            const hot = e._hots[i];
            totalHps += hot.hps;
            hot.remaining -= dt;
            if (hot.remaining <= 0) {
                e._hots.splice(i, 1);
            }
        }
        // Only heal and animate if the bot is actually alive and damaged
        if (totalHps > 0 && e.hp < e.maxHp && e.alive) {
            e.hp = Math.min(e.maxHp, e.hp + totalHps * dt);
            
            // Dynamic Glowing Healing Aura Indicator
            if (!e._healAura) {
                e._healTimer = 0;
                const mat = new BABYLON.StandardMaterial('healMat_' + e.group.name, scene);
                mat.emissiveColor = new BABYLON.Color3(0.0, 1.0, 0.35); // Vibrant emerald green
                mat.alpha = 0.35;
                mat.disableLighting = true;
                
                e._healAura = BABYLON.MeshBuilder.CreateSphere('healAura', { diameter: 1.5, segments: 8 }, scene);
                e._healAura.material = mat;
                e._healAura.parent = e.group;
                // Position above floor or adjust for flying bots
                e._healAura.position.y = e.flyH > 0 ? 0.5 : 1.0;
                e._healAura.isPickable = false;
            }
            
            // Animate aura scale pulsing over time
            e._healTimer += dt;
            const pulse = 1.0 + Math.sin(e._healTimer * 8.0) * 0.12;
            if (e._healAura) {
                e._healAura.setEnabled(true);
                e._healAura.scaling.setAll(pulse);
            }
        }
    } else {
        // Hide the aura mesh when no longer receiving healing
        if (e._healAura) {
            e._healAura.setEnabled(false);
        }
    }

    if (window._hazardZones) {
      for (const haz of window._hazardZones) {
        const ex = e.group.position.x, ez = e.group.position.z;
        const halfW = haz.metadata?.halfWidth ?? 0.5;
        const halfD = haz.metadata?.halfDepth ?? 0.5;
        const hx = haz.position.x, hz = haz.position.z, hy = haz.position.y;
        const dy = e.group.position.y - hy;

        // Add a Y check (dy > -1 && dy < 2) so platforms above the lava are safe.
        if (ex > hx - halfW && ex < hx + halfW && ez > hz - halfD && ez < hz + halfD && dy > -1 && dy < 2.5) {
            e.hp -= (haz.metadata?.dps || 5) * dt;
            if (e.hp <= 0) { 
                // Credit the player with an environmental kill!
                import('./progression.js').then(({ recordKill }) => {
                    recordKill(e.type, 'ENVIRONMENT', { xpMult: 1 });
                });
                destroyRobot(e, false); 
                continue; 
          }
        }
      }
    }

    // Initialize physical properties
    if (e._floorY === undefined) e._floorY = e.group.position.y - (e.flyH > 0 ? e.flyH : 0);
    e._hopY = e._hopY || 0;
    e._yVel = e._yVel || 0;
    e._stuckTimer = e._stuckTimer || 0;
    if (e._onPlatform) {
      // Carry bots by the platform's actual displacement; the platform tick
      // runs after enemy AI, so frameDelta is not guaranteed to exist here.
      const platPos = e._onPlatform.position;
      const prev = e._lastPlatformPos || platPos;
      const delta = platPos.subtract(prev);
      e.group.position.addInPlace(delta);
      e._floorY += delta.y;
      e._lastPlatformPos = platPos.clone();
    } else e._lastPlatformPos = null;

    let bob = (e.flyH > 0) ? (e.flyH + Math.sin(e.animT * 1.9) * .18) : (Math.abs(Math.sin(e.animT * 5.8)) * .04);
    
    // Apply EMP stun
    if (e._empStunned > 0) {
        e._empStunned -= dt;
        e.group.position.y = e._floorY + e._hopY + bob + (e._yAnimOffset || 0);
        _eLookAt.set(_ePP.x, e.group.position.y, _ePP.z);
        e.group.lookAt(_eLookAt);
        continue; // Skip movement and attack
    }
    e.animT += dt;
    
    _updateArrow(e);

    const dist = BABYLON.Vector3.Distance(e.group.position, _ePP);
    
    // Calculate Line of Sight (Crucial for vertical behavior)
    _eMuzzle.set(e.group.position.x, e.group.position.y + e.muzzleOffY, e.group.position.z);
    const playerEye = _ePP.clone();

    // Calculate 2D distance (ignoring height)
    const dist2D = Math.sqrt(
      Math.pow(e.group.position.x - _ePP.x, 2) + 
      Math.pow(e.group.position.z - _ePP.z, 2)
    );
    
    // NEW LOGIC: 
    // 1. If I don't have Line of Sight (LOS), I MUST move toward the player (up stairs).
    // 2. If I have LOS, I only move if I'm outside my preferred 2D range.
    const hasLOS = _hasLOS(_eMuzzle, playerEye);

    // Medic bot: cast AoE Heal over Time
    if (e.type === 'medic_bot' && e.alive) {
        if (e.healCooldown === undefined) e.healCooldown = Math.random() * 2; // Slight offset so multiple medics don't sync up perfectly
        e.healCooldown -= dt;
        
        if (e.healCooldown <= 0) {
            e.healCooldown = 5.0; // Casts exactly every 5 seconds
            
            // Spawn green particle splash at caster position
            if (typeof spawnSparks === 'function') spawnSparks(e.group.position, 0x00ff55, 12);
            
            // Apply the reverse DoT effect to all nearby bots within casting range
            for (const ally of enemies) {
                if (ally === e || !ally.alive) continue;
                
                const distToAlly = BABYLON.Vector3.Distance(e.group.position, ally.group.position);
                if (distToAlly < 12.0) {
                    if (!ally._hots) ally._hots = [];
                    // Apply 4 HP/sec over 5 seconds (20 HP total)
                    ally._hots.push({ hps: 4, remaining: 5.0 });
                }
            }
        }
    }

    // Teleport bot: random blink towards the player
    if (e.type === 'teleport_bot' && e.alive) {
        if (e.teleportCooldown === undefined) e.teleportCooldown = Math.random() * 3.0;
        e.teleportCooldown -= dt;

        const distToPlayer = BABYLON.Vector3.Distance(e.group.position, camera.position);
        const attackRange = 12.0; 

        // Only attempt teleporting if outside effective attack range
        if (distToPlayer > attackRange && e.teleportCooldown <= 0) {
            // Step 1: Calculate a randomized target close to the player
            const randomAngle = Math.random() * Math.PI * 2;
            const randomRadius = 2.0 + Math.random() * 4.0; // Scattered 2-6 units from player
            
            const targetDest = camera.position.clone();
            targetDest.x += Math.cos(randomAngle) * randomRadius;
            targetDest.z += Math.sin(randomAngle) * randomRadius;

            // Step 2: Cap the leap distance relative to the bot's current location
            const displacement = targetDest.subtract(e.group.position);
            const maxFlashDistance = 10.0; // Caps single-flash distance
            
            if (displacement.length() > maxFlashDistance) {
                displacement.normalize().scaleInPlace(maxFlashDistance);
                targetDest.copyFrom(e.group.position).addInPlace(displacement);
            }

            // Step 3: Flash FX, execution, and boundary adherence
            if (typeof spawnSparks === 'function') spawnSparks(e.group.position, 0x00ffff, 8);

            e.group.position.copyFrom(targetDest);
            if (navPlugin && navPlugin.getClosestPoint) {
                e.group.position = navPlugin.getClosestPoint(e.group.position); // Clamp safely to NavMesh
            }

            if (typeof spawnSparks === 'function') spawnSparks(e.group.position, 0x00ffff, 8);
            e.teleportCooldown = 4.5; // Reset cooldown
        }
    }

    // Swarm host: spawn map-pool minions
    if (e.type === 'swarm_host' && e.alive) {
        if (!e._activeSummons) e._activeSummons = [];
        // Filter out summons that have died so slots open back up
        e._activeSummons = e._activeSummons.filter(summon => summon.alive);

        // Limit scales proportionally to Wave Number: e.g., 2 summons at wave 10, 4 at wave 20
        const waveNum = typeof currentWave !== 'undefined' ? currentWave : 10;
        const maxSummons = Math.max(1, Math.floor(waveNum / 5));

        if (!e._spawnTimer) e._spawnTimer = 5.0;
        e._spawnTimer -= dt;

        if (e._spawnTimer <= 0 && e._activeSummons.length < maxSummons && enemies.length < 25) {
            e._spawnTimer = 6.0; // Ability cooldown behavior
            
            // Pull enemy types natively from current map pool
            const rawPool = getBossPoolForCurrentMap();
            
            // SAFEGUARD: Filter out 'swarm_host' to prevent infinite nesting
            const safePool = (rawPool || []).filter(type => type !== 'swarm_host');
            
            // Pick a random bot, falling back to 'drone' if the pool is empty
            const botType = safePool.length > 0 ? safePool[Math.floor(Math.random() * safePool.length)] : 'drone';
            
            // Spawn directly next to the swarm host
            const offset = new BABYLON.Vector3((Math.random() - 0.5) * 3.0, 0, (Math.random() - 0.5) * 3.0);
            const spawnX = e.group.position.x + offset.x;
            const spawnY = e.group.position.y;
            const spawnZ = e.group.position.z + offset.z;
            
            const preCount = enemies.length;
            
            // Spawn scaled down at 0.5 size
            spawnBot(botType, spawnX, spawnY, spawnZ, 0.5);
            
            // Configure specific summon attributes if successfully instantiated
            if (enemies.length > preCount) {
                const spawnedBot = enemies[enemies.length - 1];
                if (spawnedBot && spawnedBot.group) {
                    spawnedBot.group.scaling.set(0.5, 0.5, 0.5); // Visually smaller
                    spawnedBot.speed *= 0.65;                    // Reduced movement speed
                    spawnedBot.rate *= 1.8;                      // Higher reload delay = slower attack speed
                }
                e._activeSummons.push(spawnedBot);
            }
            
            // Crucial: Increment global counter so destruction feeds XP/Challenges tracking natively
            _roundEnemies++; 
        }
    }

    // --- 1. BOSS SPECIAL ABILITIES ---
    if (e.type === 'giantbot') {
      // Cooldown timers
      if (e.summonTimer === undefined) e.summonTimer = 30.0;
      if (e.summonRandomTimer === undefined) e.summonRandomTimer = 0;
      if (e._thresholdsTriggered === undefined) {
          e._thresholdsTriggered = { '0.75': false, '0.5': false, '0.25': false };
      }

      // Reduce timers
      e.summonTimer -= dt;
      e.summonRandomTimer -= dt;

      // --- Threshold‑based summon (once per threshold) ---
      const hpPct = e.hp / e.maxHp;
      const thresholds = [0.75, 0.5, 0.25];
      const summonPool = getBossPoolForCurrentMap();
      for (const t of thresholds) {
        const key = t.toString();
        if (hpPct <= t && !e._thresholdsTriggered[key] && enemies.length < 22) {
            e._thresholdsTriggered[key] = true;
            
            // Pick random enemies from the pool
            const bot1 = summonPool[Math.floor(Math.random() * summonPool.length)];
            const bot2 = summonPool[Math.floor(Math.random() * summonPool.length)];

            spawnBot(bot1, e.group.position.x + 3, e.group.position.y, e.group.position.z, 1.0);
            spawnBot(bot2, e.group.position.x - 3, e.group.position.y, e.group.position.z, 1.0);
            _roundEnemies += 2;
        }
      }

      // --- Random summon (every 30s cooldown, only if HP < 75%) ---
      if (e.summonRandomTimer <= 0 && hpPct < 0.75 && enemies.length < 22) {
          e.summonRandomTimer = 30.0;
          const bot1 = summonPool[Math.floor(Math.random() * summonPool.length)];
          const bot2 = summonPool[Math.floor(Math.random() * summonPool.length)];

          spawnBot(bot1, e.group.position.x + 3, e.group.position.y, e.group.position.z, 1.0);
          spawnBot(bot2, e.group.position.x - 3, e.group.position.y, e.group.position.z, 1.0);
          _roundEnemies += 2;
      }
      
      // --- STOMP ---
      if (e._stompTimer === undefined) e._stompTimer = 15.0;
      e._stompTimer -= dt;
      const distToPlayer = BABYLON.Vector3.Distance(e.group.position, camera.position);
      if (e._stompTimer <= 0 && distToPlayer < 12) {
          e._stompTimer = 15.0;
          // Small vertical hop (just animation)
          e._yVel = 6.0;          // temporary jump
          e._hopY = 0.05;
          // Explosion at boss feet
          import('./projectiles.js').then(({ boom }) => {
              boom(e.group.position.clone(), 5.0, 35, true);   // damage bots (if any) & player
          });
      }

      // --- CHARGE ---
      if (e._chargeTimer === undefined) e._chargeTimer = 25.0;
      if (e._chargeActive === undefined) e._chargeActive = false;
      e._chargeTimer -= dt;
      if (e._chargeTimer <= 0 && !e._chargeActive) {
          e._chargeTimer = 25.0;
          e._chargeActive = true;
          e._chargeDuration = 2.0;
          // Temporarily increase speed
          e.speed = e.speed * 2.5;
      }
      if (e._chargeActive) {
          e._chargeDuration -= dt;
          if (e._chargeDuration <= 0) {
              e._chargeActive = false;
              e.speed = e.speed / 2.5;   // reset speed
          }
      }
    }

    // --- 2. MOVEMENT LOGIC ---
      if (e.type === 'drone') {
          const targetY = camera.position.y + 0.5;
          e._floorY += (targetY - e._floorY) * dt * 2.0;
          if (dist > 6.0 || !hasLOS) {
              _eDir.copyFrom(_ePP).subtractInPlace(e.group.position);
              _eDir.y = 0; 
              _eDir.normalize();
              // Separation from other drones
              for (const o of enemies) {
                  if (o === e || !o.alive || o.type !== 'drone') continue;
                  const sep = e.group.position.subtract(o.group.position);
                  const len = sep.length();
                  const _dSepR = 3.5;
                  if (len > 0.01 && len < _dSepR) {
                      sep.normalize().scaleInPlace((_dSepR - len) / _dSepR * 1.4);
                      _eDir.addInPlace(sep);
                  }
              }
              _eDir.normalize();

              // Simple wall avoidance
              const moveDist = e.speed * dt;
              const ray = new BABYLON.Ray(e.group.position, _eDir, moveDist + 0.5);
              const wallHit = scene.pickWithRay(ray, m => m.checkCollisions && !m.metadata?.enemy && m.isEnabled());
              if (wallHit?.hit) {
                const n = wallHit.getNormal();
                const steer = BABYLON.Vector3.Cross(n, BABYLON.Axis.Y).normalize();
                _eDir.copyFrom(steer);    // copy the values instead of reassigning
                // Also push slightly away from wall
                _eDir.addInPlace(n.scale(0.5));
                _eDir.normalize();
              }
              e.group.position.addInPlace(_eDir.scale(e.speed * dt));
              // After moving, snap back to NavMesh if we went through a wall
              /* const dronePos = e.group.position.clone();
              dronePos.y = e._floorY + 0.5;
              const safePos = navPlugin.getClosestPoint(dronePos);
              if (safePos && BABYLON.Vector3.Distance(dronePos, safePos) > 0.5) {
                  // We're too far from the navmesh — probably inside a wall
                  e.group.position.x = safePos.x;
                  e.group.position.z = safePos.z;
              } */
          }
        // ── Drone hover hum ────────────────────────────────────────
        if (!e._hoverTimer) e._hoverTimer = Math.random() * 0.4; // stagger startup
        e._hoverTimer -= dt;
        if (e._hoverTimer <= 0) {
            e._hoverTimer = 0.22; // ~4–5 Hz pulse, matches rotor feel
            if (dist < 20) sfx.hover(Math.max(0, 1 - dist / 20));
        }

    } else {
        // GROUND BOTS: NavMesh Pathfinding & Smart Ranges
        let targetDist = 8.0; 
        if (e.type === 'sniper') targetDist = 22.0;
        else if (e.type === 'heavy') targetDist = 12.0;
        else if (e.type === 'rocket' || e.type === 'drone') targetDist = 14.0;
        else if (e.type === 'shotgun') targetDist = 3.0;
        else if (e.type === 'ninja') targetDist = 1.5;
        else if (e.type === 'scout' || e.type === 'pistol') targetDist = 6.0;
        else if (e.type === 'rivet_bot') targetDist = 11.0;
        else if (e.type === 'enforcer') targetDist = 5.0;
        else if (e.type === 'tactician') targetDist = 18.0;

        // Use 2D distance so bots prioritize finding stairs instead of standing directly below you
        const dist2D = Math.sqrt(
            Math.pow(e.group.position.x - _ePP.x, 2) + 
            Math.pow(e.group.position.z - _ePP.z, 2)
        );

        // Calculate vertical difference to detect if bot is on wrong floor
        const verticalDiff = Math.abs(e.group.position.y - _ePP.y);
        const onWrongFloor = verticalDiff > 2.0; // More than 2 units of height difference

        // Always move if: angry mode, no LOS, wrong floor, or outside preferred range
        const shouldMove = !!e._navTransition || _angryMode || !hasLOS || onWrongFloor || (dist2D > targetDist + 1.0 || dist2D < targetDist - 2.0);
        if (e._hopY > 0 && (e._airVX || e._airVZ)) {
          e.group.position.x += e._airVX * dt;
          e.group.position.z += e._airVZ * dt;
          const drag=Math.max(0,1-0.55*dt);
          e._airVX *= drag;e._airVZ *= drag;
        }

        if (shouldMove) {
          const botFeet = new BABYLON.Vector3(e.group.position.x,e._floorY,e.group.position.z);
          const playerFeet = new BABYLON.Vector3(_ePP.x,_ePP.y-1.72,_ePP.z);
          const target = botTravelTarget(e,playerFeet,navPlugin,jumpPads,window._movingPlatforms||[],dt);
          const route = target && botNavPath(navPlugin,botFeet,target);
          let nextWaypoint = null;
          _eDir.setAll(0);
          if(route && route.points.length > 1){
            nextWaypoint=route.points[1];
            for(const p of route.points.slice(1)){
              if(Math.hypot(p.x-botFeet.x,p.z-botFeet.z)>0.5){nextWaypoint=p;break}
            }
            _eDir.copyFrom(nextWaypoint).subtractInPlace(botFeet);
          }else if(target && Math.abs(target.y-botFeet.y)<2){
            _eDir.copyFrom(target).subtractInPlace(botFeet);
          }
          _eDir.y=0;
          if(_eDir.length()>0.001)_eDir.normalize();
          // Hazard avoidance blends with the actual route direction, rather
          // than with the previous bot's shared steering vector.
          // ── Hazard avoidance: steer away from lava / hazard zones ──────────
          if (window._hazardZones) {
            for (const haz of window._hazardZones) {
                const WARN = 5; // metres of warning margin outside the hazard
                const ex = e.group.position.x, ez = e.group.position.z;
                const hx = haz.position.x,    hz = haz.position.z;
                const hw = (haz.metadata?.halfWidth  ?? 0.5) + WARN;
                const hd = (haz.metadata?.halfDepth  ?? 0.5) + WARN;
                if (ex > hx - hw && ex < hx + hw && ez > hz - hd && ez < hz + hd) {
                    const fleeX = ex - hx, fleeZ = ez - hz;
                    const len = Math.sqrt(fleeX * fleeX + fleeZ * fleeZ) || 1;
                    // Strong outward push — overrides pathfinding while inside the margin
                    _eDir.x += (fleeX / len) * 3.0;
                    _eDir.z += (fleeZ / len) * 3.0;
                }
            }
            if (_eDir.length() > 0.001) _eDir.normalize();
          }

          _eDir.y=0;
          if(_eDir.length()>0.001)_eDir.normalize();

            // --- NINJA DODGE MECHANIC ---
            // 2% chance per frame to violently strafe sideways when close
            if (e.type === 'ninja' && dist < 18 && e._hopY <= 0 && Math.random() < 0.02) {
                e._yVel = 7.0; // Short hop
                e._hopY = 0.05;
                // Generate a perpendicular strafe vector
                const strafeDir = BABYLON.Vector3.Cross(BABYLON.Axis.Y, _eDir).normalize();
                if (Math.random() > 0.5) strafeDir.scaleInPlace(-1);
                _eDir.addInPlace(strafeDir.scale(3.0)).normalize();
            }

            // ── Jump pad detection ─────────────────────────────────────────
            // Check whether the bot is close enough to a jump pad and trigger it.
            if (e._hopY <= 0 && (e._padCooldown || 0) <= 0) {
                for (const pad of jumpPads) {
                    const dx = e.group.position.x - pad.pos.x;
                    const dz = e.group.position.z - pad.pos.z;
                    const onPad = (dx*dx + dz*dz) < 1.6 * 1.6;
                    const nearFloor = Math.abs(e._floorY - pad.pos.y) < 1.5;
                    if (onPad && nearFloor) {
                        e._yVel = pad.force;
                        e._hopY = 0.01;
                        e._airVX = pad.thrustX;
                        e._airVZ = pad.thrustZ;
                        e._padCooldown = 2;
                        e._navTransition = null;
                        e._navRepath = 0;
                        break;
                    }
                }
            }

            // Separation push — wider radius so bots spread naturally
            for (const o of enemies) {
                if (o === e || !o.alive) continue;
                _eSep.copyFrom(e.group.position).subtractInPlace(o.group.position);
                _eSep.y = 0;
                const sepLen = _eSep.length();
                const _sepR = 3.2;
                if (sepLen > 0.05 && sepLen < _sepR) {
                    _eDir.addInPlace(_eSep.normalize().scale((_sepR - sepLen) / _sepR * 1.8));
                }
            }
            if (_eDir.length() > 0.001) _eDir.normalize();
            // Lateral wander for organic, non-robotic paths
            if (e._wanderTimer !== undefined) {
                e._wanderTimer -= dt;
                if (e._wanderTimer <= 0) {
                    e._wanderTimer = 1.8 + Math.random() * 2.5;
                    e._wanderAngle = (Math.random() - 0.5) * 0.5;
                }
                if (e._wanderAngle && dist > targetDist * 0.5) {
                    const _wc = Math.cos(e._wanderAngle), _ws = Math.sin(e._wanderAngle);
                    const _wx = _eDir.x * _wc - _eDir.z * _ws;
                    const _wz = _eDir.x * _ws + _eDir.z * _wc;
                    _eDir.x = _wx; _eDir.z = _wz;
                    if (_eDir.length() > 0.001) _eDir.normalize();
                }
            }

            let currentSpeed = e.speed;

            // Apply CRYO-CORE slow effect
            if (e.cryoTimer > 0) {
                e.cryoTimer -= dt;
                currentSpeed *= 0.35; // 65% Movement Speed Penalty
                e.atkTimer += dt * 0.45; // Also slows down their attack firing cycle
                
                // Visual tint using Babylon's non-destructive Overlay
                if (!e._cryoTinted) {
                    e.group.getChildMeshes().forEach(m => {
                        m.renderOverlay = true;
                        m.overlayColor = new BABYLON.Color3(0.2, 0.6, 1.0);
                        m.overlayAlpha = 0.6;
                    });
                    e._cryoTinted = true;
                }
            } else if (e._cryoTinted) {
                // Revert visual tint when timer expires
                e.group.getChildMeshes().forEach(m => {
                    m.renderOverlay = false; 
                });
                e._cryoTinted = false;
            }
            
            const speed = (e._onPlatform ? 0 : currentSpeed) * dt;

            // MID-AIR MOVEMENT (The Hop / Fall)
            if (e._hopY > 0) {
                const wallCheck = new BABYLON.Ray(new BABYLON.Vector3(e.group.position.x, e._floorY + e._hopY + 1.2, e.group.position.z), _eDir, speed + 0.5);
                const wHit = scene.pickWithRay(wallCheck, m => m.checkCollisions && !m.metadata?.enemy && m.isEnabled());
                if (!wHit?.hit) {
                    e.group.position.x += _eDir.x * speed;
                    e.group.position.z += _eDir.z * speed;
                }
                
                // Cast ray down from +2.0 units high to ensure it always starts above the steps!
                const downRay = new BABYLON.Ray(new BABYLON.Vector3(e.group.position.x, e._floorY + e._hopY + 2.0, e.group.position.z), new BABYLON.Vector3(0, -1, 0), 100);
                const dHit = scene.pickWithRay(downRay, m => m.checkCollisions && !m.metadata?.enemy && m.isEnabled());                if (dHit?.hit) {
                    const groundY = dHit.pickedPoint.y;
                    if (groundY <= e._floorY + e._hopY + 0.2 && Math.abs(e._floorY - groundY) > 0.1) {
                        e._hopY += (e._floorY - groundY);
                        e._floorY = groundY;
                    }
                }
                e._stuckTimer = 0;
            } 
            // GROUND MOVEMENT
            else {
                const intendedPos = e.group.position.add(_eDir.scale(speed));
                const queryPos = new BABYLON.Vector3(intendedPos.x, e._floorY + 1.2, intendedPos.z);
                const clampedPos = navPlugin.getClosestPoint(queryPos);
                
                if (clampedPos) {
                    // DEFENSE: If it's the dummy plugin returning our exact query, strip the 1.2 offset 
                    // so the bots don't continuously climb into the sky
                    if (Math.abs(clampedPos.y - queryPos.y) < 0.001 && Math.abs(clampedPos.x - queryPos.x) < 0.001) {
                        clampedPos.y -= 1.2;
                    }
                    
                    // Prevent clipping by raycasting the intended path using the bot's radius
                    const moveDir = clampedPos.subtract(e.group.position);
                    moveDir.y = 0;
                    const moveDist = moveDir.length();
                    
                    if (moveDist > 0.001) {
                        moveDir.normalize();
                        const wallRay = new BABYLON.Ray(new BABYLON.Vector3(e.group.position.x, e._floorY + 1.2, e.group.position.z), moveDir, moveDist + 0.55);
                        const wallHit = scene.pickWithRay(wallRay, m => m.checkCollisions && !m.metadata?.enemy && m.isEnabled());
                        if (wallHit?.hit) {
                            const safeDist = Math.max(0, wallHit.distance - 0.56);
                            clampedPos.copyFrom(e.group.position).addInPlace(moveDir.scale(safeDist));
                        }
                    }

                    if (e._floorY - clampedPos.y > 1.0) {
                        e._hopY = e._floorY - clampedPos.y;
                        e._floorY = clampedPos.y;
                        e._yVel = 0; // Initiate fall
                        e.group.position.x = clampedPos.x;
                        e.group.position.z = clampedPos.z;
                    } else {
                        const distMoved = BABYLON.Vector3.Distance(new BABYLON.Vector3(e.group.position.x, 0, e.group.position.z), new BABYLON.Vector3(clampedPos.x, 0, clampedPos.z));
                        if (distMoved < speed * 0.1) e._stuckTimer += dt;
                        else {
                            e._stuckTimer = 0;
                            e.group.position.x = clampedPos.x;
                            e.group.position.z = clampedPos.z;
                            e._floorY = clampedPos.y;

                            if (!e._stepTimer) e._stepTimer = 0;
                            e._stepTimer -= dt;
                            if (e._stepTimer <= 0) {
                                e._stepTimer = Math.max(0.20, 0.65 / e.speed);
                                const sDist = BABYLON.Vector3.Distance(camera.position, e.group.position);
                                if (sDist < 22) sfx.step(Math.max(0, 1 - sDist / 22), e.type);
                            }
                        }
                    }
                } else {
                    e._stuckTimer += dt; 
                }

                if (e._stuckTimer > 0.8) {
                    e._yVel = 12.0;
                    e._hopY = 0.05;
                    e._navTransition = null;
                    e._navRepath = 0;
                    e._stuckTimer = 0;
                }
            }
        }
        
        // ── Per-frame floor follow: smooth stair climbing & edge detection ──
        if (e._hopY <= 0 && e.flyH === 0) {
            const _fRay = new BABYLON.Ray(
                new BABYLON.Vector3(e.group.position.x, e._floorY + 1.0, e.group.position.z),
                new BABYLON.Vector3(0, -1, 0), 100.0 // Extended to 100 to detect deep drops/spawning in air
            );
            const _fHit = scene.pickWithRay(_fRay, m => m.checkCollisions && !m.metadata?.enemy && m.isEnabled());
            if (_fHit?.hit) {
                const _newY = _fHit.pickedPoint.y;
                const _dy = _newY - e._floorY;
                
                if (_dy > 0.04 && _dy <= 0.65) {
                    // Smooth step-up (0.5-unit stair steps)
                    e._floorY += Math.min(_dy, e.speed * dt * 6.0 + 0.06);
                } else if (_dy > 0.65 && _dy < 3.5) {
                    // Large ledge: jump
                    e._yVel = Math.sqrt(2 * 35.0 * _dy) * 1.1;
                    e._hopY = 0.05;
                } else if (_dy < -0.25) {
                    // Floor has dropped out beneath the bot - initiate fall!
                    e._hopY = Math.abs(_dy); 
                    e._floorY = _newY;
                    e._yVel = 0; 
                } else {
                    // Lock strictly to the exact floor level to prevent micro-drifting
                    e._floorY = _newY;
                }
            }
        }
        // Apply Gravity 
        if (e._hopY > 0 || e._yVel !== 0) {
            e._yVel -= 35.0 * dt; 
            e._hopY += e._yVel * dt;
            if (e._hopY <= 0) {
                e._hopY = 0;
                e._yVel = 0;
                e._airVX = 0; e._airVZ = 0;
                // Landing thud — slightly louder/lower than a walking step
                const lDist = BABYLON.Vector3.Distance(camera.position, e.group.position);
                if (lDist < 20) sfx.step(Math.max(0, (1 - lDist / 20) * 0.9), e.type);
            }
        }
    }

    // --- 3. APPLY TRANSFORM ---
    // Apply THERMAL BLAST Knockback Velocity
    if (e.knockbackVel && e.knockbackVel.length() > 0.05) {
        const oldPos = e.group.position.clone();
        const moveStep = e.knockbackVel.scale(dt);
        
        // Resonance Cascade Wall Slam Check
        if (e._phalanxShatter) {
            const ray = new BABYLON.Ray(new BABYLON.Vector3(oldPos.x, e._floorY + 1.0, oldPos.z), e.knockbackVel.clone().normalize(), moveStep.length() + 0.6);
            const wHit = scene.pickWithRay(ray, m => m.checkCollisions && !m.metadata?.enemy);
            if (wHit?.hit) {
                cb.hitRobot(e, 85, false, false, 'PHALANX_SHATTER'); // Massive wall slam damage
                if(!e.alive) continue;
                spawnSparks(wHit.pickedPoint, 0xcccccc, 15);
                e.knockbackVel.setAll(0);
                e._phalanxShatter = false;
            }
        }
        _leashToNavmesh(e, dt)
        e.group.position.addInPlace(moveStep);
        e.knockbackVel.scaleInPlace(Math.max(0, 1 - dt * 6.0));
    }
    e.group.position.y = e._floorY + e._hopY + bob + (e._yAnimOffset || 0);
    // Smooth yaw rotation — heavy/boss types have more rotational inertia
    const _tYaw = Math.atan2(_ePP.x - e.group.position.x, _ePP.z - e.group.position.z);
    if (e._yaw === undefined) e._yaw = _tYaw;
    let _dYaw = _tYaw - e._yaw;
    while (_dYaw >  Math.PI) _dYaw -= Math.PI * 2;
    while (_dYaw < -Math.PI) _dYaw += Math.PI * 2;
    const _turnRate = e.type === 'giantbot' ? 1.2 : (e.type === 'heavy' || e.type === 'armored' || e.type === 'shield_bot') ? 2.5 : 5.5;    e._yaw += _dYaw * Math.min(1.0, dt * _turnRate);
    e.group.rotation.y = e._yaw;

    // --- 4. ATTACK ---
    if (dist < e.range && hasLOS) {
      e.atkTimer -= dt;
      if (e.atkTimer <= 0) {
        e.atkTimer = e.rate;
        // For grenadiers, arc the shot upward to account for grenade gravity
        let dir;
        if (e.projT === 'grenade') {
            const gDist = BABYLON.Vector3.Distance(_eMuzzle, playerEye);
            const verticalLift = Math.min(gDist * 0.12, 6.0);
            const arcTarget = playerEye.add(new BABYLON.Vector3(0, verticalLift, 0));
            dir = arcTarget.subtract(_eMuzzle).normalize();
        } else {
            dir = playerEye.subtract(_eMuzzle).normalize();
        }

        if (e.type === 'giantbot') {
            const weps = ['rocket', 'plasma', 'heavy'];
            const pt = weps[Math.floor(Date.now() / 3500) % 3];
            const bossDmg = pt === 'rocket' ? 45 : (pt === 'plasma' ? 20 : 12);
            const bossSpd = pt === 'rocket' ? 20 : (pt === 'plasma' ? 45 : 60);
            const rightVec = BABYLON.Vector3.Cross(BABYLON.Axis.Y, dir).normalize();
            
            if (pt === 'rocket') {
                const shoulderY = e.group.position.y + 4.0;
                const leftShoulder = new BABYLON.Vector3(e.group.position.x, shoulderY, e.group.position.z).add(rightVec.scale(-1.5));
                const rightShoulder = new BABYLON.Vector3(e.group.position.x, shoulderY, e.group.position.z).add(rightVec.scale(1.5));
                const dirL = playerEye.subtract(leftShoulder).normalize();
                const dirR = playerEye.subtract(rightShoulder).normalize();
                fireEnemyShot(e, dirL, bossDmg, bossSpd, pt, leftShoulder);
                fireEnemyShot(e, dirR, bossDmg, bossSpd, pt, rightShoulder);
            } else {
                const handY = e.group.position.y + 2.0;
                const rightHand = new BABYLON.Vector3(e.group.position.x, handY, e.group.position.z).add(rightVec.scale(1.2));
                const dirH = playerEye.subtract(rightHand).normalize();
                fireEnemyShot(e, dirH, bossDmg, bossSpd, pt, rightHand);
            }
        } else {
            // --- MELEE VS RANGED ---
            if (e.projT === 'melee') {
                cb.hurtPlayer && cb.hurtPlayer(e.dmg);
                sfx.hit(); // *Shing!*
            } else {
                fireEnemyShot(e, dir, e.dmg, e.projV, e.projT);
                const sDist = BABYLON.Vector3.Distance(camera.position, e.group.position); 
                // Only play if relatively close
                if (sDist < 25) setTimeout(() => sfx.plasma(), 10); 
            }
        }
      }
    }
  }
}