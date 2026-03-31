// weapons.js – weapon definitions, models, inventory, equip/swap  (Babylon.js port)
const BABYLON = window.BABYLON;
import { scene, camera } from './scene.js';
import { M } from './textures.js';
import { isScoped } from './player.js';

export const WDEFS = {
  PISTOL:   { name:'PISTOL',          dmg:20,  range:75,  cd:.18,  hitscan:true,  ammo:Infinity, aps:1, spread:.0,   pellets:1, startAmmo:Infinity, falloff:0.30 },
  SMG:      { name:'SMG',             dmg:11,  range:55,  cd:.09,  hitscan:true,  ammo:0,        aps:1, spread:.035, pellets:1, startAmmo:45,       falloff:0.50 },
  SHOTGUN:  { name:'SHOTGUN',         dmg:32,  range:25,  cd:.25,  hitscan:true,  ammo:0,        aps:1, spread:0.12, pellets:10,startAmmo:16,       falloff:0.80 },
  CHAINGUN: { name:'CHAINGUN',        dmg:14,  range:30,  cd:.08,  hitscan:true,  ammo:0,        aps:1, spread:.055, pellets:1, startAmmo:80,       falloff:0.70 },
  RAILGUN:  { name:'RAILGUN',         dmg:110, range:130, cd:1.8,  hitscan:true,  ammo:0,        aps:1, spread:.0,   pellets:1, startAmmo:6,        falloff:0.00 },
  PLASMA:   { name:'PLASMA RIFLE',    dmg:25,  range:90,  cd:.28,  hitscan:false, ammo:0,        aps:1,             pellets:1, startAmmo:30, speed:42, falloff:0.00 },
  ROCKET:   { name:'ROCKET LAUNCHER', dmg:95,  range:90,  cd:1.2,  hitscan:false, ammo:0,        aps:1,             pellets:1, startAmmo:6,  speed:16, splash:4.5, falloff:0.00 },
  GLAUNCHER: { 
    name:'LAUNCHER', dmg:65, range:60, cd:0.8, hitscan:false, 
    ammo:0, aps:1, spread:0.02, pellets:1, startAmmo:12, falloff:0,
    projSpeed: 30, splash: 7.0 
  },
};

export const WCOLORS = {
  PISTOL:0x999999, SMG:0xff8800, SHOTGUN:0x885533,
  CHAINGUN:0xff3300, RAILGUN:0x00ffcc, PLASMA:0x4488ff, ROCKET:0xcc3300,
  GLAUNCHER:0x44cc44,
};

export const ROBOT_DROPS = {
  scout:     'SMG',
  heavy:     'CHAINGUN',
  sniper:    'RAILGUN',
  drone:     'PLASMA',
  pistol:    ['ROCKET', 'SHOTGUN', 'RAILGUN'][Math.floor(Math.random() * 3)],
  shotgun:   'SHOTGUN',
  rocket:    'ROCKET',
  grenadier: 'GLAUNCHER',
};

export const AUTO_WEAPONS = new Set(['SMG', 'CHAINGUN']);

export const inventory = [null, null, 'PISTOL']; 
export let activeSlot = 2;
export let   curWep     = 'PISTOL';
export let   wepCooldown = 0;
export let   swingT      = 0;

export function setWepCooldown(v) { wepCooldown = v; }
export function setSwingT(v)      { swingT = v; }
export function setActiveSlotVar(v){ activeSlot = v; }
export function setCurWepVar(v)   { curWep = v; }

// ── Weapon models ─────────────────────────────────────────────
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
function _buildGlauncher(p) {
  _cyl(p,'tube', .15, .72, M.grey,     0,   .02,  .12, Math.PI/2);
  _cyl(p,'tube2',.09, .28, M.gunMetal, 0,   .02,  .50, Math.PI/2);
  _cyl(p,'brch', .12, .10, M.black,    0,   .02, -.22, Math.PI/2);
  _box(p,'recv', .10, .13, .44, M.gunMetal, 0, .08,  .08);
  _box(p,'grip', .07, .20, .12, M.gunBrown, 0, -.10, -.12, .18);
  _box(p,'fore', .09, .08, .20, M.gunBrown, 0, -.06,  .24);
  _box(p,'grn',  .016,.05, .34, M.ledGreen, -.052, .10, .12);
}

