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
  complete:false,result:null,kills:0,
 };
}
function finish(s,reason){
 let result='DRAW';
 if(s.mode==='gunGame')result=reason==='knife'?'VICTORY':'TIME';
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
export function localArenaDeath(s){
 if(s.complete)return s;
 const n={...s,deaths:s.deaths+1,opposition:s.opposition+1};
 return n.opposition>=n.goal?finish(n,'goal'):n;
}
export function tickLocalArena(s,dt){
 if(s.complete||!Number.isFinite(dt)||dt<=0)return s;
 const n={...s,secondsLeft:Math.max(0,s.secondsLeft-Math.min(dt,0.25))};
 return n.secondsLeft===0?finish(n,'time'):n;
}
