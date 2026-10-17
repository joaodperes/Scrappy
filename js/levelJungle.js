// levelJungle.js – Temple Ruins
// ─────────────────────────────────────────────────────────────────
//
//  COORDINATE SYSTEM: South = +Z, North = -Z, East = +X, West = -X.
//  MAP CENTRE = (0,0,0).
//
//  T1_Y =  0  – Ground level. Lava river Z=-9..+9 splits N/S halves.
//               S-T1: stone maze tunnels (Z=10..60), clearing at centre.
//               N-T1: open jungle ruins (Z=-10..-60).
//
//  T2_Y =  6  – Combat deck ABOVE T1. Trapezoidal shape (narrows toward bridge):
//               Outer band: Z=44..56, X=-32..+32
//               Mid   band: Z=30..44, X=-24..+24
//               Inner band: Z=18..30, X=-12..+12
//               (mirrored for N side). Bridge: Z=-9..+9, X=-6..+6.
//               Bridge connects to inner band via connector slabs.
//               S side: jump pads only to T3 (no stairs). N side: stairs to T3.
//
//  T3_Y = 12  – Square courtyard pads above T2, pushed to outer ends of map:
//               S-T3: 4 squares at Z=36..42 and Z=48..54, X=±10..±22.
//               N-T3: mirrored. Brown path connectors. Full walls on outer faces.
//               Jump pads on inner open squares. Stairs to T4 on E/W flanks.
//               Lava-crossing platform dock on west edge of both S-T3 and N-T3.
//
//  T4_Y = 18  – S-T4: centred (Z=42, X=-13..+13). Half-walls + platform switch.
//               N-T4: SECRET — above vertical platform bay at (-22,-44).
//               Only reachable via vertical platform from N-T1 bay.
//
//  MOVING PLATFORMS (both activated by S-T4 switch):
//    1. Vertical  : bay (-22,T1_Y,-44) → secret area (-22,SECRET_Y,-44). Pure vertical.
//    2. Lava-cross: west flank X=-32, travels Z=+36 ↔ Z=-36 across lava at T3_Y.
//
//  HAZARD halfHeight is set tightly on every hazard mesh so only surface contact
//  triggers damage (pfeet check in main.js uses camera.y - 1.8).
//
//  BRIDGE NAVMESH: bridge slab + two connector slabs explicitly overlap both T2
//  inner bands so the navmesh sees a continuous walkable surface N↔S.
//
// ─────────────────────────────────────────────────────────────────

const BABYLON = window.BABYLON;
import { scene, camera, navPlugin } from './scene.js';
import { M } from './textures.js';
import { jumpPads, explosiveBarrels, walkableMeshes } from './level.js';

export const movingPlatforms   = [];
export const hazardZones       = [];
export const powerSwitches     = [];
export const destructibleWalls = [];
export const spikeTrapZones    = [];

export const T1_Y     = 0;
export const T2_Y     = 6;
export const T3_Y     = 12;
export const T4_Y     = 18;
export const SECRET_Y = 18;

export const NAVMESH_PARAMS = {
  cs:0.2, ch:0.2, walkableSlopeAngle:60, walkableHeight:2.5,
  walkableClimb:0.6, walkableRadius:0.5, maxEdgeLen:12,
  maxSimplificationError:1.3, minRegionArea:4, mergeRegionArea:20,
  maxVertsPerPoly:6, detailSampleDist:6, detailSampleMaxError:1,
};

export const JUNGLE_WALKABLE_SPAWNS = [
  // S-T1 maze + clearing
  [-8,T1_Y,40],[8,T1_Y,40],[-36,T1_Y,30],[36,T1_Y,30],
  [-36,T1_Y,50],[36,T1_Y,50],[0,T1_Y,56],
  // N-T1 ruins
  [-14,T1_Y,-22],[14,T1_Y,-22],[0,T1_Y,-32],
  [-28,T1_Y,-38],[28,T1_Y,-38],[-8,T1_Y,-50],[8,T1_Y,-50],
  // T2
  [-20,T2_Y,50],[20,T2_Y,50],[0,T2_Y,36],
  [-20,T2_Y,-50],[20,T2_Y,-50],[0,T2_Y,-36],[0,T2_Y,0],
  // T3
  [-16,T3_Y,45],[16,T3_Y,45],[-16,T3_Y,39],[16,T3_Y,39],
  [-16,T3_Y,-45],[16,T3_Y,-45],
  // T4
  [0,T4_Y,42],[-8,T4_Y,40],[8,T4_Y,40],
];

const FLOAT_LIFT = 0.22;
function liftY(y) { return y > 0.05 ? y + FLOAT_LIFT : y; }

let _S, _D, _G, _P;

// ── Material factories ────────────────────────────────────────────
function _mkJungle(hex, uid) {
  const cv=document.createElement('canvas'); cv.width=256; cv.height=256;
  const ctx=cv.getContext('2d');
  ctx.fillStyle=hex; ctx.fillRect(0,0,256,256);
  for(let i=0;i<700;i++){
    ctx.fillStyle=Math.random()>.5?'#040804':'#190d03';
    ctx.beginPath();
    ctx.arc(Math.random()*256,Math.random()*256,Math.random()*7+1,0,Math.PI*2);
    ctx.fill();
  }
  const tex=new BABYLON.DynamicTexture(uid,{width:256,height:256},scene,false);
  tex.getContext().drawImage(cv,0,0); tex.update();
  const mat=new BABYLON.StandardMaterial(uid+'M',scene);
  mat.diffuseTexture=tex; mat.specularColor=new BABYLON.Color3(.01,.01,.01);
  return mat;
}
function _mkStone() {
  const cv=document.createElement('canvas'); cv.width=256; cv.height=256;
  const ctx=cv.getContext('2d');
  ctx.fillStyle='#1e1e1e'; ctx.fillRect(0,0,256,256);
  for(let i=0;i<320;i++){
    ctx.fillStyle=`rgba(18,30,12,${.35+Math.random()*.55})`;
    ctx.fillRect(Math.random()*256,Math.random()*256,Math.random()*18+2,Math.random()*18+2);
  }
  const tex=new BABYLON.DynamicTexture('stoneTex',{width:256,height:256},scene,false);
  tex.getContext().drawImage(cv,0,0); tex.update();
  const mat=new BABYLON.StandardMaterial('stoneTM',scene);
  mat.diffuseTexture=tex; return mat;
}
function _mkPath() {
  const cv=document.createElement('canvas'); cv.width=128; cv.height=128;
  const ctx=cv.getContext('2d');
  ctx.fillStyle='#2a1a08'; ctx.fillRect(0,0,128,128);
  for(let i=0;i<220;i++){
    ctx.fillStyle=`rgba(${12+Math.random()*18},${8+Math.random()*12},3,${.4+Math.random()*.4})`;
    ctx.fillRect(Math.random()*128,Math.random()*128,Math.random()*12+2,Math.random()*12+2);
  }
  const tex=new BABYLON.DynamicTexture('pathTex',{width:128,height:128},scene,false);
  tex.getContext().drawImage(cv,0,0); tex.update();
  const mat=new BABYLON.StandardMaterial('pathTM',scene);
  mat.diffuseTexture=tex; return mat;
}

