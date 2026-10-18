// player.js – player state, movement, input, hurt, death  (Babylon.js port)
const BABYLON = window.BABYLON;
import { scene, camera } from './scene.js';
import { jumpPads } from './level.js';
import { player, cb, enemies } from './gameState.js';
import { sfx } from './audio.js';
import { WDEFS, inventory, activeSlot, curWep, wepCooldown, swingT, AUTO_WEAPONS, setWepCooldown, setSwingT, setActiveSlot, refreshSlotHUD, setWeaponVisibility } from './weapons.js';
import { hitscan, fireRocket, firePlasma, fireGrenade, fireFlame, spawnLightningArc, fireRivet } from './projectiles.js';
import { _meshToEnemy } from './enemies.js';
import { spawnSparks } from './particles.js';
import { getCurrentMap, getMapMeta } from './mapManager.js';

// Static imports eradicate the Promise crashes in the shoot/input loop!
import {
  getEffectiveStats, isAkimbo, isAutoFire, hasPowerCell, hasClusterRounds,
  hasLaserDot, hasSlowTrigger, hasDualTrigger, hasEnergyConverter,
  hasFreefallCoil, hasSuppressor, getSpeedMult, hasRocketBurst, hasMagnetCoil,
  getLoadout, getAdsFov, getScopeShape
} from './progression.js';

BABYLON.Effect.ShadersStore["nvgFragmentShader"] = `
varying vec2 vUV;
uniform sampler2D textureSampler;

void main(void)
{
    vec4 c = texture2D(textureSampler, vUV);

    float lum = dot(c.rgb, vec3(0.299,0.587,0.114));
    lum = pow(lum, 0.7);
    vec3 nvg = vec3(lum * 0.03, lum * 3.5, lum * 0.05);

    // Isolate Red and Yellow from the highlight layer
    // Yellow is (1,1,0), Red is (1,0,0). This formula isolates those while ignoring green.
    float highlight = clamp((c.r - c.g * 0.5 - c.b) * 2.0, 0.0, 1.0);

    // Mix the green NVG with the original color based on the highlight intensity
    gl_FragColor = vec4(mix(nvg, c.rgb, highlight), 1.0);
}
`;

// Create a state variable to hold the active effect
let _nvPostProcess = null;
let _nvgActive = false;
let _nvgHl = null;
let _aegisHl = null;
export let jetpackHeat = 0;
let _jetpackOverheated = false;

export const PH = 1.72, PR = .44;
const SPD_WALK   = 13;
const SPD_SPRINT = 19;
const JV         = 9.8;
const GRAVITY    = 26;
const TERM_VEL   = 40;
const DEFAULT_FOV = 1.48;
const SCOPE_FOV   = 0.32;
const COYOTE_TIME = 0.18;  
const JUMP_BUFFER = 0.14;  

let _thermalHl = null;
let _thermalActive = false;
let _thermalOverlay = null;
let _heatDelayTimer = 0;

export const _playerBody = BABYLON.MeshBuilder.CreateBox('_playerBody', { size: 0.01 }, scene);
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

let _lavaHitTimer = 0;
const LAVA_HIT_INTERVAL = 0.6;

export function hurtPlayer(rawDmg, { hazardType = null} = {}) {
  if (!cb.isGameRunning?.()) return;

  let d = rawDmg;
  if (player.armor > 0) {
    const absorb = Math.min(player.armor, d);
    player.armor -= absorb;
    d -= absorb;
  }
  if (d > 0) player.hp = Math.max(0, player.hp - d);
  if ( hazardType === 'LAVA') {
    if (_lavaHitTimer <= 0) {
        sfx.lavaDamage();   // deeper sound defined in audio.js
        _lavaHitTimer = LAVA_HIT_INTERVAL;
    }
  } else {
    sfx.playerHit();
  }
  const fl = document.getElementById('damageFlash');
  if (fl) { fl.classList.add('flash'); setTimeout(() => fl.classList.remove('flash'), 170); }
  markHudDirty();
  if (player.hp <= 0) {
    cb.endGame?.();
  }
}

