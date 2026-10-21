// Pure, deterministic server-owned bot decision engine (priority 10).
// Produces movement/aim/fire *intent* only. It does NOT execute attacks,
// replicate network entities, resolve collisions or award scores.
//
// The real match server must own the positions/visibility/navmesh and execute
// verified intent before bot opponents may be enabled for players.
const MAX_SENSE_RANGE=120;
const MAX_DT_SECONDS=0.1;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const validPosition=p=>p&&finite(p.x)&&finite(p.y)&&finite(p.z);
function hash(s){
  let n=2166136261;
  for(const c of String(s)){n^=c.charCodeAt(0);n=Math.imul(n,16777619)}
  return n>>>0;
}
function makeBotBrain(slot,spawn,nowMs=0){
  if(slot?.owner!=='server'||!/^bot_[A-Za-z0-9_]+$/.test(slot?.id||''))
    throw Error('Bot identity must be an assigned server slot');
  if(!validPosition(spawn)||!finite(nowMs))throw Error('Invalid bot initial state');
  const reactionMs=clamp(Number(slot.reactionMs)||400,100,2000);
  const initialFacing=(hash(slot.id)%6283)/1000-Math.PI;
  return {
    id:slot.id, team:slot.team||null, personalityId:slot.personalityId,
    position:{x:spawn.x,y:spawn.y,z:spawn.z},
    yaw:initialFacing,
    targetId:null,
    nextDecisionAt:nowMs,
    nextFireAt:nowMs+reactionMs,
    lastTickMs:nowMs,
    moveSign:hash(slot.id)&1?1:-1,
    preferredRange:clamp(Number(slot.preferredRange)||15,2,80),
    reactionMs,
    aggression:clamp(Number(slot.aggression)||0.5,0,1),
    aim:clamp(Number(slot.aim)||0.5,0,1),
    owner:'server',
  };
}
function eligibleEnemy(bot,p,mode){
  if(!p||p.id==null||String(p.id)===String(bot.id)||p.alive===false||p.hp<=0)
    return false;
  if(!validPosition(p.position||p))return false;
  if(p.owner!=='human'&&p.owner!=='server'&&p.owner!=='bot')return false;
  // TDM bots may only attack a known opposing team, never unassigned peers.
  if(mode==='tdm' && (!bot.team || !p.team || bot.team===p.team))return false;
  return true;
}
function chooseBotTarget(bot,players,mode='ffa',lineOfSight=null){
  if(!Array.isArray(players)||!validPosition(bot?.position))return null;
  const visible=typeof lineOfSight==='function'?lineOfSight:null;
  const options=[];
  for(const p of players){
    if(!eligibleEnemy(bot,p,mode))continue;
    const q=p.position||p;
    const dx=q.x-bot.position.x,dy=q.y-bot.position.y,dz=q.z-bot.position.z;
    const d2=dx*dx+dy*dy+dz*dz;
    if(d2>MAX_SENSE_RANGE*MAX_SENSE_RANGE)continue;
    // Prefer visible targets, but retain obstructed ones to permit approach.
    let los=false;
    try{los=visible?!!visible(bot.position,q):false}catch{los=false}
    const score=(los?0:MAX_SENSE_RANGE*2)+Math.sqrt(d2)-
      (p.id===bot.targetId?3:0);
    options.push({p,score,distance:Math.sqrt(d2),visible:los});
  }
  options.sort((a,b)=>a.score-b.score||String(a.p.id).localeCompare(String(b.p.id)));
  return options[0]||null;
}
function directionTo(from,to){
  const dx=to.x-from.x,dz=to.z-from.z,len=Math.hypot(dx,dz);
  return len>1e-6?{x:dx/len,z:dz/len,distance:len}:{x:0,z:0,distance:0};
}
function rotateTowards(current,wanted,maxDelta){
  let delta=((wanted-current+Math.PI*3)%(Math.PI*2))-Math.PI;
  return current+clamp(delta,-maxDelta,maxDelta);
}
function botThink(brain,world,nowMs){
  if(!brain||brain.owner!=='server'||!validPosition(brain.position)||!finite(nowMs))
    throw Error('Invalid server bot state');
  const mode=world?.mode||'ffa';
  const actors=world?.actors||[];
  // No timer rewinds or arbitrarily large client-induced movement impulses.
  const dt=clamp((nowMs-brain.lastTickMs)/1000,0,MAX_DT_SECONDS);
  const state={...brain,lastTickMs:Math.max(brain.lastTickMs,nowMs)};
  const idle={move:{x:0,z:0},yaw:state.yaw,fire:false,
    weaponSlot:'primary',targetId:null,behavior:'idle'};
  if(!['ffa','tdm','gunGame'].includes(mode)||world?.active===false)
    return {state:{...state,targetId:null},command:idle};
  const target=chooseBotTarget(state,actors,mode,world.lineOfSight);
  if(!target)return {state:{...state,targetId:null},command:idle};
  const q=target.p.position||target.p;
  const previous=brain.targetId;
  const changed=String(previous)!==String(target.p.id);
  // New target requires at least the personality's reaction delay.
  if(changed){
    state.targetId=target.p.id;
    state.nextFireAt=Math.max(state.nextFireAt,nowMs+state.reactionMs);
    state.nextDecisionAt=nowMs+state.reactionMs;
  }
  const horizontal=directionTo(state.position,q);
  const wantedYaw=Math.atan2(horizontal.x,horizontal.z);
  const turnSpeed=clamp(1.6+state.aim*4.2,1.6,5.8);
  state.yaw=rotateTowards(state.yaw,wantedYaw,turnSpeed*dt);
  const preferred=state.preferredRange;
  const tooClose=horizontal.distance<preferred*0.57;
  const tooFar=horizontal.distance>preferred*1.18;
  const visible=target.visible;
  let behavior='strafe',move={x:0,z:0};
  // Never move directly through a known obstacle: when pathfinding is
  // available, the navigation service supplies a next waypoint. Without it
  // and with no LOS, hold position until the controller can route around.
  let towards=horizontal;
  if(!visible){
    let waypoint=null;
    if(typeof world.nextWaypoint==='function'){
      try{waypoint=world.nextWaypoint(state.position,q,brain.id)}
      catch{waypoint=null} // transient Recast/path adapter failure => safe hold
    }
    if(validPosition(waypoint))towards=directionTo(state.position,waypoint);
    else towards={x:0,z:0,distance:0};
  }
  if(!visible){
    behavior='seek';
    move={x:towards.x,z:towards.z};
  }else if(tooFar){
    behavior='advance';
    move={x:horizontal.x,z:horizontal.z};
  }else if(tooClose){
    behavior='retreat';
    move={x:-horizontal.x,z:-horizontal.z};
  }else{
    behavior='strafe';
    move={x:horizontal.z*state.moveSign,z:-horizontal.x*state.moveSign};
  }
  const speed=clamp(0.35+state.aggression*.65,0.35,1);
  move={x:move.x*speed,z:move.z*speed};
  // This is an attack request, not a hit or projectile. The authoritative
  // server must separately check range, LOS, weapon stats and cooldowns.
  const dist=Math.hypot(q.x-state.position.x,q.y-state.position.y,q.z-state.position.z);
  const facingError=Math.abs(((wantedYaw-state.yaw+Math.PI*3)%(Math.PI*2))-Math.PI);
  const fire=visible && dist<=Math.max(9,preferred*2.6) &&
    nowMs>=state.nextFireAt && nowMs>=state.nextDecisionAt &&
    facingError<=clamp(0.12+state.aim*.22,0.12,0.34);
  if(fire)state.nextFireAt=nowMs+clamp(850-state.aggression*460,390,850);
  return {state,command:{
    move,yaw:state.yaw,fire,
    weaponSlot:'primary',targetId:target.p.id,behavior,
  }};
}
module.exports={MAX_SENSE_RANGE,makeBotBrain,chooseBotTarget,botThink};
