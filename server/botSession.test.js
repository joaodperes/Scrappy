const test=require('node:test');
const assert=require('node:assert/strict');
const {
  createBotSession,reconcileBotSession,updateBotPosition,
  markBotDown,respawnBot,stepBotSession,
}=require('./botSession.js');

const spawn=slot=>({x:slot.team==='BLUE'?20:-20,y:1.72,z:0});
const player=(id,x,z,team)=>({
 id,owner:'human',alive:true,hp:100,team,position:{x,y:1.72,z},
});
const cfg={mode:'tdm',maxPlayers:6,fillBots:true};
const humans=[player('host',-15,0,'RED')];
function ready(seed=1){
 const session=createBotSession(cfg,seed);
 return reconcileBotSession(session,humans,spawn,0);
}
test('opt-in competitive bots use trusted provided spawns, never synthetic coordinates',()=>{
 const blank=createBotSession(cfg,1);
 assert.equal(reconcileBotSession(blank,humans,undefined).bots.length,0);
 assert.equal(reconcileBotSession(blank,humans,()=>null).bots.length,0);
 assert.equal(ready().bots.length,5);
 assert.ok(ready().bots.every(b=>b.brain.owner==='server'&&b.brain.position.y===1.72));
 const denied=reconcileBotSession(createBotSession({...cfg,fillBots:false}),humans,spawn,0);
 assert.equal(denied.bots.length,0);
});
test('human arrivals replace slot capacity; stable identities preserve decision state',()=>{
 let session=ready();
 assert.equal(session.bots.length,5);
 session=updateBotPosition(session,session.bots[0].slot.id,{x:33,y:1.72,z:4});
 const id=session.bots[0].slot.id;
 const withGuest=reconcileBotSession(session,[...humans,player('guest',15,0,'BLUE')],spawn,1200);
 assert.equal(withGuest.bots.length,4);
 const b=withGuest.bots.find(b=>b.slot.id===id);
 if(b&&b.slot.team===session.bots[0].slot.team)
   assert.equal(b.brain.position.x,33);
 assert.equal(new Set(withGuest.bots.map(x=>x.slot.id)).size,4);
 const full=Array.from({length:6},(_,i)=>player('human'+i,0,0,i%2?'BLUE':'RED'));
 assert.equal(reconcileBotSession(withGuest,full,spawn).bots.length,0);
});
test('bot down/respawn is timed and does not mutate other bots',()=>{
 let session=ready();
 const bot=session.bots[0],id=bot.slot.id;
 session=markBotDown(session,id,1000,5000);
 assert.equal(session.bots.find(b=>b.slot.id===id).alive,false);
 const idle=stepBotSession(session,{active:true,humans,lineOfSight:()=>true},2000);
 assert.ok(idle.commands.every(x=>x.id!==id));
 session=respawnBot(session,id,spawn(bot.slot),5999);
 assert.equal(session.bots.find(b=>b.slot.id===id).alive,false);
 session=respawnBot(session,id,spawn(bot.slot),6000);
 assert.equal(session.bots.find(b=>b.slot.id===id).alive,true);
 assert.equal(session.bots.find(b=>b.slot.id===id).hp,100);
 assert.equal(session.bots.find(b=>b.slot.id===id).brain.lastTickMs,6000);
});
test('frame decisions never mutate actor arrays or perform authoritative damage',()=>{
 const session=ready();
 const humansNow=[...humans,player('guest',20,10,'BLUE')];
 const first=stepBotSession(session,{active:true,humans:humansNow,lineOfSight:()=>true},1000);
 assert.equal(first.commands.length,session.bots.length);
 assert.ok(first.commands.every(c=>c.id.startsWith('bot_')&&
   typeof c.fire==='boolean'&&Number.isFinite(c.move.x)&&Number.isFinite(c.yaw)));
 assert.deepEqual(humansNow,[...humans,player('guest',20,10,'BLUE')]);
 assert.equal(session.bots[0].brain.lastTickMs,0);
 assert.equal(first.session.bots[0].brain.lastTickMs,1000);
 assert.equal(first.commands.some(c=>Object.hasOwn(c,'damage')),false);
});
test('no live room activation: session planner does not appear in WS server',()=>{
 const fs=require('node:fs');
 const path=require('node:path');
 const srv=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
 assert.equal(srv.includes("require('./botSession.js')"),false);
});
