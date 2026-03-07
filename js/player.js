// player.js – player state, movement, input, hurt, death  (Babylon.js port)
const BABYLON = window.BABYLON;
import { scene, camera } from './scene.js';
import { jumpPads } from './level.js';
import { player, cb } from './gameState.js';
import { sfx } from './audio.js';
import {
  WDEFS, inventory, activeSlot, curWep, wepCooldown, swingT, AUTO_WEAPONS,
  setWepCooldown, setSwingT, setActiveSlot, refreshSlotHUD,
} from './weapons.js';
import {
  hitscan, fireRocket, firePlasma,
} from './projectiles.js';
import { _meshToEnemy } from './enemies.js';

export const PH = 1.72, PR = .44;
const SPD_WALK   = 7.2;
const SPD_SPRINT = 13;
const JV         = 9.8;    // jump impulse m/s
const GRAVITY    = 26;     // m/s²
const TERM_VEL   = 40;     // max fall speed m/s

// ── Player body mesh (invisible capsule used for moveWithCollisions) ──────────
// UniversalCamera does not expose moveWithCollisions; AbstractMesh does.
const _playerBody = BABYLON.MeshBuilder.CreateBox('_playerBody', { size: 0.01 }, scene);
_playerBody.isVisible       = false;
_playerBody.isPickable      = false;
_playerBody.checkCollisions = true;
_playerBody.ellipsoid       = new BABYLON.Vector3(PR, PH / 2, PR);
_playerBody.ellipsoidOffset = new BABYLON.Vector3(0, -PH / 2, 0);
_playerBody.position.set(0, PH, 0);
camera.position.set(0, PH, 0);

export const keys = {};
export let yaw = 0, pitch = 0;
export let locked = false;
export let mouseHeld = false;
let noAmmoTimer = 0;
let _hudDirty   = false;
let _jumpQueued = false;   // set once per keydown; cleared after consumed
let _yVel       = 0;       // vertical velocity m/s (positive = up)
const DEBUG_FIRE_INPUT = true;

function _dbg(...args) {
  if (DEBUG_FIRE_INPUT) console.log('[input/fire]', ...args);
}

function _getPointerLockElement() {
  return document.pointerLockElement || document.mozPointerLockElement || document.webkitPointerLockElement || null;
}

function _isCanvasLocked(cnv) {
  return _getPointerLockElement() === cnv;
}

function _requestCanvasPointerLock(cnv) {
  const req = cnv.requestPointerLock || cnv.mozRequestPointerLock || cnv.webkitRequestPointerLock;
  if (req) req.call(cnv);
}

export function setYaw(v)    { yaw    = v; }
export function setPitch(v)  { pitch  = v; }
export function setLocked(v) { locked = v; }

export function markHudDirty() { _hudDirty = true; }

export function hurtPlayer(rawDmg) {
  if (!cb.isGameRunning?.()) return;
  let d = rawDmg;
  // Damage is absorbed by armor first, then health
  if (player.armor > 0) {
    const armorAbsorb = Math.min(player.armor, d);
    player.armor -= armorAbsorb;
    d -= armorAbsorb;
  }
  if (d > 0) {
    player.hp = Math.max(0, player.hp - d);
  }
  sfx.playerHit();
  const fl = document.getElementById('damageFlash');
  if (fl) { fl.classList.add('flash'); setTimeout(() => fl.classList.remove('flash'), 170); }
  markHudDirty();
  if (player.hp <= 0) cb.endGame && cb.endGame();
}

