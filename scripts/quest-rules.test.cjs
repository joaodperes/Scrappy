const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../js/questRules.js'),'utf8');
const mod=import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
const date=s=>new Date(s);
const profile=()=>({unlockedWeaponSkins:{PISTOL:[],SMG:[],SHOTGUN:[],DMR:[]}});
test('UTC day and ISO Monday rollover (not local timezone)',async()=>{
 const {questPeriods}=await mod;
 assert.deepEqual(questPeriods(date('2026-10-19T00:00:00Z')),{day:'2026-10-19',week:'2026-10-19'});
 assert.deepEqual(questPeriods(date('2026-10-25T23:59:59Z')),{day:'2026-10-25',week:'2026-10-19'});
 assert.deepEqual(questPeriods(date('2026-10-26T00:00:00Z')),{day:'2026-10-26',week:'2026-10-26'});
 assert.deepEqual(questPeriods(date('2027-01-01T10:00:00Z')),{day:'2027-01-01',week:'2026-12-28'});
});
test('events count PvE kills, waves and damage; not PvP kills or negative damage',async()=>{
 const {questDefinitions,trackQuestEvent,questProgress}=await mod;
 const d=date('2026-10-19T18:00:00Z'),p=profile();
 trackQuestEvent(p,'KILL',{botType:'pvp'},d);
 trackQuestEvent(p,'KILL',{botType:'scout'},d);
 trackQuestEvent(p,'KILL',{botType:'scout',source:'ENVIRONMENT'},d);
 trackQuestEvent(p,'DAMAGE_DEALT',{amount:1500,source:'PVP'},d);
 trackQuestEvent(p,'DAMAGE_DEALT',{amount:1100,source:'ENVIRONMENT'},d);
 trackQuestEvent(p,'KILL',{botType:'scout',source:'PVP'},d);
 trackQuestEvent(p,'WAVE_COMPLETE',{waveNum:9,source:'PVP'},d);
 trackQuestEvent(p,'DAMAGE_DEALT',{amount:3000},d);
 trackQuestEvent(p,'DAMAGE_DEALT',{amount:-100},d);
 trackQuestEvent(p,'WAVE_COMPLETE',{waveNum:1},d);
 const q=questDefinitions(d);
 assert.equal(questProgress(p,q.find(x=>x.id==='daily-pve-kills'),d).progress,1);
 assert.equal(questProgress(p,q.find(x=>x.id==='daily-damage'),d).complete,true);
 assert.equal(questProgress(p,q.find(x=>x.id==='daily-waves'),d).progress,1);
});
test('successful Collector claims are exactly-once and duplicate skin pays Scraps',async()=>{
 const {questDefinitions,trackQuestEvent,claimQuest,questProgress}=await mod;
 const d=date('2026-10-19T18:00:00Z'),p=profile(),q=questDefinitions(d).find(q=>q.id==='weekly-collector');
 assert.equal(claimQuest(p,q.id,d).ok,false);
 for(let i=0;i<220;i++)trackQuestEvent(p,'KILL',{botType:'scout'},d);
 assert.equal(questProgress(p,q,d).complete,true);
 const first=claimQuest(p,q.id,d);
 assert.equal(first.ok,true);
 assert.equal(first.scraps,0);
 assert.equal(p.unlockedWeaponSkins[q.reward.weapon].includes(q.reward.skin),true);
 assert.equal(claimQuest(p,q.id,d).ok,false);
 // A separate test profile with the same skin receives replacement currency.
 const duplicate=profile();duplicate.unlockedWeaponSkins[q.reward.weapon].push(q.reward.skin);
 for(let i=0;i<220;i++)trackQuestEvent(duplicate,'KILL',{botType:'scout'},d);
 assert.equal(claimQuest(duplicate,q.id,d).scraps,q.reward.duplicateScraps);
 assert.equal(duplicate.unlockedWeaponSkins[q.reward.weapon].length,1);
});
test('daily resets independently of weekly; expired claims cannot be replayed',async()=>{
 const {trackQuestEvent,questDefinitions,questProgress,claimQuest}=await mod;
 const mon=date('2026-10-19T18:00:00Z'),tue=date('2026-10-20T09:00:00Z'),p=profile();
 for(let i=0;i<20;i++)trackQuestEvent(p,'KILL',{botType:'scout'},mon);
 assert.equal(claimQuest(p,'daily-pve-kills',mon).scraps,40);
 assert.equal(claimQuest(p,'daily-pve-kills',mon).ok,false);
 assert.equal(questProgress(p,questDefinitions(tue).find(q=>q.id==='daily-pve-kills'),tue).progress,0);
 assert.equal(p.questProgress.weekly.metrics.pveKills,20);
 assert.equal(claimQuest(p,'daily-pve-kills',tue).ok,false);
 for(let i=0;i<20;i++)trackQuestEvent(p,'KILL',{botType:'scout'},tue);
 assert.equal(claimQuest(p,'daily-pve-kills',tue).scraps,40);
 assert.equal(p.scraps,80);
});

