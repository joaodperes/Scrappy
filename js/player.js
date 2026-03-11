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
import { hitscan, fireRocket, firePlasma } from './projectiles.js';
import { _meshToEnemy } from './enemies.js';

export const PH = 1.72, PR = .44;
// Base speed is now the old sprint speed – Shift gives a dash boost on top
const SPD_WALK   = 13;
const SPD_SPRINT = 19;
const JV         = 9.8;
const GRAVITY    = 26;
const TERM_VEL   = 40;
const DEFAULT_FOV = 1.48;
const SCOPE_FOV   = 0.32;

const COYOTE_TIME = 0.10;  // seconds after leaving ground where jump still works
const JUMP_BUFFER = 0.14;  // seconds a Space press is remembered before landing

// ── Player body mesh ──────────────────────────────────────────
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

let noAmmoTimer  = 0;
let _hudDirty    = false;
let _yVel        = 0;
let _jumpBufTimer = 0;
let _coyoteTimer  = 0;
let _wasOnGround  = false;

// Auto-unstuck: if player holds movement but barely moves for 1.5 s, nudge up
let _stuckTimer   = 0;
let _lastStuckPos = new BABYLON.Vector3();

function _getPointerLockElement() {
  return document.pointerLockElement || document.mozPointerLockElement || document.webkitPointerLockElement || null;
}
function _isCanvasLocked(cnv) { return _getPointerLockElement() === cnv; }
function _requestCanvasPointerLock(cnv) {
  const req = cnv.requestPointerLock || cnv.mozRequestPointerLock || cnv.webkitRequestPointerLock;
  if (req) req.call(cnv);
}

export function setYaw(v)      { yaw   = v; }
export function setPitch(v)    { pitch = v; }
export function setLocked(v)   { locked = v; }
export function markHudDirty() { _hudDirty = true; }

export function hurtPlayer(rawDmg) {
  if (!cb.isGameRunning?.()) return;
  let d = rawDmg;
  if (player.armor > 0) {
    const absorb = Math.min(player.armor, d);
    player.armor -= absorb;
    d -= absorb;
  }
  if (d > 0) player.hp = Math.max(0, player.hp - d);
  sfx.playerHit();
  const fl = document.getElementById('damageFlash');
  if (fl) { fl.classList.add('flash'); setTimeout(() => fl.classList.remove('flash'), 170); }
  markHudDirty();
  if (player.hp <= 0) cb.endGame?.();
}

function shoot() {
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
    case 'PISTOL':   sfx.pistol();   hitscan(_meshToEnemy, W.spread, W.dmg,  W.range); break;
    case 'SMG':      sfx.smg();      hitscan(_meshToEnemy, W.spread, W.dmg,  W.range); break;
    case 'CHAINGUN': sfx.chaingun(); hitscan(_meshToEnemy, W.spread, W.dmg,  W.range); break;
    // Railgun fires 9999 dmg; hitRobot() caps it for bosses so they take ~2 shots
    case 'RAILGUN':  sfx.railgun();  hitscan(_meshToEnemy, W.spread, 9999,   W.range); break;
    case 'SHOTGUN':  sfx.shotgun();  for (let i = 0; i < W.pellets; i++) hitscan(_meshToEnemy, W.spread, W.dmg, W.range); break;
    case 'PLASMA':   sfx.plasma();   firePlasma(); break;
    case 'ROCKET':   sfx.rocket();   fireRocket(); break;
  }
}
export { shoot };

// ── Movement helpers ──────────────────────────────────────────
const _fwd  = new BABYLON.Vector3();
const _right = new BABYLON.Vector3();
const _move  = new BABYLON.Vector3();
const _UP    = new BABYLON.Vector3(0, 1, 0);