function shoot() {
  _dbg('shoot() called', { wepCooldown, curWep, locked });
  if (wepCooldown > 0) return;
  const W = WDEFS[curWep];
  if (W.ammo !== Infinity && W.ammo < W.aps) {
    sfx.noAmmo();
    const na = document.getElementById('noAmmo');
    if (na) { na.classList.add('show'); noAmmoTimer = 1.2; }
    return;
  }
  setWepCooldown(W.cd); setSwingT(1);
  if (W.ammo !== Infinity) W.ammo -= W.aps;
  refreshSlotHUD();
  switch (curWep) {
    case 'PISTOL':   sfx.pistol();   hitscan(_meshToEnemy, W.spread, W.dmg, W.range); break;
    case 'SMG':      sfx.smg();      hitscan(_meshToEnemy, W.spread, W.dmg, W.range); break;
    case 'CHAINGUN': sfx.chaingun(); hitscan(_meshToEnemy, W.spread, W.dmg, W.range); break;
    case 'RAILGUN':  sfx.railgun();  hitscan(_meshToEnemy, W.spread, W.dmg, W.range); break;
    case 'SHOTGUN':  sfx.shotgun();  for(let i=0;i<W.pellets;i++) hitscan(_meshToEnemy, W.spread, W.dmg, W.range); break;
    case 'PLASMA':   sfx.plasma();   firePlasma(); break;
    case 'ROCKET':   sfx.rocket();   fireRocket(); break;
  }
}

// Expose for pvp module to call with remote-player aware hitscan
export { shoot };

// ── Horizontal movement helpers ───────────────────────────────
const _fwd   = new BABYLON.Vector3();
const _right = new BABYLON.Vector3();
const _move  = new BABYLON.Vector3();
const _UP    = new BABYLON.Vector3(0, 1, 0);
const _groundRay = new BABYLON.Ray(new BABYLON.Vector3(), new BABYLON.Vector3(0, -1, 0), 0.2);

function _hasGroundSupport() {
  _groundRay.origin.copyFrom(_playerBody.position);
  _groundRay.origin.y -= (PH / 2) - 0.05;
  const hit = scene.pickWithRay(_groundRay, m => m !== _playerBody && m.isEnabled() && m.checkCollisions);
  return !!hit?.hit;
}

function getCameraForward() {
  _fwd.set(Math.sin(yaw) * Math.cos(pitch), 0, Math.cos(yaw) * Math.cos(pitch));
  return _fwd.normalize();
}

function getCameraRight() {
  BABYLON.Vector3.CrossToRef(_UP, getCameraForward(), _right);
  return _right.normalize();
}

export function resetPlayer(x, y, z) {
  _playerBody.position.set(x, y, z);
  camera.position.set(x, y, z);
  _yVel = 0;
  player.onGround = true;
}

