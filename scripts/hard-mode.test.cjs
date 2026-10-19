// node --test scripts/hard-mode.test.cjs
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const s=fs.readFileSync(path.join(__dirname,'../js/hardModeRules.js'),'utf8');
const lib='data:text/javascript;base64,'+Buffer.from(s).toString('base64');
test('Hard Mode modifiers are deterministic for a map and 3-wave block',async()=>{
  const {getHardWaveRules,HARD_MODE_MODIFIERS}=await import(lib);
  assert.equal(HARD_MODE_MODIFIERS.length,4);
  for(const mapId of ['scrapyard','city','jungle','terminal']){
    const first=getHardWaveRules(mapId,1);
    assert.equal(first.modifier.id,getHardWaveRules(mapId,2).modifier.id);
    assert.equal(first.modifier.id,getHardWaveRules(mapId,3).modifier.id);
    assert.notEqual(first.modifier.id,getHardWaveRules(mapId,4).modifier.id);
    assert.equal(first.score,2);
    assert.ok(first.hp>0&&first.damage>0&&first.speed>0);
  }
});
test('Hard Mode wave composition scales without mutating original fixed waves',async()=>{
  const {applyHardWaveCount,getHardWaveRules}=await import(lib);
  const fixed=[{type:'scout',count:3},{type:'giantbot',count:1}];
  const rules=getHardWaveRules('scrapyard',1);
  const copy=applyHardWaveCount(fixed,rules);
  assert.notEqual(copy,fixed);
  assert.equal(copy[1].count,1);
  assert.equal(fixed[0].count,3);
  assert.ok(copy[0].count>=3);
});
test('swarm mutator increases normal bot groups, never boss group counts',async()=>{
  const {applyHardWaveCount,HARD_MODE_MODIFIERS}=await import(lib);
  const swarm=HARD_MODE_MODIFIERS.find(x=>x.id==='swarm');
  assert.deepEqual(applyHardWaveCount([
    {type:'scout',count:4},{type:'giantbot',count:2}],swarm),
    [{type:'scout',count:6},{type:'giantbot',count:2}]);
});
test('hard modes reject invalid wave numbers',async()=>{
  const {getHardWaveRules}=await import(lib);
  assert.throws(()=>getHardWaveRules('city',0));
  assert.throws(()=>getHardWaveRules('city',1.2));
});