export function shoot() {
  // Synchronous burst cooldown block prevents full-auto bypass
  if (wepCooldown > 0 || player.isReloading || _burstCooldown > 0) return;
  const W = WDEFS[curWep];
  const EW = getEffectiveStats(curWep, W); // Grab effective stats immediately

  const hasInfiniteAmmo = player.buffs['infinite_ammo'] > 0 || EW.ammo === Infinity;
  const isEnergy = W.useHeat || (curWep === 'PLASMA' && hasEnergyConverter());
  const isBurstWeapon = (curWep === 'PLASMA' && hasDualTrigger() && !player.plasmaAltMode) || curWep === 'COMET';

  
  if (isBurstWeapon) {
    const EW = getEffectiveStats(curWep, W);
    if (_burstShotsLeft <= 0) _burstShotsLeft = EW.burstCount || 3;
}

  // 1. Energy Logic
  if (isEnergy) {
    if (W.isOverheated) { sfx.noAmmo(); return; }

    // Grab the base multiplier
    let heatMult = EW.heatMult || 1.0;
    if (curWep === 'ELECTRON' && hasSlowTrigger()) {
      if (_burstShotsLeft === 0) _burstShotsLeft = 3; 
      heatMult = 0.34; 
    } else if (curWep === 'PLASMA' && hasDualTrigger() && !player.plasmaAltMode) {
      if (_burstShotsLeft === 0) _burstShotsLeft = 3;
      heatMult = 0.34;
    } else if (curWep === 'ELECTRON' && hasFreefallCoil() && !player.onGround) {
      heatMult *= 0.65; // 35% heat reduction while airborne. 
      // Two things to note here:
      // First, it's a *= multiplier so it stacks correctly with haste — if both are active, heat is 0.65 × 0.5 = 0.325 of base, not a flat override
      // Second, slow_trigger sets heatMult = 0.34 before this runs, so a player with both attachments equipped would get 0.34 × 0.65 = 0.22 of base heat while airborne
    }
    // --- Haste Powerup reduces heat generation by 50% ---
    if (player.buffs['haste'] > 0) {
        heatMult *= 0.5;
    }

    const cost = (player.plasmaAltMode && curWep === 'PLASMA') ? (W.heatPerShot * 3) : (W.heatPerShot * heatMult);
    
    // --- Only bypass heat if the actual BUFF is active ---
    const hasInfiniteAmmoBuff = player.buffs['infinite_ammo'] > 0;
    if (!hasInfiniteAmmoBuff) {
        W.heat = Math.min(1.0, (W.heat || 0) + cost);
        _heatDelayTimer = 0.5;
        markHudDirty();
    }
    
    if (W.heat >= 1.0) { 
      W.heat = 1.0;
      W.isOverheated = true;
      sfx.noAmmo();
      return;
    }
  }
  // 2. Ballistic Logic (Including Pistol Mag Check & Burst Cost)
  // Calculate the cost for non-energy weapons safely in this scope
  const ballisticCost = (curWep === 'COMET') ? (EW.burstCount || 3) : ((player.plasmaAltMode && curWep === 'PLASMA') ? 3 : 1);

  if (EW.magSize && W.currentMag < ballisticCost) {
    if (W.ammo <= 0 && !hasInfiniteAmmo) {
        sfx.noAmmo();
        const na = document.getElementById('noAmmo');
        if (na) { na.classList.add('show'); noAmmoTimer = 1.2; }
        return;
    }
    startReload();
    return;
  }
  else if (!EW.magSize && !hasInfiniteAmmo && W.ammo < (W.aps * ballisticCost)) {
    sfx.noAmmo();
    const na = document.getElementById('noAmmo');
    if (na) { na.classList.add('show'); noAmmoTimer = 1.2; }
    return;
  }

  if (!isEnergy) {
      const hasInfinite = player.buffs['infinite_ammo'] > 0;
      if (EW.magSize) {
          if (!hasInfinite) {
              W.currentMag -= ballisticCost;
          }
      } else if (!hasInfinite) {
          W.ammo -= (W.aps * ballisticCost);
      }
  }

  const cdMult = player.buffs['haste'] > 0 ? 0.5 : 1.0;
  
  if (isBurstWeapon) {
      setWepCooldown((WDEFS[curWep].burstDelay || 0.08) * cdMult);
  } else if (curWep === 'PLASMA' && player.plasmaAltMode) {
      setWepCooldown(1.2 * cdMult); // Slow sniper reload
  } else {
      setWepCooldown(W.cd * cdMult);
  }
  
  if (curWep === 'COMET') {
      setSwingT(0.2); // Light animation for the initial trigger pull
  } else {
      setSwingT(1);   // Standard full recoil
  };
  refreshSlotHUD();

  const dmgMult = player.buffs['quad_damage'] > 0 ? 4 : 1;
  let modDmg    = EW.dmg * dmgMult;
  const spread  = EW.spread ?? W.spread;
  const range   = EW.range  ?? W.range;
  const falloff = EW.falloff ?? W.falloff ?? 0;
  const akimbo  = isAkimbo(curWep);

  if (curWep === 'PLASMA' && player.plasmaAltMode) modDmg *= 3.0;
  // ── Recoil & Spread System ──────────────────────────────────
  // Energy weapons have zero recoil (they're beam/energy based)
  const energyNoRecoil = isEnergy;

  // Calculate sustained fire timers for SMG and Chaingun
  const now = performance.now() / 1000; // seconds
  if (!player._sustainedFire) player._sustainedFire = 0;
  if (!player._lastFireTime) player._lastFireTime = now;

  const dtSustained = now - player._lastFireTime;
  player._lastFireTime = now;

  if (mouseHeld) {
      player._sustainedFire += dtSustained;
  } else {
      player._sustainedFire = Math.max(0, player._sustainedFire - dtSustained * 3); // decay when not firing
  }

  // Reset sustained fire when switching weapons
  if (player._lastWep !== curWep) {
      player._sustainedFire = 0;
      player._lastWep = curWep;
  }

  let recoilMult = (EW.recoilMult || 1.0);
  let spreadMult = 1.0;

  // Pistol .50 cal: massive recoil increase
  if (curWep === 'PISTOL' && getLoadout('PISTOL').attachments?.magazine === 'mag_50_cal') {
      recoilMult *= 2.5;
  }

  // Shotgun: heavy recoil
  if (curWep === 'SHOTGUN') {
      recoilMult = (recoilMult || 1.0) * 3.5; // Base heavy recoil, reducible by attachments
  }

  // SMG: increasing spread and recoil with sustained fire (ramps over 3 seconds)
  if (curWep === 'SMG') {
      const sustainedRatio = Math.min(1.0, player._sustainedFire / 3.0);
      spreadMult = 1.0 + sustainedRatio * 2.0; // Up to 3x spread after 3s
      recoilMult *= (sustainedRatio * 1.1); // Up to 1.5x recoil
  }

  // Chaingun: massive spread increase from spinning module or sustained fire
  if (curWep === 'CHAINGUN') {
      const sustainedRatio = Math.min(1.0, player._sustainedFire / 4.0);
      spreadMult = 1.0 + sustainedRatio * 3.0; // Up to 4x spread after 4s
      // Very little recoil - the weight stabilizes it
      recoilMult *= 0.15;
  }

  // Apply recoil to pitch (vertical kick)
  if (!energyNoRecoil) {
      pitch -= 0.025 * recoilMult;
      
      // Add slight random horizontal recoil for non-energy weapons
      yaw += (Math.random() - 0.5) * 0.008 * recoilMult;
  }

  switch (curWep) {
    case 'FLAMETHROWER':
      if (!hasSuppressor('FLAMETHROWER')) sfx.chaingun();
      const fwd2 = new BABYLON.Vector3();
      camera.getForwardRay(1).direction.normalizeToRef(fwd2);
      const origin2 = camera.position.clone().add(fwd2.scale(0.8));
      const flameCount = 8;
      for (let i = 0; i < flameCount; i++) {
          const spreadDir = fwd2.clone();
          // Use the actual dynamic spread variable instead of the hardcoded 0.35
          const currentSpread = spread * spreadMult; 
          spreadDir.x += (Math.random() - 0.5) * currentSpread;
          spreadDir.y += (Math.random() - 0.5) * currentSpread;
          spreadDir.z += (Math.random() - 0.5) * currentSpread;
          spreadDir.normalize();
          
          // Pass 'range' into the fireFlame function
          fireFlame(origin2, spreadDir, modDmg * 0.7, range);
      }
      break;
    case 'TESLA':
      if (!hasSuppressor('TESLA')) sfx.plasma();
      
      const teslaResult = hitscan(_meshToEnemy, spread * spreadMult, modDmg, range, falloff,
                                  new BABYLON.Color3(0.2, 0.9, 1.0), // cyan flash
                                  0x88ccff,   // light blue hit spark
                                  0x334466);  // dark blue miss spark
      
      // Chain lightning to nearby enemies
      if (teslaResult?.hit && teslaResult?.target) {
          // amplifier_coil is slot:'special' — was previously checking 'barrel' (bug)
          const chainCount = getLoadout('TESLA').attachments?.special === 'amplifier_coil' ? 5 : (W.chainTargets || 3);
          // magnet_coil doubles chainRange via getEffectiveStats
          const chainRange = EW.chainRange ?? W.chainRange ?? 8;
          const firstEnemy = teslaResult.target;
          let lastPos = firstEnemy.group.position.clone();
          const chained = new Set([firstEnemy]);
          
          const playerPos = camera.position.clone();
          playerPos.y += 0.5;
          const firstEnemyPos = lastPos.clone();
          firstEnemyPos.y += 1.0;
          spawnLightningArc(playerPos, firstEnemyPos);
          
          let delay = 120;
          const chainInterval = 100;
          
          for (let i = 0; i < chainCount; i++) {
              let closest = null, closestDist = chainRange;
              for (const e of enemies) {
                  if (!e.alive || chained.has(e)) continue;
                  const d = BABYLON.Vector3.Distance(lastPos, e.group.position);
                  if (d < closestDist) { closestDist = d; closest = e; }
              }
              if (closest) {
                  const capturedEnemy = closest;
                  const sourcePos = lastPos.clone();
                  sourcePos.y += 1.0;
                  const targetPos = capturedEnemy.group.position.clone();
                  targetPos.y += 1.0;
                  
                  setTimeout(() => {
                      if (!capturedEnemy.alive) return;
                      cb.hitRobot(capturedEnemy, Math.round(modDmg * (1 - (i+1) / chainCount)), false, false, 'TESLA_CHAIN');
                      spawnSparks(capturedEnemy.group.position, 0x88ccff, 8);
                      spawnLightningArc(sourcePos, targetPos);
                  }, delay);
                  delay += chainInterval;
                  lastPos = capturedEnemy.group.position.clone();
                  chained.add(capturedEnemy);
              }
          }
      }
      break;
    case 'CROSSBOW':
      if (!hasSuppressor('CROSSBOW')) sfx.railgun(); 
      const boltResult = hitscan(_meshToEnemy, spread * spreadMult, modDmg, range, falloff);
      
      if (boltResult?.hit && boltResult?.target) {
          const cbAtt = getLoadout('CROSSBOW').attachments?.special;
          
          if (cbAtt === 'coated_tips') {
              const e = boltResult.target;
              if (!e._poisonDots) e._poisonDots = [];
              e._poisonDots.push({ dps: e.maxHp * 0.02, remaining: 5.0 });
          } 
          else if (cbAtt === 'explosive_tips') {
              import('./projectiles.js').then(({ boom }) => {
                  boom(boltResult.target.group.position.clone(), 3.5, 25, true);
              });
          }
      }
      break;
    case 'PISTOL':
      if (!hasSuppressor('PISTOL')) sfx.pistol(getLoadout('PISTOL').attachments?.magazine ?? null);
      const pistolSpread = (getLoadout('PISTOL').attachments?.magazine === 'mag_50_cal' ? 0.02 : EW.spread);
      hitscan(_meshToEnemy, pistolSpread, modDmg, range, falloff);
      if (akimbo) hitscan(_meshToEnemy, pistolSpread * 1.15, modDmg * 0.85, range, falloff);
      break;
    case 'SMG':
      if (!hasSuppressor('SMG')) sfx.smg();
      hitscan(_meshToEnemy, spread * spreadMult, modDmg, range, falloff);
      break;
    case 'CHAINGUN':
      if (!hasSuppressor('CHAINGUN')) sfx.chaingun();
      hitscan(_meshToEnemy, spread * spreadMult, modDmg, range, falloff);
      break;
    case 'RAILGUN':
      if (!hasSuppressor('RAILGUN')) sfx.railgun();
      hitscan(_meshToEnemy, spread * spreadMult, 9999, range, 0.00);
      break;
    case 'ION':
      const ionChargeBonus = 1.0 + ((W.heat || 0) * 1.5);
      if (!hasSuppressor('ION')) sfx.railgun();
      const ionResult = hitscan(_meshToEnemy, spread * spreadMult, modDmg * ionChargeBonus, range, 0.00);
      
      // Explosive Bullets: create splash damage on hit
      if (getLoadout('ION').attachments?.special === 'explosive_bullets') {
          if (ionResult?.hit && ionResult?.target) {
              import('./projectiles.js').then(({ boom }) => {
                  boom(ionResult.target.group.position.clone(), 2.5, 15, true);
                  spawnSparks(ionResult.target.group.position.clone(), 0x4488ff, 10);
              });
          }
      }
      break;
    case 'ELECTRON':
      if (!hasSuppressor('ELECTRON')) sfx.plasma();
      hitscan(_meshToEnemy, spread * spreadMult, modDmg, range, falloff);
      break;
    case 'PLASMA':
      if (!hasSuppressor('PLASMA')) sfx.plasma();
      if (player.plasmaAltMode) { hitscan(_meshToEnemy, spread * spreadMult, modDmg, range, 0); }
      else { firePlasma(modDmg); }
      break;
    case 'ROCKET':
      if (!hasSuppressor('ROCKET')) sfx.rocket();
      if (hasRocketBurst()) {
        fireRocket(EW.speed, EW.splash, spread * spreadMult);
        setTimeout(() => { if (cb.isGameRunning?.()) fireRocket(EW.speed, EW.splash, spread * spreadMult); },  90);
        setTimeout(() => { if (cb.isGameRunning?.()) fireRocket(EW.speed, EW.splash, spread * spreadMult); }, 180);
      } else {
        fireRocket(EW.speed, EW.splash, spread * spreadMult);
      }
      break;
    case 'SHOTGUN':
      if (!hasSuppressor('SHOTGUN')) { sfx.shotgun(); setTimeout(() => sfx.shotgun(), 20); }
      pitch -= 0.06;
      const pellets = EW.pellets ?? W.pellets;
      const isDragonsBreath = getLoadout('SHOTGUN').attachments?.special === 'dragons_breath';

      for (let i = 0; i < pellets; i++) {
          const hitRes = hitscan(_meshToEnemy, spread * spreadMult, modDmg, range, falloff);
          
          // Apply Dragon's Breath DoT
          if (isDragonsBreath && hitRes?.hit && hitRes?.target) {
              const e = hitRes.target;
              if (!e._dots) e._dots = [];
              e._dots.push({ dmg: EW.dotDamage || 12, remaining: EW.dotDuration || 3 });
              spawnSparks(e.group.position, 0xff4400, 8); // Fiery visual feedback
          }
      }
      break;
    case 'GLAUNCHER':
      if (!hasSuppressor('GLAUNCHER')) sfx.shotgun();
      const fwd = new BABYLON.Vector3();
      camera.getForwardRay(1).direction.normalizeToRef(fwd);
      fwd.y += 0.05; fwd.normalize();
      const origin = camera.position.clone().add(fwd.scale(0.8));
      fireGrenade('player', origin, fwd, WDEFS.GLAUNCHER.projSpeed, modDmg, WDEFS.GLAUNCHER.splash, hasClusterRounds());
      break;
    case 'RIVETER':
      if (!hasSuppressor('RIVETER')) sfx.shotgun();
      const isSuperheated = getLoadout('RIVETER').attachments?.special === 'superheated_rivets';
      const isMagnetic = getLoadout('RIVETER').attachments?.special === 'magnetic_coils';
      // Pass the effective bounces
      fireRivet(EW.projSpeed || 45, modDmg, isSuperheated, isMagnetic, EW.bounces || 1); 
      break;

    case 'PHALANX':
      if (!hasSuppressor('PHALANX')) sfx.plasma();
      const isEmp = getLoadout('PHALANX').attachments?.special === 'emp_frequency';
      const isShatter = getLoadout('PHALANX').attachments?.special === 'resonance_cascade';
      const sonicMod = getLoadout('PHALANX').attachments?.barrel === 'sonic_amplifier' ? 1.3 : 1.0;
      
      const pushCenter = camera.position.clone();
      const pushFwd = new BABYLON.Vector3();
      camera.getForwardRay(1).direction.normalizeToRef(pushFwd);

      // 1. AFFECT ENEMIES
      for (const e of enemies) {
          if (!e.alive) continue;
          const toEnemy = e.group.position.subtract(pushCenter);
          const dist = toEnemy.length();
          
          if (dist < EW.range && BABYLON.Vector3.Dot(pushFwd, toEnemy.normalize()) > 0.7) {
              const targetPos = e.group.position.clone();
              cb.hitRobot(e, modDmg); 

              if (isEmp) {
                  e._empStunned = 1.5;
                  import('./projectiles.js').then(({ createYellowEMPStunArc }) => 
                      createYellowEMPStunArc(pushCenter, targetPos, scene) 
                  );
              } else if (e.alive) { 
                  e.knockbackVel = pushFwd.scale(55 * sonicMod).add(new BABYLON.Vector3(0, 12 * sonicMod, 0)); 
                  if (isShatter) e._phalanxShatter = true;
              }
          }
      }

      // 2. AFFECT EXPLOSIVE BARRELS (Moved up to properly close the Phalanx case)
      scene.meshes.forEach(m => {
          if ((m.metadata?.barrel || m.name.toLowerCase().includes('barrel')) && m.isEnabled()) {
              const toBarrel = m.position.subtract(pushCenter);
              const dist = toBarrel.length();
              
              if (dist < EW.range && BABYLON.Vector3.Dot(pushFwd, toBarrel.normalize()) > 0.7) {
                  if (m.metadata && typeof m.metadata.hit === 'function') {
                      m.metadata.hit(modDmg * 3); 
                  } else if (m.metadata) {
                      m.metadata.hp = (m.metadata.hp || 10) - (modDmg * 3);
                  }
              }
          }
      });
      break;

      case 'THUNDERBOLT':
        sfx.plasma();
        const boltCenter = camera.position.clone();
        boltCenter.y += 0.5;
        for (const e of enemies) {
            if (!e.alive) continue;
            const d = BABYLON.Vector3.Distance(boltCenter, e.group.position);
            if (d <= EW.range) {
                cb.hitRobot(e, modDmg, false, false, 'THUNDERBOLT');
                spawnLightningArc(boltCenter, e.group.position.clone().add(new BABYLON.Vector3(0,1,0)));
            }
        }
        break;

    case 'SINGULARITY':
        sfx.rocket();
        const fwdDir = getCameraForward();
        const ray = new BABYLON.Ray(camera.position, fwdDir, range);
        const hit = scene.pickWithRay(ray, m => m.checkCollisions && m.isEnabled() && !m.metadata?.enemy);
        const impactPos = hit?.hit ? hit.pickedPoint : camera.position.clone().add(fwdDir.scale(range));
        
        const bh = BABYLON.MeshBuilder.CreateSphere('bh', {diameter: 1.5}, scene);
        bh.position.copyFrom(impactPos);
        const bhMat = new BABYLON.StandardMaterial('bhm', scene);
        bhMat.emissiveColor = new BABYLON.Color3(0.5, 0, 1.0);
        bh.material = bhMat;
        
        let singTicks = 0;
        const singInt = setInterval(() => {
            singTicks++;
            if (!cb.isGameRunning?.() || singTicks > 30) {
                clearInterval(singInt);
                bh.dispose();
                import('./projectiles.js').then(({ boom }) => boom(impactPos, 12, modDmg, true));
                return;
            }
            for (const e of enemies) {
                if (!e.alive) continue;
                const d = BABYLON.Vector3.Distance(impactPos, e.group.position);
                if (d < 12) {
                    const dir = impactPos.subtract(e.group.position).normalize();
                    e.group.position.addInPlace(dir.scale(8 * 0.1)); // Vacuum pull
                }
            }
        }, 100);
        break;

    case 'PYROCLAST':
        sfx.chaingun(); 
        const fwd3 = getCameraForward();
        const origin3 = camera.position.clone().add(fwd3.scale(0.8));
        for (let i = 0; i < 6; i++) {
            const spreadDir = fwd3.clone();
            const currentSpread = spread * spreadMult; 
            spreadDir.x += (Math.random() - 0.5) * currentSpread;
            spreadDir.y += (Math.random() - 0.5) * currentSpread;
            spreadDir.z += (Math.random() - 0.5) * currentSpread;
            spreadDir.normalize();
            fireFlame(origin3, spreadDir, modDmg, range);
        }
        break;

    case 'OMEGA_STORM':
        sfx.rocket();
        const osCenter = camera.position.clone(); osCenter.y += 0.5;
        // Lightning Phase
        for (const e of enemies) {
            if (!e.alive) continue;
            if (BABYLON.Vector3.Distance(osCenter, e.group.position) <= 25) {
                cb.hitRobot(e, modDmg, false, false, 'OMEGA_STORM');
                spawnLightningArc(osCenter, e.group.position.clone().add(new BABYLON.Vector3(0,1,0)));
            }
        }
        // Black Hole Phase
        const osDir = getCameraForward();
        const osRay = new BABYLON.Ray(camera.position, osDir, range);
        const osHit = scene.pickWithRay(osRay, m => m.checkCollisions && m.isEnabled() && !m.metadata?.enemy);
        const osPos = osHit?.hit ? osHit.pickedPoint : camera.position.clone().add(osDir.scale(range));
        
        const osBh = BABYLON.MeshBuilder.CreateSphere('osbh', {diameter: 2.0}, scene);
        osBh.position.copyFrom(osPos);
        const osMat = new BABYLON.StandardMaterial('osm', scene);
        osMat.emissiveColor = new BABYLON.Color3(1, 1, 1);
        osBh.material = osMat;
        
        let osTicks = 0;
        const osInt = setInterval(() => {
            osTicks++;
            if (!cb.isGameRunning?.() || osTicks > 30) {
                clearInterval(osInt);
                osBh.dispose();
                import('./projectiles.js').then(({ boom }) => boom(osPos, 15, modDmg * 1.5, true));
                return;
            }
            for (const e of enemies) {
                if (!e.alive) continue;
                const d = BABYLON.Vector3.Distance(osPos, e.group.position);
                if (d < 15) {
                    const dir = osPos.subtract(e.group.position).normalize();
                    e.group.position.addInPlace(dir.scale(10 * 0.1));
                    e.hp -= 25 * 0.1; // Passive vacuum damage
                    if (e.hp <= 0) cb.hitRobot(e, 999);
                }
            }
        }, 100);
        // Flame Phase
        const origin4 = camera.position.clone().add(osDir.scale(0.8));
        for (let i = 0; i < 8; i++) {
            const spreadDir = osDir.clone();
            spreadDir.x += (Math.random() - 0.5) * 0.4;
            spreadDir.y += (Math.random() - 0.5) * 0.4;
            spreadDir.z += (Math.random() - 0.5) * 0.4;
            spreadDir.normalize();
            fireFlame(origin4, spreadDir, 40, range);
        }
        break;

      // 2. AFFECT EXPLOSIVE BARRELS
      scene.meshes.forEach(m => {
          // Find meshes tagged as barrels
          if ((m.metadata?.barrel || m.name.toLowerCase().includes('barrel')) && m.isEnabled()) {
              const toBarrel = m.position.subtract(pushCenter);
              const dist = toBarrel.length();
              
              if (dist < EW.range && BABYLON.Vector3.Dot(pushFwd, toBarrel.normalize()) > 0.7) {
                  // Apply a direct hit to the barrel's custom logic to trigger it
                  if (m.metadata && typeof m.metadata.hit === 'function') {
                      m.metadata.hit(modDmg * 3); // Multiply damage to ensure it pops
                  } else if (m.metadata) {
                      m.metadata.hp = (m.metadata.hp || 10) - (modDmg * 3);
                  }
              }
          }
      });
      break;

    case 'AEGIS':
      if (!hasSuppressor('AEGIS')) sfx.pistol();
      
      if (paintedTargets.length > 0) {
        const hasInfinite = player.buffs['infinite_ammo'] > 0;
        let shotsFired = 0;
        
        for (const e of paintedTargets) {
          if (!e.alive) continue;
          
          // Ensure we don't shoot more targets than we have bullets 
          // (ballisticCost already deducted 1 bullet at the top of shoot())
          if (!hasInfinite && W.currentMag <= 0 && shotsFired > 0) break;
          
          if (!hasInfinite && shotsFired > 0) W.currentMag--; 
          shotsFired++;
          
          cb.hitRobot(e, modDmg, false, false, 'AEGIS');
          spawnSparks(e.group.position.clone().add(new BABYLON.Vector3(0, 1.0, 0)), 0xff3333, 8);
        }
        
        paintedTargets = []; // Clear queue so the auto-painter can grab them again if LMB is held
        if (_aegisHl) _aegisHl.removeAllMeshes();
      } else {
        hitscan(_meshToEnemy, spread * spreadMult, modDmg, range, falloff);
      }
      break;
    case 'DMR':
      if (!hasSuppressor('DMR')) sfx.railgun(); // Using railgun sfx as a placeholder for a heavy rifle sound
      hitscan(_meshToEnemy, spread * spreadMult, modDmg, range, falloff);
      break;

    case 'COMET': {
      const burstCount = EW.burstCount || 3;
      const bDelay = (WDEFS.COMET.burstDelay || 0.08) * 1000;
      
      // Shot 1 (Synchronous)
      if (!hasSuppressor('COMET')) sfx.smg();
      hitscan(_meshToEnemy, spread * spreadMult, modDmg, range, falloff);
      
      // Shots 2 and 3 (Asynchronous Queue)
      for (let i = 1; i < burstCount; i++) {
          setTimeout(() => {
              if (!cb.isGameRunning?.()) return; // Stop if game paused/ended
              if (!hasSuppressor('COMET')) sfx.smg();
              hitscan(_meshToEnemy, spread * spreadMult, modDmg, range, falloff);
              
              // Apply the heavy visual recoil ONLY on the final bullet
              if (i === burstCount - 1) {
                  setSwingT(1.0); 
              } else {
                  setSwingT(0.25); // Subtle kick during the burst
              }
          }, bDelay * i);
      }
      break;
    }
  } 

  // ── Burst Decrements ──
  if (curWep === 'ELECTRON' && hasSlowTrigger() && _burstShotsLeft > 0) {
    _burstShotsLeft--;
    if (_burstShotsLeft === 0) _burstCooldown = 0.45;
  }
  if (isBurstWeapon && _burstShotsLeft > 0) {
    _burstShotsLeft--;
    if (_burstShotsLeft === 0) _burstCooldown = WDEFS[curWep].cd || 0.40;
  }
  
  if (!isEnergy && EW.magSize && W.currentMag <= 0 && (EW.ammo > 0 || hasInfiniteAmmo)) {
      startReload();
  }
}

