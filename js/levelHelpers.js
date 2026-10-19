// levelHelpers.js – shared, editor-compatible geometry primitives for ALL maps.
//
// "Editor-compatible structure": every function below creates ONE piece of
// level geometry, tags it with `metadata.editable + metadata.generator +
// metadata.params`, and (when it's a solid prop) pushes it into the shared
// `walkableMeshes` array so the NavMesh bake picks it up. Any mesh built
// through one of these functions can be:
//   • selected / nudged / rotated / scaled / deleted in editor.html
//   • exported to JSON ("Export JSON" — the exporter just walks scene.meshes
//     and serializes anything with `metadata.editable && metadata.generator`)
//   • re-created on import, by calling `generator(...params)` again
//
// Complex *systemic* features (staircases, ziplines, lifts, bridges, hazard
// zones, destructible walls, jump pads, lighting, the NavMesh bake itself)
// are still built with the primitives below (for consistent collision +
// walkableMeshes bookkeeping + DRY code), but are explicitly tagged
// `{ editable: false }` — they're multi-mesh and/or behavioural constructs
// (movement data, hp tracking, parenting) that don't round-trip through a
// single generic "drag this box around" JSON object, so they're excluded
// from the generic editable-prop system on purpose.
//
// Uses window.__levelScene for the current scene (set by host).
const BABYLON = window.BABYLON;
import { walkableMeshes, explosiveBarrels, jumpPads } from './level.js';
import { M } from './textures.js';
import { validateMapDocument } from './mapSchema.js';
import { registerMapDocument } from './mapLayoutStore.js';

export const LIFT_Y = 0.22;
export const liftY = y => (y > 0.05 ? y + LIFT_Y : y);

// ── Get the current scene ──────────────────────────────────────
function getScene() {
  if (typeof window !== 'undefined' && window.__levelScene) {
    return window.__levelScene;
  }
  throw new Error('No scene provided – set window.__levelScene before using levelHelpers');
}

// ── Materials ────────────────────────────────────────────────
// Backward-compatible "the 4 defaults" (jungle, and anyone else who only
// wants a simple palette) plus a 5th (glass) default added for the maps
// that need transparent panels.
export let matConcrete, matSteel, matGarden, matAsphalt, matGlass;

// ── Material registry ───────────────────────────────────────────
// Lets every createX() call embed a *key* (not a direct object reference)
// in its exported params, so a JSON round-trip can resolve it back to the
// right material on import — including level-specific materials beyond the
// 4/5 defaults (city's glassBlue/glassCyan, terminal's bridge texture, …).
// Call registerMaterial(key, mat) right after creating any material you
// want createX() calls to be able to reference by name.
const _matByKey = new Map();   // key -> material
const _keyByMat = new Map();   // material -> key

export function registerMaterial(key, mat) {
  if (!key || !mat) return mat;
  _matByKey.set(key, mat);
  _keyByMat.set(mat, key);
  return mat;
}

export function resolveMaterial(key, fallback = matConcrete) {
  return _matByKey.get(key) || fallback;
}

function _keyForMat(mat) {
  return _keyByMat.get(mat) || 'concrete';
}

function _defaultGlass() {
  const scene = getScene();
  const m = new BABYLON.StandardMaterial('defaultGlass', scene);
  m.diffuseColor = new BABYLON.Color3(0.5, 0.7, 0.95);
  m.alpha = 0.28;
  m.specularColor = new BABYLON.Color3(0.7, 0.8, 1.0);
  m.backFaceCulling = false;
  return m;
}

/**
 * Registers the level's default palette. `glass` is optional — if omitted a
 * generic transparent-blue default is created so createGlass() always has
 * something sane to fall back on.
 */
export function setLevelMaterials(concrete, steel, garden, asphalt, glass = null) {
  matConcrete = registerMaterial('concrete', concrete);
  matSteel    = registerMaterial('steel', steel);
  matGarden   = registerMaterial('garden', garden);
  matAsphalt  = registerMaterial('asphalt', asphalt);
  matGlass    = registerMaterial('glass', glass || _defaultGlass());
}

function _tagMeta(m, type, generator, params, editable, extraMeta) {
  m.metadata = editable
    ? { editable: true, type, generator, params, ...(extraMeta || {}) }
    : { editable: false, type, ...(extraMeta || {}) };
  m.isPickable = !!editable; // Required for editor picking.
  return m;
}

// ── Editable primitives ─────────────────────────────────────────
// Every primitive below accepts a trailing `opts` object:
//   editable  – tag (and make exportable) as a generic prop. Default true.
//   navmesh   – push into walkableMeshes for the NavMesh bake. Default true.
//   extraMeta – extra fields merged onto metadata (e.g. {destructible:true,
//               hp:140}) for game-logic that needs more than position/size.
//               Forces this instance to behave as non-generic even if
//               editable were true, since exporting would lose those fields
//               — pass editable:false alongside extraMeta.

export function createSlab(px, surfY, pz, sx, sz, mat = matConcrete, opts = {}) {
  const { editable = true, navmesh = true, lift = true, thickness = 0.8, extraMeta = null } = opts;
  const scene = getScene();
  const H = thickness;
  const cy = (lift ? liftY(surfY) : surfY) - H / 2;
  const m = BABYLON.MeshBuilder.CreateBox('slab', { width: sx, height: H, depth: sz }, scene);
  m.position.set(px, cy, pz);
  m.material = mat;
  m.checkCollisions = true;
  m.isPickable = false;
  _tagMeta(m, 'slab', 'createSlab',
    { px, surfY, pz, sx, sz, mat: _keyForMat(mat), lift, thickness }, editable, extraMeta);
  if (navmesh) walkableMeshes.push(m);
  return m;
}