test('surplus maximum-level PvE weapon XP converts at 25:1 and carries remainder',async()=>{
 const {convertMaxedWeaponXp}=await mod;
 const p={scraps:0,stats:{weaponXp:{SMG:17990}}};
 assert.equal(convertMaxedWeaponXp(p,'SMG',19),0);
 assert.equal(p.stats.weaponXp.SMG,18000);
 assert.equal(p.weaponScrapRemainders.SMG,9);
 assert.equal(convertMaxedWeaponXp(p,'SMG',16),1);
 assert.equal(p.stats.weaponXp.SMG,18000);
 assert.equal(p.weaponScrapRemainders.SMG,0);
 assert.equal(p.scraps,1);
 assert.equal(convertMaxedWeaponXp(p,'SMG',50),2);
 assert.equal(p.scraps,3);
 assert.equal(convertMaxedWeaponXp(p,'KNIFE',-5),0);
 assert.equal(p.scraps,3);
});

test('partial cloud quest state is repaired without resetting valid progress',async()=>{
 const {ensureQuestState,questDefinitions,claimQuest,trackQuestEvent}=await mod;
 const d=date('2026-10-19T18:00:00Z');
 const p={scraps:60,questProgress:{
  daily:{key:'2026-10-19',metrics:{pveKills:17},claimed:'corrupt'},
  weekly:{key:'2026-10-19',metrics:null,claimed:null},
 }};
 ensureQuestState(p,d);
 assert.equal(p.questProgress.daily.metrics.pveKills,17);
 assert.equal(p.questProgress.daily.metrics.damage,0);
 assert.deepEqual(p.questProgress.daily.claimed,[]);
 assert.equal(p.questProgress.weekly.metrics.pveKills,0);
 for(let i=0;i<3;i++)trackQuestEvent(p,'KILL',{botType:'scout'},d);
 assert.equal(claimQuest(p,'daily-pve-kills',d).scraps,40);
 assert.equal(claimQuest(p,'daily-pve-kills',d).ok,false);
 assert.equal(p.scraps,100);
});
test('malformed Collector ownership list cannot crash or double-award quest skin',async()=>{
 const {questDefinitions,trackQuestEvent,claimQuest}=await mod;
 const d=date('2026-10-19T18:00:00Z');
 const q=questDefinitions(d).find(x=>x.id==='weekly-collector');
 const p={unlockedWeaponSkins:{[q.reward.weapon]:42}};
 for(let i=0;i<220;i++)trackQuestEvent(p,'KILL',{botType:'scout'},d);
 const first=claimQuest(p,q.id,d);
 assert.equal(first.ok,true);
 assert.equal(first.scraps,0);
 assert.deepEqual(p.unlockedWeaponSkins[q.reward.weapon],[q.reward.skin]);
 assert.equal(claimQuest(p,q.id,d).ok,false);
});
test('confirmed multiplayer damage explicitly identifies its PvP source',()=>{
 const pvp=fs.readFileSync(path.join(__dirname,'../js/pvp.js'),'utf8');
 assert.match(pvp,/emitEvent\('DAMAGE_DEALT',\{weaponKey:msg\.weapon\|\|curWep,amount:msg\.damage,source:'PVP'\}\)/);
});

test('local competitive arena events do not advance Survival-only quests',async()=>{
 const {ensureQuestState,trackQuestEvent}=await mod;
 const d=date('2026-10-19T18:00:00Z');
 const profile={};
 ensureQuestState(profile,d);
 trackQuestEvent(profile,'KILL',{botType:'arena',weaponKey:'SMG',source:'ARENA'},d);
 trackQuestEvent(profile,'DAMAGE_DEALT',{weaponKey:'SMG',amount:8000,source:'ARENA'},d);
 assert.equal(profile.questProgress.daily.metrics.pveKills,0);
 assert.equal(profile.questProgress.daily.metrics.damage,0);
 trackQuestEvent(profile,'KILL',{botType:'scout',source:'PLAYER'},d);
 assert.equal(profile.questProgress.daily.metrics.pveKills,1);
});

test('purchased weapon XP leaves only base capacity and converts PvE overflow',async()=>{
 const {convertMaxedWeaponXp}=await mod;
 const p={scraps:0,stats:{weaponXp:{SMG:17450}}};
 assert.equal(convertMaxedWeaponXp(p,'SMG',100,17500),2);
 assert.equal(p.stats.weaponXp.SMG,17500);
 assert.equal(p.scraps,2);
 const fullBonus={scraps:0,stats:{weaponXp:{PISTOL:0}}};
 assert.equal(convertMaxedWeaponXp(fullBonus,'PISTOL',50,0),2);
 assert.equal(fullBonus.stats.weaponXp.PISTOL,0);
 assert.equal(fullBonus.scraps,2);
});
test('arena XP source never enters Survival-only overflow-to-Scraps branch',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../js/progression.js'),'utf8');
 assert.match(s,/if\(botType==='arena'\|\|source==='ARENA'\)/);
 assert.match(s,/const baseCap=Math\.max\(0,maxWeaponXp-\(_shopWallet\.xpBonuses\[weaponKey\]\|\|0\)\)/);
 assert.match(s,/convertMaxedWeaponXp\(profile,weaponKey,wxp,baseCap\)/);
});