export function startReload() {
  const W = WDEFS[curWep];
  const EW = getEffectiveStats(curWep, W); // Calculate effective capacity
  
  const isEnergy = W.useHeat || (curWep === 'PLASMA' && hasEnergyConverter());
  // Respect effective mag size
  if (isEnergy || !EW.magSize || W.currentMag >= EW.magSize || (EW.ammo <= 0 && EW.ammo !== Infinity) || player.isReloading) return;
  
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
  window.__modeDead = false;
  _playerBody.position.set(x, y, z);
  camera.position.set(x, y, z);
  _yVel = 0;
  player.onGround = true;
  _wasOnGround    = true;
  _jumpBufTimer   = 0;
  _coyoteTimer    = 0;
  player.buffs = {}; 

  player.isReloading = false;
  player.reloadTimer = 0;
  
  for (const wName in WDEFS) {
      WDEFS[wName].heat = 0;
      WDEFS[wName].isOverheated = false;
  }
  
  markHudDirty();
}

/** Reset heat (and clear overheat lockout) for a single weapon — used when
 * picking up ammo/weapon drops for an energy weapon you already own,
 * instead of granting ammo it can't use. */
export function resetWeaponHeat(wName) {
  const W = WDEFS[wName];
  if (!W) return;
  W.heat = 0;
  W.isOverheated = false;
  markHudDirty();
}

