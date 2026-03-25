// pickups.js – consumable pickups (health/armor/ammo) and weapon drops  (Babylon.js port)
const BABYLON = window.BABYLON;
import { scene, camera } from './scene.js';
import { M } from './textures.js';
import { pickups, weaponDrops, player, cb } from './gameState.js';
import { WDEFS, WCOLORS, inventory, activeSlot, makeScaledWeaponModel, setWeapon, refreshSlotHUD, setActiveSlot } from './weapons.js';
import { sfx } from './audio.js';
import { TIER_5 } from './level.js';

const SECRET_KIT_RESPAWN_SEC = 300;

export function initSecretKits() {
  const S_KITS = [
    { tag: 'secret_health', type: 'health', pos: new BABYLON.Vector3(-2, TIER_5 + 1.0, 28) },
    { tag: 'secret_armor',  type: 'armor',  pos: new BABYLON.Vector3( 2, TIER_5 + 1.0, 28) },
  ];

  S_KITS.forEach(kit => {
    // ── FIX: Use a 3D Box. It is impossible for a box to face the wrong way or be 2D-culled.
    const mesh = BABYLON.MeshBuilder.CreateBox('kit_' + kit.type, { size: 1.2 }, scene);
    const mat = new BABYLON.StandardMaterial('kitMat_' + kit.type, scene);
    
    // Give them solid fallback colors
    mat.diffuseColor = kit.type === 'health' ? new BABYLON.Color3(0, 0.5, 1) : new BABYLON.Color3(0, 1, 0);
    mat.emissiveColor = mat.diffuseColor;
    mat.disableLighting = true;
    
    // Attempt to load texture
    const texName = kit.type === 'health' ? 'health' : 'armor';
    mat.diffuseTexture = new BABYLON.Texture(`assets/textures/lq/${texName}.png`, scene);
    mesh.material = mat;
    mesh.position.copyFrom(kit.pos);

    const ring = BABYLON.MeshBuilder.CreateTorus('kitRing', { diameter: 2.0, thickness: 0.1, tessellation: 24 }, scene);
    ring.position.set(kit.pos.x, kit.pos.y - 0.5, kit.pos.z); 
    ring.material = kit.type === 'health' ? M.ledBlue : M.ledGreen;
    ring.isPickable = false;

    pickups.push({
      mesh, ring, type: kit.type, baseY: mesh.position.y,
      respawnTimer: 0, expires: false, bob: Math.random() * 5
    });
  });
}

function _makePickupLight(pos, col3) {
  const l = new BABYLON.PointLight('pkLight', pos.clone(), scene);
  l.diffuse = col3; l.intensity = 1.1; l.range = 4.5;
  return l;
}

export function spawnPickup(pos) {
  const r = Math.random();
  const type = r < .3 ? 'health' : r < .8 ? 'armor' : 'ammo';
  return spawnTypedPickup(pos, type);
}

