// Deterministic Hard/Nightmare Elite encounters. Pure rules: no DOM, Babylon
// or random global state. Normal Survival never receives Elites.
export const ELITE_RULES_VERSION=1;
export const ELITE_TRAITS=Object.freeze({
  bulwark:Object.freeze({
    id:'bulwark',label:'BULWARK',color:0xffc247,
    hp:1.65,damage:1,speed:0.92,rate:1,damageTaken:0.78,regenPerSecond:0,
  }),
  frenzied:Object.freeze({
    id:'frenzied',label:'FRENZIED',color:0xff4d64,
    hp:1,damage:1.12,speed:1.08,rate:0.95,damageTaken:1,regenPerSecond:0,
  }),
  regenerator:Object.freeze({
    id:'regenerator',label:'REGENERATOR',color:0x42ead1,
    hp:1.3,damage:1,speed:1,rate:1,damageTaken:1,regenPerSecond:0.02,
  }),
});
const TRAIT_IDS=Object.freeze(Object.keys(ELITE_TRAITS));
const hash=text=>{
  let value=2166136261;
  for(const c of String(text)){
    value=Math.imul(value^c.charCodeAt(0),16777619)>>>0;
  }
  return value>>>0;
};
const next=s=>(Math.imul(s,1664525)+1013904223)>>>0;

export function getEliteBonuses(traits){
  if(!Array.isArray(traits)||traits.length<1||traits.length>2 ||
      new Set(traits).size!==traits.length ||
      traits.some(id=>!Object.hasOwn(ELITE_TRAITS,id))) {
    throw Error('Invalid Elite trait combination');
  }
  const result={hp:1,damage:1,speed:1,rate:1,damageTaken:1,
    regenPerSecond:0,score:1+traits.length*0.5,xp:1+traits.length*0.5};
  for(const id of traits){
    const t=ELITE_TRAITS[id];
    for(const field of ['hp','damage','speed','rate','damageTaken'])
      result[field]*=t[field];
    result.regenPerSecond+=t.regenPerSecond;
  }
  return Object.freeze(result);
}

// Each trait consumes one budget point. Non-boss enemies only; boss waves
// allow at most one Elite minion. Dual traits begin at wave 25, but count as
// two budget points. Never mutate the map's wave composition.
export function getEliteSpawnPlan(mapId,wave,difficulty,composition){
  if(!Number.isInteger(wave)||wave<1)throw Error('Invalid wave number');
  if(!['normal','hard','nightmare'].includes(difficulty))
    throw Error('Invalid Elite difficulty');
  if(!Array.isArray(composition))throw Error('Invalid wave composition');
  if(difficulty==='normal'||wave<5)return Object.freeze([]);
  const candidates=[];
  composition.forEach((group,groupIndex)=>{
    if(group.type==='giantbot'||group.type==='swarm_host'||!Number.isInteger(group.count)||group.count<1)return;
    for(let unitIndex=0;unitIndex<group.count;unitIndex++)
      candidates.push({groupIndex,unitIndex,type:group.type});
  });
  const tier=1+Math.floor((wave-5)/8);
  const bossWave=wave%10===0;
  let budget=Math.min(4,tier),maximum=Math.min(3,tier,Math.floor(candidates.length/4));
  if(bossWave){budget=Math.min(1,budget);maximum=Math.min(1,maximum);}
  if(!maximum||!budget)return Object.freeze([]);
  // Stable local shuffle without consuming Math.random() used by the map.
  let seed=hash(mapId+':'+wave+':'+composition.map(g=>g.type+':'+g.count).join('|'));
  for(let i=candidates.length-1;i>0;i--){
    seed=next(seed);
    const j=seed%(i+1);
    [candidates[i],candidates[j]]=[candidates[j],candidates[i]];
  }
  const result=[];
  for(const candidate of candidates){
    if(result.length>=maximum||budget<=0)break;
    const valid=TRAIT_IDS.filter(id=>!(id==='frenzied' &&
      ['medic_bot'].includes(candidate.type)));
    seed=next(seed);
    const first=valid[seed%valid.length];
    const traits=[first];
    // At high waves, occasionally assign a distinct second trait.
    // Only one two-trait Elite per wave, keeping encounters legible.
    if(wave>=25&&!bossWave&&budget>=2&&result.length===0){
      const other=valid.filter(id=>id!==first);
      if(other.length){seed=next(seed);traits.push(other[seed%other.length]);}
    }
    budget-=traits.length;
    result.push(Object.freeze({
      groupIndex:candidate.groupIndex,unitIndex:candidate.unitIndex,
      traits:Object.freeze(traits),
    }));
  }
  return Object.freeze(result);
}
