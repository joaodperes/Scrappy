// Pure UTC quest rules. Local profile rewards are provisional until the
// authoritative identity/ledger implementation (priority 13) ships.
export const COLLECTOR_SKINS=Object.freeze(['aurora','nebula','cinder','tundra']);
export const COLLECTOR_WEAPONS=Object.freeze(['PISTOL','SMG','SHOTGUN','DMR']);
const period=(date)=> {
  const d=new Date(date);
  if(!Number.isFinite(d.getTime()))throw Error('Invalid quest timestamp');
  return d;
};
export function questPeriods(date=new Date()){
  const d=period(date);
  const day=d.toISOString().slice(0,10);
  const midnight=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));
  // ISO Monday of the active UTC week, stable over month/year boundaries.
  const monday=new Date(midnight.getTime()-((midnight.getUTCDay()+6)%7)*86400000);
  return {day,week:monday.toISOString().slice(0,10)};
}
function rotation(periodString){
  let n=0;for(const char of periodString)n=(Math.imul(n,31)+char.charCodeAt(0))>>>0;
  return n>>>0;
}
export function questDefinitions(date=new Date()){
  const {day,week}=questPeriods(date);
  const ix=Math.floor(Date.parse(week+'T00:00:00Z')/604800000);
  const weapon=COLLECTOR_WEAPONS[((ix%COLLECTOR_WEAPONS.length)+COLLECTOR_WEAPONS.length)%COLLECTOR_WEAPONS.length];
  const skin=COLLECTOR_SKINS[((ix%COLLECTOR_SKINS.length)+COLLECTOR_SKINS.length)%COLLECTOR_SKINS.length];
  return [
    {id:'daily-pve-kills',cadence:'daily',period:day,label:'Skirmisher',desc:'Defeat 20 PvE enemies',metric:'pveKills',target:20,reward:{scraps:40}},
    {id:'daily-damage',cadence:'daily',period:day,label:'Damage Dealer',desc:'Deal 3,000 damage',metric:'damage',target:3000,reward:{scraps:55}},
    {id:'daily-waves',cadence:'daily',period:day,label:'Hold The Line',desc:'Complete 3 Survival waves',metric:'waves',target:3,reward:{scraps:40}},
    {id:'weekly-pve-kills',cadence:'weekly',period:week,label:'Veteran Hunter',desc:'Defeat 150 PvE enemies',metric:'pveKills',target:150,reward:{scraps:275}},
    {id:'weekly-waves',cadence:'weekly',period:week,label:'Endurance',desc:'Complete 24 Survival waves',metric:'waves',target:24,reward:{scraps:240}},
    {id:'weekly-collector',cadence:'weekly',period:week,label:'Collector: '+skin.toUpperCase(),desc:'Defeat 220 PvE enemies to obtain a '+skin+' '+weapon+' finish',metric:'pveKills',target:220,
       reward:{skin,weapon,duplicateScraps:200}},
  ];
}
const fresh=(key)=>({key,metrics:{pveKills:0,damage:0,waves:0},claimed:[]});
export function ensureQuestState(profile,date=new Date()){
  if(!profile.questProgress || typeof profile.questProgress!=='object')profile.questProgress={};
  const {day,week}=questPeriods(date);
  if(profile.questProgress.daily?.key!==day)profile.questProgress.daily=fresh(day);
  if(profile.questProgress.weekly?.key!==week)profile.questProgress.weekly=fresh(week);
  if(!Number.isSafeInteger(profile.scraps)||profile.scraps<0)profile.scraps=0;
  return profile.questProgress;
}
export function trackQuestEvent(profile,event,payload={},date=new Date()){
  const state=ensureQuestState(profile,date);
  let metric=null,amount=0;
  if(event==='KILL' && payload.botType && payload.botType!=='pvp' && payload.source!=='ENVIRONMENT'){
    metric='pveKills';amount=1;
  } else if(event==='DAMAGE_DEALT'){
    metric='damage';amount=Math.max(0,Math.floor(Number(payload.amount)||0));
  } else if(event==='WAVE_COMPLETE' && Number.isFinite(payload.waveNum)){
    metric='waves';amount=1;
  }
  if(!metric||!amount)return state;
  for(const cadence of ['daily','weekly']){
    const values=state[cadence].metrics;
    values[metric]=Math.min(1000000000,Math.max(0,Math.floor(Number(values[metric])||0))+amount);
  }
  return state;
}
export function questProgress(profile,definition,date=new Date()){
  const periods=questPeriods(date);
  if(!definition || definition.period!==periods[definition.cadence==='daily'?'day':'week'])return {progress:0,complete:false,claimed:false,expired:true};
  const state=ensureQuestState(profile,date)[definition.cadence];
  const progress=Math.min(definition.target,Math.max(0,Number(state.metrics[definition.metric])||0));
  return {progress,complete:progress>=definition.target,claimed:state.claimed.includes(definition.id),expired:false};
}
export function claimQuest(profile,id,date=new Date()){
  const definition=questDefinitions(date).find(q=>q.id===id);
  if(!definition)return {ok:false,reason:'Unknown quest'};
  const progress=questProgress(profile,definition,date);
  if(progress.claimed)return {ok:false,reason:'Already claimed'};
  if(!progress.complete)return {ok:false,reason:'Quest incomplete'};
  const state=profile.questProgress[definition.cadence];
  // Claim ledger first: prevents duplicate payouts even when called repeatedly.
  state.claimed.push(id);
  let scraps=definition.reward.scraps||0,skin=null;
  if(definition.reward.skin){
    const {weapon,skin:skinId,duplicateScraps}=definition.reward;
    if(!profile.unlockedWeaponSkins || typeof profile.unlockedWeaponSkins!=='object')profile.unlockedWeaponSkins={};
    const owned=profile.unlockedWeaponSkins[weapon]||[];
    if(owned.includes(skinId))scraps+=duplicateScraps;
    else {
      profile.unlockedWeaponSkins[weapon]=[...owned,skinId];
      skin={weapon,id:skinId};
    }
  }
  profile.scraps+=scraps;
  return {ok:true,scraps,skin};
}

/**
 * 25 XP above the maximum weapon level converts to 1 Scrap. Carry fractional
 * progress per weapon; no PvP or synthetic damage source is eligible here.
 * Called only from the PvE KILL pipeline, not client-supplied PvP rewards.
 */
export function convertMaxedWeaponXp(profile,weapon,earned,maxXp=18000){
  if(!weapon||!Number.isFinite(earned)||earned<=0||!Number.isFinite(maxXp)||maxXp<=0)
    return 0;
  const stats=profile.stats||{};
  const xp=stats.weaponXp||{};
  const prev=Math.max(0,Math.floor(Number(xp[weapon])||0));
  const added=Math.max(0,Math.floor(earned));
  const overshoot=Math.max(0,prev+added-maxXp)-Math.max(0,prev-maxXp);
  xp[weapon]=Math.min(maxXp,prev+added);
  stats.weaponXp=xp;
  profile.stats=stats;
  if(overshoot<=0)return 0;
  const carry=profile.weaponScrapRemainders||{};
  const cumulative=(Math.max(0,Math.floor(carry[weapon]||0))+overshoot);
  const scraps=Math.floor(cumulative/25);
  carry[weapon]=cumulative%25;
  profile.weaponScrapRemainders=carry;
  if(scraps>0)profile.scraps=(Math.max(0,Math.floor(profile.scraps||0))+scraps);
  return scraps;
}