export function createWall(px, py, pz, sx, sy, sz, mat = matSteel, opts = {}) {
  const { editable = true, navmesh = true, extraMeta = null } = opts;
  const scene = getScene();
  const m = BABYLON.MeshBuilder.CreateBox('wall', { width: sx, height: sy, depth: sz }, scene);
  m.position.set(px, py, pz);
  m.material = mat;
  m.checkCollisions = true;
  m.isPickable = false;
  _tagMeta(m, 'wall', 'createWall',
    { px, py, pz, sx, sy, sz, mat: _keyForMat(mat) }, editable, extraMeta);
  if (navmesh) walkableMeshes.push(m);
  return m;
}

export function createPillar(px, pz, baseY, height = 5, diameter = 1.0, mat = matSteel, opts = {}) {
  const { editable = true, navmesh = true, extraMeta = null } = opts;
  const scene = getScene();
  const m = BABYLON.MeshBuilder.CreateCylinder('pillar', { diameter, height }, scene);
  m.position.set(px, baseY + height / 2, pz);
  m.material = mat;
  m.checkCollisions = true;
  m.isPickable = false;
  _tagMeta(m, 'pillar', 'createPillar',
    { px, pz, baseY, height, diameter, mat: _keyForMat(mat) }, editable, extraMeta);
  if (navmesh) walkableMeshes.push(m);
  return m;
}

/** Square box column (center-positioned, unlike createPillar's base-anchored cylinder). */
export function createColumn(px, py, pz, height = 6, size = 0.5, mat = matSteel, opts = {}) {
  const { editable = true, navmesh = true, extraMeta = null } = opts;
  const scene = getScene();
  const m = BABYLON.MeshBuilder.CreateBox('column', { width: size, height, depth: size }, scene);
  m.position.set(px, py, pz);
  m.material = mat;
  m.checkCollisions = true;
  m.isPickable = false;
  _tagMeta(m, 'column', 'createColumn',
    { px, py, pz, height, size, mat: _keyForMat(mat) }, editable, extraMeta);
  if (navmesh) walkableMeshes.push(m);
  return m;
}

/** An angled slab — generic box+rotation ramp, used for sloped bridge spans,
 * stair-connector ramps, and their side rails. Distinct from createRamp()
 * below, which is the original directional (rise-over-run) ramp generator —
 * kept under its own name so any already-authored assets/maps/*.json data
 * built with the original editor (generator:'createRamp', params:{cx, cz,
 * dir, width, fromY, toY, length}) keeps resolving correctly. Use
 * createRampBox for free-form editor placement (position+rotation gizmos
 * map onto it directly); use createRamp when you want to specify a rise
 * from one height to another over a run in a compass direction. */
export function createRampBox(px, py, pz, sx, sy, sz, rotX = 0, rotZ = 0, mat = matConcrete, opts = {}) {
  const { editable = true, navmesh = true, extraMeta = null } = opts;
  const scene = getScene();
  const m = BABYLON.MeshBuilder.CreateBox('ramp', { width: sx, height: sy, depth: sz }, scene);
  m.position.set(px, py, pz);
  if (rotX) m.rotation.x = rotX;
  if (rotZ) m.rotation.z = rotZ;
  m.material = mat;
  m.checkCollisions = true;
  m.isPickable = false;
  _tagMeta(m, 'ramp_box', 'createRampBox',
    { px, py, pz, sx, sy, sz, rotX, rotZ, mat: _keyForMat(mat) }, editable, extraMeta);
  if (navmesh) walkableMeshes.push(m);
  return m;
}

/** Original directional ramp: a single angled slab rising `fromY` → `toY`
 * over `length` units in compass direction `dir` ('N'|'S'|'E'|'W'), `width`
 * units wide. Matches the pre-refactor levelHelpers.js exactly (same
 * generator name, same params shape, same math) so any assets/maps/*.json
 * already authored with it — e.g. the jungle temple's ramps — keeps
 * resolving identically through the shared JSON pipeline below. */
export function createRamp(cx, cz, dir, width, fromY, toY, length, mat = matConcrete, opts = {}) {
  const { editable = true, navmesh = true, extraMeta = null } = opts;
  const scene = getScene();
  const rise = fromY - toY;
  const sign = (dir === 'S' || dir === 'E') ? 1 : -1;
  const isZ = (dir === 'N' || dir === 'S');

  const rampLen = length || 15;
  const hyp = Math.sqrt(rampLen * rampLen + rise * rise);

  const rampMidX = isZ ? cx : cx + sign * (rampLen / 2);
  const rampMidZ = isZ ? cz + sign * (rampLen / 2) : cz;
  const rampMidY = (fromY + toY) / 2;

  const m = BABYLON.MeshBuilder.CreateBox('ramp', {
    width: isZ ? width : hyp,
    height: 0.8,
    depth: isZ ? hyp : width,
  }, scene);
  m.position.set(rampMidX, rampMidY, rampMidZ);
  if (isZ) m.rotation.x = Math.atan2(-rise, rampLen) * sign;
  else m.rotation.z = -Math.atan2(-rise, rampLen) * sign;

  m.material = mat;
  m.checkCollisions = true;
  m.isPickable = false;

  _tagMeta(m, 'ramp', 'createRamp',
    { cx, cz, dir, width, fromY, toY, length, mat: _keyForMat(mat) }, editable, extraMeta);
  if (navmesh) walkableMeshes.push(m);
  return m;
}

