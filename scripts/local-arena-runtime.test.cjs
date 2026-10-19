const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8')
 .replace(/^import\s*\{[\s\S]*?\}\s*from\s*'[^']+';?\s*/gm,'')
 .replace(/^export\s+/gm,'');
const source=read('js/localArenaRules.js')+'\n'+read('js/localArenaRuntime.js');
const vec=(x=0,y=0,z=0)=>({x,y,z,clone(){return vec(this.x,this.y,this.z)},
 copyFrom(p){this.x=p.x;this.y=p.y;this.z=p.z}});
function harness(){
 const actors=[],guns=[],timers=[],elements=[],tags=[];
 const B={
  Color3:class{constructor(r,g,b){this.r=r;this.g=g;this.b=b}},
  Vector3:{Distance:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)},
  MeshBuilder:{CreateCylinder:()=>{const mesh={
    position:vec(),rotation:{y:0},dispose(){this.disposed=true}
   };tags.push(mesh);return mesh}},
  StandardMaterial:class{dispose(){this.disposed=true}},
 };
 const camera={position:vec(0,1.72,0)};
 const document={
  body:{appendChild:x=>elements.push(x)},
  createElement:()=>({style:{},remove(){this.removed=true}}),
 };
 let idx=0;
 const profiles=Array.from({length:6},(_,i)=>({
  id:'persona'+i,name:'P'+i,loadout:{primary:'SMG',secondary:'PISTOL'}
 }));
 const context={
  BABYLON:B,document,camera,scene:{},inventory:[],WDEFS:{PISTOL:{},SMG:{},SHOTGUN:{},KNIFE:{}},
  curWep:'PISTOL',setActiveSlot(){},setWeapon(w){this.curWep=w;guns.push(['human',w])},
  fetchArenaPersonas:()=>Promise.resolve(profiles),
  chooseArenaSpawn:()=>vec(10+idx*3,0,0),
  createArenaActor:(persona,team,pos)=>{
   const a={id:'bot'+idx++,name:persona.name,team,persona,group:{position:pos.clone()},
    alive:true,hp:100,maxHp:100,weapon:persona.loadout.primary,kills:0,deaths:0};
   actors.push(a);return a;
  },
  destroyArenaActors:aa=>aa.forEach(a=>a.disposed=true),
  killArenaActor:a=>{a.alive=false;a.hp=0;a.deaths++},
  respawnArenaActor:(a,pos)=>{a.alive=true;a.hp=100;a.group.position.copyFrom(pos);return true},
  setArenaActorWeapon:(a,w)=>{a.weapon=w;guns.push([a.id,w])},
  updateArenaActors:(aa,dt,mode,opts)=>{context.lastUpdate={aa,dt,mode,opts}},
  rebuildMeshMap(){},
  setTimeout:fn=>{timers.push(fn);return timers.length},
  console,
 };
 vm.createContext(context);
 vm.runInContext(source+'\nthis.api={startLocalArena,stopLocalArena,updateLocalArena,localArenaActorHit,localArenaPlayerDead,getLocalArenaSnapshot,isLocalArenaActive}',context);
 const start=async(mode,extra={})=>{
  context.api.startLocalArena({mode,duration:600,scoreLimit:20,...extra},()=>{},d=>{context.damage=(context.damage||0)+d});
  await Promise.resolve();await Promise.resolve();
  return context.api.getLocalArenaSnapshot();
 };
 return {context,api:context.api,actors,guns,timers,elements,tags,camera,start};
}
test('five human-shaped opponents use actual separate personas, teams and weapons',async()=>{
 const h=harness();
 const snap=await h.start('tdm');
 assert.equal(snap.actors.length,5);
 assert.equal(snap.actors.filter(a=>a.team==='RED').length,2);
 assert.equal(snap.actors.filter(a=>a.team==='BLUE').length,3);
 assert.equal(h.actors.every(a=>a.weapon==='SMG'),true);
 h.api.stopLocalArena();
 assert.equal(h.actors.every(a=>a.disposed),true);
});
test('human cannot shoot an ally in TDM, enemy elimination scores team point',async()=>{
 const h=harness();await h.start('tdm');
 const red=h.actors.find(a=>a.team==='RED'),blue=h.actors.find(a=>a.team==='BLUE');
 h.api.localArenaActorHit(red,150,'PLAYER');
 assert.equal(red.hp,100);
 h.api.localArenaActorHit(blue,150,'PLAYER');
 assert.equal(blue.alive,false);
 assert.equal(h.api.getLocalArenaSnapshot().state.score,1);
});
test('real bot-versus-bot kills score; bot hits against human pass damage callback',async()=>{
 const h=harness();await h.start('ffa');
 h.api.updateLocalArena(0.1);
 const first=h.actors[0],second=h.actors[1];
 h.context.lastUpdate.opts.onShot(first,second,120,'SMG');
 assert.equal(second.alive,false);
 assert.equal(h.api.getLocalArenaSnapshot().state.botScores[first.id],1);
 h.context.lastUpdate.opts.onShot(first,null,19,'SMG');
 assert.equal(h.context.damage,19);
});
test('human and bot each advance Gun Game with their current weapon',async()=>{
 const h=harness();const start=await h.start('gunGame',{scoreLimit:1});
 assert.equal(h.context.curWep,'PISTOL');
 h.api.localArenaActorHit(h.actors[0],100,'PLAYER');
 assert.equal(h.api.getLocalArenaSnapshot().state.gunIndex,1);
 assert.equal(h.context.curWep,start.state.gunOrder[1]);
 h.api.updateLocalArena(0.1);
 const winner=h.actors[1],victim=h.actors[2];
 h.context.lastUpdate.opts.onShot(winner,victim,100,'PISTOL');
 assert.equal(h.api.getLocalArenaSnapshot().state.botGuns[winner.id],1);
 assert.equal(winner.weapon,start.state.gunOrder[1]);
 assert.equal(h.api.isLocalArenaActive(),true);
});
test('opponents collect tags, scoring only opponent tags; team tags can be denied',async()=>{
 const h=harness();await h.start('killConfirmed');
 const red=h.actors.find(a=>a.team==='RED'),blue=h.actors.find(a=>a.team==='BLUE');
 h.api.localArenaActorHit(blue,100,'PLAYER');
 assert.equal(h.tags.length,1);
 assert.equal(h.api.getLocalArenaSnapshot().state.score,0);
 // Enemy BLUE teammate can deny BLUE tag without awarding a point.
 const teammate=h.actors.find(a=>a!==blue&&a.team==='BLUE');
 teammate.group.position.copyFrom(h.tags[0].position);
 h.api.updateLocalArena(.1);
 assert.equal(h.api.getLocalArenaSnapshot().state.score,0);
 assert.equal(h.api.getLocalArenaSnapshot().state.pendingTags,0);
 // Opponents collect a fallen RED ally's tag to score BLUE point.
 const h2=harness();await h2.start('killConfirmed');
 const red2=h2.actors.find(a=>a.team==='RED'),blue2=h2.actors.find(a=>a.team==='BLUE');
 h2.api.updateLocalArena(.1);
 h2.context.lastUpdate.opts.onShot(blue2,red2,100,'SMG');
 assert.equal(h2.tags.length,1);
 blue2.group.position.copyFrom(h2.tags[0].position);
 h2.api.updateLocalArena(.1);
 assert.equal(h2.api.getLocalArenaSnapshot().state.opposition,1);
});