// ─────────────────────────────────────────────────────────────────────
// ROOT CAUSE OF ALL PREVIOUS JUMP FAILURES:
//
//   scene.pickWithRay(ray, predicate) only hits meshes where isPickable===true.
//   The floor mesh has isPickable=false for performance → the ray always misses
//   → _hasGroundSupport() always returns false → player.onGround oscillates
//   every frame → jump is silently eaten when onGround happens to be false.
//
// Fix: use ray.intersectsMesh(m) directly on meshes with checkCollisions=true.
//   This path does NOT check isPickable, so it hits the floor correctly.
// ─────────────────────────────────────────────────────────────────────
// Ray geometry (capsule bottom = _playerBody.y - PH):
//   Standing: body.y=1.72 → capsule bottom=0. Ray origin=0.14, length=0.30
//   → tests y: 0.14 → -0.16  (hits ground at y=0)  ✓
const _gRay = new BABYLON.Ray(new BABYLON.Vector3(), new BABYLON.Vector3(0, -1, 0), 0.30);

function _hasGroundSupport() {
  _gRay.origin.set(_playerBody.position.x, _playerBody.position.y - PH + 0.14, _playerBody.position.z);
  for (const m of scene.meshes) {
    if (m === _playerBody || !m.isEnabled() || !m.checkCollisions) continue;
    if (_gRay.intersectsMesh(m, false).hit) return true;
  }
  return false;
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
  _wasOnGround    = true;
  _jumpBufTimer   = 0;
  _coyoteTimer    = 0;
}

export function updatePlayer(dt, gameRunning, paused) {
  if (!gameRunning || paused) return;

  if (wepCooldown  > 0) setWepCooldown(wepCooldown - dt);
  if (_jumpBufTimer > 0) _jumpBufTimer -= dt;
  if (_coyoteTimer  > 0) _coyoteTimer  -= dt;
  if (noAmmoTimer   > 0) {
    noAmmoTimer -= dt;
    if (noAmmoTimer <= 0) { const na = document.getElementById('noAmmo'); if (na) na.classList.remove('show'); }
  }

  // Horizontal input
  const sprint = keys['ShiftLeft'] || keys['ShiftRight'];
  const spd    = sprint ? SPD_SPRINT : SPD_WALK;
  const fwd    = getCameraForward();
  const right  = getCameraRight();
  _move.setAll(0);
  if (keys['KeyW'] || keys['ArrowUp'])    _move.addInPlace(fwd);
  if (keys['KeyS'] || keys['ArrowDown'])  _move.subtractInPlace(fwd);
  if (keys['KeyA'] || keys['ArrowLeft'])  _move.subtractInPlace(right);
  if (keys['KeyD'] || keys['ArrowRight']) _move.addInPlace(right);
  const mLen2 = _move.lengthSquared();
  if (mLen2 > 0) _move.scaleInPlace(spd / Math.sqrt(mLen2));

  // Auto-fire (mouse look is never blocked here – it runs on DOM events independently)
  if (mouseHeld && AUTO_WEAPONS.has(curWep)) shoot();

  // Jump: buffer + coyote time
  const canJump    = player.onGround || (_coyoteTimer > 0);
  const jumpWanted = keys['Space'] || (_jumpBufTimer > 0);
  if (jumpWanted && canJump) {
    _yVel           = JV;
    player.onGround = false;
    _coyoteTimer    = 0;
    _jumpBufTimer   = 0;
  }

  // Jump pads
  if (player.onGround) {
    const px = _playerBody.position.x, pz = _playerBody.position.z;
    for (const pad of jumpPads) {
      const dx = px - pad.pos.x, dz = pz - pad.pos.z;
      if (dx * dx + dz * dz < 0.85 * 0.85) {
        _yVel = pad.force; player.onGround = false; _coyoteTimer = 0; break;
      }
    }
  }

  // Gravity
  if (!player.onGround) {
    _yVel -= GRAVITY * dt;
    if (_yVel < -TERM_VEL) _yVel = -TERM_VEL;
  }

  // Apply via Babylon collision
  const dispX = _move.x * dt, dispY = _yVel * dt, dispZ = _move.z * dt;
  const preY  = _playerBody.position.y;
  _playerBody.moveWithCollisions(new BABYLON.Vector3(dispX, dispY, dispZ));

  if (_playerBody.position.y < -3) {
    _playerBody.position.y = PH; _yVel = 0; player.onGround = true; _wasOnGround = true;
  }
  camera.position.copyFrom(_playerBody.position);

  // Ground state – single authoritative decision
  let nowOnGround;
  if (dispY > 0.001) {
    nowOnGround = false;
  } else if (dispY < -0.001) {
    nowOnGround = (_playerBody.position.y > (preY + dispY) + 0.004);
    if (nowOnGround && _yVel < 0) _yVel = 0;
  } else {
    nowOnGround = _hasGroundSupport();
  }
  if (_wasOnGround && !nowOnGround && _yVel <= 0) _coyoteTimer = COYOTE_TIME;
  _wasOnGround = nowOnGround; player.onGround = nowOnGround;

  // Auto-unstuck: pressing movement keys but barely moving for 1.5 s → pop up
  const wantMove = mLen2 > 0.01;
  if (wantMove) {
    const moved = BABYLON.Vector3.Distance(_playerBody.position, _lastStuckPos);
    if (moved < 0.25) {
      _stuckTimer += dt;
      if (_stuckTimer > 1.5) {
        _yVel = JV * 0.8;           // half-strength jump burst
        player.onGround = false;
        _stuckTimer = 0;
      }
    } else {
      _stuckTimer = 0;
    }
  } else {
    _stuckTimer = 0;
  }
  _lastStuckPos.copyFrom(_playerBody.position);

  if (camera.position.y < -6) resetPlayer(-19, PH, -12);

  if (mLen2 > 0.01 && player.onGround) {
    camera.position.y += Math.sin(Date.now() * .001 * (sprint ? 11 : 6.5)) * .042;
  }
  const vigEl = document.getElementById('hpVignette');
  if (vigEl) vigEl.style.opacity = player.hp < 40 ? (1 - player.hp / 40) * .82 : 0;
  if (_hudDirty) { cb.markHudDirty?.(); _hudDirty = false; }
}

