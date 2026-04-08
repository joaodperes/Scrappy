// player.js – player state, movement, input, hurt, death  (Babylon.js port)
const BABYLON = window.BABYLON;
import { scene, camera } from './scene.js';
import { jumpPads } from './level.js';
import { player, cb } from './gameState.js';
import { sfx } from './audio.js';
import { WDEFS, inventory, activeSlot, curWep, wepCooldown, swingT, AUTO_WEAPONS, setWepCooldown, setSwingT, setActiveSlot, refreshSlotHUD, setWeaponVisibility } from './weapons.js';
import { hitscan, fireRocket, firePlasma, fireGrenade } from './projectiles.js';
import { _meshToEnemy } from './enemies.js';
// Static imports eradicate the Promise crashes in the shoot/input loop!
import { getEffectiveStats, isAkimbo, isAutoFire, hasPowerCell, hasClusterRounds, hasLaserDot, hasSlowTrigger, hasDualTrigger, hasEnergyConverter, getLoadout, getAdsFov, getScopeShape } from './progression.js';

export const PH = 1.72, PR = .44;
const SPD_WALK   = 13;
const SPD_SPRINT = 19;
const JV         = 9.8;
const GRAVITY    = 26;
const TERM_VEL   = 40;
const DEFAULT_FOV = 1.48;
const SCOPE_FOV   = 0.32;
const COYOTE_TIME = 0.10;  
const JUMP_BUFFER = 0.14;  

let _thermalHl = null;
let _thermalActive = false;
let _thermalOverlay = null;
let _heatDelayTimer = 0;

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
let _xVel        = 0;  
let _yVel        = 0;
let _zVel        = 0;  
let _jumpBufTimer = 0;
let _coyoteTimer  = 0;
let _wasOnGround  = false;
let _stuckTimer   = 0;
let _lastStuckPos = new BABYLON.Vector3();

// Burst state
let _burstShotsLeft = 0;   
let _burstCooldown  = 0;   

