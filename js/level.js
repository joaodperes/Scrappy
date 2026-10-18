const BABYLON = window.BABYLON;
// Remove import of scene.js – use globals instead
import { M, rwCache1, rwCache2 } from './textures.js';
import { applyExplosionImpulse } from './player.js';
import { TIER_1, TIER_2, TIER_3, TIER_4, TIER_5, TIER_6 } from './constants.js';
import {
  buildStaircase, setLevelMaterials, registerMaterial, liftY,
  loadMapOverride, applyEditableLayout,
} from './levelHelpers.js';

export const ARENA_W = 90, ARENA_D = 90, WALL_H = 8;

export const jumpPads         = [];
export const explosiveBarrels = [];
export const walkableMeshes = [];
// Matches the shape every other map exports (levelJungle.js/levelCity.js/
// levelTerminal.js) — kept here too so scrapyard has the same editable
// surface as the other 3 maps: a level designer can add lava, a spike trap,
// a destructible wall, or a moving platform to ANY map via editor.html, not
// just the ones that happen to already use them. All empty/unused by the
// hardcoded layout below (scrapyard's default content doesn't call for any
// of them), same as levelCity.js/levelTerminal.js today.
export const movingPlatforms   = [];
export const hazardZones       = [];
export const powerSwitches     = [];
export const destructibleWalls = [];
export const spikeTrapZones    = [];

export const NAVMESH_PARAMS = {
  cs: 0.2,
  ch: 0.2,
  walkableSlopeAngle: 60,
  walkableHeight: 2.5,
  walkableClimb: 0.6,
  walkableRadius: 0.6,
  maxEdgeLen: 12.,
  maxSimplificationError: 1.3,
  minRegionArea: 4,
  mergeRegionArea: 20,
  maxVertsPerPoly: 6,
  detailSampleDist: 6,
  detailSampleMaxError: 1,
};

// ---- Get scene and nav plugin from globals ----
function getScene() {
  if (typeof window !== 'undefined' && window.__levelScene) {
    return window.__levelScene;
  }
  throw new Error('No scene provided – set window.__levelScene before building level');
}

function getNavPlugin() {
  if (typeof window !== 'undefined' && window.__levelNavPlugin) {
    return window.__levelNavPlugin;
  }
  // Fallback: no-op
  return { createNavMesh: () => {} };
}

// ── Structural (non-editable) composite helper ──────────────────────────────
// Scrapyard's walls/slabs/pillars/barrels now come exclusively from
// scrapyard.json (via loadMapOverride + applyEditableLayout in buildLevel()
// below) — this file only keeps the pieces that were never part of that
// editable-object system to begin with: staircases (many individually-
// collidable steps forming one composite, not a single draggable object —
// see buildStaircase's doc comment in levelHelpers.js) and jump pads (raw
// gameplay data, not a tagged mesh — see makeJumpPad below).
function stairs(px, py, pz, width, depth, steps, dirX, dirZ) {
  return buildStaircase(px, py, pz, width, depth, steps, dirX, dirZ, M.concrete, { flareEnds: true });
}

// ── Barrel helpers (shared singleton arrays — used by every map) ───────────
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
    b.respawnTimer = 0;
    if (!b.alive) {
      b.alive = true;
      for (const m of b.meshes) { m.setEnabled(true); m.checkCollisions = true; }
    }
  }
}

export function makeJumpPad(x, floorY, z, force = 26, rotY = 0) {
  const scene = getScene();
  const y = liftY(floorY);
  const padGroup = new BABYLON.TransformNode('jpGroup', scene);
  padGroup.position.set(x, y, z);
  padGroup.rotation.y = rotY;

  const base = BABYLON.MeshBuilder.CreateCylinder('jpBase', { diameter: 2.2, height: 0.1, tessellation: 16 }, scene);
  base.position.set(0, 0.05, 0);
  base.material = M.jumpPad || M.ledGreen;
  base.parent = padGroup;
  base.isPickable = false;
  base.checkCollisions = false;

  const thrustX = Math.sin(rotY) * (force * 0.45);
  const thrustZ = Math.cos(rotY) * (force * 0.45);

  jumpPads.push({ pos: new BABYLON.Vector3(x, y, z), force, thrustX, thrustZ });
}

