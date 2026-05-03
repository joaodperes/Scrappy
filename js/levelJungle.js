// levelJungle.js – Temple Ruins jungle level (REDESIGNED)
const BABYLON = window.BABYLON;
import { scene, camera, navPlugin } from './scene.js';
import { M } from './textures.js';

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

function _liftFloatingY(y) { return y > 0.05 ? y + FLOAT_LIFT_Y : y; }

function box(name, px, py, pz, sx, sy, sz, mat) {
  const m = BABYLON.MeshBuilder.CreateBox(name, { width: sx, height: sy, depth: sz }, scene);
  m.position.set(px, py, pz);
  m.material = mat; m.checkCollisions = true; m.isPickable = false;
  walkableMeshes.push(m); return m;
}

function slab(px, surfY, pz, sx, sz, mat) {
  const H = 0.8;
  const cy = _liftFloatingY(surfY) - H / 2;
  const m = BABYLON.MeshBuilder.CreateBox('slab', { width: sx, height: H, depth: sz }, scene);
  m.position.set(px, cy, pz);
  m.material = mat || M.concrete; m.checkCollisions = true; m.isPickable = false;
  walkableMeshes.push(m); return m;
}

// REDESIGNED TEXTURE: Darker greens with spots of black and brown
function createJungleTexture(baseColor, name) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 256, 256);
  
  for (let i = 0; i < 600; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? '#050a05' : '#1a0f05'; // Black and dark brown spots
    ctx.beginPath();
    ctx.arc(Math.random() * 256, Math.random() * 256, Math.random() * 6 + 1, 0, Math.PI * 2);
    ctx.fill();
  }
  
  const tex = new BABYLON.DynamicTexture(name, { width: 256, height: 256 }, scene, false);
  tex.getContext().drawImage(canvas, 0, 0); tex.update();
  const mat = new BABYLON.StandardMaterial(name + '_mat', scene);
  mat.diffuseTexture = tex; mat.specularColor = new BABYLON.Color3(0.02, 0.02, 0.02);
  return mat;
}

function createStoneTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#222222'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = `rgba(20, 35, 15, ${0.4 + Math.random() * 0.5})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, Math.random() * 15 + 3, Math.random() * 15 + 3);
  }
  const tex = new BABYLON.DynamicTexture('stoneTex', { width: 256, height: 256 }, scene, false);
  tex.getContext().drawImage(canvas, 0, 0); tex.update();
  const mat = new BABYLON.StandardMaterial('stoneMat', scene);
  mat.diffuseTexture = tex; return mat;
}

const jungleDirt = createJungleTexture('#0a140a', 'jungleDirt');
const jungleGrass = createJungleTexture('#0f1f0f', 'jungleGrass');
const stoneRuins = createStoneTexture();

function destructibleWall(x, y, z, sx, sy, sz, hp = 100) {
  const m = box('destWall_' + Math.random(), x, y + sy/2, z, sx, sy, sz, stoneRuins);
  m.metadata = { destructible: true, hp, maxHp: hp };
  destructibleWalls.push(m); return m;
}

function halfWall(x, y, z, sx, sz, rotationY = 0) {
  const H = 1.6;
  const m = BABYLON.MeshBuilder.CreateBox('halfWall', { width: sx, height: H, depth: sz }, scene);
  m.position.set(x, y + H/2, z); m.rotation.y = rotationY; m.material = stoneRuins;
  m.checkCollisions = true; m.isPickable = false; walkableMeshes.push(m); return m;
}

function movingSlab(name, startPos, endPos, speed, sx, sz, waitTime = 1.5) {
  const H = 0.6;
  const m = BABYLON.MeshBuilder.CreateBox(name, { width: sx, height: H, depth: sz }, scene);
  m.position.set(startPos.x, _liftFloatingY(startPos.y) - H/2, startPos.z);
  m.material = stoneRuins;
  m.checkCollisions = true;
  m.isPickable = false;
  m._moveData = {
    start: startPos.clone(),
    end: endPos.clone(),
    speed,
    t: 0,
    dir: 1,
    waitTimer: 0,
    waitTime: waitTime,
    paused: false        // <-- add paused flag
  };
  // Do NOT disable by default – let the switch decide
  // m.setEnabled(false);  // <-- removed this line
  movingPlatforms.push(m);
  walkableMeshes.push(m);
  return m;
}

