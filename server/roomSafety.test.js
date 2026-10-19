// Run with: node --test server/roomSafety.test.js
// Mock WebSockets intentionally reflect one close listener so this test fails
// if the server starts overwriting its own presence cleanup again.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function boot(){
  let server;
  const timers=[];
  class WSS{
    constructor(){server=this;this.handlers={}}
    on(name,fn){this.handlers[name]=fn}
  }
  class Client{
    constructor(){this.handlers={};this.messages=[];this.readyState=1}
    on(name,fn){this.handlers[name]=fn}
    send(body){this.messages.push(JSON.parse(body))}
    emit(packet){this.handlers.message(JSON.stringify(packet))}
    close(){this.readyState=3;this.handlers.close?.()}
    latest(type){return this.messages.filter(m=>m.type===type).at(-1)}
  }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'server.js'),'utf8'),{
    require:name=>{if(name!=='ws')throw Error(name);return{WebSocketServer:WSS}},
    process:{env:{PORT:8080}},
    setTimeout:(fn,delay)=>{const t={fn,delay,canceled:false};timers.push(t);return t},
    clearTimeout:t=>{if(t)t.canceled=true},
    setInterval:()=>1,clearInterval:()=>{},
    console:{log(){}},
  });
  return {
    connect:()=>{const c=new Client();server.handlers.connection(c);return c},
    timers,
    advance:delay=>{
      const next=timers.filter(t=>t.delay===delay&&!t.canceled);
      for(const t of next){t.canceled=true;t.fn()}
      return next.length;
    },
  };
}
const cfg=(extra={})=>({
  directoryRoom:true,mode:'ffa',mapId:'scrapyard',
  maxPlayers:6,roundDuration:600,scoreLimit:30,name:'Open lobby',...extra,
});
const join=(client,room,config)=>client.emit({type:'join',room,name:'Tester',isHost:true,config});

test('room creation rejects forged invalid directory settings',()=>{
  const {connect}=boot();
  const invalid=[
    [cfg({mapId:'untrusted'}),'Unsupported map'],
    [cfg({mode:'bad'}),'Unsupported game mode'],
    [cfg({maxPlayers:300}),'Invalid room capacity'],
    [cfg({maxPlayers:-1}),'Invalid room capacity'],
    [cfg({maxPlayers:2.5}),'Invalid room capacity'],
    [cfg({mode:'survival',maxPlayers:6}),'Survival rooms require two slots'],
    [cfg({mode:'tdm',maxPlayers:5}),'TDM requires even room capacity'],
    [cfg({roundDuration:-1}),'Invalid round duration'],
    [cfg({roundDuration:Infinity}),'Invalid round duration'],
    [cfg({roundDuration:0,scoreLimit:0}),'Choose a time limit or a kill limit'],
    [cfg({scoreLimit:-1}),'Invalid score limit'],
    [cfg({scoreLimit:9999}),'Invalid score limit'],
    [cfg({name:{html:'bad'}}),'Invalid room name'],
  ];
  const c=connect();
  invalid.forEach(([config,error],i)=>{
    join(c,'INVALID'+i,config);
    assert.equal(c.latest('roomError')?.message,error,'config '+i);
    assert.equal(c.latest('welcome'),undefined,'config '+i+' must not create room');
  });
  c.emit({type:'listRooms'});
  assert.equal(c.latest('roomList').rooms.length,0);
});

test('host configuration is normalized and guest cannot overwrite host fields',()=>{
  const {connect}=boot(),host=connect(),guest=connect();
  join(host,'SAFE01',cfg({name:'   My Room   ',fillBots:true,scoreLimit:0}));
  const welcome=host.latest('welcome');
  assert.equal(welcome.config.name,'My Room');
  assert.equal(welcome.config.fillBots,true);
  assert.equal(welcome.config.scoreLimit,0);
  assert.equal(welcome.config.roundDuration,600);
  guest.emit({type:'join',room:'SAFE01',name:'Guest',requireExisting:true,
    config:cfg({name:'HACKED',maxPlayers:14,mapId:'city'})});
  const newWelcome=guest.latest('welcome');
  assert.equal(newWelcome.config.name,'My Room');
  assert.equal(newWelcome.config.maxPlayers,6);
  assert.equal(newWelcome.config.mapId,'scrapyard');
  assert.equal(newWelcome.isHost,false);
  assert.equal(host.latest('roomUpdated').players.length,2);
});

