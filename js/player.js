// player.js – player state, movement, input, hurt, death  (Babylon.js port)
const BABYLON = window.BABYLON;
import { scene, camera } from './scene.js';
import { jumpPads } from './level.js';
import { player, cb } from './gameState.js';
import { sfx } from './audio.js';
import {
  WDEFS, inventory, activeSlot, curWep, wepCooldown, swingT, AUTO_WEAPONS,
  setWepCooldown, setSwingT, setActiveSlot, refreshSlotHUD, setWeaponVisibility
} from './weapons.js';
import { hitscan, fireRocket, firePlasma, fireGrenade } from './projectiles.js';
import { _meshToEnemy } from './enemies.js';
import { getEffectiveStats, isAkimbo, isAutoFire, hasPowerCell, hasClusterRounds, hasLaserDot, hasSlowTrigger } from './progression.js';

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

let _thermalHl = null;
let _thermalActive = false;
let _thermalOverlay = null;
let _heatDelayTimer = 0;

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
export let isReloading = false;
export let reloadTimer = 0;
export let wepHeat = 0;
export let overheated = false;

let noAmmoTimer  = 0;
let _hudDirty    = false;
let _xVel        = 0;  // <-- Added horizontal velocity!
let _yVel        = 0;
let _zVel        = 0;  // <-- Added horizontal velocity!
let _jumpBufTimer = 0;
let _coyoteTimer  = 0;
let _wasOnGround  = false;
// Auto-unstuck: if player holds movement but barely moves for 1.5 s, nudge up
let _stuckTimer   = 0;
let _lastStuckPos = new BABYLON.Vector3();
// ── Slow Trigger burst state (ELECTRON special attachment) ────
let _burstShotsLeft = 0;   // shots remaining in current burst (0 = ready for new burst)
let _burstCooldown  = 0;   // inter-burst pause timer (seconds)

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