// ── Input wiring (called ONCE from main.js) ───────────────────
export function setupInput(getGameRunning, getPaused, onTogglePause, onPickupWeapon) {
  const cnv = document.getElementById('c');

  // Railgun scope – canvas capture phase so Babylon's own pointerdown
  // preventDefault() on the canvas can't suppress these in Firefox.
  let isScoped = false;
  function setScope(enable) {
    if (enable && curWep === 'RAILGUN') { camera.fov = SCOPE_FOV;   isScoped = true;  }
    else                                { camera.fov = DEFAULT_FOV; isScoped = false; }
  }
  cnv.addEventListener('mousedown',  e => { if (e.button === 2) setScope(true);  }, true);
  cnv.addEventListener('mouseup',    e => { if (e.button === 2) setScope(false); }, true);
  cnv.addEventListener('pointerup',  e => { if (e.button === 2) setScope(false); }, true);
  document.addEventListener('mouseup', e => { if (e.button === 2) setScope(false); }); // safety fallback
  scene.onBeforeRenderObservable.add(() => { if (isScoped && curWep !== 'RAILGUN') setScope(false); });

  // ── Fire handler ──────────────────────────────────────────
  // Root-cause of "clicking does nothing":
  //   Babylon registers a capture-phase pointerdown listener on the canvas and
  //   calls preventDefault().  In Firefox this prevents mousedown from bubbling
  //   to document, so a document-only listener never fires.
  // Fix: attach to FOUR sources (document, canvas-capture ×2, Babylon observer).
  //   An 8 ms dedup guard ensures only one shot fires per click even if all four
  //   trigger simultaneously.
  //
  // Pointer-lock is requested on mousedown (not 'click') so holding LMB for
  // CHAINGUN autofire acquires lock on the very first press, keeping movementX/Y
  // flowing even when the cursor moves outside the browser window.
  let _lastFireMs = 0;
  const tryFirePrimary = (button, target) => {
    if (button !== 0) return;
    // Gate pointer lock on whether the click landed directly on the canvas,
    // NOT on getGameRunning() – that callback returns false even during live
    // gameplay, so gating on it permanently blocks pointer lock acquisition.
    // Clicks on start-screen overlays have a different event target (a div),
    // so they correctly skip pointer lock and let the overlay handle the event.
    if (target === cnv && !_isCanvasLocked(cnv)) _requestCanvasPointerLock(cnv);
    locked    = _isCanvasLocked(cnv);
    mouseHeld = true;
    if (!getGameRunning() || getPaused()) return;
    const now = performance.now();
    if (now - _lastFireMs < 8) return;
    _lastFireMs = now;
    shoot();
  };

  document.addEventListener('mousedown',  e => tryFirePrimary(e.button, e.target));
  cnv.addEventListener('mousedown',  e => tryFirePrimary(e.button, e.target), true);
  cnv.addEventListener('pointerdown', e => tryFirePrimary(e.button, e.target), true);
  document.addEventListener('mouseup', e => { if (e.button === 0) mouseHeld = false; });
  cnv.addEventListener('pointerup',   e => { if (e.button === 0) mouseHeld = false; }, true);
  scene.onPointerObservable.add(pi => {
    const b = pi.event?.button ?? 0;
    if      (pi.type === BABYLON.PointerEventTypes.POINTERDOWN) tryFirePrimary(b, cnv);
    else if (pi.type === BABYLON.PointerEventTypes.POINTERUP && b === 0) mouseHeld = false;
  });

  document.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'Space') {
      e.preventDefault(); // stop browser activating focused buttons (restart/start UI)
      _jumpBufTimer = JUMP_BUFFER;
    }
    if (!getGameRunning()) return;
    if (e.code === 'Digit1') setActiveSlot(0);
    if (e.code === 'Digit2') setActiveSlot(1);
    if (e.code === 'KeyQ')  { const other = 1 - activeSlot; if (inventory[other]) setActiveSlot(other); }
    if (e.code === 'KeyF')  onPickupWeapon();
    if (e.code === 'Escape') onTogglePause();
  });
  document.addEventListener('keyup', e => { keys[e.code] = false; });

  // ── Mouse look ─────────────────────────────────────────────────────────
  // ROOT CAUSE of "can't aim while holding LMB":
  //   Browsers enter native drag-capture mode when LMB is held, routing
  //   pointer events away from document. document.mousemove stops firing
  //   (or fires with movementX/Y = 0) for the duration of the press.
  //
  // Fix: call cnv.setPointerCapture(pointerId) on pointerdown.
  //   This tells the browser to route ALL pointer events to the canvas
  //   for the life of the press, bypassing drag-capture entirely.
  //   Then listen to pointermove on the canvas – it fires reliably with
  //   correct movementX/Y even without pointer lock.
  cnv.addEventListener('pointerdown', e => {
    try { cnv.setPointerCapture(e.pointerId); } catch (_) {}
  });
  cnv.addEventListener('pointermove', e => {
    if (getPaused()) return;
    yaw   += e.movementX * .0022;
    pitch += e.movementY * .0022;
    pitch  = Math.max(-1.28, Math.min(1.28, pitch));
  });
  // Fallback for when pointer is NOT captured (e.g. pointer lock active –
  // in that mode pointermove fires on document, not the canvas).
  document.addEventListener('pointermove', e => {
    if (!_isCanvasLocked(cnv)) return; // only handle locked-pointer events here
    if (getPaused()) return;
    yaw   += e.movementX * .0022;
    pitch += e.movementY * .0022;
    pitch  = Math.max(-1.28, Math.min(1.28, pitch));
  });

  // Re-apply every frame AFTER Babylon's camera internals run, ensuring
  // rotationQuaternion can never silently override camera.rotation.
  scene.onBeforeRenderObservable.add(() => {
    camera.rotationQuaternion = null;
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
  });

  cnv.addEventListener('contextmenu', e => e.preventDefault());

  const syncLock = () => { locked = _isCanvasLocked(cnv); if (!locked) mouseHeld = false; };
  document.addEventListener('pointerlockchange',       syncLock);
  document.addEventListener('mozpointerlockchange',    syncLock);
  document.addEventListener('webkitpointerlockchange', syncLock);
}
