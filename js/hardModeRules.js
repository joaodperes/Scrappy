// Deterministic difficulty rules. Four modifiers rotate automatically each
// wave; Nightmare locks one more modifier after each completed boss tier.
export const HARD_MODE_VERSION=2;
export const HARD_MODE_BASE=Object.freeze({
  hp:1.2,damage:1.15,speed:1.12,score:2,budget:1.15,
});
export const HARD_MODE_MODIFIERS=Object.freeze([
  Object.freeze({id:'reinforced',label:'REINFORCED',desc:'Enemies have heavier armor.',
    hp:1.25,damage:1,speed:1,count:1}),
  Object.freeze({id:'overclocked',label:'OVERCLOCKED',desc:'Enemies advance more quickly.',
    hp:1,damage:1,speed:1.2,count:1}),
  Object.freeze({id:'ferocious',label:'FEROCIOUS',desc:'Enemy attacks are more dangerous.',
    hp:1,damage:1.22,speed:1,count:1}),
  Object.freeze({id:'swarm',label:'SWARM',desc:'More enemies appear each wave.',
    hp:1,damage:1,speed:1,count:1.3}),
]);
const validateWave=wave=>{
  if(!Number.isInteger(wave)||wave<1)throw Error('Invalid wave number');
};
const seedFor=mapId=>{
  let seed=0;
  for(const char of String(mapId||'scrapyard'))seed=(seed*31+char.charCodeAt(0))>>>0;
  return seed%HARD_MODE_MODIFIERS.length;
};
const pickRotating=(excluded,index)=>{
  const available=HARD_MODE_MODIFIERS.filter(m=>!excluded.some(f=>f.id===m.id));
  return available[index%available.length];
};
export function getDifficultyWaveRules(mapId,waveNumber,difficulty='hard'){
  validateWave(waveNumber);
  if(!['hard','nightmare'].includes(difficulty))throw Error('Invalid difficulty');
  const seed=seedFor(mapId);
  const all=HARD_MODE_MODIFIERS;
  let active;
  if(difficulty==='hard'||waveNumber<=10){
    active=[all[(seed+waveNumber-1)%all.length]];
  }else{
    // Wave 10's active modifier becomes permanent on wave 11. Wave 20's
    // moving modifier locks on wave 21, then wave 30's on wave 31.
    const fixed=[all[(seed+9)%all.length]];
    const stage2=i=>pickRotating(fixed,(seed+i)%3);
    if(waveNumber<=20){
      active=[...fixed,stage2(waveNumber-11)];
    }else{
      fixed.push(stage2(9)); // Wave 20's rotating modifier
      const stage3=i=>pickRotating(fixed,(seed+i)%2);
      if(waveNumber<=30){
        active=[...fixed,stage3(waveNumber-21)];
      }else{
        fixed.push(stage3(9)); // Wave 30's rotating modifier
        active=[...fixed,pickRotating(fixed,0)]; // All four permanently active
      }
    }
  }
  const multiply=key=>active.reduce((total,m)=>total*m[key],HARD_MODE_BASE[key]??1);
  return Object.freeze({
    version:HARD_MODE_VERSION,mapId:String(mapId||'scrapyard'),
    wave:waveNumber,difficulty,
    modifiers:Object.freeze(active),modifier:active.at(-1),
    hp:multiply('hp'),damage:multiply('damage'),speed:multiply('speed'),
    count:active.reduce((n,m)=>n*m.count,1),
    budget:HARD_MODE_BASE.budget,score:HARD_MODE_BASE.score,
    fixedCount:difficulty==='nightmare'?Math.min(3,Math.floor((waveNumber-1)/10)):0,
  });
}
// Compatibility for existing callers; Hard means one rotating modifier.
export function getHardWaveRules(mapId,waveNumber){
  return getDifficultyWaveRules(mapId,waveNumber,'hard');
}
export function getRunHardWaveRules(mapId,waveNumber,difficulty='hard'){
  return getDifficultyWaveRules(mapId,waveNumber,difficulty);
}
export function applyHardWaveCount(composition,rules){
  if(!rules||rules.count===1)return composition.map(row=>({...row}));
  return composition.map(row=>({...row,
    count:row.type==='giantbot'?row.count:
      Math.min(30,Math.max(1,Math.ceil(row.count*rules.count))),
  }));
}
let activeRules=null;
export function setActiveHardWave(rules){activeRules=rules}
export function getActiveHardWave(){return activeRules}
