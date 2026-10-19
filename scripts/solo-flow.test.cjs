// node --test scripts/solo-flow.test.cjs
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

test('loadout places Knife after regular firearm unlocks, not before Pistol',()=>{
  const source=fs.readFileSync(path.join(root,'js/weapons.js'),'utf8');
  const defs=source.slice(source.indexOf('export const WDEFS = {'),source.indexOf('export const WCOLORS ='));
  const keyPos=key=>defs.indexOf('  '+key+':');
  assert.ok(keyPos('PISTOL')>=0&&keyPos('KNIFE')>=0);
  assert.ok(keyPos('PISTOL')<keyPos('KNIFE'));
  assert.ok(keyPos('AEGIS')<keyPos('KNIFE'));
});

test('single player launches chosen map without creating a WebSocket',()=>{
  const source=fs.readFileSync(path.join(root,'js/roomFlow.js'),'utf8');
  const elements=[];
  class Element {
    constructor(tag){
      this.tag=tag;this.children=[];this.style={};this._text='';this.value='';
      this.disabled=false;this.checked=false;this.options=[];
      elements.push(this);
    }
    set textContent(v){this._text=String(v);this.children=[];}
    get textContent(){return this._text;}
    appendChild(child){
      this.children.push(child);
      if(this.tag==='select'&&child.tag==='option')this.options.push(child);
      return child;
    }
    replaceChildren(...children){this.children=[...children]}
    remove(){this.removed=true}
  }
  const body=new Element('body');
  const document={body,createElement:tag=>new Element(tag),getElementById:()=>null};
  const started=[];
  let attempts=0;
  const setup=source.replace(/^import .*?;$/gm,'').replace(/\bexport\s+/g,'');
  const context={
    document,window:{},MAPS:{scrapyard:{id:'scrapyard',name:'Scrapyard',icon:'🏭'},jungle:{id:'jungle',name:'Jungle',icon:'🌿'}},
    getCurrentMap:()=> 'scrapyard',
    isHardModeUnlocked:id=>id==='jungle',
    isModeSupported:()=>true,getRoomCapacity:()=>4,
    profile:{name:'Tester'},
    HARD_MODE_MODIFIERS:[{id:'reinforced',label:'REINFORCED',desc:'More armor'}],
    WebSocket:class {constructor(){attempts++;throw Error('Offline path must not connect')}},
    clearInterval:()=>{},setInterval:()=>0,crypto:{getRandomValues:()=>{}},location:{hostname:'localhost'},
  };
  vm.createContext(context);
  vm.runInContext(setup+'\nthis.testUI={showPlayPage,initRoomFlow}',context);
  context.testUI.initRoomFlow({onStartSurvival:cfg=>started.push(cfg)});
  context.testUI.showPlayPage();
  const findButton=label=>elements.filter(el=>el.tag==='button'&&el.textContent===label).at(-1);
  assert.ok(findButton('SINGLE PLAYER'),'Solo button present');
  findButton('SINGLE PLAYER').onclick();
  const map=elements.find(el=>el.tag==='select'&&el.options.some(o=>o.value==='jungle'));
  assert.equal(map.value,'scrapyard');
  map.value='jungle';map.onchange();
  const checkbox=elements.filter(el=>el.tag==='input'&&el.type==='checkbox').at(-1);
  assert.equal(checkbox.disabled,false);
  checkbox.checked=true;
  findButton('START SOLO SURVIVAL').onclick();
  assert.equal(attempts,0);
  assert.equal(started.length,1);
  assert.equal(started[0].mapId,'jungle');
  assert.equal(started[0].hardMode,true);
  assert.equal(started[0].hardModifier,'auto');
});
