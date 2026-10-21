// pickups.js – consumable pickups (health/armor/ammo), weapon drops, and static map weapon spawns
const BABYLON = window.BABYLON;
import { scene, camera } from './scene.js';
import { M } from './textures.js';
import { pickups, weaponDrops, player, cb } from './gameState.js';
import { WDEFS, WCOLORS, inventory, activeSlot, makeScaledWeaponModel, setWeapon, refreshSlotHUD, setActiveSlot, curWep } from './weapons.js';
import { sfx } from './audio.js';
import { TIER_1, TIER_2, TIER_3, TIER_4, TIER_5 } from './constants.js';
import { getCurrentMap, getSecretKits, getWeaponSpawns, resolveMapData } from './mapManager.js';
import { getMapMarkers } from './mapLayoutStore.js';
import { getLoadout, ATTACHMENTS, recordWonderWeaponCollected } from './progression.js';

// Energy weapons refill heat rather than ammo when picked up.
// The Railgun is also treated as energy (has heat/charge mechanic in some codepaths)
// but for drop purposes only the explicitly heat-based weapons are listed here.
const ENERGY_WEAPONS = new Set(['ELECTRON', 'ION', 'PLASMA']);

// All static pickups (secret kits + map weapons) share this respawn timer
function getRespawnSec() {
    return player.hardMode ? 600 : 300; // 10 minutes in hard mode, 5 in normal
}

function _spawnSecretKit(kit) {
  const mesh = BABYLON.MeshBuilder.CreateBox('kit_' + kit.tag, { size: 1.2 }, scene);
  const mat = new BABYLON.StandardMaterial('kitMat_' + kit.tag, scene);

  const isHealth = kit.type === 'secret_health';
  const isArmor  = kit.type === 'secret_armor';
  mat.diffuseColor  = isHealth ? new BABYLON.Color3(1, 0.13, 0.2)
                    : isArmor  ? new BABYLON.Color3(0.13, 0.27, 0.93)
                                : new BABYLON.Color3(0.8, 0.73, 0); // secret_ammo
  mat.emissiveColor = mat.diffuseColor;
  mat.disableLighting = true;

  const texName = isHealth ? 'health' : isArmor ? 'armor' : 'ammo';
  mat.diffuseTexture = new BABYLON.Texture(`assets/textures/lq/${texName}.png`, scene);
  mesh.material = mat;
  mesh.position.copyFrom(kit.pos);
  mesh.setEnabled(true);

  const ring = BABYLON.MeshBuilder.CreateTorus('kitRing_' + kit.tag, { diameter: 2.0, thickness: 0.1, tessellation: 24 }, scene);
  ring.position.set(kit.pos.x, kit.pos.y - 0.5, kit.pos.z);
  ring.material = isHealth ? M.ledBlue : M.ledGreen;
  ring.isPickable = false;

  pickups.push({ mesh, ring, type: kit.type, baseY: mesh.position.y, respawnTimer: 0, expires: false, bob: Math.random() * 5 });
}

function _kitAllowed(type) { return true; }

// Secret Kits – now fetched from config
export function initSecretKits() {
  const map = getCurrentMap();
  const kits = getSecretKits(map); // already resolved with fallback
  kits.filter(kit => _kitAllowed(kit.type)).forEach(_spawnSecretKit);
  // Optional v2 map editor markers augment the built-in secret kits.
  for(const [markerType,pickupType] of [
    ['healthPickup','health'],['armorPickup','armor'],['ammoPickup','ammo']]){
    for(const marker of getMapMarkers(map,markerType,'survival')){
      const pos=new BABYLON.Vector3(marker.position.x,marker.position.y,marker.position.z);
      spawnTypedPickup(pos,pickupType,{tag:marker.id,persistent:true,respawnSec:300});
    }
  }
}

// Weapon spawns – now fetched from config
let _weaponSpawnsAllowed = true;
function _spawnsAllowed(key) { return _weaponSpawnsAllowed; } // extend as needed

