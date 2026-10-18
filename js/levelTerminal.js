// levelTerminal.js – Moon Base map
const BABYLON = window.BABYLON;
import { M } from './textures.js';
import { jumpPads, explosiveBarrels, walkableMeshes } from './level.js';
import {
  setLevelMaterials,
  registerMaterial,
  loadMapOverride,
  applyEditableLayout,
} from './levelHelpers.js';

export const movingPlatforms   = [];
export const hazardZones       = [];
export const powerSwitches     = [];
export const destructibleWalls = [];
export const spikeTrapZones    = [];

export const NAVMESH_PARAMS = {
  cs:0.2, ch:0.2, walkableSlopeAngle:60, walkableHeight:2.5,
  walkableClimb:0.6, walkableRadius:0.6, maxEdgeLen:12,
  maxSimplificationError:1.3, minRegionArea:4, mergeRegionArea:20,
  maxVertsPerPoly:6, detailSampleDist:6, detailSampleMaxError:1,
};

// ---- Scene / nav-plugin access (same dynamic pattern as level.js &
// levelJungle.js — lets editor.html override the scene per-build) ----
let scene, navPlugin;
function getScene() {
  if (typeof window !== 'undefined' && window.__levelScene) return window.__levelScene;
  throw new Error('No scene provided – set window.__levelScene before building level');
}
function getNavPlugin() {
  if (typeof window !== 'undefined' && window.__levelNavPlugin) return window.__levelNavPlugin;
  return { createNavMesh: () => {} };
}

let _floorMat, _wallMat, _glassMat;
let _bndPulseObserver = null;

// ── Build function ────────────────────────────────────────
export async function buildTerminalLevel(customScene = null) {
  scene = customScene || getScene();
  navPlugin = getNavPlugin();

  walkableMeshes.length = 0;
  movingPlatforms.length = 0;
  hazardZones.length = 0;
  powerSwitches.length = 0;
  destructibleWalls.length = 0;
  jumpPads.length = 0;
  explosiveBarrels.length = 0;
  spikeTrapZones.length = 0;

  // clean up the previous build's pulsing-boundary observer before adding a new one
  if (_bndPulseObserver) {
    scene.onBeforeRenderObservable.remove(_bndPulseObserver);
    _bndPulseObserver = null;
  }

  // Materials
  _floorMat = new BABYLON.StandardMaterial('termFloor', scene);
  _floorMat.diffuseTexture = new BABYLON.Texture('assets/textures/lq/conc1_1.png', scene);
  _floorMat.diffuseTexture.uScale = 4;
  _floorMat.diffuseTexture.vScale = 4;

  _wallMat = new BABYLON.StandardMaterial('termWall', scene);
  _wallMat.diffuseTexture = new BABYLON.Texture('assets/textures/lq/met_brn_flat.png', scene);

  _glassMat = new BABYLON.StandardMaterial('termGlass', scene);
  _glassMat.diffuseColor = new BABYLON.Color3(0.6, 0.8, 0.9);
  _glassMat.alpha = 0.25;
  _glassMat.specularColor = new BABYLON.Color3(1, 1, 1);
  _glassMat.specularPower = 64;
  _glassMat.backFaceCulling = false;

  setLevelMaterials(_floorMat, _wallMat, _floorMat, _floorMat, _glassMat);
  registerMaterial('termBridge', M.bridge);
  registerMaterial('gunmetal', M.gunMetal);

   // Base is exactly 120x100. Boundaries perfectly trace this perimeter up to y=150
  const bmat = new BABYLON.StandardMaterial('termBnd', scene);
  registerMaterial('termBoundary', bmat);

  // ── Everything else — the concourse floor, ticket-counter cover, the 4
  // side-room shops, the mezzanine walkways, the 4 stair-connector ramps,
  // and the 4 floating platforms — now comes exclusively from
  // assets/maps/terminal.json (see the JSON layout section below). Design
  // it in editor.html, export, drop it at that path.

  // ── Outer boundaries (Cosmic Void) ────────────────────────────
  // The boundary walls themselves are JSON-driven like everything else, but
  // the material they reference (registered above as 'termBoundary') is
  // styled and animated here — materials are shared-by-reference in
  // Babylon, so mutating bmat's color and pulsing its emissive glow every
  // frame affects every wall using it, regardless of when/how those walls
  // were created.
  bmat.diffuseColor = new BABYLON.Color3(0.01, 0.03, 0.06);
  bmat.emissiveColor = new BABYLON.Color3(0.0, 0.15, 0.30);
  bmat.specularPower = 96;

  const tex = new BABYLON.DynamicTexture("cosmicWallTex", {width: 512, height: 512}, scene, false);
  const ctx = tex.getContext();
  ctx.fillStyle = "rgba(0, 0, 0, 1)"; ctx.fillRect(0,0,512,512);
  ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
  const points = [];
  for(let i=0; i<40; i++) points.push({x: Math.random()*512, y: Math.random()*512});
  for(let i=0; i<points.length; i++) {
      ctx.beginPath(); ctx.arc(points[i].x, points[i].y, Math.random()*3+1, 0, Math.PI*2); ctx.fill();
      if(i>0 && Math.random()>0.3) {
          ctx.beginPath(); ctx.moveTo(points[i].x, points[i].y); ctx.lineTo(points[Math.floor(Math.random()*i)].x, points[Math.floor(Math.random()*i)].y); ctx.stroke();
      }
  }
  tex.update();
  bmat.diffuseTexture = tex; bmat.emissiveTexture = tex;

  _bndPulseObserver = scene.onBeforeRenderObservable.add(() => {
      if (!bmat || bmat.isDisposed || !bmat.emissiveColor) return;
      const t = Date.now() * 0.001;
      const pulse = Math.sin(t * 1.4) * 0.5 + 0.5;
      bmat.emissiveColor.r = 0.0;
      bmat.emissiveColor.g = 0.2 * pulse;
      bmat.emissiveColor.b = 0.4 * pulse + 0.1;
  });

  // ── Basement (optional) ─────────────────────────────────
  // A small area under the concourse, reached by escalators (we'll use stairs)
  // You can add this later.

  // ── Lighting ─────────────────────────────────────────────
  const hemi = new BABYLON.HemisphericLight('termHemi', new BABYLON.Vector3(0,1,0), scene);
  hemi.intensity = 0.8;
  hemi.diffuse = new BABYLON.Color3(0.9, 0.9, 1.0);
  hemi.groundColor = new BABYLON.Color3(0.4, 0.4, 0.5);

  // Some point lights for ambience
  const pl = (x,y,z, col=0xffdd99, intens=1.2, rng=20) => {
    const l = new BABYLON.PointLight('termPL', new BABYLON.Vector3(x,y,z), scene);
    l.diffuse = BABYLON.Color3.FromHexString('#'+col.toString(16).padStart(6,'0'));
    l.intensity = intens;
    l.range = rng;
  };
  pl(0, 4, 0);
  pl(-15, 4, 0);
  pl(15, 4, 0);
  pl(0, 4, -20);
  pl(0, 4, 20);

  // ── JSON layout override (assets/maps/terminal.json — see levelHelpers.js) ──
  const override = await loadMapOverride('terminal');
  if (override) applyEditableLayout(override, { hazardZones, destructibleWalls, movingPlatforms, powerSwitches });

  // ── NavMesh ──────────────────────────────────────────────
  walkableMeshes.forEach(m => m.computeWorldMatrix(true));
  navPlugin.createNavMesh(walkableMeshes, NAVMESH_PARAMS);
}
