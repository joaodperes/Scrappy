// Pure PvE-only stat/equipment rules. No paid/Scraps unlocks and no PvP
// gameplay integration. Real equip UI and balance need owner playtest.
export const PVE_STAT_KEYS=Object.freeze(['vitality','mobility','scavenger']);
export const PVE_EQUIPMENT=Object.freeze({
  armoredVest:Object.freeze({unlocksAtWave:10,label:'Armored Vest'}),
  sprintServos:Object.freeze({unlocksAtWave:20,label:'Sprint Servos'}),
  ammoHarness:Object.freeze({unlocksAtWave:30,label:'Ammo Harness'}),
});
export const MAX_RANK=5;
export function earnedPvePoints(profile){
  // Existing PvE progression tracks boss-wave clears and highest wave.
  // Prevent unlimited benefit from repeating a trivial wave: maximum
  // possible budget is bounded by the highest achieved wave.
  const bossClears=Math.max(0,Math.floor(Number(profile?.stats?.bossWaveClears)||0));
  const maxWave=Math.max(0,Math.floor(Number(profile?.stats?.maxWave)||0));
  return Math.min(15,bossClears,Math.floor(maxWave/10)*2);
}
export function normalizedPveBuild(profile){
  const budget=earnedPvePoints(profile);
  const raw=profile?.pveBuild||{};
  const ranks={vitality:0,mobility:0,scavenger:0};
  let used=0;
  for(const key of PVE_STAT_KEYS){
    const rank=raw.ranks?.[key];
    const safe=Number.isSafeInteger(rank)&&rank>=0?Math.min(MAX_RANK,rank):0;
    ranks[key]=Math.min(safe,Math.max(0,budget-used));
    used+=ranks[key];
  }
  const bestWave=Math.max(0,Math.floor(Number(profile?.stats?.maxWave)||0));
  const equipment=Object.hasOwn(PVE_EQUIPMENT,raw.equipment)&&
      bestWave>=PVE_EQUIPMENT[raw.equipment].unlocksAtWave
    ?raw.equipment:null;
  return {ranks,equipment,earned:budget,spent:used,available:budget-used};
}
export function allocatePvePoint(profile,key){
  const build=normalizedPveBuild(profile);
  if(!PVE_STAT_KEYS.includes(key))return {ok:false,reason:'Unknown PvE stat',build};
  if(build.available<=0)return {ok:false,reason:'No earned points',build};
  if(build.ranks[key]>=MAX_RANK)return {ok:false,reason:'Stat is at maximum rank',build};
  build.ranks[key]++;
  return {ok:true,build:{...build,spent:build.spent+1,available:build.available-1}};
}
export function respecPveBuild(profile){
  const budget=earnedPvePoints(profile);
  return {ranks:{vitality:0,mobility:0,scavenger:0},
    equipment:normalizedPveBuild(profile).equipment,earned:budget,
    spent:0,available:budget};
}
export function equipPveGear(profile,id){
  const build=normalizedPveBuild(profile);
  if(!Object.hasOwn(PVE_EQUIPMENT,id))
    return {ok:false,reason:'Unknown equipment',build};
  const best=Math.max(0,Math.floor(Number(profile?.stats?.maxWave)||0));
  if(best<PVE_EQUIPMENT[id].unlocksAtWave)
    return {ok:false,reason:'Equipment not earned',build};
  return {ok:true,build:{...build,equipment:id}};
}
export function unequipPveGear(profile){
 const build=normalizedPveBuild(profile);
 return {...build,equipment:null};
}
export function pveModifiers(build,mode='survival'){
  // Never allow profile bonuses in human-versus-human matches.
  if(mode!=='survival')return {maxHp:100,speedMult:1,ammoDropMult:1,startingArmor:0};
  const ranks=build?.ranks||{};
  const bounded=key=>Number.isSafeInteger(ranks[key])
    ?Math.max(0,Math.min(MAX_RANK,ranks[key])):0;
  const vitality=bounded('vitality');
  const mobility=bounded('mobility');
  const scavenger=bounded('scavenger');
  return {
    maxHp:100+5*vitality,
    speedMult:1+0.012*mobility+(build.equipment==='sprintServos'?0.035:0),
    ammoDropMult:1+0.035*scavenger+(build.equipment==='ammoHarness'?0.1:0),
    startingArmor:build.equipment==='armoredVest'?15:0,
  };
}
