// Run with: npm test (from server/)
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function harness(){
  let server;const timers=[];
  class Server{
    constructor(){server=this;this.handlers={}}
    on(name,handler){this.handlers[name]=handler}
  }
  class Client{
    constructor(){this.handlers={};this.messages=[];this.readyState=1}
    on(type,fn){this.handlers[type]=fn}
    send(body){this.messages.push(JSON.parse(body))}
    emit(message){this.handlers.message(JSON.stringify(message))}
    latest(type){return this.messages.filter(m=>m.type===type).at(-1)}
  }
  const source=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
  vm.runInNewContext(source,{
    require:name=>{if(name!=='ws')throw Error(name);return {WebSocketServer:Server}},
    process:{env:{PORT:8080}},
    setTimeout:(fn,delay)=>{const t={fn,delay,canceled:false};timers.push(t);return t},
    clearTimeout:t=>{if(t)t.canceled=true},
    setInterval:()=>0,clearInterval:()=>{},
    console:{log(){}},
  });
  const connect=()=>{const c=new Client();server.handlers.connection(c);return c};
  return {
    connect,
    advance:delay=>{
      const queued=timers.filter(t=>t.delay===delay&&!t.canceled);
      for(const t of queued){t.canceled=true;t.fn()}
      return queued.length;
    },
  };
}

test('TDM assigns balanced teams; server countdown forbids early attacks',()=>{
  const {connect,advance}=harness();
  const host=connect(),opponent=connect(),teammate=connect();
  const cfg={directoryRoom:true,mode:'tdm',mapId:'jungle',maxPlayers:4,
    scoreLimit:1,roundDuration:90,respawnDelay:5};
  host.emit({type:'join',room:'MATCH',name:'A',config:cfg,isHost:true});
  opponent.emit({type:'join',room:'MATCH',name:'B',requireExisting:true});
  teammate.emit({type:'join',room:'MATCH',name:'C',requireExisting:true});
  assert.equal(host.latest('welcome').team,'RED');
  assert.equal(opponent.latest('welcome').team,'BLUE');
  assert.equal(teammate.latest('welcome').team,'RED');
  host.emit({type:'hostStartGame'});
  assert.ok(host.latest('roundCountdown'));
  host.emit({type:'hit',targetId:opponent.latest('welcome').id,dmg:120});
  assert.equal(opponent.latest('hit'),undefined);
  assert.equal(advance(5000),1);
  assert.equal(host.latest('roundStart').duration,90);
  host.emit({type:'hit',targetId:teammate.latest('welcome').id,dmg:120});
  assert.equal(teammate.latest('hit'),undefined);
  host.emit({type:'hit',targetId:opponent.latest('welcome').id,dmg:120,weapon:'SMG'});
  assert.equal(opponent.latest('killed').victimId,opponent.latest('welcome').id);
  assert.equal(host.latest('damageConfirmed').damage,100);
  assert.equal(host.latest('roundEnd').winner,'RED');
  assert.equal(host.latest('roundEnd').teams.RED,1);
});

test('a room cannot start with fewer than two humans',()=>{
  const {connect,advance}=harness();
  const host=connect();
  host.emit({type:'join',room:'ROOM',name:'A',isHost:true,
    config:{directoryRoom:true,mode:'ffa',maxPlayers:4}});
  host.emit({type:'hostStartGame'});
  assert.match(host.latest('roomError').message,/Two players/);
  assert.equal(advance(5000),0);
  assert.equal(host.latest('roundStart'),undefined);
});

test('server duration expires the round and broadcasts results',()=>{
  const {connect,advance}=harness();
  const host=connect(),guest=connect();
  host.emit({type:'join',room:'LONG',name:'A',isHost:true,
    config:{directoryRoom:true,mode:'ffa',maxPlayers:2,roundDuration:60}});
  guest.emit({type:'join',room:'LONG',name:'B',requireExisting:true});
  host.emit({type:'hostStartGame'});
  advance(5000);
  assert.equal(advance(60000),1);
  assert.ok(host.latest('roundEnd'));
});

test('No Limit time works only with a score goal and never schedules a timeout',()=>{
  const {connect,advance}=harness();
  const rejected=connect();
  rejected.emit({type:'join',room:'INVALID',name:'Bad',isHost:true,
    config:{directoryRoom:true,mode:'ffa',maxPlayers:6,roundDuration:0,scoreLimit:0}});
  assert.match(rejected.latest('roomError').message,/time limit or a kill limit/);

  const host=connect(),opponent=connect();
  host.emit({type:'join',room:'UNLIMITED',name:'Host',isHost:true,
    config:{directoryRoom:true,mode:'ffa',maxPlayers:6,roundDuration:0,scoreLimit:15}});
  opponent.emit({type:'join',room:'UNLIMITED',name:'Opponent',requireExisting:true});
  host.emit({type:'hostStartGame'});
  assert.equal(advance(5000),1);
  assert.equal(host.latest('roundStart').duration,0);
  assert.equal(advance(60000),0);
  assert.equal(advance(1800000),0);
  assert.equal(host.latest('roundEnd'),undefined);
});