/** Semi-transparent panel. Non-collidable cosmetic overlay by default (collides:false); pass collides:true for a real glass wall/obstacle. */
export function createGlass(px, py, pz, sx, sy, sz, mat = matGlass, opts = {}) {
  const { editable = true, collides = false, extraMeta = null } = opts;
  const scene = getScene();
  const m = BABYLON.MeshBuilder.CreateBox('glass', { width: sx, height: sy, depth: sz }, scene);
  m.position.set(px, py, pz);
  m.material = mat;
  m.checkCollisions = collides;
  m.isPickable = false;
  _tagMeta(m, 'glass', 'createGlass',
    { px, py, pz, sx, sy, sz, mat: _keyForMat(mat), collides }, editable, extraMeta);
  if (collides) walkableMeshes.push(m);
  return m;
}

/** Overhead slab. Non-collidable by default (it's usually just a roof/skybox cap); pass collides:true to block rocket-jumps through it. */
export function createCeiling(px, y, pz, sx, sz, mat = matConcrete, opts = {}) {
  const { editable = true, collides = false, extraMeta = null } = opts;
  const scene = getScene();
  const m = BABYLON.MeshBuilder.CreateBox('ceil', { width: sx, height: 0.35, depth: sz }, scene);
  m.position.set(px, y, pz);
  m.material = mat;
  m.checkCollisions = collides;
  m.isPickable = false;
  _tagMeta(m, 'ceiling', 'createCeiling',
    { px, y, pz, sx, sz, mat: _keyForMat(mat), collides }, editable, extraMeta);
  if (collides) walkableMeshes.push(m);
  return m;
}

export function createBarrel(px, pz, yOff = 0, opts = {}) {
  const { editable = true } = opts;
  const scene = getScene();
  const baseY = liftY(yOff) + 0.46;
  const bm = BABYLON.MeshBuilder.CreateCylinder('barrel', {
    diameterTop: 0.96, diameterBottom: 1.0, height: 0.92, tessellation: 12,
  }, scene);
  bm.position.set(px, baseY, pz);
  bm.material = M.barrel;
  bm.checkCollisions = true;
  bm.isPickable = true; // required so hitscan/explosion pickWithRay predicates can reach it
  _tagMeta(bm, 'barrel', 'createBarrel', { px, pz, yOff }, editable);

  const _hoop = (yPos) => {
    const h = BABYLON.MeshBuilder.CreateCylinder('barrelHoop', {
      diameterTop: 1.22, diameterBottom: 1.24, height: 0.15, tessellation: 12,
    }, scene);
    h.parent = bm;
    h.position.set(0, yPos - baseY, 0);
    h.material = M.barrelHoop || M.grey;
    h.isPickable = false;
    h.metadata = { editable: false, type: 'barrelHoop' };
    return h;
  };
  const band1 = _hoop(baseY - 0.46 + 0.184);
  const band2 = _hoop(baseY - 0.46 + 0.717);

  explosiveBarrels.push({
    mesh: bm, meshes: [bm, band1, band2], alive: true,
    pos: new BABYLON.Vector3(px, baseY, pz),
    originalPos: new BABYLON.Vector3(px, baseY, pz),
  });
  return bm;
}

export function createCrate(px, py, pz, sx, sy, sz, mat = matConcrete, opts = {}) {
  const { editable = true, navmesh = true, extraMeta = null } = opts;
  const scene = getScene();
  const m = BABYLON.MeshBuilder.CreateBox('crate', { width: sx, height: sy, depth: sz }, scene);
  m.position.set(px, py, pz);
  m.material = mat;
  m.checkCollisions = true;
  m.isPickable = false;
  _tagMeta(m, 'crate', 'createCrate',
    { px, py, pz, sx, sy, sz, mat: _keyForMat(mat) }, editable, extraMeta);
  if (navmesh) walkableMeshes.push(m);
  return m;
}

// ── Hazard & destructible primitives ────────────────────────────
// Map-agnostic on purpose: DPS-based hazards and hp-based destructible
// walls don't care which map they're placed in, so any map's build
// function (or editor.html, for any map) can use these. Visuals are
// deliberately NOT map-themed like createWall/createSlab are — lava glows
// orange and spikes read dark-red everywhere, because that's a hazard
// language players should be able to recognize on sight regardless of
// which map they're standing in, not a per-map texture choice. hazardType
// ('LAVA' | 'SPIKE') and dps drive hurtPlayer/enemy-damage logic elsewhere;
// nothing about them is jungle-specific even though jungle is currently the
// only map whose default layout happens to use them.
//
// hazardZones/destructibleWalls are declared per-map (each level*.js owns
// its own array — see level.js/levelJungle.js/levelCity.js/levelTerminal.js),
// not centrally here, so these constructors can't push into "the" hazard
// array the way createBarrel pushes into the shared explosiveBarrels — the
// caller is responsible for that. Pass opts.hazardZones / opts.destructibleWalls
// and these will push themselves in for you; omit them (e.g. for a one-off
// hardcoded placement where you're pushing yourself) and they won't.

