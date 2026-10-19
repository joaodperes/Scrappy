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
