const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../js/profileSession.js'),'utf8')
 .replace(/^export /gm,'');

function fakeDatabase(){
 let data={profile:{firebaseUid:'google-account',totalXp:100}},queue=Promise.resolve();
 const watchers=new Set();
 const copy=x=>JSON.parse(JSON.stringify(x));
 const snapshot=()=>({exists:true,data:()=>copy(data),metadata:{fromCache:false}});
 const publish=()=>{for(const cb of [...watchers])queueMicrotask(()=>cb(snapshot()))};
 function serialize(fn){
  const current=queue.then(fn);
  queue=current.catch(()=>{});
  return current;
 }
 const doc={
  async get(){return snapshot()},
  async set(changes){return serialize(()=>{data={...data,...copy(changes)};publish()})},
  onSnapshot(cb){
   watchers.add(cb);queueMicrotask(()=>{if(watchers.has(cb))cb(snapshot())});
   return ()=>watchers.delete(cb);
  },
 };
 const db={
  collection:()=>({doc:()=>doc}),
  runTransaction:fn=>serialize(async()=>{
   const commands=[];
   const result=await fn({
    get:async()=>snapshot(),
    set:(_ref,changes)=>commands.push(changes),
   });
   for(const changes of commands)data={...data,...copy(changes)};
   if(commands.length)publish();
   return result;
  }),
 };
 return {db,read:()=>copy(data)};
}
function browser(store,seed){
 const events=[];
 const firestore=()=>store.db;
 firestore.FieldValue={serverTimestamp:()=>new Date().toISOString()};
 const firebase={
  firestore,
  auth:()=>({currentUser:{uid:'google-account'}}),
 };
 const crypto={getRandomValues(bytes){bytes.fill(seed);return bytes}};
 const context={
  firebase,crypto,console,
  Promise,setTimeout,clearTimeout,
  setInterval:()=>1234,clearInterval:()=>{},
 };
 vm.createContext(context);
 vm.runInContext(source+
  '\nthis.session={acquireGameSession,releaseGameSession,activeGameSession,clearSessionOnSignOut};',context);
 return {session:context.session,events};
}
test('Google authentication alone does not seize the running game',async()=>{
 const db=fakeDatabase(),a=browser(db,1),b=browser(db,2);
 await a.session.acquireGameSession({onLost:message=>a.events.push(message)});
 const first=db.read().activeSession.id;
 assert.ok(first);
 assert.equal(b.session.activeGameSession(),null);
 assert.equal(db.read().activeSession.id,first);
 await a.session.releaseGameSession();
 assert.equal(db.read().activeSession,null);
});
test('new Play request takes over and old browser yields after flushing',async()=>{
 const db=fakeDatabase(),a=browser(db,1),b=browser(db,2);
 let handoff=0;
 await a.session.acquireGameSession({
  onLost:message=>a.events.push(message),
  onBeforeHandoff:async()=>{handoff++},
 });
 const oldId=db.read().activeSession.id;
 await b.session.acquireGameSession({onLost:message=>b.events.push(message)});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(handoff,1);
 assert.equal(a.events.length,1);
 assert.equal(a.session.activeGameSession(),null);
 assert.ok(b.session.activeGameSession());
 assert.notEqual(db.read().activeSession.id,oldId);
 assert.equal(db.read().activeSession.id,b.session.activeGameSession().id);
 await a.session.releaseGameSession();
 assert.equal(db.read().activeSession.id,b.session.activeGameSession().id);
 await b.session.releaseGameSession();
 assert.equal(db.read().activeSession,null);
});
