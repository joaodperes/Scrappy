const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function boot() {
  let webSocketServer;
  let now=100000;
  const timers=[];
  class WSS {
    constructor(){webSocketServer=this;this.handlers={}}
    on(type,handler){this.handlers[type]=handler}
  }
  class Client {
    constructor(){this.handlers={};this.sent=[];this.readyState=1}
    on(type,handler){this.handlers[type]=handler}
    send(message){this.sent.push(JSON.parse(message))}
    sendPacket(data){this.handlers.message(JSON.stringify(data))}
    last(type){return this.sent.filter(p=>p.type===type).at(-1)}
  }
  const timer=(callback,duration)=>{
    const handle={callback,at:now+duration,disabled:false};
    timers.push(handle);return handle;
  };
  const advance=duration=>{
    now+=duration;
    for(const t of timers.filter(t=>!t.disabled && t.at<=now)){
      t.disabled=true;t.callback();
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'server.js'),'utf8'),{
    require:name=>{if(name!=='ws')throw Error('unexpected '+name);return {WebSocketServer:WSS}},
    process:{env:{PORT:8080}},
    setTimeout:timer,clearTimeout:h=>{if(h)h.disabled=true},
    setInterval:()=>0,clearInterval:()=>{},
    Date:{now:()=>now},Math,console:{log(){}},
  });
  const connect=()=>{const c=new Client();webSocketServer.handlers.connection(c);return c};
  return {connect,advance};
}
test('Gun Game shares unique ordered weapons and finishes with a Knife kill',()=>{
  const {connect,advance}=boot(),host=connect(),guest=connect();
  host.sendPacket({type:'join',room:'GG',name:'Host',isHost:true,
    config:{directoryRoom:true,mode:'gunGame',mapId:'city',maxPlayers:4,roundDuration:900}});
  guest.sendPacket({type:'join',room:'GG',name:'Guest',requireExisting:true});
  host.sendPacket({type:'hostStartGame'});
  const order=host.last('roundCountdown').gunOrder;
  const seed=host.last('roundCountdown').gunSeed;
  assert.ok(Number.isInteger(seed) && seed>=0 && seed<=0xffffffff);
  assert.equal(guest.last('roundCountdown').gunSeed,seed);
  // The ladder can be reproduced from the broadcast seed and same pool.
  const source=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
  const poolLine=source.match(/^const GUN_POOL=.*;$/m)?.[0];
  const begin=source.indexOf('function randomizedGunOrder(seed){');
  const end=source.indexOf('\n}',begin)+2;
  assert.ok(poolLine&&begin>0&&end>begin);
  const seeded=new Function(poolLine+'\n'+source.slice(begin,end)+'\nreturn randomizedGunOrder;')();
  assert.deepEqual(seeded(seed),order);
  assert.equal(order[0],'PISTOL');
  assert.equal(order.at(-1),'KNIFE');
  assert.equal(order.length,new Set(order).size);
  advance(5000);
  assert.deepEqual(Array.from(host.last('roundStart').gunOrder),Array.from(order));
  assert.equal(host.last('roundStart').gunSeed,seed);
  const target=guest.last('welcome').id;
  for(let i=0;i<order.length;i++){
    advance(100);
    host.sendPacket({type:'move',x:0,y:1.7,z:0,yaw:0});
    guest.sendPacket({type:'move',x:1,y:1.7,z:0,yaw:0});
    if(i===0){
      host.sendPacket({type:'hit',targetId:target,weapon:'KNIFE',dmg:100});
      assert.equal(host.last('killed'),undefined);
    }
    host.sendPacket({type:'hit',targetId:target,weapon:order[i],dmg:100});
    assert.equal(host.last('killed').killerScore,i+1);
    if(i<order.length-1)assert.equal(host.last('weaponProgress').weapon,order[i+1]);
    if(i<order.length-1)advance(5100);
  }
  assert.equal(host.last('roundEnd').winner,'Host');
});