function _getPointerLockElement() { return document.pointerLockElement || document.mozPointerLockElement || document.webkitPointerLockElement || null; }
function _isCanvasLocked(cnv) { return _getPointerLockElement() === cnv; }
function _requestCanvasPointerLock(cnv) { const req = cnv.requestPointerLock || cnv.mozRequestPointerLock || cnv.webkitRequestPointerLock; if (req) req.call(cnv); }

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
  // Synchronous burst cooldown block prevents full-auto bypass
  if (wepCooldown > 0 || player.isReloading || _burstCooldown > 0) return;
  const W = WDEFS[curWep];
  const EW = getEffectiveStats(curWep, W); // Grab effective stats immediately

  const hasInfiniteAmmo = player.buffs['infinite_ammo'] > 0 || W.ammo === Infinity;
  const isEnergy = W.useHeat || (curWep === 'PLASMA' && hasEnergyConverter());

  // 1. Energy Logic
  if (isEnergy) {
    if (W.isOverheated) { sfx.noAmmo(); return; }

    let heatMult = 1.0;
    if (curWep === 'ELECTRON' && hasSlowTrigger()) {
      if (_burstShotsLeft === 0) _burstShotsLeft = 3; 
      heatMult = 0.34; // 1 heat cost divided by 3 bullets
    } else if (curWep === 'PLASMA' && hasDualTrigger() && !player.plasmaAltMode) {
      if (_burstShotsLeft === 0) _burstShotsLeft = 3;
      heatMult = 0.34;
    }

    const cost = (player.plasmaAltMode && curWep === 'PLASMA') ? (W.heatPerShot * 3) : (W.heatPerShot * heatMult);
    W.heat = Math.min(1.0, (W.heat || 0) + cost);
    _heatDelayTimer = 0.5;
    markHudDirty();
    
    if (W.heat >= 1.0) { 
      W.heat = 1.0;
      W.isOverheated = true;
      sfx.noAmmo();
      return;
    }
  }
  // 2. Ballistic Logic (Including Pistol Mag Check)
  else if (EW.magSize && W.currentMag <= 0) {
    if (W.ammo <= 0 && !hasInfiniteAmmo) {
        sfx.noAmmo();
        const na = document.getElementById('noAmmo');
        if (na) { na.classList.add('show'); noAmmoTimer = 1.2; }
        return;
    }
    startReload();
    return;
  }
  else if (!EW.magSize && !hasInfiniteAmmo && W.ammo < W.aps) {
    sfx.noAmmo();
    const na = document.getElementById('noAmmo');
    if (na) { na.classList.add('show'); noAmmoTimer = 1.2; }
    return;
  }

  if (!isEnergy) {
      if (EW.magSize) {
          const cost = (player.plasmaAltMode && curWep === 'PLASMA') ? 3 : 1;
          W.currentMag -= cost;
      } else if (!hasInfiniteAmmo) {
          W.ammo -= W.aps;
      }
  }

  const cdMult = player.buffs['haste'] > 0 ? 0.5 : 1.0;
  if (curWep === 'PLASMA' && player.plasmaAltMode) {
      setWepCooldown(1.2 * cdMult);
  } else {
      setWepCooldown(W.cd * cdMult);
  }
  
  setSwingT(1);
  refreshSlotHUD();

  const dmgMult = player.buffs['quad_damage'] > 0 ? 4 : 1;
  let modDmg    = EW.dmg * dmgMult;
  const spread  = EW.spread ?? W.spread;
  const range   = EW.range  ?? W.range;
  const falloff = EW.falloff ?? W.falloff ?? 0;
  const akimbo  = isAkimbo(curWep);

  if (curWep === 'PLASMA' && player.plasmaAltMode) modDmg *= 3.0;

  switch (curWep) {
    case 'PISTOL':  
      // FIX: Synchronous mag check restores Pistol sounds
      sfx.pistol(getLoadout('PISTOL').attachments?.magazine ?? null);
      hitscan(_meshToEnemy, spread, modDmg, range, falloff);
      if (akimbo) hitscan(_meshToEnemy, spread * 1.15, modDmg * 0.85, range, falloff);
      break;
    case 'SMG':      sfx.smg();      hitscan(_meshToEnemy, spread, modDmg, range, falloff); break;
    case 'CHAINGUN': sfx.chaingun(); hitscan(_meshToEnemy, spread, modDmg, range, falloff); break;
    case 'RAILGUN':  sfx.railgun();  hitscan(_meshToEnemy, spread, 9999, range, 0.00); break;
    case 'ION':      
      // FIX: ION Damage scales based on how much it was allowed to heat up!
      const ionChargeBonus = 1.0 + ((W.heat || 0) * 1.5); // Up to +150% damage
      sfx.railgun();  
      hitscan(_meshToEnemy, spread, modDmg * ionChargeBonus, range, 0.00); 
      break;
    case 'PLASMA':   
      sfx.plasma();   
      if (player.plasmaAltMode) {
          hitscan(_meshToEnemy, spread, modDmg, range, 0); 
      } else {
          firePlasma(modDmg); 
      }
      break;
    case 'ELECTRON': sfx.plasma();   hitscan(_meshToEnemy, spread, modDmg, range, falloff); break;
    case 'ROCKET':   sfx.rocket();   fireRocket(); break;
    case 'SHOTGUN': 
      sfx.shotgun(); setTimeout(() => sfx.shotgun(), 20); pitch -= 0.06;
      const pellets = EW.pellets ?? W.pellets;
      for (let i = 0; i < pellets; i++) hitscan(_meshToEnemy, spread, modDmg, range, falloff);
      if (akimbo) for (let i = 0; i < pellets; i++) hitscan(_meshToEnemy, spread * 1.2, modDmg * 0.8, range, falloff);
      break;
    case 'GLAUNCHER': 
      const fwd = new BABYLON.Vector3();
      camera.getForwardRay(1).direction.normalizeToRef(fwd);
      fwd.y += 0.05; fwd.normalize();
      const origin = camera.position.clone().add(fwd.scale(0.8));
      fireGrenade('player', origin, fwd, WDEFS.GLAUNCHER.projSpeed, modDmg, WDEFS.GLAUNCHER.splash, hasClusterRounds());
      sfx.shotgun();
      break;
  }

  // ── Burst Decrements ──
  if (curWep === 'ELECTRON' && hasSlowTrigger() && _burstShotsLeft > 0) {
    _burstShotsLeft--;
    if (_burstShotsLeft === 0) _burstCooldown = 0.45;
  }
  if (curWep === 'PLASMA' && hasDualTrigger() && !player.plasmaAltMode && _burstShotsLeft > 0) {
    _burstShotsLeft--;
    if (_burstShotsLeft === 0) _burstCooldown = 0.40;
  }
  
  if (!isEnergy && EW.magSize && W.currentMag <= 0 && (W.ammo > 0 || hasInfiniteAmmo)) {
      startReload();
  }
}

