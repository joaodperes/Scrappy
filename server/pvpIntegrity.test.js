const test=require('node:test');
const assert=require('node:assert/strict');
const {validatedHitIntent:validate}=require('./pvpIntegrity.js');
const pos=(x,y,z)=>({x,y,z});
const weapon=id=>({id,damage:32,range:40,cooldownMs:250,aimToleranceDeg:7});
const base=()=>({
 shooter:{id:'1',hp:100,alive:true,position:pos(0,1.72,0),
   equippedWeapon:'SMG',allowedWeapons:['SMG','PISTOL'],
   verifiedAim:pos(0,0,1),lastShotAt:1000,team:'RED'},
 victim:{id:'2',hp:100,alive:true,position:pos(0,1.72,12),team:'BLUE'},
 match:{started:true,mode:'tdm',mapId:'city'},
 weaponSpecs:weapon,lineOfSight:()=>true,nowMs:1300,
});
test('server computes damage and next cooldown, never trusts claimed damage',()=>{
 const args=base();args.claimedDamage=99999;
 const x=validate(args);
 assert.equal(x.ok,true);
 assert.equal(x.damage,32);
 assert.equal(x.nextShotAt,1550);
});
test('self-hits, friendly fire and dead actors are rejected',()=>{
 let x=base();x.victim.id=x.shooter.id;assert.equal(validate(x).ok,false);
 x=base();x.victim.team='RED';assert.match(validate(x).reason,/Friendly/);
 x=base();x.victim.deadUntil=1500;assert.match(validate(x).reason,/Inactive/);
});
test('line-of-sight is required and any geometry error blocks the attack',()=>{
 const x=base();
 delete x.lineOfSight;
 assert.match(validate(x).reason,/geometry/);
 x.lineOfSight=()=>false;
 assert.equal(validate(x).ok,false);
 x.lineOfSight=()=>{throw Error('unavailable')};
 assert.match(validate(x).reason,/Geometry verification/);
});
test('distance and authoritative server aim gate client hit reports',()=>{
 const x=base();
 x.victim.position=pos(0,1.72,55);
 assert.match(validate(x).reason,/range/);
 x.victim.position=pos(12,1.72,0);
 assert.match(validate(x).reason,/aim cone/);
 x.shooter.verifiedAim=pos(0,0,0);
 assert.match(validate(x).reason,/normalized/);
});
test('server-held allowed loadout and Gun Game sequence are mandatory',()=>{
 const x=base();
 x.shooter.allowedWeapons=['PISTOL'];
 assert.match(validate(x).reason,/loadout/);
 x.match.mode='gunGame';x.match.gunOrder=['PISTOL','SMG'];x.shooter.weaponIndex=0;
 assert.match(validate(x).reason,/Gun Game/);
 x.shooter.weaponIndex=1;
 assert.equal(validate(x).ok,true);
});
test('cooldown rejects implausibly rapid shots and non-finite data',()=>{
 const x=base();
 x.nowMs=1100;
 assert.match(validate(x).reason,/cooldown/);
 x.nowMs=1300;x.shooter.position=pos(NaN,1,0);
 assert.match(validate(x).reason,/position/);
 x.shooter.position=pos(0,1.72,0);
 x.weaponSpecs=()=>({id:'SMG',damage:Infinity,range:99,cooldownMs:60});
 assert.match(validate(x).reason,/Unknown weapon/);
});
test('integration not enabled without verified movement and collision adapter',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
 assert.doesNotMatch(server,/require\(['"]\.\/pvpIntegrity\.js['"]\)/);
});