test('invalid room codes are rejected but legacy 2-character codes stay usable',()=>{
  const {connect}=boot(),c=connect();
  join(c,'??!',cfg());
  assert.match(c.latest('roomError').message,/room code/);
  join(c,'GG',cfg({mode:'gunGame',mapId:'city',maxPlayers:4}));
  assert.equal(c.latest('welcome').roomId,'GG');
});

test('disconnect during countdown cancels match and allows clean restart',()=>{
  const {connect,timers,advance}=boot(),host=connect(),guest=connect();
  join(host,'COUNT01',cfg({mode:'tdm'}));
  guest.emit({type:'join',room:'COUNT01',name:'Guest',requireExisting:true});
  host.emit({type:'hostStartGame'});
  assert.equal(host.latest('roundCountdown').type,'roundCountdown');
  const timer=timers.find(t=>t.delay===5000);
  assert.ok(timer);
  guest.close();
  assert.equal(host.latest('roomUpdated').players.length,1);
  assert.equal(host.latest('roundCancelled').reason,'Not enough connected players');
  assert.equal(timer.canceled,true);
  host.emit({type:'hostStartGame'});
  assert.match(host.latest('roomError').message,/Two players/);
  const replacement=connect();
  replacement.emit({type:'join',room:'COUNT01',name:'Replacement',requireExisting:true});
  host.emit({type:'hostStartGame'});
  assert.equal(advance(5000),1);
  assert.equal(host.latest('roundStart').type,'roundStart');
});

test('the host departing before round start promotes a remaining human',()=>{
  const {connect}=boot(),host=connect(),guest=connect();
  join(host,'PROMO1',cfg());
  guest.emit({type:'join',room:'PROMO1',name:'Guest',requireExisting:true});
  host.close();
  assert.equal(guest.latest('hostAssigned').id,guest.latest('welcome').id);
  assert.equal(guest.latest('roomUpdated').players.length,1);
  const list=connect();list.emit({type:'listRooms'});
  assert.equal(list.latest('roomList').rooms[0].id,'PROMO1');
});

test('password protected rooms still prevent join and do not disclose password',()=>{
  const {connect}=boot(),owner=connect(),guest=connect();
  owner.emit({type:'join',room:'PRIVATE1',name:'Owner',isHost:true,
    password:'secret123',config:cfg()});
  const browse=connect();browse.emit({type:'listRooms'});
  const entry=browse.latest('roomList').rooms[0];
  assert.equal(entry.hasPassword,true);
  assert.equal(Object.hasOwn(entry,'password'),false);
  guest.emit({type:'join',room:'PRIVATE1',requireExisting:true,password:'wrong'});
  assert.equal(guest.latest('roomError').message,'Incorrect room password');
  guest.emit({type:'join',room:'PRIVATE1',requireExisting:true,password:'secret123'});
  assert.equal(guest.latest('welcome').isHost,false);
});

test('losing the last opponent during a live PvP round ends the match for the remaining player',()=>{
 const {connect,advance}=boot(),host=connect(),guest=connect();
 join(host,'ACTIVE2',cfg({mode:'ffa',roundDuration:600,scoreLimit:0}));
 guest.emit({type:'join',room:'ACTIVE2',name:'Guest',requireExisting:true});
 host.emit({type:'hostStartGame'});
 assert.equal(advance(5000),1);
 assert.equal(host.latest('roundStart').type,'roundStart');
 guest.close();
 assert.equal(host.latest('roundEnd').winner,'CANCELLED');
 assert.equal(host.latest('roundEnd').reason,'insufficientPlayers');
 assert.equal(host.latest('roomUpdated').players.length,1);
 // Stale timeout must not award a win after cancellation.
 assert.equal(advance(600000),0);
 const browser=connect();browser.emit({type:'listRooms'});
 assert.equal(browser.latest('roomList').rooms.some(r=>r.id==='ACTIVE2'),true);
});