export function updatePlayer(dt, gameRunning, paused) {
  if (!gameRunning || paused) return;

  // ── Cooldowns ──────────────────────────────────────────────
  if (wepCooldown > 0) setWepCooldown(wepCooldown - dt);
  if (noAmmoTimer > 0) {
    noAmmoTimer -= dt;
    if (noAmmoTimer <= 0) { const na=document.getElementById('noAmmo'); if(na) na.classList.remove('show'); }
  }

  // ── Horizontal input ──────────────────────────────────────
  const sprint = keys['ShiftLeft'] || keys['ShiftRight'];
  const spd    = sprint ? SPD_SPRINT : SPD_WALK;
  const fwd    = getCameraForward();
  const right  = getCameraRight();

  _move.setAll(0);
  if (keys['KeyW']||keys['ArrowUp'])    _move.addInPlace(fwd);
  if (keys['KeyS']||keys['ArrowDown'])  _move.subtractInPlace(fwd);
  if (keys['KeyA']||keys['ArrowLeft'])  _move.subtractInPlace(right);
  if (keys['KeyD']||keys['ArrowRight']) _move.addInPlace(right);
  const mLen2 = _move.lengthSquared();
  if (mLen2 > 0) _move.scaleInPlace(spd / Math.sqrt(mLen2));

  if (mouseHeld && AUTO_WEAPONS.has(curWep) && gameRunning) shoot();

  // ── Jump ──────────────────────────────────────────────────
  _dbg('JUMP CHECK (updatePlayer)', { _jumpQueued, onGround: player.onGround, yVel: _yVel });
  if (_jumpQueued && player.onGround) {
    _dbg('JUMP EXECUTED', { yVel: _yVel, onGround: player.onGround });
    _yVel = JV;
    player.onGround = false;
    _jumpQueued = false;
  }

  // ── Jump pads ─────────────────────────────────────────────
  if (player.onGround) {
    const px = camera.position.x, pz = camera.position.z;
    for (const pad of jumpPads) {
      const dx = px - pad.pos.x, dz = pz - pad.pos.z;
      if (dx*dx + dz*dz < 0.85*0.85) {
        _yVel = pad.force;
        player.onGround = false;
        break;
      }
    }
  }

  // ── Gravity ───────────────────────────────────────────────
  if (!player.onGround) {
    _yVel -= GRAVITY * dt;
    if (_yVel < -TERM_VEL) _yVel = -TERM_VEL;
  }

  // ── Apply movement via Babylon collision ─────────────────
  const dispX = _move.x * dt;
  const dispY = _yVel * dt;
  const dispZ = _move.z * dt;
  const _preY = _playerBody.position.y;
  _playerBody.moveWithCollisions(new BABYLON.Vector3(dispX, dispY, dispZ));
  // Clamp minimum Y to prevent falling through floor and OOB
  if (_playerBody.position.y < -180) _playerBody.position.y = -180;
  camera.position.copyFrom(_playerBody.position);

  // Debug overlay for Y position
  let yDebug = document.getElementById('yDebug');
  if (!yDebug) {
    yDebug = document.createElement('div');
    yDebug.id = 'yDebug';
    yDebug.style.position = 'fixed';
    yDebug.style.left = '8px';
    yDebug.style.top = '8px';
    yDebug.style.color = '#fff';
    yDebug.style.background = 'rgba(0,0,0,0.5)';
    yDebug.style.zIndex = 1000;
    yDebug.style.fontSize = '14px';
    document.body.appendChild(yDebug);
  }
  yDebug.textContent = `Y: ${camera.position.y.toFixed(2)}`;

  // ── Ground detection (post-collision) ────────────────────
  if (dispY > 0.0005) {
    // Moving up (jumping) — definitely in air
    player.onGround = false;
    _dbg('GROUND CHECK: jumping, set onGround false');
  } else if (dispY < -0.0005) {
    // Tried to move down — grounded only if floor blocked us
    if (_playerBody.position.y > (_preY + dispY) + 0.005) {
      player.onGround = true;
      if (_yVel < 0) _yVel = 0;
      _dbg('GROUND CHECK: landed, set onGround true');
    } else {
      player.onGround = false;
      _dbg('GROUND CHECK: falling, set onGround false');
    }
  } else {
    // Not moving vertically: check if supported from below
    if (_hasGroundSupport()) {
      if (!player.onGround) _dbg('GROUND CHECK: standing, set onGround true');
      player.onGround = true;
    } else {
      if (player.onGround) _dbg('GROUND CHECK: lost support, set onGround false');
      player.onGround = false;
    }
  }

  if (player.onGround && _yVel <= 0 && !_hasGroundSupport()) {
    player.onGround = false;
    _yVel = -0.01;
  }

  // ── OOB safety net  ───────────────────────────────────────
    if (camera.position.y < -195) {
      // Only reset if truly out of bounds
      _dbg && console.log('[input/fire] OOB RESET TRIGGERED', {
        pos: camera.position.clone(),
        yVel: _yVel,
        onGround: player.onGround,
        frame: performance.now()
      });
      resetPlayer(-19, PH, -12);
    }

  // ── Head bob ──────────────────────────────────────────────
  if (mLen2 > 0.01 && player.onGround) {
    camera.position.y += Math.sin(Date.now() * .001 * (sprint ? 11 : 6.5)) * .042;
  }

  const vigEl = document.getElementById('hpVignette');
  if (vigEl) vigEl.style.opacity = player.hp < 40 ? (1 - player.hp/40)*.82 : 0;

  if (_hudDirty) { cb.markHudDirty && cb.markHudDirty(); _hudDirty = false; }
}

