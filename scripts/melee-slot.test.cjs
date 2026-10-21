const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const load=name=>fs.readFileSync(path.join(__dirname,'../'+name),'utf8');
test('Knife is an always-equipped fourth local slot with HUD and key four',()=>{
 assert.match(load('js/weapons.js'),/inventory = \[null, null, 'PISTOL', 'KNIFE'\]/);
 assert.match(load('js/weapons.js'),/refreshSlotHUD\(\) \{[\s\S]*for \(let i = 0; i < 4; i\+\+\)/);
 assert.match(load('index.html'),/id="wSlot3"/);
 assert.match(load('js/player.js'),/e\.code === 'Digit4' && cb\.canUseMelee\?\.\(\)!==false/);
});
test('Knife has 2.8m swept contact hit, cooldown and separate swing sound',()=>{
 const player=load('js/player.js');
 const defs=load('js/weapons.js');
 const projectile=load('js/projectiles.js');
 assert.match(player,/if\(W\?\.melee\)\{[\s\S]*?sfx\.knife\(\);[\s\S]*?setWepCooldown\(W\.cd\)/);
 assert.match(player,/_pendingMelee=\{weapon:curWep,damage:W\.dmg,range:W\.range,time:\.11\}/);
 assert.match(player,/meleeStrike\(_meshToEnemy,strike\.damage,strike\.range\)/);
 assert.match(defs,/KNIFE: \{name:'KNIFE'[\s\S]*?range:2\.8[\s\S]*?cd:0\.55/);
 assert.match(projectile,/export function meleeStrike\(meshToEnemy,damage=70,range=2\.8\)/);
 assert.doesNotMatch(player,/case 'KNIFE':\s*[\s\S]*?sfx\.pistol\(\)/);
});
test('Gun Game cannot bypass firearm ladder with dedicated melee hotkey',()=>{
 const main=load('js/main.js');
 assert.match(main,/cb\.canUseMelee = \(\) =>/);
 assert.match(main,/state\.gunOrder\[state\.gunIndex\]==='KNIFE'/);
});