export function createLava(cx, cz, sx, sz, opts = {}) {
  const { editable = true, navmesh = true, extraMeta = null, hazardZones = null, surfY = 0 } = opts;
  const scene = getScene();
  const mat = new BABYLON.StandardMaterial('jLv', scene);
  mat.emissiveColor = new BABYLON.Color3(.95, .22, .02);
  mat.disableLighting = true;

  const m = BABYLON.MeshBuilder.CreateBox('lava', { width: sx, height: .28, depth: sz }, scene);
  m.position.set(cx, liftY(surfY) - .06, cz);
  m.material = mat;
  m.checkCollisions = true;
  m.isPickable = false;

  _tagMeta(m, 'lava', 'createLava', { cx, cz, sx, sz, surfY }, editable, {
    hazard: true, dps: 10, hazardType: 'LAVA', halfWidth: sx / 2, halfDepth: sz / 2, halfHeight: .55, solid: true,
    ...(extraMeta || {}),
  });

  if (navmesh) walkableMeshes.push(m);
  if (hazardZones) hazardZones.push(m);
  // Mutable: editor can move or scale this hazard.
  return m;
}

export function createDestructibleWall(px, surfY, pz, sx, sh, sz, hp, opts = {}) {
  const { editable = true, navmesh = true, extraMeta = null, mat = null, destructibleWalls = null } = opts;
  const scene = getScene();
  let destMat = mat;
  if (!destMat) {
    destMat = new BABYLON.StandardMaterial('jDest', scene);
    destMat.diffuseColor = new BABYLON.Color3(.15, .10, .06);
    destMat.emissiveColor = new BABYLON.Color3(.08, .03, .01);
  }

  const m = BABYLON.MeshBuilder.CreateBox('destWall', { width: sx, height: sh, depth: sz }, scene);
  m.position.set(px, liftY(surfY) + sh / 2, pz);
  m.material = destMat;
  m.checkCollisions = true;
  m.isPickable = true;

  _tagMeta(m, 'destructible_wall', 'createDestructibleWall', { px, surfY, pz, sx, sh, sz, hp }, editable, {
    destructible: true, hp: hp || 140, maxHp: hp || 140,
    ...(extraMeta || {}),
  });

  if (navmesh) walkableMeshes.push(m);
  if (destructibleWalls) destructibleWalls.push(m);
  return m;
}

export function createSpikeTrap(cx, cz, sx, sz, surfY, opts = {}) {
  const { editable = true, extraMeta = null, hazardZones = null } = opts;
  const scene = getScene();
  const fy = liftY(surfY) - .06;
  const fm = new BABYLON.StandardMaterial('jSF', scene);
  fm.diffuseColor = new BABYLON.Color3(.10, .04, .04);
  fm.emissiveColor = new BABYLON.Color3(.06, .01, .01);

  const f = BABYLON.MeshBuilder.CreateBox('spikeTrap', { width: sx, height: .14, depth: sz }, scene);
  f.position.set(cx, fy, cz);
  f.material = fm;
  f.checkCollisions = false;
  f.isPickable = false;

  _tagMeta(f, 'spike_floor', 'createSpikeTrap', { cx, cz, sx, sz, surfY }, editable, {
    hazard: true, dps: 12, hazardType: 'SPIKE', halfWidth: sx / 2, halfDepth: sz / 2,
    ...(extraMeta || {}),
  });

  // Note: spike traps deliberately don't join walkableMeshes (matches the
  // original — they're a floor decal you walk ONTO, not a solid obstacle).
  if (hazardZones) hazardZones.push(f);
  // Mutable: editor can move or scale this hazard.

  // Visual spikes (child objects, not editable independently — deleting or
  // re-exporting the parent floor is enough; these ride along for free).
  const sm = new BABYLON.StandardMaterial('jSS', scene);
  sm.emissiveColor = new BABYLON.Color3(.75, .12, .04);
  sm.disableLighting = true;
  const cr = Math.max(2, Math.round(sx / 1.2));
  const rw = Math.max(2, Math.round(sz / 1.2));
  for (let r = 0; r < rw; r++) {
    for (let c = 0; c < cr; c++) {
      const ox = (sx / cr) * c - sx / 2 + sx / (cr * 2);
      const oz = (sz / rw) * r - sz / 2 + sz / (rw * 2);
      const sp = BABYLON.MeshBuilder.CreateCylinder('jSp', { diameterTop: 0, diameterBottom: .18, height: .52, tessellation: 5 }, scene);
      sp.position.set(ox, 0.32, oz);
      sp.material = sm;
      sp.isPickable = false;
      sp.parent = f;
    }
  }
  return f;
}

// ── Editable gameplay entities ───────────────────────────────────
// Single editable root meshes, with runtime state reconstructed from JSON.
// Unlike static geometry these NEVER participate in the baked NavMesh.
export function createJumpPad(px, floorY, pz, force = 24, rotY = 0) {
  const scene = getScene(), y = liftY(floorY);
  const mesh = BABYLON.MeshBuilder.CreateCylinder('jumpPad', {diameter:2.2,height:0.1,tessellation:16},scene);
  mesh.position.set(px,y,pz);
  mesh.rotation.y = rotY;
  mesh.material = M.jumpPad || M.ledGreen;
  mesh.checkCollisions = false;
  _tagMeta(mesh,'jump_pad','createJumpPad',{px,floorY,pz,force,rotY},true,null);
  const pad = {pos:mesh.position.clone(),force,thrustX:Math.sin(rotY)*force*0.45,
    thrustZ:Math.cos(rotY)*force*0.45,mesh};
  jumpPads.push(pad);
  return mesh;
}

