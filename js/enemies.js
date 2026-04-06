// enemies.js – robot AI, spawning, hit/destroy, round timer, angry mode
const BABYLON = window.BABYLON;
import { scene, camera, navPlugin } from './scene.js';
import { M, robotTex } from './textures.js';
import { makeScaledWeaponModel, ROBOT_DROPS, curWep } from './weapons.js';
import { enemies, player, cb } from './gameState.js';
import { spawnSparks } from './particles.js';
import { fireEnemyShot } from './projectiles.js';
import { sfx } from './audio.js';
import { jumpPads } from './level.js';

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
  if (gt) gt.textContent = 'TIME: ' + _fmt(_gameTime);
  if (kt) kt.textContent = 'KILLS: ' + _totalKills;
  if (kr) kr.textContent = 'ROUND: ' + _roundKills + ' / ' + _roundEnemies;

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
    let bW = 0.48, bH = 1.18, bD = 0.32, aL = 0.7, aW = 0.10, lW = 0.13, lH = 0.7, fL = 0.22, fH = 0.11, hW = 0.32, hH = 0.36, hD = 0.28;
    if (type === 'heavy')   { bW=1.04; bH=1.65; bD=.65; aL=.88; aW=.16; lW=.24; lH=.65; fL=.34; fH=.14; hW=.52; hH=.40; hD=.36; }
    if (type === 'sniper')  { bW=.66; bH=1.1;  bD=.44; aL=.64; aW=.11; lW=.20; lH=.52; fL=.28; fH=.14; hW=.4;  hH=.31; hD=.29; }
    if (type === 'shotgun') { bW=.54; bH=1.12; bD=.34; aL=.72; aW=.12; lW=.16; lH=.68; fL=.25; fH=.12; hW=.34; hH=.33; hD=.26; }
    if (type === 'rocket')  { bW=.52; bH=1.15; bD=.36; aL=.74; aW=.13; lW=.17; lH=.70; fL=.28; fH=.13; hW=.36; hH=.34; hD=.29; }
    if (type === 'grenadier') { bW=.60; bH=1.20; bD=.42; aL=.70; aW=.13; lW=.18; lH=.65; fL=.28; fH=.13; hW=.38; hH=.34; hD=.30; }
    if (type === 'electron_bot') { bW=.50; bH=1.15; bD=.35; aL=.70; aW=.12; lW=.15; lH=.68; fL=.25; fH=.12; hW=.35; hH=.32; hD=.28; }
    if (type === 'ion_sniper')   { bW=.60; bH=1.1; bD=.40; aL=.64; aW=.12; lW=.18; lH=.55; fL=.28; fH=.13; hW=.38; hH=.30; hD=.28; }
    const bY = bH / 2 + .28;
    const hY = bY + bH/2 + hH*.42;
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
    const wn = type==='heavy'?'CHAINGUN':type==='sniper'?'RAILGUN':type==='pistol'?'PISTOL':type==='shotgun'?'SHOTGUN':type==='rocket'?'ROCKET':type==='grenadier'?'GLAUNCHER':'SMG';
    const ws = type==='heavy'?.62:type==='sniper'?.50:type==='pistol'?.44:type==='shotgun'?.54:type==='rocket'?.56:type==='grenadier'?.56:.50;
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
    electron_bot: { hp: 120, maxHp: 120, spd: 6.5, dmg: 15, range: 90, rate: 0.3, pt: 'electron', pv: 48, score: 160, mOY: 1.0 },
    ion_sniper:   { hp: 85,  maxHp: 85,  spd: 4.5, dmg: 45, range: 140, rate: 2.0, pt: 'ion', pv: 120, score: 200, mOY: 1.0 },
    grenadier: { hp:45, maxHp:45, spd:3.2, dmg:65, range:40, rate:2.5, pt:'grenade', pv:22, score:160, mOY:1.0 },
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
const WALKABLE_SPAWNS = [
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
  [ 0, 24, -16], [-4, 24, -16], [ 4, 24, -16],
];
const MIN_SPAWN_DIST = 16;

