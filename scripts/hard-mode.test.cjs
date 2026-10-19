// node --test scripts/hard-mode.test.cjs
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../js/hardModeRules.js'),'utf8');
const lib='data:text/javascript;base64,'+Buffer.from(src).toString('base64');
test('Hard rotates once per wave, without consecutive duplicates',async()=>{
  const {getHardWaveRules,HARD_MODE_MODIFIERS}=await import(lib);
  for(const map of ['scrapyard','city','jungle','terminal']){
    const a=Array.from({length:50},(_,i)=>getHardWaveRules(map,i+1));
    assert.ok(a.every(r=>r.modifiers.length===1&&r.difficulty==='hard'));
    for(let i=1;i<a.length;i++)
      assert.notEqual(a[i].modifier.id,a[i-1].modifier.id);
    assert.equal(new Set(a.map(r=>r.modifier.id)).size,HARD_MODE_MODIFIERS.length);
    assert.ok(a.every(r=>r.score===2));
  }
});
test('Nightmare behaves exactly as Hard through wave 10',async()=>{
  const {getRunHardWaveRules}=await import(lib);
  for(const map of ['scrapyard','city','jungle','terminal']){
    for(let wave=1;wave<=10;wave++){
      const hard=getRunHardWaveRules(map,wave,'hard');
      const nightmare=getRunHardWaveRules(map,wave,'nightmare');
      assert.deepEqual(nightmare.modifiers.map(m=>m.id),hard.modifiers.map(m=>m.id));
      assert.equal(nightmare.hp,hard.hp);
      assert.equal(nightmare.count,hard.count);
    }
  }
});
test('Nightmare stacks at wave 11, 21, 31, never dropping a fixed modifier',async()=>{
  const {getRunHardWaveRules,HARD_MODE_MODIFIERS}=await import(lib);
  for(const map of ['scrapyard','city','jungle','terminal']){
    for(const [wave,total] of [[1,1],[10,1],[11,2],[20,2],[21,3],[30,3],[31,4],[40,4],[100,4]]){
      const r=getRunHardWaveRules(map,wave,'nightmare');
      assert.equal(r.modifiers.length,total,map+' wave '+wave);
      assert.equal(new Set(r.modifiers.map(m=>m.id)).size,total);
    }
    for(let wave=12;wave<=30;wave++){
      const prev=getRunHardWaveRules(map,wave-1,'nightmare');
      const cur=getRunHardWaveRules(map,wave,'nightmare');
      if(wave!==21)assert.notEqual(cur.modifier.id,prev.modifier.id);
      if(wave!==21)assert.deepEqual(cur.modifiers.slice(0,-1).map(m=>m.id),
        prev.modifiers.slice(0,-1).map(m=>m.id));
    }
    assert.equal(getRunHardWaveRules(map,31,'nightmare').modifiers.length,HARD_MODE_MODIFIERS.length);
  }
});
test('Nightmare combines modifier multipliers and protects boss group counts',async()=>{
  const {getRunHardWaveRules,applyHardWaveCount}=await import(lib);
  const r=getRunHardWaveRules('city',40,'nightmare');
  assert.equal(r.modifiers.length,4);
  assert.ok(r.hp>1.2&&r.damage>1.15&&r.speed>1.12&&r.count>1);
  const original=[{type:'scout',count:4},{type:'giantbot',count:2}];
  const modified=applyHardWaveCount(original,r);
  assert.equal(original[0].count,4);
  assert.equal(modified[0].count,6);
  assert.equal(modified[1].count,2);
});
test('Nightmare unlocks only after a Hard boss clear on that map',async()=>{
  const {canUnlockNightmare}=await import(lib);
  assert.equal(canUnlockNightmare({bossWaveClears_city:1},'city'),false);
  assert.equal(canUnlockNightmare({bossWaveClearsHard_city:1},'city'),true);
  assert.equal(canUnlockNightmare({bossWaveClearsHard_city:1},'jungle'),false);
  assert.equal(canUnlockNightmare({maxWaveHard_city:10},'city'),true);
  assert.equal(canUnlockNightmare({maxWaveHard_city:9},'city'),false);
});
test('invalid waves and tiers are rejected',async()=>{
  const {getRunHardWaveRules}=await import(lib);
  assert.throws(()=>getRunHardWaveRules('city',0,'hard'));
  assert.throws(()=>getRunHardWaveRules('city',1.2,'nightmare'));
  assert.throws(()=>getRunHardWaveRules('city',10,'impossible'));
});
