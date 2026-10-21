const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../js/progression.js'),'utf8');
function extract(name){
 const pattern=new RegExp('export (?:async )?function '+name+'\\(\\) \\{[\\s\\S]*?^\\}', 'm');
 const found=source.match(pattern);
 assert.ok(found, 'Missing '+name+' implementation');
 return found[0].replace(/^export /,'');
}
const save=extract('saveProfile'),flush=extract('flushProfileToCloud');
function harness(){
 const writes=[],resolvers=[],profile={firebaseUid:'account-A'};
 const context={
  Promise,profile,
  _saveToLocalStorage(){},
  _saveToFirestore(){
   writes.push(profile.firebaseUid);
   return new Promise(resolve=>resolvers.push(resolve));
  },
 };
 vm.createContext(context);
 vm.runInContext(`
  let _cloudDirty=false, _cloudRevision=0, _cloudFlushPromise=Promise.resolve();
  ${save}
  ${flush}
  this.api={saveProfile,flushProfileToCloud,
    dirty:()=>_cloudDirty,revision:()=>_cloudRevision};
 `,context);
 return {api:context.api,profile,writes,resolvers};
}
const cycle=()=>new Promise(resolve=>setImmediate(resolve));
test('profile flush serializes overlapping writes and retains newer dirty edits',async()=>{
 const h=harness();
 h.api.saveProfile();
 const first=h.api.flushProfileToCloud();
 await cycle();
 assert.deepEqual(h.writes,['account-A']);
 h.api.saveProfile();
 assert.equal(h.api.dirty(),true);
 const second=h.api.flushProfileToCloud();
 await cycle();
 assert.equal(h.writes.length,1,'second write must wait behind first');
 h.resolvers[0](true);
 await first;
 assert.equal(h.api.dirty(),true,'new edits must remain dirty after stale write');
 await cycle();
 assert.equal(h.writes.length,2);
 h.resolvers[1](true);
 await second;
 assert.equal(h.api.dirty(),false);
});
test('failed writes and account switches never clear pending local edits',async()=>{
 const h=harness();
 h.api.saveProfile();
 const failed=h.api.flushProfileToCloud();
 await cycle();
 h.resolvers[0](false);
 await failed;
 assert.equal(h.api.dirty(),true);
 const switched=h.api.flushProfileToCloud();
 await cycle();
 h.profile.firebaseUid='account-B';
 h.resolvers[1](true);
 await switched;
 assert.equal(h.api.dirty(),true);
});
