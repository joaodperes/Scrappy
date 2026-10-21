const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../js/localArenaActors.js'),'utf8')
 .replace(/^import\s*\{[\s\S]*?\}\s*from\s*'[^']+';?\s*/gm,'')
 .replace(/^export\s+/gm,'')
 .replace(/import\.meta\.url/g,"'http://localhost/js/localArenaActors.js'");
class Vec {
 static Distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)}
 constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z}
 clone(){return new Vec(this.x,this.y,this.z)}
 add(b){return new Vec(this.x+b.x,this.y+b.y,this.z+b.z)}
 subtract(b){return new Vec(this.x-b.x,this.y-b.y,this.z-b.z)}
 scale(s){return new Vec(this.x*s,this.y*s,this.z*s)}
 scaleInPlace(s){this.x*=s;this.y*=s;this.z*=s;return this}
 length(){return Math.hypot(this.x,this.y,this.z)}
 set(x,y,z){this.x=x;this.y=y;this.z=z}
 copyFrom(p){this.set(p.x,p.y,p.z)}
}
function harness(blocked=false,options={}){
 const lines=[],navTargets=[];
 const B={Vector3:Vec,Ray:class{constructor(o,d,len){this.o=o;this.d=d;this.len=len}},
  MeshBuilder:{CreateLines:(id,opts)=>{const o={id,opts,dispose(){this.disposed=true}};lines.push(o);return o}},
  Color3:class{constructor(r,g,b){this.r=r;this.g=g;this.b=b}}};
 const scene={pickWithRay:()=>blocked?{hit:true,distance:.3}:null};
 const camera={position:new Vec(0,1.72,0)};
 const navPlugin={getClosestPoint:v=>new Vec(v.x,v.y-1,v.z)};
 const WDEFS={SMG:{id:'SMG',range:40,cd:.09,dmg:11,magSize:30},
  DMR:{id:'DMR',range:100,cd:.35,dmg:45,magSize:8},
  PISTOL:{id:'PISTOL',range:60,cd:.18,dmg:20,magSize:12},
  KNIFE:{id:'KNIFE',range:2.8,cd:.55,dmg:70},
 };
 const helper=new Function('window','scene','camera','navPlugin','WDEFS','botNavPath',
  'getWalkableSpawns','getCurrentMap','makeScaledWeaponModel','registerArenaTarget',
  'unregisterArenaTarget','rebuildMeshMap','setTimeout',source+'\nreturn {arenaTeamEnemy,updateArenaActors,setArenaActorWeapon,killArenaActor,respawnArenaActor,FALLBACK_PERSONAS};');
 const api=helper({BABYLON:B},scene,camera,navPlugin,WDEFS,
   (_,from,to)=>{
     navTargets.push(to.clone());
     return options.noRoute||to.x===options.unreachableTagX?null:
       {points:[from,to],length:Vec.Distance(from,to)};
   },()=>[[10,0,0]],()=> 'scrapyard',
   () => ({position:new Vec(),rotation:{y:0},getChildMeshes:()=>[],dispose(){}}),
   ()=>{},()=>{},()=>{},()=>{});
 const actor=(id,team,x,z,persona=api.FALLBACK_PERSONAS[0])=>({
  id,name:id,team,persona,weapon:persona.loadout.primary,
  group:{position:new Vec(x,0,z),rotation:{},setEnabled(v){this.enabled=v}},alive:true,hp:100,maxHp:100,
  targetId:null,walkClock:0,pathCursor:null,reaction:0,cooldown:0,reload:0,ammo:30
 });
 return {api,actor,lines,camera,navTargets};
}
test('TDM/confirmed teammates never count as enemies, FFA everyone else does',()=>{
 const h=harness(),red=h.actor('red','RED',2,0),ally=h.actor('ally','RED',3,0),
   blue=h.actor('blue','BLUE',9,0);
 for(const mode of ['tdm','killConfirmed']){
  assert.equal(h.api.arenaTeamEnemy(red,ally,mode),false);
  assert.equal(h.api.arenaTeamEnemy(red,blue,mode),true);
 }
 assert.equal(h.api.arenaTeamEnemy(red,ally,'ffa'),true);
 assert.equal(h.api.arenaTeamEnemy(red,red,'ffa'),false);
});
test('bot uses own configured firearm stats, magazine and visible attack tracer',()=>{
 const h=harness(),shooter=h.actor('shooter','BLUE',0,9),enemy=h.actor('enemy','RED',0,18);
 const shots=[];
 for(let i=0;i<100;i++){
  h.api.updateArenaActors([shooter,enemy],.1,'tdm',
    {humanAlive:false,onShot:(a,target,dmg,weapon)=>shots.push({a,target,dmg,weapon})});
 }
 assert.ok(shots.length>0);
 assert.ok(shots.some(s=>s.weapon==='SMG'&&s.dmg===11));
 assert.ok(shots.some(s=>s.weapon==='PISTOL'&&s.dmg===20));
 assert.ok(shots.every(s=>(s.weapon==='SMG'&&s.dmg===11)||
   (s.weapon==='PISTOL'&&s.dmg===20)));
 assert.ok(h.lines.length>0);
 h.api.setArenaActorWeapon(shooter,'DMR');
 assert.equal(shooter.weapon,'DMR');
 assert.equal(shooter.ammo,8);
});
test('blocked wall visibility prevents attacks and movement through solid meshes',()=>{
 const h=harness(true),shooter=h.actor('shooter','BLUE',0,5),enemy=h.actor('enemy','RED',0,8);
 let hits=0;
 for(let i=0;i<20;i++)h.api.updateArenaActors([shooter,enemy],.1,'tdm',
  {humanAlive:false,onShot:()=>hits++});
 assert.equal(hits,0);
 assert.equal(shooter.group.position.z,5);
});
test('Kill Confirmed bots prioritize nearby objective tags before shooting',()=>{
 const h=harness(),shooter=h.actor('shooter','BLUE',0,5),enemy=h.actor('enemy','RED',0,15);
 let fired=0;
 const tag={id:8,mesh:{position:new Vec(4,.65,6)}};
 for(let i=0;i<10;i++)h.api.updateArenaActors([shooter,enemy],.1,'killConfirmed',
   {humanAlive:false,objectives:[tag],onShot:()=>fired++});
 assert.equal(fired,0);
 assert.equal(shooter.targetId,'tag_8');
});