export function spawnBot(type, _x, _spawnY_IGNORED, _z, scale = 1.0) {
  // Completely ignore spawnY so bots scatter across all vertical levels!
  let validSpawns = WALKABLE_SPAWNS;
  if (type === 'giantbot') {
      validSpawns = WALKABLE_SPAWNS.filter(sp => sp[1] === 0);
  }
  const shuffled = validSpawns.slice().sort(() => Math.random() - 0.5);
  let px = _x, pz = _z, py = 0;
  
  for (const [cx, cy, cz] of shuffled) {
    const dx = cx - camera.position.x, dz = cz - camera.position.z;
    // Ensure they don't spawn right on top of the player
    if (dx * dx + dz * dz >= MIN_SPAWN_DIST * MIN_SPAWN_DIST) {
      px = cx + (Math.random() - 0.5) * 2.0; // Add slight random scatter
      py = cy;
      pz = cz + (Math.random() - 0.5) * 2.0;
      break;
    }
  }
  const e = buildRobot(type);
  e.hp = Math.round(e.hp * scale); e.maxHp = Math.round(e.maxHp * scale);
  e.dmg = Math.round(e.dmg * scale);
  e.speed = e.speed * (0.85 + 0.15 * Math.min(scale, 2.0));
  if (type === 'giantbot') {
      e.group.scaling.set(3, 3, 3);
  }

  // Snap the chosen spawn to the nearest valid NavMesh point so bots can never
  // materialise inside wall geometry even if the raw coordinate is slightly off.
  const rawSpawn = new BABYLON.Vector3(px, py + (e.flyH > 0 ? e.flyH : 0) + 0.5, pz);
  const snapped  = navPlugin.getClosestPoint(rawSpawn);
  if (snapped) {
    px = snapped.x;
    py = snapped.y;
    pz = snapped.z;
  }

  e.group.position.set(px, py + (e.flyH > 0 ? e.flyH : 0), pz);
  
  if (isAngryMode()) { e.dmg = Math.round(e.dmg * 1.6); e.speed *= 1.5; e.score *= 2; _addRedArrow(e); }
  enemies.push(e);
  rebuildMeshMap();
}

export function hitRobot(e, dmg, isHeadshot = false) {
  if (!e.alive) return;
  // Railgun fires 9999 – cap it for boss-tier enemies so they need multiple shots - currently capped at 20% HP
  if (BOSS_TYPES.has(e.type) && dmg > e.maxHp * 0.20) {
    dmg = Math.round(e.maxHp * 0.20);
  }
  e.hp -= dmg;
  if (cb.showHitMarker) cb.showHitMarker();
  sfx.hit();
  if (e.hp <= 0) destroyRobot(e, isHeadshot);
}

