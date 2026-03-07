// weapons.js – weapon definitions, models, inventory, equip/swap  (Babylon.js port)
const BABYLON = window.BABYLON;
import { scene, camera } from './scene.js';
import { M } from './textures.js';

export const WDEFS = {
  PISTOL:   { name:'PISTOL',          dmg:20,  range:90,  cd:.18,  hitscan:true,  ammo:Infinity, aps:1, spread:.0,   pellets:1, startAmmo:Infinity },
  SMG:      { name:'SMG',             dmg:11,  range:55,  cd:.09,  hitscan:true,  ammo:0,        aps:1, spread:.035, pellets:1, startAmmo:45 },
  SHOTGUN:  { name:'SHOTGUN',         dmg:15,  range:16,  cd:.72,  hitscan:true,  ammo:0,        aps:1, spread:.09,  pellets:7, startAmmo:20 },
  CHAINGUN: { name:'CHAINGUN',        dmg:14,  range:60,  cd:.08,  hitscan:true,  ammo:0,        aps:1, spread:.055, pellets:1, startAmmo:80 },
  RAILGUN:  { name:'RAILGUN',         dmg:110, range:130, cd:1.8,  hitscan:true,  ammo:0,        aps:1, spread:.0,   pellets:1, startAmmo:6  },
  PLASMA:   { name:'PLASMA RIFLE',    dmg:25,  range:90,  cd:.28,  hitscan:false, ammo:0,        aps:1,             pellets:1, startAmmo:30, speed:42 },
  ROCKET:   { name:'ROCKET LAUNCHER', dmg:95,  range:90,  cd:1.2,  hitscan:false, ammo:0,        aps:1,             pellets:1, startAmmo:6,  speed:16, splash:4.5 },
};

export const WCOLORS = {
  PISTOL:0x999999, SMG:0xff8800, SHOTGUN:0x885533,
  CHAINGUN:0xff3300, RAILGUN:0x00ffcc, PLASMA:0x4488ff, ROCKET:0xcc3300,
};

// Each robot type drops the weapon it visually carries
export const ROBOT_DROPS = {
  scout:   'SMG',
  heavy:   'CHAINGUN',
  sniper:  'RAILGUN',
  drone:   'PLASMA',
  pistol:  'PISTOL',
  shotgun: 'SHOTGUN',
  rocket:  'ROCKET',
};

export const AUTO_WEAPONS = new Set(['SMG', 'CHAINGUN']);

export const inventory  = ['PISTOL', null];
export let   activeSlot = 0;
export let   curWep     = 'PISTOL';
export let   wepCooldown = 0;
export let   swingT      = 0;

export function setWepCooldown(v) { wepCooldown = v; }
export function setSwingT(v)      { swingT = v; }
export function setActiveSlotVar(v){ activeSlot = v; }
export function setCurWepVar(v)   { curWep = v; }

// ── Weapon models ─────────────────────────────────────────────
// wepGroup is a TransformNode parented to the camera so it moves with view.
export const wepGroup = new BABYLON.TransformNode('wepGroup', scene);
wepGroup.parent = camera;

function _box(parent, name, sx, sy, sz, mat, px, py, pz, rx) {
  const m = BABYLON.MeshBuilder.CreateBox(name, { width:sx, height:sy, depth:sz }, scene);
  m.position.set(px, py, pz); m.material = mat; m.parent = parent;
  m.isPickable = false; if (rx) m.rotation.x = rx;
  return m;
}
function _cyl(parent, name, d, h, mat, px, py, pz, rx) {
  const m = BABYLON.MeshBuilder.CreateCylinder(name, { diameter:d, height:h, tessellation:8 }, scene);
  m.position.set(px, py, pz); m.material = mat; m.parent = parent;
  m.isPickable = false; if (rx !== undefined) m.rotation.x = rx;
  return m;
}
function _sph(parent, name, d, mat, px, py, pz) {
  const m = BABYLON.MeshBuilder.CreateSphere(name, { diameter:d, segments:6 }, scene);
  m.position.set(px, py, pz); m.material = mat; m.parent = parent;
  m.isPickable = false;
  return m;
}
function _torus(parent, name, d, t, mat, px, py, pz) {
  const m = BABYLON.MeshBuilder.CreateTorus(name, { diameter:d, thickness:t, tessellation:12 }, scene);
  m.position.set(px, py, pz); m.material = mat; m.parent = parent;
  m.isPickable = false; m.rotation.y = Math.PI/2;
  return m;
}

