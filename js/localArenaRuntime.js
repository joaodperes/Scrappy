// Local robot-arena challenges. No WebSocket, rooms or cloud deployment.
// Robots use the existing single-player PvE movement/combat controllers.
// FFA/TDM labels are PRACTICE: bots currently target the human, not peers.
import { createLocalArena,localArenaKill,localArenaTag,localArenaTagExpired,localArenaDeath,tickLocalArena } from './localArenaRules.js';
import { enemies } from './gameState.js';
import { spawnBot } from './enemies.js';
import { scene,camera } from './scene.js';
import { inventory,setWeapon,setActiveSlot,curWep,WDEFS } from './weapons.js';
const BABYLON=window.BABYLON;
let active=null,hud=null,tags=[],respawnCounter=0;
const LABELS={ffa:'FFA PRACTICE',tdm:'TDM PRACTICE',gunGame:'GUN GAME',killConfirmed:'KILL CONFIRMED'};
function showHud(note=''){
 if(!active)return;
 if(!hud){
  hud=document.createElement('div');hud.id='localArenaHud';
  hud.style.cssText='position:fixed;top:56px;left:50%;transform:translateX(-50%);pointer-events:none;z-index:40;padding:10px 22px;border:1px solid #a4d539;border-radius:5px;color:#e3ffb8;background:#0c170ddd;text-align:center;font:700 15px monospace;text-shadow:0 1px #000';
  document.body.appendChild(hud);
 }
 const s=active.state;
 const detail=s.mode==='gunGame'?' · '+s.gunOrder[s.gunIndex]:s.mode==='killConfirmed'?' · TAGS '+s.pendingTags:'';
 hud.textContent=(LABELS[s.mode]||s.mode)+' · '+s.score+' : '+s.opposition+' · '+Math.ceil(s.secondsLeft)+'s'+detail+(note?' · '+note:'');
}
function createTag(position){
 const mesh=BABYLON.MeshBuilder.CreateSphere('arena_dog_tag',{diameter:0.56,segments:8},scene);
 const mat=new BABYLON.StandardMaterial('arena_dog_tag_material',scene);
 mat.emissiveColor=new BABYLON.Color3(1,0.77,0.13);mat.disableLighting=true;
 mesh.material=mat;mesh.isPickable=false;mesh.checkCollisions=false;
 mesh.position.copyFrom(position);mesh.position.y+=0.7;
 tags.push({mesh,mat,lifetime:20});
}
function clearTags(){
 for(const tag of tags){tag.mesh.dispose();tag.mat.dispose()}
 tags=[];
}
export function isLocalArenaActive(){return !!active}
export function startLocalArena(cfg,onFinish){
 stopLocalArena();
 const state=createLocalArena({mode:cfg.mode,duration:cfg.duration,scoreLimit:cfg.scoreLimit,seed:cfg.seed});
 active={state,onFinish,spawnCooldown:0.05,spawnCount:5,finished:false};
 if(state.mode==='gunGame'){
  inventory[0]='PISTOL';inventory[1]=null;inventory[2]=null;
 }else{
  const p=cfg.loadout||{primary:'SMG',secondary:'SHOTGUN'};
  inventory[0]=WDEFS[p.primary]?p.primary:'SMG';
  inventory[1]=WDEFS[p.secondary]&&p.secondary!==inventory[0]?p.secondary:'SHOTGUN';
  inventory[2]='PISTOL';
 }
 setActiveSlot(0);setWeapon(inventory[0]);
 showHud('BOT PRACTICE');
}
export function stopLocalArena(){
 if(hud){hud.remove();hud=null}
 clearTags();active=null;respawnCounter++;
}
function finish(){
 if(!active||active.finished)return;
 active.finished=true;
 const {onFinish,state}=active;
 stopLocalArena();
 onFinish?.(state);
}
export function localArenaRobotKilled(details){
 if(!active||active.finished||details?.source!=='PLAYER')return;
 const old=active.state;
 active.state=localArenaKill(old,{weapon:details.weapon,source:details.source});
 if(old.mode==='killConfirmed'&&active.state.pendingTags>old.pendingTags&&details.position)createTag(details.position);
 if(old.mode==='gunGame'&&active.state.gunIndex!==old.gunIndex&&!active.state.complete){
  const weapon=active.state.gunOrder[active.state.gunIndex];
  inventory[0]=weapon;setActiveSlot(0);setWeapon(weapon);
  showHud('WEAPON UP!');
 }else showHud();
 if(active.state.complete)finish();
}
export function localArenaPlayerDead(onRespawn){
 if(!active||active.finished)return false;
 active.state=localArenaDeath(active.state);
 if(active.state.complete){finish();return true}
 const myCounter=++respawnCounter;
 showHud('RESPAWNING IN 5s');
 setTimeout(()=>{if(active&&!active.finished&&myCounter===respawnCounter)onRespawn?.()},5000);
 return true;
}
export function updateLocalArena(dt){
 if(!active||active.finished)return;
 active.state=tickLocalArena(active.state,dt);
 if(active.state.complete){finish();return}
 active.spawnCooldown-=dt;
 if(active.spawnCooldown<=0){
  const living=enemies.filter(e=>e.alive&&e.type!=='giantbot').length;
  const missing=active.spawnCount-living;
  for(let i=0;i<Math.min(2,Math.max(0,missing));i++){
   const kind=['scout','pistol','shotgun','heavy'][(active.state.kills+i)%4];
   spawnBot(kind,0,0,0,0.75);
  }
  active.spawnCooldown=missing>2?0.45:2;
 }
 for(let i=tags.length-1;i>=0;i--){
  const tag=tags[i];
  tag.lifetime-=dt;tag.mesh.rotation.y+=dt*1.9;
  if(tag.lifetime<=0){
   tag.mesh.dispose();tag.mat.dispose();tags.splice(i,1);continue;
  }
  if(BABYLON.Vector3.Distance(camera.position,tag.mesh.position)<1.65){
   tag.mesh.dispose();tag.mat.dispose();tags.splice(i,1);
   active.state=localArenaTag(active.state);
   showHud('CONFIRMED');
   if(active.state.complete){finish();return}
  }
 }
 showHud();
}
