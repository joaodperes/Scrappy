const test=require('node:test');
const assert=require('node:assert/strict');
const {planBotSlots}=require('./botSlots.js');
const {makeBotBrain,chooseBotTarget,botThink}=require('./botBrain.js');

const pos=(x,z,y=1.72)=>({x,y,z});
const actor=(id,x,z,team=null,extras={})=>({
 id,owner:'human',alive:true,hp:100,team,position:pos(x,z),...extras,
});
const config={mode:'tdm',maxPlayers:6,fillBots:true};
function brain(seed=0){
 const slot=planBotSlots(config,[{id:'human_1',team:'RED'}],seed)[0];
 return makeBotBrain(slot,pos(0,0),0);
}
const see=()=>true;

test('server ownership and finite spawn are mandatory',()=>{
 const x=brain();
 assert.equal(x.owner,'server');
 assert.throws(()=>makeBotBrain({id:'bot_01',owner:'client'},pos(0,0)),/server slot/);
 assert.throws(()=>makeBotBrain({id:'bot_01',owner:'server'},pos(NaN,0)),/initial state/);
 assert.throws(()=>botThink({...x,owner:'client'}, {},0),/server bot state/);
});
test('TDM targets only enemies; same-team and unassigned targets excluded',()=>{
 const x=brain();
 assert.equal(x.team,'BLUE');
 const enemies=[
  actor('friend',2,0,'BLUE'),actor('neutral',1,0,null),
  actor('enemy',11,0,'RED'),
 ];
 const target=chooseBotTarget(x,enemies,'tdm',see);
 assert.equal(target.p.id,'enemy');
 assert.equal(chooseBotTarget(x,[enemies[0],enemies[1]],'tdm',see),null);
});
test('FFA ignores team, invisible/expired actors, self and spoofed owners',()=>{
 const x=brain();
 const candidates=[
  actor(x.id,0,0,'RED'),actor('dead',1,0,'RED',{alive:false}),
  actor('client_ghost',2,0,'RED',{owner:'arbitrary'}),
  actor('valid',3,0,'BLUE'),
 ];
 assert.equal(chooseBotTarget(x,candidates,'ffa',see).p.id,'valid');
 assert.equal(chooseBotTarget(x,[actor('too-far',160,0)],'ffa',see),null);
});
test('no server map or path adapter means no through-wall movement or fire',()=>{
 const x=brain();
 const world={mode:'tdm',actors:[actor('enemy',0,20,'RED')],lineOfSight:()=>false};
 const {command}=botThink(x,world,200);
 assert.equal(command.behavior,'seek');
 assert.deepEqual(command.move,{x:0,z:0});
 assert.equal(command.fire,false);
 const nav=botThink(x,{...world,nextWaypoint:()=>pos(5,0)},200);
 assert.ok(nav.command.move.x>0);
 assert.equal(nav.command.fire,false);
});
test('personality preferred distance chooses approach, retreat and strafe',()=>{
 let x=brain();
 x={...x,yaw:0,nextDecisionAt:0,nextFireAt:1};
 const base={mode:'tdm',lineOfSight:see,active:true};
 let out=botThink(x,{...base,actors:[actor('enemy',0,90,'RED')]},100);
 assert.equal(out.command.behavior,'advance');
 assert.ok(out.command.move.z>0);
 out=botThink(x,{...base,actors:[actor('enemy',0,1,'RED')]},100);
 assert.equal(out.command.behavior,'retreat');
 assert.ok(out.command.move.z<0);
 out=botThink(x,{...base,actors:[actor('enemy',0,x.preferredRange,'RED')]},100);
 assert.equal(out.command.behavior,'strafe');
 assert.notEqual(out.command.move.x,0);
});
test('reaction time and fire cooldown gate requested attacks',()=>{
 let state=brain(),q=actor('enemy',0,20,'RED');
 const world={mode:'tdm',actors:[q],lineOfSight:see};
 let a=botThink(state,world,100);state=a.state;
 assert.equal(a.command.fire,false);
 for(let time=200;time<=1800;time+=100){
  a=botThink(state,world,time);
  state=a.state;
 }
 assert.equal(a.command.targetId,'enemy');
 assert.ok(state.nextFireAt>=state.reactionMs);
 // At least one command must be a fire request after reaction & turn.
 state=brain();let fires=[];
 for(let time=100;time<=3500;time+=100){
   a=botThink(state,world,time);state=a.state;
   if(a.command.fire)fires.push(time);
 }
 assert.ok(fires.length>=2);
 assert.ok(fires.every((t,i)=>i===0||t-fires[i-1]>=390));
});
test('switching targets incurs a fresh reaction delay, not immediate firing',()=>{
 let state=brain();
 const w={mode:'tdm',lineOfSight:see,actors:[actor('a',0,15,'RED')]};
 let r;
 for(let i=100;i<=2500;i+=100){r=botThink(state,w,i);state=r.state}
 const updated={...w,actors:[actor('b',0,15,'RED')]};
 r=botThink(state,updated,2600);
 assert.equal(r.command.fire,false);
 assert.equal(r.state.targetId,'b');
 assert.ok(r.state.nextFireAt>=2600+state.reactionMs);
});
test('clock rewinds, large tick intervals and disabled matches are safe',()=>{
 const state=brain();
 const disabled=botThink(state,{active:false,mode:'ffa',actors:[actor('a',0,2)]},100);
 assert.equal(disabled.command.fire,false);
 assert.deepEqual(disabled.command.move,{x:0,z:0});
 const backwards=botThink({...state,lastTickMs:1000},{mode:'tdm',actors:[actor('a',2,4,'RED')],lineOfSight:see},100);
 assert.equal(backwards.state.lastTickMs,1000);
 assert.ok(Number.isFinite(backwards.state.yaw));
 assert.throws(()=>botThink(state,{},NaN),/Invalid server bot state/);
});
test('deterministic snapshots yield identical decisions for same state/world/time',()=>{
 const x=brain(5),w={mode:'tdm',actors:[actor('a',4,17,'RED')],lineOfSight:see};
 const a=botThink(x,w,600),b=botThink(x,w,600);
 assert.deepEqual(a,b);
 assert.deepEqual(x.position,pos(0,0));
});
