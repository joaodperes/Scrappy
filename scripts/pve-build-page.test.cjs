const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const rules=new Function(read('js/pveStatsRules.js').replace(/^export /gm,'')+
 '\nreturn {PVE_STAT_KEYS,PVE_EQUIPMENT,normalizedPveBuild,allocatePvePoint,respecPveBuild,equipPveGear,pveModifiers} ')();
function page(profile){
 let saves=0;
 const document={createElement:tag=>({
  tag,textContent:'',style:{},children:[],disabled:false,
  appendChild(child){this.children.push(child)},
  replaceChildren(...children){this.children=[...children]},
 })};
 const src=read('js/pveBuildPage.js')
   .replace(/^import\s*\{[\s\S]*?\}\s*from\s*'[^']+';?\s*/gm,'')
   .replace(/^export /gm,'');
 const render=new Function('document','profile','saveProfile',
   ...Object.keys(rules),src+'\nreturn renderPveBuild;')(
   document,profile,()=>saves++,...Object.values(rules));
 const root=document.createElement('div');
 render(root);
 const find=(phrase)=>root.children.flatMap(el=>[el,...(el.children||[])])
  .filter(el=>el.tag==='button'&&el.textContent===phrase);
 return {root,find,get saves(){return saves}};
}
test('earning PvE stats, spending and respec are persisted without Scraps',()=>{
 const profile={scraps:999,stats:{bossWaveClears:4,maxWave:20}};
 const ui=page(profile);
 assert.equal(ui.find('+ ALLOCATE').length,3);
 ui.find('+ ALLOCATE')[0].onclick();
 assert.equal(ui.saves,1);
 assert.equal(profile.pveBuild.ranks.vitality,1);
 assert.equal(profile.scraps,999);
 ui.find('RESET POINTS (FREE)')[0].onclick();
 assert.equal(profile.pveBuild.ranks.vitality,0);
 assert.equal(ui.saves,2);
});
test('equipment locks use best Survival wave and normalize persisted ranks',()=>{
 const profile={stats:{bossWaveClears:6,maxWave:10}};
 const ui=page(profile);
 assert.equal(ui.find('EQUIP').length,1);
 assert.equal(ui.find('LOCKED').length,2);
 ui.find('EQUIP')[0].onclick();
 assert.equal(profile.pveBuild.equipment,'armoredVest');
 assert.equal(ui.find('EQUIPPED').length,1);
});
test('competitive and local arena launches clear PvE bonuses',()=>{
 const main=read('js/main.js'),player=read('js/player.js'),pickup=read('js/pickups.js');
 assert.match(main,/player\.survivalModifiers=localMode\?null:pveModifiers/);
 assert.match(main,/player\.survivalModifiers=null;player\.maxHp=100/);
 assert.match(player,/player\.survivalModifiers\?\.speedMult/);
 assert.match(pickup,/player\.survivalModifiers\?\.ammoDropMult/);
 const loadout=read('js/loadout.js');
 assert.match(loadout,/renderPveBuild\(main\)/);
});
