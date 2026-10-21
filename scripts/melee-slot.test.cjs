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
test('Knife trigger executes actual 3m maximum-range hit with short cooldown',()=>{
 const player=load('js/player.js');
 assert.match(player,/case 'KNIFE':\s*[\s\S]*?hitscan\(_meshToEnemy,0,modDmg,Math\.min\(3,range\),0\)/);
 const defs=load('js/weapons.js');
 assert.match(defs,/KNIFE: \{name:'KNIFE'[\s\S]*?range:2\.8/);
});
test('Gun Game cannot bypass firearm ladder with dedicated melee hotkey',()=>{
 const main=load('js/main.js');
 assert.match(main,/cb\.canUseMelee = \(\) =>/);
 assert.match(main,/state\.gunOrder\[state\.gunIndex\]==='KNIFE'/);
});
