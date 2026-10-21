const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../js/killAttribution.js'),'utf8');
const rules=import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('Tesla chain keeps TESLA even after player switches to another gun',async()=>{
 const {resolveKillAttribution}=await rules;
 const a=resolveKillAttribution('SMG','TESLA_CHAIN');
 assert.deepEqual(a,{weaponKey:'TESLA',source:'TESLA_CHAIN',killMethod:'TESLA_CHAIN'});
});
test('kill methods remain distinct from weapons for challenges',async()=>{
 const {resolveKillAttribution}=await rules;
 assert.deepEqual(resolveKillAttribution('SHOTGUN','PLAYER'),{
  weaponKey:'SHOTGUN',source:'PLAYER',killMethod:'DIRECT'});
 assert.equal(resolveKillAttribution('ROCKET','PLAYER',null,true).killMethod,'EXPLOSION');
 assert.deepEqual(resolveKillAttribution('SMG','PHALANX_SHATTER').weaponKey,'PHALANX');
 assert.equal(resolveKillAttribution('SMG','POISON').weaponKey,'CROSSBOW');
 assert.equal(resolveKillAttribution('SMG','FLAME_DOT').weaponKey,'FLAMETHROWER');
});
test('delayed projectile uses captured firing weapon and hazards never claim one',async()=>{
 const {resolveKillAttribution}=await rules;
 const rocket=resolveKillAttribution('PISTOL','EXPLOSION','ROCKET',true);
 assert.equal(rocket.weaponKey,'ROCKET');
 assert.equal(rocket.killMethod,'EXPLOSION');
 assert.equal(resolveKillAttribution('PISTOL','ENVIRONMENT').weaponKey,null);
 assert.equal(resolveKillAttribution('ROCKET','BARREL_EXPLOSION').weaponKey,null);
});
test('single environmental death path does not award a second kill',()=>{
 const e=fs.readFileSync(path.join(__dirname,'../js/enemies.js'),'utf8');
 assert.match(e,/destroyRobot\(e, false, false, 'ENVIRONMENT'\)/);
 assert.doesNotMatch(e,/recordKill\(e\.type, 'ENVIRONMENT'/);
 assert.match(e,/if\(!e\?\.alive\)return; \/\/ one death/);
});
test('challenge event records specific method without replacing legacy weapon kills',()=>{
 const p=fs.readFileSync(path.join(__dirname,'../js/progression.js'),'utf8');
 assert.match(p,/_bumpPerMap\(s,'killsByMethod',method,mapId\)/);
 assert.match(p,/_bumpPerMap\(s,'killsByWeaponMethod'/);
 assert.match(p,/source === 'TESLA_CHAIN'.*'killsWith'/);
});
