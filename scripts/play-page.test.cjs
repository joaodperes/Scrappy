// node --test scripts/play-page.test.cjs
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../js/roomFlow.js'),'utf8')
  .replace(/^import .*?;$/gm,'').replace(/\bexport\s+/g,'');
const rules=fs.readFileSync(path.join(__dirname,'../js/roomSettings.js'),'utf8')
  .replace(/\bexport\s+/g,'');
function harness(){
  const elements=[],sockets=[],sent=[],started=[],chosen=[];
  class Element{
    constructor(tag){
      this.tag=tag;this.children=[];this.style={};this._text='';
      this.value='';this.disabled=false;this.options={items:[],
        get length(){return this.items.length},
        [Symbol.iterator](){return this.items[Symbol.iterator]()},
        push(v){this.items.push(v)}};
      this.checked=false;this.listeners={};elements.push(this);
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
    document,window:{},MAPS:{
      scrapyard:{id:'scrapyard',name:'Scrapyard',icon:'🏭'},
      jungle:{id:'jungle',name:'Jungle',icon:'🌿'},
      locked:{id:'locked',name:'Locked Map',icon:'🔒',unlockHint:'Beat a Jungle boss'},
    },
    isModeSupported:()=>true,getRoomCapacity:()=>8,
    isMapUnlocked:id=>id!=='locked',
    getCurrentMap:()=> 'scrapyard',
    isHardModeUnlocked:id=>id==='jungle',
    isNightmareUnlocked:id=>id==='jungle',
    profile:{name:'Tester',displayName:'Tester'},
    HARD_MODE_MODIFIERS:[{id:'reinforced',label:'REINFORCED',desc:'More health'},
      {id:'swarm',label:'SWARM',desc:'More bots'}],
    location:{hostname:'localhost',host:'localhost:3000'},
    WebSocket,crypto:{getRandomValues:x=>x.fill(1)},
    setInterval:()=>0,clearInterval:()=>{},console,
    prompt:()=>'',Date,
  };
  vm.createContext(context);
  vm.runInContext(rules+'\n'+source+'\nthis.api={showPlayPage,initRoomFlow}',context);
  context.api.initRoomFlow({
    onStartSurvival:cfg=>started.push(cfg),
    onSelectLoadout:(cfg,callback)=>{chosen.push(cfg);callback?.({primary:'SMG',secondary:'SHOTGUN'})},
  });
  return {context,elements,sockets,sent,started,chosen,
    findButton:label=>elements.filter(e=>e.tag==='button'&&e.textContent===label).at(-1),
    findSelect:value=>elements.filter(e=>e.tag==='select'&&Array.from(e.options).some(x=>x.value===value)).at(-1)};
}
test('Play has only Create/Browse top navigation and Solo nested inside Create',()=>{
  const h=harness();h.context.api.showPlayPage();
  for(const label of ['SINGLE PLAYER','ONLINE ROOM','CREATE ROOM','BROWSE ROOMS','✕ BACK TO MENU','START SOLO SURVIVAL'])
    assert.ok(h.findButton(label),label);
  assert.equal(h.elements.filter(e=>e.tag==='button'&&e.textContent==='SINGLE PLAYER').length,1);
  assert.equal(h.sockets.length,0);
  const nightmare=h.findSelect('nightmare');
  assert.equal(Array.from(nightmare.options).find(o=>o.value==='nightmare').disabled,true);
  assert.match(Array.from(nightmare.options).find(o=>o.value==='nightmare').textContent,/Clear a Hard boss/);
  assert.ok(h.elements.some(e=>e.tag==='details'));
});
test('Solo Nightmare launch keeps no-socket path',()=>{
  const h=harness();h.context.api.showPlayPage();
  const map=h.findSelect('jungle');map.value='jungle';map.fire('change');
  const difficulty=h.findSelect('nightmare');
  assert.equal(Array.from(difficulty.options).find(o=>o.value==='nightmare').disabled,false);
  difficulty.value='nightmare';
  h.findButton('START SOLO SURVIVAL').onclick();
  assert.equal(h.sockets.length,0);
  assert.equal(h.started.length,1);
  assert.equal(h.started[0].difficulty,'nightmare');
  assert.equal(h.started[0].hardMode,true);
});
test('Online room offers fixed limits and 6/10/14 max; both limits cannot be zero',()=>{
  const h=harness();h.context.api.showPlayPage();
  h.findButton('ONLINE ROOM').onclick();
  const map=h.findSelect('jungle');map.value='jungle';map.fire('change');
  const mode=h.findSelect('tdm');mode.value='tdm';mode.fire('change');
  const duration=h.findSelect('1800'),kills=h.findSelect('100');
  assert.deepEqual(Array.from(duration.options).map(o=>o.value),['0','300','600','900','1200','1800']);
  assert.deepEqual(Array.from(kills.options).map(o=>o.value),['0','15','30','50','80','100']);
  const size=h.findSelect('14');
  assert.deepEqual(Array.from(size.options).map(o=>o.value),['6','10','14']);
  assert.match(Array.from(size.options).at(-1).textContent,/7 vs 7/);
  duration.value='0';kills.value='0';size.value='14';
  h.findButton('CREATE ROOM').onclick();
  assert.equal(h.sockets.length,0);
  kills.value='50';
  h.findButton('SELECT PVP LOADOUT').onclick();
  assert.equal(h.chosen.length,1);
  h.findButton('CREATE ROOM').onclick();
  assert.equal(h.sockets.length,1);
  h.sockets[0].onopen();
  const cfg=h.sent.at(-1).config;
  assert.equal(cfg.roundDuration,0);
  assert.equal(cfg.scoreLimit,50);
  assert.equal(cfg.maxPlayers,14);
  assert.equal(cfg.mode,'tdm');
  assert.equal(cfg.mapId,'jungle');
});
test('Browse opens a dynamic room table with capacity and password column',()=>{
  const h=harness();h.context.api.showPlayPage();
  h.findButton('BROWSE ROOMS').onclick();
  assert.ok(h.findButton('REFRESH ROOMS'));
  assert.equal(h.sockets.length,1);
  h.sockets[0].onopen();
  assert.equal(h.sent.at(-1).type,'listRooms');
  h.sockets[0].onmessage({data:JSON.stringify({type:'roomList',rooms:[
    {id:'R1',name:'Arena',humans:3,maxPlayers:10,mode:'ffa',mapId:'city',hasPassword:true},
  ]})});
  assert.ok(h.elements.some(e=>e.tag==='th'&&e.textContent==='PASSWORD'));
  assert.ok(h.elements.some(e=>e.tag==='td'&&e.textContent==='Arena'));
  assert.ok(h.elements.some(e=>e.tag==='td'&&e.textContent==='10'));
  assert.ok(h.findButton('JOIN'));
});
test('map and difficulty unlock hints appear only inside selects, aligned and equally high',()=>{
  const h=harness();h.context.api.showPlayPage();
  const map=h.findSelect('locked'),difficulty=h.findSelect('nightmare');
  const lockedMap=Array.from(map.options).find(o=>o.value==='locked');
  assert.equal(lockedMap.disabled,true);
  assert.match(lockedMap.textContent,/Beat a Jungle boss/);
  assert.equal(map.style.height,'42px');
  assert.equal(difficulty.style.height,'42px');
  assert.ok(h.elements.filter(e=>e.tag==='span'&&e.textContent==='Map').length>0);
  assert.ok(h.elements.filter(e=>e.tag==='span'&&e.textContent==='Survival difficulty').length>0);
  const repeated=h.elements.filter(e=>e.tag==='p'&&/Nightmare.*Clear a Hard boss|Beat a Jungle boss/.test(e.textContent));
  assert.equal(repeated.length,0);
  const help=h.elements.find(e=>e.tag==='details');
  assert.ok(help);
  assert.ok(h.elements.some(e=>e.tag==='strong'&&e.textContent==='ELITE ENEMIES'));
  assert.ok(h.elements.some(e=>e.tag==='p'&&/Bulwark.*Frenzied.*Regenerator/.test(e.textContent)));
});