// ── Input wiring (called from main.js once) ───────────────────
export function setupInput(getGameRunning, getPaused, onTogglePause, onPickupWeapon) {
    // Scope/zoom for railgun (right mouse)
    let isScoped = false;
    function setScope(enable) {
      if (enable && curWep === 'RAILGUN') {
        camera.fov = 0.35;
        isScoped = true;
      } else {
        camera.fov = 0.8;
        isScoped = false;
      }
    }
    document.addEventListener('mousedown', e => {
      if (e.button === 2) setScope(true);
    });
    document.addEventListener('mouseup', e => {
      if (e.button === 2) setScope(false);
    });
  const cnv = document.getElementById('c');

  const tryFirePrimary = (src, evtButton = 0, evtTarget = null) => {
    if (evtButton !== 0) return;
    const gameRunning = getGameRunning();
    const paused = getPaused();
    const isLockedNow = _isCanvasLocked(cnv);
    locked = isLockedNow;
    mouseHeld = true;
    _dbg(`${src} primary down`, {
      gameRunning,
      paused,
      locked: isLockedNow,
      target: evtTarget?.id || evtTarget?.tagName || null,
    });
    // Only require pointer lock for shooting, not for other input
    if (gameRunning && !paused && (isLockedNow || !AUTO_WEAPONS.has(curWep))) shoot();
  };

  document.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'Space' && getGameRunning()) {
      _jumpQueued = true;
      _dbg('JUMP QUEUED (keydown)', { _jumpQueued, onGround: player.onGround, yVel: _yVel });
    }
    if (!getGameRunning()) return;
    if (e.code==='Digit1') setActiveSlot(0);
    if (e.code==='Digit2') setActiveSlot(1);
    if (e.code==='KeyQ') { const other=1-activeSlot; if(inventory[other]) setActiveSlot(other); }
    if (e.code==='KeyF') onPickupWeapon();
    if (e.code==='Escape' && getGameRunning()) {
      _dbg('PAUSE TOGGLE');
      onTogglePause();
    }
  });
  document.addEventListener('keyup', e => { keys[e.code] = false; });
  document.addEventListener('mousemove', e => {
    if (getPaused()) return;
    // Only lock mouse drag while shooting with chaingun
    if (mouseHeld && curWep === 'CHAINGUN') return;
    // Allow aim while shooting auto weapons (except chaingun)
    // (do not block mouse movement for other auto weapons)
      // Right mouse for aim/scope
      document.addEventListener('mousedown', e => {
        if (e.button === 2) setScope(true);
      });
      document.addEventListener('mouseup', e => {
        if (e.button === 2) setScope(false);
      });
    yaw   += e.movementX * .0022;
    pitch += e.movementY * .0022;
    pitch  = Math.max(-1.28, Math.min(1.28, pitch));
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
  });
  document.addEventListener('mousedown', e => {
    tryFirePrimary('document mousedown', e.button, e.target);
  });
  cnv.addEventListener('mousedown', e => {
    tryFirePrimary('canvas mousedown', e.button, e.target);
  }, true);
  cnv.addEventListener('pointerdown', e => {
    tryFirePrimary('canvas pointerdown', e.button, e.target);
  }, true);
  document.addEventListener('mouseup', e => { 
    if (e.button === 0) {
      mouseHeld = false;
      _dbg('mouseup');
    }
  });
  cnv.addEventListener('pointerup', e => {
    if (e.button === 0) {
      mouseHeld = false;
      _dbg('canvas pointerup');
    }
  }, true);

  scene.onPointerObservable.add((pointerInfo) => {
    if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN) {
      const evt = pointerInfo.event;
      tryFirePrimary('babylon pointerdown', evt?.button ?? 0, evt?.target ?? null);
    } else if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERUP) {
      const evt = pointerInfo.event;
      if ((evt?.button ?? 0) === 0) {
        mouseHeld = false;
        _dbg('babylon pointerup');
      }
    }
  });

  cnv.addEventListener('click', () => {
    const gameRunning = getGameRunning();
    const paused = getPaused();
    const isLockedNow = _isCanvasLocked(cnv);
    _dbg('canvas click', { gameRunning, paused, locked:isLockedNow });
    if (gameRunning && !paused && !isLockedNow) _requestCanvasPointerLock(cnv);
  });

  const syncPointerLock = (evName) => {
    locked = _isCanvasLocked(cnv);
    _dbg('pointer lock change', { evName, locked, lockEl: _getPointerLockElement()?.id || _getPointerLockElement()?.tagName || null });
    if (!locked) mouseHeld = false;
  };

  document.addEventListener('pointerlockchange', () => syncPointerLock('pointerlockchange'));
  document.addEventListener('mozpointerlockchange', () => syncPointerLock('mozpointerlockchange'));
  document.addEventListener('webkitpointerlockchange', () => syncPointerLock('webkitpointerlockchange'));
}