export function initWeaponSpawns() {
  if (!_spawnsAllowed('weaponSpawns')) return;
  const map = getCurrentMap();
  const respawnMs = getRespawnSec() * 1000;
  const spawns = getWeaponSpawns(map); // array built from function
  for (const ws of spawns) {
    _spawnStaticWeapon(new BABYLON.Vector3(ws.x, ws.y, ws.z), ws.wName, respawnMs);
  }
}

function _spawnStaticWeapon(pos, wName, respawnMs) {
  const c    = WCOLORS[wName] || 0xffffff;
  const col3 = new BABYLON.Color3(((c >> 16) & 0xff) / 255, ((c >> 8) & 0xff) / 255, (c & 0xff) / 255);

  const mesh = makeScaledWeaponModel(wName, 0.9);
  mesh.position.copyFrom(pos);

  const rmat = new BABYLON.StandardMaterial('wsRing_' + wName + Math.random(), scene);
  rmat.emissiveColor = col3;
  rmat.disableLighting = true;

  const ring = BABYLON.MeshBuilder.CreateTorus('wsRing', { diameter: 0.8, thickness: 0.07, tessellation: 16 }, scene);
  ring.position.set(pos.x, pos.y - 0.28, pos.z);
  ring.material = rmat;
  ring.isPickable = false;

  const light = new BABYLON.PointLight('wsLight_' + wName + Math.random(), pos.clone(), scene);
  light.diffuse = col3;
  light.intensity = 0.9;
  light.range = 5.0;

  weaponDrops.push({
    mesh, ring, light,
    wName,
    bob:         Math.random() * Math.PI * 2,
    life:        9999999,   // effectively permanent — never expires by timer
    baseY:       pos.y,
    _static:     true,
    _respawnPos: pos.clone(),
    _respawnMs:  respawnMs,
  });
}

// ── Pickup light helper ───────────────────────────────────────────────────────
function _makePickupLight(pos, col3) {
  const l = new BABYLON.PointLight('pkLight', pos.clone(), scene);
  l.diffuse = col3; l.intensity = 1.1; l.range = 4.5;
  return l;
}

// ── Consumable pickup spawners ────────────────────────────────────────────────
export function spawnPickup(pos) {
  const r = Math.random();
  const type = r < .3 ? 'health' : r < .8 ? 'armor' : 'ammo';
  return spawnTypedPickup(pos, type);
}