export function destroyRobot(e, isHeadshot = false) {
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
  if (player.buffs && player.buffs['double_score'] > 0) {
      pointsToAward *= 2; 
  }
  player.score += pointsToAward;

  // ── 3. PROGRESSION: XP + kill tracking ──────────────────────
  import('./progression.js').then(({ awardXp, recordKill, XP_GRANTS, hasEnergyCoil }) => {
    const xpKey = 'kill' + e.type.charAt(0).toUpperCase() + e.type.slice(1);
    const xp = XP_GRANTS[xpKey] ?? XP_GRANTS.killScout;
    awardXp(xp, 'Kill: ' + e.type);
    // Use pre-captured weapon key — no nested import, no race condition.
    recordKill(e.type, _killedWithWeapon, { isJumping: _killedWhileAir, isScoped: _killedWhileScoped });

    // ── Energy Coil: headshot kills on ION vent 40% heat ──────
    if (isHeadshot && _killedWithWeapon === 'ION' && hasEnergyCoil()) {
      player.wepHeat = Math.max(0, (player.wepHeat || 0) - 0.40);
    }
  });

  _totalKills++;
  _roundKills++;
  
  const names = { scout:'Scout destroyed!',heavy:'Heavy down!',sniper:'Sniper eliminated!',drone:'Drone shot down!',pistol:'Pistol bot down!',shotgun:'Shotgunner destroyed!',rocket:'Rocket bot destroyed!',grenadier:'Grenadier down!',electron_bot:'Electron Bot destroyed!',ion_sniper:'Ion Sniper eliminated!' };
  const feed = document.getElementById('killFeed');
  if (feed) { 
      feed.textContent = (names[e.type] || 'Robot destroyed!') + (_angryMode ? ' [ENRAGED]' : ''); 
      clearTimeout(feed._t); 
      feed._t = setTimeout(() => feed.textContent = '', 2200); 
  }

  import('./pickups.js').then(({ spawnPickup, spawnWeaponDrop, spawnPowerup }) => {
   // --- EPIC BOSS LOOT EXPLOSION ---
    if (e.type === 'giantbot') {
      spawnPowerup(pos.add(new BABYLON.Vector3( 1.5, 0, 0)), 'quad_damage');
      spawnPowerup(pos.add(new BABYLON.Vector3(-1.5, 0, 0)), 'infinite_ammo');
      spawnPickup(pos.add(new BABYLON.Vector3(0, 0,  1.5)));
      spawnPickup(pos.add(new BABYLON.Vector3(0, 0, -1.5)));
      spawnWeaponDrop(pos, 'ROCKET');
    } else {
      // --- NORMAL BOT LOOT ---
      // 5% chance to drop a rare Powerup
      if (Math.random() < 0.05) { 
        const pTypes = ['quad_damage', 'infinite_ammo', 'haste', 'double_score'];
        const pt = pTypes[Math.floor(Math.random() * pTypes.length)];
        spawnPowerup(pos, pt);
      } 
      // Independent 45% chance to drop Health/Armor/Ammo
      if (Math.random() < 0.45) {
        spawnPickup(pos);
      }
      const dropWep = ROBOT_DROPS[e.type];
      if (dropWep) spawnWeaponDrop(pos, dropWep);
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

export function updateEnemies(dt) {
  _tickTimers(dt);
  _ePP.copyFrom(camera.position);

  for (const e of enemies) {
    if (!e.alive) continue;
    e.animT += dt;

    // Initialize physical properties
    if (e._floorY === undefined) e._floorY = e.group.position.y - (e.flyH > 0 ? e.flyH : 0);
    e._hopY = e._hopY || 0;
    e._yVel = e._yVel || 0;
    e._stuckTimer = e._stuckTimer || 0;

    let bob = (e.flyH > 0) ? (e.flyH + Math.sin(e.animT * 1.9) * .18) : (Math.abs(Math.sin(e.animT * 5.8)) * .04);
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

    // --- 1. BOSS SPECIAL ABILITIES ---
    if (e.type === 'giantbot') {
        // Initialise summon timer on first tick so it doesn't fire immediately
        if (e.summonTimer === undefined) e.summonTimer = 30.0;
        e.summonTimer -= dt;

        // Only summon when: cooldown elapsed AND the arena isn't already packed
        // AND the boss has taken some damage (< 75 % HP) — gate prevents
        // the boss spamming minions before the player even engages it.
        const hpPct = e.hp / e.maxHp;
        if (e.summonTimer <= 0 && enemies.length < 22 && hpPct < 0.75) {
            e.summonTimer = 45.0;  // 45-second cooldown between summons
            spawnBot('drone', e.group.position.x + 3, e.group.position.y + 5, e.group.position.z, 1.0);
            spawnBot('drone', e.group.position.x - 3, e.group.position.y + 5, e.group.position.z, 1.0);
            _roundEnemies += 2;  // keep round kill counter accurate
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
            e.group.position.addInPlace(_eDir.scale(e.speed * dt));
        }
    // ... [Inside updateEnemies(dt), replacing the GROUND BOTS section] ...

    } else {
        // GROUND BOTS: NavMesh Pathfinding & Smart Ranges
        let targetDist = 8.0; 
        if (e.type === 'sniper') targetDist = 22.0;
        else if (e.type === 'heavy') targetDist = 12.0;
        else if (e.type === 'rocket' || e.type === 'drone') targetDist = 14.0;
        else if (e.type === 'shotgun') targetDist = 3.0;
        else if (e.type === 'scout' || e.type === 'pistol') targetDist = 6.0;

        // NEW FIX: Use 2D distance so bots prioritize finding stairs instead of standing directly below you
        const dist2D = Math.sqrt(
            Math.pow(e.group.position.x - _ePP.x, 2) + 
            Math.pow(e.group.position.z - _ePP.z, 2)
        );

        const shouldMove = _angryMode || !hasLOS || (dist2D > targetDist + 1.0 || dist2D < targetDist - 2.0);

        if (shouldMove) {
            const botFeet   = new BABYLON.Vector3(e.group.position.x, e._floorY + 0.5, e.group.position.z);
            const playerFeet = new BABYLON.Vector3(_ePP.x, _ePP.y - 0.72, _ePP.z);

            const startPt = navPlugin.getClosestPoint(botFeet);
            let endPt     = navPlugin.getClosestPoint(playerFeet);
            let hasPath   = false;
            let nextWaypoint = null; // full 3D waypoint from navmesh

            if (startPt && endPt) {
                const path = navPlugin.computePath(startPt, endPt);
                if (path && path.length > 1) {
                    nextWaypoint = path[1];
                    _eDir.copyFrom(nextWaypoint).subtractInPlace(startPt);
                    hasPath = true;
                }
            }

            // Fallback: direct vector toward player feet
            if (!hasPath) _eDir.copyFrom(playerFeet).subtractInPlace(botFeet);

            // ── Stair climbing: if the next waypoint is meaningfully higher,
            //    initiate a hop so the bot actually rises onto the step.
            if (nextWaypoint && e._hopY <= 0) {
                const stepUp = nextWaypoint.y - e._floorY;
                if (stepUp > 0.25 && stepUp < 3.5) {
                    // Proportional jump velocity: just enough to clear the step
                    e._yVel  = Math.sqrt(2 * 35.0 * stepUp) * 1.1;
                    e._hopY  = 0.01; // seed mid-air branch
                }
            }

            _eDir.y = 0;
            if (_eDir.length() > 0.001) _eDir.normalize();

            // ── Jump pad detection ─────────────────────────────────────────
            // Check whether the bot is close enough to a jump pad and trigger it.
            if (e._hopY <= 0) {
                for (const pad of jumpPads) {
                    const dx = e.group.position.x - pad.pos.x;
                    const dz = e.group.position.z - pad.pos.z;
                    const onPad = (dx*dx + dz*dz) < 1.6 * 1.6;
                    const nearFloor = Math.abs(e._floorY - pad.pos.y) < 1.5;
                    if (onPad && nearFloor) {
                        e._yVel = pad.force * 0.7;
                        e._hopY = 0.01;
                        // Apply horizontal thrust from pad direction
                        e.group.position.x += pad.thrustX * 0.05;
                        e.group.position.z += pad.thrustZ * 0.05;
                        break;
                    }
                }
            }

            // Separation push
            for (const o of enemies) {
                if (o === e || !o.alive) continue;
                _eSep.copyFrom(e.group.position).subtractInPlace(o.group.position);
                _eSep.y = 0;
                const sepLen = _eSep.length();
                if (sepLen > 0.05 && sepLen < 1.8) _eDir.addInPlace(_eSep.normalize().scale(0.5));
            }
            if (_eDir.length() > 0.001) _eDir.normalize();

            const speed = e.speed * dt;

            // MID-AIR MOVEMENT (The Hop / Fall)
            if (e._hopY > 0) {
                const wallCheck = new BABYLON.Ray(new BABYLON.Vector3(e.group.position.x, e._floorY + e._hopY + 0.5, e.group.position.z), _eDir, speed + 0.5);
                const wHit = scene.pickWithRay(wallCheck, m => m.checkCollisions && !m.metadata?.enemy && m.isEnabled());
                if (!wHit?.hit) {
                    e.group.position.x += _eDir.x * speed;
                    e.group.position.z += _eDir.z * speed;
                }
                
                // FIX: Cast ray down from +2.0 units high to ensure it always starts above the steps!
                const downRay = new BABYLON.Ray(new BABYLON.Vector3(e.group.position.x, e._floorY + e._hopY + 2.0, e.group.position.z), new BABYLON.Vector3(0, -1, 0), 100);
                const dHit = scene.pickWithRay(downRay, m => m.checkCollisions && !m.metadata?.enemy && m.isEnabled());                if (dHit?.hit) {
                    const groundY = dHit.pickedPoint.y;
                    if (Math.abs(e._floorY - groundY) > 0.1) {
                        e._hopY += (e._floorY - groundY);
                        e._floorY = groundY;
                    }
                }
                e._stuckTimer = 0;
            } 
            // GROUND MOVEMENT
            else {
                const intendedPos = e.group.position.add(_eDir.scale(speed));
                // Lifted from +0.5 to +1.2 so the ray clears the stair steps
                const clampedPos = navPlugin.getClosestPoint(new BABYLON.Vector3(intendedPos.x, e._floorY + 1.2, intendedPos.z));
                
                if (clampedPos) {
                    // NEW FIX: Determine if there's a huge drop-off. If so, cleanly convert to a fall!
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
                        }
                    }
                } else {
                    e._stuckTimer += dt; 
                }

                // TRIGGER JUMP: If stuck at a gap or wall for 0.4 seconds, vault over!
                if (e._stuckTimer > 0.4) {
                    e._yVel = 12.0; 
                    e._stuckTimer = 0;
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
            }
        }
    }

    // --- 3. APPLY TRANSFORM ---
    e.group.position.y = e._floorY + e._hopY + bob + (e._yAnimOffset || 0);
    _eLookAt.set(_ePP.x, e.group.position.y, _ePP.z);
    e.group.lookAt(_eLookAt);

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
        } 
        else {
            fireEnemyShot(e, dir, e.dmg, e.projV, e.projT);
        }
      }
    }
  }
}