// ── Geometry helpers ──────────────────────────────────────────────
// _slab: top face sits exactly at liftY(surfY). Height=0.8 fills downward.
function _slab(px,surfY,pz,sx,sz,mat) {
  const H=0.8, cy=liftY(surfY)-H/2;
  const m=BABYLON.MeshBuilder.CreateBox('slab',{width:sx,height:H,depth:sz},scene);
  m.position.set(px,cy,pz); m.material=mat;
  m.checkCollisions=true; m.isPickable=false;
  walkableMeshes.push(m); return m;
}
// _wall: full-height solid wall. NOT walkable (bots route around, not over).
function _wall(px,py,pz,sx,sy,sz,mat) {
  const m=BABYLON.MeshBuilder.CreateBox('wall',{width:sx,height:sy,depth:sz},scene);
  m.position.set(px,py,pz); m.material=mat||_S;
  m.checkCollisions=true; m.isPickable=false;
  return m;
}
// _halfWall: cover-height (1.6u). Walkable so navmesh treats it as solid obstacle.
function _halfWall(px,surfY,pz,sx,sz,ry=0) {
  const H=1.6;
  const m=BABYLON.MeshBuilder.CreateBox('hw',{width:sx,height:H,depth:sz},scene);
  m.position.set(px,liftY(surfY)+H/2,pz);
  m.rotation.y=ry; m.material=_S;
  m.checkCollisions=true; m.isPickable=false;
  walkableMeshes.push(m); return m;
}
function _pillar(px,pz,baseY,h=4,d=1.1) {
  const m=BABYLON.MeshBuilder.CreateCylinder('pillar',{diameter:d,height:h},scene);
  m.position.set(px,baseY+h/2,pz); m.material=_S;
  m.checkCollisions=true; m.isPickable=false;
  walkableMeshes.push(m); return m;
}
// _stairs: rises from fromSurfY to toSurfY, stepping in direction dir.
// cx,cz = position of the BOTTOM step.
function _stairs(cx,cz,dir,width,fromSurfY,toSurfY) {
  const stepH=0.5, stepD=1.0;
  const steps=Math.round((toSurfY-fromSurfY)/stepH);
  let dx=0,dz=0;
  if(dir==='N') dz=-stepD;
  if(dir==='S') dz= stepD;
  if(dir==='E') dx= stepD;
  if(dir==='W') dx=-stepD;
  for(let i=0;i<steps;i++){
    const sy=liftY(fromSurfY)+(i+.5)*stepH;
    const s=BABYLON.MeshBuilder.CreateBox('step',{width,height:stepH,depth:stepD},scene);
    s.position.set(cx+dx*i,sy,cz+dz*i);
    s.material=_S; s.checkCollisions=true; s.isPickable=false;
    walkableMeshes.push(s);
  }
}
// _jumpPad: base disc flush with floorY. Registers in jumpPads array.
function _jumpPad(px,floorY,pz,force=22,rotY=0) {
  const y=liftY(floorY);
  const padGroup=new BABYLON.TransformNode('jpGroup',scene);
  padGroup.position.set(px,y,pz);
  padGroup.rotation.y=rotY;
  const base=BABYLON.MeshBuilder.CreateCylinder('jpBase',{diameter:2.2,height:0.1,tessellation:16},scene);
  base.position.set(0,0.05,0);
  base.material=M.jumpPad||M.ledGreen;
  base.parent=padGroup; base.isPickable=false; base.checkCollisions=false;
  const thrustX=Math.sin(rotY)*(force*0.45);
  const thrustZ=Math.cos(rotY)*(force*0.45);
  jumpPads.push({pos:new BABYLON.Vector3(px,y,pz),force,thrustX,thrustZ});
}
// _movingSlab: a platform that travels between start and end.
// Starts disabled (paused:true, setEnabled(false)) until switch activates it.
function _movingSlab(name,start,end,speed,sx,sz,wait=1.5) {
  const H=0.6;
  const m=BABYLON.MeshBuilder.CreateBox(name,{width:sx,height:H,depth:sz},scene);
  m.position.set(start.x,liftY(start.y)-H/2,start.z);
  m.material=_S; m.checkCollisions=true; m.isPickable=false;
  m._moveData={start:start.clone(),end:end.clone(),speed,t:0,dir:1,
               waitTimer:0,waitTime:wait,paused:true};
  m.setEnabled(false);
  movingPlatforms.push(m); return m; // Dynamic geometry cannot be baked into Recast.
}
// _lava: visual lava surface at Y≈0. halfHeight=0.55 so pfeet check only
// triggers when player is at ground level (pfeet≈0.22), NOT when on T2 (pfeet≈4.4).
function _lava(cx,cz,sx,sz) {
  const mat=new BABYLON.StandardMaterial('lavaMat',scene);
  mat.emissiveColor=new BABYLON.Color3(.9,.2,0); mat.disableLighting=true;
  const m=BABYLON.MeshBuilder.CreateBox('lava',{width:sx,height:.3,depth:sz},scene);
  m.position.set(cx,-.06,cz); m.material=mat;
  m.checkCollisions=false; m.isPickable=false;
  // halfHeight: mesh centre at y=-0.06, halfHeight=0.55 → active when pfeet in [-0.61, 0.49].
  // Player standing at T1 has pfeet≈0.22 ✓. Player on T2 has pfeet≈4.4 → NOT triggered ✓.
  m.metadata={hazard:true,dps:8,hazardType:'LAVA',halfWidth:sx/2,halfDepth:sz/2,halfHeight:0.55};
  hazardZones.push(m); return m;
}
// _spikeTrap: spikes at surfY. halfHeight=0.45 so only direct contact triggers.
function _spikeTrap(cx,cz,sx,sz,surfY) {
  const fy=liftY(surfY)-.06;
  const floor=BABYLON.MeshBuilder.CreateBox('spikeTrapFloor',{width:sx,height:.15,depth:sz},scene);
  const fmat=new BABYLON.StandardMaterial('spikeFM'+Math.random(),scene);
  fmat.diffuseColor=new BABYLON.Color3(.12,.04,.04);
  fmat.emissiveColor=new BABYLON.Color3(.08,.01,.01);
  floor.position.set(cx,fy,cz); floor.material=fmat;
  floor.checkCollisions=false; floor.isPickable=false;
  const sMat=new BABYLON.StandardMaterial('spikeMat'+Math.random(),scene);
  sMat.emissiveColor=new BABYLON.Color3(.8,.15,.05); sMat.disableLighting=true;
  const cols=Math.max(2,Math.round(sx/1.2)), rows=Math.max(2,Math.round(sz/1.2));
  for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
    const ox=(sx/cols)*c-sx/2+sx/(cols*2), oz=(sz/rows)*r-sz/2+sz/(rows*2);
    const sp=BABYLON.MeshBuilder.CreateCylinder(`sp${r}_${c}_${Math.random().toFixed(4)}`,
      {diameterTop:0,diameterBottom:.18,height:.55,tessellation:6},scene);
    sp.position.set(cx+ox,liftY(surfY)+.28,cz+oz);
    sp.material=sMat; sp.isPickable=false;
  }
  // halfHeight=0.45: mesh centre at liftY(surfY)-0.06. Active when pfeet ∈ [-0.51, 0.39] + liftY.
  floor.metadata={hazard:true,dps:12,hazardType:'SPIKE',
                  halfWidth:sx/2,halfDepth:sz/2,halfHeight:0.45};
  hazardZones.push(floor); spikeTrapZones.push({cx,cz,sx,sz,surfY}); return floor;
}
function _switch(px,surfY,pz,targets) {
  const m=BABYLON.MeshBuilder.CreateBox('switch',{size:.7},scene);
  m.position.set(px,liftY(surfY)+.6,pz);
  const mat=new BABYLON.StandardMaterial('swMat',scene);
  mat.emissiveColor=new BABYLON.Color3(0,.8,.2); mat.disableLighting=true;
  m.material=mat; m.checkCollisions=false; m.isPickable=false;
  m.metadata={interactive:true,type:'switch',activated:false,
              targetPlatforms:targets,switchMesh:m};
  const ring=BABYLON.MeshBuilder.CreateTorus('swRing',{diameter:.9,thickness:.05,tessellation:12},scene);
  ring.position.copyFrom(m.position); ring.material=M.ledGreen; ring.isPickable=false;
  m.metadata.ring=ring; powerSwitches.push(m); return m;
}
// _destWall: cracked orange visual + isPickable=true so hitscan raycasts detect it.
function _destWall(px,surfY,pz,sx,sy,sz,hp=150) {
  const m=BABYLON.MeshBuilder.CreateBox('destWall',{width:sx,height:sy,depth:sz},scene);
  m.position.set(px,liftY(surfY)+sy/2,pz);
  const dmat=new BABYLON.StandardMaterial('destMat'+Math.random(),scene);
  const cv=document.createElement('canvas'); cv.width=128; cv.height=128;
  const ctx=cv.getContext('2d');
  ctx.fillStyle='#1c1810'; ctx.fillRect(0,0,128,128);
  ctx.strokeStyle='#7a4010'; ctx.lineWidth=2;
  [[10,0,40,128],[65,0,85,128],[0,35,128,55],[80,0,25,128]].forEach(([x0,y0,x1,y1])=>{
    ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); ctx.stroke();
  });
  ctx.fillStyle='rgba(200,90,10,0.45)';
  [[14,30],[58,10],[88,68],[28,92],[72,48]].forEach(([x,y])=>ctx.fillRect(x,y,9,5));
  const tex=new BABYLON.DynamicTexture('destTex'+Math.random(),{width:128,height:128},scene,false);
  tex.getContext().drawImage(cv,0,0); tex.update();
  dmat.diffuseTexture=tex; dmat.emissiveColor=new BABYLON.Color3(.14,.06,0);
  m.material=dmat; m.checkCollisions=true;
  m.isPickable=true; // must be true so hitscan raycasts hit it
  m.metadata={destructible:true,hp,maxHp:hp};
  walkableMeshes.push(m); destructibleWalls.push(m); return m;
}
function _barrel(px,pz,surfY) {
  const baseY=liftY(surfY)+.46;
  const bm=BABYLON.MeshBuilder.CreateCylinder('barrel',
    {diameterTop:.96,diameterBottom:1.0,height:.92,tessellation:12},scene);
  bm.position.set(px,baseY,pz); bm.material=M.barrel;
  bm.checkCollisions=true; bm.isPickable=false;
  const hoop=y=>{
    const h=BABYLON.MeshBuilder.CreateCylinder('bHoop',
      {diameterTop:1.22,diameterBottom:1.24,height:.15,tessellation:12},scene);
    h.position.set(px,y,pz); h.material=M.barrelHoop||M.grey; h.isPickable=false; return h;
  };
  const b1=hoop(baseY-.46+.184), b2=hoop(baseY-.46+.717);
  explosiveBarrels.push({mesh:bm,meshes:[bm,b1,b2],alive:true,
    pos:new BABYLON.Vector3(px,baseY,pz),originalPos:new BABYLON.Vector3(px,baseY,pz)});
}

