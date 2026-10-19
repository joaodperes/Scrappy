const test=require('node:test');
const assert=require('node:assert/strict');
const {createLedger,validatedCatalog,MAX_XP}=require('./economyLedger.js');
const catalog=[
 {id:'camo_olive',type:'cosmetic',cost:75,cosmeticId:'olive'},
 {id:'camo_rust',type:'cosmetic',cost:100,cosmeticId:'rust'},
 {id:'xp_smg_500',type:'weaponXp',cost:90,weapon:'SMG',amount:500},
];
const service=()=>createLedger(catalog,proof=>
 proof.userId==='verified-player' &&
 proof.receiptId===proof.proof?.verifiedReceipt &&
 proof.amount===proof.proof?.amount);
const award=(s,receiptId,amount)=>s.grant('verified-player',receiptId,amount,{verifiedReceipt:receiptId,amount});

test('catalog disallows balance/stat equipment and invalid item metadata',()=>{
 assert.throws(()=>validatedCatalog([{id:'health',type:'stat',cost:1}]),/Only cosmetics/);
 assert.throws(()=>validatedCatalog([{id:'free',type:'cosmetic',cost:0,cosmeticId:'x'}]),/Invalid/);
 assert.throws(()=>validatedCatalog([{id:'d',type:'weaponXp',cost:20,weapon:'SMG',amount:9000}]),/Invalid/);
 assert.throws(()=>validatedCatalog([...catalog,catalog[0]]),/duplicate/);
});
test('proof is necessary; no client self-awards from a claimed number',()=>{
 const s=service();
 assert.equal(s.grant('verified-player','quest_a',50,{claimed:true}).ok,false);
 assert.equal(s.grant('guest','quest_a',50,{verifiedReceipt:'quest_a',amount:50}).ok,false);
 assert.equal(s.snapshot('verified-player').balance,0);
 assert.equal(award(s,'quest_a',50).ok,true);
 assert.equal(s.snapshot('verified-player').balance,50);
});
test('replaying a verified grant is idempotent and cannot inflate balance',()=>{
 const s=service();
 assert.equal(award(s,'daily:2026-10-19:kills',200).balance,200);
 const replay=award(s,'daily:2026-10-19:kills',200);
 assert.equal(replay.duplicate,true);
 assert.equal(s.snapshot('verified-player').balance,200);
});
test('atomic purchase checks insufficient funds and idempotent request IDs',()=>{
 const s=service();
 assert.equal(s.purchase('verified-player','p1','camo_olive').ok,false);
 award(s,'weekly_1',250);
 const first=s.purchase('verified-player','p1','camo_olive');
 assert.equal(first.ok,true);
 assert.equal(first.balance,175);
 assert.equal(s.purchase('verified-player','p1','camo_olive').duplicate,true);
 assert.equal(s.purchase('verified-player','p1','camo_rust').ok,false);
 assert.equal(s.purchase('verified-player','p2','camo_olive').ok,false);
 assert.equal(s.snapshot('verified-player').balance,175);
 assert.deepEqual(s.snapshot('verified-player').cosmetics,['olive']);
});
test('XP packs grant XP directly; no tradable packs or stat boosts',()=>{
 const s=service();
 award(s,'q1',900);
 assert.equal(s.purchase('verified-player','p1','xp_smg_500').ok,true);
 assert.equal(s.purchase('verified-player','p2','xp_smg_500').ok,true);
 assert.equal(s.snapshot('verified-player').weaponXp.SMG,1000);
 assert.equal(s.purchase('verified-player','p1','xp_smg_500').duplicate,true);
 assert.equal(s.snapshot('verified-player').weaponXp.SMG,1000);
 assert.ok(s.snapshot('verified-player').weaponXp.SMG<=MAX_XP);
});
test('isolated wallet state cannot be mutated from a snapshot',()=>{
 const s=service();
 award(s,'w1',300);
 const snap=s.snapshot('verified-player');
 snap.balance=1234567;snap.cosmetics.push('all');
 assert.equal(s.snapshot('verified-player').balance,300);
 assert.deepEqual(s.snapshot('verified-player').cosmetics,[]);
});
test('unverified verifier or unspecified identity never opens spendable wallet',()=>{
 const s=createLedger(catalog);
 assert.equal(s.grant('client','fake',500,{fake:true}).ok,false);
 assert.equal(s.snapshot('client').balance,0);
 assert.throws(()=>s.snapshot(''),/user ID/);
});