export function spawnTypedPickup(pos, type, options = {}) {
  const col3 = type === 'health' ? new BABYLON.Color3(1, .13, .2)
             : type === 'armor'  ? new BABYLON.Color3(.13, .27, .93)
             :                     new BABYLON.Color3(.8, .73, 0);

  const mesh = BABYLON.MeshBuilder.CreatePlane('pk', { size: 0.8, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
  mesh.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;

  const mat = new BABYLON.StandardMaterial('pkMat_' + type, scene);
  mat.diffuseTexture = new BABYLON.Texture(`assets/textures/lq/${type}.png`, scene);
  mat.diffuseTexture.hasAlpha = true;
  mat.useAlphaFromDiffuseTexture = true;
  mat.emissiveColor = new BABYLON.Color3(0.5, 0.5, 0.5);
  mat.disableLighting = true;
  mesh.material = mat;
  mesh.isPickable = false;

  const baseY = pos.y ?? .45;
  mesh.position.set(pos.x, baseY, pos.z);

  const rmat = new BABYLON.StandardMaterial('pkRing', scene);
  rmat.emissiveColor = col3; rmat.disableLighting = true;
  const ring = BABYLON.MeshBuilder.CreateTorus('pkRing', { diameter: .6, thickness: .06, tessellation: 14 }, scene);
  ring.position.copyFrom(mesh.position); ring.material = rmat; ring.isPickable = false;

  const l = _makePickupLight(mesh.position, col3);

  const entry = {
    mesh, ring,
    light: l,
    type,
    bob:          Math.random() * Math.PI * 2,
    baseY,
    tag:          options.tag || null,
    respawnSec:   options.respawnSec || 0,
    respawnTimer: 0,
    persistent:   !!options.persistent,
  };
  pickups.push(entry);
  return entry;
}

// ── Pickup update loop ────────────────────────────────────────────────────────
export function updatePickups(dt) {
  const pp = camera.position;

  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    if (!p.mesh || p.mesh.isDisposed()) {
      pickups.splice(i, 1);
      continue;
    }

    const dist = BABYLON.Vector3.Distance(p.mesh.position, pp);

    if (dist < 2.5 && p.mesh.isEnabled()) {
      let picked = false;

      if (p.type === 'health' && player.hp < player.maxHp) {
        player.hp = Math.min(player.maxHp, player.hp + 25);
        picked = true;
      } else if (p.type === 'armor' && player.armor < player.maxArmor) {
        player.armor = Math.min(player.maxArmor, player.armor + 25);
        picked = true;
      } else if (p.type === 'ammo') {
        let gave = false;
        for (const wName of Object.keys(WDEFS)) {
          const W = WDEFS[wName];
          if (W.wonderWeapon) continue;
          
          // --- Reduce heat by 30% for Energy Weapons ---
          if (W.useHeat || wName === 'PLASMA' || wName === 'ELECTRON' || wName === 'ION') {
            if (W.heat > 0) {
              W.heat = Math.max(0, W.heat - 0.3); // Subtract 30% of max
              if (W.heat <= 0) W.isOverheated = false; // Restore functionality
              gave = true;
            }
          }
          
          // Normal ammo calculation
          if (W.ammo !== Infinity) {
            let bonus = Math.ceil((W.startAmmo || 20) / 3);
            if (wName === 'CROSSBOW') bonus = 1; // Limit generic ammo boxes to 1 bolt
            const scavAtt = ATTACHMENTS[ getLoadout(curWep).attachments?.magazine ];
            if (scavAtt?.mods?.scavengerBonus) {
                bonus = Math.round(bonus * (1 + scavAtt.mods.scavengerBonus));
            }
            bonus=Math.max(1,Math.ceil(bonus*(player.survivalModifiers?.ammoDropMult||1)));
            if (W.ammo < (W.max || 999)) {
                W.ammo += bonus;
                if (W.max) W.ammo = Math.min(W.ammo, W.max);
                gave = true;
            }
          }
        }
        picked = gave;
      } else if (p.type === 'powerup') {
        picked = true;
      } else if (p.type === 'secret_health' && player.hp < player.maxHp) {
        player.hp = player.maxHp; // Secret health kits fully heal instead of giving 25hp
        picked = true;
      } else if (p.type === 'secret_armor' && player.armor < player.maxArmor) {
        player.armor = player.maxArmor; // Secret armor kits fully restore armor instead of giving 25 armor
        picked = true;
      } else if (p.type === 'secret_ammo') {
        let gave = false;
        for (const wName of Object.keys(WDEFS)) {
          const W = WDEFS[wName];
          if (W.wonderWeapon) continue;
          if (W.ammo !== Infinity && W.ammo < (W.max || 999)) {
            W.ammo = W.startAmmo * 2 || 60; // Secret ammo kits give double starting ammo
            gave = true;
          }
        }
        picked = gave;
      }

      if (picked) {
        if (p.collect) {
          p.collect();
        } else {
          sfx.pickup();
        }
        if (cb.markHudDirty) cb.markHudDirty();

        if (p.expires || p.type === 'powerup' || p.type === 'ammo') {
          p.mesh.dispose();
          if (p.ring)  p.ring.dispose();
          if (p.light) p.light.dispose();
          pickups.splice(i, 1);
        } else {
          p.mesh.setEnabled(false);
          if (p.ring) p.ring.setEnabled(false);
          // Use the shared respawn constant for all persistent pickups
          p.respawnTimer = getRespawnSec();
        }
        continue;
      }
    }

    // Flicker for expiring drops
    if (p.expires) {
      p.timeDown -= dt;
      if (p.timeDown < 4.0) {
        const speed = p.timeDown < 1.5 ? 40 : 20;
        p.mesh.visibility = Math.sin(Date.now() * 0.001 * speed) > 0 ? 1.0 : 0.2;
      }
      if (p.timeDown <= 0) {
        p.mesh.dispose();
        pickups.splice(i, 1);
        continue;
      }
    }

    // Respawn countdown
    if (p.respawnTimer > 0) {
      p.respawnTimer -= dt;
      if (p.respawnTimer <= 0) {
        p.mesh.setEnabled(true);
        if (p.ring) p.ring.setEnabled(true);
        p.mesh.visibility = 1.0;
      }
    }

    // Bob + spin animation
    if (p.mesh.isEnabled()) {
      p.bob = (p.bob || 0) + dt * 3;
      p.mesh.position.y = p.baseY + Math.sin(p.bob) * 0.2;
      p.mesh.rotation.y += dt * 2;
    }
  }
}

// ── Weapon drops (bot loot) ───────────────────────────────────────────────────
export function spawnWeaponDrop(pos, wName) {
  const c    = WCOLORS[wName] || 0xffffff;
  const col3 = new BABYLON.Color3(((c >> 16) & 0xff) / 255, ((c >> 8) & 0xff) / 255, (c & 0xff) / 255);
  const mesh = makeScaledWeaponModel(wName, 0.85);

  const startY = pos.y || 0;
  mesh.position.set(pos.x, startY + 0.55, pos.z);

  const rmat = new BABYLON.StandardMaterial('wdRing', scene);
  rmat.emissiveColor = col3; rmat.disableLighting = true;
  const ring = BABYLON.MeshBuilder.CreateTorus('wdRing', { diameter: .7, thickness: .06, tessellation: 16 }, scene);
  ring.position.set(pos.x, startY + 0.22, pos.z); ring.material = rmat; ring.isPickable = false;

  const light = _makePickupLight(new BABYLON.Vector3(pos.x, startY + 0.4, pos.z), col3);
  light.range = 5.5; light.intensity = 1.4;

  weaponDrops.push({ mesh, ring, light, wName, bob: Math.random() * Math.PI * 2, life: 45, baseY: startY });
}

let _wPickupHintTimer = 0;

export function updateWeaponDrops(dt) {
  let nearestDist = 3.5, nearestName = null;

  for (let i = weaponDrops.length - 1; i >= 0; i--) {
    const p = weaponDrops[i];

    // --- TIMEOUT Handle Static Spawns via Engine Loop ---
    if (p._static) {
      if (p.respawnTimer > 0) {
        p.respawnTimer -= dt;
        if (p.respawnTimer <= 0) {
            p.mesh.setEnabled(true);
            p.ring.setEnabled(true);
            if (p.light) p.light.setEnabled(true);
        }
        continue; // Skip collision and animation if hidden
      }
    } else {
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.getChildMeshes().forEach(m => m.dispose()); p.mesh.dispose();
        p.ring.dispose(); p.light.dispose();
        weaponDrops.splice(i, 1);
        continue;
      }
    }

    // Animation
    p.bob += dt * 2.0;
    const y = (p.baseY + 0.55) + Math.sin(p.bob) * .08;
    p.mesh.position.y = y;
    p.ring.position.y = y - .33;
    p.mesh.rotation.y += dt * 1.6;

    const dist = BABYLON.Vector3.Distance(p.mesh.position, camera.position);

    // Auto-pickup if weapon already owned
    if (dist < 1.35 && inventory.includes(p.wName)) {
      const W = WDEFS[p.wName];
      const isEnergyWeapon = W.useHeat || (p.wName === 'PLASMA' && W.ammo === Infinity);
      if (isEnergyWeapon) {
        // Energy weapon: instantly vent / reset heat instead of refunding ammo
        if (cb.resetWeaponHeat) cb.resetWeaponHeat(p.wName);
        // Also track the pickup for unlock challenges
        import('./progression.js').then(({ recordEnergyPickup }) => recordEnergyPickup(p.wName));
      } else if (p.wName === 'RAILGUN') {
        // Railgun: refund ammo; with Efficiency Module grant 1 extra
        import('./progression.js').then(({ hasEfficiencyModule }) => {
          const bonus = hasEfficiencyModule() ? 1 : 0;
          W.ammo = Math.min((W.ammo || 0) + W.startAmmo + bonus, (W.max || 999));
          refreshSlotHUD();
        });
      } else if (p.wName === 'PISTOL') {
          // If player has Endless Magazine equipped, convert to generic ammo
          import('./progression.js').then(({ getLoadout }) => {
              if (getLoadout('PISTOL').attachments?.special === 'endless_magazine') {
                  // Give ammo to other weapons instead
                  for (const wName of Object.keys(WDEFS)) {
                      const W = WDEFS[wName];
                      if (W.ammo !== Infinity && wName !== 'PISTOL') {
                          W.ammo = Math.min((W.ammo || 0) + 8, (W.max || 999));
                      }
                  }
              } else {
                  W.ammo += W.startAmmo;
              }
              refreshSlotHUD();
          });
      } else if (p.wName === 'CROSSBOW') {
          // Simply grant 1 bolt (RNG is now handled at the drop phase)
          W.ammo = Math.min((W.ammo || 0) + 1, W.max || 999);
          refreshSlotHUD();
      } else {
        const scavAtt = ATTACHMENTS[ getLoadout(curWep).attachments?.magazine ];
        if (scavAtt?.mods?.scavengerBonus) {
            W.ammo += Math.round(W.startAmmo * (1 + scavAtt.mods.scavengerBonus));
        } else {
            W.ammo += W.startAmmo;
        }
        if (W.max) W.ammo = Math.min(W.ammo, W.max);
      }

      if (WDEFS[p.wName]?.wonderWeapon) {
        recordWonderWeaponCollected(p.wName);
      }

      sfx.wPickup();
      refreshSlotHUD();

      // --- TIMEOUT Hide instead of delete ---
      if (p._static) {
        p.mesh.setEnabled(false);
        p.ring.setEnabled(false);
        if (p.light) p.light.setEnabled(false);
        p.respawnTimer = p._respawnMs / 1000; // Convert MS to Seconds
      } else {
        p.mesh.getChildMeshes().forEach(m => m.dispose()); p.mesh.dispose();
        p.ring.dispose(); p.light.dispose();
        weaponDrops.splice(i, 1);
      }
      continue;
    }

    if (dist < nearestDist) { nearestDist = dist; nearestName = p.wName; }
  }

  // Pickup hint (only for weapons not yet owned)
  const hint = document.getElementById('wPickupHint');
  if (hint) {
    if (nearestName && nearestDist < 3.0 && !inventory.includes(nearestName)) {
      hint.textContent = '[F] PICK UP: ' + WDEFS[nearestName].name;
      hint.classList.add('show');
      _wPickupHintTimer = .4;
    } else {
      _wPickupHintTimer -= dt;
      if (_wPickupHintTimer <= 0) hint.classList.remove('show');
    }
  }
}