function lavaZone(x, z, sx, sz, yLevel = 0) {
  const mat = new BABYLON.StandardMaterial('lavaMat', scene);
  mat.emissiveColor = new BABYLON.Color3(0.9, 0.2, 0); mat.disableLighting = true;
  const lavaY = _liftFloatingY(yLevel) - 0.15;
  const m = BABYLON.MeshBuilder.CreateBox('lava', { width: sx, height: 0.3, depth: sz }, scene);
  m.position.set(x, lavaY, z); m.material = mat; m.checkCollisions = false; m.isPickable = false;
  m.metadata = { hazard: true, dps: 5, hazardType: 'LAVA', halfWidth: sx/2, halfDepth: sz/2 };
  hazardZones.push(m); return m;
}

function powerSwitch(x, y, z, targetPlatforms) {
  const m = BABYLON.MeshBuilder.CreateBox('switch', { size: 0.7 }, scene);
  m.position.set(x, _liftFloatingY(y) + 0.6, z);
  const mat = new BABYLON.StandardMaterial('switchMat', scene);
  mat.emissiveColor = new BABYLON.Color3(0, 0.8, 0.2); mat.disableLighting = true;
  m.material = mat; m.checkCollisions = false; m.isPickable = false;
  m.metadata = { interactive: true, type: 'switch', activated: false, targetPlatforms, switchMesh: m };
  const ring = BABYLON.MeshBuilder.CreateTorus('switchRing', { diameter: 0.9, thickness: 0.05, tessellation: 12 }, scene);
  ring.position.copyFrom(m.position); ring.material = M.ledGreen; ring.isPickable = false; m.metadata.ring = ring;
  powerSwitches.push(m); return m;
}

function stairs(startX, startZ, direction, width, targetTier, surfaceY) {
  const stepH = 0.5, stepD = 1.0;
  const targetY = targetTier + 0.77;
  const startY = surfaceY;
  const actualSteps = Math.ceil((targetY - startY) / stepH);
  
  let dx = 0, dz = 0;
  if (direction === 'north') dz = -stepD;
  if (direction === 'south') dz = stepD;
  if (direction === 'east') dx = stepD;
  if (direction === 'west') dx = -stepD;
  
  for (let i = 0; i < actualSteps; i++) {
    const stepY = startY + (i + 0.5) * stepH;
    const step = BABYLON.MeshBuilder.CreateBox('step', { width: width, height: stepH, depth: stepD }, scene);
    step.position.set(startX + dx * i + (dx * stepD/2), stepY, startZ + dz * i + (dz * stepD/2));
    step.material = stoneRuins; step.checkCollisions = true; walkableMeshes.push(step);
  }
}

function pillar(x, z, yBase, h = 3) {
  const p = BABYLON.MeshBuilder.CreateCylinder('pillar', { diameter: 1.2, height: h }, scene);
  p.position.set(x, yBase + h/2, z);
  p.material = stoneRuins;
  p.checkCollisions = true;
  walkableMeshes.push(p);
}