export function createMovingPlatform(startX,startY,startZ,endX,endY,endZ,
  sx=5,sz=5,speed=0.25,waitTime=1.5,opts={}) {
  const scene=getScene();
  const mesh=BABYLON.MeshBuilder.CreateBox('movingPlatform',{width:sx,height:0.5,depth:sz},scene);
  mesh.position.set(startX,startY,startZ);
  mesh.checkCollisions=true;
  mesh.material=matSteel || matConcrete;
  _tagMeta(mesh,'moving_platform','createMovingPlatform',
    {startX,startY,startZ,endX,endY,endZ,sx,sz,speed,waitTime},true,null);
  const start=mesh.position.clone(),end=new BABYLON.Vector3(endX,endY,endZ);
  mesh._moveData={start,end,speed,t:0,dir:1,waitTime,waitTimer:0,paused:true};
  mesh.setEnabled(!!window.__levelEditorMode);
  opts.movingPlatforms?.push(mesh);
  return mesh;
}

export function createPowerSwitch(px,py,pz,targetPlatformIds=[],opts={}) {
  const scene=getScene();
  const mesh=BABYLON.MeshBuilder.CreateBox('powerSwitch',{width:0.8,height:1.3,depth:0.4},scene);
  mesh.position.set(px,py,pz);
  const mat=new BABYLON.StandardMaterial('switchMat',scene);
  mat.diffuseColor=new BABYLON.Color3(0.13,0.4,0.28);
  mat.emissiveColor=new BABYLON.Color3(0,0.8,0.2);
  mesh.material=mat;
  mesh.checkCollisions=false;
  _tagMeta(mesh,'power_switch','createPowerSwitch',
    {px,py,pz,targetPlatformIds},true,{interactive:true,activated:false,targetPlatforms:[]});
  const ring=BABYLON.MeshBuilder.CreateTorus('switchRing',{diameter:0.75,thickness:0.1},scene);
  ring.parent=mesh;
  ring.position.set(0,0,0.28);
  ring.isPickable=false;
  ring.checkCollisions=false;
  ring.material=M.ledGreen || mat;
  mesh.metadata.ring=ring;
  opts.powerSwitches?.push(mesh);
  return mesh;
}

// City-style moving cable car: the car and its static guide cable are one
// serialized gameplay entity. Keep the cable as an auxiliary mesh rather
// than a child of the car, or it would travel along the route.
export function createZipline(name, startX, startY, startZ, endX, endY, endZ,
  worldSpeed = 11.5, width = 4, depth = 4, opts = {}) {
  const scene=getScene();
  const start=new BABYLON.Vector3(startX,startY,startZ);
  const end=new BABYLON.Vector3(endX,endY,endZ);
  const distance=BABYLON.Vector3.Distance(start,end);
  if(distance<=0.01)throw Error('Zipline start/end cannot coincide');
  const H=0.3;
  const car=BABYLON.MeshBuilder.CreateBox(name||'zipline',
    {width,height:H,depth},scene);
  car.position.set(startX,startY-H/2,startZ);
  const mat=new BABYLON.StandardMaterial('ziplineMat',scene);
  mat.diffuseColor=new BABYLON.Color3(0.22,0.52,0.92);
  mat.emissiveColor=new BABYLON.Color3(0.04,0.12,0.28);
  car.material=mat;
  car.checkCollisions=true;
  _tagMeta(car,'zipline','createZipline',
    {name,startX,startY,startZ,endX,endY,endZ,worldSpeed,width,depth},true,null);
  car._moveData={
    start:start.clone(),end:end.clone(),speed:worldSpeed/distance,
    t:0,dir:1,waitTimer:0,waitTime:1.5,paused:false,
  };
  const cable=BABYLON.MeshBuilder.CreateCylinder('ziplineCable',
    {diameter:0.07,height:distance,tessellation:5},scene);
  cable.position.copyFrom(BABYLON.Vector3.Lerp(start,end,0.5));
  const axis=end.subtract(start).normalize();
  const dot=BABYLON.Vector3.Dot(axis,BABYLON.Axis.Y);
  if(Math.abs(dot)<0.999){
    const rot=BABYLON.Vector3.Cross(BABYLON.Axis.Y,axis);
    cable.rotationQuaternion=BABYLON.Quaternion.RotationAxis(rot.normalize(),Math.acos(dot));
  }
  const cableMat=new BABYLON.StandardMaterial('ziplineCableMat',scene);
  cableMat.diffuseColor=new BABYLON.Color3(0.24,0.28,0.35);
  cableMat.emissiveColor=new BABYLON.Color3(0.03,0.05,0.08);
  cable.material=cableMat;
  cable.isPickable=false;
  cable.checkCollisions=false;
  car.metadata.auxiliaryMeshes=[cable];
  opts.movingPlatforms?.push(car);
  // Retain the original City NavMesh contribution until dynamic-platform
  // links are fully modeled in the navigation graph.
  walkableMeshes.push(car);
  return car;
}

