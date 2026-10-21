const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const catalog=require('../assets/bot-personalities.json');
const {validateBotCatalog}=require('../server/botSlots.js');
const code=fs.readFileSync(path.join(__dirname,'../js/weapons.js'),'utf8');
const defs=code.slice(code.indexOf('export const WDEFS = {'),code.indexOf('export const WCOLORS = {'));
const base=[...defs.matchAll(/^  ([A-Z_]+):\s*\{/gm)].map(x=>x[1])
 .filter(k=>!['KNIFE','PISTOL','THUNDERBOLT','SINGULARITY','PYROCLAST','OMEGA_STORM'].includes(k));
test('Every non-wonder firearm has an independent local AI specialist',()=>{
 assert.deepEqual(validateBotCatalog(),[]);
 const primaries=new Set(catalog.personalities.map(p=>p.loadout.primary));
 assert.ok(base.length>=16,'unexpected reduced firearm catalog');
 for(const gun of base)assert.ok(primaries.has(gun),'missing bot AI gun: '+gun);
});
test('Bot variant specials cover characteristic offline weapon mechanics',()=>{
 const required={
  CHAINGUN:'spinning_module',SHOTGUN:'dragons_breath',
  PLASMA:'dual_trigger',CROSSBOW:'coated_tips',
  RIVETER:'superheated_rivets',PHALANX:'resonance_cascade',
  AEGIS:'multi_thread',ROCKET:'rocket_burst',GLAUNCHER:'cluster_rounds',
 };
 for(const [gun,special]of Object.entries(required))
  assert.ok(catalog.personalities.some(p=>p.loadout.primary===gun&&
   p.loadout.attachments?.[gun]?.special===special),
   'missing specialist '+gun+'/'+special);
});
