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
export const TIER_6 = TIER_5 + 12;

export const NAVMESH_PARAMS = {
      cs: 0.2,            
      ch: 0.2,            
      walkableSlopeAngle: 60,  // Increased so they can climb the invisible stair ramps
      walkableHeight: 2.5, 
      walkableClimb: 0.6,      // Increased so they don't get stuck on floor seams
      walkableRadius: 0.6,     // Increased to keep their bodies strictly OUT of walls
      maxEdgeLen: 12.,
      maxSimplificationError: 1.3,
      minRegionArea: 4,
      mergeRegionArea: 20,
      maxVertsPerPoly: 6,
      detailSampleDist: 6,
      detailSampleMaxError: 1,
  };

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
  walkableMeshes.push(m); // <--- AI now treats walls as solid obstacles
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

  explosiveBarrels.push({ 
      mesh: bm, 
      meshes: [bm, band1, band2], 
      alive: true, 
      pos: new BABYLON.Vector3(x, baseY, z),
      originalPos: new BABYLON.Vector3(x, baseY, z) // <--- Added this memory
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
    
    applyExplosionImpulse(b.pos, 10, 18);
    
    return b.pos.clone();
  }
  return null;
}

export function resetBarrels() {
  for (const b of explosiveBarrels) {
    b.respawnTimer = 0; // <-- FIX: Prevents instant respawn loop
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
  slab(0, -1.5, 0, 24, 24, M.concrete);
  
  // Floor Slabs (Expanded central square to match longer walls)
  slab(-30, 0,   0, 36, 96, M.concrete); // West
  slab( 30, 0,   0, 36, 96, M.concrete); // East
  slab(  0, 0,  30, 24, 36, M.concrete); // North
  slab(  0, 0, -30, 24, 36, M.concrete); // South

  // T1 Barrels (yOff set to 0 so they sit flush on the floor)
    barrel(-24, 24, 0); barrel(-24, -24, 0); barrel(24, 24, 0); barrel(24, -24, 0);
    barrel(-38, 0, 0); barrel(38, 0, 0);

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

    for (let i = 0; i < steps; i++) {
        // Calculate position
        const x = px + (dirX * i * stepDepth);
        const y = py + (i * stepHeight);
        const z = pz + (dirZ * i * stepDepth);

        // Create the step
        // We make the step slightly deeper than stepDepth so they overlap (no gaps)
        const s = BABYLON.MeshBuilder.CreateBox('step', {
            width: dirZ ? width : stepDepth + 0.2,
            height: stepHeight,
            depth: dirX ? width : stepDepth + 0.2
        }, scene);

        s.position.set(x, y + (stepHeight / 2), z);
        s.material = M.concrete;
        s.checkCollisions = true;
        
        // Extend the top and bottom steps into the floor by 0.5 units 
        // to bridge the NavMesh and Physics gaps perfectly
        if (i === 0 || i === steps - 1) {
            s.scaling[dirX ? 'x' : 'z'] = 1.5; 
        }

        walkableMeshes.push(s);
    }
  }

  // 3. Placing the T1 -> T2 Stairs 
  // North-West 
  //stairs(42, 0, 9.6, 12, 15, 12, 0, 1);
  // South-West 
  //stairs(-42, 0, -9.6, 12, 15, 12, 0, -1);

  // ── T1 to T2 Stairs
  // Depth increased to 11 to embed into the T2 platform
  stairs( 32, 0,  14, 6, 11, 12, 0,  1); // NE Corner
  stairs(-32, 0, -14, 6, 11, 12, 0, -1); // SW Corner

  // T2 Half-Walls for cover 
  //box('half', -30, TIER_2 + 1,  32, 8, 2, 2, rwCache2);
  box('half',  -32, TIER_2 + 1,  25, 12, 2, 2, rwCache2);
  box('half',  -25, TIER_2 + 1,  30, 2, 2, 12, rwCache2); // TESTING WALLS FOR NON-STAIR CASE PLATFORMS

  box('half',  32, TIER_2 + 1,  -25, 12, 2, 2, rwCache2);
  box('half',  25, TIER_2 + 1,  -30, 2, 2, 12, rwCache2); 
  
  // T2 Barrels — moved outward to safe corners away from jump pads
  barrel(-34, 34, TIER_2); barrel(34, 34, TIER_2);
  barrel(-34, -34, TIER_2); barrel(34, -34, TIER_2);

  // Jump pads corners of T2 -> to T3
  makeJumpPad(-28, TIER_2,  28, 22, Math.PI/4);      // NW Corner pointing inward
  makeJumpPad( 28, TIER_2,  28, 22, 7*Math.PI/4);    // NE Corner pointing inward
  makeJumpPad(-28, TIER_2, -28, 22, 3*Math.PI/4);    // SW Corner pointing inward
  makeJumpPad( 28, TIER_2, -28, 22, 5*Math.PI/4);    // SE Corner pointing inward
  
  // ════════════════════════════════════════════════════════════════════════
  //  TIER 3: EXPANDED SNIPER DECKS & SIDE FLANKS (y=12)
  // ════════════════════════════════════════════════════════════════════════
  // Depth reduced to 12 and shifted to ±38 to perfectly touch the catwalks without overlapping
  slab(0, TIER_3,  38, 56, 12, M.concrete); // North Deck
  slab(0, TIER_3, -38, 56, 12, M.concrete); // South Deck
  
  // Side flanks
  slab(-36, TIER_3, 0, 16, 40, M.concrete); // West Flank
  slab( 36, TIER_3, 0, 16, 40, M.concrete); // East Flank

  // ── T3 Guard rails 
  box('half',  0, TIER_3+1, -33, 24, 2, 2, rwCache2); // South deck inner rail
  box('half',  0, TIER_3+1,  33, 24, 2, 2, rwCache2); // North deck inner rail

  // ── T3 Side-slab half-walls (Bordering the T4 stairs at x=±29)
  box('half', -29, TIER_3+1,  12, 2, 2, 16, rwCache2); // West flank N cover
  box('half', -29, TIER_3+1, -12, 2, 2, 16, rwCache2); // West flank S cover
  box('half',  29, TIER_3+1,  12, 2, 2, 16, rwCache2); // East flank N cover
  box('half',  29, TIER_3+1, -12, 2, 2, 16, rwCache2); // East flank S cover

  // ── T3 Perimeter Bot Catwalks (Z-Fighting Fix - 0.2 unit overlap)
  // Width 4.2 centered at ±45.9 perfectly spans the gap with minimal texture clipping
  slab(-45.9, TIER_3, 0, 4.2, 91.8, M.bridge); // West lateral
  slab( 45.9, TIER_3, 0, 4.2, 91.8, M.bridge); // East lateral
  slab(0, TIER_3,  45.9, 87.6, 4.2, M.bridge); // North connector
  slab(0, TIER_3, -45.9, 87.6, 4.2, M.bridge); // South connector

  // ── T3 Barrels
  barrel(-16, 42, TIER_3); barrel(16, 42, TIER_3);
  barrel(-16, -42, TIER_3); barrel(16, -42, TIER_3);
  barrel(-36, 16, TIER_3); barrel(-36, -16, TIER_3); 
  barrel( 36, 16, TIER_3); barrel( 36, -16, TIER_3);

  // ── T3 Jump pads (Point inward)
  makeJumpPad( 0, TIER_3,  38, 22, Math.PI);      
  makeJumpPad( 0, TIER_3, -38, 22, 0);            
  makeJumpPad(-36, TIER_3,  12, 24, Math.PI/2);   
  makeJumpPad(-36, TIER_3, -12, 24, Math.PI/2);   
  makeJumpPad( 36, TIER_3,  12, 24, -Math.PI/2);  
  makeJumpPad( 36, TIER_3, -12, 24, -Math.PI/2);  

  // ── T2 to T3 Flank Stairs 
  // Depth increased to 11 to embed into the T3 flank
  stairs( 40, TIER_2,  30, 6, 11, 12, 0, -1); // NE corner -> climbs South
  stairs(-40, TIER_2, -30, 6, 11, 12, 0,  1); // SW corner -> climbs North

  // ── T3 to T4 Window Stairs
  // We use 18 steps for a smoother climb to the 6-unit height difference
  stairs(-27, TIER_3, 0, 8, 15, 13, 1, 0);  // West 
  stairs( 27, TIER_3, 0, 8, 15, 13, -1, 0); // East

  // ════════════════════════════════════════════════════════════════════════
  //  TIER 4: THE CORRIDOR (y=18)
  // ════════════════════════════════════════════════════════════════════════
  slab(0, TIER_4, 0, 24, 64, M.bridge); // Wider floor
  
  // Outer corridor walls
  wall(-13, TIER_4 + 2.5,  26, 2, 5, 12, rwCache1); // West wall N panel
  wall( 13, TIER_4 + 2.5,  26, 2, 5, 12, rwCache1); // East wall N panel
  
  // NEW: Converted mid-panels into half-walls for expanded visibility/shooting!
  box('half', -13, TIER_4 + 1.25,  12, 2, 2.5, 16, rwCache2); // West mid-N panel
  box('half',  13, TIER_4 + 1.25,  12, 2, 2.5, 16, rwCache2); // East mid-N panel
  box('half', -13, TIER_4 + 1.25, -12, 2, 2.5, 16, rwCache2); // West mid-S panel
  box('half',  13, TIER_4 + 1.25, -12, 2, 2.5, 16, rwCache2); // East mid-S panel
  
  wall(-13, TIER_4 + 2.5, -26, 2, 5, 12, rwCache1); // West wall S panel
  wall( 13, TIER_4 + 2.5, -26, 2, 5, 12, rwCache1); // East wall S panel
  
  // Window sills at z=0 
  //box('win', -13, TIER_4 + 0.5, 0, 2, 1, 8, rwCache2); // West window sill
  //box('win',  13, TIER_4 + 0.5, 0, 2, 1, 8, rwCache2); // East window sill

  // NEW: Small windows for Jump Pad access (on the East/West edges of the T4 North side)
  wall(-11.5, TIER_4 + 1, 12, 1, 2, 1, M.concrete); // Far left window-sill
  wall( 11.5, TIER_4 + 1, 12, 1, 2, 1, M.concrete); // Far right window-sill

  // Interior serpentine half-walls
  box('half', -6, TIER_4 + 1,  20, 6, 2, 2, rwCache2);
  box('half',  6, TIER_4 + 1,  10, 6, 2, 2, rwCache2);
  box('half', -6, TIER_4 + 1,   0, 6, 2, 2, rwCache2); // Aligned with the windows
  box('half',  6, TIER_4 + 1, -10, 6, 2, 2, rwCache2);
  box('half', -6, TIER_4 + 1, -20, 6, 2, 2, rwCache2);
  
  // T4 Barrels
  barrel(-10, 0, TIER_4); barrel(10, 0, TIER_4);

  // Central Jump Pad to T5 (Rotated 180 degrees to face South)
  makeJumpPad(0, TIER_4, 0, 28, Math.PI);

  // ════════════════════════════════════════════════════════════════════════
  //  TIER 5: THE SECRET SUMMIT (y=24)
  // ════════════════════════════════════════════════════════════════════════
  // Floor slabs — Expanded to seamlessly merge into the outer walls and close sky gaps
  slab(0, TIER_5,  19, 28, 26, M.concrete); // North room floor
  slab(0, TIER_5, -19, 28, 26, M.concrete); // South platform
  slab(-10, TIER_5,  0, 10,  12, M.concrete); // West side of hole
  slab( 10, TIER_5,  0, 10,  12, M.concrete); // East side of hole

  // CEILING 
  const topCeil = ceil(0, TIER_6, 0, 48, 84);
  topCeil.checkCollisions = true;

  // ── North Safe Room Walls 
  wall(-12, TIER_5 + 6, 20, 1, 12, 24, rwCache1);  // West Wall
  wall( 12, TIER_5 + 6, 20, 1, 12, 24, rwCache1);  // East Wall
  wall(  0, TIER_5 + 6, 32, 24, 12,  1, rwCache1); // North Wall

  // Interior facing wall (North Room Windows)
  wall(-9.5, TIER_5 + 6, 8, 5, 12, 1, rwCache1);   // Left panel
  wall( 9.5, TIER_5 + 6, 8, 5, 12, 1, rwCache1);   // Right panel
  
  // High half-wall (No lintel needed)
  box('half',   0, TIER_5 + 2.0, 8, 14, 4, 1, rwCache2); 

  // ── South Platform Enclosure Walls 
  wall(-12, TIER_5 + 6, -14, 1, 12, 28, rwCache1); // West Wall
  wall( 12, TIER_5 + 6, -14, 1, 12, 28, rwCache1); // East Wall
  wall(  0, TIER_5 + 6, -28, 24, 12,  1, rwCache1); // South Wall

  const secretGlow = new BABYLON.PointLight('secretGlow', new BABYLON.Vector3(0, TIER_5+3, 20), scene);
  secretGlow.diffuse = new BABYLON.Color3(0, 1, 1); secretGlow.intensity = 2.0; secretGlow.range = 20;

  // Escape Jump Pad inside the secret room (Blasts player South out the window)
  makeJumpPad(0, TIER_5, 28, 22, Math.PI);


  // FORCE update absolute geometry for Recast
  walkableMeshes.forEach(mesh => mesh.computeWorldMatrix(true));
  navPlugin.createNavMesh(walkableMeshes, NAVMESH_PARAMS );
  
  // Optional: Visualise the NavMesh for debugging (Very helpful!)
/*   const navmeshdebug = navPlugin.createDebugNavMesh(scene);
  navmeshdebug.position = new BABYLON.Vector3(0, 0.01, 0);
  navmeshdebug.material = new BABYLON.StandardMaterial("navdebug", scene);
  navmeshdebug.material.diffuseColor = new BABYLON.Color3(0, 1, 0);
  navmeshdebug.material.alpha = 0.5; */
}

export function updateBarrels(dt) {
  for (const b of explosiveBarrels) {
    if (!b.alive) {
      b.respawnTimer = (b.respawnTimer || 0) + dt;
      if (b.respawnTimer >= 45) { // Respawn after 45 seconds
        b.alive = true;
        b.respawnTimer = 0;
        
        // Grab the exact 3D position it was originally spawned at
        b.pos.copyFrom(b.originalPos);

        for (const m of b.meshes) { 
          m.position.x = b.pos.x;
          m.position.y = b.pos.y;
          m.position.z = b.pos.z;
          m.setEnabled(true); 
          m.checkCollisions = true; 
        }
      }
    }
  }
}