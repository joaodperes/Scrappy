// levelJungle.js – Temple Ruins jungle level
const BABYLON = window.BABYLON;
import { scene, camera, navPlugin } from './scene.js';
import { M, rwCache1 } from './textures.js';

export const jumpPads = [];
export const explosiveBarrels = [];
export const walkableMeshes = [];
export const movingPlatforms = [];
export const hazardZones = [];
export const powerSwitches = [];
export const destructibleWalls = [];
export const NAVMESH_PARAMS = {   
  cs: 0.2, ch: 0.2, walkableSlopeAngle: 60, walkableHeight: 2.5,
  walkableClimb: 0.6, walkableRadius: 0.6, maxEdgeLen: 12,
  maxSimplificationError: 1.3, minRegionArea: 4, mergeRegionArea: 20,
  maxVertsPerPoly: 6, detailSampleDist: 6, detailSampleMaxError: 1,
};

const FLOAT_LIFT_Y = 0.22;

export const TIER_1 = 0;   // Ground level
export const TIER_2 = 5;   // Temple platforms
export const TIER_3 = 10;  // Canopy bridges
export const TIER_4 = 15;  // Summit altar

function _liftFloatingY(y) {
  return y > 0.05 ? y + FLOAT_LIFT_Y : y;
}

// ── Level building helpers ────────────────────────────────────
function box(name, px, py, pz, sx, sy, sz, mat) {
  const m = BABYLON.MeshBuilder.CreateBox(name, { width: sx, height: sy, depth: sz }, scene);
  m.position.set(px, py, pz);
  m.material = mat;
  m.checkCollisions = true;
  m.isPickable = false;
  walkableMeshes.push(m);
  return m;
}

function slab(px, surfY, pz, sx, sz, mat) {
  const H = 0.8;
  const cy = _liftFloatingY(surfY) - H / 2;
  const m = BABYLON.MeshBuilder.CreateBox('slab', { width: sx, height: H, depth: sz }, scene);
  m.position.set(px, cy, pz);
  m.material = mat;
  m.checkCollisions = true;
  m.isPickable = false;
  walkableMeshes.push(m);
  return m;
}

function destructiblePillar(x, y, z, hp = 100) {
  const m = box('pillar', x, y, z, 1.0, 3.0, 1.0, M.concrete);
  m.metadata = { destructible: true, hp, maxHp: hp };
  m._originalScale = new BABYLON.Vector3(1, 1, 1);
  destructibleWalls.push(m);
  return m;
}

export function movingSlab(name, startPos, endPos, speed, sx, sz) {
  const H = 0.6;
  const m = BABYLON.MeshBuilder.CreateBox(name, { width: sx, height: H, depth: sz }, scene);
  m.position.set(startPos.x, _liftFloatingY(startPos.y) - H/2, startPos.z);
  m.material = M.bridge;
  m.checkCollisions = true;
  m.isPickable = false;
  
  m._moveData = {
    start: startPos.clone(),
    end: endPos.clone(),
    speed,
    axis: endPos.x !== startPos.x ? 'x' : (endPos.y !== startPos.y ? 'y' : 'z'),
    t: 0,
    dir: 1,
    waitTimer: 0,
    waitTime: 1.5,
  };
  
  movingPlatforms.push(m);
  walkableMeshes.push(m);
  return m;
}