export async function buildLevel(customScene = null) {
  const scene = customScene || getScene();
  const navPlugin = getNavPlugin();

  // Reset shared state — matches every other map's build function, so
  // re-entering Scrapyard after visiting another map starts clean instead
  // of inheriting stale barrels/jump pads/walkable meshes.
  walkableMeshes.length = 0;
  jumpPads.length = 0;
  explosiveBarrels.length = 0;
  movingPlatforms.length = 0;
  hazardZones.length = 0;
  powerSwitches.length = 0;
  destructibleWalls.length = 0;
  spikeTrapZones.length = 0;

  // Register Scrapyard's palette so createSlab/createWall/etc. defaults and
  // JSON-exported mat keys resolve correctly.
  setLevelMaterials(M.concrete, rwCache1, M.concrete, M.concrete);
  registerMaterial('rust2', rwCache2);
  registerMaterial('rustwall', M.rustWall);
  registerMaterial('bridge', M.bridge);
  registerMaterial('ceiling', M.ceiling);

  const gnd = BABYLON.MeshBuilder.CreateGround('ground', { width: 150, height: 150 }, scene);
  gnd.position.y = -0.06; gnd.material = M.carpet; gnd.checkCollisions = true; gnd.isPickable = false;

  // ── Structural staircases ───────────────────────────────────
  // Non-editable composites (many individually-collidable steps, not a
  // single draggable object — see buildStaircase's doc comment in
  // levelHelpers.js), so these stay as code rather than JSON data.
  stairs( 32, 0,  14, 6, 11, 12, 0,  1);
  stairs(-32, 0, -14, 6, 11, 12, 0, -1);
  stairs( 40, TIER_2,  30, 6, 11, 12, 0, -1);
  stairs(-40, TIER_2, -30, 6, 11, 12, 0,  1);
  stairs(-27, TIER_3, 0, 8, 15, 13, 1, 0);
  stairs( 27, TIER_3, 0, 8, 15, 13, -1, 0);

  // ── Jump pads ────────────────────────────────────────────────
  // Not part of the editable/JSON object system — makeJumpPad() pushes raw
  // gameplay data (position/force/thrust) into the shared jumpPads array,
  // not a tagged mesh, so there's nothing for editor.html/JSON to capture.
  // These stay hardcoded, same as every other map's jump pads.
  makeJumpPad(-28, TIER_2,  28, 22, Math.PI/4);
  makeJumpPad( 28, TIER_2,  28, 22, 7*Math.PI/4);
  makeJumpPad(-28, TIER_2, -28, 22, 3*Math.PI/4);
  makeJumpPad( 28, TIER_2, -28, 22, 5*Math.PI/4);
  makeJumpPad( 0, TIER_3,  38, 22, Math.PI);
  makeJumpPad( 0, TIER_3, -38, 22, 0);
  makeJumpPad(-36, TIER_3,  12, 24, Math.PI/2);
  makeJumpPad(-36, TIER_3, -12, 24, Math.PI/2);
  makeJumpPad( 36, TIER_3,  12, 24, -Math.PI/2);
  makeJumpPad( 36, TIER_3, -12, 24, -Math.PI/2);
  makeJumpPad(0, TIER_4, 0, 28, Math.PI);
  makeJumpPad(0, TIER_5, 28, 22, Math.PI);

  // Ambient light near the secret summit — cosmetic, not an editable object.
  const secretGlow = new BABYLON.PointLight('secretGlow', new BABYLON.Vector3(0, TIER_5+3, 20), scene);
  secretGlow.diffuse = new BABYLON.Color3(0, 1, 1); secretGlow.intensity = 2.0; secretGlow.range = 20;

  // ── JSON layout (assets/maps/scrapyard.json) ────────────────
  // The sole source of every wall, slab, pillar, barrel, and the summit
  // ceiling — matches jungle's pattern (levelJungle.js). Design in
  // editor.html, "Export JSON", drop the file at that path. Nothing here
  // falls back to hardcoded geometry if it's missing, same tradeoff jungle
  // already made: one source of truth, no chance of hardcoded/JSON content
  // silently drifting apart, at the cost of an empty floor plan if the
  // fetch ever fails.
  const override = await loadMapOverride('scrapyard');
  if (override) applyEditableLayout(override, { hazardZones, destructibleWalls });

  // ── Build NavMesh ──────────────────────────────────────────
  walkableMeshes.forEach(mesh => mesh.computeWorldMatrix(true));
  navPlugin.createNavMesh(walkableMeshes, NAVMESH_PARAMS);
}

export function updateBarrels(dt) {
  for (const b of explosiveBarrels) {
    if (!b.alive) {
      b.respawnTimer = (b.respawnTimer || 0) + dt;
      if (b.respawnTimer >= 45) {
        b.alive = true;
        b.respawnTimer = 0;
        b.pos.copyFrom(b.originalPos);
        for (const m of b.meshes) {
          if (m === b.mesh) m.position.copyFrom(b.originalPos);
          m.setEnabled(true);
          m.checkCollisions = true;
        }
      }
    }
  }
}
