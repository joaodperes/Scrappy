// level.js  

const BABYLON = window.BABYLON;
import { scene, camera, navPlugin } from './scene.js';
import { M, rwCache1, rwCache2 } from './textures.js';
import { applyExplosionImpulse } from './player.js';

export const ARENA_W = 90, ARENA_D = 90, WALL_H = 8;

export const jumpPads         = [];
export const explosiveBarrels = [];
// Add an array to track meshes we want the bots to walk on
export const walkableMeshes = [];
const FLOAT_LIFT_Y = 0.22;

export const TIER_1 = 0;
export const TIER_2 = 6;
export const TIER_3 = 12;
export const TIER_4 = 18;
export const TIER_5 = 24;

function _liftFloatingY(y) {
  return y > 0.05 ? y + FLOAT_LIFT_Y : y;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function box(name, px, py, pz, sx, sy, sz, mat) {
  const m = BABYLON.MeshBuilder.CreateBox(name, { width: sx, height: sy, depth: sz }, scene);
  m.position.set(px, py, pz);
  m.material = mat || rwCache1;
  m.checkCollisions = true;
  m.isPickable = false;
  return m;
}

const wall = (px, py, pz, sx, sy, sz, mat) => {
    const m = box('wall', px, py, pz, sx, sy, sz, mat);
    //walkableMeshes.push(m); // causes clipping?
    return m;
};

function slab(px, surfY, pz, sx, sz, mat) {
  const H = 0.8;
  const cy = _liftFloatingY(surfY) - H / 2;
  const m  = BABYLON.MeshBuilder.CreateBox('slab', { width: sx, height: H, depth: sz }, scene);
  m.position.set(px, cy, pz);
  m.material = mat || M.concrete;
  m.checkCollisions = true;
  m.isPickable = false;
  walkableMeshes.push(m);
  return m;
}

function ceil(px, y, pz, sx, sz) {
  const m = BABYLON.MeshBuilder.CreateBox('ceil', { width: sx, height: 0.35, depth: sz }, scene);
  m.position.set(px, y, pz);
  m.material = M.ceiling;
  m.checkCollisions = false;
  m.isPickable = false;
  return m;
}

// ── Barrel ──────────────────────────────────────────────────────────────────
// Real 55-gallon steel drum:
//   • Two prominent rolling chimes ("hoops") near the top and bottom thirds
//   • Chimes protrude clearly from the body and are a lighter silver-grey
//   • Body is very dark maroon (see textures.js)
//
// Barrel height = 0.92, body centre at baseY = 0.46 + yOff
//   hoop 1 (lower)  y = yOff + 0.92 * 0.20 = yOff + 0.184  →  ~20 % up
//   hoop 2 (upper)  y = yOff + 0.92 * 0.78 = yOff + 0.717  →  ~78 % up

// Shared emissive hoop material now lives in M.barrelHoop (textures.js)

function barrel(x, z, yOff = 0) {
  // Apply the lift offset so it perfectly matches the slabs!
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
    h.material = M.barrelHoop || M.grey; // Fallback to grey if missing
    h.isPickable = false;
    return h;
  }
  const band1 = hoop(baseY - 0.46 + 0.184); 
  const band2 = hoop(baseY - 0.46 + 0.717); 

  explosiveBarrels.push({ mesh: bm, meshes: [bm, band1, band2], alive: true, pos: new BABYLON.Vector3(x, baseY, z) });
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
    
    applyExplosionImpulse(b.pos, 10, 18);
    
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

export function makeJumpPad(x, floorY, z, force = 26, rotY = 0) {
  const y = _liftFloatingY(floorY); 
  const padGroup = new BABYLON.TransformNode('jpGroup', scene);
  padGroup.position.set(x, y, z);
  padGroup.rotation.y = rotY; 

  const base = BABYLON.MeshBuilder.CreateCylinder('jpBase', { diameter: 2.2, height: 0.1, tessellation: 16 }, scene);
  base.position.set(0, 0.05, 0); 
  base.material = M.jumpPad || M.ledGreen; 
  base.parent = padGroup;
  base.isPickable = false;
  base.checkCollisions = false;

  // RAMP BOX REMOVED
/*   const ramp = BABYLON.MeshBuilder.CreateBox('jpRamp', { width: 1.5, height: 0.2, depth: 1.5 }, scene);
  ramp.position.set(0, 0.15, 0);
  ramp.rotation.x = Math.PI / 8;
  ramp.material = M.jumpPad || M.ledGreen; // Fixes the "white square" missing texture bug
  ramp.parent = padGroup;
  ramp.isPickable = false;
  base.checkCollisions = false; */
  
  const thrustX = Math.sin(rotY) * (force * 0.45); 
  const thrustZ = Math.cos(rotY) * (force * 0.45); 
  
  jumpPads.push({ pos: new BABYLON.Vector3(x, y, z), force, thrustX, thrustZ });
}

function stripe(cx, y, cz, sx, sz) {
  const m = BABYLON.MeshBuilder.CreatePlane('stripe', { width: sx, height: sz }, scene);
  m.rotation.x = Math.PI / 2;
  m.position.set(cx, y, cz);
  m.material = M.yellow;
  m.isPickable = false;
}

// Helper for smooth walking ramps
function ramp(px, py, pz, sx, sy, sz, angleX, angleZ, mat) {
  const m = BABYLON.MeshBuilder.CreateBox('ramp', { width: sx, height: sy, depth: sz }, scene);
  m.position.set(px, py, pz);
  if (angleX) m.rotation.x = angleX;
  if (angleZ) m.rotation.z = angleZ;
  m.material = mat || M.bridge;
  m.checkCollisions = true; m.isPickable = false;
  return m;
}

export function buildLevel() {
  const gnd = BABYLON.MeshBuilder.CreateGround('ground', { width: 150, height: 150 }, scene);
  gnd.position.y = -0.06; gnd.material = M.carpet; gnd.checkCollisions = true; gnd.isPickable = false;

  // ── MASSIVE Outer Boundary Walls (Height = 50) ─────────
  const OB = 48; // Expanded arena size
  wall(  0, 25,  OB, OB*2+2, 50, 2, rwCache1); // North
  wall(  0, 25, -OB, OB*2+2, 50, 2, rwCache1); // South
  wall( OB, 25,   0, 2, 50, OB*2+2, rwCache2); // East
  wall(-OB, 25,   0, 2, 50, OB*2+2, rwCache2); // West

  // ════════════════════════════════════════════════════════════════════════
  //  TIER 1: MAIN FLOOR (y=0) & THE PIT (y=-1.5)
  // ════════════════════════════════════════════════════════════════════════
  slab(0, -1.5, 0, 16, 16, M.concrete);
  //makeJumpPad(0, -1.5, 0, 20); // Center escape pad
  
  // Floor Slabs
  slab(-30, 0,   0, 36, 96, M.concrete); // West
  slab( 30, 0,   0, 36, 96, M.concrete); // East
  slab(  0, 0,  30, 24, 36, M.concrete); // North
  slab(  0, 0, -30, 24, 36, M.concrete); // South

  // T1 Barrels
  barrel(-24, 24, 0.4); barrel(-24, -24, 0.4); barrel(24, 24, 0.4); barrel(24, -24, 0.4);
  barrel(-38, 0, 0.4); barrel(38, 0, 0.4);

  // Center L-Wall 1 (North-West)
  wall(-12, 2,  5, 2, 4, 17, M.rustWall); // Vertical 
  wall(-2, 2, 13, 20, 4, 2, M.rustWall); // Horizontal

  // Center L-Wall 2 (South-East)
  wall( 12, 2, -5, 2, 4, 17, M.rustWall); 
  wall( 2, 2,-13, 20, 4, 2, M.rustWall);

  // Center I Wall
  wall(0, 2, 0, 2, 4, 18, M.rustWall);

  // ════════════════════════════════════════════════════════════════════════
  //  TIER 2: MEZZANINE (y=6) & RAMPS
  // ════════════════════════════════════════════════════════════════════════
  // Corner platforms
  slab(-36, 6,  36, 24, 24, M.bridge); // NW
  slab( 36, 6,  36, 24, 24, M.bridge); // NE
  slab(-36, 6, -36, 24, 24, M.bridge); // SW
  slab( 36, 6, -36, 24, 24, M.bridge); // SE

  function stairs(px, py, pz, width, depth, steps, dirX, dirZ) {
    const stepDepth = depth / steps;
    const stepHeight = 0.5; 
    
    const rampLength = Math.sqrt(depth * depth + (steps * stepHeight) * (steps * stepHeight));
    const invRamp = BABYLON.MeshBuilder.CreateBox('invRamp', { width: width, height: 10, depth: rampLength + 2.0 }, scene);

    // Calculate center of the ramp
    const cx = px + (dirX * depth / 2) - (dirX * stepDepth / 2);
    const cy = py + ((steps * stepHeight) / 2) - 5.0; 
    const cz = pz + (dirZ * depth / 2) - (dirZ * stepDepth / 2);
    
    invRamp.position.set(cx, cy, cz);
    invRamp.rotation.x = dirZ ? -Math.atan2(steps * stepHeight, depth) * dirZ : 0;
    invRamp.rotation.z = dirX ? Math.atan2(steps * stepHeight, depth) * dirX : 0;
    invRamp.isVisible = false;
    
    // THIS is what stops them sliding up from underneath
    invRamp.checkCollisions = true; 
    walkableMeshes.push(invRamp); 

    // ── THE FIX: The Blocking Wall ──
    // Calculate exactly where the "top/back" of the stairs is
    const backX = px + (dirX * depth);
    const backZ = pz + (dirZ * depth);
    const totalHeight = steps * stepHeight;

    // Place a flat wall flush against the back of the topmost step
    // The width/depth flip depending on whether the stairs go X or Z
    const blockWall = BABYLON.MeshBuilder.CreateBox('stairBlocker', {
        width: dirZ ? width : 0.5,
        height: totalHeight,
        depth: dirX ? width : 0.5
    }, scene);
    
    // Position it at the back edge, starting from the ground up
    blockWall.position.set(backX, py + (totalHeight / 2), backZ);
    blockWall.isVisible = false;       // Hide it
    blockWall.checkCollisions = true;  // Solid collision

    // Create the visual steps (no collisions, purely visual)
    for(let i = 0; i < steps; i++) {
        const x = px + (dirX * i * stepDepth);
        const y = py + (i * stepHeight);
        const z = pz + (dirZ * i * stepDepth);
        const step = BABYLON.MeshBuilder.CreateBox('step', { 
            width: dirZ ? width : stepDepth, 
            height: stepHeight, 
            depth: dirX ? width : stepDepth 
        }, scene);
        step.position.set(x, y, z);
        step.material = M.concrete;
        step.checkCollisions = true; 
    }
  }

  // 3. Placing the Stairs 
  // North-West 
  stairs(42, 0, 9.6, 12, 15, 12, 0, 1);

  // North-East 
  //stairs(18, 0, 24, 12, 14, 14, 1, 0);
  // South-East 
  //stairs(36, 0, -18, 12, 10, 14, 0, 1); 

  // South-West 
  stairs(-42, 0, -9.6, 12, 15, 12, 0, -1);

  // T2 Half-Walls for cover 
  //box('half', -30, TIER_2 + 1,  32, 8, 2, 2, rwCache2);
  box('half',  -32, TIER_2 + 1,  25, 12, 2, 2, rwCache2);
  box('half',  -25, TIER_2 + 1,  30, 2, 2, 12, rwCache2); // TESTING WALLS FOR NON-STAIR CASE PLATFORMS

  box('half',  32, TIER_2 + 1,  -25, 12, 2, 2, rwCache2);
  box('half',  25, TIER_2 + 1,  -30, 2, 2, 12, rwCache2); 
  
  // T2 Barrels hidden behind half-walls
  barrel(-30, 30, TIER_2); barrel(30, 30, TIER_2);
  barrel(-30, -30, TIER_2); barrel(30, -30, TIER_2);

  // Jump pads corners of T2 -> to T3
  makeJumpPad(-28, TIER_2,  28, 22, Math.PI/4);      // NW Corner pointing inward
  makeJumpPad( 28, TIER_2,  28, 22, 7*Math.PI/4);    // NE Corner pointing inward
  makeJumpPad(-28, TIER_2, -28, 22, 3*Math.PI/4);    // SW Corner pointing inward
  makeJumpPad( 28, TIER_2, -28, 22, 5*Math.PI/4);    // SE Corner pointing inward
  
  // ════════════════════════════════════════════════════════════════════════
  //  TIER 3: EXPANDED SNIPER DECKS & SIDE FLANKS (y=12)
  // ════════════════════════════════════════════════════════════════════════
  slab(0, TIER_3,  40, 56, 16, M.concrete); // North Deck
  slab(0, TIER_3, -40, 56, 16, M.concrete); // South Deck
  
  // NEW: Side flanks to increase playable area
  slab(-36, TIER_3, 0, 16, 40, M.concrete); // West Flank
  slab( 36, TIER_3, 0, 16, 40, M.concrete); // East Flank

  box('half',  0, TIER_3+1,  47, 24, 2, 2, rwCache2); // Guard rails
  box('half',  0, TIER_3+1, -47, 24, 2, 2, rwCache2);

  barrel(-16, 42, TIER_3); barrel(16, 42, TIER_3);
  barrel(-16, -42, TIER_3); barrel(16, -42, TIER_3);

  // Jump pads to connect the side flanks to T4
  makeJumpPad(-36, TIER_3, 0, 24, Math.PI/2); // West Flank -> Center T4
  makeJumpPad( 36, TIER_3, 0, 24, Math.PI*1.5); // East Flank -> Center T4

  stairs(-36, TIER_3, 0, 12, 20, 24, 1, 0); // Stairs to T4?

  makeJumpPad(0, TIER_3,  42, 22, Math.PI/2); 
  makeJumpPad(0, TIER_3, -42, 22, Math.PI * 1.5);

  // ════════════════════════════════════════════════════════════════════════
  //  TIER 4: THE CORRIDOR (y=18)
  // ════════════════════════════════════════════════════════════════════════
  slab(0, TIER_4, 0, 24, 64, M.bridge); // Wider floor
  //ceil(0, TIER_4 + 5, 0, 16, 64);       // Enclosed ceiling
  
  // Outer corridor walls (Made THICKER [width: 4] so bots can't shoot through them)
  wall(-10, TIER_4 + 2.5, 0, 4, 5, 64, rwCache1); // West Wall
  wall( 10, TIER_4 + 2.5, 0, 4, 5, 64, rwCache1); // East Wall

  // Alternating half-walls inside the corridor for cover
  box('half', -6, TIER_4 + 1,  15, 6, 2, 2, rwCache2);
  //box('half',  6, TIER_4 + 1,   0, 6, 2, 2, rwCache2);
  box('half', 6, TIER_4 + 1, -15, 6, 2, 2, rwCache2);

  // Central Jump Pad to T5!
  makeJumpPad(0, TIER_4, 0, 32, 0); // Straight up

  // ════════════════════════════════════════════════════════════════════════
  //  TIER 5: THE SECRET SUMMIT (y=24)
  // ════════════════════════════════════════════════════════════════════════
  // Narrowing the T5 hole and fixing ceiling collision
  // Build T5 with a smaller gap (4x4 instead of 8x8)
  slab(0, TIER_5,  22, 24, 24, M.concrete); // North
  slab(0, TIER_5, -22, 24, 20, M.concrete); // South
  slab(-10, TIER_5,  0, 4, 24, M.concrete); // West side of hole
  slab( 10, TIER_5,  0, 4, 24, M.concrete); // East side of hole

  // THE CEILING - MUST HAVE COLLISIONS
  const topCeil = ceil(0, TIER_5 + 8, 0, 40, 80);
  topCeil.checkCollisions = true; 

  // THE EXIT: A simple ramp leading back down to T4
  stairs(-10, TIER_5, -5, 4, 5, 1, 1, 0); // Stairs leading down towards the center hole

  // North Safe Room (Where the pickups are)
  wall(-12, TIER_5 + 3, 20,  1, 6, 24, rwCache1); // West Wall 
  wall( 12, TIER_5 + 3, 20,  1, 6, 24, rwCache1); // East Wall 
  wall(  0, TIER_5 + 3, 32, 24, 6,  1, rwCache1); // North Wall 
  
  // Interior Wall with window
  wall(-8, TIER_5 + 3, 8, 8, 6, 1, rwCache1);
  wall( 8, TIER_5 + 3, 8, 8, 6, 1, rwCache1);
  box('half', 0, TIER_5 + 1.5, 8, 8, 3, 1, rwCache2); // Window sill half wall

  const secretGlow = new BABYLON.PointLight('secretGlow', new BABYLON.Vector3(0, TIER_5+3, 20), scene);
  secretGlow.diffuse = new BABYLON.Color3(0, 1, 1); secretGlow.intensity = 2.0; secretGlow.range = 20;

  /* // ════════════════════════════════════════════════════════════════════════
  //  TIER 3: SNIPER DECKS (y=12)
  // ════════════════════════════════════════════════════════════════════════
  slab(0, 12,  40, 56, 16, M.concrete); // North Deck
  slab(0, 12, -40, 56, 16, M.concrete); // South Deck

  // T3 Half-Walls guarding the edges
  box('half',  0, 13,  33, 24, 2, 2, rwCache2);
  box('half',  0, 13, -33, 24, 2, 2, rwCache2);

  // T3 Barrels
  barrel(-16, 42, 12); barrel(16, 42, 12);
  barrel(-16, -42, 12); barrel(16, -42, 12);

  // Jump pads against the center walls -> to T4
  makeJumpPad(0, TIER_3,  45, 22, Math.PI/2); 
  makeJumpPad(0, TIER_3, -45, 22, Math.PI * 1.5);

  // ════════════════════════════════════════════════════════════════════════
  //  TIER 4: SKY BRIDGE (y=18)
  // ════════════════════════════════════════════════════════════════════════
  slab(0, 18, 0, 12, 64, M.bridge); // Massive bridge crossing the entire arena

  // T4 Half-Walls
  box('half', -5, 19,  16, 2, 2, 8, rwCache2);
  box('half',  5, 19, -16, 2, 2, 8, rwCache2);
  
  barrel(0,  20, 18); barrel(0, -20, 18);

  // Center jump pad -> to T5
  //makeJumpPad(0, 18, 0, 20); - below the actual platform
  makeJumpPad(0, TIER_4, -26, 20, 0);// North edge of bridge -> to T5

  // ════════════════════════════════════════════════════════════════════════
  //  TIER 5: THE SUMMIT (y=24)
  // ════════════════════════════════════════════════════════════════════════
  // Floating high-risk platform at the very top of the map
  slab(0, 24, 0, 16, 16, M.concrete);

  const secretGlow = new BABYLON.PointLight('secretGlow', new BABYLON.Vector3(0, 25, 0), scene);
  secretGlow.diffuse = new BABYLON.Color3(0, 1, 1); secretGlow.intensity = 2.0; secretGlow.range = 20;
   */
  // BAKE THE NAVMESH
  const navmeshParameters = {
      cs: 0.2,            
      ch: 0.2,            
      walkableSlopeAngle: 60,  // Increased so they can climb the invisible stair ramps
      walkableHeight: 2.0, 
      walkableClimb: 1.5,      // Increased so they don't get stuck on floor seams
      walkableRadius: 0.35,     // Increased to keep their bodies strictly OUT of walls
      maxEdgeLen: 12.,
      maxSimplificationError: 1.3,
      minRegionArea: 4,
      mergeRegionArea: 20,
      maxVertsPerPoly: 6,
      detailSampleDist: 6,
      detailSampleMaxError: 1,
  };
  // FORCE update absolute geometry for Recast
  walkableMeshes.forEach(mesh => mesh.computeWorldMatrix(true));
  navPlugin.createNavMesh(walkableMeshes, navmeshParameters);
  
  // Optional: Visualise the NavMesh for debugging (Very helpful!)
/*   const navmeshdebug = navPlugin.createDebugNavMesh(scene);
  navmeshdebug.position = new BABYLON.Vector3(0, 0.01, 0);
  navmeshdebug.material = new BABYLON.StandardMaterial("navdebug", scene);
  navmeshdebug.material.diffuseColor = new BABYLON.Color3(0, 1, 0);
  navmeshdebug.material.alpha = 0.5; */
}

const TIER_1_SPAWNS = [
  [-24, 24], [-24, -24], [24, 24], [24, -24], [-38, 0], [38, 0], [0, 30], [0, -30]
];

export function updateBarrels(dt) {
  for (const b of explosiveBarrels) {
    if (!b.alive) {
      b.respawnTimer = (b.respawnTimer || 0) + dt;
      if (b.respawnTimer >= 45) { // Respawn after 45 seconds
        b.alive = true;
        b.respawnTimer = 0;
        
        const spot = TIER_1_SPAWNS[Math.floor(Math.random() * TIER_1_SPAWNS.length)];
        b.pos.x = spot[0];
        b.pos.z = spot[1];
        b.pos.y = _liftFloatingY(TIER_1) + 0.46; // <--- FIX: Force Y to Tier 1 height!

        for (const m of b.meshes) { 
          m.position.x = b.pos.x;
          m.position.z = b.pos.z;
          m.position.y = b.pos.y;
          m.setEnabled(true); 
          m.checkCollisions = true; 
        }
      }
    }
  }
}