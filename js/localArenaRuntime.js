// Offline player-shaped arena opponents: no socket, Firebase changes or
// Survival robots. All actors own individual teams, weapons, health and AI.
import {createLocalArena,localArenaKill,localArenaBotKill,localArenaTag,
  localArenaBotTag,localArenaTagExpired,localArenaDeath,tickLocalArena} from './localArenaRules.js';
import {scene,camera} from './scene.js';
import {inventory,setWeapon,setActiveSlot,curWep,WDEFS} from './weapons.js';
import {rebuildMeshMap} from './enemies.js';
import {awardXp,recordKill,recordDamage} from './progression.js';
import {resolveKillAttribution} from './killAttribution.js';
import {fetchArenaPersonas,createArenaActor,destroyArenaActors,
  chooseArenaSpawn,setArenaActorWeapon,killArenaActor,respawnArenaActor,
  updateArenaActors,getArenaActorWeaponSpec} from './localArenaActors.js';
const BABYLON=window.BABYLON;
let active=null,hud=null,tags=[],generation=0,tagSerial=0;
const LABELS={ffa:'FREE FOR ALL',tdm:'TEAM DEATHMATCH',gunGame:'GUN GAME',killConfirmed:'KILL CONFIRMED'};
const isActive=()=>active&&!active.finished;
function clearProjectiles(){
 if(!active?.projectiles)return;
 for(const p of active.projectiles){p.mesh?.dispose();p.mat?.dispose()}
 active.projectiles.length=0;
}
function clearTags(){
 for(const tag of tags){tag.mesh.dispose();tag.mat.dispose()}
 tags=[];
}
function removeTag(i){
 const tag=tags[i];if(!tag)return;
 tag.mesh.dispose();tag.mat.dispose();tags.splice(i,1);
}
function showHud(note=''){
 if(!isActive())return;
 if(!hud){
  hud=document.createElement('div');hud.id='localArenaHud';
  hud.style.cssText='position:fixed;top:56px;left:50%;transform:translateX(-50%);pointer-events:none;z-index:40;padding:10px 22px;border:1px solid #a4d539;border-radius:5px;color:#e3ffb8;background:#0c170ddd;text-align:center;font:700 15px monospace;text-shadow:0 1px #000';
  document.body.appendChild(hud);
 }
 const s=active.state;
 const current=s.mode==='gunGame'?' · NEXT '+s.gunOrder[s.gunIndex]:
   s.mode==='killConfirmed'?' · TAGS '+s.pendingTags:'';
 const board=active.actors
   .map(a=>({label:a.name+(s.mode==='tdm'||s.mode==='killConfirmed'?' ['+a.team+']':''),
     score:s.mode==='gunGame'?(s.botGuns[a.id]||0):
       s.mode==='killConfirmed'?(s.botScores[a.id]||0):(s.botScores[a.id]||a.kills),
     alive:a.alive}))
   .sort((a,b)=>b.score-a.score)
   .map(a=>a.label+' '+a.score+(a.alive?'':' ✝')).join('   ');
 hud.style.whiteSpace='pre-line';
 hud.textContent=(LABELS[s.mode]||s.mode)+' · '+s.score+' : '+s.opposition+
   ' · '+Math.ceil(s.secondsLeft)+'s'+current+(note?' · '+note:'')+
   (board?'\n'+board:'')+
   ((active.feed||[]).length?'\n'+active.feed.filter(e=>e.until>Date.now()).map(e=>e.label).join('   |   '):'');
 hud.title='Arena standings (team and player scores)';
}
function createTag(position,ownerTeam,ownerId){
 if(!isActive())return;
 const mesh=BABYLON.MeshBuilder.CreateCylinder('arena_tag_'+(++tagSerial),
   {diameter:.54,height:.13,tessellation:8},scene);
 const mat=new BABYLON.StandardMaterial('arena_tag_material_'+tagSerial,scene);
 mat.emissiveColor=ownerTeam==='RED'
   ?new BABYLON.Color3(1,.28,.17):new BABYLON.Color3(.14,.70,1);
 mat.disableLighting=true;mesh.material=mat;
 mesh.isPickable=false;mesh.checkCollisions=false;
 mesh.position.copyFrom(position);mesh.position.y+=.65;
 tags.push({id:tagSerial,mesh,mat,ownerTeam,ownerId,lifetime:18});
}
function equipment(cfg){
 if(cfg.mode==='gunGame'){
  inventory[0]='PISTOL';inventory[1]=null;inventory[2]=null;
 }else{
  const p=cfg.loadout||{primary:'SMG',secondary:'SHOTGUN'};
  inventory[0]=WDEFS[p.primary]?p.primary:'SMG';
  inventory[1]=WDEFS[p.secondary]&&p.secondary!==inventory[0]?p.secondary:'SHOTGUN';
  inventory[2]='PISTOL';
 }
 setActiveSlot(0);setWeapon(inventory[0]);
}
export function isLocalArenaActive(){return !!isActive()}
// Read-only diagnostic snapshot for local HUD tests and browser debugging.
export function getLocalArenaSnapshot(){
 if(!isActive())return null;
 return {state:{...active.state,botScores:{...active.state.botScores},botGuns:{...active.state.botGuns}},
   actors:active.actors.map(a=>({id:a.id,name:a.name,team:a.team,weapon:a.weapon,
     alive:a.alive,hp:a.hp,kills:a.kills,deaths:a.deaths}))};
}
export function startLocalArena(cfg,onFinish,onPlayerHit=()=>{}){
 stopLocalArena();
 const state=createLocalArena({mode:cfg.mode,duration:cfg.duration,
   scoreLimit:cfg.scoreLimit,seed:cfg.seed});
 const token=++generation;
 active={state,onFinish,onPlayerHit,actors:[],finished:false,playerDead:false,
   lastAttacker:null,spawned:false,feed:[],burns:[],projectiles:[]};
 equipment(cfg);
 showHud('DEPLOYING AI PLAYERS');
 fetchArenaPersonas().then(personas=>{
   if(!isActive()||generation!==token)return;
   for(let i=0;i<5;i++){
     const teamMode=state.mode==='tdm'||state.mode==='killConfirmed';
     const allies=teamMode&&i<2;
     const team=teamMode?(allies?'RED':'BLUE'):'BOT_'+i;
     const spawn=chooseArenaSpawn(active.actors);
     if(!spawn)continue;
     const offset=((cfg.seed>>>0)||0)%personas.length;
     const persona=personas[(i+offset)%personas.length];
     const actor=createArenaActor(persona,team,spawn,i);
     if(!actor)continue;
     if(state.mode==='gunGame')setArenaActorWeapon(actor,state.gunOrder[0]);
     active.actors.push(actor);
   }
   active.spawned=true;showHud('AI READY');
 }).catch(err=>console.error('[arena] Failed to deploy bots',err));
}
export function stopLocalArena(){
 generation++;
 if(hud){hud.remove();hud=null}
 clearTags();
 clearProjectiles();
 if(active?.actors.length)destroyArenaActors(active.actors);
 active=null;
}
function finish(){
 if(!isActive())return;
 active.finished=true;
 const {onFinish,state}=active;
 const participants=active.actors.map(a=>({
   id:a.id,name:a.name,team:a.team,kills:a.kills,deaths:a.deaths,
   score:state.botScores[a.id]||0
 })).sort((a,b)=>b.score-a.score||b.kills-a.kills);
 stopLocalArena();
 onFinish?.({...state,participants});
}
function applyResult(state){
 if(!isActive())return;
 active.state=state;
 showHud();
 if(state.complete)finish();
}
function addFeed(label){
 if(!isActive())return;
 active.feed.push({label,until:Date.now()+4500});
 if(active.feed.length>4)active.feed.shift();
}
function onActorKilled(actor,killer,weapon,killMethod='DIRECT'){
 if(!isActive()||!actor.alive)return;
 const pos=actor.group.position.clone();
 killArenaActor(actor);
 if(active.state.mode==='killConfirmed'){
   createTag(pos,actor.team,actor.id);
   // Every BLUE death leaves one confirmable tag. localArenaKill adds
   // the human-kill tag below; bot-caused (or environmental) BLUE deaths
   // also create an outstanding tag for the RED team to claim.
   if(actor.team==='BLUE'&&killer!=='human')
     active.state={...active.state,pendingTags:active.state.pendingTags+1};
 }
 if(killer==='human'){
   addFeed('YOU → '+actor.name+' ['+weapon+(killMethod==='DIRECT'?'':' · '+killMethod)+']');
   // Offline arena eliminations award modest progression, independently
   // from Survival waves and without any competitive multiplayer claim.
   awardXp(20);
   recordKill('arena',weapon,{source:'ARENA',killMethod,
      arenaMode:active.state.mode});
   const before=active.state;
   const next=localArenaKill(before,{weapon,source:'PLAYER'});
   if(before.mode==='gunGame'&&next.gunIndex!==before.gunIndex&&!next.complete){
     const nextWeapon=next.gunOrder[next.gunIndex];
     inventory[0]=nextWeapon;setActiveSlot(0);setWeapon(nextWeapon);
     showHud('WEAPON UP');
   }
   applyResult(next);
 }else if(killer){
   addFeed(killer.name+' → '+actor.name+' ['+weapon+']');
   const next=localArenaBotKill(active.state,
     {killerId:killer.id,killerTeam:killer.team,victimTeam:actor.team,weapon});
   killer.kills++;
   if(active.state.mode==='gunGame'&&!next.complete){
     const rung=next.botGuns[killer.id]||0;
     setArenaActorWeapon(killer,next.gunOrder[rung]);
   }
   applyResult(next);
 }
}
// Special attacks identify their ability at the hitRobot boundary. They
// still originate from the human player; do not silently discard their kills
// or weapon XP when resolving local arena damage.
const HUMAN_DAMAGE_SOURCES=new Set([
 'PLAYER','FLAMETHROWER','PHALANX_SHATTER','TESLA_CHAIN',
 'THUNDERBOLT','OMEGA_STORM','AEGIS',
]);
export function localArenaActorHit(actor,dmg,source='PLAYER',weaponOverride=null,isExplosive=false){
 if(!isActive()||!actor?.alive||!Number.isFinite(dmg)||dmg<=0||
    !HUMAN_DAMAGE_SOURCES.has(source))return;
 // Gun Game's ladder cannot be bypassed by another equipped firearm.
 const credit=resolveKillAttribution(curWep,source,weaponOverride,isExplosive);
 if(active.state.mode==='gunGame'&&credit.weaponKey!==active.state.gunOrder[active.state.gunIndex])return;
 if(['tdm','killConfirmed'].includes(active.state.mode)&&actor.team==='RED')return;
 const dealt=Math.min(actor.hp,Math.min(500,dmg));
 actor.hp=Math.max(0,actor.hp-dealt);
 if(credit.weaponKey)recordDamage(credit.weaponKey,dealt,'ARENA');
 if(actor.hp===0)onActorKilled(actor,'human',credit.weaponKey,credit.killMethod);
}
// Legacy Survival robot kills do not score in arena games. No Survival bots
// are spawned by the new modes, so this callback must remain a no-op.
export function localArenaRobotKilled(){ }
export function localArenaPlayerDead(onRespawn){
 if(!isActive())return false;
 if(active.playerDead)return true;
 active.playerDead=true;
 const pos=camera.position.clone();pos.y-=1.6;
 const killer=active.lastAttacker;
 if(active.state.mode==='killConfirmed')createTag(pos,'RED','human');
 const next=localArenaDeath(active.state,{
   killerId:killer?.id||null,weapon:killer?.weapon||null,killerTeam:killer?.team||'BLUE',
 });
 if(killer&&active.state.mode==='gunGame'&&!next.complete)
   setArenaActorWeapon(killer,next.gunOrder[next.botGuns[killer.id]||0]);
 applyResult(next);
 if(!isActive())return true;
 showHud('RESPAWNING IN 5s');
 const token=generation;
 setTimeout(()=>{
   if(!isActive()||generation!==token)return;
   active.playerDead=false;active.lastAttacker=null;
   onRespawn?.();
 },5000);
 return true;
}
// The local match uses weapon definitions for bot-to-bot and bot-to-player
// effects. All damage and score changes stay in the offline arena runtime.
function hostile(shooter,victim){
 if(!isActive())return false;
 if(!['tdm','killConfirmed'].includes(active.state.mode))return true;
 return shooter.team!==(victim?.team||'RED');
}
function botImpact(shooter,victim,damage,weapon,method='DIRECT'){
 if(!isActive()||!hostile(shooter,victim)||!Number.isFinite(damage)||damage<=0)return;
 if(victim){
  if(!victim.alive)return;
  victim.hp=Math.max(0,victim.hp-damage);
  if(victim.hp===0)onActorKilled(victim,shooter,weapon,method);
 }else if(!active.playerDead){
  active.lastAttacker=shooter;
  active.onPlayerHit?.(damage);
 }
}
function arenaSight(from,to){
 const delta=to.subtract(from),len=delta.length();
 if(len<.15)return true;
 const hit=scene.pickWithRay(new BABYLON.Ray(from,delta.scale(1/len),len),
  m=>m.isEnabled()&&m.checkCollisions&&!m.metadata?.arenaActorId&&!m.metadata?.enemy);
 return !hit?.hit||hit.distance>=len-.35;
}
function arenaTargets(shooter){
 if(!isActive())return [];
 const out=active.actors.filter(a=>a.alive&&a!==shooter&&hostile(shooter,a))
  .map(a=>({actor:a,pos:a.group.position.add(new BABYLON.Vector3(0,1.35,0))}));
 if(!active.playerDead&&hostile(shooter,null))
  out.push({actor:null,pos:camera.position.clone()});
 return out;
}
function traceAbility(start,end){
 const line=BABYLON.MeshBuilder.CreateLines('arena_chain',{points:[start,end]},scene);
 line.color=new BABYLON.Color3(.35,.85,1);
 line.isPickable=false;
 setTimeout(()=>{if(!line.isDisposed?.())line.dispose()},145);
}
function arenaExplosion(shooter,point,damage,weapon,radius){
 // Splash is computed at impact, not when the trigger is pulled. Obstacles
 // shield secondary targets and team modes disallow friendly fire.
 for(const target of arenaTargets(shooter)){
  if(!isActive())break;
  const dist=BABYLON.Vector3.Distance(point,target.pos);
  if(dist>=radius||!arenaSight(point,target.pos))continue;
  botImpact(shooter,target.actor,Math.max(1,damage*(1-dist/radius)),
    weapon,'EXPLOSION');
 }
}
function addBotBurn(shooter,victim,spec){
 if(!isActive()||!hostile(shooter,victim)||
   (victim&&!victim.alive)||(!victim&&active.playerDead))return;
 const existing=active.burns.find(b=>b.shooter===shooter&&b.victim===victim);
 if(existing){existing.remaining=spec.dotDuration||4;return}
 active.burns.push({shooter,victim,weapon:shooter.weapon,
  remaining:spec.dotDuration||4,dps:spec.dotDamage||8});
}
function updateArenaBotBurns(dt){
 if(!isActive()||!active.burns.length)return;
 const next=[];
 for(const b of active.burns){
  if(!isActive())return;
  if((b.victim&&!b.victim.alive)||(!b.victim&&active.playerDead))continue;
  const seconds=Math.min(dt,b.remaining);
  botImpact(b.shooter,b.victim,b.dps*seconds,b.weapon,'FLAME_DOT');
  b.remaining-=dt;
  if(b.remaining>0&&(b.victim?b.victim.alive:!active.playerDead))next.push(b);
 }
 if(isActive())active.burns=next;
}
function actorShoots(shooter,victim,damage,weapon,aimPoint){
 if(!isActive())return;
 const spec=getArenaActorWeaponSpec(shooter);
 const point=aimPoint?.clone?.()||
   (victim?victim.group.position.add(new BABYLON.Vector3(0,1.35,0)):camera.position.clone());
 const impact=(impactPoint=point)=>{
  if(!isActive())return;
  if(spec.splash>0){
   arenaExplosion(shooter,impactPoint,damage,weapon,spec.splash);
   return;
  }
  // Dodgeable slow bolts: do not teleport damage to a target that has moved
  // far from the impact line while a projectile was in flight.
  const current=victim?.group.position.add(new BABYLON.Vector3(0,1.35,0))||
    camera.position.clone();
  if(!spec.hitscan&&BABYLON.Vector3.Distance(current,impactPoint)>1.6)return;
  botImpact(shooter,victim,damage,weapon);
  if(!isActive())return;
  if(weapon==='FLAMETHROWER')addBotBurn(shooter,victim,spec);
  if(weapon==='RAILGUN'){
   const from=shooter.group.position.add(new BABYLON.Vector3(0,1.45,0));
   const aim=point.subtract(from),aimLen=aim.length();
   if(aimLen>.1){
    const dir=aim.scale(1/aimLen);
    for(const other of arenaTargets(shooter)){
     if(!isActive())break;
     if(other.actor===victim)continue;
     const rel=other.pos.subtract(from),along=BABYLON.Vector3.Dot(rel,dir);
     if(along<=aimLen||along>(spec.range||130))continue;
     const miss=rel.subtract(dir.scale(along)).length();
     if(miss<.8&&arenaSight(point,other.pos))
       botImpact(shooter,other.actor,damage*.7,weapon,'PIERCE');
    }
   }
  }
  if(weapon==='TESLA'&&spec.chainTargets){
   let last=point.clone(),amount=damage*.65;
   const visited=new Set([victim||'human']);
   for(let hop=0;hop<spec.chainTargets-1;hop++){
    const next=arenaTargets(shooter).filter(t=>!visited.has(t.actor||'human')&&
      BABYLON.Vector3.Distance(last,t.pos)<=spec.chainRange&&
      arenaSight(last,t.pos))
      .sort((a,b)=>BABYLON.Vector3.Distance(last,a.pos)-BABYLON.Vector3.Distance(last,b.pos))[0];
    if(!next)break;
    traceAbility(last,next.pos);
    visited.add(next.actor||'human');
    botImpact(shooter,next.actor,amount,weapon,'TESLA_CHAIN');
    if(!isActive())break;
    last=next.pos;amount*=.65;
   }
  }
 };
 if(spec.hitscan!==false||spec.melee)impact();
 else{
  // Move a visible projectile through the arena frame loop. Resolve world
  // collision before damage so ramps and cover block non-explosive fire.
  const from=shooter.group.position.add(new BABYLON.Vector3(0,1.45,0));
  const delta=point.subtract(from),dist=delta.length();
  if(dist<.1)return;
  const mesh=BABYLON.MeshBuilder.CreateSphere('arena_projectile_'+weapon,
    {diameter:weapon==='ROCKET'?.2:.14,segments:6},scene);
  mesh.position.copyFrom(from);mesh.isPickable=false;mesh.checkCollisions=false;
  const mat=new BABYLON.StandardMaterial('arena_projectile_mat',scene);
  mat.emissiveColor=weapon==='ROCKET'||weapon==='GLAUNCHER'
    ?new BABYLON.Color3(1,.45,.13):new BABYLON.Color3(.3,.7,1);
  mat.disableLighting=true;mesh.material=mat;
  active.projectiles.push({mesh,mat,direction:delta.scale(1/dist),distance:dist,
    travelled:0,speed:Math.max(8,spec.speed||spec.projSpeed||35),
    splash:(spec.splash||0)>0,impact});
 }
}
function updateArenaProjectiles(dt){
 if(!isActive())return;
 for(let i=active.projectiles.length-1;i>=0;i--){
  if(!isActive())return;
  const p=active.projectiles[i];
  if(!p.mesh||p.mesh.isDisposed?.()){active.projectiles.splice(i,1);continue}
  const step=Math.min(p.speed*dt,p.distance-p.travelled);
  const start=p.mesh.position.clone();
  let blocked=null;
  try{blocked=scene.pickWithRay(new BABYLON.Ray(start,p.direction,
    step+.02),m=>m.isEnabled()&&m.checkCollisions&&
    !m.metadata?.arenaActorId&&!m.metadata?.enemy)}catch{}
  const terminal=p.travelled+step>=p.distance-.001;
  const hit=blocked?.hit&&blocked.distance<=step+.02;
  const end=hit&&blocked.pickedPoint?blocked.pickedPoint:
    start.add(p.direction.scale(step));
  p.mesh.position.copyFrom(end);
  p.travelled+=step;
  if(hit||terminal){
   active.projectiles.splice(i,1);
   p.mesh.dispose();p.mat.dispose();
   if(!hit||p.splash)p.impact(end);
  }
 }
}
// Status damage uses the same source/weapon metadata as direct hits. This
// prevents Shotgun Dragon's Breath and Riveter superheat kills from becoming
// generic Flamethrower kills (or disappearing in arena-only opponents).
function updateArenaStatusDamage(dt){
 if(!isActive())return;
 for(const actor of active.actors){
  if(!actor.alive)continue;
  if(['tdm','killConfirmed'].includes(active.state.mode)&&actor.team==='RED')continue;
  for(const [key,poison] of [['_dots',false],['_poisonDots',true]]){
   const effects=actor[key];
   if(!Array.isArray(effects)||!effects.length)continue;
   const remaining=[];
   for(const effect of effects){
    if(!actor.alive)break;
    if(!Number.isFinite(effect.remaining)||effect.remaining<=0)continue;
    const seconds=Math.min(dt,effect.remaining);
    const amount=Math.max(0,(poison?effect.dps:effect.dmg)||0)*seconds;
    const source=poison?'POISON':effect.source||'FLAME_DOT';
    const credit=resolveKillAttribution(curWep,source,poison?'CROSSBOW':effect.weapon);
    const dealt=Math.min(actor.hp,Math.min(1000,amount));
    actor.hp=Math.max(0,actor.hp-dealt);
    if(credit.weaponKey&&dealt>0)recordDamage(credit.weaponKey,dealt,'ARENA');
    effect.remaining-=dt;
    if(actor.hp===0){onActorKilled(actor,'human',credit.weaponKey,credit.killMethod);break}
    if(effect.remaining>0)remaining.push(effect);
   }
   actor[key]=remaining;
  }
 }
}
function updateTags(dt){
 if(!isActive())return;
 for(let i=tags.length-1;i>=0;i--){
  const tag=tags[i];tag.lifetime-=dt;
  if(tag.lifetime<=0){
   removeTag(i);
   // Only tags dropped by a human kill count toward human pending confirms.
   if(tag.ownerTeam==='BLUE' && active.state.pendingTags>0)
     active.state=localArenaTagExpired(active.state);
   continue;
  }
  tag.mesh.rotation.y+=dt*1.5;
  const nearHuman=!active.playerDead&&
    BABYLON.Vector3.Distance(camera.position,tag.mesh.position)<1.7;
  const nearBot=active.actors.find(bot=>bot.alive&&
    BABYLON.Vector3.Distance(bot.group.position,tag.mesh.position)<1.8);
  if(!nearHuman&&!nearBot)continue;
  removeTag(i);
  if(nearHuman){
   // RED tags are allied denials, BLUE tags are confirmed team points.
   if(tag.ownerTeam==='RED'){addFeed('TAG DENIED');continue}
   addFeed('TAG CONFIRMED');
   applyResult(localArenaTag(active.state));
  }else if(nearBot){
   if(tag.ownerId!==nearBot.id){
     const s=localArenaBotTag(active.state,{
       collectorId:nearBot.id,collectorTeam:nearBot.team,tagTeam:tag.ownerTeam,
     });
     // If this was an unclaimed tag from a human elimination, clear it.
     // A RED teammate already decrements pendingTags when collecting BLUE.
     applyResult(tag.ownerTeam==='BLUE'&&nearBot.team!=='RED'?
       localArenaTagExpired(s):s);
   }else if(tag.ownerTeam==='BLUE'){
     active.state=localArenaTagExpired(active.state);
   }
  }
  if(!isActive())return;
 }
}
export function updateLocalArena(dt){
 if(!isActive()||!Number.isFinite(dt)||dt<=0)return;
 // Keep physics, status damage, respawns and match time on the same bounded
 // simulation step after a background-tab stall or debugger pause.
 dt=Math.min(dt,.25);
 const s=tickLocalArena(active.state,dt);
 applyResult(s);
 if(!isActive())return;
 updateArenaActors(active.actors,dt,active.state.mode,{
   humanAlive:!active.playerDead,
   isMatchActive:isActive,
   objectives:active.state.mode==='killConfirmed'?tags:[],
   onShot:actorShoots,
   onRespawn:actor=>{
     const spawn=chooseArenaSpawn(active.actors.filter(other=>other!==actor));
     if(respawnArenaActor(actor,spawn)){
       if(active.state.mode==='gunGame'){
         const rung=active.state.botGuns[actor.id]||0;
         setArenaActorWeapon(actor,active.state.gunOrder[rung]);
       }else{
         setArenaActorWeapon(actor,actor.persona.loadout?.primary||'PISTOL');
       }
     }
   },
 });
 updateArenaProjectiles(dt);
 if(!isActive())return;
 updateArenaStatusDamage(dt);
 if(!isActive())return;
 updateArenaBotBurns(dt);
 if(!isActive())return;
 updateTags(dt);
 showHud();
}