// City rooftop lift, matching the original 20x20-building shaft layout.
// The car is the editable entity; rails follow it, poles remain stationary.
export function createRooftopLift(cx, cz, topSurfY, face, faceOffset=0, opts={}) {
  const scene=getScene();
  const halfFootprint=10, stand=2, carWidth=3.6, half=carWidth/2;
  const alongX=face==='N'||face==='S';
  const wall=alongX?cz+(face==='N'?-halfFootprint:halfFootprint):
    cx+(face==='E'?halfFootprint:-halfFootprint);
  const sign=(face==='N'||face==='W')?-1:1;
  const anchor=(alongX?cx:cz)+faceOffset;
  const out=wall+sign*stand;
  const shaftX=alongX?anchor:out,shaftZ=alongX?out:anchor;
  const auxiliary=[];
  const poleHeight=topSurfY+1.2;
  for(const [dx,dz] of [[-half,-half],[half,-half],[-half,half],[half,half]]){
    const pole=BABYLON.MeshBuilder.CreateCylinder('liftPole',
      {diameter:0.16,height:poleHeight},scene);
    pole.position.set(shaftX+dx,poleHeight/2,shaftZ+dz);
    pole.material=matSteel;
    pole.isPickable=false;
    auxiliary.push(pole);
  }
  const H=0.3;
  const car=BABYLON.MeshBuilder.CreateBox('liftPlat',
    {width:carWidth,height:H,depth:carWidth},scene);
  car.position.set(shaftX,-H/2,shaftZ);
  car.material=matSteel;
  car.checkCollisions=true;
  _tagMeta(car,'rooftop_lift','createRooftopLift',
    {cx,cz,topSurfY,face,faceOffset},true,null);
  for(const side of [-1,1]){
    const rail=BABYLON.MeshBuilder.CreateBox('liftRail',{
      width:alongX?carWidth:0.15,height:1,depth:alongX?0.15:carWidth},scene);
    rail.parent=car;
    rail.position.set(alongX?0:side*half,0.5+H/2,alongX?side*half:0);
    rail.material=matSteel;
    rail.isPickable=false;
  }
  car._moveData={
    start:new BABYLON.Vector3(shaftX,-H/2,shaftZ),
    end:new BABYLON.Vector3(shaftX,topSurfY-H/2,shaftZ),
    speed:5/topSurfY,t:0,dir:1,waitTimer:0,waitTime:2,paused:false,
  };
  car.metadata.auxiliaryMeshes=auxiliary;
  opts.movingPlatforms?.push(car);
  walkableMeshes.push(car);
  return car;
}

// ── JSON layout pipeline ─────────────────────────────────────────
// This is the single source of truth for turning a JSON "objects" array
// (the exact shape editor.html's "Export JSON" produces) back into real
// meshes. Both editor.html's "Import JSON" button AND every map's live
// buildXLevel() route through this — so there's exactly one place that
// knows how to read a generator name + params back into geometry.
//
// File location convention: the live game fetches its per-map override
// from `assets/maps/<mapId>.json` (e.g. assets/maps/jungle.json). Design
// the layout in editor.html, "Export JSON", drop the file at that path —
// the next time that map loads, buildXLevel() picks it up automatically.
// No file at that path (or a fetch/parse failure) silently falls back to
// the map's hardcoded default layout, so shipping without any JSON files
// at all is always safe.

function _matForParams(p) {
  return p?.mat ? resolveMaterial(p.mat) : undefined; // undefined lets each createX's own default kick in
}

const _generators = {
  createSlab:    p => createSlab(p.px, p.surfY, p.pz, p.sx, p.sz, _matForParams(p), { lift: p.lift, thickness: p.thickness }),
  createWall:    p => createWall(p.px, p.py, p.pz, p.sx, p.sy, p.sz, _matForParams(p)),
  createPillar:  p => createPillar(p.px, p.pz, p.baseY, p.height, p.diameter, _matForParams(p)),
  createColumn:  p => createColumn(p.px, p.py, p.pz, p.height, p.size, _matForParams(p)),
  createGlass:   p => createGlass(p.px, p.py, p.pz, p.sx, p.sy, p.sz, _matForParams(p), { collides: p.collides }),
  createRampBox: p => createRampBox(p.px, p.py, p.pz, p.sx, p.sy, p.sz, p.rotX, p.rotZ, _matForParams(p)),
  createRamp:    p => createRamp(p.cx, p.cz, p.dir, p.width, p.fromY, p.toY, p.length, _matForParams(p)),
  createCeiling: p => createCeiling(p.px, p.y, p.pz, p.sx, p.sz, _matForParams(p), { collides: p.collides }),
  createBarrel:  p => createBarrel(p.px, p.pz, p.yOff),
  createCrate:   p => createCrate(p.px, p.py, p.pz, p.sx, p.sy, p.sz, _matForParams(p)),
  // Hazard / destructible primitives — see the "Hazard & destructible
  // primitives" section above for why these take no per-map material.
  // hazardTargets/destructibleTargets are threaded in from applyEditableLayout
  // below, not part of the exported params themselves.
  createLava:             (p, t) => createLava(p.cx, p.cz, p.sx, p.sz, { hazardZones: t?.hazardZones, surfY: p.surfY ?? 0 }),
  createDestructibleWall: (p, t) => createDestructibleWall(p.px, p.surfY, p.pz, p.sx, p.sh, p.sz, p.hp, { destructibleWalls: t?.destructibleWalls }),
  createSpikeTrap:        (p, t) => createSpikeTrap(p.cx, p.cz, p.sx, p.sz, p.surfY, { hazardZones: t?.hazardZones }),
  createJumpPad:          p => createJumpPad(p.px,p.floorY,p.pz,p.force,p.rotY),
  createMovingPlatform:   (p,t) => createMovingPlatform(p.startX,p.startY,p.startZ,p.endX,p.endY,p.endZ,
                                   p.sx,p.sz,p.speed,p.waitTime,{movingPlatforms:t?.movingPlatforms}),
  createPowerSwitch:      (p,t) => createPowerSwitch(p.px,p.py,p.pz,p.targetPlatformIds||[],
                                   {powerSwitches:t?.powerSwitches}),
  createStaircase:        p => createStaircase(p.px,p.py,p.pz,p.width,p.depth,p.steps,
                                  p.dirX,p.dirZ,p.stepHeight??0.5,!!p.flareEnds,_matForParams(p)),
  createZipline:          (p,t) => createZipline(p.name,p.startX,p.startY,p.startZ,
                              p.endX,p.endY,p.endZ,p.worldSpeed,p.width,p.depth,
                              {movingPlatforms:t?.movingPlatforms}),
  createRooftopLift:      (p,t) => createRooftopLift(p.cx,p.cz,p.topSurfY,p.face,
                              p.faceOffset||0,{movingPlatforms:t?.movingPlatforms}),
};

