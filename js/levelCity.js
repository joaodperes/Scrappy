// levelCity.js - Rooftop City (Expanded)
// -----------------------------------------------------------------
//
//  Map bounds: +-100 units. Street grid is ~200x200.
//
//  Building grid (all 20x20 footprint unless noted):
//
//  RING 1 - inner corners (same as before):
//    A  (-36,-36)  5-floor  Y=20  open
//    B  (+36,-36)  4-floor  Y=16  garden
//    C  (+36,+36)  4-floor  Y=16  open
//    D  (-36,+36)  3-floor  Y=12  garden
//    E  (   0,  0)  2-floor  Y=8   open  (hub)
//
//  RING 2 - wall-adjacent towers (same as before):
//    F  (-60,  0)  3-floor  Y=12  open
//    G  (+60,  0)  3-floor  Y=12  garden
//    H  (  0,-60)  4-floor  Y=16  open
//    I  (  0,+60)  3-floor  Y=12  garden
//
//  RING 3 - new expanded buildings:
//    J  (-80,-80)  5-floor  Y=20  open   (NW far corner)
//    K  (+80,-80)  4-floor  Y=16  garden (NE far corner)
//    L  (+80,+80)  3-floor  Y=12  open   (SE far corner)
//    M  (-80,+80)  4-floor  Y=16  garden (SW far corner)
//    N  (-80,  0)  3-floor  Y=12  open   (west mid)
//    O  (+80,  0)  3-floor  Y=12  garden (east mid)
//    P  (  0,-80)  4-floor  Y=16  open   (north mid)
//    Q  (  0,+80)  3-floor  Y=12  garden (south mid)
//
//  Connectivity:
//    Buildings are hollow shells now (no interior floors/stairs) — ground
//    floor is open for walk-through, but the only way *up* is a vertical
//    lift car bolted to one wall face (see _lift / _building's openings),
//    riding the same moving-platform mechanism as the ziplines below.
//    Ring1 <-> Ring2: 4 bridges (E<->F, E<->G, E<->H, E<->I), rooftop-to-rooftop.
//      E's roof sits lower than all four neighbours, so these run as gentle
//      ramps rather than flat decks.
//    Ring2 <-> Ring3: 4 bridges (F<->N, G<->O, H<->P, I<->Q), rooftop-to-rooftop,
//      flat (each pair shares the same roof height).
//    Ring3 corners <-> mid: relay pads + jump-pad hops (aerial, not walked)
//    Ziplines on ring1 rooftops (A<->B, A<->D, B<->C, C<->D, E<->A)
//    Ziplines on ring3 rooftops (J<->K, J<->M, K<->L, L<->M, J<->P expanded)
//
//  Editor-compatible structure:
//    Every building wall/floor/glass-panel/column, every Jersey barrier and
//    barrel, flows through the shared levelHelpers.js primitives — so the
//    entire static city skyline is selectable/editable/JSON-exportable in
//    editor.html, exactly like Scrapyard, Jungle, and Moon Base.
//    Ziplines, lifts, bridges, and car wrecks are still built with those
//    same primitives (for consistent collision + walkableMeshes handling),
//    but are explicitly tagged non-editable — they carry moving-platform
//    state (_moveData) or parented sub-meshes that a generic JSON re-import
//    can't reconstruct from a single flat prop.
//
//  Performance notes:
//    Babylon.js handles ~500 static meshes easily at 60fps.
//    We use instanced geometry for repeated elements (floor slabs share material).
//    NavMesh bake is one-time at level load - larger map = ~200ms longer bake.
//    Enemy AI raycasts scale with enemy count (capped at ~25), not map size.
//    No runtime per-mesh iteration for rendering (GPU handles it).
//    Conclusion: expanded map has negligible runtime cost.

const BABYLON = window.BABYLON;
import { jumpPads, explosiveBarrels, walkableMeshes } from './level.js';
import { M } from './textures.js';
import {
  setLevelMaterials,
  registerMaterial,
  liftY,
  createWall,
  loadMapOverride,
  applyEditableLayout,
} from './levelHelpers.js';

export const movingPlatforms   = [];
export const hazardZones       = [];
export const powerSwitches     = [];
export const destructibleWalls = [];
export const spikeTrapZones    = [];
const concreteMeshes = [];
const glassMeshes = [];

export const STREET_Y = 0;
export const F1_Y     = 4;
export const F2_Y     = 8;
export const F3_Y     = 12;
export const F4_Y     = 16;
export const F5_Y     = 20;

export const NAVMESH_PARAMS = {
  cs:0.2, ch:0.2, walkableSlopeAngle:55, walkableHeight:2.5,
  walkableClimb:0.6, walkableRadius:0.5, maxEdgeLen:14,
  maxSimplificationError:1.3, minRegionArea:4, mergeRegionArea:20,
  maxVertsPerPoly:6, detailSampleDist:6, detailSampleMaxError:1,
};

export const CITY_WALKABLE_SPAWNS = [
  // Street - inner grid
  [-18,STREET_Y,-10],[18,STREET_Y,-10],[-18,STREET_Y,10],[18,STREET_Y,10],
  [0,STREET_Y,-28],[0,STREET_Y,28],[-28,STREET_Y,0],[28,STREET_Y,0],
  // Street - mid ring
  [-50,STREET_Y,-10],[50,STREET_Y,10],[0,STREET_Y,-50],[0,STREET_Y,50],
  [-50,STREET_Y,10],[50,STREET_Y,-10],
  // Street - outer ring
  [-80,STREET_Y,-30],[80,STREET_Y,30],[-30,STREET_Y,-80],[30,STREET_Y,80],
  [-80,STREET_Y,30],[80,STREET_Y,-30],[-30,STREET_Y,80],[30,STREET_Y,-80],
  // Rooftops - ring1
  [-36,F5_Y+1,-36],[36,F4_Y+1,-36],[36,F4_Y+1,36],[-36,F3_Y+1,36],[0,F2_Y+1,0],
  // Rooftops - ring2
  [-60,F3_Y+1,0],[60,F3_Y+1,0],[0,F4_Y+1,-60],[0,F3_Y+1,60],
  // Rooftops - ring3
  [-80,F5_Y+1,-80],[80,F4_Y+1,-80],[80,F3_Y+1,80],[-80,F4_Y+1,80],
  [-80,F3_Y+1,0],[80,F3_Y+1,0],[0,F4_Y+1,-80],[0,F3_Y+1,80],
];