const _modelBuilders = {
  PISTOL: _buildPistol, SMG: _buildSmg, SHOTGUN: _buildShotgun,
  CHAINGUN: _buildChaingun, RAILGUN: _buildRailgun,
  PLASMA: _buildPlasma, ROCKET: _buildRocket, GLAUNCHER: _buildGlauncher,
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

// ── Attachment visual meshes ──────────────────────────────────
// Keyed by wName → array of extra meshes attached to wepGroup
const _attachmentMeshes = {};

// Shared materials for attachment visuals
const _attMats = {
  black:     () => { const m = new BABYLON.StandardMaterial('attBlack', scene); m.diffuseColor = new BABYLON.Color3(0.06,0.06,0.06); m.specularColor = new BABYLON.Color3(0.1,0.1,0.1); return m; },
  steel:     () => { const m = new BABYLON.StandardMaterial('attSteel', scene); m.diffuseColor = new BABYLON.Color3(0.30,0.32,0.34); m.specularColor = new BABYLON.Color3(0.4,0.4,0.4); return m; },
  tan:       () => { const m = new BABYLON.StandardMaterial('attTan',   scene); m.diffuseColor = new BABYLON.Color3(0.50,0.38,0.22); return m; },
  green:     () => { const m = new BABYLON.StandardMaterial('attGreen', scene); m.diffuseColor = new BABYLON.Color3(0.10,0.48,0.12); return m; },
  redLed:    () => { const m = new BABYLON.StandardMaterial('attRed',   scene); m.emissiveColor = new BABYLON.Color3(0.9,0.1,0.1); m.disableLighting = true; return m; },
  cyanLed:   () => { const m = new BABYLON.StandardMaterial('attCyan',  scene); m.emissiveColor = new BABYLON.Color3(0.1,0.9,0.9); m.disableLighting = true; return m; },
  glassBlue: () => { const m = new BABYLON.StandardMaterial('attGlass', scene); m.diffuseColor = new BABYLON.Color3(0.3,0.6,0.9); m.alpha = 0.55; m.emissiveColor = new BABYLON.Color3(0.05,0.2,0.4); return m; },
};

// Muzzle offset per weapon (where the barrel tip is, in model-local Z)
const MUZZLE_Z = {
  PISTOL:    0.42,
  SMG:       0.47,
  SHOTGUN:   0.76,
  CHAINGUN:  0.60,
  RAILGUN:   0.94,
  PLASMA:    0.72,
  ROCKET:    0.62,
  GLAUNCHER: 0.65,
};

// Rail/top position per weapon
const TOP_Y  = { PISTOL:0.09, SMG:0.08, SHOTGUN:0.09, CHAINGUN:0.10, RAILGUN:0.08, PLASMA:0.10, ROCKET:0.14, GLAUNCHER:0.16 };
const GRIP_Z = { PISTOL:-0.05, SMG:-0.02, SHOTGUN:0.18, CHAINGUN:-0.08, RAILGUN:-0.05, PLASMA:-0.02, ROCKET:-0.10, GLAUNCHER:0.10 };

function _makeSightRedDot(parent, wName) {
  const mz = MUZZLE_Z[wName] ?? 0.40;
  const ty = TOP_Y[wName] ?? 0.09;
  const black = _attMats.black(); const red = _attMats.redLed();
  // Housing
  const housing = BABYLON.MeshBuilder.CreateBox('att_rds_housing', { width:0.04, height:0.042, depth:0.10 }, scene);
  housing.position.set(0, ty + 0.046, mz - 0.22);
  housing.material = black; housing.parent = parent; housing.isPickable = false;
  // Window (front glass)
  const glass = BABYLON.MeshBuilder.CreateBox('att_rds_glass', { width:0.035, height:0.030, depth:0.005 }, scene);
  glass.position.set(0, ty + 0.046, mz - 0.17);
  glass.material = _attMats.glassBlue(); glass.parent = parent; glass.isPickable = false;
  // Dot
  const dot = BABYLON.MeshBuilder.CreateSphere('att_rds_dot', { diameter:0.006, segments:4 }, scene);
  dot.position.set(0, ty + 0.046, mz - 0.17);
  dot.material = red; dot.parent = parent; dot.isPickable = false;
  // Turrets (windage/elevation knobs)
  const knob1 = BABYLON.MeshBuilder.CreateCylinder('att_rds_knob1', { diameter:0.014, height:0.022, tessellation:6 }, scene);
  knob1.rotation.z = Math.PI/2; knob1.position.set(0.03, ty + 0.056, mz - 0.22);
  knob1.material = black; knob1.parent = parent; knob1.isPickable = false;
  return [housing, glass, dot, knob1];
}

function _makeSightAcog(parent, wName) {
  const mz = MUZZLE_Z[wName] ?? 0.40;
  const ty = TOP_Y[wName] ?? 0.09;
  const black = _attMats.black(); const steel = _attMats.steel(); const glass = _attMats.glassBlue();
  // Main body
  const body = BABYLON.MeshBuilder.CreateBox('att_acog_body', { width:0.048, height:0.052, depth:0.22 }, scene);
  body.position.set(0, ty + 0.056, mz - 0.28);
  body.material = black; body.parent = parent; body.isPickable = false;
  // Objective lens
  const objLens = BABYLON.MeshBuilder.CreateCylinder('att_acog_obj', { diameter:0.044, height:0.008, tessellation:10 }, scene);
  objLens.rotation.x = Math.PI/2; objLens.position.set(0, ty + 0.056, mz - 0.39);
  objLens.material = glass; objLens.parent = parent; objLens.isPickable = false;
  // Ocular lens
  const ocLens = BABYLON.MeshBuilder.CreateCylinder('att_acog_oc', { diameter:0.036, height:0.008, tessellation:10 }, scene);
  ocLens.rotation.x = Math.PI/2; ocLens.position.set(0, ty + 0.056, mz - 0.17);
  ocLens.material = glass; ocLens.parent = parent; ocLens.isPickable = false;
  // Elevation knob
  const knob = BABYLON.MeshBuilder.CreateCylinder('att_acog_knob', { diameter:0.016, height:0.024, tessellation:6 }, scene);
  knob.position.set(0, ty + 0.090, mz - 0.26);
  knob.material = steel; knob.parent = parent; knob.isPickable = false;
  return [body, objLens, ocLens, knob];
}

function _makeSightThermal(parent, wName) {
  const mz = MUZZLE_Z[wName] ?? 0.40;
  const ty = TOP_Y[wName] ?? 0.09;
  const black = _attMats.black(); const cyan = _attMats.cyanLed();
  // Boxy thermal housing
  const body = BABYLON.MeshBuilder.CreateBox('att_thm_body', { width:0.055, height:0.060, depth:0.18 }, scene);
  body.position.set(0, ty + 0.060, mz - 0.26);
  body.material = black; body.parent = parent; body.isPickable = false;
  // Lens ring (glowing cyan)
  const ring = BABYLON.MeshBuilder.CreateTorus('att_thm_ring', { diameter:0.040, thickness:0.006, tessellation:12 }, scene);
  ring.rotation.x = Math.PI/2; ring.position.set(0, ty + 0.060, mz - 0.35);
  ring.material = cyan; ring.parent = parent; ring.isPickable = false;
  // Ocular
  const oc = BABYLON.MeshBuilder.CreateCylinder('att_thm_oc', { diameter:0.030, height:0.006, tessellation:10 }, scene);
  oc.rotation.x = Math.PI/2; oc.position.set(0, ty + 0.060, mz - 0.17);
  oc.material = _attMats.glassBlue(); oc.parent = parent; oc.isPickable = false;
  return [body, ring, oc];
}

function _makeBarrelSuppressor(parent, wName) {
  const mz = MUZZLE_Z[wName] ?? 0.40;
  const black = _attMats.black(); const steel = _attMats.steel();
  // Long suppressor tube
  const tube = BABYLON.MeshBuilder.CreateCylinder('att_supp_tube', { diameter:0.050, height:0.32, tessellation:12 }, scene);
  tube.rotation.x = Math.PI/2; tube.position.set(0, 0.02, mz + 0.16);
  tube.material = black; tube.parent = parent; tube.isPickable = false;
  // Mount ring
  const ring = BABYLON.MeshBuilder.CreateCylinder('att_supp_ring', { diameter:0.056, height:0.018, tessellation:12 }, scene);
  ring.rotation.x = Math.PI/2; ring.position.set(0, 0.02, mz);
  ring.material = steel; ring.parent = parent; ring.isPickable = false;
  // End cap
  const cap = BABYLON.MeshBuilder.CreateCylinder('att_supp_cap', { diameterTop:0.044, diameterBottom:0.050, height:0.016, tessellation:12 }, scene);
  cap.rotation.x = Math.PI/2; cap.position.set(0, 0.02, mz + 0.32);
  cap.material = black; cap.parent = parent; cap.isPickable = false;
  return [tube, ring, cap];
}

function _makeBarrelHeavy(parent, wName) {
  const mz = MUZZLE_Z[wName] ?? 0.40;
  const steel = _attMats.steel(); const black = _attMats.black();
  // Thicker barrel extension
  const ext = BABYLON.MeshBuilder.CreateCylinder('att_hbbl_ext', { diameter:0.048, height:0.18, tessellation:10 }, scene);
  ext.rotation.x = Math.PI/2; ext.position.set(0, 0.02, mz + 0.09);
  ext.material = steel; ext.parent = parent; ext.isPickable = false;
  // Vents
  for (let i = 0; i < 3; i++) {
    const v = BABYLON.MeshBuilder.CreateBox('att_hbbl_vent' + i, { width:0.010, height:0.020, depth:0.008 }, scene);
    v.position.set(0, 0.046, mz + 0.04 + i * 0.05);
    v.material = black; v.parent = parent; v.isPickable = false;
  }
  return [ext];
}

function _makeBarrelCompensator(parent, wName) {
  const mz = MUZZLE_Z[wName] ?? 0.40;
  const steel = _attMats.steel(); const black = _attMats.black();
  // Compensator box
  const body = BABYLON.MeshBuilder.CreateBox('att_comp_body', { width:0.052, height:0.040, depth:0.072 }, scene);
  body.position.set(0, 0.024, mz + 0.036);
  body.material = steel; body.parent = parent; body.isPickable = false;
  // Top vents
  for (let i = 0; i < 2; i++) {
    const v = BABYLON.MeshBuilder.CreateBox('att_comp_vent' + i, { width:0.048, height:0.008, depth:0.010 }, scene);
    v.position.set(0, 0.044, mz + 0.020 + i * 0.028);
    v.material = black; v.parent = parent; v.isPickable = false;
  }
  return [body];
}

function _makeBarrelExtended(parent, wName) {
  const mz = MUZZLE_Z[wName] ?? 0.40;
  const steel = _attMats.steel();
  const ext = BABYLON.MeshBuilder.CreateCylinder('att_ext_bbl', { diameter:0.034, height:0.20, tessellation:8 }, scene);
  ext.rotation.x = Math.PI/2; ext.position.set(0, 0.02, mz + 0.10);
  ext.material = steel; ext.parent = parent; ext.isPickable = false;
  // Muzzle crown
  const crown = BABYLON.MeshBuilder.CreateCylinder('att_ext_crown', { diameterTop:0.042, diameterBottom:0.034, height:0.012, tessellation:8 }, scene);
  crown.rotation.x = Math.PI/2; crown.position.set(0, 0.02, mz + 0.20);
  crown.material = steel; crown.parent = parent; crown.isPickable = false;
  return [ext, crown];
}

function _makeMagExtended(parent, wName) {
  // Extend the magazine downward
  const black = _attMats.black();
  const ext = BABYLON.MeshBuilder.CreateBox('att_emag_ext', { width:0.055, height:0.10, depth:0.065 }, scene);
  ext.position.set(0, -0.215, GRIP_Z[wName] ?? -0.04);
  ext.material = black; ext.parent = parent; ext.isPickable = false;
  return [ext];
}

function _makeMagDrum(parent, wName) {
  const steel = _attMats.steel(); const black = _attMats.black();
  const gz = GRIP_Z[wName] ?? -0.04;
  // Drum cylinder – sits where the standard box mag would be
  const drum = BABYLON.MeshBuilder.CreateCylinder('att_drum', { diameter:0.16, height:0.14, tessellation:16 }, scene);
  drum.rotation.x = Math.PI/2; drum.position.set(0, -0.14, gz);
  drum.material = steel; drum.parent = parent; drum.isPickable = false;
  // Centre hub
  const hub = BABYLON.MeshBuilder.CreateCylinder('att_drum_hub', { diameter:0.06, height:0.145, tessellation:8 }, scene);
  hub.rotation.x = Math.PI/2; hub.position.set(0, -0.14, gz);
  hub.material = black; hub.parent = parent; hub.isPickable = false;
  return [drum, hub];
}

function _makeMagQuick(parent, wName) {
  // A slightly trimmed mag with a pull tab
  const black = _attMats.black(); const tan = _attMats.tan();
  const gz = GRIP_Z[wName] ?? -0.04;
  const tab = BABYLON.MeshBuilder.CreateBox('att_qmag_tab', { width:0.028, height:0.016, depth:0.055 }, scene);
  tab.position.set(0, -0.17, gz - 0.032);
  tab.material = tan; tab.parent = parent; tab.isPickable = false;
  return [tab];
}

function _makeGripAngled(parent, wName) {
  const tan = _attMats.tan();
  // Angled foregrip (pointing slightly forward)
  const grip = BABYLON.MeshBuilder.CreateBox('att_agrip', { width:0.022, height:0.10, depth:0.040 }, scene);
  grip.rotation.x = -0.35; // angled forward
  grip.position.set(0, -0.08, 0.18);
  grip.material = tan; grip.parent = parent; grip.isPickable = false;
  // Mounting rail nub
  const rail = BABYLON.MeshBuilder.CreateBox('att_agrip_rail', { width:0.022, height:0.010, depth:0.040 }, scene);
  rail.position.set(0, -0.025, 0.18);
  rail.material = _attMats.black(); rail.parent = parent; rail.isPickable = false;
  return [grip, rail];
}

function _makeGripVertical(parent, wName) {
  const tan = _attMats.tan(); const black = _attMats.black();
  const grip = BABYLON.MeshBuilder.CreateBox('att_vgrip', { width:0.022, height:0.090, depth:0.028 }, scene);
  grip.position.set(0, -0.075, 0.18);
  grip.material = tan; grip.parent = parent; grip.isPickable = false;
  const base = BABYLON.MeshBuilder.CreateBox('att_vgrip_base', { width:0.032, height:0.010, depth:0.028 }, scene);
  base.position.set(0, -0.025, 0.18);
  base.material = black; base.parent = parent; base.isPickable = false;
  return [grip, base];
}

function _makeStockHeavy(parent, wName) {
  const black = _attMats.black(); const steel = _attMats.steel();
  // Cheek riser + butt plate
  const riser = BABYLON.MeshBuilder.CreateBox('att_hstock_riser', { width:0.060, height:0.035, depth:0.12 }, scene);
  riser.position.set(0, 0.02, -0.32);
  riser.material = black; riser.parent = parent; riser.isPickable = false;
  const butt = BABYLON.MeshBuilder.CreateBox('att_hstock_butt', { width:0.070, height:0.090, depth:0.012 }, scene);
  butt.position.set(0, -0.01, -0.38);
  butt.material = steel; butt.parent = parent; butt.isPickable = false;
  return [riser, butt];
}

function _makeStockFolded(parent, wName) {
  const black = _attMats.black();
  // Wire/skeleton stock folded to the side
  const bar = BABYLON.MeshBuilder.CreateBox('att_fstock_bar', { width:0.006, height:0.006, depth:0.18 }, scene);
  bar.position.set(0.032, 0.0, -0.26);
  bar.material = black; bar.parent = parent; bar.isPickable = false;
  const bar2 = BABYLON.MeshBuilder.CreateBox('att_fstock_bar2', { width:0.006, height:0.006, depth:0.18 }, scene);
  bar2.position.set(-0.032, 0.0, -0.26);
  bar2.material = black; bar2.parent = parent; bar2.isPickable = false;
  const cross = BABYLON.MeshBuilder.CreateBox('att_fstock_cross', { width:0.068, height:0.006, depth:0.006 }, scene);
  cross.position.set(0, 0.0, -0.35);
  cross.material = black; cross.parent = parent; cross.isPickable = false;
  return [bar, bar2, cross];
}

// Dispatch table for building visual attachment geometry
const _attVisualBuilders = {
  sight: {
    red_dot:   _makeSightRedDot,
    acog:      _makeSightAcog,
    thermal:   _makeSightThermal,
  },
  barrel: {
    suppressor:     _makeBarrelSuppressor,
    heavy:          _makeBarrelHeavy,
    compensator:    _makeBarrelCompensator,
    extended:       _makeBarrelExtended,
  },
  magazine: {
    extended: _makeMagExtended,
    drum:     _makeMagDrum,
    quick:    _makeMagQuick,
  },
  grip: {
    angled:   _makeGripAngled,
    vertical: _makeGripVertical,
  },
  stock: {
    heavy:  _makeStockHeavy,
    folded: _makeStockFolded,
  },
};

/** Destroy all visual attachment meshes for a weapon */
function _clearAttachmentMeshes(wName) {
  const meshes = _attachmentMeshes[wName];
  if (!meshes) return;
  for (const m of meshes) {
    if (m && !m.isDisposed()) m.dispose();
  }
  _attachmentMeshes[wName] = [];
}

/** Build and attach visual geometry for all equipped attachments on wName */
function _rebuildAttachmentVisuals(wName) {
  _clearAttachmentMeshes(wName);
  const modelNode = wepModels[wName];
  if (!modelNode) return;

  import('./progression.js').then(({ getLoadout, ATTACHMENTS }) => {
    const loadout = getLoadout(wName);
    const newMeshes = [];

    for (const [slot, attId] of Object.entries(loadout.attachments)) {
      const att = ATTACHMENTS[attId];
      if (!att?.visual) continue;
      const { type, style } = att.visual;
      const builderGroup = _attVisualBuilders[type];
      if (!builderGroup) continue;
      const builder = builderGroup[style];
      if (!builder) continue;

      const built = builder(modelNode, wName);
      if (Array.isArray(built)) newMeshes.push(...built);
    }
    _attachmentMeshes[wName] = newMeshes;

    // Show/hide depending on whether this is the active weapon
    const show = (wName === curWep);
    for (const m of newMeshes) m.setEnabled(show);
  });
}

const WPOS = {
  PISTOL:    new BABYLON.Vector3(.38,-.36, .66),
  SHOTGUN:   new BABYLON.Vector3(.32,-.38, .60),
  ROCKET:    new BABYLON.Vector3(.28,-.32, .63),
  SMG:       new BABYLON.Vector3(.36,-.34, .60),
  CHAINGUN:  new BABYLON.Vector3(.30,-.34, .62),
  RAILGUN:   new BABYLON.Vector3(.34,-.35, .68),
  PLASMA:    new BABYLON.Vector3(.35,-.35, .64),
  GLAUNCHER: new BABYLON.Vector3(.30,-.34, .62),
};
const WROT = {
  PISTOL:    new BABYLON.Vector3(.06,-.08,0),
  SHOTGUN:   new BABYLON.Vector3(.04,-.10,0),
  ROCKET:    new BABYLON.Vector3(.05,-.12,0),
  SMG:       new BABYLON.Vector3(.05,-.09,0),
  CHAINGUN:  new BABYLON.Vector3(.05,-.11,0),
  RAILGUN:   new BABYLON.Vector3(.04,-.10,0),
  PLASMA:    new BABYLON.Vector3(.05,-.10,0),
  GLAUNCHER: new BABYLON.Vector3(.05,-.11,0),
};

export function refreshSlotHUD() {
  for (let i = 0; i < 3; i++) { 
    const el = document.getElementById('wSlot' + i);
    if (!el) continue;
    const wep = inventory[i];
    const isActive = (i === activeSlot);
    el.className = 'wSlot' + (isActive ? ' active' : '') + (wep ? '' : ' empty');
    const nameEl = el.querySelector('.sName');
    const ammoEl = el.querySelector('.sAmmo');
    if (wep) {
        nameEl.textContent = WDEFS[wep].name;
        const a = WDEFS[wep].ammo;
        ammoEl.textContent = (a === Infinity) ? 'INFINITE' : a + ' RDS';
    } else {
        nameEl.textContent = 'EMPTY';
        ammoEl.textContent = '—';
    }
  }
}

export function setWeapon(name) {
  if (!WDEFS[name]) return;
  const prev = curWep;
  curWep = name;

  // Hide all weapon models + their attachment visuals
  for (const [k, node] of Object.entries(wepModels)) {
    const show = (k === name);
    node.getChildMeshes().forEach(m => m.setEnabled(show));
    // Toggle attachment meshes for prev/new weapon
    const attMeshes = _attachmentMeshes[k] || [];
    for (const m of attMeshes) m.setEnabled(show);
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

// ── Loadout application ───────────────────────────────────────
export function applyLoadoutToScene(wName) {
  import('./progression.js').then(({ getLoadout, WEAPON_SKINS, ATTACHMENTS }) => {
    const node = wepModels[wName];
    if (!node) return;
    const loadout = getLoadout(wName);
    const skin    = WEAPON_SKINS[loadout.skin] ?? WEAPON_SKINS.default;

    const [br, bg, bb] = skin.body;
    const [ar, ag, ab] = skin.accent;
    const [gr, gg, gb] = skin.grip;

    node.getChildMeshes().forEach(m => {
      const n = m.name.toLowerCase();
      // Don't recolour attachment geometry (they have 'att_' prefix)
      if (n.startsWith('att_')) return;
      const mat = new BABYLON.StandardMaterial('skin_' + m.name + '_' + wName, scene);
      mat.disableLighting = false;
      if (n.includes('grip') || n.includes('stck') || n.includes('fore')) {
        mat.diffuseColor = new BABYLON.Color3(gr, gg, gb);
      } else if (n.includes('bbl') || n.includes('barrel') || n.includes('tube') || n.includes('hous')) {
        mat.diffuseColor = new BABYLON.Color3(ar, ag, ab);
      } else if (n.includes('led') || n.includes('glow') || n.includes('lens') || n.includes('grn')) {
        return;
      } else {
        mat.diffuseColor = new BABYLON.Color3(br, bg, bb);
      }
      m.material = mat;
    });

    // Rebuild attachment visuals
    _rebuildAttachmentVisuals(wName);
  });
}

export function animWeapon(dt) {
  const targetX = isScoped ? 0 : WPOS[curWep].x;
  const targetY = isScoped ? WPOS[curWep].y + 0.08 : WPOS[curWep].y + Math.sin(Date.now() * .0018) * .007;
  wepGroup.position.x += (targetX - wepGroup.position.x) * dt * 15;
  wepGroup.position.y += (targetY - wepGroup.position.y) * dt * 15;
  if (swingT > 0) {
    swingT = Math.max(0, swingT - dt * 7.5);
    const k = Math.sin(swingT * Math.PI);
    wepGroup.position.z = WPOS[curWep].z - k * .09;
    wepGroup.rotation.x = WROT[curWep].x + k * .28;
  } else {
    wepGroup.position.z = WPOS[curWep].z;
    wepGroup.rotation.x = WROT[curWep].x;
  }
}

/** Called once at startup to init all attachment visual slots */
export function initAttachmentVisuals() {
  for (const wName of Object.keys(WDEFS)) {
    _attachmentMeshes[wName] = [];
    _rebuildAttachmentVisuals(wName);
  }
}
