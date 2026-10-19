const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../js/localArenaRules.js'),'utf8');
const lib=import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
test('Gun Game seeded ladder is stable, unique and Pistol to Knife',async()=>{
 const {localGunOrder}=await lib;
 const a=localGunOrder(1187);
 assert.deepEqual(a,localGunOrder(1187));
 assert.equal(a[0],'PISTOL');assert.equal(a.at(-1),'KNIFE');
 assert.equal(new Set(a).size,a.length);
 assert.notDeepEqual(a,localGunOrder(3001));
});
test('Gun Game advances only with equipped rung and ends after Knife',async()=>{
 const {createLocalArena,localArenaKill}=await lib;
 let state=createLocalArena({mode:'gunGame',scoreLimit:1});
 assert.equal(localArenaKill(state,{weapon:'SMG'}),state);
 for(const weapon of state.gunOrder){
   state=localArenaKill(state,{weapon});
   if(weapon!=='KNIFE')assert.equal(state.complete,false);
 }
 assert.equal(state.complete,true);assert.equal(state.result,'VICTORY');
});
test('Kill Confirmed demands tag pickup for points and disallows double pickup',async()=>{
 const {createLocalArena,localArenaKill,localArenaTag}=await lib;
 let state=createLocalArena({mode:'killConfirmed',scoreLimit:1});
 state=localArenaKill(state,{weapon:'SMG'});
 assert.equal(state.score,0);assert.equal(state.pendingTags,1);
 state=localArenaTag(state);
 assert.equal(state.score,1);assert.equal(state.complete,true);
 assert.equal(localArenaTag(state),state);
});
test('expired Kill Confirmed tags clear outstanding token counts',async()=>{
 const {createLocalArena,localArenaKill,localArenaTagExpired,localArenaTag}=await lib;
 let state=createLocalArena({mode:'killConfirmed',scoreLimit:2});
 state=localArenaKill(state,{weapon:'SMG'});
 assert.equal(state.pendingTags,1);
 state=localArenaTagExpired(state);
 assert.equal(state.pendingTags,0);
 assert.equal(localArenaTagExpired(state),state);
 assert.equal(localArenaTag(state),state);
 assert.equal(state.score,0);
});
test('time and death resolve local match; invalid states and kill sources are safe',async()=>{
 const {createLocalArena,localArenaDeath,tickLocalArena,localArenaKill}=await lib;
 const state=createLocalArena({mode:'tdm',duration:60,scoreLimit:2});
 assert.equal(localArenaKill(state,{source:'ENVIRONMENT'}),state);
 let next=localArenaDeath(state);next=localArenaDeath(next);
 assert.equal(next.result,'DEFEAT');
 assert.equal(tickLocalArena(next,3),next);
 const timed=tickLocalArena({...state,secondsLeft:0.1},0.25);
 assert.equal(timed.complete,true);assert.equal(timed.result,'DRAW');
});

test('Gun Game bots each run independent full weapon ladders; no early score-limit victory',async()=>{
 const {createLocalArena,localArenaBotKill}=await lib;
 let state=createLocalArena({mode:'gunGame',scoreLimit:1,seed:42});
 const guns=state.gunOrder;
 for(let i=0;i<guns.length-1;i++){
   state=localArenaBotKill(state,{killerId:'alpha',killerTeam:'BOT_0',victimTeam:'BOT_1',weapon:guns[i]});
   assert.equal(state.complete,false);
   assert.equal(state.botGuns.alpha,i+1);
 }
 assert.equal(state.botGuns.alpha,guns.length-1);
 state=localArenaBotKill(state,{killerId:'beta',killerTeam:'BOT_1',victimTeam:'BOT_0',weapon:guns[0]});
 assert.equal(state.botGuns.beta,1);
 assert.equal(state.complete,false);
 const won=localArenaBotKill(state,{killerId:'alpha',killerTeam:'BOT_0',victimTeam:'BOT_1',weapon:'KNIFE'});
 assert.equal(won.complete,true);
 assert.equal(won.result,'DEFEAT');
});
test('FFA scores unique bot killers; TDM scores team frag and ignores friendly fire',async()=>{
 const {createLocalArena,localArenaBotKill,localArenaDeath}=await lib;
 let ffa=createLocalArena({mode:'ffa',scoreLimit:3});
 ffa=localArenaBotKill(ffa,{killerId:'alpha',killerTeam:'A',victimTeam:'B',weapon:'SMG'});
 ffa=localArenaBotKill(ffa,{killerId:'beta',killerTeam:'B',victimTeam:'A',weapon:'SHOTGUN'});
 assert.equal(ffa.opposition,1);
 assert.equal(ffa.botScores.alpha,1);
 assert.equal(ffa.botScores.beta,1);
 ffa=localArenaDeath(ffa,{killerId:'alpha',killerTeam:'A',weapon:'SMG'});
 assert.equal(ffa.botScores.alpha,2);
 assert.equal(ffa.deaths,1);
 let tdm=createLocalArena({mode:'tdm',scoreLimit:2});
 tdm=localArenaBotKill(tdm,{killerId:'ally',killerTeam:'RED',victimTeam:'BLUE',weapon:'DMR'});
 assert.equal(tdm.score,1);
 assert.equal(localArenaBotKill(tdm,{killerId:'ally',killerTeam:'RED',victimTeam:'RED',weapon:'DMR'),tdm);
 tdm=localArenaBotKill(tdm,{killerId:'foe',killerTeam:'BLUE',victimTeam:'RED',weapon:'SMG'});
 assert.equal(tdm.opposition,1);
});
test('Kill Confirmed bots claim enemy tags, deny friendly tags, and progress by objectives',async()=>{
 const {createLocalArena,localArenaBotKill,localArenaBotTag}=await lib;
 let s=createLocalArena({mode:'killConfirmed',scoreLimit:2});
 s=localArenaBotKill(s,{killerId:'enemy',killerTeam:'BLUE',victimTeam:'RED',weapon:'SMG'});
 assert.equal(s.score,0);assert.equal(s.opposition,0);
 assert.equal(localArenaBotTag(s,{collectorId:'blue',collectorTeam:'BLUE',tagTeam:'BLUE'}),s);
 s=localArenaBotTag(s,{collectorId:'red',collectorTeam:'RED',tagTeam:'BLUE'});
 assert.equal(s.score,0); // no pending tag in this synthetic test
 s={...s,pendingTags:1};
 s=localArenaBotTag(s,{collectorId:'ally',collectorTeam:'RED',tagTeam:'BLUE'});
 assert.equal(s.score,1);assert.equal(s.pendingTags,0);
 s=localArenaBotTag(s,{collectorId:'enemy',collectorTeam:'BLUE',tagTeam:'RED'});
 assert.equal(s.opposition,1);
});
