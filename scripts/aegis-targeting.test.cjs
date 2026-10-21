// node --test scripts/aegis-targeting.test.cjs
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const src=fs.readFileSync(path.join(root,'js/aegisTargeting.js'),'utf8');
const url='data:text/javascript;base64,'+Buffer.from(src).toString('base64');
test('ADS locks up to three enemies and retains them off crosshair',async()=>{
  const {updateAegisLocks,getAegisFireTargets}=await import(url);
  const a={id:'a',alive:true},b={id:'b',alive:true},
    c={id:'c',alive:true},d={id:'d',alive:true};
  let inCone=new Set([a,b,c]);
  const valid=e=>e.alive;
  const canLock=e=>inCone.has(e);
  const locks=updateAegisLocks([],[a,b,c,d],3,valid,canLock);
  assert.deepEqual(locks,[a,b,c]);
  inCone=new Set([d]); // Player aims away after painting three targets.
  assert.deepEqual(updateAegisLocks(locks,[a,b,c,d],3,valid,canLock),[a,b,c]);
  const hits=getAegisFireTargets(locks,valid,()=>true);
  assert.deepEqual(hits,[a,b,c]); // Current crosshair is not consulted.
});
test('Multi-Thread raises cap to six and Single-Thread reduces it to one',async()=>{
  const {updateAegisLocks}=await import(url);
  const enemies=Array.from({length:8},(_,i)=>({id:i,alive:true}));
  assert.equal(updateAegisLocks([],enemies,3,()=>true,()=>true).length,3);
  assert.equal(updateAegisLocks([],enemies,6,()=>true,()=>true).length,6);
  assert.equal(updateAegisLocks(enemies.slice(0,6),enemies,1,()=>true,()=>true).length,1);
});
test('AEGIS thread attachments set 66% Multi-Thread and 3.5x Single-Thread damage',()=>{
  const progression=fs.readFileSync(path.join(root,'js/progression.js'),'utf8');
  const multi=progression.match(/multi_thread:\s*\{[^\n]*mods:\s*\{([^}]*)\}/)?.[1];
  const single=progression.match(/single_thread:\s*\{[\s\S]*?mods:\s*\{([^}]*)\}/)?.[1];
  assert.ok(multi,'Multi-Thread attachment definition exists');
  assert.ok(single,'Single-Thread attachment definition exists');
  const mod=(source,key)=>Number(source.match(new RegExp('\\b'+key+':\\s*([\\d.]+)'))?.[1]);
  assert.equal(mod(multi,'maxTargets'),3); // AEGIS base cap is 3, becomes 6.
  assert.equal(mod(multi,'dmgMult'),0.66);
  assert.equal(mod(single,'maxTargetsOverride'),1);
  assert.equal(mod(single,'dmgMult'),3.5);
  // getEffectiveStats rounds weapon damage before each lock receives modDmg.
  assert.match(progression,/mod === 'dmgMult'\) out\.dmg = Math\.round\(baseDefs\.dmg \* delta\)/);
  const player=fs.readFileSync(path.join(root,'js/player.js'),'utf8');
  assert.match(player,/cb\.hitRobot\?\.\(e,modDmg,false,false,'AEGIS'\)/);
  assert.equal(Math.round(30*mod(multi,'dmgMult')),20);
  assert.equal(Math.round(30*mod(single,'dmgMult')),105);
});
test('Dead locks are dropped; valid new targets replace them',async()=>{
  const {updateAegisLocks}=await import(url);
  const a={id:1,alive:false},b={id:2,alive:true},c={id:3,alive:true};
  assert.deepEqual(updateAegisLocks([a,b],[a,b,c],2,e=>e.alive,()=>true),[b,c]);
});
test('A previously locked enemy dying invalidates the entire group',async()=>{
  const {hasDeadAegisLock,updateAegisLocks}=await import(url);
  const a={id:'a',alive:true},b={id:'b',alive:true},c={id:'c',alive:true};
  const locks=updateAegisLocks([],[a,b,c],3,e=>e.alive,()=>true);
  assert.equal(hasDeadAegisLock(locks),false);
  b.alive=false;
  assert.equal(hasDeadAegisLock(locks),true);
  // Runtime resets the entire lock list, not just the dead enemy.
  assert.deepEqual(updateAegisLocks([],[],3,e=>e.alive,()=>true),[]);
});
test('Obstructed targets cannot be acquired or struck through a wall',async()=>{
  const {updateAegisLocks,getAegisFireTargets}=await import(url);
  const a={id:1,alive:true},b={id:2,alive:true};
  const visible=e=>e!==b;
  const acquired=updateAegisLocks([],[a,b],3,e=>e.alive,visible);
  assert.deepEqual(acquired,[a]);
  assert.deepEqual(getAegisFireTargets([a,b],e=>e.alive,visible),[a]);
});
test('Aegis runtime uses exactly one round for a multi-hit trigger pull',()=>{
  const player=fs.readFileSync(path.join(root,'js/player.js'),'utf8');
  const start=player.indexOf("case 'AEGIS':");
  const end=player.indexOf("case 'DMR':",start);
  const aegis=player.slice(start,end);
  assert.match(aegis,/getAegisFireTargets\(/);
  assert.match(aegis,/for\(const e of targets\)/);
  assert.doesNotMatch(aegis,/currentMag\s*--/);
  assert.doesNotMatch(aegis,/paintedTargets\s*=\s*\[\]/);
  assert.match(player,/_aegisHasLineOfSight\(e\)/);
  assert.match(player,/EW\.maxTargets\|\|3/);
  assert.match(aegis,/_clearAegisLocks\(\)/);
  assert.match(aegis,/_aegisReacquireDelay=Math\.max\(/);
  assert.match(player,/if\(hasDeadAegisLock\(paintedTargets\)\)/);
  assert.match(player,/cb\.clearAegisLocks=\(\)=>/);
  assert.match(player,/curWep==='AEGIS' && hasDeadAegisLock\(paintedTargets\)/);
  const weapons=fs.readFileSync(path.join(root,'js/weapons.js'),'utf8');
  assert.match(weapons,/if\(curWep!==name\)cb\.clearAegisLocks\?\.\(\)/);
});
