// Data-driven, deterministic Hard Mode rules. No imports and no RNG.
// A modifier lasts three waves, allowing players to adapt tactics.
export const HARD_MODE_VERSION=1;
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
export function getHardWaveRules(mapId,waveNumber){
  if(!Number.isInteger(waveNumber)||waveNumber<1)throw Error('Invalid wave number');
  const value=String(mapId||'scrapyard');
  let seed=0;
  for(const ch of value)seed=(seed*31+ch.charCodeAt(0))>>>0;
  const index=(seed+Math.floor((waveNumber-1)/3))%HARD_MODE_MODIFIERS.length;
  const modifier=HARD_MODE_MODIFIERS[index];
  return Object.freeze({
    version:HARD_MODE_VERSION,wave:waveNumber,mapId:value,
    modifier,
    hp:HARD_MODE_BASE.hp*modifier.hp,
    damage:HARD_MODE_BASE.damage*modifier.damage,
    speed:HARD_MODE_BASE.speed*modifier.speed,
    score:HARD_MODE_BASE.score,
    budget:HARD_MODE_BASE.budget,
    count:modifier.count,
  });
}
let openingModifierId=null;
// Optional player choice controls the first 3-wave modifier. Later blocks
// rotate predictably through the other modes; 'auto' uses the map seed.
export function setHardModeOpeningModifier(id='auto'){
  const selected=id||'auto';
  if(selected!=='auto'&&!HARD_MODE_MODIFIERS.some(m=>m.id===selected))
    throw Error('Unknown Hard Mode modifier: '+selected);
  openingModifierId=selected==='auto'?null:selected;
}
export function getRunHardWaveRules(mapId,waveNumber){
  const auto=getHardWaveRules(mapId,waveNumber);
  if(!openingModifierId)return auto;
  const start=HARD_MODE_MODIFIERS.findIndex(m=>m.id===openingModifierId);
  const index=(start+Math.floor((waveNumber-1)/3))%HARD_MODE_MODIFIERS.length;
  const mod=HARD_MODE_MODIFIERS[index];
  return Object.freeze({...auto,modifier:mod,
    hp:HARD_MODE_BASE.hp*mod.hp,damage:HARD_MODE_BASE.damage*mod.damage,
    speed:HARD_MODE_BASE.speed*mod.speed,count:mod.count});
}
export function applyHardWaveCount(composition,rules){
  if(!rules || rules.count===1)return composition.map(row=>({...row}));
  return composition.map(row=>({...row,
    count:row.type==='giantbot'?row.count:Math.min(30,Math.max(1,Math.ceil(row.count*rules.count))),
  }));
}
let activeRules=null;
export function setActiveHardWave(rules){activeRules=rules}
export function getActiveHardWave(){return activeRules}
