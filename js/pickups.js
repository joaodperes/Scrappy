// pickups.js – consumable pickups (health/armor/ammo) and weapon drops  (Babylon.js port)
const BABYLON = window.BABYLON;
import { scene, camera } from './scene.js';
import { M } from './textures.js';
import { pickups, weaponDrops, player, cb } from './gameState.js';
import { WDEFS, WCOLORS, inventory, activeSlot, makeScaledWeaponModel, setWeapon, refreshSlotHUD, setActiveSlot } from './weapons.js';
import { sfx } from './audio.js';

const SECRET_KIT_RESPAWN_SEC = 300;
const SECRET_KITS = [
  { tag: 'secret_health', type: 'health', pos: { x: 34.2, y: 0.55, z: -34.0 } },
  { tag: 'secret_armor',  type: 'armor',  pos: { x: 32.8, y: 0.55, z: -34.0 } },
];

function _makePickupLight(pos, col3) {
  const l = new BABYLON.PointLight('pkLight', pos.clone(), scene);
  l.diffuse = col3; l.intensity = 1.1; l.range = 4.5;
  return l;
}

export function spawnPickup(pos) {
  const r = Math.random();
  // Increase armor spawn rate: health 30%, armor 50%, ammo 20%
  const type = r < .3 ? 'health' : r < .8 ? 'armor' : 'ammo';
  return spawnTypedPickup(pos, type);
}

export function spawnTypedPickup(pos, type, options = {}) {
  const mat  = type==='health' ? M.healthMat : type==='armor' ? M.armorMat : M.ammoMat;
  const col3 = type==='health' ? new BABYLON.Color3(1,.13,.2)
               : type==='armor'  ? new BABYLON.Color3(.13,.27,.93)
               :                   new BABYLON.Color3(.8,.73,0);
  const mesh = BABYLON.MeshBuilder.CreateSphere('pk', { diameter:.5, segments:8 }, scene);
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

function ensureSecretKits() {
  for (const k of SECRET_KITS) {
    const exists = pickups.some(p => p.tag === k.tag);
    if (!exists) {
      spawnTypedPickup(k.pos, k.type, {
        tag: k.tag,
        respawnSec: SECRET_KIT_RESPAWN_SEC,
        persistent: true,
      });
    }
  }
}

export function updatePickups(dt) {
  ensureSecretKits();
  for (let i = pickups.length-1; i >= 0; i--) {
    const p = pickups[i]; p.bob += dt*2.2;
    if (p.respawnTimer > 0) {
      p.respawnTimer = Math.max(0, p.respawnTimer - dt);
      if (p.respawnTimer === 0) {
        p.mesh.setEnabled(true);
        p.ring.setEnabled(true);
        p.light.setEnabled(true);
      }
      continue;
    }

    const y = p.baseY + Math.sin(p.bob)*.1;
    p.mesh.position.y = y; p.ring.position.y = y;
    p.ring.rotation.y += dt*2.5;
    if (BABYLON.Vector3.Distance(p.mesh.position, camera.position) < 1.35) {
      let taken = false;
      if      (p.type==='health' && player.hp < player.maxHp) { player.hp    = Math.min(player.maxHp,    player.hp+45);    taken=true; }
      else if (p.type==='armor')                               { player.armor = Math.min(player.maxArmor, player.armor+55); taken=true; }
      else if (p.type==='ammo') {
        for (const wn of inventory) {
          if (!wn || wn==='PISTOL') continue;
          WDEFS[wn].ammo = Math.min(WDEFS[wn].startAmmo*2, WDEFS[wn].ammo + Math.floor(WDEFS[wn].startAmmo*.4));
        }
        taken = true;
      }
      if (taken) {
        sfx.pickup();
        if (p.respawnSec > 0) {
          p.respawnTimer = p.respawnSec;
          p.mesh.setEnabled(false);
          p.ring.setEnabled(false);
          p.light.setEnabled(false);
        } else {
          p.mesh.dispose(); p.ring.dispose(); p.light.dispose();
          pickups.splice(i, 1);
        }
        cb.markHudDirty && cb.markHudDirty();
      }
    }
  }
}

// ── Weapon drops ─────────────────────────────────────────────
export function spawnWeaponDrop(pos, wName) {
  const c = WCOLORS[wName] || 0xffffff;
  const col3 = new BABYLON.Color3(((c>>16)&0xff)/255, ((c>>8)&0xff)/255, (c&0xff)/255);
  const mesh = makeScaledWeaponModel(wName, 0.85);
  mesh.position.set(pos.x, .55, pos.z);
  const rmat = new BABYLON.StandardMaterial('wdRing', scene);
  rmat.emissiveColor = col3; rmat.disableLighting = true;
  const ring = BABYLON.MeshBuilder.CreateTorus('wdRing', { diameter:.7, thickness:.06, tessellation:16 }, scene);
  ring.position.set(pos.x, .22, pos.z); ring.material = rmat; ring.isPickable = false;
  const light = _makePickupLight(new BABYLON.Vector3(pos.x, .4, pos.z), col3);
  light.range = 5.5; light.intensity = 1.4;
  weaponDrops.push({ mesh, ring, light, wName, bob: Math.random()*Math.PI*2, life: 45 });
}

let _wPickupHintTimer = 0;
export function updateWeaponDrops(dt) {
  let nearestDist = 3.5, nearestName = null;
  for (let i = weaponDrops.length-1; i >= 0; i--) {
    const p = weaponDrops[i];
    p.life -= dt;
    if (p.life <= 0) {
      p.mesh.getChildMeshes().forEach(m => m.dispose()); p.mesh.dispose();
      p.ring.dispose(); p.light.dispose();
      weaponDrops.splice(i, 1); continue;
    }
    const blink = p.life < 8 && Math.floor(p.life * 4) % 2 === 0;
    p.mesh.getChildMeshes().forEach(m => m.setEnabled(!blink));
    p.ring.setEnabled(!blink);

    p.bob += dt*2.0;
    const y = .55 + Math.sin(p.bob)*.08;
    p.mesh.position.y = y; p.ring.position.y = y-.33;
    p.mesh.rotation.y += dt*1.6;
    p.ring.rotation.y += dt*2.2;
    const dist = BABYLON.Vector3.Distance(p.mesh.position, camera.position);
    if (dist < nearestDist) { nearestDist = dist; nearestName = p.wName; }
  }
  const hint = document.getElementById('wPickupHint');
  if (hint) {
    if (nearestName && nearestDist < 3.0) {
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
  WDEFS[nearest.wName].ammo = WDEFS[nearest.wName].startAmmo;
  // Improved pickup logic:
  // 1. If weapon already in inventory, replace that slot
  // 2. If free slot, fill it
  // 3. Otherwise, replace active slot
  let slot = inventory.findIndex(w => w === nearest.wName);
  if (slot !== -1) {
    inventory[slot] = nearest.wName;
    setActiveSlot(slot);
    setWeapon(nearest.wName);
  } else {
    let freeSlot = inventory.findIndex(w => w === null);
    if (freeSlot !== -1) {
      inventory[freeSlot] = nearest.wName;
      setActiveSlot(freeSlot);
      setWeapon(nearest.wName);
    } else {
      inventory[activeSlot] = nearest.wName;
      setWeapon(nearest.wName);
    }
  }
  sfx.wPickup();
  nearest.mesh.getChildMeshes().forEach(m => m.dispose()); nearest.mesh.dispose();
  nearest.ring.dispose(); nearest.light.dispose();
  const idx = weaponDrops.indexOf(nearest);
  if (idx !== -1) weaponDrops.splice(idx, 1);
  refreshSlotHUD();
}