// Rooftop lift sizing — a flat car riding straight up/down a shaft bolted
// to one wall face, using the same moving-platform mechanism the ziplines
// use (main.js already carries the player along anything in
// `movingPlatforms`). Far simpler and more robust than a switchback stair.
const LIFT_W     = 3.6;                 // car width/depth (square)
const LIFT_STAND = 2.0;                 // distance from the wall to the shaft centre
const LIFT_SPEED = 5;                   // vertical travel speed, world units/sec
const LIFT_WAIT  = 2.0;                 // dwell time at top/bottom

// ---- Scene / nav-plugin access (same dynamic pattern as the other maps —
// lets editor.html override the scene per-build instead of being locked to
// whatever scene.js decided at its own module-load time) ----
let scene, navPlugin;
function getScene() {
  if (typeof window !== 'undefined' && window.__levelScene) return window.__levelScene;
  throw new Error('No scene provided – set window.__levelScene before building level');
}
function getNavPlugin() {
  if (typeof window !== 'undefined' && window.__levelNavPlugin) return window.__levelNavPlugin;
  return { createNavMesh: () => {} };
}

// -- Shared materials (initialised in buildCityLevel) ----------
let _CONCRETE, _STEEL, _ASPHALT, _GARDEN;

function _mkAsphalt() {
  const cv=document.createElement('canvas'); cv.width=256; cv.height=256;
  const ctx=cv.getContext('2d');
  ctx.fillStyle='#18181e'; ctx.fillRect(0,0,256,256);
  ctx.strokeStyle='#24242e'; ctx.lineWidth=1;
  for(let i=0;i<256;i+=28){
    ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,256);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(256,i);ctx.stroke();
  }
  ctx.strokeStyle='#111'; ctx.lineWidth=1;
  [[20,0,85,40],[110,25,180,90],[38,145,105,200],[168,180,235,240]].forEach(([x0,y0,x1,y1])=>{
    ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.stroke();
  });
  const mat=new BABYLON.StandardMaterial('asphaltMat',scene);
  const tex=new BABYLON.DynamicTexture('asphaltTex',{width:256,height:256},scene,false);
  tex.getContext().drawImage(cv,0,0); tex.update();
  tex.uScale=10; tex.vScale=10;
  mat.diffuseTexture=tex; mat.specularColor=new BABYLON.Color3(0.03,0.03,0.05);
  return mat;
}
function _mkConcrete() {
  const cv=document.createElement('canvas'); cv.width=128; cv.height=128;
  const ctx=cv.getContext('2d');
  ctx.fillStyle='#c0c8d0'; ctx.fillRect(0,0,128,128);
  ctx.strokeStyle='#a8b4be'; ctx.lineWidth=1;
  for(let i=0;i<128;i+=16){
    ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,128);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(128,i);ctx.stroke();
  }
  const mat=new BABYLON.StandardMaterial('concreteMat',scene);
  const tex=new BABYLON.DynamicTexture('concreteTex',{width:128,height:128},scene,false);
  tex.getContext().drawImage(cv,0,0); tex.update();
  tex.uScale=3; tex.vScale=3;
  mat.diffuseTexture=tex; mat.specularColor=new BABYLON.Color3(0.04,0.04,0.05);
  return mat;
}
function _mkSteel() {
  const mat=new BABYLON.StandardMaterial('steelMat_'+Math.random().toFixed(5),scene);
  mat.diffuseColor=new BABYLON.Color3(0.16,0.18,0.22);
  mat.specularColor=new BABYLON.Color3(0.28,0.30,0.34); mat.specularPower=64;
  return mat;
}
function _mkGlass(r,g,b,a) {
  const mat=new BABYLON.StandardMaterial('glass_'+Math.random().toFixed(5),scene);
  mat.diffuseColor=new BABYLON.Color3(r,g,b);
  mat.emissiveColor=new BABYLON.Color3(r*0.18,g*0.24,b*0.32);
  mat.specularColor=new BABYLON.Color3(0.7,0.8,1.0); mat.specularPower=128;
  mat.alpha=a; mat.backFaceCulling=false;
  return mat;
}
function _mkGarden() {
  const cv=document.createElement('canvas'); cv.width=64; cv.height=64;
  const ctx=cv.getContext('2d');
  ctx.fillStyle='#1a3010'; ctx.fillRect(0,0,64,64);
  for(let i=0;i<120;i++){
    ctx.fillStyle=`rgba(${8+Math.random()*18},${30+Math.random()*28},${6+Math.random()*12},0.8)`;
    ctx.beginPath();ctx.arc(Math.random()*64,Math.random()*64,Math.random()*4+1,0,Math.PI*2);ctx.fill();
  }
  const mat=new BABYLON.StandardMaterial('gardenMat',scene);
  const tex=new BABYLON.DynamicTexture('gardenTex',{width:64,height:64},scene,false);
  tex.getContext().drawImage(cv,0,0); tex.update();
  tex.uScale=2; tex.vScale=2;
  mat.diffuseTexture=tex; mat.specularColor=new BABYLON.Color3(0.01,0.02,0.01);
  return mat;
}