// ── Barrel (explosive) helper (copied/adapted from level.js)
function barrel(x, z, yOff = 0) {
  const baseY = _liftFloatingY(yOff) + 0.46;
  const bm = BABYLON.MeshBuilder.CreateCylinder('barrel', {
    diameterTop: 0.96, diameterBottom: 1.0, height: 0.92, tessellation: 12,
  }, scene);
  bm.position.set(x, baseY, z);
  bm.material = M.barrel;
  bm.checkCollisions = true;
  bm.isPickable = false;

  function hoop(yPos) {
    const h = BABYLON.MeshBuilder.CreateCylinder('bHoop', { diameterTop: 1.22, diameterBottom: 1.24, height: 0.15, tessellation: 12 }, scene);
    h.position.set(x, yPos, z);
    h.material = M.barrelHoop || M.grey;
    h.isPickable = false;
    return h;
  }
  const band1 = hoop(baseY - 0.46 + 0.184);
  const band2 = hoop(baseY - 0.46 + 0.717);

  explosiveBarrels.push({
    mesh: bm,
    meshes: [bm, band1, band2],
    alive: true,
    pos: new BABYLON.Vector3(x, baseY, z),
    originalPos: new BABYLON.Vector3(x, baseY, z),
  });
}

  // Helper for smooth walking ramps
  function ramp(px, py, pz, sx, sy, sz, angleX, angleZ, mat) {
    const m = BABYLON.MeshBuilder.CreateBox('ramp', { width: sx, height: sy, depth: sz }, scene);
    m.position.set(px, py, pz);
    if (angleX) m.rotation.x = angleX;
    if (angleZ) m.rotation.z = angleZ;
    m.material = mat || stoneRuins;
    m.checkCollisions = true; m.isPickable = false;
    walkableMeshes.push(m);
    return m;
  }

