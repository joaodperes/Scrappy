const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../js/profileSyncRules.js'),'utf8')
 .replace(/^export /gm,'');
const context={};vm.createContext(context);
vm.runInContext(source+'\nthis.rules={reconcileProfile,importLegacyProfile};',context);
const {reconcileProfile,importLegacyProfile}=context.rules;
const copy=x=>JSON.parse(JSON.stringify(x));
function baseline(){
 return {firebaseUid:'test-account',totalXp:1000,level:4,scraps:50,
  stats:{weaponXp:{SMG:100},totalKills:10,maxWave:8},
  unlocked:['default'],questProgress:{
   daily:{key:'2026-10-21',metrics:{pveKills:6},claimed:[]}},
  loadouts:{SMG:{skin:'default'}}};
}
test('merges independent earned deltas without overwriting unlocks or loadouts',()=>{
 const base=baseline(),local=copy(base),remote=copy(base);
 local.totalXp+=90;local.scraps+=15;local.stats.weaponXp.SMG+=20;
 local.stats.totalKills+=3;local.unlocked.push('forest');
 local.questProgress.daily.metrics.pveKills+=2;
 local.questProgress.daily.claimed.push('daily-pve-kills');
 remote.totalXp+=60;remote.scraps+=10;remote.stats.weaponXp.SMG+=8;
 remote.stats.totalKills+=1;remote.unlocked.push('ghost');
 remote.loadouts.SMG.skin='ghost';
 const result=copy(reconcileProfile(base,local,remote,{levelForXp:xp=>Math.floor(xp/250)}));
 assert.equal(result.totalXp,1150);
 assert.equal(result.level,4);
 assert.equal(result.scraps,75);
 assert.equal(result.stats.weaponXp.SMG,128);
 assert.equal(result.stats.totalKills,14);
 assert.deepEqual(result.unlocked,['default','ghost','forest']);
 assert.equal(result.loadouts.SMG.skin,'ghost');
 assert.equal(result.questProgress.daily.metrics.pveKills,8);
 assert.deepEqual(result.questProgress.daily.claimed,['daily-pve-kills']);
});
test('caps weapon XP including purchased bonuses and keeps highest wave',()=>{
 const base=baseline(),local=copy(base),remote=copy(base);
 local.stats.weaponXp.SMG=17500;remote.stats.weaponXp.SMG=17000;
 local.stats.maxWave=20;remote.stats.maxWave=12;
 const result=reconcileProfile(base,local,remote,{weaponXpCaps:{SMG:16500}});
 assert.equal(result.stats.weaponXp.SMG,16500);
 assert.equal(result.stats.maxWave,20);
});
test('quest period rollover never combines yesterday and today',()=>{
 const base=baseline(),local=copy(base),remote=copy(base);
 local.questProgress.daily.metrics.pveKills=20;
 remote.questProgress.daily={key:'2026-10-22',metrics:{pveKills:1},claimed:[]};
 const result=reconcileProfile(base,local,remote);
 assert.equal(result.questProgress.daily.key,'2026-10-22');
 assert.equal(result.questProgress.daily.metrics.pveKills,1);
});
test('old local cache is imported conservatively, not double-credited',()=>{
 const remote=baseline(),legacy=copy(remote);
 legacy.totalXp=1200;legacy.scraps=65;legacy.unlocked.push('forest');
 const result=importLegacyProfile(legacy,remote);
 assert.equal(result.totalXp,1200);
 assert.equal(result.scraps,65);
 assert.deepEqual(copy(result.unlocked),['default','forest']);
 assert.equal(importLegacyProfile({...legacy,firebaseUid:'wrong-user'},remote).totalXp,1000);
});