// City's editable geometry (floors, walls, glass, columns, barrels, relay
// railings) now comes exclusively from assets/maps/city.json — see the
// "-- Level builder --" section below. The thin wrapper functions that used
// to produce that content directly (_floor/_wall/_glass/_col/_hw/_barrel)
// have been removed since nothing calls them anymore; only the genuinely
// non-editable/systemic builders remain: _jp (jump pads — raw gameplay
// data, never part of the JSON system), _zipline/_lift/_bridge (carry
// _moveData a flat JSON prop can't represent), and _car (decorative
// composite with its own jump pad).
function _jp(px,floorY,pz,force=22,rotY=0) {
  force *= 1.5; // city map is larger than the others — pads hit noticeably harder across the board
  const y=liftY(floorY), pg=new BABYLON.TransformNode('jpGroup',scene);
  pg.position.set(px,y,pz); pg.rotation.y=rotY;
  const base=BABYLON.MeshBuilder.CreateCylinder('jpBase',{diameter:2.2,height:0.1,tessellation:16},scene);
  base.position.set(0,0.05,0);
  base.material=M.jumpPad || M.ledGreen; // same shared pad material the other maps use
  base.parent=pg; base.isPickable=false; base.checkCollisions=false;
  jumpPads.push({pos:new BABYLON.Vector3(px,y,pz),force,thrustX:Math.sin(rotY)*(force*0.45),thrustZ:Math.cos(rotY)*(force*0.45)});
}
// Zipline at walking speed (worldSpeedUPS = world units per second).
// Kept as a direct mesh build (not routed through createSlab) — it carries
// _moveData (movingPlatforms) that a generic JSON re-import wouldn't
// reconstruct from a flat slab, so it stays explicitly non-editable.
function _zipline(name,start,end,worldSpeedUPS,sw,sz) {
  const dist=BABYLON.Vector3.Distance(start,end);
  const tSpeed=worldSpeedUPS/dist;
  const H=0.3, m=BABYLON.MeshBuilder.CreateBox(name,{width:sw,height:H,depth:sz},scene);
  m.position.set(start.x,start.y-H/2,start.z);
  const mat=new BABYLON.StandardMaterial(name+'_mat',scene);
  mat.diffuseColor=new BABYLON.Color3(0.22,0.52,0.92);
  mat.emissiveColor=new BABYLON.Color3(0.04,0.12,0.28);
  m.material=mat; m.checkCollisions=true; m.isPickable=false;
  m.metadata={editable:false,type:'zipline'};
  m._moveData={start:start.clone(),end:end.clone(),speed:tSpeed,t:0,dir:1,waitTimer:0,waitTime:1.5,paused:false};
  movingPlatforms.push(m); walkableMeshes.push(m);
  // Cable
  const mid=BABYLON.Vector3.Lerp(start,end,0.5);
  const cable=BABYLON.MeshBuilder.CreateCylinder(name+'_cab',{diameter:0.07,height:dist,tessellation:5},scene);
  cable.position.copyFrom(mid);
  const axis=end.subtract(start).normalize();
  const dot=BABYLON.Vector3.Dot(axis,BABYLON.Axis.Y);
  if(Math.abs(dot)<0.999){
    const rot=BABYLON.Vector3.Cross(BABYLON.Axis.Y,axis);
    cable.rotationQuaternion=BABYLON.Quaternion.RotationAxis(rot.normalize(),Math.acos(dot));
  }
  const cmat=new BABYLON.StandardMaterial(name+'_cmat',scene);
  cmat.diffuseColor=new BABYLON.Color3(0.24,0.28,0.35);
  cmat.emissiveColor=new BABYLON.Color3(0.03,0.05,0.08);
  cable.material=cmat; cable.isPickable=false;
  return m;
}

// Shared helper: rotate a mesh (already positioned) so its local Z axis
// points along `dir`, WITHOUT rolling it sideways. A single minimal
// rotation (rotate Z toward dir around their cross product) is fine when
// dir only tilts in one vertical plane — e.g. the bridges, which just rise
// or fall along their span — but it does NOT keep "width" level for a
// genuinely 3D diagonal like the fire-escape flights (which move sideways,
// outward, AND up all at once); it twists the whole box into the slope.
// This builds an explicit right/up/forward frame instead — right is always
// horizontal (perpendicular to world-up and to the travel direction), up
// tilts ONLY in the vertical plane containing the travel direction — then
// converts that frame to a quaternion with the standard rotation-matrix
// formula (right/up/forward as the matrix's three columns).
function _alignToDir(mesh, dir) {
  const forward = dir.normalize();
  let right = BABYLON.Vector3.Cross(BABYLON.Axis.Y, forward);
  if (right.lengthSquared() < 1e-6) right = BABYLON.Vector3.Cross(BABYLON.Axis.Z, forward);
  right.normalize();
  const up = BABYLON.Vector3.Cross(forward, right).normalize();
  const trace = right.x + up.y + forward.z;
  let qx,qy,qz,qw;
  if (trace > 0) {
    const s = Math.sqrt(trace+1.0)*2;
    qw = 0.25*s; qx = (up.z-forward.y)/s; qy = (forward.x-right.z)/s; qz = (right.y-up.x)/s;
  } else if (right.x > up.y && right.x > forward.z) {
    const s = Math.sqrt(1.0+right.x-up.y-forward.z)*2;
    qw = (up.z-forward.y)/s; qx = 0.25*s; qy = (up.x+right.y)/s; qz = (forward.x+right.z)/s;
  } else if (up.y > forward.z) {
    const s = Math.sqrt(1.0+up.y-right.x-forward.z)*2;
    qw = (forward.x-right.z)/s; qx = (up.x+right.y)/s; qy = 0.25*s; qz = (forward.y+up.z)/s;
  } else {
    const s = Math.sqrt(1.0+forward.z-right.x-up.y)*2;
    qw = (right.y-up.x)/s; qx = (forward.x+right.z)/s; qy = (forward.y+up.z)/s; qz = 0.25*s;
  }
  mesh.rotationQuaternion = new BABYLON.Quaternion(qx,qy,qz,qw);
}