export function tryPickupWeapon(gameRunning, paused) {
  if (!gameRunning || paused) return;

  let nearest = null, nearestDist = 3.5;
  for (const p of weaponDrops) {
    const d = BABYLON.Vector3.Distance(p.mesh.position, camera.position);
    if (d < nearestDist) { nearestDist = d; nearest = p; }
  }
  if (!nearest) return;

  const wName = nearest.wName;
  const W     = WDEFS[wName];

  // When first picking up pistol, initialize ammo correctly
  if (wName === 'PISTOL') {
    import('./progression.js').then(({ getLoadout }) => {
        if (getLoadout('PISTOL').attachments?.special === 'endless_magazine') {
            W.ammo = Infinity;
        } else {
            W.ammo = W.startAmmo || 24;
        }
    });
  }

  const existingSlot = inventory.findIndex(w => w === wName);
  if (existingSlot !== -1) {
    const isEnergyWeapon = W.useHeat || (wName === 'PLASMA' && W.ammo === Infinity);
    if (isEnergyWeapon) {
      // Energy weapon: instant heat cooldown instead of ammo
      if (cb.resetWeaponHeat) cb.resetWeaponHeat(wName);
      import('./progression.js').then(({ recordEnergyPickup }) => recordEnergyPickup(wName));
      //showToast("ENERGY OVERCHARGE!", "#33aaff");
    } else if (wName === 'RAILGUN') {
      import('./progression.js').then(({ hasEfficiencyModule }) => {
        const bonus = hasEfficiencyModule() ? 1 : 0;
        W.ammo = Math.min((W.ammo || 0) + W.startAmmo + bonus, (W.max || 999));
        refreshSlotHUD();
      });
      import('./progression.js').then(({ recordRailgunPickup }) => recordRailgunPickup());
    } else if (wName === 'CROSSBOW') {
        W.ammo = Math.min((W.ammo || 0) + 1, W.max || 999);
        refreshSlotHUD();
    } else {
      W.ammo = W.startAmmo;
      // Initialize magazine from effective stats (includes attachment bonuses)
      import('./progression.js').then(({ getEffectiveStats }) => {
      const EW = getEffectiveStats(wName, W);
      if (EW.magSize) {
          W.currentMag = EW.magSize;
      }
      })
    }
    
    // Track first-time energy weapon pickups
    refreshSlotHUD();
  } else {
    W.ammo = W.startAmmo;
    // Initialize magazine from effective stats (applies attachment bonuses)
    import('./progression.js').then(({ getEffectiveStats }) => {
        const EW = getEffectiveStats(wName, W);
        if (EW.magSize) {
            W.currentMag = EW.magSize;
        }
        if (EW.startAmmo !== W.startAmmo) {
            W.ammo = EW.startAmmo;
        }
        refreshSlotHUD();
    });
    
    // Track first-time energy weapon pickups too
    if (ENERGY_WEAPONS.has(wName)) {
      import('./progression.js').then(({ recordEnergyPickup }) => recordEnergyPickup(wName));
    }
    const freeSlot = inventory.findIndex((w, i) => w === null && i !== 2);
    if (freeSlot !== -1) {
      inventory[freeSlot] = wName;
      if (activeSlot === 2) { setActiveSlot(freeSlot); setWeapon(wName); }
      else refreshSlotHUD();
    } else {
      let slotToReplace = activeSlot;
      if (slotToReplace === 2) slotToReplace = 0;
      inventory[slotToReplace] = wName;
      setActiveSlot(slotToReplace);
      setWeapon(wName);
    }
  }
  if (WDEFS[wName]?.wonderWeapon) {
    recordWonderWeaponCollected(wName);
  }
  sfx.wPickup();
  if (nearest._static) {
    nearest.mesh.setEnabled(false);
    nearest.ring.setEnabled(false);
    if (nearest.light) nearest.light.setEnabled(false);
    nearest.respawnTimer = nearest._respawnMs / 1000;
  } else {
    nearest.mesh.getChildMeshes().forEach(m => m.dispose()); nearest.mesh.dispose();
    nearest.ring.dispose(); nearest.light.dispose();
    const idx = weaponDrops.indexOf(nearest);
    if (idx !== -1) weaponDrops.splice(idx, 1);
  }

  refreshSlotHUD();
}

// ── Powerup spawner ───────────────────────────────────────────────────────────
export function spawnPowerup(pos, type) {
  const mesh = BABYLON.MeshBuilder.CreatePlane('pwr', { size: 1.2 }, scene);
  const mat  = new BABYLON.StandardMaterial('pwrMat', scene);
  mat.diffuseTexture = new BABYLON.Texture(`assets/textures/lq/pwr_${type}.png`, scene);
  mesh.material = mat;
  mesh.position.copyFrom(pos);
  mesh.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;

  const ring = BABYLON.MeshBuilder.CreateTorus('pwrRing', { diameter: 1.5, thickness: 0.05, tessellation: 16 }, scene);
  ring.position.copyFrom(pos);
  ring.material = M.ledGreen;
  ring.isPickable = false;

  pickups.push({
    mesh, ring,
    type:    'powerup',
    pwrType: type,
    baseY:   pos.y,
    bob:     Math.random() * Math.PI * 2,
    collect: () => {
      if (player.buffs[type]) player.buffs[type] += 30;
      else player.buffs[type] = 30;
      sfx.powerup();
      if (cb.markHudDirty) cb.markHudDirty();
    },
  });
}