export function spawnTypedPickup(pos, type, options = {}) {
  const col3 = type==='health' ? new BABYLON.Color3(1,.13,.2)
             : type==='armor'  ? new BABYLON.Color3(.13,.27,.93)
             :                   new BABYLON.Color3(.8,.73,0);
             
// Change the MeshBuilder line to make it double-sided AND billboarded
  const mesh = BABYLON.MeshBuilder.CreatePlane('pk', { size: 0.8, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
  
  // Ensure this line is present right below it:
  mesh.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
  
  // Create material with your specific 2D image
  const mat = new BABYLON.StandardMaterial('pkMat_' + type, scene);
  mat.diffuseTexture = new BABYLON.Texture(`assets/textures/lq/${type}.png`, scene);
  mat.diffuseTexture.hasAlpha = true; // Respects transparent backgrounds
  mat.useAlphaFromDiffuseTexture = true;
  mat.emissiveColor = new BABYLON.Color3(0.5, 0.5, 0.5); // Keep it visible in dark areas
  mat.disableLighting = true; 
  
  mesh.material = mat;
  mesh.position.set(pos.x, pos.y ?? 0.6, pos.z);
  mesh.isPickable = false;
  
  // BILLBOARD MODE: Always face the camera
  mesh.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;

  // ... keep the rest of your ring/light/entry creation code exactly the same ...
  const baseY = pos.y ?? .45;
  mesh.position.set(pos.x, baseY, pos.z); mesh.material = mat; mesh.isPickable = false;
  const rmat = new BABYLON.StandardMaterial('pkRing', scene);
  rmat.emissiveColor = col3; rmat.disableLighting = true;
  const ring = BABYLON.MeshBuilder.CreateTorus('pkRing', { diameter:.6, thickness:.06, tessellation:14 }, scene);
  ring.position.copyFrom(mesh.position); ring.material = rmat; ring.isPickable = false;
  const l = _makePickupLight(mesh.position, col3);
  const entry = {
    mesh,
    ring,
    light: l,
    type,
    bob: Math.random()*Math.PI*2,
    baseY,
    tag: options.tag || null,
    respawnSec: options.respawnSec || 0,
    respawnTimer: 0,
    persistent: !!options.persistent,
  };
  pickups.push(entry);
  return entry;
}

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
            const wepName = inventory[activeSlot];
            if (wepName && wepName !== 'PISTOL') {
                const W = WDEFS[wepName];
                if (W && W.ammo !== Infinity) {
                    W.ammo += (W.startAmmo || 20); 
                    picked = true;
                }
            }
        } else if (p.type === 'powerup') {
            picked = true;
        }

        if (picked) {
            // ── FIX: Ensure ALL items play a sound and update the HUD ──
            if (p.collect) {
                p.collect(); // Powerups play their own specific SFX
            } else {
                if (sfx.item) sfx.item(); // Standard item SFX
            }
            if (cb.markHudDirty) cb.markHudDirty();
            
            if (p.expires || p.type === 'powerup' || p.type === 'ammo') {
                p.mesh.dispose();
                if(p.ring) p.ring.dispose();
                pickups.splice(i, 1);
            } else {
                p.mesh.setEnabled(false);
                if(p.ring) p.ring.setEnabled(false);
                p.respawnTimer = 30.0; 
            }
            continue;
        }
    }

    // Flicker for drops
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

    // Respawn for secret area kits
    if (p.respawnTimer > 0) {
        p.respawnTimer -= dt;
        if (p.respawnTimer <= 0) {
            p.mesh.setEnabled(true);
            if(p.ring) p.ring.setEnabled(true);
            p.mesh.visibility = 1.0;
        }
    }

    // Anim
    if (p.mesh.isEnabled()) {
        p.bob = (p.bob || 0) + dt * 3;
        p.mesh.position.y = p.baseY + Math.sin(p.bob) * 0.2;
        p.mesh.rotation.y += dt * 2;
    }
  }
}

// ── Weapon drops ─────────────────────────────────────────────
export function spawnWeaponDrop(pos, wName) {
  const c = WCOLORS[wName] || 0xffffff;
  const col3 = new BABYLON.Color3(((c>>16)&0xff)/255, ((c>>8)&0xff)/255, (c&0xff)/255);
  const mesh = makeScaledWeaponModel(wName, 0.85);
  
  const startY = pos.y || 0; // Grab the bot's death height!
  
  mesh.position.set(pos.x, startY + 0.55, pos.z);
  const rmat = new BABYLON.StandardMaterial('wdRing', scene);
  rmat.emissiveColor = col3; rmat.disableLighting = true;
  const ring = BABYLON.MeshBuilder.CreateTorus('wdRing', { diameter:.7, thickness:.06, tessellation:16 }, scene);
  ring.position.set(pos.x, startY + 0.22, pos.z); ring.material = rmat; ring.isPickable = false;
  const light = _makePickupLight(new BABYLON.Vector3(pos.x, startY + 0.4, pos.z), col3);
  light.range = 5.5; light.intensity = 1.4;
  
  weaponDrops.push({ mesh, ring, light, wName, bob: Math.random()*Math.PI*2, life: 45, baseY: startY });
}

