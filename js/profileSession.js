// One active cooperating Scrappy game client per Firebase UID.
// Uses the existing player_profiles/{uid} document (no new Firestore rules,
// Cloud Functions, hosting tier or third-party presence service).
let owner=null;
let unsubscribe=null;
let heartbeat=null;
let surrendering=false;
let onDisplaced=null;
let onHandoff=null;
const uidNow=()=>globalThis.firebase?.auth?.()?.currentUser?.uid||null;
const newToken=()=>{
 const bytes=new Uint8Array(16);
 crypto.getRandomValues(bytes);
 return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
};
const docFor=uid=>firebase.firestore().collection('player_profiles').doc(uid);
export const activeGameSession=()=>owner?{uid:owner.uid,id:owner.id}:null;
export const ownsGameSession=()=>!!owner&&uidNow()===owner.uid;

function stopLocalOwner(){
 const prior=owner;
 owner=null;
 if(heartbeat){clearInterval(heartbeat);heartbeat=null}
 if(unsubscribe){unsubscribe();unsubscribe=null}
 surrendering=false;
 return prior;
}
function notifyLost(message){
 const hadOwner=stopLocalOwner();
 if(hadOwner)onDisplaced?.(message||'Your game was opened in another browser.');
}
export function clearSessionOnSignOut(){
 const previous=stopLocalOwner();
 if(previous)onDisplaced?.('Google authentication ended. Return to login to play.');
}
export async function releaseGameSession(){
 const previous=stopLocalOwner();
 if(!previous)return;
 if(uidNow()!==previous.uid)return;
 try{
  await firebase.firestore().runTransaction(async tx=>{
   const snap=await tx.get(previous.ref);
   if(snap.data()?.activeSession?.id!==previous.id)return;
   tx.set(previous.ref,{activeSession:null},{merge:true});
  });
 }catch(err){console.warn('[session] Release delayed',err)}
}
async function surrenderToNewBrowser(){
 if(surrendering||!owner)return;
 const yielding=owner;
 surrendering=true;
 try{
  // Keep the old lease while draining unsaved progress. The incoming
  // browser waits briefly, then can take over even if this one is offline.
  await onHandoff?.();
 }catch(err){console.warn('[session] Pending progress buffered for later',err)}
 if(owner!==yielding)return; // already ended or forcibly replaced
 await releaseGameSession();
 onDisplaced?.('This account started a game in another browser.');
}
function listenToOwnership(lease){
 unsubscribe=lease.ref.onSnapshot(snapshot=>{
  if(owner!==lease||snapshot.metadata?.fromCache)return;
  const doc=snapshot.data();
  if(doc?.activeSession?.id!==lease.id){
   notifyLost('Your game session was replaced by another browser.');
   return;
  }
  if(doc?.takeoverRequest?.id&&doc.takeoverRequest.id!==lease.id)
   void surrenderToNewBrowser();
 },err=>console.warn('[session] Live ownership watch unavailable',err));
 heartbeat=setInterval(async()=>{
  if(owner!==lease||uidNow()!==lease.uid)return;
  try{
   await firebase.firestore().runTransaction(async tx=>{
    const snap=await tx.get(lease.ref);
    if(snap.data()?.activeSession?.id!==lease.id)return;
    tx.set(lease.ref,{activeSession:{
      ...snap.data().activeSession,
      heartbeatAt:firebase.firestore.FieldValue.serverTimestamp(),
    }},{merge:true});
   });
  }catch(err){console.warn('[session] Heartbeat postponed',err)}
 },60000);
}
export async function acquireGameSession({onLost,onBeforeHandoff}={}){
 const uid=uidNow();
 if(!uid)throw new Error('Sign in with Google to play.');
 if(owner?.uid===uid)return {profile:null,alreadyOwner:true};
 if(owner)await releaseGameSession();
 const ref=docFor(uid),id=newToken();
 const starting=await ref.get();
 if(!starting.exists||!starting.data()?.profile)
  throw new Error('Cloud profile is not ready. Reconnect before starting.');
 if(starting.data()?.activeSession?.id){
  // A cooperative handoff lets the old session flush before taking over.
  // A crashed/offline session cannot block login indefinitely.
  await ref.set({takeoverRequest:{id,at:firebase.firestore.FieldValue.serverTimestamp()}},{merge:true});
  await new Promise(resolve=>{
   // Release as soon as the old browser finishes syncing, while preserving
   // a bounded fallback for crashed/offline clients.
   let done=false,stop=null;
   const finish=()=>{
    if(done)return;
    done=true;clearTimeout(deadline);stop?.();resolve();
   };
   const deadline=setTimeout(finish,3500);
   stop=ref.onSnapshot(snapshot=>{
    if(!snapshot.metadata?.fromCache&&!snapshot.data()?.activeSession?.id)finish();
   },finish);
   if(done)stop?.();
  });
 }
 let next=null;
 await firebase.firestore().runTransaction(async tx=>{
  const snapshot=await tx.get(ref);
  const data=snapshot.data();
  if(!data?.profile)throw new Error('Cloud profile was not found.');
  if(data.takeoverRequest?.id&&data.takeoverRequest.id!==id)
   throw new Error('Another browser is requesting this account. Retry.');
  next={profile:data.profile,receipts:data.profileSyncReceipts||{}};
  tx.set(ref,{activeSession:{
    id,startedAt:firebase.firestore.FieldValue.serverTimestamp(),
    heartbeatAt:firebase.firestore.FieldValue.serverTimestamp(),
  },takeoverRequest:null},{merge:true});
 });
 if(uidNow()!==uid)throw new Error('Google account changed while starting.');
 const lease={uid,id,ref};
 owner=lease;onDisplaced=onLost||null;onHandoff=onBeforeHandoff||null;
 listenToOwnership(lease);
 return next;
}