export function buildJungleLevel() {
  walkableMeshes.length = 0; movingPlatforms.length = 0; hazardZones.length = 0; powerSwitches.length = 0; destructibleWalls.length = 0; jumpPads.length = 0;

  const T1_SURF = 0.77, T2_SURF = 6.77, T3_SURF = 12.77, T4_SURF = 18.77, T5_SURF = 24.77;
  
  // MAP RESIZING: Longer perpendicularly to the lava river. 
  // River runs along the X axis. The map is much longer on the Z axis.
  const arenaWidth = 80;  // X axis
  const arenaLength = 200; // Z axis

  // Ground Base
  const ground = BABYLON.MeshBuilder.CreateGround('jungleGround', { width: arenaWidth + 20, height: arenaLength + 20 }, scene);
  ground.position.y = -0.1; ground.material = jungleDirt; ground.checkCollisions = true; ground.isPickable = false;

  // LAVA RIVER: Wall to wall across the center (X-axis)
  lavaZone(0, 0, arenaWidth + 20, 16, 0);

  // ASYMMETRICAL T1 GROUND SLABS
  slab(-20, 0, 45, 30, 40, jungleGrass);
  slab(20, 0.2, 50, 25, 30, jungleDirt);
  slab(-15, 0.1, -45, 35, 45, jungleGrass);
  slab(15, 0.3, -55, 30, 25, jungleDirt);

  // BRIDGE ACROSS LAVA (T2 Height)
  slab(0, 6, 0, 8, 20, stoneRuins); // Central crossing
  
  // T2 PLATFORMS (Asymmetrical layout)
  slab(-25, 6, -25, 18, 20, stoneRuins);
  slab(20, 6, -30, 25, 15, stoneRuins);
  slab(0, 6, 25, 20, 18, stoneRuins);
  slab(-20, 6, 35, 15, 20, stoneRuins);

  // T3 PLATFORMS
  slab(-25, 12, -45, 15, 15, stoneRuins);
  slab(25, 12, -45, 15, 15, stoneRuins);
  slab(0, 12, 45, 20, 15, stoneRuins);

  // T4 & T5 PLATFORMS
  slab(-20, 18, 55, 12, 12, stoneRuins);
  slab(0, 24, 65, 16, 16, stoneRuins); // T5 Summit

  // T1 cover
  for (let i = -4; i <= 4; i++) {
    halfWall(i * 8, 0.77, 30, 3, 1.2, Math.PI/2);
    halfWall(i * 8, 0.77, -30, 3, 1.2, Math.PI/2);
  }
  // Stairs T1→T2 (north and south)
  stairs(0, 0.77, 40, 6, 12, 6, 0, -1);   // north stairs
  stairs(0, 0.77, -40, 6, 12, 6, 0, 1);  // south stairs
  // T2→T3 stairs on east/west
  stairs(40, 6.77, 0, 5, 12, 6, -1, 0);
  stairs(-40, 6.77, 0, 5, 12, 6, 1, 0);
  // T3→T4 ramps (rocky incline)
  ramp(30, 12.77, 20, 8, 1.2, 12, 0.3, 0, stoneRuins);
  ramp(-30, 12.77, -20, 8, 1.2, 12, 0.3, 0, stoneRuins);
  // T4→T5 central staircase
  stairs(0, 18.77, 0, 7, 8, 6, 0, 0);  // straight up

  // RANDOM HALF WALLS AND DESTRUCTIBLE WALLS FOR COVER
  halfWall(-25, 6.77, -20, 6, 1);
  halfWall(20, 6.77, -25, 5, 1);
  halfWall(-5, 6.77, 20, 6, 1);
  
  //destructibleWall(0, 12.77, 40, 8, 3, 1.5, 150);
  //destructibleWall(-25, 12.77, -40, 6, 3, 1.5, 150);
  //destructibleWall(0, 24.77, 60, 6, 3, 1.5, 250);

  // Decorative pillars & extra cover
  pillar(-22, 30, 0, 3);
  pillar(22, -30, 0, 3);
  pillar(0, 65, 0, 5); // near the T5 approach

  halfWall(-10, 6.77, 15, 4, 1.2);
  halfWall(12, 6.77, -10, 3.5, 1.2, Math.PI/6);
  halfWall(-18, 12.77, -40, 4, 1.2);

  // Explosive barrels (spread around tiers and cover points)
  // T1 floor barrels
  barrel(-18, 45, 0); barrel(18, 50, 0); barrel(-10, -45, 0); barrel(10, -55, 0);

  // T2 barrels (on mid platforms)
  barrel(-25, -25, T2_SURF); barrel(20, -30, T2_SURF); barrel(0, 25, T2_SURF);

  // T3 barrels (flanks)
  barrel(-25, -45, T3_SURF); barrel(25, -45, T3_SURF); barrel(0, 45, T3_SURF);

  // T5 summit barrel
  barrel(0, 65, T5_SURF);

  // MOVING PLATFORMS
  // 1. Horizontal: Between T3 platforms across the southern side
  const horizPlatform = movingSlab('horizPlatform',
    new BABYLON.Vector3(-25, 12, -35),
    new BABYLON.Vector3(25, 12, -35),
    1.5, 6, 6, 1.5
  );
  
  // 2. Vertical: From lava (T1) up to T5 Summit height
  const vertPlatform = movingSlab('vertPlatform',
    new BABYLON.Vector3(-15, 0.77, 65),
    new BABYLON.Vector3(-15, 24.77, 65),
    1.5, 6, 6, 2.0
  );

  horizPlatform.setEnabled(false);
  vertPlatform.setEnabled(false);

  // POWER SWITCH
  powerSwitch(10, 0, 10, [horizPlatform, vertPlatform]);

  // BOUNDARIES
  const boundMat = new BABYLON.StandardMaterial('boundMat', scene);
  boundMat.alpha = 0; boundMat.disableLighting = true;
  
  function addBound(name, sx, sy, sz, px, pz) {
    const b = BABYLON.MeshBuilder.CreateBox(name, { width: sx, height: sy, depth: sz }, scene);
    b.position.set(px, 20, pz); b.material = boundMat; b.checkCollisions = true; b.isPickable = false;
  }
  // Push boundaries out by 10 units so they sit exactly on the visual edge
  addBound('boundN', arenaWidth + 20, 80, 2, 0, (arenaLength/2) + 10);
  addBound('boundS', arenaWidth + 20, 80, 2, 0, -(arenaLength/2) - 10);
  addBound('boundE', 2, 80, arenaLength + 20, (arenaWidth/2) + 10, 0);
  addBound('boundW', 2, 80, arenaLength + 20, -(arenaWidth/2) - 10, 0);
  // Build the navigation mesh so bots know where to walk
  navPlugin.createNavMesh(walkableMeshes, NAVMESH_PARAMS);
}