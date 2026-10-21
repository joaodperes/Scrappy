// Babylon client-side arena players: separate from Survival robot opponents.
// Each participant has a distinct player-like model, personality, real weapon
// definition, HP, team, targeting, collision-aware navigation and respawns.
import { scene,camera,navPlugin } from './scene.js';
import { getWalkableSpawns,getCurrentMap,getMapMeta } from './mapManager.js';
import { botNavPath,botTravelTarget } from './botNavigation.js';
import { jumpPads } from './level.js';
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
 actor.weapon=id;
 actor.ammo=WDEFS[id].useHeat?Infinity:Math.max(1,WDEFS[id].magSize||30);
 actor.heat=0;actor.reload=0;gunVisual(actor,id);
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
  respawnIn:0,targetId:null,reaction:0,walkClock:0,pathCursor:null,
  pathPoints:null,walkPhase:0,recoil:0,
  _floorY:spawn.y,_hopY:0,_yVel:0,_padCooldown:0,_navTransition:null,
  _navRepath:0,_navTarget:null,_onPlatform:null,_lastPlatformPos:null,
  limbs:{arms:group.getChildMeshes().filter(m=>m.name.startsWith('arena_arm_')),
    legs:group.getChildMeshes().filter(m=>m.name.startsWith('arena_leg_'))}};
 setArenaActorWeapon(actor,persona.loadout?.primary||'PISTOL');
 registerArenaTarget(actor);
 return actor;
}
export function killArenaActor(actor){
 if(!actor.alive)return;
 actor.alive=false;actor.hp=0;actor.deaths++;
 actor.respawnIn=5;actor.targetId=null;
 // A new life cannot inherit old fire/poison or stale path decisions.
 actor._dots=[];actor._poisonDots=[];
 actor.pathCursor=null;actor.pathPoints=null;actor.walkClock=0;actor.tagTargetId=null;actor.tagScanClock=0;
 actor.group.setEnabled(false);
 rebuildMeshMap();
}
export function respawnArenaActor(actor,spawn){
 if(!valid(spawn))return false;
 actor.group.position.copyFrom(spawn);actor.group.setEnabled(true);
 actor._floorY=spawn.y;actor._hopY=0;actor._yVel=0;
 actor._padCooldown=0;actor._navTransition=null;actor._navRepath=0;
 actor._navTarget=null;actor._onPlatform=null;actor._lastPlatformPos=null;
 actor.hp=actor.maxHp;actor.alive=true;
 actor.cooldown=.75;actor.reload=0;actor.respawnIn=0;actor.targetId=null;
 // setArenaActorWeapon is intentionally a no-op when the model already holds
 // that weapon. Reload it explicitly on respawn, including Gun Game rungs.
 const spec=WDEFS[actor.weapon]||WDEFS.PISTOL;
 actor.ammo=spec.useHeat?Infinity:Math.max(1,spec.magSize||30);
 actor.heat=0;actor.recoil=0;actor.walkPhase=0;
 for(const limb of [...(actor.limbs?.arms||[]),...(actor.limbs?.legs||[])])limb.rotation.x=0;
 actor._dots=[];actor._poisonDots=[];
 actor.pathCursor=null;actor.pathPoints=null;actor.walkClock=0;actor.reaction=0;
 actor.tagTargetId=null;actor.tagScanClock=0;
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
function reachableArenaTag(actor,objectives,dt){
 if(!objectives.length){actor.tagTargetId=null;return null}
 actor.tagScanClock=(actor.tagScanClock||0)-dt;
 const available=objectives.filter(tag=>tag?.mesh&&!tag.mesh.isDisposed?.());
 const current=available.find(tag=>tag.id===actor.tagTargetId);
 if(current&&actor.tagScanClock>0)return current;
 // Recast paths may wind around cover or between floors; straight-line
 // distance can favor an unreachable tag and strand a bot for its lifetime.
 // Cache scans briefly rather than requesting multiple Recast paths per frame.
 actor.tagScanClock=.4+Math.random()*.15;
 const feet=actor.group.position;
 let best=null,bestLength=Infinity;
 for(const tag of available){
  const dest=tag.mesh.position;
  const end=new B.Vector3(dest.x,dest.y-.65,dest.z);
  if(B.Vector3.Distance(feet,end)>32)continue;
  let path=null;
  try{path=botNavPath(navPlugin,feet,end)}catch{}
  if(!path)continue;
  const length=Number.isFinite(path.length)?path.length:B.Vector3.Distance(feet,end);
  if(length<bestLength){bestLength=length;best=tag}
 }
 actor.tagTargetId=best?.id??null;
 return best;
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
export function updateArenaActors(actors,dt,mode,
 {humanAlive=true,onShot,onRespawn,objectives=[],isMatchActive=()=>true}={}){
 if(!Number.isFinite(dt)||dt<=0)return;
 for(const a of actors){
  // The final elimination may dispose the actor meshes from onShot.
  if(!isMatchActive())break;
  if(!a.alive){a.respawnIn-=dt;if(a.respawnIn<=0)onRespawn?.(a);continue}
  // Carry a rider by the same moving-platform transform as Survival bots.
  if(a._onPlatform){
   const now=a._onPlatform.position;
   const delta=now.subtract(a._lastPlatformPos||now);
   a.group.position.addInPlace(delta);
   a._floorY+=delta.y;
   a._lastPlatformPos=now.clone();
  }
  // Ballistic pad launches honor each map's gravity and preserve the floor
  // the actor actually launched from until landing on Recast geometry.
  if(a._hopY>0||a._yVel>0){
   a._yVel-=35*(getMapMeta(getCurrentMap())?.gravityMult||1)*dt;
   a._hopY+=a._yVel*dt;
   const air=new B.Vector3((a._airVX||0)*dt,0,(a._airVZ||0)*dt);
   if(air.lengthSquared()>0){
    const dir=air.clone().normalize();
    const collision=scene.pickWithRay(new B.Ray(
      a.group.position.add(new B.Vector3(0,1.2,0)),dir,air.length()+.5),
      m=>m.isEnabled()&&m.checkCollisions&&!m.metadata?.arenaActorId&&!m.metadata?.enemy);
    if(!collision?.hit){
     a.group.position.x+=air.x;a.group.position.z+=air.z;
    }
   }
   // Descending actors can land on a HIGHER platform before returning to
   // the launch floor; check solid top surfaces, not a fixed takeoff height.
   if(a._yVel<=0&&a._hopY>0){
    const altitude=a._floorY+a._hopY;
    const ground=scene.pickWithRay(new B.Ray(
      new B.Vector3(a.group.position.x,altitude+.45,a.group.position.z),
      new B.Vector3(0,-1,0),.8),
      m=>m.isEnabled()&&m.checkCollisions&&!m.metadata?.arenaActorId&&!m.metadata?.enemy);
    if(ground?.hit&&ground.pickedPoint?.y>a._floorY+1&&
       ground.pickedPoint.y<=altitude+.2){
      a._floorY=ground.pickedPoint.y;
      a._hopY=0;a._yVel=0;
    }
   }
   if(a._hopY<=0){
    a._hopY=0;a._yVel=0;a._airVX=0;a._airVZ=0;
    let landing=null;
    try{landing=navPlugin.getClosestPoint(a.group.position)}catch{}
    if(landing&&valid(landing)&&Math.abs(landing.y-a._floorY)<9)a._floorY=landing.y;
   }
   a.group.position.y=a._floorY+a._hopY;
  }
  a.cooldown=Math.max(0,a.cooldown-dt);
  a.recoil=Math.max(0,(a.recoil||0)-dt*4);
  if(a.gunModel)a.gunModel.position.z=.38-(a.recoil||0)*.15;
  a.reload=Math.max(0,a.reload-dt);
  const held=WDEFS[a.weapon]||WDEFS.PISTOL;
  if(held.useHeat)
    a.heat=Math.max(0,(a.heat||0)-Math.max(0,held.coolRate||0)*dt);
  // A non-Gun-Game bot has the same primary/sidearm distinction as a
  // human loadout. Switch to its equipped Pistol when the primary magazine
  // runs empty; Gun Game must never bypass its current ladder weapon.
  if(mode!=='gunGame'&&a.ammo<=0&&
      a.weapon===a.persona.loadout?.primary&&
      WDEFS[a.persona.loadout?.secondary]&&
      a.persona.loadout.secondary!==a.weapon){
    setArenaActorWeapon(a,a.persona.loadout.secondary);
  }else if(mode!=='gunGame'&&a.ammo<=0&&
      a.weapon===a.persona.loadout?.secondary&&
      WDEFS[a.persona.loadout?.primary]&&
      a.persona.loadout.primary!==a.weapon){
    // After the sidearm is exhausted, rearm the primary instead of remaining
    // on a permanently refilling Pistol for the rest of the match.
    const primary=a.persona.loadout.primary;
    setArenaActorWeapon(a,primary);
    a.reload=Math.max(.7,WDEFS[primary].reloadTime||1.4);
  }
  const goal=mode==='killConfirmed'?reachableArenaTag(a,objectives,dt):null;
  const target=goal?{id:'tag_'+goal.id,actor:null,point:goal.mesh.position.clone(),visible:true,
    distance:B.Vector3.Distance(a.group.position,goal.mesh.position),objective:true}:
    pickTarget(a,actors,mode,humanAlive);
  if(!target){a.targetId=null;continue}
  if(a.targetId!==target.id){a.targetId=target.id;a.reaction=(a.persona.reactionMs||450)/1000;
   a.pathPoints=null;a.pathCursor=null;a.walkClock=0;}
  a.reaction=Math.max(0,a.reaction-dt);
  const own=a.group.position,targetPos=target.point;
  const previous=own.clone();
  const dx=targetPos.x-own.x,dz=targetPos.z-own.z;
  const flat=Math.hypot(dx,dz);
  if(flat>.01)a.group.rotation.y=Math.atan2(dx,dz);
  const preferred=target.objective?1.1:a.weapon==='KNIFE'?1.7:(a.persona.preferredRange||14);
  const near=flat<preferred*.65,far=flat>preferred*1.15;
  // Recast alone cannot route via jump pads or lifts; request an explicit
  // transition destination only when static geometry cannot connect floors.
  let transitionTarget=null;
  const targetFeet=new B.Vector3(targetPos.x,
    targetPos.y-(target.objective?.65:1.55),targetPos.z);
  if(a._hopY<=0)try{transitionTarget=botTravelTarget(a,targetFeet,navPlugin,jumpPads,
    window._movingPlatforms||[],dt)}catch{}
  const travelTarget=transitionTarget||targetFeet;
  a.walkClock-=dt;
  if(a.walkClock<=0||!a.pathCursor){
   const feet=new B.Vector3(own.x,a._floorY,own.z);
   let route=null;try{route=travelTarget&&botNavPath(navPlugin,feet,travelTarget)}catch{}
   // Persist all returned Recast waypoints; a single [1] target can cause
   // looping at ramp bends and never advance to upper-floor corridors.
   a.pathPoints=route?.points?.slice(1)||[];
   a.pathCursor=a.pathPoints.find(p=>valid(p)&&
     B.Vector3.Distance(p,own)>.65)||null;
   a.walkClock=.4+Math.random()*.25;
  }
  if(!a._onPlatform&&a._hopY<=0&&
     (near||far||!target.visible||(!target.objective&&flat>1.5))){
   if(a.pathCursor&&B.Vector3.Distance(a.pathCursor,own)<.85){
    a.pathPoints?.shift();
    a.pathCursor=a.pathPoints?.[0]||null;
   }
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
  // Walking onto an active jump pad triggers real ballistic travel.
  if(a._hopY<=0&&!a._onPlatform&&(a._padCooldown||0)<=0){
   for(const pad of jumpPads){
    if(Math.hypot(own.x-pad.pos.x,own.z-pad.pos.z)<1.5&&
       Math.abs(a._floorY-pad.pos.y)<1.5){
      a._yVel=pad.force;a._hopY=.01;a._airVX=pad.thrustX||0;
      a._airVZ=pad.thrustZ||0;a._padCooldown=2;
      a._navTransition=null;a._navRepath=0;a.pathCursor=null;
      break;
    }
   }
  }
  // Lightweight walk cycle: limbs move only when the navmesh step succeeds.
  const movement=Math.hypot(own.x-previous.x,own.z-previous.z);
  a.walkPhase=(a.walkPhase||0)+movement*6.5;
  const swing=movement>.005?Math.min(.42,movement/Math.max(dt,.01)*.10):0;
  for(const [index,leg] of (a.limbs?.legs||[]).entries())
   leg.rotation.x=Math.sin(a.walkPhase+index*Math.PI)*swing;
  for(const [index,arm] of (a.limbs?.arms||[]).entries())
   arm.rotation.x=-Math.sin(a.walkPhase+index*Math.PI)*swing*.65;
  const spec=WDEFS[a.weapon]||WDEFS.PISTOL;
  if(target.objective||a.reload>0||a.reaction>0||a.cooldown>0||!target.visible)continue;
  const distance=B.Vector3.Distance(own.add(new B.Vector3(0,1.5,0)),targetPos);
  if(distance>(spec.range||55)||distance>110)continue;
  if(a.ammo<=0){
    a.reload=Math.max(.7,spec.reloadTime||1.4);
    a.ammo=Math.max(1,spec.magSize||30);
    continue;
  }
  // Heat weapons have no magazine. Convert WDEFS' fractional heat-per-shot
  // into its maxHeat scale, and let coolRate dissipate it over real time.
  if(spec.useHeat){
    const maxHeat=spec.maxHeat||100;
    const cost=(spec.heatPerShot||0)*maxHeat;
    if((a.heat||0)+cost>maxHeat+1e-6)continue;
    a.heat=(a.heat||0)+cost;
  }
  // COMET and other burst guns spend the correct number of rounds per
  // trigger, and approximate their grouped impacts as one scored hit.
  const rounds=spec.useHeat?1:Math.min(a.ammo,Math.max(1,spec.burstCount||1));
  if(!spec.useHeat)a.ammo-=rounds;
  a.recoil=1;
  a.cooldown=Math.max(.08,(spec.cd||.35)*(1.3-(a.persona.aggression||.5)*.3));
  const chance=clamp(.34+(a.persona.aim||.6)*.65-distance*.004,.12,.9);
  const hit=Math.random()<=chance;
  const endpoint=hit?targetPos:targetPos.add(new B.Vector3(
    (Math.random()-.5)*3,(Math.random()-.5)*1.2,(Math.random()-.5)*3));
  // Missed fire is still visible: do not render a tracer only on damage.
  const muzzle=own.add(new B.Vector3(0,1.45,0));
  const tracer=B.MeshBuilder.CreateLines('arena_fire_'+a.id,
    {points:[muzzle,endpoint]},scene);
  tracer.isPickable=false;
  tracer.color=a.team==='RED'
    ?new B.Color3(1,.40,.27):new B.Color3(.27,.68,1);
  setTimeout(()=>{if(!tracer.isDisposed?.())tracer.dispose()},110);
  if(!hit)continue;
  const pelletFactor=a.weapon==='SHOTGUN'
    ?clamp(2.5-distance/Math.max(1,spec.range||25)*1.5,1,2.5):1;
  const raw=(Number.isFinite(spec.dmg)?spec.dmg:0)*rounds*pelletFactor;
  const dmg=clamp(raw,1,110);
  onShot?.(a,target.actor,dmg,a.weapon,targetPos.clone());
 }
}
