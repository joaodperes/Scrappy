const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../js/progression.js'),'utf8');
function extract(name){
 const regex=new RegExp('export (?:async )?function '+name+'\\([^]*?^\\}', 'm');
 const result=source.match(regex);assert.ok(result,'Missing '+name);
 return result[0].replace(/^export /,'');
}
const save=extract('saveProfile'),flush=extract('flushProfileToCloud');
const cycle=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
 const writes=[],resolvers=[];
 const ctx={Promise,writes,resolvers};
 vm.createContext(ctx);
 vm.runInContext(`
  let profile={firebaseUid:'user-A',totalXp:100,stats:{}};
  let _cloudDirty=false,_cloudRevision=0,_cloudFlushPromise=Promise.resolve();
  let _authEpoch=1,_profileLoadedUid='user-A';
  let _cloudBase={firebaseUid:'user-A',totalXp:100,stats:{}};
  let _recovery=null,sequence=0;
  const _copy=v=>JSON.parse(JSON.stringify(v));
  const _deepMerge=(base,value)=>({...base,...value});
  const _defaultProfile=()=>({firebaseUid:'user-A',totalXp:0,stats:{}});
  const _syncClientId=()=> 'device-A';
  const _nextSyncVersion=()=>++sequence;
  const _sameGoogleUser=uid=>uid==='user-A'&&profile.firebaseUid===uid;
  const _saveRecovery=()=>{};
  const _forgetRecovery=()=>{_recovery=null};
  const _scheduleCloudSync=()=>{};
  const _sanitizeUnlocks=()=>{};
  const _primeProgressNoticeHistory=()=>{};
  const _mergeProgress=(base,local,remote)=>({
    ...remote,totalXp:remote.totalXp+Math.max(0,local.totalXp-base.totalXp)});
  function _saveToFirestore(uid,snapshot,base,buffer){
   writes.push({uid,version:buffer.version,xp:snapshot.totalXp});
   return new Promise(resolve=>resolvers.push(resolve));
  }
  ${save}
  ${flush}
  this.api={saveProfile,flushProfileToCloud,
    edit:xp=>{profile.totalXp=xp},
    switchUid:uid=>{profile.firebaseUid=uid},
    dirty:()=>_cloudDirty,buffered:()=>_recovery,xp:()=>profile.totalXp};
 `,ctx);
 return {api:ctx.api,writes,resolvers};
}
test('serializes profile transactions without dropping subsequent edits',async()=>{
 const h=harness();
 h.api.edit(110);h.api.saveProfile();
 const first=h.api.flushProfileToCloud();
 await cycle();
 assert.equal(h.writes.length,1);
 assert.equal(h.writes[0].xp,110);
 h.api.edit(120);h.api.saveProfile();
 const next=h.api.flushProfileToCloud();
 await cycle();
 assert.equal(h.writes.length,1);
 h.resolvers[0]({ok:true,merged:{firebaseUid:'user-A',totalXp:110,stats:{}}});
 await first;
 assert.equal(h.api.dirty(),true);
 await cycle();
 assert.equal(h.writes.length,2);
 assert.equal(h.writes[1].xp,120);
 h.resolvers[1]({ok:true,merged:{firebaseUid:'user-A',totalXp:120,stats:{}}});
 await next;
 assert.equal(h.api.dirty(),false);
 assert.equal(h.api.xp(),120);
 assert.equal(h.api.buffered(),null);
});
test('network failures and account switches retain pending recovery',async()=>{
 const h=harness();
 h.api.edit(115);h.api.saveProfile();
 const failed=h.api.flushProfileToCloud();
 await cycle();
 h.resolvers[0]({ok:false,reason:'offline'});
 await failed;
 assert.equal(h.api.dirty(),true);
 assert.ok(h.api.buffered());
 const switched=h.api.flushProfileToCloud();
 await cycle();
 h.api.switchUid('user-B');
 h.resolvers[1]({ok:true,merged:{firebaseUid:'user-A',totalXp:115,stats:{}}});
 await switched;
 assert.equal(h.api.dirty(),true);
 assert.ok(h.api.buffered());
});
