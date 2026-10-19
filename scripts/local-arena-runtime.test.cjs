// Fast mocked-browser integration checks for the offline arena controller.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const rulesSource=fs.readFileSync(path.join(root,'js/localArenaRules.js'),'utf8')
 .replace(/^export /gm,'');
const runtimeSource=fs.readFileSync(path.join(root,'js/localArenaRuntime.js'),'utf8')
 .replace(/^import .*?;$/gm,'').replace(/^export /gm,'');
function harness(){
 const enemies=[],inventory=[],equipped=[],elements=[],tags=[];
 const BABYLON={
  Color3:class{constructor(r,g,b){this.r=r;this.g=g;this.b=b}},
  Vector3:{Distance:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)},
  MeshBuilder:{CreateSphere:()=>{const mesh={
    position:{x:0,y:0,z:0,copyFrom(p){this.x=p.x;this.y=p.y;this.z=p.z}},
    rotation:{y:0},dispose(){this.disposed=true},
   };tags.push(mesh);return mesh}},
  StandardMaterial:class{dispose(){this.disposed=true}},
 };
 const camera={position:{x:0,y:1.72,z:0}};
 const document={
  body:{appendChild:x=>elements.push(x)},
  createElement:()=>({style:{},remove(){this.removed=true}}),
 };
 const context={window:{BABYLON},document,enemies,inventory,camera,scene:{},BABYLON,
   WDEFS:{PISTOL:{},SMG:{},SHOTGUN:{},KNIFE:{}},
   setActiveSlot(){},setWeapon:id=>equipped.push(id),
   spawnBot:type=>enemies.push({type,alive:true}),
   setTimeout(){return 1},
   console,
 };
 vm.createContext(context);
 const rules=vm.runInContext('(function(){'+rulesSource+
   '\\nreturn {createLocalArena,localArenaKill,localArenaTag,localArenaTagExpired,localArenaDeath,tickLocalArena};})()',context);
 Object.assign(context,rules);
 vm.runInContext(runtimeSource+'\\nthis.api={startLocalArena,stopLocalArena,updateLocalArena,localArenaRobotKilled,localArenaPlayerDead,isLocalArenaActive}',context);
 return {context,api:context.api,enemies,equipped,tags,elements,camera};
}
test('offline runtime starts a timed arena, replenishes robots and prunes dead entries',()=>{
 const h=harness();
 h.api.startLocalArena({mode:'ffa',duration:60,scoreLimit:10},()=>{});
 h.api.updateLocalArena(0.2);
 assert.equal(h.enemies.length,2);
 h.api.updateLocalArena(0.5);
 h.api.updateLocalArena(0.5);
 assert.ok(h.enemies.length>=4);
 h.enemies[0].alive=false;
 h.api.updateLocalArena(3);
 assert.equal(h.enemies.filter(e=>!e.alive).length,0);
 h.api.stopLocalArena();
 assert.equal(h.api.isLocalArenaActive(),false);
 assert.equal(h.elements.at(-1).removed,true);
});
test('Kill Confirmed requires proximity to physically dropped tag',()=>{
 const h=harness(),done=[];
 h.api.startLocalArena({mode:'killConfirmed',duration:60,scoreLimit:1},s=>done.push(s));
 h.api.localArenaRobotKilled({weapon:'SMG',source:'PLAYER',position:{x:10,y:0,z:0}});
 assert.equal(done.length,0);
 assert.equal(h.tags.length,1);
 h.api.updateLocalArena(0.1);
 assert.equal(done.length,0);
 h.camera.position.x=10;
 h.api.updateLocalArena(0.1);
 assert.equal(done.length,1);
 assert.equal(done[0].result,'VICTORY');
 assert.equal(done[0].score,1);
});
test('Gun Game rejects wrong weapon and advances on correct weapon',()=>{
 const h=harness();
 h.api.startLocalArena({mode:'gunGame',seed:11,scoreLimit:1},()=>{});
 assert.equal(h.equipped.at(-1),'PISTOL');
 const n=h.equipped.length;
 h.api.localArenaRobotKilled({weapon:'SMG',source:'PLAYER',position:{x:1,y:0,z:1}});
 assert.equal(h.equipped.length,n);
 h.api.localArenaRobotKilled({weapon:'PISTOL',source:'PLAYER',position:{x:1,y:0,z:1}});
 assert.equal(h.equipped.length,n+1);
 assert.notEqual(h.equipped.at(-1),'PISTOL');
 h.api.stopLocalArena();
});
