// Offline player-shaped arena opponents: no socket, Firebase changes or
// Survival robots. All actors own individual teams, weapons, health and AI.
import {createLocalArena,localArenaKill,localArenaBotKill,localArenaTag,
  localArenaBotTag,localArenaTagExpired,localArenaDeath,tickLocalArena} from './localArenaRules.js';
import {scene,camera} from './scene.js';
import {inventory,setWeapon,setActiveSlot,curWep,WDEFS} from './weapons.js';
import {rebuildMeshMap} from './enemies.js';
import {fetchArenaPersonas,createArenaActor,destroyArenaActors,
  chooseArenaSpawn,setArenaActorWeapon,killArenaActor,respawnArenaActor,
  updateArenaActors} from './localArenaActors.js';
const BABYLON=window.BABYLON;
let active=null,hud=null,tags=[],generation=0,tagSerial=0;
const LABELS={ffa:'FREE FOR ALL',tdm:'TEAM DEATHMATCH',gunGame:'GUN GAME',killConfirmed:'KILL CONFIRMED'};
const isActive=()=>active&&!active.finished;
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
 const opponents=active.actors.map(a=>a.name+' '+(s.botScores[a.id]||0));
 hud.textContent=(LABELS[s.mode]||s.mode)+' · '+s.score+' : '+s.opposition+
   ' · '+Math.ceil(s.secondsLeft)+'s'+current+(note?' · '+note:'');
 hud.title=opponents.join(' | ');
}
function createTag(position,ownerTeam,ownerId){
 if(!isActive())return;
 const mesh=BABYLON.MeshBuilder.CreateCylinder('arena_tag_'+(++tagSerial),
   {diameter:.54,height:.13,tessellation:8},scene);
 const mat=new BABYLON.StandardMaterial('arena_tag_material_'+tagSerial,scene);
 mat.emissiveColor=new BABYLON.Color3(1,.72,.10);
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
export function startLocalArena(cfg,onFinish,onPlayerHit=()=>{}){
 stopLocalArena();
 const state=createLocalArena({mode:cfg.mode,duration:cfg.duration,
   scoreLimit:cfg.scoreLimit,seed:cfg.seed});
 const token=++generation;
 active={state,onFinish,onPlayerHit,actors:[],finished:false,playerDead:false,
   lastAttacker:null,spawned:false};
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
     const persona=personas[i%personas.length];
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
 if(active?.actors.length)destroyArenaActors(active.actors);
 active=null;
}
function finish(){
 if(!isActive())return;
 active.finished=true;
 const {onFinish,state}=active;
 stopLocalArena();
 onFinish?.(state);
}
function applyResult(state){
 if(!isActive())return;
 active.state=state;
 showHud();
 if(state.complete)finish();
}
function onActorKilled(actor,killer,weapon){
 if(!isActive()||!actor.alive)return;
 const pos=actor.group.position.clone();
 killArenaActor(actor);
 if(active.state.mode==='killConfirmed'){
   createTag(pos,actor.team,actor.id);
   // Blue team tags are collectible by the human/RED allies; those
   // killed by bots still need to appear in the shared pending tally.
   if(actor.team==='BLUE'&&killer!=='human')
     active.state={...active.state,pendingTags:active.state.pendingTags+1};
 }
 if(killer==='human'){
   applyResult(localArenaKill(active.state,{weapon,source:'PLAYER'}));
 }else if(killer&&killer.alive){
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
export function localArenaActorHit(actor,dmg,source='PLAYER'){
 if(!isActive()||!actor?.alive||!Number.isFinite(dmg)||dmg<=0)return;
 // Gun Game's ladder cannot be bypassed by another equipped firearm.
 if(active.state.mode==='gunGame'&&curWep!==active.state.gunOrder[active.state.gunIndex])return;
 if(['tdm','killConfirmed'].includes(active.state.mode)&&actor.team==='RED')return;
 actor.hp=Math.max(0,actor.hp-Math.min(500,dmg));
 if(actor.hp===0)onActorKilled(actor,source==='PLAYER'?'human':null,curWep);
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
 applyResult(localArenaDeath(active.state,{
   killerId:killer?.id||null,weapon:killer?.weapon||null,killerTeam:killer?.team||'BLUE',
 }));
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
function actorShoots(shooter,victim,damage,weapon){
 if(!isActive())return;
 if(victim){
   if(!victim.alive)return;
   victim.hp=Math.max(0,victim.hp-damage);
   if(victim.hp===0)onActorKilled(victim,shooter,weapon);
 }else if(!active.playerDead){
   active.lastAttacker=shooter;
   active.onPlayerHit?.(damage);
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
   // A human can deny their own fallen tag without gaining score.
   if(tag.ownerTeam==='RED')continue;
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
 if(!isActive())return;
 const s=tickLocalArena(active.state,dt);
 applyResult(s);
 if(!isActive())return;
 updateArenaActors(active.actors,dt,active.state.mode,{
   humanAlive:!active.playerDead,
   objectives:active.state.mode==='killConfirmed'?tags:[],
   onShot:actorShoots,
   onRespawn:actor=>{
     const spawn=chooseArenaSpawn(active.actors.filter(other=>other!==actor));
     if(respawnArenaActor(actor,spawn)&&active.state.mode==='gunGame'){
       const rung=active.state.botGuns[actor.id]||0;
       setArenaActorWeapon(actor,active.state.gunOrder[rung]);
     }
   },
 });
 updateTags(dt);
 showHud();
}