export function shoot() {
  if (wepCooldown > 0 || player.isReloading) return;
  const W = WDEFS[curWep];
  const hasInfiniteAmmo = player.buffs['infinite_ammo'] > 0;

  // 1. Heat Logic for Energy Weapons
  if (W.useHeat) {
    if (player.overheated) { sfx.noAmmo(); return; }

    // ── Slow Trigger burst gate (ELECTRON only) ────────────────
    if (curWep === 'ELECTRON' && hasSlowTrigger()) {
      if (_burstCooldown > 0) return;           // between-burst pause
      if (_burstShotsLeft === 0) _burstShotsLeft = 3; // start new burst
    }

    const heatMult = (curWep === 'ELECTRON' && hasSlowTrigger()) ? 0.30 : 1.0;
    player.wepHeat += W.heatPerShot * heatMult;
    _heatDelayTimer = 0.5;
    markHudDirty();
    if (player.wepHeat >= 1.0) {
      player.wepHeat = 1.0;
      player.overheated = true;
      sfx.noAmmo(); // Overheat warning
      return;
    }
  } 
  // 2. Magazine Logic for Standard Weapons
  else if (W.magSize && W.currentMag <= 0) {
    if (W.ammo <= 0 && !hasInfiniteAmmo) {
      sfx.noAmmo();
      const na = document.getElementById('noAmmo');
      if (na) { na.classList.add('show'); noAmmoTimer = 1.2; }
      return;
  }
    startReload();
    return;
  }
  // 3. Normal Ammo Logic
  else if (W.ammo !== Infinity && W.ammo < W.aps && !hasInfiniteAmmo) {
    sfx.noAmmo();
    const na = document.getElementById('noAmmo');
    if (na) { na.classList.add('show'); noAmmoTimer = 1.2; }
    return;
  }

  // Deduct Ammo
  if (W.magSize && !hasInfiniteAmmo) {
      W.currentMag--;
  } else if (W.ammo !== Infinity && !hasInfiniteAmmo) {
      W.ammo -= W.aps;
  }
  
  const cdMult = player.buffs['haste'] > 0 ? 0.5 : 1.0;
  setWepCooldown(W.cd * cdMult);
  setSwingT(1);
  refreshSlotHUD();

  // Damage & Spread
  const dmgMult = player.buffs['quad_damage'] > 0 ? 4 : 1;
  import('./progression.js').then(({ getEffectiveStats, isAkimbo, hasClusterRounds }) => {
      const EW      = getEffectiveStats(curWep, W);
      const modDmg  = EW.dmg * dmgMult;
      const spread  = EW.spread ?? W.spread;
      const range   = EW.range  ?? W.range;
      const falloff = EW.falloff ?? W.falloff ?? 0;
      const akimbo  = isAkimbo(curWep);

      switch (curWep) {
        case 'PISTOL':
          sfx.pistol();
          hitscan(_meshToEnemy, spread, modDmg, range, falloff);
          if (akimbo) hitscan(_meshToEnemy, spread * 1.15, modDmg * 0.85, range, falloff);
          break;
        case 'SMG':      sfx.smg();      hitscan(_meshToEnemy, spread, modDmg, range, falloff); break;
        case 'CHAINGUN': sfx.chaingun(); hitscan(_meshToEnemy, spread, modDmg, range, falloff); break;
        case 'RAILGUN':  sfx.railgun();  hitscan(_meshToEnemy, spread, 9999, range, 0.00); break;
        case 'SHOTGUN': 
          // Huge double-overlapping shotgun blast
          sfx.shotgun(); 
          setTimeout(() => sfx.shotgun(), 20); 
          pitch -= 0.06; // Camera kick recoil
          
          const pellets = EW.pellets ?? W.pellets;
          for (let i = 0; i < pellets; i++) hitscan(_meshToEnemy, spread, modDmg, range, falloff);
          if (akimbo) for (let i = 0; i < pellets; i++) hitscan(_meshToEnemy, spread * 1.2, modDmg * 0.8, range, falloff);
          break;
        case 'PLASMA':   
        case 'ELECTRON': 
          sfx.plasma(); firePlasma(); 
          break;
        case 'ION':      
          sfx.railgun(); hitscan(_meshToEnemy, spread, modDmg, range, 0.00); 
          break;
        case 'ROCKET':   sfx.rocket(); fireRocket(); break;
        case 'GLAUNCHER': 
          const fwd = new BABYLON.Vector3();
          camera.getForwardRay(1).direction.normalizeToRef(fwd);
          fwd.y += 0.05; fwd.normalize();
          const origin = camera.position.clone().add(fwd.scale(0.8));
          import('./projectiles.js').then(({ fireGrenade }) => {
              fireGrenade('player', origin, fwd, WDEFS.GLAUNCHER.projSpeed, modDmg, WDEFS.GLAUNCHER.splash, hasClusterRounds());
          });
          sfx.shotgun();
          break;
      }

      // ── Slow Trigger burst counter ─────────────────────────────
      if (curWep === 'ELECTRON' && hasSlowTrigger() && _burstShotsLeft > 0) {
        _burstShotsLeft--;
        if (_burstShotsLeft === 0) _burstCooldown = 0.45; // pause between bursts
      }
  });
}

export function startReload() {
    const W = WDEFS[curWep];
    if (!W.magSize || W.currentMag === W.magSize || W.ammo <= 0 || player.isReloading) return;
    player.isReloading = true;
    player.reloadTimer = 1.6; 
    sfx.pickup(); // Metal click sound
}

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
  player.buffs = {}; // Clear all active powerups
}

