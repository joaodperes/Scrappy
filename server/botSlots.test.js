const test=require('node:test');
const assert=require('node:assert/strict');
const {PRESETS,validateBotCatalog,planBotSlots}=require('./botSlots.js');
test('personality file has bounded and uniquely identified archetypes',()=>{
 assert.deepEqual(validateBotCatalog(),[]);
 assert.ok(PRESETS.length>=6);
 assert.equal(new Set(PRESETS.map(x=>x.id)).size,PRESETS.length);
});
test('only explicit competitive bot fill creates server-owned bots',()=>{
 assert.equal(planBotSlots({mode:'survival',maxPlayers:6,fillBots:true}).length,0);
 assert.equal(planBotSlots({mode:'ffa',maxPlayers:6,fillBots:false}).length,0);
 assert.equal(planBotSlots({mode:'ffa',maxPlayers:8,fillBots:true}).length,0);
 const a=planBotSlots({mode:'ffa',maxPlayers:6,fillBots:true},[{id:'h1'}]);
 assert.equal(a.length,5);
 assert.ok(a.every(x=>x.owner==='server'&&x.loadout.primary&&x.loadout.secondary));
 assert.equal(new Set(a.map(x=>x.id)).size,a.length);
});
test('human joiners always replace one bot slot; existing bot slot IDs stay stable',()=>{
 const cfg={mode:'ffa',maxPlayers:10,fillBots:true};
 const first=planBotSlots(cfg,[{id:'host'}],1);
 const second=planBotSlots(cfg,[{id:'host'},{id:'guest'}],1);
 assert.equal(first.length,9);
 assert.equal(second.length,8);
 assert.deepEqual(second.map(x=>x.id),first.slice(0,8).map(x=>x.id));
 assert.deepEqual(planBotSlots(cfg,Array.from({length:10},(_,i)=>({id:i}))),[]);
});
test('TDM creates equal potential teams for all three permitted capacities',()=>{
 for(const n of [6,10,14]){
  const cfg={mode:'tdm',maxPlayers:n,fillBots:true};
  const humans=[{id:'a',team:'RED'},{id:'b',team:'BLUE'},{id:'c',team:'RED'}];
  const bots=planBotSlots(cfg,humans,4);
  assert.equal(bots.length,n-humans.length);
  assert.equal(bots.filter(x=>x.team==='RED').length+2,n/2);
  assert.equal(bots.filter(x=>x.team==='BLUE').length+1,n/2);
 }
});
test('invalid catalog and large human list are safe',()=>{
 assert.ok(validateBotCatalog({version:1,personalities:[{id:'bad'}]}).length);
 assert.deepEqual(planBotSlots({mode:'tdm',fillBots:true,maxPlayers:6},
   Array.from({length:7},(_,i)=>({id:i}))),[]);
});
