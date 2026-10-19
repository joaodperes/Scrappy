// Browser-independent rules for offline arena challenges.
// These are intentionally local robot practice matches, not multiplayer or
// full bot-vs-bot FFA/TDM simulation.
export const LOCAL_MODES=Object.freeze(['ffa','tdm','gunGame','killConfirmed']);
export const GUN_POOL=Object.freeze(['SMG','SHOTGUN','CHAINGUN','DMR','COMET','RAILGUN','TESLA','CROSSBOW','ELECTRON','ION']);
export function localGunOrder(seed=1){
 let state=(seed>>>0)||0x9e3779b9;
 const next=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296};
 const pool=GUN_POOL.slice();
 for(let i=pool.length-1;i>0;i--){const j=Math.floor(next()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]]}
 return ['PISTOL',...pool,'KNIFE'];
}
export function createLocalArena(config={}){
 const mode=LOCAL_MODES.includes(config.mode)?config.mode:'ffa';
 const seconds=Number.isInteger(config.duration)&&config.duration>=60&&config.duration<=1800?config.duration:600;
 const goal=Number.isInteger(config.scoreLimit)&&config.scoreLimit>=1&&config.scoreLimit<=100?config.scoreLimit:25;
 const seed=Number.isInteger(config.seed)?config.seed>>>0:1;
 return {
  mode,secondsLeft:seconds,goal,score:0,opposition:0,deaths:0,
  gunOrder:localGunOrder(seed),gunIndex:0,pendingTags:0,
  complete:false,result:null,kills:0,botScores:{},botGuns:{},
 };
}
function finish(s,reason){
 let result='DRAW';
 if(s.mode==='gunGame')result=reason==='knife'?'VICTORY':s.score>s.opposition?'VICTORY':s.score<s.opposition?'DEFEAT':'DRAW';
 else if(s.score>s.opposition)result='VICTORY';
 else if(s.opposition>s.score)result='DEFEAT';
 else if(reason==='goal')result='VICTORY';
 return {...s,complete:true,result};
}
export function localArenaKill(s,{weapon,source='PLAYER'}={}){
 if(s.complete||source!=='PLAYER')return s;
 let n={...s,kills:s.kills+1};
 if(s.mode==='killConfirmed')return {...n,pendingTags:s.pendingTags+1};
 if(s.mode==='gunGame'){
  if(weapon!==s.gunOrder[s.gunIndex])return s;
  n.score++;
  if(n.gunIndex===n.gunOrder.length-1)return finish(n,'knife');
  n.gunIndex++;
 }else n.score++;
 return n.mode!=='gunGame'&&n.score>=n.goal?finish(n,'goal'):n;
}
export function localArenaTag(s){
 if(s.complete||s.mode!=='killConfirmed'||s.pendingTags<=0)return s;
 const n={...s,pendingTags:s.pendingTags-1,score:s.score+1};
 return n.score>=n.goal?finish(n,'goal'):n;
}
export function localArenaTagExpired(s){
 if(s.complete||s.mode!=='killConfirmed'||s.pendingTags<=0)return s;
 return {...s,pendingTags:s.pendingTags-1};
}
// Each bot competes independently in FFA/Gun Game; TDM scores by team.
// Confirmed tags (rather than raw kills) score Kill Confirmed.
export function localArenaBotKill(s,{killerId,killerTeam='BLUE',victimTeam='RED',weapon}={}){
 if(s.complete||!killerId||killerTeam===victimTeam&&s.mode==='tdm')return s;
 const botScores={...s.botScores},botGuns={...s.botGuns};
 let n={...s,botScores,botGuns};
 if(s.mode==='killConfirmed')return n; // tags decide points
 if(s.mode==='gunGame'){
   const rung=botGuns[killerId]||0;
   if(weapon!==s.gunOrder[rung])return s;
   botScores[killerId]=(botScores[killerId]||0)+1;
   if(rung===s.gunOrder.length-1){
     n.opposition=Math.max(s.opposition,botScores[killerId]);
     return {...n,complete:true,result:'DEFEAT'};
   }
   botGuns[killerId]=rung+1;
   n.opposition=Math.max(s.opposition,botScores[killerId]);
   return n; // Gun Game ignores general score limits: only Knife wins.
 }else if(s.mode==='tdm'){
   n= killerTeam==='RED'?{...n,score:s.score+1}:
     {...n,opposition:s.opposition+1};
 }else {
   botScores[killerId]=(botScores[killerId]||0)+1;
   n.opposition=Math.max(s.opposition,botScores[killerId]);
 }
 return n.score>=n.goal||n.opposition>=n.goal?finish(n,'goal'):n;
}
export function localArenaBotTag(s,{collectorId,collectorTeam='BLUE',tagTeam='RED'}={}){
 if(s.complete||s.mode!=='killConfirmed')return s;
 // Picking up your OWN side's fallen tag denies it but earns no points.
 if(collectorTeam===tagTeam)return s;
 if(collectorTeam==='RED')return localArenaTag(s);
 const botScores={...s.botScores};
 if(collectorId)botScores[collectorId]=(botScores[collectorId]||0)+1;
 const n={...s,botScores,opposition:s.opposition+1};
 return n.opposition>=n.goal?finish(n,'goal'):n;
}
export function localArenaDeath(s,{killerId=null,weapon=null,killerTeam='BLUE'}={}){
 if(s.complete)return s;
 let n={...s,deaths:s.deaths+1};
 if(s.mode==='killConfirmed')return n; // opponents must collect the player's tag
 if(killerId)return localArenaBotKill(n,{killerId,killerTeam,victimTeam:'RED',weapon});
 n={...n,opposition:n.opposition+1};
 return n.opposition>=n.goal?finish(n,'goal'):n;
}
export function tickLocalArena(s,dt){
 if(s.complete||!Number.isFinite(dt)||dt<=0)return s;
 const n={...s,secondsLeft:Math.max(0,s.secondsLeft-Math.min(dt,0.25))};
 return n.secondsLeft===0?finish(n,'time'):n;
}