export function updatePlayer(dt, gameRunning, paused) {
  for (const key in player.buffs) { 
    if (player.buffs[key] > 0) { 
      player.buffs[key] -= dt; 
      if (player.buffs[key] <= 0) { 
        delete player.buffs[key]; 
        _hudDirty = true; 
      } 
    } 
  }
  
  if (!gameRunning || paused) return;

  if (wepCooldown > 0) setWepCooldown(wepCooldown - dt);
  if (_burstCooldown > 0) _burstCooldown = Math.max(0, _burstCooldown - dt);
  
  if (_jumpBufTimer > 0) _jumpBufTimer -= dt;
  if (_coyoteTimer  > 0) _coyoteTimer  -= dt;
  if (noAmmoTimer   > 0) {
    noAmmoTimer -= dt;
    if (noAmmoTimer <= 0) { 
      const na = document.getElementById('noAmmo'); 
      if (na) na.classList.remove('show'); 
    }
  }

  // Weapon Heat & Reload Loop Updates
  const W = WDEFS[curWep];
  if (W && W.useHeat) {
      if (curWep === 'ION' && isScoped) {
          player.wepHeat += dt * 0.15; // Slightly faster charge
          if (player.wepHeat >= 1.0) { player.wepHeat = 1.0; player.overheated = true; setScope(false); }
          markHudDirty();
      } else {
        if (_heatDelayTimer > 0) {
            _heatDelayTimer -= dt;
        } else if (player.wepHeat > 0) {
            player.wepHeat -= W.coolRate * dt;
            if (player.wepHeat <= 0) { player.wepHeat = 0; player.overheated = false; }
            markHudDirty();
        }
      }
    }

  if (player.isReloading) {
      player.reloadTimer -= dt;
      markHudDirty();
      if (player.reloadTimer <= 0) {
          player.isReloading = false;
          const needed = W.magSize - W.currentMag;
          const available = player.buffs['infinite_ammo'] ? needed : Math.min(needed, W.ammo);
          W.currentMag += available;
          if (!player.buffs['infinite_ammo']) W.ammo -= available;
          sfx.pickup(); 
          refreshSlotHUD();
      }
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
  if (mouseHeld && (AUTO_WEAPONS.has(curWep) || isAkimbo(curWep) || isAutoFire(curWep))) shoot();

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
    const px = _playerBody.position.x, py = _playerBody.position.y, pz = _playerBody.position.z;
    for (const pad of jumpPads) {
      // Add a height check so you don't trigger pads from the floor below!
      if (Math.abs(py - pad.pos.y) > 2.0) continue; 
      
      const dx = px - pad.pos.x, dz = pz - pad.pos.z;
      if (dx * dx + dz * dz < 1.0 * 1.0) { // Slightly larger radius
        _yVel = pad.force * 0.8; // Vertical push
        _xVel = pad.thrustX;     // Horizontal directional push
        _zVel = pad.thrustZ;     // Horizontal directional push
        player.onGround = false; 
        _coyoteTimer = 0; 
        break;
      }
    }
  }

  // Gravity
  if (!player.onGround) {
    _yVel -= GRAVITY * dt;
    if (_yVel < -TERM_VEL) _yVel = -TERM_VEL;
  }

  // Apply friction to external horizontal momentum
  const friction = player.onGround ? 8.0 : 2.5; 
  _xVel -= _xVel * friction * dt;
  _zVel -= _zVel * friction * dt;

  // Apply via Babylon collision (combines movement + knockback)
  const dispX = (_move.x + _xVel) * dt, dispY = _yVel * dt, dispZ = (_move.z + _zVel) * dt;
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
  if (_thermalActive && _thermalHl) {
    import('./gameState.js').then(({ enemies }) => {
        enemies.forEach(e => {
            if (e.alive && e.group) {
                e.group.getChildMeshes().forEach(m => {
                    // Give enemies an intense, blazing heat signature
                    if (!_thermalHl.hasMesh(m)) _thermalHl.addMesh(m, new BABYLON.Color3(1, 0.8, 0.1));
                });
            }
        });
    });
  }
}

  // ── Circular scope overlay (ACOG / thermal) ───────────────────
  function _drawCircleScope() {
    let el = document.getElementById('_circleScope');
    if (!el) {
      el = document.createElement('div');
      el.id = '_circleScope';
      el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:700;display:flex;align-items:center;justify-content:center;';
      el.innerHTML = '<canvas id="_circleScopeCanvas" style="position:absolute;inset:0;width:100%;height:100%"></canvas>';
      document.body.appendChild(el);
    }
    el.style.display = 'flex';
    const cv = document.getElementById('_circleScopeCanvas');
    const W = window.innerWidth, H = window.innerHeight;
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const R = Math.min(W, H) * 0.38;
    // Dark vignette outside
    ctx.fillStyle = 'rgba(0,0,0,0.88)'; ctx.fillRect(0, 0, W, H);
    // Punch clear circle
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(W/2, H/2, R, 0, Math.PI*2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // Rim
    ctx.strokeStyle = 'rgba(0,220,110,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(W/2, H/2, R, 0, Math.PI*2); ctx.stroke();
    // Crosshair
    ctx.strokeStyle = 'rgba(0,255,140,0.75)'; ctx.lineWidth = 1.2;
    const cht = R * 0.12;
    ctx.beginPath(); ctx.moveTo(W/2 - cht, H/2); ctx.lineTo(W/2 + cht, H/2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W/2, H/2 - cht); ctx.lineTo(W/2, H/2 + cht); ctx.stroke();
    // Mil-dot marks
    ctx.fillStyle = 'rgba(0,255,140,0.6)';
    for (let a = 0; a < 360; a += 45) {
      const rad = a * Math.PI / 180;
      ctx.beginPath(); ctx.arc(W/2 + Math.cos(rad)*R, H/2 + Math.sin(rad)*R, 2.5, 0, Math.PI*2); ctx.fill();
    }
    // Range marks inside circle
    ctx.strokeStyle = 'rgba(0,255,140,0.3)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(W/2, H/2, R*0.35, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(W/2, H/2, R*0.65, 0, Math.PI*2); ctx.stroke();
  }
  function _clearCircleScope() {
    const el = document.getElementById('_circleScope');
    if (el) el.style.display = 'none';
  }

  function setScope(enable) {
    const overlay = document.getElementById('scopeOverlay');
    if (enable && isAkimbo(curWep)) return;
    isScoped = enable;
    player.isScoped = enable;  // expose on player object so destroyRobot can read it synchronously
    
    import('./progression.js').then(({ getLoadout }) => {
        const sight = getLoadout(curWep).attachments?.sight;
        
        // Hide the entire gun model when using high-power/electronic scopes
        if (enable && ['acog', 'thermal', 'sniper_scope'].includes(sight)) {
            setWeaponVisibility(false);
        } else {
            setWeaponVisibility(true);
        }

        if (enable && sight === 'thermal') {
            _thermalActive = true;
            if (!_thermalOverlay) {
                _thermalOverlay = document.createElement('div');
                // Increased intensity: deep vignette with hard-light blending
                _thermalOverlay.style.cssText = 'position:fixed;inset:0;background:radial-gradient(circle, rgba(15,40,110,0.45) 0%, rgba(0,10,35,0.95) 100%); mix-blend-mode: hard-light; pointer-events:none; z-index:650; box-shadow: inset 0 0 120px rgba(0,0,0,1);';
                document.body.appendChild(_thermalOverlay);
            }
            _thermalOverlay.style.display = 'block';
            if (!_thermalHl) {
                _thermalHl = new BABYLON.HighlightLayer("thermalHl", scene);
                // Increased intensity: glowing hot spots
                _thermalHl.outerGlow = true;
                _thermalHl.innerGlow = true;
                _thermalHl.blurHorizontalSize = 2.0;
                _thermalHl.blurVerticalSize = 2.0;
            }
        } else {
            _thermalActive = false;
            if (_thermalOverlay) _thermalOverlay.style.display = 'none';
            if (_thermalHl) _thermalHl.removeAllMeshes();
        }
    });

    if (enable) {
      let adsFov = null;
      try { if (window.__getAdsFov) adsFov = window.__getAdsFov(curWep); } catch {}

      if (adsFov !== null) {
        camera.fov = adsFov;
        // Show square railgun reticle only for high-zoom on railgun
        const isRailScope = curWep === 'RAILGUN' && adsFov < DEFAULT_FOV * 0.6;
        if (overlay) overlay.style.display = isRailScope ? 'block' : 'none';
        // Show circular overlay for scopes that declare scopeShape:'circle'
        const shape = window.__getScopeShape ? window.__getScopeShape(curWep) : null;
        if (shape === 'circle') _drawCircleScope();
        else _clearCircleScope();
      } else if (curWep === 'RAILGUN') {
        camera.fov = SCOPE_FOV;
        if (overlay) overlay.style.display = 'block';
        _clearCircleScope();
      } else {
        camera.fov = DEFAULT_FOV * 0.88;
        if (overlay) overlay.style.display = 'none';
        _clearCircleScope();
      }
    } else {
      camera.fov = DEFAULT_FOV;
      if (overlay) overlay.style.display = 'none';
      _clearCircleScope();
    }
  }

export let isScoped = false;
// ── Input wiring (called ONCE from main.js) ───────────────────
export function setupInput(getGameRunning, getPaused, onTogglePause, onPickupWeapon) {
  const cnv = document.getElementById('c');

  // Cache progression helpers for synchronous use inside event handlers
  import('./progression.js').then(({ getAdsFov, getScopeShape }) => {
    window.__getAdsFov    = getAdsFov;
    window.__getScopeShape = getScopeShape;
  });


  cnv.addEventListener('pointerdown', e => { if (e.button === 2) setScope(true);  }, true);
  cnv.addEventListener('mousedown',   e => { if (e.button === 2) setScope(true);  }, true);
  cnv.addEventListener('pointerup',   e => { if (e.button === 2) setScope(false); }, true);
  cnv.addEventListener('mouseup',     e => { if (e.button === 2) setScope(false); }, true);
  document.addEventListener('mouseup',   e => { if (e.button === 2) setScope(false); });
  document.addEventListener('pointerup', e => { if (e.button === 2) setScope(false); });
  //scene.onBeforeRenderObservable.add(() => { if (isScoped && curWep !== 'RAILGUN') setScope(false); }); // Other weapons can also scope

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
      e.preventDefault(); 
      _jumpBufTimer = JUMP_BUFFER;
    }

    if (!getGameRunning()) return;

    // Slot selection
    if (e.code === 'Digit1') setActiveSlot(0);
    if (e.code === 'Digit2') setActiveSlot(1);
    if (e.code === 'Digit3') setActiveSlot(2); // <--- Access the Pistol

    // Improved Quick Swap (Q)
    if (e.code === 'KeyQ') {
      // Swaps between slot 1 and 2 if you have a primary weapon, 
      // otherwise toggles between whatever you have and the pistol.
      let other = activeSlot === 0 ? 1 : 0;
      if (activeSlot === 2) other = 0; // If on pistol, go to primary
      if (inventory[other] || other === 2) {
          setActiveSlot(other);
      } else {
          setActiveSlot(2); // Fallback to pistol
      }
    }

    if (e.code === 'KeyF')   onPickupWeapon();
    if (e.code === 'Escape') onTogglePause();
    if (e.code === 'KeyR') {
        startReload();
    };
    if (e.code === 'KeyV' && curWep === 'PLASMA') {
      player.plasmaAltMode = !player.plasmaAltMode;
      // Force HUD update so the hint text changes immediately
      cb.markHudDirty?.(); 
    }
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

export function applyExplosionImpulse(explosionPos, maxRadius, force) {
  const dist = BABYLON.Vector3.Distance(camera.position, explosionPos);
  
  if (dist < maxRadius) {
    const power = (1 - dist / maxRadius) * force;
    
    // Calculate direction FROM the explosion TO the player
    const dir = camera.position.subtract(explosionPos).normalize();
    
    // Rocket jump logic: massive bonus vertical power if already jumping
    const jumpBonus = (!player.onGround && _yVel > 0) ? 1.8 : 1.0; 
    
    // Apply directional pushes (Multiply X/Z to make horizontal knockback feel impactful)
    _xVel += dir.x * power * 2.5; 
    _zVel += dir.z * power * 2.5;
    
    // Apply vertical push (always add a little baseline upward pop)
    _yVel += (dir.y * power * jumpBonus) + (power * 0.4); 
  }
}