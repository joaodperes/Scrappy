// levelJungle.js – uses globals for scene & navPlugin
const BABYLON = window.BABYLON;
import { M } from './textures.js';
import { jumpPads, explosiveBarrels, walkableMeshes } from './level.js';
import {
  setLevelMaterials,
  registerMaterial,
  liftY,
  loadMapOverride,
  applyEditableLayout,
} from './levelHelpers.js';

// ------------------------------------------------------------
// We do NOT import scene.js – we rely on window.__levelScene
// and window.__levelNavPlugin set by the host (main.js or editor)
// ------------------------------------------------------------

export const movingPlatforms   = [];
export const hazardZones       = [];
export const powerSwitches     = [];
export const destructibleWalls = [];
export const spikeTrapZones    = [];
export const mineLights        = [];

export const SURFACE = 0;
export const RUINS_Y = 4.5;
export const M1 = -7.5;
export const M2 = -15;
export const M3 = -30;
export const M4 = -45;
export const M1C = -2.0;

const lY = liftY; // alias kept for readability at call sites below

export const SURFACE_WALK = lY(SURFACE);
export const M1_WALK = lY(M1);
export const M2_WALK = lY(M2);
export const M3_WALK = lY(M3);
export const M4_WALK = lY(M4);

export const NAVMESH_PARAMS = {
  cs:0.2, ch:0.2, walkableSlopeAngle:62, walkableHeight:2.7,
  walkableClimb:1.0, walkableRadius:0.5, maxEdgeLen:10,
  maxSimplificationError:1.3, minRegionArea:3, mergeRegionArea:16,
  maxVertsPerPoly:6, detailSampleDist:6, detailSampleMaxError:1,
};

// ---- Helper to get the current scene ----
function getScene() {
  if (typeof window !== 'undefined' && window.__levelScene) {
    return window.__levelScene;
  }
  throw new Error('No scene provided – set window.__levelScene before building');
}

function getNavPlugin() {
  if (typeof window !== 'undefined' && window.__levelNavPlugin) {
    return window.__levelNavPlugin;
  }
  // Fallback: no-op
  return { createNavMesh: () => {} };
}

// ---- Materials (stored globally per build) ----
let _S, _D, _R, _W;

function _mkMat(id, r, g, b, scene) {
  const mat = new BABYLON.StandardMaterial(id + '_jM', scene);
  const tex = new BABYLON.NoiseProceduralTexture(id + '_jT', 128, scene);
  tex.animationSpeedFactor = 0;
  tex.octaves = 3;
  tex.persistence = 0.5;
  mat.diffuseColor = new BABYLON.Color3(r/255, g/255, b/255);
  mat.diffuseTexture = tex;
  mat.specularColor = new BABYLON.Color3(0.02, 0.02, 0.02);
  mat.maxSimultaneousLights = 6;
  return mat;
}

// ---- Main build function ----
export async function buildJungleLevel(customScene = null) {
  const scene = customScene || getScene();
  const navPlugin = getNavPlugin();

  walkableMeshes.length = 0;
  movingPlatforms.length = 0;
  hazardZones.length = 0;
  powerSwitches.length = 0;
  destructibleWalls.length = 0;
  jumpPads.length = 0;
  explosiveBarrels.length = 0;
  spikeTrapZones.length = 0;
  mineLights.length = 0;

  _S = _mkMat('jSt', 44, 40, 34, scene);
  _D = _mkMat('jDt', 34, 28, 16, scene);
  _R = _mkMat('jRk', 22, 18, 14, scene);
  _W = _mkMat('jWd', 28, 16,  6, scene);

  // Registered so assets/maps/jungle.json's mat keys resolve correctly —
  // every wall/slab/pillar/ramp/lava/spike/destructible-wall placement in
  // this map, including its outer boundary, ground, ruins, and mine, comes
  // from that JSON now (see the fetch+apply near the bottom of this
  // function). Nothing here is a "fallback" duplicating it — this map has
  // been JSON-driven since before this editor-compatible refactor even
  // started; this file's only job is materials, lighting, fog, and NavMesh.
  setLevelMaterials(_S, _D, _R, _W);
  registerMaterial('mossy', _R);
  const bmat = new BABYLON.StandardMaterial('jBnd', scene);
  bmat.diffuseColor = new BABYLON.Color3(0.02, 0.02, 0.03);
  bmat.disableLighting = true;
  registerMaterial('jungleBoundary', bmat);

  // ---- Lighting ----
  const hemi = new BABYLON.HemisphericLight('jHemi', new BABYLON.Vector3(0, 1, 0), scene);
  hemi.intensity = 0.55;
  hemi.diffuse = new BABYLON.Color3(.78, .90, .72);
  hemi.groundColor = new BABYLON.Color3(.22, .28, .18);

  // Mine practical lights are positioned by depth; no fake pickable meshes
  // or permanent daylight fill in chambers. Lantern/NVG remain useful.
  // Kept as lights (not JSON props) so the shared map editor exports only
  // geometry, and changing light fixtures does not alter collider layout.
  const _ml = (x,y,z,power=.85) => {
    const l=new BABYLON.PointLight('jML',new BABYLON.Vector3(x,y,z),scene);
    l.diffuse=new BABYLON.Color3(1,.62,.32);
    l.intensity=power;
    l.range=26;
    mineLights.push(l);
    return l;
  };
  [
    [-35,-4,-35], [35,-4,35], [0,-4,50],
    [-27,-11,24], [28,-11,-24], [0,-11,-2],
    [-29,-24,42], [28,-24,-34], [0,-24,53],
    [-24,-39,-33], [26,-39,41], [0,-39,5],
  ].forEach(([x,y,z])=>_ml(x,y,z));

  scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.01;
  scene.fogColor = new BABYLON.Color3(0.02, 0.02, 0.03);

  // ── JSON layout (assets/maps/jungle.json) ───────────────────
  // The sole source of every wall, slab, pillar, ramp, barrel, lava pool,
  // spike trap, and destructible wall in this map — boundary through mine.
  // Passing { hazardZones, destructibleWalls } here is what makes lava,
  // spike traps, and destructible walls register for damage-over-time /
  // hp-tracking — without it they'd render and collide correctly but never
  // hurt the player or take damage, since those systems read from these
  // arrays, not from scene.meshes directly.
  const override = await loadMapOverride('jungle');
  if (override) applyEditableLayout(override, { hazardZones, destructibleWalls, movingPlatforms, powerSwitches });

  // ---- Build NavMesh (if navPlugin is available) ----
  walkableMeshes.forEach(m => m.computeWorldMatrix(true));
  if (navPlugin && navPlugin.createNavMesh) {
    navPlugin.createNavMesh(walkableMeshes, NAVMESH_PARAMS);
  }
}
