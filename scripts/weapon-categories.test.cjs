const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../js/weaponCategories.js'),'utf8');
const mod=import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
test('Pistol is Secondary; Aegis remains a Primary, Knife is Melee',async()=>{
 const {getWeaponCategory,SECONDARY_WEAPONS}=await mod;
 assert.deepEqual(SECONDARY_WEAPONS,['PISTOL']);
 assert.equal(getWeaponCategory('SMG',{}),'primary');
 assert.equal(getWeaponCategory('PISTOL',{}),'secondary');
 assert.equal(getWeaponCategory('AEGIS',{}),'primary');
 assert.equal(getWeaponCategory('KNIFE',{melee:true}),'melee');
 assert.equal(getWeaponCategory('THUNDERBOLT',{wonderWeapon:true}),'wonder');
});
test('Pistol is the only allowed fallback; no Aegis Secondary override',async()=>{
 const {canUseSecondary,selectedSecondary}=await mod;
 const defs={PISTOL:{},AEGIS:{},KNIFE:{melee:true},THUNDERBOLT:{wonderWeapon:true}};
 const p={pveSecondary:'AEGIS',discoveredWeapons:['AEGIS'],stats:{weaponXp:{AEGIS:200}}};
 assert.equal(canUseSecondary('AEGIS',defs,p),false);
 assert.equal(selectedSecondary(defs,p),'PISTOL');
 assert.equal(canUseSecondary('PISTOL',defs,p),true);
 assert.equal(canUseSecondary('KNIFE',defs,p),false);
});
test('Solo Survival starts with Pistol; startup script imports profile before PvP launch',()=>{
 const main=fs.readFileSync(path.join(__dirname,'../js/main.js'),'utf8');
 const loadout=fs.readFileSync(path.join(__dirname,'../js/loadout.js'),'utf8');
 assert.match(main,/import\s*\{[^}]*\bprofile\b[^}]*\}\s*from\s*'\.\/progression\.js'/);
 assert.match(main,/inventory\[2\] = 'PISTOL'/);
 assert.doesNotMatch(main,/selectedSecondary\(WDEFS,profile\)/);
 assert.doesNotMatch(loadout,/SURVIVAL SECONDARY/);
});

test('FFA/TDM firearm selections reject Knife/Wonder, resolve invalid saved pairs',async()=>{
 const {isCompetitiveFirearm,normalizeCompetitiveLoadout}=await mod;
 const defs={
   PISTOL:{},SMG:{},SHOTGUN:{},AEGIS:{},
   KNIFE:{melee:true},THUNDERBOLT:{wonderWeapon:true},
 };
 assert.equal(isCompetitiveFirearm('AEGIS',defs),true);
 assert.equal(isCompetitiveFirearm('KNIFE',defs),false);
 assert.equal(isCompetitiveFirearm('THUNDERBOLT',defs),false);
 assert.deepEqual(normalizeCompetitiveLoadout(
   {primary:'KNIFE',secondary:'THUNDERBOLT'},defs),
   {primary:'SMG',secondary:'SHOTGUN'});
 assert.deepEqual(normalizeCompetitiveLoadout(
   {primary:'SHOTGUN',secondary:'SHOTGUN'},defs),
   {primary:'SHOTGUN',secondary:'PISTOL'});
 assert.deepEqual(normalizeCompetitiveLoadout(
   {primary:'SMG',secondary:'AEGIS'},defs),
   {primary:'SMG',secondary:'AEGIS'});
 assert.deepEqual(normalizeCompetitiveLoadout(null,defs),
   {primary:'SMG',secondary:'SHOTGUN'});
});
test('Gun Game progression continues to end in Knife without using standard PvP slots',()=>{
 const server=fs.readFileSync(path.join(__dirname,'../server/server.js'),'utf8');
 const main=fs.readFileSync(path.join(__dirname,'../js/main.js'),'utf8');
 assert.match(server,/return \['PISTOL',\.\.\.others,'KNIFE'\]/);
 assert.match(main,/cfg\.mode==='gunGame'\?'PISTOL':mainSlot/);
 assert.match(main,/normalizeCompetitiveLoadout\(/);
 const loadout=fs.readFileSync(path.join(__dirname,'../js/loadout.js'),'utf8');
 assert.match(loadout,/isCompetitiveFirearm\(wName,WDEFS\)/);
});