/** Re-creates one editable prop from its generator name + params. `targets`
 * (optional) is `{ hazardZones, destructibleWalls }` — the CALLING map's own
 * arrays, so a re-created lava/spike/destructible-wall mesh gets pushed into
 * the right place. Only createLava/createDestructibleWall/createSpikeTrap
 * read it; every other generator ignores the second argument. */
export function instantiateFromParams(generator, params = {}, targets = null) {
  const fn = _generators[generator];
  if (!fn) {
    console.warn('[levelHelpers] Unknown generator in layout data:', generator);
    return null;
  }
  return fn(params, targets);
}

/**
 * Removes every currently-editable mesh from the scene (and the shared
 * walkableMeshes/explosiveBarrels bookkeeping arrays) so a fresh layout can
 * be applied. Barrels are multi-mesh (body + 2 hoop bands) but only the
 * body carries `metadata.editable` — this pulls the hoops along with it so
 * clearing/replacing a barrel never leaves orphaned rings floating in the
 * scene. Pass `targets = { hazardZones, destructibleWalls }` (the calling
 * map's own arrays) so any lava/spike/destructible-wall entries get pulled
 * out of those too — otherwise a cleared mesh stays disposed-but-referenced
 * in the map's hazard tracking and things like damage-over-time checks
 * would throw touching a disposed mesh.
 */
export function clearEditableMeshes(targets = null) {
  const scene = getScene();
  const toRemove = new Set();
  scene.meshes.forEach(m => {
    if (!m.metadata?.editable) return;
    toRemove.add(m);
    // Composite entities contain physical child meshes; remove every child
    // from walkableMeshes before Babylon recursively disposes the parent.
    m.getChildMeshes(false).forEach(child=>toRemove.add(child));
    m.metadata?.auxiliaryMeshes?.forEach(mesh=>toRemove.add(mesh));
  });

  for (let i = explosiveBarrels.length - 1; i >= 0; i--) {
    const entry = explosiveBarrels[i];
    if (entry.meshes && entry.meshes.some(m => toRemove.has(m))) {
      entry.meshes.forEach(m => toRemove.add(m));
      explosiveBarrels.splice(i, 1);
    }
  }

  if (targets?.hazardZones) {
    for (let i = targets.hazardZones.length - 1; i >= 0; i--) {
      if (toRemove.has(targets.hazardZones[i])) targets.hazardZones.splice(i, 1);
    }
  }
  for (let i=jumpPads.length-1;i>=0;i--) {
    if (toRemove.has(jumpPads[i].mesh)) jumpPads.splice(i,1);
  }
  if (targets?.movingPlatforms) {
    for (let i=targets.movingPlatforms.length-1;i>=0;i--)
      if (toRemove.has(targets.movingPlatforms[i])) targets.movingPlatforms.splice(i,1);
  }
  if (targets?.powerSwitches) {
    for (let i=targets.powerSwitches.length-1;i>=0;i--)
      if (toRemove.has(targets.powerSwitches[i])) targets.powerSwitches.splice(i,1);
  }
  if (targets?.destructibleWalls) {
    for (let i = targets.destructibleWalls.length - 1; i >= 0; i--) {
      if (toRemove.has(targets.destructibleWalls[i])) targets.destructibleWalls.splice(i, 1);
    }
  }

  for (const m of toRemove) {
    const wi = walkableMeshes.indexOf(m);
    if (wi !== -1) walkableMeshes.splice(wi, 1);
    if (!m.isDisposed()) m.dispose();
  }
}

/**
 * Replaces the entire editable-prop layer with the given `objects` array
 * (the same shape produced by editor.html's exporter: `{generator, params,
 * position, rotation, scaling}` per object). Each object is re-created from
 * its generator+params, then explicitly moved/rotated/scaled to its
 * exported transform — this two-step order matters, since `params` only
 * captures the values at the moment a prop was first placed, while
 * `position/rotation/scaling` capture wherever the editor's gizmos
 * subsequently moved it.
 *
 * `targets` (optional) = `{ hazardZones, destructibleWalls }` — the calling
 * map's own arrays. Threaded through to both clearEditableMeshes (so old
 * hazard entries are pulled out cleanly) and instantiateFromParams (so new
 * lava/spike/destructible-wall objects get pushed back in). This replaces
 * the original's inline "re-bind hazard tracking based on metadata" loop
 * that used to live directly in levelJungle.js — same behavior, now shared.
 */