test('bot uses its real sidearm when primary runs empty but Gun Game cannot skip rungs',()=>{
 const h=harness();
 const a=h.actor('alpha','BLUE',2,8);
 a.ammo=0;
 h.api.updateArenaActors([a],.1,'ffa',{humanAlive:false});
 assert.equal(a.weapon,'PISTOL');
 assert.equal(a.ammo,12);
 const rung=h.actor('rung','BOT_1',3,9);
 rung.ammo=0;
 h.api.updateArenaActors([rung],.1,'gunGame',{humanAlive:false});
 assert.equal(rung.weapon,'SMG');
});

test('respawns restore primary magazine and clear previous-life DOT and navigation',()=>{
 const h=harness(),bot=h.actor('respawn','BLUE',4,6);
 bot.ammo=0;bot.reload=5;bot._dots=[{remaining:4,dmg:15}];
 bot._poisonDots=[{remaining:8,dps:2}];bot.pathCursor=new Vec(90,0,90);
 bot.targetId='old';bot.tagTargetId=4;bot.reaction=2;
 h.api.killArenaActor(bot);
 assert.equal(bot.alive,false);
 assert.deepEqual(bot._dots,[]);
 assert.deepEqual(bot._poisonDots,[]);
 assert.equal(h.api.respawnArenaActor(bot,new Vec(12,0,14)),true);
 assert.equal(bot.alive,true);
 assert.equal(bot.ammo,30);
 assert.equal(bot.reload,0);
 assert.equal(bot.reaction,0);
 assert.equal(bot.pathCursor,null);
 assert.equal(bot.tagTargetId,null);
 assert.equal(bot.group.position.x,12);
 assert.equal(bot.group.enabled,true);
});
test('unreachable navmesh segments never become direct bot movement',()=>{
 const h=harness(false,{noRoute:true});
 const bot=h.actor('blue','BLUE',0,5),enemy=h.actor('red','RED',0,30);
 for(let i=0;i<12;i++)
  h.api.updateArenaActors([bot,enemy],.1,'tdm',{humanAlive:false});
 assert.equal(bot.group.position.x,0);
 assert.equal(bot.group.position.z,5);
 assert.equal(bot.pathCursor,null);
});
test('Kill Confirmed favors reachable tags and projects tag targets onto their floor',()=>{
 const h=harness(false,{unreachableTagX:4});
 const bot=h.actor('blue','BLUE',0,5),enemy=h.actor('red','RED',0,20);
 const near={id:11,mesh:{position:new Vec(4,.65,6)}};
 const reachable={id:12,mesh:{position:new Vec(8,.65,6)}};
 h.api.updateArenaActors([bot,enemy],.1,'killConfirmed',
  {humanAlive:false,objectives:[near,reachable]});
 assert.equal(bot.targetId,'tag_12');
 assert.ok(h.navTargets.some(to=>to.x===8&&Math.abs(to.y)<.01));
 assert.ok(h.navTargets.every(to=>to.y>=-.01),'nav queries must not project tags below the floor');
});