function _updateAegisTargeting() {
  if (curWep !== 'AEGIS' || !isScoped) {
    paintedTargets = [];
    if (_aegisHl) _aegisHl.removeAllMeshes();
    return;
  }
  if (!_aegisHl) {
    _aegisHl = new BABYLON.HighlightLayer('aegisHl', scene);
    _aegisHl.outerGlow = true;
    _aegisHl.innerGlow = true;
  }
  const EW = getEffectiveStats('AEGIS', WDEFS.AEGIS);
  const maxTargets  = EW.maxTargets || 3;
  const requiredDot = EW.lockCone ?? 0.95;
  const fwd = getCameraForward();

  for (const e of enemies) {
    if (!e.alive) continue;
    if (paintedTargets.includes(e)) {
      e.group.getChildMeshes().forEach(m => {
        if (!_aegisHl.hasMesh(m)) _aegisHl.addMesh(m, new BABYLON.Color3(1, 0, 0));
      });
      continue;
    }
    if (paintedTargets.length >= maxTargets) continue;
    
    // Shift target up by 1 unit to test against Center of Mass instead of toes
    const enemyCenter = e.group.position.add(new BABYLON.Vector3(0, 1.0, 0));
    const toEnemy = enemyCenter.subtract(camera.position).normalize();
    
    if (BABYLON.Vector3.Dot(fwd, toEnemy) > requiredDot) {
      paintedTargets.push(e);
      sfx.pickup();
    }
  }
}

