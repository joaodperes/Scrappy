const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../js/weaponCategories.js'),'utf8');
const mod=import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
test('Primary, Secondary, Melee and Wonder are distinct categories',async()=>{
 const {getWeaponCategory}=await mod;
 assert.equal(getWeaponCategory('SMG',{}),'primary');
 assert.equal(getWeaponCategory('PISTOL',{}),'secondary');
 assert.equal(getWeaponCategory('AEGIS',{}),'secondary');
 assert.equal(getWeaponCategory('KNIFE',{melee:true}),'melee');
 assert.equal(getWeaponCategory('THUNDERBOLT',{wonderWeapon:true}),'wonder');
});
test('pistol fallback and discovered AEGIS guard the PvE Secondary slot',async()=>{
 const {canUseSecondary,selectedSecondary}=await mod;
 const defs={PISTOL:{},AEGIS:{},KNIFE:{melee:true},THUNDERBOLT:{wonderWeapon:true}};
 const p={pveSecondary:'AEGIS',discoveredWeapons:[],stats:{weaponXp:{}}};
 assert.equal(canUseSecondary('AEGIS',defs,p),false);
 assert.equal(selectedSecondary(defs,p),'PISTOL');
 p.discoveredWeapons=['AEGIS'];
 assert.equal(canUseSecondary('AEGIS',defs,p),true);
 assert.equal(selectedSecondary(defs,p),'AEGIS');
 p.pveSecondary='THUNDERBOLT';
 assert.equal(selectedSecondary(defs,p),'PISTOL');
 assert.equal(canUseSecondary('KNIFE',defs,p),false);
});
test('Solo Survival uses the selected Secondary; legacy PvP keeps its preset weapons',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../js/main.js'),'utf8');
 assert.equal((src.match(/inventory\[2\]\s*=\s*selectedSecondary\(WDEFS,profile\)/g)||[]).length,1);
 assert.match(src,/inventory\[2\] = 'PISTOL'; inventory\[1\] = null; inventory\[0\] = null/);
});
