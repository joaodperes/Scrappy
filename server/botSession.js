// Server-only bot lifecycle foundation. NOT connected to live WS rooms.
// This separates roster ownership, a trusted spawn/navigation adapter, and
// per-frame bot intent from the authoritative hit/physics replication work.
const {planBotSlots}=require('./botSlots.js');
const {makeBotBrain,botThink}=require('./botBrain.js');
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const validPosition=p=>p&&finite(p.x)&&finite(p.y)&&finite(p.z);
const MAX_BOT_HEALTH=100;
const RESPAWN_MS=5000;

function createBotSession(config={},seed=0){
  return {
    config:{mode:config.mode,maxPlayers:config.maxPlayers,fillBots:config.fillBots===true},
    seed:Number.isSafeInteger(seed)?seed:0,
    bots:[],
  };
}
function reconcileBotSession(session,humans,spawnProvider,nowMs=0){
  if(!session||!Array.isArray(session.bots)||!finite(nowMs))
    throw Error('Invalid bot session');
  const planned=planBotSlots(session.config,humans,session.seed);
  const existing=new Map(session.bots.map(bot=>[bot.slot.id,bot]));
  const bots=[];
  for(const slot of planned){
    const prior=existing.get(slot.id);
    if(prior && prior.slot.personalityId===slot.personalityId &&
        prior.slot.team===slot.team){
      bots.push({...prior,slot});
      continue;
    }
    // Fail closed: do not invent in-map spawn points or use the client camera.
    let spawn=null;
    if(typeof spawnProvider==='function'){
      try{spawn=spawnProvider(slot)}catch{spawn=null}
    }
    if(!validPosition(spawn))continue;
    bots.push({
      slot,brain:makeBotBrain(slot,spawn,nowMs),
      alive:true,hp:MAX_BOT_HEALTH,respawnAt:null,
    });
  }
  return {...session,bots};
}
function updateBotPosition(session,id,position){
  // Only the trusted server collision/nav solver may call this function.
  if(!validPosition(position))return session;
  return {...session,bots:session.bots.map(b=>b.slot.id===id
    ?{...b,brain:{...b.brain,position:{x:position.x,y:position.y,z:position.z}}}
    :b)};
}
function markBotDown(session,id,nowMs,delayMs=RESPAWN_MS){
  if(!finite(nowMs)||!finite(delayMs)||delayMs<1000||delayMs>15000)return session;
  return {...session,bots:session.bots.map(b=>b.slot.id===id&&b.alive
    ?{...b,alive:false,hp:0,respawnAt:nowMs+delayMs}:b)};
}
function respawnBot(session,id,spawn,nowMs){
  if(!validPosition(spawn)||!finite(nowMs))return session;
  return {...session,bots:session.bots.map(b=>{
    if(b.slot.id!==id||b.alive||b.respawnAt===null||nowMs<b.respawnAt)return b;
    return {...b,brain:makeBotBrain(b.slot,spawn,nowMs),
      alive:true,hp:MAX_BOT_HEALTH,respawnAt:null};
  })};
}
function stepBotSession(session,world={},nowMs=0){
  if(!session||!Array.isArray(session.bots)||!finite(nowMs))
    throw Error('Invalid bot session step');
  // The caller must supply trusted human actors and a physics-backed
  // visibility/path adapter. No bot is capable of requesting client damage.
  const humans=Array.isArray(world.humans)?world.humans:[];
  const botsAsActors=session.bots.map(b=>({
    id:b.slot.id,owner:'server',position:b.brain.position,
    hp:b.hp,alive:b.alive,team:b.slot.team,
  }));
  const actors=[...humans,...botsAsActors];
  const commands=[],bots=[];
  for(const bot of session.bots){
    if(!bot.alive){bots.push(bot);continue}
    const {state,command}=botThink(bot.brain,{
      mode:session.config.mode,active:world.active,
      actors,lineOfSight:world.lineOfSight,nextWaypoint:world.nextWaypoint,
    },nowMs);
    bots.push({...bot,brain:state});
    commands.push({id:bot.slot.id,...command});
  }
  return {session:{...session,bots},commands};
}
module.exports={
  MAX_BOT_HEALTH,RESPAWN_MS,createBotSession,reconcileBotSession,
  updateBotPosition,markBotDown,respawnBot,stepBotSession,
};