// -- Building lighting ---------------------------------------------
// _building() used to generate an entire building's walls, glass panels,
// corner columns, roof slab, and garden overlay — ALL of that geometry now
// comes from assets/maps/city.json (every one of those pieces routes
// through createWall/createGlass/createColumn/createSlab, so it's fully
// captured there). The only thing left that was never part of the
// editable/JSON system is each building's roof-top point light, so that's
// all this helper does now. Same 17 call sites as before, just a lighter
// signature (no glassMat/openings — nothing left here needs to know about
// door gaps or parapet cuts, since no new geometry is being generated).
function _buildingLight(cx, cz, topSurfY, roofType, label) {
  if (roofType === 'garden') {
    const gl = new BABYLON.PointLight('gL_' + label, new BABYLON.Vector3(cx, topSurfY + 3, cz), scene);
    gl.diffuse = new BABYLON.Color3(0.3, 0.9, 0.3); gl.intensity = 0.9; gl.range = 18;
  } else {
    const rl = new BABYLON.PointLight('rL_' + label, new BABYLON.Vector3(cx, topSurfY + 4, cz), scene);
    rl.diffuse = new BABYLON.Color3(0.55, 0.72, 1.0); rl.intensity = 1.1; rl.range = 22;
  }
}

// -- Rooftop lift: a flat car riding straight up a shaft, ground -> roof --
// Bolted to one wall face, standing LIFT_STAND off the wall. Uses the exact
// same moving-platform mechanism as the ziplines (movingPlatforms + main.js
// already carries the player along anything in that array) — the car just
// moves on Y instead of across a horizontal span. Static landings at both
// ends mean there's always solid ground to wait on even when the car itself
// is parked at the other end. faceOffset shifts the shaft along the wall —
// only needed for hub building E, whose every face already carries a
// bridge deck.
function _lift(cx, cz, topSurfY, face, faceOffset=0) {
  const HALF = 10; // matches every building's 20x20 footprint (BW=BD=20 in _building)
  const alongX = (face==='N' || face==='S');
  const wall    = alongX ? (cz + (face==='N'?-HALF:HALF)) : (cx + (face==='E'?HALF:-HALF));
  const outSign = (face==='N' || face==='W') ? -1 : 1; // points away from the building
  const anchor  = (alongX ? cx : cz) + faceOffset;
  const out     = wall + outSign*LIFT_STAND;
  const shaftX  = alongX ? anchor : out;
  const shaftZ  = alongX ? out    : anchor;
  const half    = LIFT_W/2;

  // Static landing floor at the bottom is now part of assets/maps/city.json
  // (a plain LIFT_W×LIFT_W slab, same as any other editable floor patch) —
  // everything below this point is the actual moving mechanism, which has
  // no equivalent in the JSON system (it carries _moveData/collision state
  // a flat prop can't represent).

  // Corner support poles, ground to roof — purely cosmetic shaft framing.
  const poleH = topSurfY + 1.2;
  [[-half,-half],[half,-half],[-half,half],[half,half]].forEach(([dx,dz])=>{
    const pole = BABYLON.MeshBuilder.CreateCylinder('liftPole',{diameter:0.16,height:poleH},scene);
    pole.position.set(shaftX+dx, poleH/2, shaftZ+dz);
    pole.material=_STEEL; pole.isPickable=false;
  });

  // The moving car itself — carries _moveData, stays non-editable.
  const H = 0.3;
  const plat = BABYLON.MeshBuilder.CreateBox('liftPlat',{width:LIFT_W,height:H,depth:LIFT_W},scene);
  plat.position.set(shaftX, -H/2, shaftZ);
  plat.material=_STEEL; plat.checkCollisions=true; plat.isPickable=false;
  plat.metadata={editable:false,type:'lift'};
  walkableMeshes.push(plat);

  // Low rim rail, parented so it rides with the car automatically.
  [-1,1].forEach(s=>{
    const rail = BABYLON.MeshBuilder.CreateBox('liftRail',
      {width: alongX?LIFT_W:0.15, height:1.0, depth: alongX?0.15:LIFT_W}, scene);
    rail.position.set(alongX?0:s*half, 0.5+H/2, alongX?s*half:0);
    rail.material=_STEEL; rail.isPickable=false; rail.parent=plat;
  });

  plat._moveData = {
    start: new BABYLON.Vector3(shaftX, -H/2, shaftZ),
    end:   new BABYLON.Vector3(shaftX, topSurfY-H/2, shaftZ),
    speed: LIFT_SPEED/topSurfY, t:0, dir:1, waitTimer:0, waitTime:LIFT_WAIT, paused:false,
  };
  movingPlatforms.push(plat);
}

// Sky bridge between two rooftops. y1/y2 are each building's own topSurfY —
// when they match the deck is flat (old behaviour); when they differ this
// builds a sloped ramp instead, using the shared _alignToDir helper.
function _bridge(cx, cz, spanAxis, spanLen, bridgeW, y1, y2) {
  const half = spanLen/2;
  const p1 = spanAxis==='X' ? new BABYLON.Vector3(cx-half,y1,cz) : new BABYLON.Vector3(cx,y1,cz-half);
  const p2 = spanAxis==='X' ? new BABYLON.Vector3(cx+half,y2,cz) : new BABYLON.Vector3(cx,y2,cz+half);
  const dist = BABYLON.Vector3.Distance(p1,p2);
  const mid  = BABYLON.Vector3.Lerp(p1,p2,0.5);
  const H = 0.35;
  const dir = p2.subtract(p1).normalize();

  // _alignToDir rotates local Z to `dir`; build the deck/rails with their
  // long axis along Z (=dist) regardless of spanAxis, then align. Not
  // routed through createSlab/createWall since the rotation is applied via
  // rotationQuaternion (not the simple rotX/rotZ that createRamp expects).
  const deck = BABYLON.MeshBuilder.CreateBox('bridgeDeck',{width:bridgeW,height:H,depth:dist},scene);
  deck.position.set(mid.x, mid.y-H/2, mid.z); _alignToDir(deck,dir);
  deck.material=_CONCRETE; deck.checkCollisions=true; deck.isPickable=false;
  deck.metadata={editable:false,type:'bridge'};
  walkableMeshes.push(deck);

  [-1,1].forEach(side=>{
    const rail = BABYLON.MeshBuilder.CreateBox('bridgeRail',{width:0.25,height:1.4,depth:dist},scene);
    // Offset sideways in the deck's (pre-rotation) local X, then rotate the
    // offset point itself by reusing the same rotation as the deck.
    const localOff = new BABYLON.Vector3(side*(bridgeW/2),0.7-H/2,0);
    let worldOff = localOff;
    if (deck.rotationQuaternion) {
      worldOff = new BABYLON.Vector3();
      localOff.rotateByQuaternionToRef(deck.rotationQuaternion, worldOff);
    }
    rail.position.copyFrom(mid).addInPlace(worldOff);
    rail.rotationQuaternion = deck.rotationQuaternion ? deck.rotationQuaternion.clone() : null;
    rail.material=_CONCRETE; rail.checkCollisions=true; rail.isPickable=false;
    rail.metadata={editable:false,type:'bridge_rail'};
    walkableMeshes.push(rail);
  });
}