// ─────────────────────────────────────────────────────────────────
export function buildJungleLevel() {
  walkableMeshes.length=0; movingPlatforms.length=0; hazardZones.length=0;
  powerSwitches.length=0; destructibleWalls.length=0; jumpPads.length=0;
  explosiveBarrels.length=0; spikeTrapZones.length=0;

  _S=_mkStone(); _D=_mkJungle('#0a140a','jDirt');
  _G=_mkJungle('#0f1f0f','jGrass'); _P=_mkPath();

  // ═══════════════════════════════════════════════════════════════
  // GROUND PLANE — visual base only, no collision involvement
  // ═══════════════════════════════════════════════════════════════
  const gnd=BABYLON.MeshBuilder.CreateGround('jGnd',{width:130,height:130},scene);
  gnd.position.y=-.12; gnd.material=_D;
  gnd.checkCollisions=true; gnd.isPickable=false;
  walkableMeshes.push(gnd);

  // ═══════════════════════════════════════════════════════════════
  // LAVA RIVER  (Z=-9..+9, full map width)
  // halfHeight=0.55 → only triggers at ground level, NOT from above
  // ═══════════════════════════════════════════════════════════════
  _lava(0, 0, 130, 18);

  // ═══════════════════════════════════════════════════════════════
  // INVISIBLE OUTER BOUNDARIES  (replace perimeter walls entirely)
  // ═══════════════════════════════════════════════════════════════
  const bMat=new BABYLON.StandardMaterial('bMat',scene); bMat.alpha=0;
  const _bound=(nm,sx,sz,px,pz)=>{
    const b=BABYLON.MeshBuilder.CreateBox(nm,{width:sx,height:80,depth:sz},scene);
    b.position.set(px,20,pz); b.material=bMat; b.checkCollisions=true; b.isPickable=false;
  };
  _bound('bN',130,2,  0, 64);
  _bound('bS',130,2,  0,-64);
  _bound('bE',  2,130, 64, 0);
  _bound('bW',  2,130,-64, 0);

  // ═══════════════════════════════════════════════════════════════
  // S-T1  (Z=10..60, X=-55..+55)
  // Maze-like tunnels. 2-3 openings on the lava edge. Open clearing centre.
  // NO perimeter walls — only the invisible boundary above.
  // ═══════════════════════════════════════════════════════════════
  _slab(0, T1_Y, 35, 110, 50, _D);   // one flat base slab, top exactly at T1_Y

  // ── Maze walls (inner only, no outer walls) ──────────────────
  // Two N-S dividing walls create three corridors: west, centre, east.
  // Walls stop short of clearing (Z≈30..50) so clearing is open.
  _wall(-22, 3, 22,  .6, 6, 24, _S);   // west inner wall (Z=10..34)
  _wall( 22, 3, 22,  .6, 6, 24, _S);   // east inner wall
  // E-W cross-passage walls leaving a centre opening (clearing entrance)
  _wall(-38, 3, 34,  28, 6, .6, _S);   // west cross-wall (X=-55..-24)
  _wall( 38, 3, 34,  28, 6, .6, _S);   // east cross-wall  (X=+24..+55)
  // Short walls at south end of corridors (creates dead-end feel)
  _wall(-38, 3, 16,  28, 6, .6, _S);   // west south cross-wall
  _wall( 38, 3, 16,  28, 6, .6, _S);   // east south cross-wall

  // ── Clearing (grass, Z=30..50, X=-20..+20) ──────────────────
  // Slab at T1_Y+0.01 to sit just above base and avoid z-fight
  _slab(0, T1_Y+0.01, 40, 40, 20, _G);

  // ── Destructible walls at clearing entrances ─────────────────
  _destWall(-22, T1_Y, 34, .8, 2.8,  8, 160);   // west entrance blocker
  _destWall( 22, T1_Y, 34, .8, 2.8,  8, 160);   // east entrance blocker

  // ── Cover inside maze ────────────────────────────────────────
  _halfWall(-40, T1_Y, 20,  4, 1.2);
  _halfWall( 40, T1_Y, 20,  4, 1.2);
  _halfWall(-40, T1_Y, 52,  4, 1.2);
  _halfWall( 40, T1_Y, 52,  4, 1.2);
  _halfWall(  0, T1_Y, 56,  6, 1.2);

  // ── S-T1 barrels ─────────────────────────────────────────────
  _barrel(-40, 18, T1_Y); _barrel(40, 18, T1_Y);
  _barrel(-10, 40, T1_Y); _barrel(10, 40, T1_Y);
  _barrel(-40, 54, T1_Y); _barrel(40, 54, T1_Y);
  _barrel(  0, 58, T1_Y);

  // ── S-T1 → T2 access: stairs + jump pads IN THE CLEARING ────
  // T2 inner band: Z=18..30. Clearing north edge: Z=30.
  // Stairs start at clearing north edge (Z=30) and climb NORTH toward T2 inner band.
  // Steps go in 'N' direction from Z=30 to Z=18 (12 units = 12 steps at stepD=1.0).
  // T2_Y - T1_Y = 6 → 12 steps × 0.5stepH ✓.
  // All stairs are in the clearing (X=-4..+4) with open sky above (T2 inner band is
  // only 24 wide, so outside X=±12 is sky — stairs at centre are under T2, but the
  // staircase itself is covered/enclosed which is fine).
  _stairs(-4, 30, 'N', 6, T1_Y, T2_Y);   // west stair column
  _stairs( 4, 30, 'N', 6, T1_Y, T2_Y);   // east stair column

  // Jump pads on south side of clearing — open sky (T2 is at Z=18..30 northward, pads at Z=44..50 southward)
  _jumpPad(-10, T1_Y, 44, 24, Math.PI);   // west pad, launches north-up
  _jumpPad( 10, T1_Y, 44, 24, Math.PI);   // east pad

  // ═══════════════════════════════════════════════════════════════
  // N-T1  (Z=-10..-60, X=-55..+55)
  // Open jungle ruins — NO enclosing walls. Pillars + half-walls only.
  // Bay at (-22,-44) kept clear of all geometry above T1_Y for vertical platform.
  // ═══════════════════════════════════════════════════════════════
  _slab(0, T1_Y,-35, 110, 50, _G);   // flat jungle floor

  // ── Scattered ruin pillars (avoid X=-25..-19, Z=-41..-47 = platform shaft) ──
  const pillarsN=[
    [-40,-14],[-28,-16],[-14,-18],[0,-16],[14,-18],[28,-16],[40,-14],
    [-38,-28],[-24,-24],[-10,-32],[0,-26],[10,-32],[24,-24],[38,-28],
    [-36,-42],[-10,-44],[10,-44],[36,-42],   // skip -22 area for platform shaft
    [-30,-54],[0,-52],[30,-54],
    [-44,-16],[44,-16],[-44,-36],[44,-36],
  ];
  pillarsN.forEach(([px,pz])=>_pillar(px,pz,T1_Y,3+(Math.abs(px+pz)%3)*.3));

  // Taller crumbled pillars for visual variety
  _pillar(-24,-22,T1_Y,5,1.4);
  _pillar( 24,-22,T1_Y,5,1.4);
  _pillar( 24,-44,T1_Y,4.5,1.3);   // east of platform shaft ✓ (shaft is at X=-22)

  // ── Half-walls / cover — sparse and angled, ruin feel ────────
  _halfWall(-34, T1_Y,-18, 6, 1.2, Math.PI/7);
  _halfWall( 34, T1_Y,-18, 6, 1.2,-Math.PI/7);
  _halfWall(-16, T1_Y,-26, 5, 1.2);
  _halfWall( 16, T1_Y,-26, 5, 1.2);
  _halfWall(  0, T1_Y,-38, 8, 1.2);
  _halfWall(-34, T1_Y,-42, 4, 1.2, Math.PI/5);
  _halfWall( 34, T1_Y,-42, 4, 1.2,-Math.PI/5);
  _halfWall(-20, T1_Y,-54, 4, 1.2, Math.PI/4);
  _halfWall( 20, T1_Y,-54, 4, 1.2,-Math.PI/4);

  // ── Vertical platform BOARDING BAY ──────────────────────────
  // Stone slab at (-22,-44). Platform shaft: X=-25..-19, Z=-47..-41 — no geometry above.
  _slab(-22, T1_Y+0.01,-44, 10, 8, _S);  // bay floor (stone, slightly above jungle)

  // ── N-T1 jump pads → N-T2 outer edge ────────────────────────
  // N-T2 outer band centred at Z=-50 (see below). Pads here launch upward.
  // Pads placed in open inter-pillar gaps, away from platform shaft.
  _jumpPad(-30, T1_Y,-20, 24, 0);   // west side, toward bridge
  _jumpPad( 30, T1_Y,-20, 24, 0);   // east side
  _jumpPad(  0, T1_Y,-34, 24, 0);   // centre

  // ── N-T1 barrels ─────────────────────────────────────────────
  _barrel(-36,-18,T1_Y); _barrel(36,-18,T1_Y);
  _barrel(-10,-28,T1_Y); _barrel(10,-28,T1_Y);
  _barrel(  0,-52,T1_Y); _barrel(-28,-52,T1_Y); _barrel(28,-52,T1_Y);

  // ═══════════════════════════════════════════════════════════════
  // BRIDGE  (Z=-9..+9, X=-6..+6, at T2_Y)
  // Connects S-T2 inner band to N-T2 inner band.
  // Connector slabs bridge the gap on each side for navmesh continuity.
  // ═══════════════════════════════════════════════════════════════
  _slab(0, T2_Y,  0, 12, 18, _S);   // main bridge span: Z=-9..+9
  // S connector: bridge end (Z=+9) → S-T2 inner band start (Z=+18). Gap=9 units.
  _slab(0, T2_Y, 13.5, 16, 9, _S);  // Z=9..18, wide enough to overlap both
  // N connector: bridge end (Z=-9) → N-T2 inner band start (Z=-18). Gap=9 units.
  _slab(0, T2_Y,-13.5, 16, 9, _S);  // Z=-9..-18
  // Bridge guard pillars
  _pillar(-5,-8,T2_Y,3,.5); _pillar(5,-8,T2_Y,3,.5);
  _pillar(-5, 8,T2_Y,3,.5); _pillar(5,  8,T2_Y,3,.5);

  // ═══════════════════════════════════════════════════════════════
  // S-T2  — trapezoidal, narrows from south (Z=56) toward bridge (Z=18)
  // Inner band:  Z=18..30, X=-12..+12  (24 wide — matches bridge approach)
  // Mid band:    Z=30..44, X=-24..+24  (48 wide)
  // Outer band:  Z=44..56, X=-32..+32  (64 wide)
  // ═══════════════════════════════════════════════════════════════
  _slab( 0, T2_Y, 24, 24, 12, _S);   // inner:  Z=18..30
  _slab( 0, T2_Y, 37, 48, 14, _S);   // mid:    Z=30..44
  _slab( 0, T2_Y, 50, 64, 12, _S);   // outer:  Z=44..56
  // Taper infill triangles at mid-to-outer shoulders (visual blending)
  _slab(-16, T2_Y, 31, 8, 14, _S);   // SW shoulder fill
  _slab( 16, T2_Y, 31, 8, 14, _S);   // SE shoulder fill

  // S-T2 cover half-walls
  _halfWall(-22, T2_Y, 38,  6, 1.2);
  _halfWall( 22, T2_Y, 38,  6, 1.2);
  _halfWall(-14, T2_Y, 52,  4, 1.2, Math.PI/2);
  _halfWall( 14, T2_Y, 52,  4, 1.2, Math.PI/2);
  _halfWall(  0, T2_Y, 54,  6, 1.2);
  _halfWall( -6, T2_Y, 24,  4, 1.2);
  _halfWall(  6, T2_Y, 24,  4, 1.2);

  // S-T2 barrels
  _barrel(-20, 36, T2_Y); _barrel(20, 36, T2_Y);
  _barrel( -8, 52, T2_Y); _barrel( 8, 52, T2_Y);

  // S-T2 jump pads → S-T3 — placed at OUTER corners of outer band.
  // Outer band: Z=44..56, X=-32..+32. T3 squares start at Z=36 (inside/above).
  // Pads at Z=52, X=±28 → outside T3 footprint (T3 X=±10..±22) → open sky ✓.
  _jumpPad(-26, T2_Y, 52, 26, -Math.PI*3/4);   // SW outer, launches NE toward T3
  _jumpPad( 26, T2_Y, 52, 26,  Math.PI*3/4);   // SE outer, launches NW toward T3
  // No stairs from S-T2 to S-T3 (per spec).

  // Spike traps at base of T2 taper drops (player falls off S-T2 shoulders)
  _spikeTrap(-36, 37, 6, 14, T1_Y);   // SW drop zone
  _spikeTrap( 36, 37, 6, 14, T1_Y);   // SE drop zone

  // ═══════════════════════════════════════════════════════════════
  // N-T2  — mirror of S-T2. Additionally has stairs to N-T3.
  // Inner band:  Z=-18..-30, X=-12..+12
  // Mid band:    Z=-30..-44, X=-24..+24
  // Outer band:  Z=-44..-56, X=-32..+32
  // ═══════════════════════════════════════════════════════════════
  _slab( 0, T2_Y,-24, 24, 12, _S);   // inner
  _slab( 0, T2_Y,-37, 48, 14, _S);   // mid
  _slab( 0, T2_Y,-50, 64, 12, _S);   // outer
  _slab(-16, T2_Y,-31, 8, 14, _S);   // NW shoulder fill
  _slab( 16, T2_Y,-31, 8, 14, _S);   // NE shoulder fill

  // N-T2 cover (mirrored)
  _halfWall(-22, T2_Y,-38,  6, 1.2);
  _halfWall( 22, T2_Y,-38,  6, 1.2);
  _halfWall(-14, T2_Y,-52,  4, 1.2, Math.PI/2);
  _halfWall( 14, T2_Y,-52,  4, 1.2, Math.PI/2);
  _halfWall(  0, T2_Y,-54,  6, 1.2);

  _barrel(-20,-36,T2_Y); _barrel(20,-36,T2_Y);
  _barrel( -8,-52,T2_Y); _barrel( 8,-52,T2_Y);

  // N-T2 jump pads → N-T3
  _jumpPad(-26, T2_Y,-52, 26,  Math.PI/4);    // NW outer → SE toward N-T3
  _jumpPad( 26, T2_Y,-52, 26, -Math.PI/4);    // NE outer → SW

  // ── N-T2 STAIRS to N-T3 (spec: N side has stairs, S side does not) ──
  // N-T3 squares are at Z=-36..-48 (see below). N-T2 outer band ends at Z=-56.
  // Stairs at outer edge of mid band (Z≈-44), going further N to N-T3 level.
  // Place stairs at west and east sides to flank the area.
  _stairs(-20,-44,'N', 5, T2_Y, T3_Y);   // west stair from N-T2 mid to N-T3
  _stairs( 20,-44,'N', 5, T2_Y, T3_Y);   // east stair

  _spikeTrap(-36,-37, 6, 14, T1_Y);   // NW drop zone
  _spikeTrap( 36,-37, 6, 14, T1_Y);   // NE drop zone

  // ═══════════════════════════════════════════════════════════════
  // S-T3  — square courtyard pads (T3_Y=12), pushed south.
  // 4 squares: SW(-16,48) SE(+16,48) NW(-16,36) NE(+16,36). Each 12×12.
  // SW + SE: full wall on SOUTH face (outer/lava-far edge).
  // NW + NE: half-wall on NORTH face (toward clearing gap below). Jump pads.
  // Stairs to T4 on west flank (X≈-26) and east flank (X≈+26).
  // Lava-crossing platform dock on west side.
  // ═══════════════════════════════════════════════════════════════
  // Square slabs
  _slab(-16, T3_Y, 48, 12, 12, _S);   // SW square
  _slab( 16, T3_Y, 48, 12, 12, _S);   // SE square
  _slab(-16, T3_Y, 36, 12, 12, _S);   // NW square
  _slab( 16, T3_Y, 36, 12, 12, _S);   // NE square

  // Brown connector paths (at T3_Y+0.02 to avoid z-fight)
  const PO=T3_Y+0.02;
  _slab(  0, PO, 42,  6, 12, _P);   // N-S centre path
  _slab(-16, PO, 42, 12,  4, _P);   // W path between SW and NW
  _slab( 16, PO, 42, 12,  4, _P);   // E path between SE and NE
  _slab(  0, PO, 48,  6, 12, _P);   // E-W path at south squares
  _slab(  0, PO, 36,  6, 12, _P);   // E-W path at north squares

  // SW square: full wall on SOUTH face (outer edge, away from bridge)
  _wall(-16, T3_Y+3, 54.5, 12, 6, .6, _S);
  // SE square: same
  _wall( 16, T3_Y+3, 54.5, 12, 6, .6, _S);
  // NW square: half-wall on NORTH face (toward clearing/bridge gap)
  _halfWall(-16, T3_Y, 30,  12, 1.2);
  // NE square: same
  _halfWall( 16, T3_Y, 30,  12, 1.2);

  // Jump pads on NW and NE squares (open sky — T4 is centred at Z=42, not over Z=36)
  _jumpPad(-16, T3_Y, 36, 18, Math.PI);    // NW → launches north-upward
  _jumpPad( 16, T3_Y, 36, 18, Math.PI);    // NE → same

  // Additional cover
  _halfWall(-24, T3_Y, 48, 1.2, 8);   // west outer
  _halfWall( 24, T3_Y, 48, 1.2, 8);   // east outer

  // S-T3 barrels
  _barrel(-16, 50, T3_Y); _barrel(16, 50, T3_Y);
  _barrel(-16, 36, T3_Y); _barrel(16, 36, T3_Y);

  // Destructible wall on inner approach
  _destWall(0, T3_Y, 30, 6, 2.5, .8, 130);

  // ── Stairs to T4 on west and east flanks of S-T3 ────────────
  // T4 slab centred at Z=42. West stair climbs from X=-24 (outside T3) westward.
  // Stairs run from T3_Y to T4_Y (6 unit rise = 12 steps).
  _stairs(-22, 42, 'W', 5, T3_Y, T4_Y);   // west flank: starts at X=-22, steps west
  _stairs( 22, 42, 'E', 5, T3_Y, T4_Y);   // east flank: starts at X=+22, steps east

  // ── Lava-crossing platform dock — S-T3 west side ────────────
  // Platform travels at X=-32 (west of T3 squares at X=-22). Dock slab extends to X=-32.
  _slab(-28, T3_Y, 42, 10, 10, _S);   // S-T3 west dock (connects T3 to platform path)

  // Spike traps under T3 drop edges
  _spikeTrap(-26, 42, 4, 12, T2_Y);
  _spikeTrap( 26, 42, 4, 12, T2_Y);

  // ═══════════════════════════════════════════════════════════════
  // N-T3  — mirror of S-T3. 4 squares at Z=-36 and Z=-48.
  // Additionally has lava-crossing platform dock.
  // No stairs down from N-T3 (reached via N-T2 stairs or jump pads).
  // ═══════════════════════════════════════════════════════════════
  _slab(-16, T3_Y,-48, 12, 12, _S);   // NW outer
  _slab( 16, T3_Y,-48, 12, 12, _S);   // NE outer
  _slab(-16, T3_Y,-36, 12, 12, _S);   // SW inner
  _slab( 16, T3_Y,-36, 12, 12, _S);   // SE inner

  const NPO=T3_Y+0.02;
  _slab(  0, NPO,-42,  6, 12, _P);
  _slab(-16, NPO,-42, 12,  4, _P);
  _slab( 16, NPO,-42, 12,  4, _P);
  _slab(  0, NPO,-48,  6, 12, _P);
  _slab(  0, NPO,-36,  6, 12, _P);

  // NW/NE outer squares: full wall on NORTH face (outer edge)
  _wall(-16, T3_Y+3,-54.5, 12, 6, .6, _S);
  _wall( 16, T3_Y+3,-54.5, 12, 6, .6, _S);
  // SW/SE inner squares: half-wall on SOUTH face (toward bridge gap)
  _halfWall(-16, T3_Y,-30, 12, 1.2);
  _halfWall( 16, T3_Y,-30, 12, 1.2);

  // Jump pads on SW/SE inner squares (open sky above)
  _jumpPad(-16, T3_Y,-36, 18, 0);    // SW inner
  _jumpPad( 16, T3_Y,-36, 18, 0);    // SE inner

  _halfWall(-24, T3_Y,-48, 1.2, 8);
  _halfWall( 24, T3_Y,-48, 1.2, 8);

  _barrel(-16,-50,T3_Y); _barrel(16,-50,T3_Y);
  _barrel(-16,-36,T3_Y); _barrel(16,-36,T3_Y);

  _destWall(0, T3_Y,-30, 6, 2.5, .8, 130);

  // ── N-T3 lava-crossing platform dock ────────────────────────
  _slab(-28, T3_Y,-42, 10, 10, _S);   // N-T3 west dock

  _spikeTrap(-26,-42, 4, 12, T2_Y);
  _spikeTrap( 26,-42, 4, 12, T2_Y);

  // ═══════════════════════════════════════════════════════════════
  // S-T4  — platform switch area, centred at Z=42 (between T3 squares)
  // Size: 26×14. Half-walls + switch + pillar accents.
  // ═══════════════════════════════════════════════════════════════
  _slab(0, T4_Y, 42, 26, 14, _S);   // Z=35..49, X=-13..+13
  _halfWall(-8,  T4_Y, 36,  4, 1.2);
  _halfWall( 8,  T4_Y, 36,  4, 1.2);
  _halfWall( 0,  T4_Y, 48,  8, 1.2);
  _pillar(-10, 48, T4_Y, 5);
  _pillar( 10, 48, T4_Y, 5);
  _barrel(-6, 42, T4_Y); _barrel(6, 42, T4_Y);

  // ═══════════════════════════════════════════════════════════════
  // N-T4  — SECRET AREA, directly above vertical platform bay (-22,-44)
  // Enclosed on 3 sides, open south face for platform arrival.
  // Health + armor kits spawn here.
  // ═══════════════════════════════════════════════════════════════
  _slab(-22, SECRET_Y,-44, 28, 14, _S);
  _wall(-22, SECRET_Y+2.5,-51,  28, 5, .6, _S);  // north wall
  _wall(-36, SECRET_Y+2.5,-44, .6,  5, 14, _S);  // west wall
  _wall( -8, SECRET_Y+2.5,-44, .6,  5, 14, _S);  // east wall
  _pillar(-26,-38,SECRET_Y, 3, .8);
  _pillar(-18,-38,SECRET_Y, 3, .8);
  _halfWall(-26, SECRET_Y,-38.5, 5, 1.2);
  _halfWall(-18, SECRET_Y,-38.5, 5, 1.2);
  _barrel(-22,-44,SECRET_Y);

  window._jungleSecretPos=[
    new BABYLON.Vector3(-28, SECRET_Y+1.2,-44),
    new BABYLON.Vector3(-16, SECRET_Y+1.2,-44),
  ];

  // ═══════════════════════════════════════════════════════════════
  // MOVING PLATFORMS
  // ═══════════════════════════════════════════════════════════════

  // 1. VERTICAL — N-T1 bay (−22,T1_Y,−44) → N-T4 secret (−22,SECRET_Y,−44)
  //    PURE VERTICAL: X and Z fixed. Only Y changes.
  //    Shaft X=-25..-19, Z=-47..-41 is clear of ALL geometry above T1_Y.
  const vertPlat=_movingSlab('vertPlatform',
    new BABYLON.Vector3(-22, T1_Y+.5,-44),
    new BABYLON.Vector3(-22, SECRET_Y+.5,-44),
    0.9, 8, 6, 3.0
  );
  // Visual guide rails flanking the shaft (decorative, no collision)
  const railMat=new BABYLON.StandardMaterial('railMat',scene);
  railMat.diffuseColor=new BABYLON.Color3(.25,.18,.10);
  for(const [rx,rz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
    const rail=BABYLON.MeshBuilder.CreateBox('vRail',
      {width:.15,height:SECRET_Y+1,depth:.15},scene);
    rail.position.set(-22+rx*3.5,(SECRET_Y+1)/2,-44+rz*2.5);
    rail.material=railMat; rail.checkCollisions=false; rail.isPickable=false;
  }

  // 2. LAVA-CROSSING — west flank at X=-32, travels Z=+42 ↔ Z=-42.
  //    Crosses the lava river (Z=-9..+9) at T3_Y height.
  //    Docks connect to S-T3 west dock and N-T3 west dock slabs above.
  //    CLEAR PATH: no geometry at X=-32 between Z=-9 and Z=+9 above T1_Y ✓.
  const lavaPlat=_movingSlab('lavaCrossPlatform',
    new BABYLON.Vector3(-32, T3_Y+.5, 42),
    new BABYLON.Vector3(-32, T3_Y+.5,-42),
    0.7, 10, 8, 3.5
  );

  // ═══════════════════════════════════════════════════════════════
  // PLATFORM SWITCH — on S-T4, controls both platforms
  // ═══════════════════════════════════════════════════════════════
  _switch(0, T4_Y, 40, [vertPlat, lavaPlat]);

  // ═══════════════════════════════════════════════════════════════
  // LIGHTING — bright enough to navigate clearly
  // ═══════════════════════════════════════════════════════════════
  // Strong hemisphere fill — removes near-black shadow floors
  const jHemi=new BABYLON.HemisphericLight('jHemi',new BABYLON.Vector3(0,1,0),scene);
  jHemi.intensity=0.55;
  jHemi.diffuse=new BABYLON.Color3(.78,.88,.70);
  jHemi.groundColor=new BABYLON.Color3(.22,.28,.18);

  const _pl=(nm,x,y,z,range,intens,r=1,g=.95,b=.78)=>{
    const l=new BABYLON.PointLight(nm,new BABYLON.Vector3(x,y,z),scene);
    l.intensity=intens; l.range=range;
    l.diffuse=new BABYLON.Color3(r,g,b);
    l.specular=new BABYLON.Color3(r*.15,g*.15,b*.15);
    return l;
  };
  // S-T1 clearing
  _pl('lSClr',  0,  6, 40, 32, 1.6, .95,1.0,.75);
  _pl('lSCW', -38,  5, 22, 24, 1.1);
  _pl('lSCE',  38,  5, 22, 24, 1.1);
  _pl('lSBk',   0,  5, 56, 26, 1.0);
  // N-T1 ruins — warm torch glow
  _pl('lNR1', -22,  5,-24, 26, 1.2, 1.0,.82,.55);
  _pl('lNR2',  22,  5,-24, 26, 1.2, 1.0,.82,.55);
  _pl('lNR3',   0,  5,-50, 22, 1.1, 0.9,.78,.50);
  // Platform bay — blue flags it as a special zone
  _pl('lNBay',-22,  7,-44, 20, 1.5, .52,.70,1.0);
  // Lava river — orange heat
  _pl('lLv1', -32,  2,  0, 22, 2.0, 1.0,.38,.04);
  _pl('lLv2',   0,  2,  0, 22, 2.0, 1.0,.38,.04);
  _pl('lLv3',  32,  2,  0, 22, 2.0, 1.0,.38,.04);
  // Bridge
  _pl('lBrg',   0, T2_Y+3,  0, 22, 1.2, .85,.90,.72);
  // T2
  _pl('lT2S1',-18, T2_Y+5, 37, 28, 1.3);
  _pl('lT2S2', 18, T2_Y+5, 37, 28, 1.3);
  _pl('lT2N1',-18, T2_Y+5,-37, 28, 1.3);
  _pl('lT2N2', 18, T2_Y+5,-37, 28, 1.3);
  // T3
  _pl('lT3S',   0, T3_Y+6, 42, 30, 1.3, .80,.90,.76);
  _pl('lT3N',   0, T3_Y+6,-42, 30, 1.3, .80,.90,.76);
  _pl('lT3Dk',-32, T3_Y+5,  0, 20, 1.1, 1.0,.55,.15);  // west dock
  // T4 switch — green
  _pl('lT4S',   0, T4_Y+6, 42, 24, 1.4, .62,1.0,.62);
  // Secret — blue mystery
  _pl('lSec', -22, SECRET_Y+6,-44, 22, 1.6, .46,.66,1.0);

  // ═══════════════════════════════════════════════════════════════
  // NAV MESH
  // ═══════════════════════════════════════════════════════════════
  walkableMeshes.forEach(m=>m.computeWorldMatrix(true));
  navPlugin.createNavMesh(walkableMeshes, NAVMESH_PARAMS);
}