export function applyEditableLayout(objects, targets = null) {
  clearEditableMeshes(targets);
  const idMeshes = new Map();
  for (const obj of (objects || [])) {
    const mesh = instantiateFromParams(obj.generator, obj.params || {}, targets);
    if (!mesh) continue;
    if (obj.position) mesh.position.set(obj.position.x, obj.position.y, obj.position.z);
    if (obj.rotation) mesh.rotation.set(obj.rotation.x, obj.rotation.y, obj.rotation.z);
    if (obj.scaling)  mesh.scaling.set(obj.scaling.x, obj.scaling.y, obj.scaling.z);
    mesh.computeWorldMatrix(true);
    if (mesh.metadata?.editable) {
      mesh.metadata.editorId = obj.id || mesh.metadata.editorId ||
        ('entity_' + Math.random().toString(36).slice(2));
      idMeshes.set(mesh.metadata.editorId, mesh);
    }
    if (mesh.metadata?.generator === 'createJumpPad') {
      const pad = jumpPads.find(p=>p.mesh===mesh);
      if (pad) {
        pad.pos.copyFrom(mesh.position);
        pad.thrustX = Math.sin(mesh.rotation.y) * pad.force * 0.45;
        pad.thrustZ = Math.cos(mesh.rotation.y) * pad.force * 0.45;
      }
    }
    if (mesh._moveData) {
      const offset = mesh.position.subtract(mesh._moveData.start);
      mesh._moveData.start.addInPlace(offset);
      mesh._moveData.end.addInPlace(offset);
      mesh.metadata?.auxiliaryMeshes?.forEach(aux=>aux.position.addInPlace(offset));
    }
    if (mesh.metadata?.hazard) {
      const p = mesh.metadata.params;
      if (typeof p?.sx === 'number') mesh.metadata.halfWidth = p.sx * Math.abs(mesh.scaling.x) / 2;
      if (typeof p?.sz === 'number') mesh.metadata.halfDepth = p.sz * Math.abs(mesh.scaling.z) / 2;
    }
  }
  // Resolve switch links only after all referenced platform entities exist.
  for (const m of idMeshes.values()) {
    if (m.metadata?.generator !== 'createPowerSwitch') continue;
    const ids = m.metadata.params.targetPlatformIds || [];
    m.metadata.targetPlatforms = ids.map(id=>idMeshes.get(id))
      .filter(p=>p?._moveData);
  }
}

/**
 * Fetches a map's JSON layout override from assets/maps/<mapId>.json.
 * Returns the `objects` array on success, or null if the file is missing,
 * unreachable, or malformed (treated as "no override" — callers should
 * just keep their hardcoded default layout in that case).
 */
export async function loadMapDocument(mapId) {
  // Validation and stable IDs must happen before we alter the scene.
  const path='assets/maps/'+encodeURIComponent(mapId)+'.json';
  let res;
  try{res=await fetch(path,{cache:'no-cache'})}
  catch(e){throw new Error('[map] Failed to fetch '+path+': '+e.message)}
  if(!res.ok)throw new Error('[map] '+path+' returned HTTP '+res.status);
  let data;
  try{data=await res.json()}
  catch(e){throw new Error('[map] Invalid JSON in '+path+': '+e.message)}
  const checked=validateMapDocument(data,{expectedMap:mapId,strictIds:false});
  if(!checked.valid)throw new Error('[map] Invalid '+path+':\\n'+checked.errors.join('\\n'));
  registerMapDocument(mapId,checked.document);
  return checked.document;
}
// Kept for level builders relying on the original array-only interface.
// Full document (including markers and version) is available via
// loadMapDocument() and getLoadedMapDocument().
export async function loadMapOverride(mapId) {
  const document=await loadMapDocument(mapId);
  return document.objects;
}

// ── Structural (non-editable) composite helper ──────────────────
// A flight of individually-collidable steps. Shared by every map that has
// stairs. Kept out of the generic editable-prop system on purpose — it's
// many meshes describing ONE staircase, not a single draggable object, and
// re-importing a lone "step" box from JSON wouldn't reconstruct the flight.
export function buildStaircase(px, py, pz, width, depth, steps, dirX, dirZ, mat = matConcrete, opts = {}) {
  const { stepHeight = 0.5, flareEnds = false, editable = false } = opts;
  const scene = getScene();
  const stepDepth = depth / steps;
  const out = [];
  for (let i = 0; i < steps; i++) {
    const x = px + dirX * i * stepDepth;
    const y = py + i * stepHeight;
    const z = pz + dirZ * i * stepDepth;
    const s = BABYLON.MeshBuilder.CreateBox('step', {
      width:  dirZ ? width : stepDepth + 0.2,
      height: stepHeight,
      depth:  dirX ? width : stepDepth + 0.2,
    }, scene);
    s.position.set(x, y + stepHeight / 2, z);
    s.material = mat;
    s.checkCollisions = true;
    s.isPickable = false;
    if (flareEnds && (i === 0 || i === steps - 1)) {
      s.scaling[dirX ? 'x' : 'z'] = 1.5;
    }
    s.metadata = { editable: false, type: 'stair_step' };
    if (editable && i > 0) {
      // setParent preserves the step's world-space position while making
      // all subsequent gizmo operations affect the whole flight.
      s.setParent(out[0]);
    }
    walkableMeshes.push(s);
    out.push(s);
  }
  return out;
}

// One exportable gameplay entity with a collidable/pickable first step as its
// gizmo anchor and correctly parented descendants for all other steps.
// The original buildStaircase() remains available for legacy callers.
export function createStaircase(px, py, pz, width, depth, steps, dirX, dirZ,
  stepHeight = 0.5, flareEnds = false, mat = matConcrete) {
  const stair = buildStaircase(px,py,pz,width,depth,steps,dirX,dirZ,mat,
    {stepHeight,flareEnds,editable:true});
  const root=stair[0];
  root.name='staircase';
  root.isPickable=true;
  _tagMeta(root,'staircase','createStaircase',
    {px,py,pz,width,depth,steps,dirX,dirZ,stepHeight,flareEnds,mat:
      typeof mat==='string'?mat:'concrete'},true,null);
  // No additional collision is generated by the root: it's step 0.
  return root;
}
