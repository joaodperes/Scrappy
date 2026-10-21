// Babylon client-side arena players: separate from Survival robot opponents.
// Each participant has a distinct player-like model, personality, real weapon
// definition, HP, team, targeting, collision-aware navigation and respawns.
import { scene,camera,navPlugin } from './scene.js';
import { getWalkableSpawns,getCurrentMap } from './mapManager.js';
import { botNavPath } from './botNavigation.js';
import { makeScaledWeaponModel,WDEFS } from './weapons.js';
import { registerArenaTarget,unregisterArenaTarget,rebuildMeshMap } from './enemies.js';
const B=window.BABYLON;
const valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const palette={RED:[0.77,0.23,0.16],BLUE:[0.17,0.48,0.87]};
let serial=0;
export const FALLBACK_PERSONAS=[
 {id:'vanguard',name:'Vanguard',aggression:.9,aim:.57,reactionMs:380,preferredRange:13,skin:'default',loadout:{primary:'SMG',secondary:'PISTOL'}},
 {id:'sentinel',name:'Sentinel',aggression:.34,aim:.73,reactionMs:530,preferredRange:24,skin:'forest',loadout:{primary:'DMR',secondary:'PISTOL'}},
 {id:'breacher',name:'Breacher',aggression:.88,aim:.48,reactionMs:310,preferredRange:7,skin:'oni',loadout:{primary:'SHOTGUN',secondary:'PISTOL'}},
 {id:'skirmisher',name:'Skirmisher',aggression:.65,aim:.61,reactionMs:290,preferredRange:17,skin:'ghost',loadout:{primary:'COMET',secondary:'PISTOL'}},
 {id:'tracker',name:'Tracker',aggression:.4,aim:.80,reactionMs:670,preferredRange:34,skin:'void',loadout:{primary:'RAILGUN',secondary:'PISTOL'}},
 {id:'sparker',name:'Sparker',aggression:.56,aim:.60,reactionMs:440,preferredRange:19,skin:'default',loadout:{primary:'ELECTRON',secondary:'PISTOL'}},
];
export async function fetchArenaPersonas(){
 try{
  const response=await fetch(new URL('../assets/bot-personalities.json',import.meta.url));
  if(!response.ok)throw Error('Bot personas not found');
  const json=await response.json();
  if(!Array.isArray(json.personalities)||json.personalities.length<5)throw Error('Missing personas');
  return json.personalities;
 }catch(err){console.warn('[arena] Persona JSON unavailable; using bundled fallback',err);return FALLBACK_PERSONAS}
}
function appearance(id,team,skin,displayName){
 const g=new B.TransformNode('arena_'+id,scene);
 const base=palette[team]||palette.BLUE;
 const tint=skin==='forest'?[.37,.51,.25]:skin==='ghost'?[.67,.75,.78]:skin==='void'?[.31,.28,.50]:skin==='oni'?[.78,.32,.24]:base;
 const uniform=new B.StandardMaterial('arena_uniform_'+id,scene);
 uniform.diffuseColor=new B.Color3(...tint);
 const armor=new B.StandardMaterial('arena_armor_'+id,scene);
 armor.diffuseColor=new B.Color3(.16,.19,.22);
 const visor=new B.StandardMaterial('arena_visor_'+id,scene);
 visor.emissiveColor=new B.Color3(...base);
 const mats=[uniform,armor,visor];
 const cube=(name,w,h,d,x,y,z,mat,pickable=true)=>{
   const mesh=B.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);
   mesh.parent=g;mesh.position.set(x,y,z);mesh.material=mat;
   mesh.isPickable=pickable;mesh.checkCollisions=false;
   mesh.metadata={arenaActorId:id,enemy:true};
   return mesh;
 };
 cube('arena_torso_'+id,.61,.85,.36,0,1.18,0,uniform);
 cube('arena_vest_'+id,.64,.53,.43,0,1.3,.01,armor);
 cube('arena_head_'+id,.39,.42,.38,0,1.89,0,uniform);
 cube('arena_visor_'+id,.32,.13,.055,0,1.9,.22,visor);
 for(const sign of [-1,1]){
  cube('arena_arm_'+id+'_'+sign,.19,.74,.2,sign*.46,1.25,0,uniform);
  cube('arena_leg_'+id+'_'+sign,.22,.83,.24,sign*.2,.45,0,armor);
 }
 const namePlane=B.MeshBuilder.CreatePlane('arena_name_'+id,{width:1.1,height:.25},scene);
 namePlane.parent=g;namePlane.position.y=2.37;namePlane.isPickable=false;
 namePlane.billboardMode=B.Mesh.BILLBOARDMODE_ALL;
 const label=new B.DynamicTexture('arena_name_tex_'+id,{width:256,height:64},scene,false);
 const canvas=label.getContext();canvas.clearRect(0,0,256,64);
 canvas.fillStyle='#101810';canvas.fillRect(0,0,256,64);
 canvas.font='bold 26px monospace';canvas.textAlign='center';canvas.textBaseline='middle';
 canvas.fillStyle=team==='RED'?'#ff9c8e':'#9ccaff';
 canvas.fillText(String(displayName||id).slice(0,15),128,32);label.update();
 const nm=new B.StandardMaterial('arena_name_mat_'+id,scene);
 nm.diffuseTexture=label;nm.useAlphaFromDiffuseTexture=true;
 nm.emissiveColor=B.Color3.White();nm.disableLighting=true;
 namePlane.material=nm;mats.push(nm);
 return {group:g,mats,label};
}
function gunVisual(actor,weapon){
 if(actor.gunModel){actor.gunModel.dispose(false,false);actor.gunModel=null}
 if(!WDEFS[weapon])return;
 const gun=makeScaledWeaponModel(weapon,0.55);
 gun.parent=actor.group;gun.position.set(.47,1.25,.38);gun.rotation.y=0;
 gun.getChildMeshes().forEach(m=>{m.isPickable=false;m.checkCollisions=false});
 actor.gunModel=gun;
}
export function setArenaActorWeapon(actor,weapon){
 const id=WDEFS[weapon]?weapon:'PISTOL';
 if(actor.weapon===id&&actor.gunModel)return;
 actor.weapon=id;actor.ammo=Math.max(1,WDEFS[id].magSize||30);
 actor.reload=0;gunVisual(actor,id);
}
export function chooseArenaSpawn(existing=[],playerPosition=camera.position){
 const spawns=getWalkableSpawns(getCurrentMap());
 const options=spawns.filter(p=>Array.isArray(p)&&p.length>=3&&p.every(Number.isFinite));
 const score=p=>{
   const a=Math.hypot(p[0]-playerPosition.x,p[2]-playerPosition.z);
   const separation=existing.reduce((d,bot)=>bot.alive?Math.min(d,Math.hypot(p[0]-bot.group.position.x,p[2]-bot.group.position.z)):d,100);
   return Math.min(a,25)+Math.min(separation,12)*2+Math.random()*5;
 };
 const best=options.map(p=>({p,value:score(p)})).sort((a,b)=>b.value-a.value)[0]?.p;
 if(!best)return null;
 const query=new B.Vector3(best[0],best[1]+1,best[2]);
 let nav=null;try{nav=navPlugin.getClosestPoint(query)}catch{}
 const y=nav&&valid(nav)&&Math.abs(nav.y-query.y)>.02?nav.y:best[1];
 return new B.Vector3(best[0],y,best[2]);
}
export function createArenaActor(persona,team,spawn,index){
 if(!valid(spawn))return null;
 const id='arena_'+(++serial);
 const {group,mats,label}=appearance(id,team,persona.skin,persona.name);
 group.position.copyFrom(spawn);
 const actor={id,name:persona.name,persona,team,group,mats,label,alive:true,
  hp:100,maxHp:100,arenaActor:true,weapon:null,gunModel:null,
  score:0,kills:0,deaths:0,cooldown:.8+index*.13,reload:0,ammo:0,
  respawnIn:0,targetId:null,reaction:0,walkClock:0,pathCursor:null};
 setArenaActorWeapon(actor,persona.loadout?.primary||'PISTOL');
 registerArenaTarget(actor);
 return actor;
}
export function killArenaActor(actor){
 if(!actor.alive)return;
 actor.alive=false;actor.hp=0;actor.deaths++;
 actor.respawnIn=5;actor.targetId=null;
 actor.group.setEnabled(false);
 rebuildMeshMap();
}
export function respawnArenaActor(actor,spawn){
 if(!valid(spawn))return false;
 actor.group.position.copyFrom(spawn);actor.group.setEnabled(true);
 actor.hp=actor.maxHp;actor.alive=true;
 actor.cooldown=.75;actor.reload=0;actor.respawnIn=0;actor.targetId=null;
 rebuildMeshMap();
 return true;
}
export function destroyArenaActors(actors){
 for(const actor of actors){
  unregisterArenaTarget(actor);
  actor.gunModel?.dispose(false,false);
  actor.group.getChildMeshes().forEach(m=>m.dispose());
  actor.group.dispose();
  actor.label?.dispose();
  for(const mat of actor.mats)mat.dispose();
 }
}
export function arenaTeamEnemy(a,b,mode){
 if(!a||!b||a.id===b.id||b.alive===false)return false;
 return !['tdm','killConfirmed'].includes(mode)||a.team!==b.team;
}
function unobstructed(a,b){
 const delta=b.subtract(a),len=delta.length();
 if(len<.01)return true;
 const hit=scene.pickWithRay(new B.Ray(a,delta.scale(1/len),len),
   m=>m.isEnabled()&&m.checkCollisions&&!m.metadata?.arenaActorId&&!m.metadata?.enemy);
 return !hit?.hit||hit.distance>=len-.35;
}
function pickTarget(actor,actors,mode,humanAlive){
 const targets=actors.filter(other=>arenaTeamEnemy(actor,other,mode)).map(a=>({
  id:a.id,actor:a,point:a.group.position.add(new B.Vector3(0,1.45,0))
 }));
 if(humanAlive&&(!['tdm','killConfirmed'].includes(mode)||actor.team!=='RED'))
   targets.push({id:'human',actor:null,point:camera.position.clone()});
 const me=actor.group.position.add(new B.Vector3(0,1.52,0));
 let found=null,closest=Infinity;
 for(const t of targets){
  const d=B.Vector3.Distance(me,t.point);
  if(d>120)continue;
  const visible=unobstructed(me,t.point);
  const weight=d+(visible?0:125)+(actor.targetId===t.id?-4:0);
  if(weight<closest){closest=weight;found={...t,visible,distance:d}}
 }
 return found;
}
export function updateArenaActors(actors,dt,mode,{humanAlive=true,onShot,onRespawn,objectives=[]}={}){
 for(const a of actors){
  if(!a.alive){a.respawnIn-=dt;if(a.respawnIn<=0)onRespawn?.(a);continue}
  a.cooldown=Math.max(0,a.cooldown-dt);
  a.reload=Math.max(0,a.reload-dt);
  // A non-Gun-Game bot has the same primary/sidearm distinction as a
  // human loadout. Switch to its equipped Pistol when the primary magazine
  // runs empty; Gun Game must never bypass its current ladder weapon.
  if(mode!=='gunGame'&&a.ammo<=0&&
      a.weapon===a.persona.loadout?.primary&&
      WDEFS[a.persona.loadout?.secondary]&&
      a.persona.loadout.secondary!==a.weapon){
    setArenaActorWeapon(a,a.persona.loadout.secondary);
  }
  const goal=mode==='killConfirmed'?objectives.filter(o=>o&&o.mesh&&!o.mesh.isDisposed?.())
    .map(o=>({tag:o,d:B.Vector3.Distance(a.group.position,o.mesh.position)}))
    .filter(o=>o.d<32).sort((x,y)=>x.d-y.d)[0]:null;
  const target=goal?{id:'tag_'+goal.tag.id,actor:null,point:goal.tag.mesh.position.clone(),visible:true,distance:goal.d,objective:true}:
    pickTarget(a,actors,mode,humanAlive);
  if(!target){a.targetId=null;continue}
  if(a.targetId!==target.id){a.targetId=target.id;a.reaction=(a.persona.reactionMs||450)/1000}
  a.reaction=Math.max(0,a.reaction-dt);
  const own=a.group.position,targetPos=target.point;
  const dx=targetPos.x-own.x,dz=targetPos.z-own.z;
  const flat=Math.hypot(dx,dz);
  if(flat>.01)a.group.rotation.y=Math.atan2(dx,dz);
  const preferred=target.objective?1.1:a.weapon==='KNIFE'?1.7:(a.persona.preferredRange||14);
  const near=flat<preferred*.65,far=flat>preferred*1.15;
  a.walkClock-=dt;
  if(a.walkClock<=0||!a.pathCursor){
   const feet=new B.Vector3(own.x,own.y,own.z);
   const targetFeet=new B.Vector3(targetPos.x,targetPos.y-1.55,targetPos.z);
   let route=null;try{route=botNavPath(navPlugin,feet,targetFeet)}catch{}
   a.pathCursor=route?.points?.[1]||(!target.visible?null:targetFeet);
   a.walkClock=.4+Math.random()*.25;
  }
  if(near||far||!target.visible||(!target.objective&&flat>1.5)){
   const navGoal=a.pathCursor;
   if(navGoal&&valid(navGoal)){
    const off=new B.Vector3(navGoal.x-own.x,0,navGoal.z-own.z);
    if(near&&target.visible)off.scaleInPlace(-1);
    else if(!far&&target.visible&&!target.objective){
      // Flank/strafe at a comfortable weapon range, but still use the same
      // navmesh and solid-geometry checks as chasing/retreating.
      const side=((a.id.length+a.name.length)%2)?1:-1;
      off.set(side*(targetPos.z-own.z),0,-side*(targetPos.x-own.x));
    }
    const d=off.length();
    if(d>.25){
     off.scaleInPlace(1/d);
     const travel=clamp((2.3+(a.persona.aggression||.5)*2)*dt,0,.22);
     const origin=new B.Vector3(own.x,own.y+1.1,own.z);
     const wall=scene.pickWithRay(new B.Ray(origin,off,travel+.6),
      m=>m.isEnabled()&&m.checkCollisions&&!m.metadata?.enemy&&!m.metadata?.arenaActorId);
     if(!wall?.hit){
      const dest=own.add(off.scale(travel));
      let snapped=null;try{snapped=navPlugin.getClosestPoint(new B.Vector3(dest.x,dest.y+1,dest.z))}catch{}
      if(snapped&&valid(snapped)){
       const nextY=Math.abs(snapped.y-(dest.y+1))<.02?dest.y:snapped.y;
       if(Math.abs(nextY-own.y)<1.15)own.set(snapped.x,nextY,snapped.z);
      }
     }
    }
   }
  }
  const spec=WDEFS[a.weapon]||WDEFS.PISTOL;
  if(target.objective||a.reload>0||a.reaction>0||a.cooldown>0||!target.visible)continue;
  const distance=B.Vector3.Distance(own.add(new B.Vector3(0,1.5,0)),targetPos);
  if(distance>(spec.range||55)||distance>110)continue;
  if(a.ammo<=0){a.reload=Math.max(.7,spec.reloadTime||1.4);a.ammo=Math.max(1,spec.magSize||30);continue}
  a.ammo--;a.cooldown=Math.max(.16,(spec.cd||.35)*(1.3-(a.persona.aggression||.5)*.3));
  const chance=clamp(.34+(a.persona.aim||.6)*.65-distance*.004,.12,.9);
  if(Math.random()>chance)continue;
  const raw=spec.dmg*(a.weapon==='SHOTGUN'?.75:1);
  const dmg=clamp(raw,1,110);
  const muzzle=own.add(new B.Vector3(0,1.45,0));
  const tracer=B.MeshBuilder.CreateLines('arena_fire_'+a.id,
    {points:[muzzle,targetPos]},scene);
  tracer.isPickable=false;
  tracer.color=a.team==='RED'
    ?new B.Color3(1,.40,.27):new B.Color3(.27,.68,1);
  setTimeout(()=>{if(!tracer.isDisposed?.())tracer.dispose()},110);
  onShot?.(a,target.actor,dmg,a.weapon,targetPos.clone());
 }
}
