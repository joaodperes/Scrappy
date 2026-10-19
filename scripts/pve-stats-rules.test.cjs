const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../js/pveStatsRules.js'),'utf8');
const rules=import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
const profile=()=>({stats:{bossWaveClears:5,maxWave:30},
  pveBuild:{ranks:{vitality:1,mobility:1,scavenger:0},equipment:null}});
test('PvE points depend on recorded earned milestones, not Scraps balance',async()=>{
 const {earnedPvePoints}=await rules;
 const p=profile();
 assert.equal(earnedPvePoints(p),5);
 p.scraps=99999999;
 assert.equal(earnedPvePoints(p),5);
 p.stats.maxWave=0;
 assert.equal(earnedPvePoints(p),0);
});
test('invalid/corrupt rank state clamps to earned pool and per-stat caps',async()=>{
 const {normalizedPveBuild}=await rules;
 const p=profile();
 p.pveBuild.ranks={vitality:99999,mobility:5,scavenger:-1};
 let b=normalizedPveBuild(p);
 assert.equal(b.ranks.vitality,5);
 assert.equal(b.ranks.mobility,0);
 assert.equal(b.spent,5);
 assert.equal(b.available,0);
 p.pveBuild.ranks={vitality:-12,mobility:'5',scavenger:1};
 b=normalizedPveBuild(p);
 assert.equal(b.ranks.vitality,0);
 assert.equal(b.ranks.mobility,0);
 assert.equal(b.ranks.scavenger,1);
});
test('allocating a point validates rank availability; respec refunds earned points',async()=>{
 const {allocatePvePoint,respecPveBuild,normalizedPveBuild}=await rules;
 const p=profile();
 assert.equal(normalizedPveBuild(p).available,3);
 const spent=allocatePvePoint(p,'mobility');
 assert.equal(spent.ok,true);
 assert.equal(spent.build.ranks.mobility,2);
 assert.equal(spent.build.available,2);
 assert.equal(allocatePvePoint(p,'invalid').ok,false);
 const all={...p,pveBuild:{ranks:{vitality:5,mobility:0,scavenger:0}}};
 assert.equal(allocatePvePoint(all,'mobility').ok,false);
 const reset=respecPveBuild(all);
 assert.equal(reset.available,5);
 assert.equal(reset.ranks.vitality,0);
 assert.equal(p.scraps,undefined);
});
test('only earned equipment may be equipped and only one piece at a time',async()=>{
 const {equipPveGear,normalizedPveBuild}=await rules;
 const p=profile();p.stats.maxWave=10;
 assert.equal(equipPveGear(p,'armoredVest').ok,true);
 assert.equal(equipPveGear(p,'sprintServos').ok,false);
 assert.equal(equipPveGear(p,'unknown').ok,false);
 p.pveBuild.equipment='sprintServos';
 assert.equal(normalizedPveBuild(p).equipment,null);
});
test('all competitive modes ignore PvE equipment and stat bonuses',async()=>{
 const {pveModifiers}=await rules;
 const build={ranks:{vitality:5,mobility:5,scavenger:5},equipment:'armoredVest'};
 assert.deepEqual(pveModifiers(build,'ffa'),{maxHp:100,speedMult:1,ammoDropMult:1,startingArmor:0});
 assert.deepEqual(pveModifiers(build,'tdm'),{maxHp:100,speedMult:1,ammoDropMult:1,startingArmor:0});
 assert.deepEqual(pveModifiers(build,'gunGame'),{maxHp:100,speedMult:1,ammoDropMult:1,startingArmor:0});
 const survival=pveModifiers(build,'survival');
 assert.equal(survival.maxHp,125);
 assert.equal(survival.startingArmor,15);
});
