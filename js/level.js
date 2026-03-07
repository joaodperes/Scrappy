  // Extra props for richer map
  barrel(-40, -40);
  barrel(40, 40);
  barrel(0, 40);
  barrel(40, 0);
  prop(-20, 1.2, 20, 2.2, 2.2, 2.2, M.scrap);
  prop(20, 1.2, -20, 2.2, 2.2, 2.2, M.scrap);
  prop(0, 1.5, 30, 3.0, 2.0, 2.0, M.scrap);
  prop(30, 1.5, 0, 3.0, 2.0, 2.0, M.scrap);
  slab(-20, 0, 20, 8, 6, M.concrete);
  slab(20, 0, -20, 8, 6, M.concrete);
  slab(0, 0, 30, 10, 4, M.bridge);
  slab(30, 0, 0, 10, 4, M.bridge);
// level.js  THE SMELTING DISTRICT – Babylon.js port
//
//  Four height strata:
//   y = -1.5  Underground drain channel
//   y =  0    Main street / factory floor
//   y =  3    Mezzanine catwalks & loading-bay shelves
//   y =  7    Command deck / sniper gantry
//
const BABYLON = window.BABYLON;
import { scene } from './scene.js';
import { M, rwCache1, rwCache2 } from './textures.js';

export const ARENA_W = 90, ARENA_D = 90, WALL_H = 8;

// jumpPads and explosiveBarrels remain as plain JS objects; collision is
// handled by Babylon's built-in ellipsoid + checkCollisions on static meshes.
export const jumpPads         = []; // { pos: Vector3, force: number }
export const explosiveBarrels = []; // { mesh, alive, pos }
const FLOAT_LIFT_Y = 0.22;