// Car wreck — body/cabin still go through createWall (consistent collision
// + walkableMeshes bookkeeping) but stay editable:false since they're
// parented sub-meshes of a decorative composite, not standalone props.
function _car(cx,cz,rotY=0) {
  const g=new BABYLON.TransformNode('car',scene);
  g.position.set(cx,0.5,cz); g.rotation.y=rotY;
  const bmat=new BABYLON.StandardMaterial('cBM_'+Math.random().toFixed(4),scene);
  const h=Math.random();
  bmat.diffuseColor=new BABYLON.Color3(0.1+h*0.5,0.08+h*0.25,0.06+h*0.18);
  bmat.specularColor=new BABYLON.Color3(0.05,0.05,0.05);
  const body = createWall(0, 0, 0, 2, 0.9, 4.4, bmat, { editable: false });
  body.parent=g; body.isPickable=false;
  const cabin = createWall(0, 0.78, 0, 1.8, 0.7, 2.2, bmat, { editable: false });
  cabin.parent=g; cabin.isPickable=false;
  const wmat=new BABYLON.StandardMaterial('wM',scene);
  wmat.diffuseColor=new BABYLON.Color3(0.08,0.08,0.08);
  [[-1.1,-1.4],[-1.1,1.4],[1.1,-1.4],[1.1,1.4]].forEach(([wx,wz])=>{
    const w=BABYLON.MeshBuilder.CreateCylinder('wh',{diameter:0.7,height:0.25,tessellation:10},scene);
    w.rotation.z=Math.PI/2; w.parent=g; w.position.set(wx,-0.3,wz);
    w.material=wmat; w.isPickable=false;
  });
  // Roof jump pad — cabin roof sits at world Y=1.63; lets players hop on/off
  // cars for a quick street-level boost (same _jp design as every other pad).
  _jp(cx,1.63,cz,16,rotY);
}

