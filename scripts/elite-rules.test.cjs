// node --test scripts/elite-rules.test.cjs
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../js/eliteRules.js'),'utf8');
const url='data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const load=()=>import(url);
const lineup=[
  {type:'scout',count:8},{type:'heavy',count:5},
  {type:'giantbot',count:2},{type:'swarm_host',count:3},
];
test('Elites never appear in Normal Survival or before Hard wave 5',async()=>{
  const {getEliteSpawnPlan}=await load();
  for(const difficulty of ['normal','hard','nightmare']){
    for(let wave=1;wave<=4;wave++)
      assert.deepEqual(getEliteSpawnPlan('city',wave,difficulty,lineup),[]);
  }
  assert.deepEqual(getEliteSpawnPlan('city',35,'normal',lineup),[]);
});
test('Wave plans are deterministic, bounded and do not change wave counts',async()=>{
  const {getEliteSpawnPlan}=await load();
  const original=JSON.stringify(lineup);
  for(const map of ['city','scrapyard','jungle','terminal']){
    for(const difficulty of ['hard','nightmare']){
      for(let wave=5;wave<=50;wave++){
        const a=getEliteSpawnPlan(map,wave,difficulty,lineup);
        assert.deepEqual(a,getEliteSpawnPlan(map,wave,difficulty,lineup));
        assert.ok(a.length<=Math.floor(13/4));
        assert.ok(a.length<=3);
        assert.ok(a.reduce((n,e)=>n+e.traits.length,0)<=4);
        if(wave%10===0)assert.ok(a.length<=1);
        for(const e of a){
          assert.notEqual(lineup[e.groupIndex].type,'giantbot');
          assert.notEqual(lineup[e.groupIndex].type,'swarm_host');
          assert.ok(e.unitIndex<lineup[e.groupIndex].count);
          assert.equal(new Set(e.traits).size,e.traits.length);
        }
        assert.equal(new Set(a.map(e=>e.groupIndex+':'+e.unitIndex)).size,a.length);
      }
    }
  }
  assert.equal(JSON.stringify(lineup),original);
});
test('Traits stack once and keep incoming damage and healing finite',async()=>{
  const {getEliteBonuses,ELITE_TRAITS}=await load();
  assert.equal(getEliteBonuses(['bulwark']).damageTaken,0.78);
  assert.equal(getEliteBonuses(['regenerator']).regenPerSecond,0.02);
  const mix=getEliteBonuses(['bulwark','regenerator']);
  assert.equal(mix.hp,ELITE_TRAITS.bulwark.hp*ELITE_TRAITS.regenerator.hp);
  assert.equal(mix.score,2);
  assert.equal(mix.xp,2);
  for(const k of ['hp','damage','speed','rate','damageTaken'])
    assert.ok(Number.isFinite(mix[k])&&mix[k]>0);
  for(const bad of [[],['invalid'],['bulwark','bulwark'],['bulwark','frenzied','regenerator']])
    assert.throws(()=>getEliteBonuses(bad));
});
test('Dual traits start no earlier than wave 25; boss group never Elite',async()=>{
  const {getEliteSpawnPlan}=await load();
  assert.ok(getEliteSpawnPlan('city',24,'hard',lineup).every(x=>x.traits.length===1));
  assert.ok(getEliteSpawnPlan('city',25,'hard',lineup).some(x=>x.traits.length===2));
  assert.ok(getEliteSpawnPlan('city',30,'nightmare',lineup).every(x=>x.traits.length===1));
  assert.deepEqual(getEliteSpawnPlan('city',40,'hard',[{type:'giantbot',count:4}]),[]);
});
test('Invalid wave and difficulty inputs fail closed',async()=>{
  const {getEliteSpawnPlan}=await load();
  assert.throws(()=>getEliteSpawnPlan('city',0,'hard',lineup));
  assert.throws(()=>getEliteSpawnPlan('city',1.2,'hard',lineup));
  assert.throws(()=>getEliteSpawnPlan('city',10,'elite',lineup));
});
