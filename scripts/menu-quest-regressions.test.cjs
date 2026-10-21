// Node-only regression checks for owner-reported play/menu errors.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('Solo startup never evaluates a missing profile reference or Survival Secondary',()=>{
 const main=read('js/main.js');
 assert.match(main,/import\s*\{[^}]*\bprofile\b[^}]*\}\s*from\s*'\.\/progression\.js'/);
 assert.match(main,/inventory\[2\] = 'PISTOL'/);
 assert.match(main,/setWeapon\('PISTOL'\)/);
 assert.doesNotMatch(main,/selectedSecondary\(WDEFS,profile\)/);
 assert.match(main,/\[SCRAPPY\/STARTUP\]/);
});
test('Home menu owns Quests and no longer exposes a redundant Map selector',()=>{
 const html=read('index.html'),main=read('js/main.js');
 const loadout=read('js/loadout.js');
 assert.doesNotMatch(html,/id="mapSelectSection"/);
 assert.doesNotMatch(html,/id="mapDropdown"/);
 assert.match(main,/id='questsBtn'/);
 assert.match(main,/import\('\.\/questPage\.js'\)/);
 assert.doesNotMatch(loadout,/id:'quests'/);
 assert.doesNotMatch(loadout,/SURVIVAL SECONDARY/);
 const css=read('css/game.css');
 for(const id of ['playBtn','loadoutBtn','questsBtn','leaderboardsBtn'])
   assert.ok(css.includes('#menuScreen #'+id),id+' not sized with home buttons');
});
test('PvP loadout editor stays in the existing panel and saves valid pairs',()=>{
 const src=read('js/loadout.js');
 const chunk=src.slice(src.indexOf('function _renderPvpSetup(main){'),src.indexOf('// ── PROGRESS tab'));
 assert.ok(chunk.startsWith('function _renderPvpSetup(main){'));
 assert.doesNotMatch(chunk,/showLoadout\(/,'no nested Loadout panel');
 const elements=[];
 function _el(tag,style,label){
  const el={tag,style,textContent:label||'',children:[],options:[],value:'',
    appendChild(child){this.children.push(child);if(this.tag==='select'&&child.tag==='option')this.options.push(child);return child}};
  elements.push(el);return el;
 }
 const profile={pvpLoadout:{primary:'SMG',secondary:'SHOTGUN'}};
 const WDEFS={PISTOL:{name:'Pistol'},SMG:{name:'SMG'},SHOTGUN:{name:'Shotgun'},KNIFE:{name:'Knife'},OMEGA:{name:'Omega',wonderWeapon:true}};
 let saved=0;
 const helpers=read('js/weaponCategories.js').replace(/^export /gm,'');
 const categoryFns=new Function(helpers+'\nreturn {isCompetitiveFirearm,normalizeCompetitiveLoadout};')();
 const render=new Function('_el','profile','WDEFS','saveProfile','C','F','isCompetitiveFirearm','normalizeCompetitiveLoadout',chunk+'\nreturn _renderPvpSetup;')(
   _el,profile,WDEFS,()=>{saved++;},
   {accent:'#7f0',text:'#fff',textDim:'#aaa',accentHi:'#eae',bgCard:'#222',border:'#444',accentGreen:'#9f9'},'monospace',
   categoryFns.isCompetitiveFirearm,categoryFns.normalizeCompetitiveLoadout
 );
 const main=_el('main');render(main);
 const selects=elements.filter(el=>el.tag==='select');
 assert.equal(selects.length,2);
 assert.equal(selects[0].value,'SMG');
 assert.equal(selects[1].value,'SHOTGUN');
 selects[0].value='SHOTGUN';selects[0].onchange();
 assert.equal(profile.pvpLoadout.primary,'SHOTGUN');
 assert.notEqual(profile.pvpLoadout.secondary,'SHOTGUN');
 assert.ok(saved>0);
});
test('Room picker back notifies caller of cancellation and preserves lobby',()=>{
 const loadout=read('js/loadout.js');
 assert.match(loadout,/backBtn\.onclick = \(\) => \{[^}]*onClose\?\.\(null\)/);
 assert.match(read('js/main.js'),/if\(!slots\)return/);
});
test('Collector skins all receive animated palette updates, not static camo',()=>{
 const weapons=read('js/weapons.js');
 assert.doesNotMatch(weapons,/parentMesh\.getChildMeshes\(\)/);
 for(const id of ['aurora','nebula','cinder','tundra'])
   assert.match(weapons,new RegExp("skinId==='"+id+"'"));
 assert.match(weapons,/skin\.category==='Collector'/);
});
test('Quest rewards and completion toasts share the unlock notification queue',()=>{
 const prog=read('js/progression.js');
 const page=read('js/questPage.js');
 assert.match(prog,/function _showQuestToast\(/);
 assert.match(prog,/_enqueueToast\(html,3800,css\)/);
 assert.match(prog,/if\(current\.complete && !current\.claimed\)/);
 assert.match(page,/claimProfileQuest\(q\.id\)/);
});