let _wPickupHintTimer = 0;
export function updateWeaponDrops(dt) {
  let nearestDist = 3.5, nearestName = null;
  for (let i = weaponDrops.length - 1; i >= 0; i--) {
    const p = weaponDrops[i];
    p.life -= dt;
    if (p.life <= 0) {
      p.mesh.getChildMeshes().forEach(m => m.dispose()); p.mesh.dispose();
      p.ring.dispose(); p.light.dispose();
      weaponDrops.splice(i, 1); continue;
    }
    
    // Animation logic
    p.bob += dt * 2.0;
    const y = (p.baseY + 0.55) + Math.sin(p.bob) * .08;
    p.mesh.position.y = y; p.ring.position.y = y - .33;
    p.mesh.rotation.y += dt * 1.6;
    
    const dist = BABYLON.Vector3.Distance(p.mesh.position, camera.position);

    // ── Auto-pickup if weapon is already owned ──
    if (dist < 1.35 && inventory.includes(p.wName)) {
      const W = WDEFS[p.wName];
      // Only give ammo to THIS specific weapon
      W.ammo += W.startAmmo; 
      
      sfx.wPickup();
      refreshSlotHUD();
      
      // Remove the drop
      p.mesh.getChildMeshes().forEach(m => m.dispose()); p.mesh.dispose();
      p.ring.dispose(); p.light.dispose();
      weaponDrops.splice(i, 1);
      continue;
    }

    if (dist < nearestDist) { nearestDist = dist; nearestName = p.wName; }
  }

  // UI Hint logic: Only show [F] if you DON'T own it yet
  const hint = document.getElementById('wPickupHint');
  if (hint) {
    if (nearestName && nearestDist < 3.0 && !inventory.includes(nearestName)) {
      hint.textContent = '[F] PICK UP: ' + WDEFS[nearestName].name;
      hint.classList.add('show'); _wPickupHintTimer = .4;
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
  const W = WDEFS[wName];

  // ── Slot assignment rules ────────────────────────────────────────────────
  const existingSlot = inventory.findIndex(w => w === wName);
  
  if (existingSlot !== -1) {
    // Rule 1: same weapon type already in inventory → add ammo
    W.ammo += W.startAmmo;
    if (W.max) W.ammo = Math.min(W.ammo, W.max);
    refreshSlotHUD();
  } else {
    // Give base ammo for a brand new weapon
    W.ammo = W.startAmmo;
    
    // Rule 2: there is an empty slot (EXCLUDING the reserved slot 3/index 2) → fill it.
    const freeSlot = inventory.findIndex((w, i) => w === null && i !== 2);
    
    if (freeSlot !== -1) {
      inventory[freeSlot] = wName;
      if (activeSlot === 2) {
        setActiveSlot(freeSlot);
        setWeapon(wName);
      } else {
        refreshSlotHUD();
      }
    } else {
      // Rule 3: no empty slots → replace the active slot.
      let slotToReplace = activeSlot;
      
      // CRITICAL: NEVER replace the permanent pistol in slot 3!
      if (slotToReplace === 2) {
        slotToReplace = 0; 
      }
      
      inventory[slotToReplace] = wName;
      setActiveSlot(slotToReplace);
      setWeapon(wName);
    }
  }

  sfx.wPickup();
  nearest.mesh.getChildMeshes().forEach(m => m.dispose()); nearest.mesh.dispose();
  nearest.ring.dispose(); nearest.light.dispose();
  const idx = weaponDrops.indexOf(nearest);
  if (idx !== -1) weaponDrops.splice(idx, 1);
  refreshSlotHUD();
}

export function spawnPowerup(pos, type) {
  const mesh = BABYLON.MeshBuilder.CreatePlane('pwr', { size: 1.2 }, scene);
  const mat = new BABYLON.StandardMaterial('pwrMat', scene);
  mat.diffuseTexture = new BABYLON.Texture(`assets/textures/lq/pwr_${type}.png`, scene);
  mesh.material = mat;
  mesh.position.copyFrom(pos);
  mesh.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;

  const ring = BABYLON.MeshBuilder.CreateTorus('pwrRing', {
    diameter: 1.5,
    thickness: 0.05,
    tessellation: 16
  }, scene);
  ring.position.copyFrom(pos);
  ring.material = M.ledGreen; 
  ring.isPickable = false;

  pickups.push({
    mesh,
    ring,
    type: 'powerup',
    pwrType: type, 
    baseY: pos.y,                       
    bob: Math.random() * Math.PI * 2,
    collect: () => {
        // Add 30 seconds to whatever buff this is (quad_damage, double_score, etc.)
        if (player.buffs[type]) {
            player.buffs[type] += 30;
        } else {
            player.buffs[type] = 30;
        }
        
        // Play sound and immediately update the UI
        if (sfx.powerup) sfx.powerup(); 
        else if (sfx.item) sfx.item();
        if (cb.markHudDirty) cb.markHudDirty();
    }
  });
}