// -- Level builder ---------------------------------------------
export async function buildCityLevel(customScene = null) {
  scene = customScene || getScene();
  navPlugin = getNavPlugin();

  walkableMeshes.length=0; movingPlatforms.length=0; hazardZones.length=0;
  powerSwitches.length=0; destructibleWalls.length=0;
  jumpPads.length=0; explosiveBarrels.length=0; spikeTrapZones.length=0;

  _CONCRETE=_mkConcrete(); _STEEL=_mkSteel();
  _ASPHALT=_mkAsphalt(); _GARDEN=_mkGarden();

  setLevelMaterials(_CONCRETE, _STEEL, _GARDEN, _ASPHALT);

  const GLASS_BLUE  =_mkGlass(0.30,0.50,0.92,0.35);
  const GLASS_WHITE =_mkGlass(0.70,0.80,0.96,0.30);
  const GLASS_CYAN  =_mkGlass(0.28,0.68,0.90,0.38);
  const GLASS_SILVER=_mkGlass(0.60,0.65,0.72,0.28);
  const GLASS_TEAL  =_mkGlass(0.20,0.72,0.78,0.36);
  registerMaterial('glassBlue', GLASS_BLUE);
  registerMaterial('glassWhite', GLASS_WHITE);
  registerMaterial('glassCyan', GLASS_CYAN);
  registerMaterial('glassSilver', GLASS_SILVER);
  registerMaterial('glassTeal', GLASS_TEAL);

  scene.clearColor=new BABYLON.Color4(0.54,0.70,0.98,1.0);
  scene.fogColor=new BABYLON.Color3(0.52,0.68,0.94);
  scene.fogStart=80; scene.fogEnd=210;

  // -- Boundaries ------------------------------------------------
  // NOTE: the previous version had width/depth swapped on every wall — e.g.
  // the "north" wall was 2 units wide (X) and 80 deep (Z), instead of wide
  // (X) and thin (Z). That made each wall a thin floating PILLAR planted
  // near the middle of its edge instead of a barrier spanning it, and those
  // pillars happened to cut straight through the N/O/P/Q building footprints
  // (which all sit on the x=0 or z=0 axis) — that's the "invisible wall at
  // any height" players were hitting near those buildings. Fixed below, and
  // made visible (flat sky-colour, unlit so it always matches the sky/fog
  // regardless of scene lighting) instead of fully invisible.
  const bndMat=new BABYLON.StandardMaterial('bnd',scene);
  bndMat.emissiveColor=new BABYLON.Color3(0.54,0.70,0.98); // matches scene.clearColor
  bndMat.disableLighting=true; bndMat.backFaceCulling=false;
  registerMaterial('cityBoundary', bndMat);
  const BND_Y=45, BND_H=130, BND_T=3, BND_SPAN=206; // taller + thicker now that jump pads hit harder
  [[0,BND_Y,101,BND_SPAN,BND_T],[0,BND_Y,-101,BND_SPAN,BND_T],
   [101,BND_Y,0,BND_T,BND_SPAN],[-101,BND_Y,0,BND_T,BND_SPAN]].forEach(([px,py,pz,sx,sz])=>{
    // editable:false + navmesh:false — matches the original behaviour
    // exactly (huge edge-of-map walls weren't part of the NavMesh bake
    // input before either, since enemies never reach this far out).
    createWall(px,py,pz,sx,BND_H,sz,bndMat,{editable:false,navmesh:false});
  });

  // -- Street ground ---------------------------------------------
  const street=BABYLON.MeshBuilder.CreateGround('street',{width:202,height:202},scene);
  street.position.y=-0.05; street.material=_ASPHALT;
  street.checkCollisions=true; street.isPickable=false; walkableMeshes.push(street);

  // Pavement kerbs at all building bases
  const allBldgPos=[[-36,-36],[36,-36],[36,36],[-36,36],[0,0],[-60,0],[60,0],[0,-60],[0,60],
    [-80,-80],[80,-80],[80,80],[-80,80],[-80,0],[80,0],[0,-80],[0,80]];
  allBldgPos.forEach(([bx,bz])=>{
    const p=BABYLON.MeshBuilder.CreateBox('pave',{width:23,height:0.22,depth:23},scene);
    p.position.set(bx,0.1,bz); p.material=_CONCRETE; p.isPickable=false;
  });

  // -- Road lane markings (long flat planes on street surface) ---
  const laneMat=new BABYLON.StandardMaterial('laneMat',scene);
  laneMat.diffuseColor=new BABYLON.Color3(0.55,0.50,0.12);
  laneMat.emissiveColor=new BABYLON.Color3(0.06,0.05,0.01);
  const _lane=(cx,cz,sx,sz)=>{
    const l=BABYLON.MeshBuilder.CreateBox('lane',{width:sx,height:0.04,depth:sz},scene);
    l.position.set(cx,0.01,cz); l.material=laneMat; l.isPickable=false;
  };
  // Centre roads
  _lane(0,0,1.5,200); _lane(0,0,200,1.5);
  // Secondary roads
  _lane(-44,0,1.2,200); _lane(44,0,1.2,200);
  _lane(0,-44,200,1.2); _lane(0,44,200,1.2);
  // Outer ring roads
  _lane(-74,0,1.2,200); _lane(74,0,1.2,200);
  _lane(0,-74,200,1.2); _lane(0,74,200,1.2);

  // -- Cars ------------------------------------------------------
  // Inner zone
  _car(-14,-8,0.2);_car(14,-8,-0.1);_car(-14,8,Math.PI+0.15);_car(14,8,Math.PI-0.2);
  _car(0,-22,Math.PI/2);_car(0,22,-Math.PI/2+0.1);
  _car(-22,0,0.05);_car(22,0,Math.PI/6);
  _car(-6,-16,Math.PI/4);_car(6,16,-Math.PI/3);
  // Mid zone
  _car(-48,8,0.3);_car(48,-8,-0.25);
  _car(-22,-50,Math.PI/2+0.1);_car(22,50,-Math.PI/2-0.1);
  _car(-50,22,0.4);_car(50,-22,-0.35);
  _car(0,-42,0.1);_car(0,42,-0.1);
  _car(-42,0,Math.PI/2+0.2);_car(42,0,-Math.PI/2-0.2);
  // Outer zone (new)
  _car(-68,-20,0.25);_car(68,20,-0.25);_car(-68,20,Math.PI+0.1);_car(68,-20,Math.PI-0.1);
  _car(-20,-68,Math.PI/2+0.2);_car(20,68,-Math.PI/2-0.2);
  _car(-20,68,Math.PI/3);_car(20,-68,-Math.PI/3);
  _car(-90,0,Math.PI/2);_car(90,0,-Math.PI/2);
  _car(0,-90,0.05);_car(0,90,-0.05);
  _car(-68,-68,Math.PI/4);_car(68,68,-Math.PI/4);
  _car(68,-68,-Math.PI/4+Math.PI);_car(-68,68,Math.PI/4+Math.PI);
  _car(-85,-30,0.3);_car(85,30,-0.3);_car(-30,-85,Math.PI/2+0.15);_car(30,85,-Math.PI/2-0.15);
  _car(-85,30,Math.PI-0.2);_car(85,-30,0.2);_car(30,-85,Math.PI/2-0.1);_car(-30,85,-Math.PI/2+0.1);

  // Jersey barriers — the material is still created/registered here since
  // city.json's Jersey-barrier wall entries reference it by the 'jersey'
  // key, but the 18 actual wall placements now come exclusively from that
  // JSON (same createWall primitive, just JSON-driven instead of this
  // hardcoded forEach).
  const jbm=_mkConcrete();
  registerMaterial('jersey', jbm);

  // Barrels — now come from assets/maps/city.json (every _barrel() call
  // routes through the shared createBarrel primitive, so the whole spread —
  // both this bulk array and the ones scattered near each building below —
  // is fully captured there).

  // RING 1 BUILDINGS
  _buildingLight(-36,-36,F5_Y,'open','A');
  _lift(-36,-36,F5_Y,'W');
  _jp(-36,F5_Y,-36,24,Math.PI*5/4);

  _buildingLight(36,-36,F4_Y,'garden','B');
  _lift(36,-36,F4_Y,'E');
  _jp(36,F4_Y,-36,22,Math.PI+Math.PI/4);

  _buildingLight(36,36,F4_Y,'open','C');
  _lift(36,36,F4_Y,'E');
  _jp(36,F4_Y,36,22,-Math.PI/4);

  _buildingLight(-36,36,F3_Y,'garden','D');
  _lift(-36,36,F3_Y,'W');
  _jp(-36,F3_Y,36,22,Math.PI/4);

  _buildingLight(0,0,F2_Y,'open','E');
  _lift(0,0,F2_Y,'S',4.5);
  _jp(0,F2_Y,0,22,0);

  // RING 2 - wall-adjacent towers
  _buildingLight(-60,0,F3_Y,'open','F');
  _lift(-60,0,F3_Y,'N');
  _jp(-60,F3_Y,0,20,Math.PI/2);

  _buildingLight(60,0,F3_Y,'garden','G');
  _lift(60,0,F3_Y,'N');
  _jp(60,F3_Y,0,20,-Math.PI/2);

  _buildingLight(0,-60,F4_Y,'open','H');
  _lift(0,-60,F4_Y,'E');
  _jp(0,F4_Y,-60,22,Math.PI);

  _buildingLight(0,60,F3_Y,'garden','I');
  _lift(0,60,F3_Y,'E');
  _jp(0,F3_Y,60,20,0);

  // RING 3 - expanded outer buildings
  _buildingLight(-80,-80,F5_Y,'open','J');
  _lift(-80,-80,F5_Y,'N');
  _jp(-80,F5_Y,-80,24,Math.PI*5/4);

  _buildingLight(80,-80,F4_Y,'garden','K');
  _lift(80,-80,F4_Y,'N');
  _jp(80,F4_Y,-80,22,Math.PI+Math.PI/4);

  _buildingLight(80,80,F3_Y,'open','L');
  _lift(80,80,F3_Y,'S');
  _jp(80,F3_Y,80,20,-Math.PI/4);

  _buildingLight(-80,80,F4_Y,'garden','M');
  _lift(-80,80,F4_Y,'S');
  _jp(-80,F4_Y,80,22,Math.PI/4);

  _buildingLight(-80,0,F3_Y,'open','N');
  _lift(-80,0,F3_Y,'W');
  _jp(-80,F3_Y,0,20,Math.PI/2);

  _buildingLight(80,0,F3_Y,'garden','O');
  _lift(80,0,F3_Y,'E');
  _jp(80,F3_Y,0,20,-Math.PI/2);

  _buildingLight(0,-80,F4_Y,'open','P');
  _lift(0,-80,F4_Y,'N');
  _jp(0,F4_Y,-80,22,Math.PI);

  _buildingLight(0,80,F3_Y,'garden','Q');
  _lift(0,80,F3_Y,'S');
  _jp(0,F3_Y,80,20,0);

  // BRIDGES — every span now runs rooftop-to-rooftop (no more mid-floor
  // decks reachable only from removed interior stairs). y1 is the height
  // of the building on the p1/negative-axis end, y2 the building on the
  // p2/positive-axis end; when they differ _bridge() builds a sloped ramp
  // instead of a flat deck.

  // -- Ring1 <-> Ring2 (E's roof is lower than all 4 neighbours -> ramps)
  _bridge(-30, 0, 'X', 40, 4, F3_Y, F2_Y);
  _bridge(30, 0, 'X', 40, 4, F2_Y, F3_Y);
  _bridge(0, -30, 'Z', 40, 4, F4_Y, F2_Y);
  _bridge(0, 30, 'Z', 40, 4, F2_Y, F3_Y);

  // -- Ring2 <-> Ring3 (each pair shares the same roof height -> flat decks)
  _bridge(-70, 0, 'X', 2, 4, F3_Y, F3_Y);
  _bridge(70, 0, 'X', 2, 4, F3_Y, F3_Y);
  _bridge(0, -70, 'Z', 2, 4, F4_Y, F4_Y);
  _bridge(0, 70, 'Z', 2, 4, F3_Y, F3_Y);

  // -- Ring3 corners <-> Ring3 mid (J,K,L,M <-> N,O,P,Q via relay pads)
  // These are aerial jump-pad hops between rooftops via a floating midpoint
  // platform, not walkable bridges — gaps are too wide (60u) for a deck/ramp.
  // Each relay pad's floor + 4 low railing walls now come from
  // assets/maps/city.json (createSlab/createWall respectively); only the
  // jump pad itself stays hardcoded here.
  const RELAY_Y = F3_Y;
  _jp(-74,RELAY_Y,-40,18,Math.PI/2);   // J<->N relay
  _jp(-40,RELAY_Y,-74,18,Math.PI);     // J<->P relay
  _jp(40,RELAY_Y,-74,18,Math.PI);      // K<->P relay
  _jp(74,RELAY_Y,-40,18,-Math.PI/2);   // K<->O relay
  _jp(74,RELAY_Y,40,18,-Math.PI/2);    // L<->O relay
  _jp(40,RELAY_Y,74,18,0);             // L<->Q relay
  _jp(-40,RELAY_Y,74,18,0);            // M<->Q relay
  _jp(-74,RELAY_Y,40,18,Math.PI/2);    // M<->N relay

  // Ring1 diagonal relay pads (AH and CG nudged off the zip_HA / zip_GC cables)
  [[-15,F3_Y,-45,'AH',-Math.PI*3/4],[18,F3_Y,-48,'BH',-Math.PI*5/4],
   [-18,F2_Y,48,'DI',Math.PI/4],[18,F2_Y,48,'CI',-Math.PI/4],
   [-48,F2_Y,-18,'AF',0.25],[48,F2_Y,-18,'BG',Math.PI-0.25],
   [-48,F2_Y,18,'DF',Math.PI/5],[45,F2_Y,15,'CG',-Math.PI/5],
  ].forEach(([px,py,pz,,rot])=>{
    _jp(px,py,pz,18,rot);
  });

  // ZIPLINES
  const ZS = 11.5; // world units/second — faster than before per request

  // Ring1 rooftops
  _zipline('zip_AB',new BABYLON.Vector3(-26,F5_Y+1,-36),new BABYLON.Vector3(26,F4_Y+1,-36),ZS,4,4);
  _zipline('zip_AD',new BABYLON.Vector3(-36,F5_Y+1,-26),new BABYLON.Vector3(-36,F3_Y+1,26),ZS,4,4);
  _zipline('zip_BC',new BABYLON.Vector3(36,F4_Y+1,-26),new BABYLON.Vector3(36,F4_Y+1,26),ZS,4,4);
  _zipline('zip_CD',new BABYLON.Vector3(26,F4_Y+1,36),new BABYLON.Vector3(-26,F3_Y+1,36),ZS,4,4);
  _zipline('zip_EA',new BABYLON.Vector3(-7,F2_Y+1,-7),new BABYLON.Vector3(-26,F5_Y+1,-26),ZS,3.5,3.5);
  // Ring2 to Ring1
  _zipline('zip_HA',new BABYLON.Vector3(-10,F4_Y+1,-60),new BABYLON.Vector3(-26,F5_Y+1,-44),ZS,3.5,3.5);
  _zipline('zip_GC',new BABYLON.Vector3(60,F3_Y+1,10),new BABYLON.Vector3(46,F4_Y+1,26),ZS,3.5,3.5);
  // Ring3 rooftops
  _zipline('zip_JK',new BABYLON.Vector3(-70,F5_Y+1,-80),new BABYLON.Vector3(70,F4_Y+1,-80),ZS,4,4);
  _zipline('zip_JM',new BABYLON.Vector3(-80,F5_Y+1,-70),new BABYLON.Vector3(-80,F4_Y+1,70),ZS,4,4);
  _zipline('zip_KL',new BABYLON.Vector3(80,F4_Y+1,-70),new BABYLON.Vector3(80,F3_Y+1,70),ZS,4,4);
  _zipline('zip_LM',new BABYLON.Vector3(70,F3_Y+1,80),new BABYLON.Vector3(-70,F4_Y+1,80),ZS,4,4);
  // Ring3 to Ring2 diagonal
  _zipline('zip_JP',new BABYLON.Vector3(-70,F5_Y+1,-80),new BABYLON.Vector3(-10,F4_Y+1,-70),ZS,3.5,3.5);
  _zipline('zip_KP',new BABYLON.Vector3(70,F4_Y+1,-80),new BABYLON.Vector3(10,F4_Y+1,-70),ZS,3.5,3.5);

  // SECRET KIT - Bldg E roof (full health + full armor)
  // Registered for initSecretKits() in pickups.js
  const secGlow=new BABYLON.PointLight('secGlow',new BABYLON.Vector3(0,F2_Y+3,0),scene);
  secGlow.diffuse=new BABYLON.Color3(0,1,0.6); secGlow.intensity=1.2; secGlow.range=10;

  // LIGHTING
  const hemi=new BABYLON.HemisphericLight('cityHemi',new BABYLON.Vector3(0,1,0.15),scene);
  hemi.intensity=0.60; hemi.diffuse=new BABYLON.Color3(0.76,0.84,1.0);
  hemi.groundColor=new BABYLON.Color3(0.16,0.18,0.24);

  const _pl=(nm,x,y,z,range,intens,r=0.65,g=0.80,b=1.0)=>{
    const l=new BABYLON.PointLight(nm,new BABYLON.Vector3(x,y,z),scene);
    l.intensity=intens; l.range=range; l.diffuse=new BABYLON.Color3(r,g,b);
    l.specular=new BABYLON.Color3(r*0.18,g*0.18,b*0.18); return l;
  };
  // Inner zone
  _pl('lS1',-14,8,-14,32,1.3);_pl('lS2',14,8,-14,32,1.3);
  _pl('lS3',-14,8,14,32,1.3);_pl('lS4',14,8,14,32,1.3);_pl('lS5',0,8,0,28,1.2);
  // Ring2 streets
  _pl('lS6',-44,8,0,26,1.0);_pl('lS7',44,8,0,26,1.0);
  _pl('lS8',0,8,-44,26,1.0);_pl('lS9',0,8,44,26,1.0);
  // Ring3 streets
  _pl('lS10',-74,8,0,26,0.9);_pl('lS11',74,8,0,26,0.9);
  _pl('lS12',0,8,-74,26,0.9);_pl('lS13',0,8,74,26,0.9);
  _pl('lS14',-74,8,-44,22,0.8);_pl('lS15',74,8,44,22,0.8);
  _pl('lS16',-44,8,-74,22,0.8);_pl('lS17',44,8,74,22,0.8);
  // Ring1 rooftops
  _pl('lA',-36,F5_Y+4,-36,26,1.4,0.5,0.7,1.0);
  _pl('lB',36,F4_Y+4,-36,24,1.3,0.8,0.88,1.0);
  _pl('lC',36,F4_Y+4,36,24,1.3,0.5,0.80,1.0);
  _pl('lD',-36,F3_Y+4,36,22,1.2,0.6,0.88,0.8);
  _pl('lE',0,F2_Y+4,0,22,1.2);
  // Ring2 rooftops
  _pl('lF',-60,F3_Y+4,0,20,1.0);_pl('lG',60,F3_Y+4,0,20,1.0);
  _pl('lH',0,F4_Y+4,-60,22,1.2);_pl('lI',0,F3_Y+4,60,20,1.0);
  // Ring3 rooftops
  _pl('lJ',-80,F5_Y+4,-80,26,1.3,0.4,0.7,0.9);
  _pl('lK',80,F4_Y+4,-80,24,1.2,0.8,0.88,1.0);
  _pl('lL',80,F3_Y+4,80,22,1.1,0.5,0.80,1.0);
  _pl('lM',-80,F4_Y+4,80,24,1.2,0.4,0.78,0.8);
  _pl('lN',-80,F3_Y+4,0,20,1.0);_pl('lO',80,F3_Y+4,0,20,1.0);
  _pl('lP',0,F4_Y+4,-80,22,1.1);_pl('lQ',0,F3_Y+4,80,20,1.0);
  // Bridge lighting (raised to match the new rooftop-height ramps/decks)
  _pl('lBrEF',-30,(F2_Y+F3_Y)/2+3,0,22,0.8,0.4,0.65,1.0);
  _pl('lBrEG',30,(F2_Y+F3_Y)/2+3,0,22,0.8,0.4,0.65,1.0);
  _pl('lBrEH',0,(F2_Y+F4_Y)/2+3,-30,22,0.8);_pl('lBrEI',0,(F2_Y+F3_Y)/2+3,30,22,0.8);

  // JSON LAYOUT OVERRIDE (assets/maps/city.json — see levelHelpers.js)
  const override = await loadMapOverride('city');
  if (override) applyEditableLayout(override, { hazardZones, destructibleWalls });

  // NAVMESH
  walkableMeshes.forEach(m=>m.computeWorldMatrix(true));
  navPlugin.createNavMesh(walkableMeshes,NAVMESH_PARAMS);
}
