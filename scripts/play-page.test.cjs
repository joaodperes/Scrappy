// node --test scripts/play-page.test.cjs
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../js/roomFlow.js'),'utf8')
  .replace(/^import .*?;$/gm,'').replace(/\bexport\s+/g,'');
function harness(){
  const elements=[],sockets=[],sent=[],started=[];
  class Element{
    constructor(tag){
      this.tag=tag;this.children=[];this.style={};this._text='';
      this.value='';this.disabled=false;this.options={items:[],get length(){return this.items.length},
        [Symbol.iterator](){return this.items[Symbol.iterator]()},
        push(v){this.items.push(v)}};this.checked=false;
      this.listeners={};elements.push(this);
    }
    set textContent(v){this._text=String(v);this.children=[]}
    get textContent(){return this._text}
    appendChild(child){
      this.children.push(child);
      if(this.tag==='select'&&child.tag==='option')this.options.push(child);
      return child;
    }
    replaceChildren(...children){this.children=[...children]}
    addEventListener(type,listener){(this.listeners[type]||=[]).push(listener)}
    fire(type){this['on'+type]?.();for(const fn of this.listeners[type]||[])fn()}
    remove(){this.removed=true}
    querySelectorAll(){return []}
  }
  const body=new Element('body');
  const document={body,createElement:tag=>new Element(tag),getElementById:()=>null};
  class WebSocket{
    static OPEN=1;
    constructor(url){this.url=url;this.readyState=1;sockets.push(this)}
    send(packet){sent.push(JSON.parse(packet))}
    close(){this.readyState=3}
  }
  const context={
    document,window:{},
    MAPS:{
      scrapyard:{id:'scrapyard',name:'Scrapyard',icon:'🏭'},
      jungle:{id:'jungle',name:'Jungle',icon:'🌿'},
    },
    isModeSupported:()=>true,getRoomCapacity:()=>8,
    getCurrentMap:()=> 'scrapyard',
    isHardModeUnlocked:id=>id==='jungle',
    isNightmareUnlocked:id=>id==='jungle',
    profile:{name:'Tester',displayName:'Tester'},
    HARD_MODE_MODIFIERS:[{id:'reinforced',label:'REINFORCED',desc:'More health'},
      {id:'swarm',label:'SWARM',desc:'More bots'}],
    location:{hostname:'localhost',host:'localhost:3000'},
    WebSocket,crypto:{getRandomValues:x=>x.fill(1)},
    setInterval:()=>0,clearInterval:()=>{},console,
  };
  vm.createContext(context);
  vm.runInContext(source+'\nthis.api={showPlayPage,initRoomFlow}',context);
  context.api.initRoomFlow({onStartSurvival:cfg=>started.push(cfg)});
  return {context,elements,sockets,sent,started,
    findButton:label=>elements.filter(e=>e.tag==='button'&&e.textContent===label).at(-1),
    findSelect:value=>elements.find(e=>e.tag==='select'&&Array.from(e.options).some(x=>x.value===value))};
}
test('Play choices, mode, map and difficulty remain on a single page',()=>{
  const h=harness();h.context.api.showPlayPage();
  for(const label of ['SINGLE PLAYER','CREATE ROOM','BROWSE ROOMS','BACK TO MENU'])
    assert.ok(h.findButton(label),label);
  const difficulty=h.findSelect('nightmare');
  assert.equal(Array.from(difficulty.options).find(x=>x.value==='nightmare').disabled,true);
  assert.equal(h.sockets.length,0);
  h.findButton('CREATE ROOM').onclick();
  assert.ok(h.findButton('CREATE ROOM'));
  assert.equal(h.sockets.length,0);
  h.findButton('BROWSE ROOMS').onclick();
  assert.ok(h.findButton('REFRESH ROOMS'));
  assert.equal(h.sockets.length,0);
});
test('Room time / kill limits transmit in host config',()=>{
  const h=harness();h.context.api.showPlayPage();
  const map=h.findSelect('jungle');map.value='jungle';map.fire('change');
  h.findButton('CREATE ROOM').onclick();
  const mode=h.findSelect('tdm');mode.value='tdm';mode.fire('change');
  const numeric=h.elements.filter(e=>e.tag==='input'&&e.type==='number');
  assert.equal(numeric.length,2);
  numeric[0].value='13';numeric[1].value='42';
  h.findButton('CREATE ROOM').onclick();
  assert.equal(h.sockets.length,1);
  h.sockets[0].onopen();
  const cfg=h.sent.at(-1).config;
  assert.equal(cfg.roundDuration,780);
  assert.equal(cfg.scoreLimit,42);
  assert.equal(cfg.mode,'tdm');
  assert.equal(cfg.mapId,'jungle');
});
test('Nightmare selector launches solo without a room connection',()=>{
  const h=harness();h.context.api.showPlayPage();
  const map=h.findSelect('jungle');map.value='jungle';map.fire('change');
  const difficulty=h.findSelect('nightmare');
  assert.equal(Array.from(difficulty.options).find(x=>x.value==='nightmare').disabled,false);
  difficulty.value='nightmare';
  h.findButton('START SOLO SURVIVAL').onclick();
  assert.equal(h.sockets.length,0);
  assert.equal(h.started.length,1);
  assert.equal(h.started[0].difficulty,'nightmare');
  assert.equal(h.started[0].hardMode,true);
});