export let paintedTargets = [];

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

  // ── Lock movement while dead in mode matches ────────────
  if (window.__modeDead) {
    // Still process buffs/timers but skip ALL movement and input
    if (wepCooldown > 0) setWepCooldown(wepCooldown - dt);
    if (_burstCooldown > 0) _burstCooldown = Math.max(0, _burstCooldown - dt);
    return;
  }
  
  if (!gameRunning || paused) return;
  const mapMeta = getMapMeta(getCurrentMap());

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
  // Subctract from the lava hit timer
  if (_lavaHitTimer > 0) _lavaHitTimer -= dt;

  // ION Sniper Ramp-Up: Generate heat while scoped
  if (curWep === 'ION' && isScoped) {
    if (!player.buffs['infinite_ammo']) {
      const W = WDEFS['ION'];
      // Haste also slows down passive scope heating
      const hasteMult = player.buffs['haste'] > 0 ? 0.5 : 1.0; 
      W.heat = Math.min(1.0, (W.heat || 0) + (dt * 0.20 * hasteMult));
      _heatDelayTimer = 0.5; 
      markHudDirty();
    }
  }
  if (curWep === 'AEGIS' && isScoped) {
     _updateAegisTargeting();
  } else {
      paintedTargets = []; // Clear if we drop ADS or swap weapons
  }

  // ── Background Weapon Heat & Scope Heating Loop ──
    for (const wName in WDEFS) {
        const wDef = WDEFS[wName];

        if (_heatDelayTimer <= 0 && wDef.heat > 0) {
            //  coolRate is a whole number percentage (e.g. 35). Divide by 100 so it cools over ~3 seconds.
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
  
  const sprint = keys['ShiftLeft'] || keys['ShiftRight'];
  const speedMult   = getSpeedMult(curWep);
  const spd   = (sprint ? SPD_SPRINT : SPD_WALK) * speedMult;
  // use moveSpeed instead of the raw constant in the movement vector
  const fwd    = getCameraForward();
  const right  = getCameraRight();
  _move.setAll(0);
  if (keys['KeyW'] || keys['ArrowUp'])    _move.addInPlace(fwd);
  if (keys['KeyS'] || keys['ArrowDown'])  _move.subtractInPlace(fwd);
  if (keys['KeyA'] || keys['ArrowLeft'])  _move.subtractInPlace(right);
  if (keys['KeyD'] || keys['ArrowRight']) _move.addInPlace(right);
  const mLen2 = _move.lengthSquared();
  if (mLen2 > 0) _move.scaleInPlace(spd / Math.sqrt(mLen2));

  // Don't allow full auto for Plasma Sniper, but DO allow it for Burst!
  const isPlasmaSniper = curWep === 'PLASMA' && player.plasmaAltMode;
  const isPlasmaBurst  = curWep === 'PLASMA' && hasDualTrigger() && !player.plasmaAltMode;
  
  const isAuto = (AUTO_WEAPONS.has(curWep) || isAutoFire(curWep) || isPlasmaBurst) && !isPlasmaSniper;
  
  // Akimbo no longer forces full-auto trigger mapping
  if (mouseHeld && isAuto) shoot();

  // Use _wasOnGround (set end of prev frame) so jump works even when
  // moveWithCollisions causes a micro-separation during the same frame.
  const canJump    = _wasOnGround || player.onGround || (_coyoteTimer > 0);
  const jumpWanted = keys['Space'] || (_jumpBufTimer > 0);
  if (jumpWanted && canJump) {
    _yVel           = JV * Math.sqrt(mapMeta.gravityMult ?? 1.0)
    player.onGround = false;
    _wasOnGround    = false;   // prevent double-jump on same latch
    _coyoteTimer    = 0;
    _jumpBufTimer   = 0;
    // Detach the collision body slightly off the floor mesh to prevent horizontal drag.
    _playerBody.position.y += 0.02;
  }

  // ── TERMINAL JETPACK LOGIC ──
  if (getCurrentMap() === 'terminal') {
      const jumpHeld = keys['Space'];
      
      // Enforce the overheated lockout
      if (jumpHeld && !_jetpackOverheated) {
          _yVel += 35 * dt; // Upward thrust
          if (_yVel > 12) _yVel = 12; // Terminal velocity going up
          player.onGround = false;
          jetpackHeat = Math.min(1.0, jetpackHeat + dt * 0.4); // Overheats in 2.5s
          
          if (jetpackHeat >= 1.0) {
              _jetpackOverheated = true; // Lock the jetpack
          }
          
          import('./particles.js').then(({ spawnSparks }) => {
              spawnSparks(new BABYLON.Vector3(_playerBody.position.x, _playerBody.position.y - PH + 0.1, _playerBody.position.z), 0x00ffff, 2);
          });
      } else {
          jetpackHeat = Math.max(0, jetpackHeat - dt * 0.25); // Cools down in 4s
          if (jetpackHeat <= 0) {
              _jetpackOverheated = false; // Un-lock the jetpack once cooled
          }
      }
      
      // Dynamic UI Gauge
      let jetpackUI = document.getElementById('jetpackUI');
      if (!jetpackUI) {
          jetpackUI = document.createElement('div');
          jetpackUI.id = 'jetpackUI';
          // Shifted bottom from 90px to 160px to clear the weapon heat bar and pick up text
          jetpackUI.style.cssText = 'position:fixed;bottom:160px;left:50%;transform:translateX(-50%);width:260px;height:12px;background:rgba(0,0,0,0.8);border:2px solid #333;z-index:100;box-shadow:0 0 10px rgba(0,0,0,0.5);pointer-events:none;';
          jetpackUI.innerHTML = '<div id="jetpackFill" style="width:100%;height:100%;background:#0ff;transition:width 0.1s;"></div><div id="jetpackText" style="position:absolute;top:-28px;width:100%;text-align:center;color:#0ff;font-size:18px;font-weight:bold;text-shadow:0 0 6px #000;letter-spacing:2px;">JETPACK</div>';
          document.body.appendChild(jetpackUI);
      }
      jetpackUI.style.display = 'block';
      const fill = document.getElementById('jetpackFill');
      const text = document.getElementById('jetpackText');
      if (fill) {
          fill.style.width = ((1.0 - jetpackHeat) * 100) + '%';
          fill.style.background = _jetpackOverheated ? '#f00' : '#0ff';
          if (text) text.style.color = _jetpackOverheated ? '#f00' : '#0ff';
      }
  } else {
      const jetpackUI = document.getElementById('jetpackUI');
      if (jetpackUI) jetpackUI.style.display = 'none';
      jetpackHeat = 0;
      _jetpackOverheated = false; // Reset between maps
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

  const grav = GRAVITY * (mapMeta.gravityMult ?? 1.0);
  if (!player.onGround) {
    _yVel -= grav * dt;
    if (_yVel < -TERM_VEL) _yVel = -TERM_VEL;
  }

  const friction = player.onGround ? 8.0 : 2.5; 
  _xVel -= _xVel * friction * dt;
  _zVel -= _zVel * friction * dt;

  const dispX = (_move.x + _xVel) * dt, dispY = _yVel * dt, dispZ = (_move.z + _zVel) * dt;
  const preY  = _playerBody.position.y;
  _playerBody.moveWithCollisions(new BABYLON.Vector3(dispX, dispY, dispZ));

  if (_playerBody.position.y < -25) { // Update reset threshold to -25 to prevent accidental resets on mine (levelJungle.js)
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

  if (camera.position.y < -27) resetPlayer(-19, PH, -12);

  if (mLen2 > 0.01 && player.onGround) {
    camera.position.y += Math.sin(Date.now() * .001 * (sprint ? 11 : 6.5)) * .042;
  }
  const vigEl = document.getElementById('hpVignette');
  if (vigEl) vigEl.style.opacity = player.hp < 40 ? (1 - player.hp / 40) * .82 : 0;
  if (_hudDirty) { cb.markHudDirty?.(); _hudDirty = false; }
  if (_thermalActive && _thermalHl) {
      enemies.forEach(e => {
          if (e.alive && e.group) {
              e.group.getChildMeshes().forEach(m => {
                  if (!_thermalHl.hasMesh(m)) _thermalHl.addMesh(m, new BABYLON.Color3(1, 0.8, 0.1));
              });
          }
      });
  } else if (_thermalHl) {
      // Instantly scrub meshes clean if the player swaps weapons or drops ADS
      _thermalHl.removeAllMeshes();
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

  function _drawSquareScope() {
      let el = document.getElementById('_squareScope');
      if (!el) {
        el = document.createElement('div');
        el.id = '_squareScope';
        el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:700;display:flex;align-items:center;justify-content:center;';
        el.innerHTML = `
          <div style="width: 75vw; height: 65vh; border: 2px solid rgba(0, 255, 100, 0.4); position: relative; box-shadow: 0 0 0 9999px rgba(0,0,0,1), inset 0 0 50px rgba(0,255,100,0.1);">
              
              <div style="position:absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 4px; height: 4px; background: rgba(0,255,100,0.8); border-radius: 50%;"></div>
              
              <div style="position:absolute; top: 50%; left: 45%; transform: translateY(-50%); width: 2%; height: 2px; background: rgba(0,255,100,0.6);"></div>
              <div style="position:absolute; top: 50%; right: 45%; transform: translateY(-50%); width: 2%; height: 2px; background: rgba(0,255,100,0.6);"></div>
              <div style="position:absolute; left: 50%; top: 45%; transform: translateX(-50%); width: 2px; height: 4%; background: rgba(0,255,100,0.6);"></div>
              <div style="position:absolute; left: 50%; bottom: 45%; transform: translateX(-50%); width: 2px; height: 4%; background: rgba(0,255,100,0.6);"></div>
              
              <div style="position:absolute; top: 20px; left: 20px; width: 30px; height: 30px; border-top: 3px solid rgba(0,255,100,0.7); border-left: 3px solid rgba(0,255,100,0.7);"></div>
              <div style="position:absolute; top: 20px; right: 20px; width: 30px; height: 30px; border-top: 3px solid rgba(0,255,100,0.7); border-right: 3px solid rgba(0,255,100,0.7);"></div>
              <div style="position:absolute; bottom: 20px; left: 20px; width: 30px; height: 30px; border-bottom: 3px solid rgba(0,255,100,0.7); border-left: 3px solid rgba(0,255,100,0.7);"></div>
              <div style="position:absolute; bottom: 20px; right: 20px; width: 30px; height: 30px; border-bottom: 3px solid rgba(0,255,100,0.7); border-right: 3px solid rgba(0,255,100,0.7);"></div>
          </div>
        `;
        document.body.appendChild(el);
      }
      el.style.display = 'flex';
  }

  // Visual UI Overlay for Holo sight
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
      const sq = document.getElementById('_squareScope');
      if (sq) sq.style.display = 'none';
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

    if (enable && sight === 'night_vision') {
        _nvgActive = true;
        if (!_nvgHl) {
            _nvgHl = new BABYLON.HighlightLayer("nvgHl", scene);
            _nvgHl.outerGlow = true;
            _nvgHl.innerGlow = false; // Turn off inner glow for sharper silhouettes 
            _nvgHl.blurHorizontalSize = 0.2; // Sharpen the outline
            _nvgHl.blurVerticalSize = 0.2;
        }
        if (!_nvPostProcess) {
            _nvPostProcess = new BABYLON.PostProcess("nvgEffect", "nvg", null, null, 1.0, camera);
        }
    } else {
      // When dropping out of ADS, destroy the shader to return to normal vision
      _nvgActive = false;
      if (_nvgHl) _nvgHl.removeAllMeshes();
      if (_nvPostProcess) {
          _nvPostProcess.dispose(camera);
          _nvPostProcess = null;
      }
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
    // --- NVG Dynamic Thermal Highlighting ---
    if (_nvgActive && _nvgHl) {
      enemies.forEach(e => {
        if (e.alive && e.group) {
          const hpRatio = Math.max(0, Math.min(1, e.hp / e.maxHp));
          
          // High HP = Yellow (1, 1, 0). Low HP = Red (1, 0, 0).
          const targetColor = new BABYLON.Color3(1.0, hpRatio, 0.0);

          e.group.getChildMeshes().forEach(m => {
              if (!_nvgHl.hasMesh(m)) {
                  _nvgHl.addMesh(m, targetColor);
                  m._lastHlHp = hpRatio;
              } else if (Math.abs(m._lastHlHp - hpRatio) > 0.05) {
                  _nvgHl.removeMesh(m);
                  _nvgHl.addMesh(m, targetColor);
                  m._lastHlHp = hpRatio;
              }
          });
        }
      });
    }else if (_nvgHl) {
        _nvgHl.removeAllMeshes();
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
        else if (shape === 'square') _drawSquareScope();
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
    if (e.code === 'Escape') {
        const loadoutCloseBtn = document.getElementById('loadoutCloseBtn');
        if (loadoutCloseBtn) {
            loadoutCloseBtn.click();
        } else {
            onTogglePause();
        }
    }
    if (e.code === 'KeyR')   startReload();
    
    if (e.code === 'KeyV' && curWep === 'PLASMA') {
      player.plasmaAltMode = !player.plasmaAltMode;
      cb.markHudDirty?.(); 
    }
    if (e.code === 'KeyV' && curWep === 'FLAMETHROWER') {
      import('./progression.js').then(({ getLoadout }) => {
        const loadout = getLoadout('FLAMETHROWER');
        if (loadout.attachments?.special === 'thermal_blast' && !player.blastCooldown) {
          const W = WDEFS.FLAMETHROWER;
          
          // STRICT CHECK: Player must have at least 50% heat capacity available
          if (W.heat > 0.5 || W.isOverheated) {
            import('./audio.js').then(({ sfx }) => { if (sfx.noAmmo) sfx.noAmmo(); });
            return; 
          }
          
          W.heat += 0.50; 
          if (W.heat >= 1.0) {
              W.heat = 1.0;
              W.isOverheated = true;
          }
          import('./weapons.js').then(({ refreshSlotHUD }) => refreshSlotHUD());
          
          player.blastCooldown = true;
          setTimeout(() => { player.blastCooldown = false; }, 2000);

          const blastCenter = camera.position.clone();
          for (const e of enemies) {
            if (!e.alive) continue;
            const dist = BABYLON.Vector3.Distance(blastCenter, e.group.position);
            
            if (dist < 8.5) {
              cb.hitRobot(e, 25, false, false, 'FLAMETHROWER');
              
              const pushDir = e.group.position.subtract(blastCenter);
              pushDir.y = 0; pushDir.normalize();
              e.knockbackVel = pushDir.scale(30); // Applies kinetic force
              e.burnTimer = 4.0;
            }
          }
          import('./audio.js').then(({ sfx }) => { if (sfx.explosion) sfx.explosion(); });
        }
      });
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

export function movePlayerBody(delta) {
    if (_playerBody) _playerBody.position.addInPlace(delta);
}