function lavaZone(x, y, z, sx, sz) {
  // Procedural lava texture
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  // Paint lava-like pattern (static for now, could animate later)
  ctx.fillStyle = '#ff4000';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(255,${100+Math.random()*100},0,0.6)`;
    ctx.beginPath();
    ctx.arc(Math.random()*128, Math.random()*128, Math.random()*15+5, 0, Math.PI*2);
    ctx.fill();
  }
  const tex = new BABYLON.DynamicTexture('lavaTex', {width:128, height:128}, scene, false);
  tex.getContext().drawImage(canvas, 0, 0);
  tex.uScale = 4;
  tex.vScale = 4;
  tex.update();

  const mat = new BABYLON.StandardMaterial('lavaMat_' + Math.random(), scene);
  mat.diffuseTexture = tex;
  mat.emissiveTexture = tex;
  mat.emissiveColor = new BABYLON.Color3(0.8, 0.3, 0);
  mat.disableLighting = true;

  const m = BABYLON.MeshBuilder.CreateBox('lava', { width: sx, height: 0.2, depth: sz }, scene);
  m.position.set(x, 0.22 - 0.1, z)
  m.material = mat;
  m.checkCollisions = false;
  m.isPickable = false;
  m.metadata = { hazard: true, dps: 15, halfWidth: sx/2, halfDepth: sz/2 };

  const light = new BABYLON.PointLight('lavaLight_' + Math.random(), new BABYLON.Vector3(x, y + 0.3, z), scene);
  light.diffuse = new BABYLON.Color3(1, 0.3, 0);
  light.intensity = 3;
  light.range = 15;

  hazardZones.push(m);
  return m;
}

function powerSwitch(x, y, z, targetPlatforms) {
  const m = BABYLON.MeshBuilder.CreateBox('switch_' + Math.random(), { size: 0.6 }, scene);
  m.position.set(x, _liftFloatingY(y) + 0.5, z);
  
  const mat = new BABYLON.StandardMaterial('switchMat_' + Math.random(), scene);
  mat.emissiveColor = new BABYLON.Color3(0, 0.8, 0.2);
  mat.disableLighting = true;
  m.material = mat;
  m.checkCollisions = false;
  m.isPickable = false;
  m.metadata = { interactive: true, type: 'switch', activated: false, targetPlatforms, switchMesh: m };
  
  // Glow ring
  const ring = BABYLON.MeshBuilder.CreateTorus('switchRing_' + Math.random(), { diameter: 0.8, thickness: 0.05, tessellation: 12 }, scene);
  ring.position.copyFrom(m.position);
  ring.material = M.ledGreen;
  ring.isPickable = false;
  m.metadata.ring = ring;
  
  powerSwitches.push(m);
  return m;
}

// ── Main build function ───────────────────────────────────────
export function buildJungleLevel() {
  walkableMeshes.length = 0;
  movingPlatforms.length = 0;
  hazardZones.length = 0;
  powerSwitches.length = 0;
  destructibleWalls.length = 0;

  // Surface heights (slab surface = tier + 0.77)
  const T1 = TIER_1 + 0.77;  // 0.77
  const T2 = TIER_2 + 0.77;  // 5.77
  const T3 = TIER_3 + 0.77;  // 10.77
  const T4 = TIER_4 + 0.77;  // 15.77
  const slabSurface = 0.22; // _liftFloatingY(0) gives 0.22

  // Grass texture
  const grassCanvas = document.createElement('canvas'); grassCanvas.width=128; grassCanvas.height=128;
  const gctx = grassCanvas.getContext('2d');
  gctx.fillStyle = '#2d5a1e'; gctx.fillRect(0,0,128,128);
  for(let i=0;i<200;i++) { gctx.fillStyle=`rgba(${20+Math.random()*30},${80+Math.random()*60},${10+Math.random()*30},0.7)`; gctx.fillRect(Math.random()*128,Math.random()*128,3,6); }
  const grassTex = new BABYLON.DynamicTexture('grassTex', {width:128,height:128}, scene, false);
  grassTex.getContext().drawImage(grassCanvas,0,0); grassTex.update();
  const grassMat = new BABYLON.StandardMaterial('grassMat', scene);
  grassMat.diffuseTexture = grassTex; grassMat.specularColor = new BABYLON.Color3(0.1,0.1,0.1);

  // Stone texture
  const stoneCanvas = document.createElement('canvas'); stoneCanvas.width=128; stoneCanvas.height=128;
  const sctx = stoneCanvas.getContext('2d');
  sctx.fillStyle = '#6b5e4a'; sctx.fillRect(0,0,128,128);
  for(let i=0;i<80;i++) { sctx.fillStyle=`rgba(${40+Math.random()*40},${30+Math.random()*30},${20+Math.random()*20},0.5)`; sctx.fillRect(Math.random()*128,Math.random()*128,8,5); }
  const stoneTex = new BABYLON.DynamicTexture('stoneTex', {width:128,height:128}, scene, false);
  stoneTex.getContext().drawImage(stoneCanvas,0,0); stoneTex.update();
  const stoneMat = new BABYLON.StandardMaterial('stoneMat', scene);
  stoneMat.diffuseTexture = stoneTex; stoneMat.specularColor = new BABYLON.Color3(0.2,0.2,0.2);

  // Ground
  const groundW = 100, groundH = 160; // X width, Z depth
  const ground = BABYLON.MeshBuilder.CreateGround('jungleGround', { width: groundW, height: groundH }, scene);
  // Boundary walls
  const OBx = 50, OBz = 80;
  box('boundN', 0, 25, OBz, OBx*2+2, 50, 2, stoneMat);
  box('boundS', 0, 25, -OBz, OBx*2+2, 50, 2, stoneMat);
  box('boundE', OBx, 25, 0, 2, 50, OBz*2+2, stoneMat);
  box('boundW', -OBx, 25, 0, 2, 50, OBz*2+2, stoneMat);
  ground.position.y = -0.06;
  ground.material = grassMat;
  ground.checkCollisions = true;
  ground.isPickable = false;
  
  // Boundary walls
  const OB = 48;
  box('boundN', 0, 25, OB, OB*2+2, 50, 2, stoneMat);
  box('boundS', 0, 25, -OB, OB*2+2, 50, 2, stoneMat);
  box('boundE', OB, 25, 0, 2, 50, OB*2+2, stoneMat);
  box('boundW', -OB, 25, 0, 2, 50, OB*2+2, stoneMat);
  
  // TIER 1: Ground Level
  slab(0, TIER_1, 0, 60, 60, stoneMat);
  
  // Temple pillars (destructible cover) - positioned at ground level
  destructiblePillar(-20, 1.5, 20, 120);
  destructiblePillar(20, 1.5, 20, 120);
  destructiblePillar(-20, 1.5, -20, 120);
  destructiblePillar(20, 1.5, -20, 120);
  destructiblePillar(0, 1.5, -25, 150);
  destructiblePillar(0, 1.5, 25, 150);
  
  // LAVA RIVER - use T1 for the surface height
  lavaZone(0, slabSurface, -5, 48, 10);
  
  // Moving Platforms - use T1 for platform surface height
  const plat1 = movingSlab('plat1', 
    new BABYLON.Vector3(-16, slabSurface, -5),
    new BABYLON.Vector3(16, slabSurface, -5),
    0.8, 4, 6
  );
  const plat2 = movingSlab('plat2',
    new BABYLON.Vector3(16, slabSurface, 0),
    new BABYLON.Vector3(-16, slabSurface, 0),
    0.6, 4, 6
  );
  plat1.setEnabled(false);
  plat2.setEnabled(false);
  powerSwitch(0, slabSurface, 15, [plat1, plat2]);
  
  // TIER 2: Temple Platforms
  slab(-30, TIER_2, 30, 20, 20, stoneMat);
  slab(30, TIER_2, 30, 20, 20, stoneMat);
  slab(-30, TIER_2, -30, 20, 20, stoneMat);
  slab(30, TIER_2, -30, 20, 20, stoneMat);
  slab(0, TIER_2, -30, 20, 20, stoneMat);
  
  // TIER 3: Canopy Bridges
  slab(0, TIER_3, 35, 40, 8, stoneMat);
  slab(0, TIER_3, -35, 40, 8, stoneMat);
  
  // TIER 4: Summit Altar
  slab(0, TIER_4, 0, 15, 15, stoneMat);

  function stairs(px, py, pz, width, steps, dirX, dirZ) {
    const stepH = 0.5, stepD = 1.2;
    for (let i = 0; i < steps; i++) {
      const m = BABYLON.MeshBuilder.CreateBox('step', {width: dirZ? width : stepD, height: stepH, depth: dirX? width : stepD}, scene);
      m.position.set(px + dirX*i*stepD, py + i*stepH + stepH/2, pz + dirZ*i*stepD);
      m.material = stoneMat;
      m.checkCollisions = true;
      walkableMeshes.push(m);
    }
  }

  // Stairs from ground to T2 platforms
  // NW platform at (-30,6,30): stairs along south edge
  stairs(-30, slabSurface, 20, 4, 10, 0, 1);   // z=20 to 30 north
  // NE platform at (30,6,30): stairs along south edge
  stairs(30, slabSurface, 20, 4, 10, 0, 1);    // z=20 to 30 north
  // SW platform at (-30,6,-30): stairs along north edge? The platform is z=-30, covering z=-40 to -20. Ground at z=-20 to go north up to z=-30. So direction (0,1) starting at (-30, slabSurface, -20)
  stairs(-30, slabSurface, -20, 4, 10, 0, 1);
  // SE platform at (30,6,-30):
  stairs(30, slabSurface, -20, 4, 10, 0, 1);
  // T2 to T3: central platform at (0, T2, -30) with size 20,20, z=-40 to -20. Stairs from ground? Actually T2 to T3 need stairs from T2 slab to T3 bridge. We'll skip for now.
     
  walkableMeshes.forEach(mesh => mesh.computeWorldMatrix(true));
  navPlugin.createNavMesh(walkableMeshes, NAVMESH_PARAMS);
}