export function startReload() {
  const W = WDEFS[curWep];
  const EW = getEffectiveStats(curWep, W); // Calculate effective capacity
  
  const isEnergy = W.useHeat || (curWep === 'PLASMA' && hasEnergyConverter());
  // Respect effective mag size
  if (isEnergy || !EW.magSize || W.currentMag >= EW.magSize || (W.ammo <= 0 && W.ammo !== Infinity) || player.isReloading) return;
  
  player.isReloading = true;
  
  let speedMult = player.buffs['haste'] > 0 ? 0.5 : 1.0;
  if (EW.cd < W.cd) speedMult *= 0.85; 
  
  player.reloadTimer = (EW.reloadTime || W.reloadTime || 1.6) * speedMult; 
  player.maxReloadTimer = player.reloadTimer; 
  sfx.pickup(); 
}

const _fwd  = new BABYLON.Vector3();
const _right = new BABYLON.Vector3();
const _move  = new BABYLON.Vector3();
const _UP    = new BABYLON.Vector3(0, 1, 0);

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
  player.buffs = {}; 
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

  // Actually subtract heat delay timer!
  if (_heatDelayTimer > 0) _heatDelayTimer -= dt;

  // ── Background Weapon Heat & Scope Heating Loop ──
    for (const wName in WDEFS) {
        const wDef = WDEFS[wName];
        // ... [Keep scope heating logic] ...

        if (_heatDelayTimer <= 0 && wDef.heat > 0) {
            // FIX: coolRate is a whole number percentage (e.g. 35). Divide by 100 so it cools over ~3 seconds.
            wDef.heat -= ((wDef.coolRate || 25) / 100) * dt; 
            if (wDef.heat <= 0) { 
                wDef.heat = 0; 
                wDef.isOverheated = false; 
            }
            if (curWep === wName) markHudDirty();
        }
    }

    const W = WDEFS[curWep]; 
    
    if (player.isReloading) {
        player.reloadTimer -= dt;
        markHudDirty();
        if (player.reloadTimer <= 0) {
            player.isReloading = false;
            const EW = getEffectiveStats(curWep, W); // Use effective stats!
            const needed = EW.magSize - W.currentMag;
            const available = player.buffs['infinite_ammo'] ? needed : Math.min(needed, W.ammo);
            W.currentMag += available;
            if (!player.buffs['infinite_ammo']) W.ammo -= available;
            sfx.pickup(); 
            refreshSlotHUD();
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

  // FIX: Don't allow full auto for Plasma Sniper
  const isPlasmaSniper = curWep === 'PLASMA' && player.plasmaAltMode;
  const isAuto = AUTO_WEAPONS.has(curWep) && !isPlasmaSniper;
  
  if (mouseHeld && (isAuto || isAkimbo(curWep) || isAutoFire(curWep))) shoot();

  const canJump    = player.onGround || (_coyoteTimer > 0);
  const jumpWanted = keys['Space'] || (_jumpBufTimer > 0);
  if (jumpWanted && canJump) {
    _yVel           = JV;
    player.onGround = false;
    _coyoteTimer    = 0;
    _jumpBufTimer   = 0;
  }

  if (player.onGround) {
    const px = _playerBody.position.x, py = _playerBody.position.y, pz = _playerBody.position.z;
    for (const pad of jumpPads) {
      if (Math.abs(py - pad.pos.y) > 2.0) continue; 
      const dx = px - pad.pos.x, dz = pz - pad.pos.z;
      if (dx * dx + dz * dz < 1.0 * 1.0) { 
        _yVel = pad.force * 0.8; 
        _xVel = pad.thrustX;     
        _zVel = pad.thrustZ;     
        player.onGround = false; 
        _coyoteTimer = 0; 
        break;
      }
    }
  }

  if (!player.onGround) {
    _yVel -= GRAVITY * dt;
    if (_yVel < -TERM_VEL) _yVel = -TERM_VEL;
  }

  const friction = player.onGround ? 8.0 : 2.5; 
  _xVel -= _xVel * friction * dt;
  _zVel -= _zVel * friction * dt;

  const dispX = (_move.x + _xVel) * dt, dispY = _yVel * dt, dispZ = (_move.z + _zVel) * dt;
  const preY  = _playerBody.position.y;
  _playerBody.moveWithCollisions(new BABYLON.Vector3(dispX, dispY, dispZ));

  if (_playerBody.position.y < -3) {
    _playerBody.position.y = PH; _yVel = 0; player.onGround = true; _wasOnGround = true;
  }
  camera.position.copyFrom(_playerBody.position);

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

  const wantMove = mLen2 > 0.01;
  if (wantMove) {
    const moved = BABYLON.Vector3.Distance(_playerBody.position, _lastStuckPos);
    if (moved < 0.25) {
      _stuckTimer += dt;
      if (_stuckTimer > 1.5) {
        _yVel = JV * 0.8;           
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
                    if (!_thermalHl.hasMesh(m)) _thermalHl.addMesh(m, new BABYLON.Color3(1, 0.8, 0.1));
                });
            }
        });
    });
  }
}

  // ── Scopes ────────────────────────────────────────────────────────
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
    ctx.fillStyle = 'rgba(0,0,0,0.88)'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(W/2, H/2, R, 0, Math.PI*2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(0,220,110,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(W/2, H/2, R, 0, Math.PI*2); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,255,140,0.75)'; ctx.lineWidth = 1.2;
    const cht = R * 0.12;
    ctx.beginPath(); ctx.moveTo(W/2 - cht, H/2); ctx.lineTo(W/2 + cht, H/2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W/2, H/2 - cht); ctx.lineTo(W/2, H/2 + cht); ctx.stroke();
    ctx.fillStyle = 'rgba(0,255,140,0.6)';
    for (let a = 0; a < 360; a += 45) {
      const rad = a * Math.PI / 180;
      ctx.beginPath(); ctx.arc(W/2 + Math.cos(rad)*R, H/2 + Math.sin(rad)*R, 2.5, 0, Math.PI*2); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,255,140,0.3)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(W/2, H/2, R*0.35, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(W/2, H/2, R*0.65, 0, Math.PI*2); ctx.stroke();
  }

  // FIX: Visual UI Overlay for Holo sight
  function _drawHoloScope() {
      let el = document.getElementById('_holoScope');
      if (!el) {
        el = document.createElement('div');
        el.id = '_holoScope';
        el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:700;display:flex;align-items:center;justify-content:center;';
        el.innerHTML = '<div style="width:140px;height:140px;border:2px solid rgba(0,255,255,0.4);border-radius:50%;position:relative;"><div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:4px;height:4px;background:rgba(0,255,255,0.8);border-radius:50%;"></div><div style="position:absolute;top:100%;left:50%;transform:translateX(-50%);width:2px;height:15px;background:rgba(0,255,255,0.4);"></div><div style="position:absolute;bottom:100%;left:50%;transform:translateX(-50%);width:2px;height:15px;background:rgba(0,255,255,0.4);"></div><div style="position:absolute;top:50%;left:100%;transform:translateY(-50%);width:15px;height:2px;background:rgba(0,255,255,0.4);"></div><div style="position:absolute;top:50%;right:100%;transform:translateY(-50%);width:15px;height:2px;background:rgba(0,255,255,0.4);"></div></div>';
        document.body.appendChild(el);
      }
      el.style.display = 'flex';
  }

  function _clearScopes() {
      const circ = document.getElementById('_circleScope');
      if (circ) circ.style.display = 'none';
      const holo = document.getElementById('_holoScope');
      if (holo) holo.style.display = 'none';
  }

  export function setScope(enable) {
    const overlay = document.getElementById('scopeOverlay');
    if (enable && isAkimbo(curWep)) return;
    isScoped = enable;
    player.isScoped = enable; 
    
    const sight = getLoadout(curWep).attachments?.sight;
    
    if (enable && ['acog', 'thermal', 'sniper_scope'].includes(sight)) {
        setWeaponVisibility(false);
    } else {
        setWeaponVisibility(true);
    }

    if (enable && sight === 'thermal') {
        _thermalActive = true;
        if (!_thermalOverlay) {
            _thermalOverlay = document.createElement('div');
            _thermalOverlay.style.cssText = 'position:fixed;inset:0;background:radial-gradient(circle, rgba(15,40,110,0.45) 0%, rgba(0,10,35,0.95) 100%); mix-blend-mode: hard-light; pointer-events:none; z-index:650; box-shadow: inset 0 0 120px rgba(0,0,0,1);';
            document.body.appendChild(_thermalOverlay);
        }
        _thermalOverlay.style.display = 'block';
        if (!_thermalHl) {
            _thermalHl = new BABYLON.HighlightLayer("thermalHl", scene);
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

    if (enable) {
      let adsFov = getAdsFov(curWep);
      let shape = getScopeShape(curWep);

      if (adsFov !== null) {
        camera.fov = adsFov;
        const isRailScope = curWep === 'RAILGUN' && adsFov < DEFAULT_FOV * 0.6;
        if (overlay) overlay.style.display = isRailScope ? 'block' : 'none';
        
        _clearScopes();
        if (shape === 'circle') _drawCircleScope();
        //else if (shape === 'holo') _drawHoloScope();
      } else if (curWep === 'RAILGUN') {
        camera.fov = SCOPE_FOV;
        if (overlay) overlay.style.display = 'block';
        _clearScopes();
      } else {
        camera.fov = DEFAULT_FOV * 0.88;
        if (overlay) overlay.style.display = 'none';
        _clearScopes();
      }
    } else {
      camera.fov = DEFAULT_FOV;
      if (overlay) overlay.style.display = 'none';
      _clearScopes();
    }
  }

export let isScoped = false;

export function setupInput(getGameRunning, getPaused, onTogglePause, onPickupWeapon) {
  const cnv = document.getElementById('c');

  cnv.addEventListener('pointerdown', e => { if (e.button === 2) setScope(true);  }, true);
  cnv.addEventListener('mousedown',   e => { if (e.button === 2) setScope(true);  }, true);
  cnv.addEventListener('pointerup',   e => { if (e.button === 2) setScope(false); }, true);
  cnv.addEventListener('mouseup',     e => { if (e.button === 2) setScope(false); }, true);
  document.addEventListener('mouseup',   e => { if (e.button === 2) setScope(false); });
  document.addEventListener('pointerup', e => { if (e.button === 2) setScope(false); });

  let _lastFireMs = 0;
  const tryFirePrimary = (button, target) => {
    if (button !== 0) return;
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

    if (e.code === 'Digit1') setActiveSlot(0);
    if (e.code === 'Digit2') setActiveSlot(1);
    if (e.code === 'Digit3') setActiveSlot(2);

    if (e.code === 'KeyQ') {
      let other = activeSlot === 0 ? 1 : 0;
      if (activeSlot === 2) other = 0; 
      if (inventory[other] || other === 2) {
          setActiveSlot(other);
      } else {
          setActiveSlot(2);
      }
    }

    if (e.code === 'KeyF')   onPickupWeapon();
    if (e.code === 'Escape') onTogglePause();
    if (e.code === 'KeyR')   startReload();
    
    if (e.code === 'KeyV' && curWep === 'PLASMA') {
      player.plasmaAltMode = !player.plasmaAltMode;
      cb.markHudDirty?.(); 
    }
  });
  document.addEventListener('keyup', e => { keys[e.code] = false; });

  cnv.addEventListener('pointerdown', e => {
    try { cnv.setPointerCapture(e.pointerId); } catch (_) {}
  });
  cnv.addEventListener('pointermove', e => {
    if (getPaused()) return;
    yaw   += e.movementX * .0022;
    pitch += e.movementY * .0022;
    pitch  = Math.max(-1.28, Math.min(1.28, pitch));
  });
  document.addEventListener('pointermove', e => {
    if (!_isCanvasLocked(cnv)) return; 
    if (getPaused()) return;
    yaw   += e.movementX * .0022;
    pitch += e.movementY * .0022;
    pitch  = Math.max(-1.28, Math.min(1.28, pitch));
  });

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
    const dir = camera.position.subtract(explosionPos).normalize();
    const jumpBonus = (!player.onGround && _yVel > 0) ? 1.8 : 1.0; 
    
    _xVel += dir.x * power * 2.5; 
    _zVel += dir.z * power * 2.5;
    _yVel += (dir.y * power * jumpBonus) + (power * 0.4); 
  }
}