function _liftFloatingY(y) {
  return y > 0.05 ? y + FLOAT_LIFT_Y : y;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Create a solid box with collision. px/py/pz = centre. */
function box(name, px, py, pz, sx, sy, sz, mat) {
  const m = BABYLON.MeshBuilder.CreateBox(name, { width: sx, height: sy, depth: sz }, scene);
  m.position.set(px, py, pz);
  m.material = mat || rwCache1;
  m.checkCollisions = true;
  m.isPickable = false;
  return m;
}

/** Alias – wall and prop both create solid collision boxes. */
const wall = (px, py, pz, sx, sy, sz, mat) => box('wall', px, py, pz, sx, sy, sz, mat);
const prop = (px, py, pz, sx, sy, sz, mat) => box('prop', px, _liftFloatingY(py), pz, sx, sy, sz, mat);

/** Floor slab – collision enabled, height = 0.8 (thick enough to prevent tunnelling). */
function slab(px, surfY, pz, sx, sz, mat) {
  const H  = 0.8;
  const liftedSurfY = _liftFloatingY(surfY);
  const cy = liftedSurfY - H / 2;
  const m  = BABYLON.MeshBuilder.CreateBox('slab', { width: sx, height: H, depth: sz }, scene);
  m.position.set(px, cy, pz);
  m.material = mat || M.concrete;
  m.checkCollisions = true;
  m.isPickable = false;
  return m;
}

/** Visual-only ceiling panel – no collision. */
function ceil(px, y, pz, sx, sz) {
  const m = BABYLON.MeshBuilder.CreateBox('ceil', { width: sx, height: 0.35, depth: sz }, scene);
  m.position.set(px, y, pz);
  m.material = M.ceiling;
  m.checkCollisions = false;
  m.isPickable = false;
  return m;
}

/** Explosive barrel with collision. */
function barrel(x, z, yOff = 0) {
  const baseY = 0.46 + yOff;
  const bm = BABYLON.MeshBuilder.CreateCylinder('barrel', { diameterTop: 0.96, diameterBottom: 1.0, height: 0.92, tessellation: 10 }, scene);
  bm.position.set(x, baseY, z);
  bm.material = M.barrel;
  bm.checkCollisions = true;
  bm.isPickable = false;
  // Two horizontal black stripes for visual clarity
  const bandTop = BABYLON.MeshBuilder.CreateCylinder('barrelBandTop', { diameter: 0.97, height: 0.07, tessellation: 10 }, scene);
  bandTop.position.set(x, 0.81 + yOff, z); bandTop.material = M.black; bandTop.isPickable = false;
  const bandBottom = BABYLON.MeshBuilder.CreateCylinder('barrelBandBottom', { diameter: 0.97, height: 0.07, tessellation: 10 }, scene);
  bandBottom.position.set(x, 0.11 + yOff, z); bandBottom.material = M.black; bandBottom.isPickable = false;
  explosiveBarrels.push({
    mesh:  bm,
    meshes: [bm, bandTop, bandBottom],
    alive: true,
    pos:   new BABYLON.Vector3(x, baseY, z),
  });
}

export function isBarrelMesh(mesh) {
  for (const b of explosiveBarrels) {
    if (!b.alive) continue;
    if (b.meshes.includes(mesh)) return true;
  }
  return false;
}

export function detonateBarrelByMesh(mesh) {
  for (const b of explosiveBarrels) {
    if (!b.alive) continue;
    if (!b.meshes.includes(mesh)) continue;
    b.alive = false;
    for (const m of b.meshes) { m.setEnabled(false); m.checkCollisions = false; }
    return b.pos.clone();
  }
  return null;
}

export function resetBarrels() {
  for (const b of explosiveBarrels) {
    if (!b.alive) {
      b.alive = true;
      for (const m of b.meshes) { m.setEnabled(true); m.checkCollisions = true; }
    }
  }
}

/** Jump pad – glowing green disc (no collision, trigger by proximity). */
export function makeJumpPad(x, floorY, z, force = 14) {
  const base = BABYLON.MeshBuilder.CreateCylinder('jpBase', { diameter: 1.8, height: 0.12, tessellation: 16 }, scene);
  base.position.set(x, floorY + 0.06, z); base.material = M.jumpPad; base.isPickable = false;
  const arrow = BABYLON.MeshBuilder.CreateCylinder('jpArrow', { diameterTop: 0, diameterBottom: 0.64, height: 0.4, tessellation: 8 }, scene);
  arrow.position.set(x, floorY + 0.55, z); arrow.material = M.jumpPad; arrow.isPickable = false;
  jumpPads.push({ pos: new BABYLON.Vector3(x, floorY, z), force });
}

/** Hazard stripe decal (flat plane on floor). */
function stripe(cx, y, cz, sx, sz) {
  const m = BABYLON.MeshBuilder.CreatePlane('stripe', { width: sx, height: sz }, scene);
  m.rotation.x = Math.PI / 2;
  m.position.set(cx, y, cz);
  m.material = M.yellow;
  m.isPickable = false;
}

// ── LEVEL BUILD ─────────────────────────────────────────────────────────────
export function buildLevel() {

  // ── Background ground plane ──────────────────────────────────────────────
  const gnd = BABYLON.MeshBuilder.CreateGround('ground', { width: 300, height: 300 }, scene);
  gnd.position.y = -0.06;
  gnd.material = M.carpet;
  gnd.checkCollisions = true;
  gnd.isPickable = false;

  // ── Hard outer boundary ──────────────────────────────────────────────────
  const OB = 75;
  wall(   0, 5,  OB, OB*2+2, 10, 0.5, rwCache1);
  wall(   0, 5, -OB, OB*2+2, 10, 0.5, rwCache1);
  wall( OB, 5,   0, 0.5, 10, OB*2+2, rwCache2);
  wall(-OB, 5,   0, 0.5, 10, OB*2+2, rwCache2);

  // ════════════════════════════════════════════════════════════════════════
  //  UNDERGROUND DRAIN CHANNEL   y=-1.5
  // ════════════════════════════════════════════════════════════════════════
  const DR = -1.5;

  slab(-9,  DR, 0,  10, 20, M.concrete);
  slab( 0,  DR, 0,   8, 20, M.concrete);
  slab( 8,  DR, 0,  10, 16, M.concrete);

  wall(-14, DR+2.5, 0, 0.5, 8, 20, rwCache2);
  wall( 14, DR+2.5, 0, 0.5, 8, 16, rwCache2);
  wall(0,   DR+2.5, -12, 28, 8, 0.5, rwCache1);
  wall(0,   DR+2.5,  12, 28, 8, 0.5, rwCache1);

  for (const [px,pz] of [[-8,-5],[-8,5],[8,-5],[8,5]])
    prop(px, DR+1.5, pz, 0.8, 3.0, 0.8, rwCache2);

  makeJumpPad(-10, DR, -9, 13);
  makeJumpPad( 11, DR,  9, 13);

  // ════════════════════════════════════════════════════════════════════════
  //  FACTORY FLOOR   x[-8,8]  z[-8,8]  y=0
  // ════════════════════════════════════════════════════════════════════════
  slab(-7,  0,  4.5, 2, 9,  M.concrete);
  slab(-5,  0, -4.5, 6, 7,  M.concrete);
  slab(-5,  0,  7.0, 6, 2,  M.concrete);
  slab( 5,  0, -4.5, 6, 7,  M.concrete);
  slab( 5,  0,  7.0, 6, 2,  M.concrete);
  slab( 7,  0,  4.5, 2, 9,  M.concrete);

  slab(-2,  1,  0, 3, 3, M.concrete);
  slab( 2,  1, -3, 3, 2, M.concrete);
  slab(-2,  1,  4, 3, 2, M.concrete);

  wall( 5, 2, -6, 0.5, 4, 8, rwCache2);
  wall(-5, 2, -7, 8, 4, 0.5, rwCache1);
  wall(-5, 2,  8, 8, 4, 0.5, rwCache1);
  wall( 6, 2,  1, 0.5, 4, 14, rwCache2);

  wall(-8, 2,  6.5, 0.5, 4, 7, rwCache2);
  wall(-8, 5, -2, 0.5, 2, 12, rwCache2);

  for (const [cx,cz] of [[-3,-6],[3,6],[6,-3],[-6,3]])
    prop(cx, 1.0, cz, 1.0, 2.0, 1.0, rwCache1);

  // ════════════════════════════════════════════════════════════════════════
  //  LOADING BAY   x[-30,-8]  z[-32,8]  y=0
  // ════════════════════════════════════════════════════════════════════════
  slab(-19,  0, -12, 22, 40, M.concrete);

  wall(-19, 4, -32, 22, 8, 0.5, rwCache1);
  wall(-30, 4, -12, 0.5, 8, 40, rwCache2);
  wall(-23, 4,   8, 16, 8, 0.5, rwCache1);
  wall(-13, 6,  -6, 0.5, 4, 20, rwCache2);

  slab(-20, 3, -28.5, 20, 7, M.bridge);
  for (let s = 0; s < 3; s++) slab(-10 - s*1.5, s+1, -29, 3.0, 5.0, M.bridge);

  slab(-27, 3, -8, 6, 24, M.bridge);
  for (let s = 0; s < 3; s++) slab(-24 + s*0.5, s+1, 5, 5.0, 2.0, M.bridge);

  wall(-19, 3.7, -25.5, 20, 1.4, 0.3, rwCache2);
  wall(-27, 3.7,  -3.5, 0.3, 1.4, 21, rwCache2);

  for (const [cx,cz] of [[-14,-25],[-25,-22],[-14,-8],[-25, -5],[-19,-15]])
    prop(cx, 0.6, cz, 1.8, 1.2, 1.8, M.scrap);
  for (const [bx,bz] of [[-16,-28],[-22,-10],[-17,-2],[-26,-18]]) barrel(bx, bz);

  makeJumpPad(-29, 0, -28, 14);

  // ════════════════════════════════════════════════════════════════════════
  //  SNIPER GANTRY   x[-30,-20]  z[-44,-32]  y=7
  // ════════════════════════════════════════════════════════════════════════
  for (let s = 0; s < 4; s++) slab(-25, 3 + (s+1), -32 - s*3, 10, 2.5, M.bridge);

  slab(-25, 7, -44, 10, 12, M.bridge);
  slab(-25, 7, -39, 10,  2, M.bridge);

  wall(-25, 7.8, -50, 10, 1.6, 0.4, rwCache2);
  wall(-20, 7.8, -44, 0.4, 1.6, 12, rwCache2);
  wall(-30, 7.8, -44, 0.4, 1.6, 12, rwCache2);
  wall(-25, 8, -51, 10, 8, 0.5, rwCache1);

  makeJumpPad(-25, 7, -44, 8);

  // ════════════════════════════════════════════════════════════════════════
  //  SMELTER HALL   x[8,28]  z[-4,24]  y=0
  // ════════════════════════════════════════════════════════════════════════
  slab(18,  0,  10, 20, 28, M.concrete);

  wall(18,  4,  -4, 20, 8, 0.5, rwCache1);
  wall(28,  4,  10, 0.5, 8, 28, rwCache2);
  wall(14,  4,  24, 12, 8, 0.5, rwCache1);
  wall(25,  4,  24,  6, 8, 0.5, rwCache1);

  prop(12, 1.5,  4, 3.0, 3.0, 3.0, rwCache1);
  prop(24, 2.0,  4, 3.0, 4.0, 3.0, rwCache1);
  prop(12, 1.0, 18, 2.5, 2.0, 2.5, rwCache1);
  prop(24, 1.5, 18, 2.5, 3.0, 2.5, rwCache1);

  slab(26, 3, 10, 4, 24, M.bridge);
  wall(28, 3.7, 10, 0.4, 1.4, 24, rwCache2);
  for (let s = 0; s < 3; s++) slab(24 + s*0.6, s+1, 21, 4.0, 2.0, M.bridge);

  makeJumpPad(27, 0, 20, 14);

  for (const [bx,bz] of [[16,12],[20,16],[14,6],[26,14]]) barrel(bx, bz);
  stripe(9, 0.01, -2, 2, 8);

  // ════════════════════════════════════════════════════════════════════════
  //  VENT SHAFT RAMP   x[14,22]  z[24,42]  y=0→7
  // ════════════════════════════════════════════════════════════════════════
  for (let s = 0; s < 7; s++) {
    const sy = (s + 1) * 1.0;
    const sz = 24 + s * 2.5;
    slab(18, sy, sz + 1.0, 8, 2.5, M.bridge);
  }
  wall(14, 5.5, 33, 0.5, 11, 18, rwCache2);
  wall(22, 5.5, 33, 0.5, 11, 18, rwCache2);

  // ════════════════════════════════════════════════════════════════════════
  //  COMMAND DECK   x[4,24]  z[38,50]  y=7
  // ════════════════════════════════════════════════════════════════════════
  slab(14, 7, 44, 20, 12, M.bridge);

  wall(14, 9, 50, 20, 4, 0.5, rwCache1);
  wall( 4, 9, 44, 0.5, 4, 12, rwCache2);
  wall(24, 9, 44, 0.5, 4, 12, rwCache2);

  wall(14, 7.8, 38, 20, 1.6, 0.4, rwCache2);
  wall( 4, 8.3, 44, 0.4, 2.6, 12, rwCache2);
  wall(24, 8.3, 44, 0.4, 2.6, 12, rwCache2);

  prop(8,  7.6, 40, 2.0, 1.2, 2.0, M.scrap);
  prop(20, 7.6, 40, 2.0, 1.2, 2.0, M.scrap);
  prop(14, 7.6, 46, 3.0, 0.9, 1.5, M.scrap);

  makeJumpPad(14, 7, 44, 6);

  const vent = BABYLON.MeshBuilder.CreateCylinder('vent', { diameterTop: 0.8, diameterBottom: 1.0, height: 0.6, tessellation: 8 }, scene);
  vent.position.set(14, 7.6, 48);
  const ventMat = new BABYLON.StandardMaterial('ventMat', scene);
  ventMat.emissiveColor = new BABYLON.Color3(1, 0.33, 0);
  vent.material = ventMat;
  vent.isPickable = false;

  // ════════════════════════════════════════════════════════════════════════
  //  CROSS-CONNECTING PASSAGES
  // ════════════════════════════════════════════════════════════════════════
  slab(-11, 0, -8, 6, 8, M.concrete);
  wall(-14, 2, -8,  0.5, 4, 8, rwCache2);
  wall( -8, 2, -8,  0.5, 4, 8, rwCache2);
  wall(-11, 1.0, -12,  6, 2.0, 0.5, rwCache1);

  prop(7, 1.2, -1, 1.5, 2.4, 1.5, rwCache1);
  prop(7, 0.9,  3, 1.5, 1.8, 1.5, rwCache1);
  slab(8,  0,  0, 2, 8, M.concrete);
  slab(9,  0, -3, 4, 2, M.concrete);

  slab(0, 0, 16, 16, 16, M.concrete);
  wall(-8,  3, 16, 0.5, 6, 16, rwCache2);
  wall( 8,  3, 16, 0.5, 6, 16, rwCache2);
  wall( 0,  4, 24, 16, 8, 0.5, rwCache1);

  for (const [cx,cz] of [[-4,12],[4,12],[0,20],[-5,18],[5,18]])
    prop(cx, 0.5, cz, 1.4, 1.0, 1.4, M.scrap);
  for (const [bx,bz] of [[-6,14],[6,14],[0,22]]) barrel(bx, bz);

  slab(0, 1.5, 14, 6, 4, M.concrete);
  wall(0, 0.75, 12, 6, 1.5, 0.5, rwCache2);

  makeJumpPad(-6, 0, 22, 14);

  // ════════════════════════════════════════════════════════════════════════
  //  ATMOSPHERIC DETAILS
  // ════════════════════════════════════════════════════════════════════════
  stripe(-8,  0.01,  0,  0.4, 8);
  stripe( 8,  0.01,  0,  0.4, 8);
  stripe( 0,  0.01,  8,  8, 0.4);
  stripe( 18, 0.01, 24,  8, 0.4);
  stripe(-11, 0.01, -4,  6, 0.4);

    // Unclump center and add more props/platforms
    barrel(-30, -25);
    barrel(-10, -18);
    barrel( 16,  -6);
    barrel( 30,  20);
    barrel( 0, 0);
    barrel( 10, 10);
    // Extra platforms / cover props
    slab(34, 0, -18, 14, 12, M.concrete);
    slab(34, 3, -18, 10, 4, M.bridge);
    slab(34, 1, -25, 6, 4, M.concrete);
    prop(30, 0.8, -20, 2.4, 1.6, 2.4, M.scrap);
    prop(38, 1.0, -16, 2.2, 2.0, 2.2, M.scrap);
    wall(41, 3, -18, 0.5, 6, 12, rwCache2);
    slab(-40, 0, 26, 16, 10, M.concrete);
    slab(-40, 2.5, 26, 8, 4, M.bridge);
    prop(-44, 0.9, 24, 2.2, 1.8, 2.2, M.scrap);
    prop(-36, 1.1, 28, 2.2, 2.2, 2.2, M.scrap);
    wall(-48, 3, 26, 0.5, 6, 10, rwCache2);
    // More props for variety
    prop(0, 0.8, 0, 2.4, 1.6, 2.4, M.scrap);
    prop(10, 1.0, 10, 2.2, 2.0, 2.2, M.scrap);
    prop(-10, 1.1, -10, 2.2, 2.2, 2.2, M.scrap);
    // Secret stash (white glow)
    slab(33.5, 0, -34, 6, 6, M.concrete);
    wall(36.3, 2.2, -34, 0.4, 4.4, 6, rwCache2);
    wall(33.5, 2.2, -36.8, 6, 4.4, 0.4, rwCache1);
    wall(33.5, 2.2, -31.2, 6, 4.4, 0.4, rwCache1);

  slab(-40, 0, 26, 16, 10, M.concrete);
  slab(-40, 2.5, 26, 8, 4, M.bridge);
  prop(-44, 0.9, 24, 2.2, 1.8, 2.2, M.scrap);
  prop(-36, 1.1, 28, 2.2, 2.2, 2.2, M.scrap);
  wall(-48, 3, 26, 0.5, 6, 10, rwCache2);

  // ── Secret stash (white glow) ───────────────────────────────────────────
  slab(33.5, 0, -34, 6, 6, M.concrete);
  wall(36.3, 2.2, -34, 0.4, 4.4, 6, rwCache2);
  wall(33.5, 2.2, -36.8, 6, 4.4, 0.4, rwCache1);
  wall(33.5, 2.2, -31.2, 6, 4.4, 0.4, rwCache1);
  const secretGlow = new BABYLON.PointLight('secretGlow', new BABYLON.Vector3(33.5, 1.2, -34), scene);
  secretGlow.diffuse = new BABYLON.Color3(1, 1, 1);
  secretGlow.intensity = 1.7;
  secretGlow.range = 7;
}