function _buildPistol(p) {
  _box(p,'slide',.082,.1,.52,M.gunMetal,0,.04, .1);
  _box(p,'grip', .07,.22,.14,M.gunBrown,0,-.1,-.11,.24);
  _cyl(p,'bbl',  .036,.34,M.gunMetal,0,.04, .35,Math.PI/2);
  _box(p,'trig', .02,.1,.04,M.black,0,-.06,-.05);
}
function _buildShotgun(p) {
  _box(p,'body',.09,.11,.72,M.gunBrown,0,.02, .14);
  _cyl(p,'bbl', .062,.56,M.gunMetal,0,.04, .47,Math.PI/2);
  _box(p,'pump',.11,.09,.24,M.grey,0,-.03, .32);
  _box(p,'stck',.06,.13,.28,M.gunBrown,0,0,-.22,-.12);
}
function _buildRocket(p) {
  _cyl(p,'tube',.15,.88,M.grey,0,.02, .18,Math.PI/2);
  _box(p,'grip',.08,.18,.12,M.gunBrown,0,-.1,-.11);
  _cyl(p,'scop',.052,.26,M.gunMetal,0,.14, .1,Math.PI/2);
  _cyl(p,'exht',.136,.05,M.black,0,.02,-.22,Math.PI/2);
}
function _buildSmg(p) {
  _box(p,'body',.07,.09,.38,M.gunMetal,0,.02, .10);
  _cyl(p,'bbl', .03,.28,M.grey,0,.02, .32,Math.PI/2);
  _box(p,'grip',.06,.18,.1,M.gunBrown,0,-.1,-.08,.2);
  _box(p,'mag', .055,.18,.06,M.black,0,-.1,-.04);
}
function _buildChaingun(p) {
  for (let i=0;i<4;i++) {
    const a=(i/4)*Math.PI*2;
    _cyl(p,'bbl'+i,.044,.72,M.gunMetal,Math.cos(a)*.06,Math.sin(a)*.06+.02, .24,Math.PI/2);
  }
  _cyl(p,'hous',.2,.52,M.grey,0,.02, .12,Math.PI/2);
  _box(p,'grip',.08,.18,.12,M.gunBrown,0,-.12,-.14);
  _box(p,'ammo',.14,.1,.16,M.black,0,.08,-.18);
}
function _buildRailgun(p) {
  _box(p,'body',.08,.1,.85,M.gunMetal,0,.02, .22);
  _cyl(p,'bbl', .036,.65,M.grey,0,.02, .6,Math.PI/2);
  for (let i=0;i<4;i++) _torus(p,'rng'+i,.11,.024,M.ledCyan,0,.02, .22+i*.14);
  _box(p,'grip',.07,.2,.11,M.gunBrown,0,-.1,-.12);
}
function _buildPlasma(p) {
  _box(p,'body',.09,.12,.62,M.gunMetal,0,.02, .14);
  _cyl(p,'bbl', .08,.28,M.gunMetal,0,.02, .4,Math.PI/2);
  _sph(p,'lens',.1,M.plasmaMat,0,.02, .56);
  _box(p,'grip',.07,.18,.1,M.gunBrown,0,-.1,-.1,.16);
}

const _modelBuilders = {
  PISTOL: _buildPistol, SMG: _buildSmg, SHOTGUN: _buildShotgun,
  CHAINGUN: _buildChaingun, RAILGUN: _buildRailgun,
  PLASMA: _buildPlasma, ROCKET: _buildRocket,
};

export function makeScaledWeaponModel(wName, sc) {
  const node = new BABYLON.TransformNode('wm_' + wName, scene);
  const fn = _modelBuilders[wName];
  if (fn) fn(node);
  node.scaling.setAll(sc);
  return node;
}

export const wepModels = {};
for (const [k, fn] of Object.entries(_modelBuilders)) {
  const node = new BABYLON.TransformNode('wep_' + k, scene);
  fn(node);
  node.parent = wepGroup;
  node.getChildMeshes().forEach(m => { m.isPickable = false; m.setEnabled(false); });
  wepModels[k] = node;
}

const WPOS = {
  PISTOL:   new BABYLON.Vector3(.38,-.36, .66),
  SHOTGUN:  new BABYLON.Vector3(.32,-.38, .60),
  ROCKET:   new BABYLON.Vector3(.28,-.32, .63),
  SMG:      new BABYLON.Vector3(.36,-.34, .60),
  CHAINGUN: new BABYLON.Vector3(.30,-.34, .62),
  RAILGUN:  new BABYLON.Vector3(.34,-.35, .68),
  PLASMA:   new BABYLON.Vector3(.35,-.35, .64),
};
const WROT = {
  PISTOL:   new BABYLON.Vector3(.06,-.08,0),
  SHOTGUN:  new BABYLON.Vector3(.04,-.10,0),
  ROCKET:   new BABYLON.Vector3(.05,-.12,0),
  SMG:      new BABYLON.Vector3(.05,-.09,0),
  CHAINGUN: new BABYLON.Vector3(.05,-.11,0),
  RAILGUN:  new BABYLON.Vector3(.04,-.10,0),
  PLASMA:   new BABYLON.Vector3(.05,-.10,0),
};

export function refreshSlotHUD() {
  for (let i = 0; i < 2; i++) {
    const el  = document.getElementById('wSlot' + i);
    if (!el) return;
    const wep = inventory[i];
    const isActive = (i === activeSlot);
    el.className = 'wSlot' + (isActive ? ' active' : '') + (wep ? '' : ' empty');
    el.querySelector('.sName').textContent = wep ? WDEFS[wep].name : 'EMPTY';
    const a = wep ? WDEFS[wep].ammo : null;
    el.querySelector('.sAmmo').textContent = wep ? (a === Infinity ? 'INFINITE' : a + ' RDS') : '—';
  }
}

export function setWeapon(name) {
  if (!WDEFS[name]) return;
  curWep = name;
  for (const [k, node] of Object.entries(wepModels)) {
    const show = (k === name);
    node.getChildMeshes().forEach(m => m.setEnabled(show));
  }
  wepGroup.position.copyFrom(WPOS[name]);
  wepGroup.rotation.copyFromFloats(WROT[name].x, WROT[name].y, WROT[name].z);
  refreshSlotHUD();
}

export function setActiveSlot(i) {
  activeSlot = i;
  if (inventory[i]) setWeapon(inventory[i]);
  refreshSlotHUD();
}

export function animWeapon(dt) {
  if (swingT > 0) {
    swingT = Math.max(0, swingT - dt * 7.5);
    const k = Math.sin(swingT * Math.PI);
    wepGroup.position.z = WPOS[curWep].z - k * .09;
    wepGroup.rotation.x = WROT[curWep].x + k * .28;
  } else {
    wepGroup.position.y = WPOS[curWep].y + Math.sin(Date.now() * .0018) * .007;
  }
}

