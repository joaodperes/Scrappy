const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../js/shopRules.js'),'utf8');
const rules=import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('cosmetics deduct earned Scraps once, duplicate receipt is idempotent',async()=>{
 const {purchaseShopItem,shopAvailableScraps}=await rules;
 const first=purchaseShopItem(500,null,'player_scavenger','buy_001abc');
 assert.equal(first.ok,true);
 assert.equal(first.wallet.owned.includes('player_scavenger'),true);
 assert.equal(first.balance,325);
 const repeat=purchaseShopItem(500,first.wallet,'player_scavenger','buy_001abc');
 assert.equal(repeat.duplicate,true);
 assert.equal(shopAvailableScraps(500,repeat.wallet),325);
 assert.equal(purchaseShopItem(500,repeat.wallet,'player_scavenger','buy_002abc').ok,false);
});
test('concurrent transactions must re-evaluate spent balance on current ledger',async()=>{
 const {purchaseShopItem}=await rules;
 const first=purchaseShopItem(175,null,'player_scavenger','buy_003abc');
 assert.equal(first.ok,true);
 const second=purchaseShopItem(175,first.wallet,'player_reclaimer','buy_004abc');
 assert.equal(second.ok,false);
 assert.equal(second.reason,'Not enough Scraps');
 assert.equal(first.wallet.spent,175);
});
test('XP packs apply only as non-transferable weapon bonuses and stop at max',async()=>{
 const {purchaseShopItem}=await rules;
 let x=purchaseShopItem(1000,null,'xp_TESLA_250','buy_005abc',17500);
 assert.equal(x.ok,true);
 assert.equal(x.wallet.xpBonuses.TESLA,250);
 x=purchaseShopItem(1000,x.wallet,'xp_TESLA_250','buy_006abc',17750);
 assert.equal(x.ok,false);
 assert.equal(x.reason,'Weapon XP already maxed');
});
test('transaction IDs cannot be reused to purchase different items',async()=>{
 const {purchaseShopItem}=await rules;
 const a=purchaseShopItem(1000,null,'player_scavenger','buy_007abc');
 const b=purchaseShopItem(1000,a.wallet,'player_reclaimer','buy_007abc');
 assert.equal(b.ok,false);
 assert.equal(b.reason,'Transaction ID collision');
 assert.equal(b.wallet.spent,175);
});
test('shop excludes gameplay stat boosts and normalizes corrupted receipts safely',async()=>{
 const {SHOP_ITEMS,purchaseShopItem,normalizeShopWallet}=await rules;
 assert.equal(SHOP_ITEMS.some(i=>i.kind==='statBoost'||i.kind==='powerup'),false);
 const dirty={spent:-400,receipts:{'bad':'missing_item','buy_001abc':'player_scavenger'},
  owned:['player_scavenger','player_scavenger','missing'],xpBonuses:{TESLA:9999999}};
 const w=normalizeShopWallet(dirty);
 assert.equal(w.spent,0);
 assert.deepEqual(w.owned,['player_scavenger']);
 assert.equal(w.xpBonuses.TESLA,18000);
 assert.equal(Object.keys(w.receipts).length,1);
 assert.equal(purchaseShopItem(999,w,'unknown_item','buy_008abc').ok,false);
});
test('same profile Firestore document isolates wallet from normal profile saves',()=>{
 const p=fs.readFileSync(path.join(__dirname,'../js/progression.js'),'utf8');
 assert.match(p,/shopWallet:purchase.wallet/);
 assert.match(p,/transaction\.set\(documentRef,\{shopWallet:purchase.wallet\},\{merge:true\}\)/);
 assert.match(p,/\.set\(\s*\{ profile, updated_at:/);
});

test('shop caps receipt history without losing old purchase idempotency',async()=>{
 const {purchaseShopItem,MAX_SHOP_RECEIPTS}=await rules;
 const receipts={};
 for(let i=0;i<MAX_SHOP_RECEIPTS;i++)
  receipts['purchase_'+String(i).padStart(7,'0')]='xp_TESLA_250';
 const ledger={spent:400,owned:[],receipts,xpBonuses:{TESLA:250}};
 const duplicate=purchaseShopItem(1000,ledger,'xp_TESLA_250','purchase_0000000',0);
 assert.equal(duplicate.ok,true);
 assert.equal(duplicate.duplicate,true);
 assert.equal(duplicate.wallet.spent,400);
 const rejected=purchaseShopItem(1000,ledger,'player_scavenger','purchase_new_001',0);
 assert.equal(rejected.ok,false);
 assert.equal(rejected.reason,'Purchase history full; contact the game owner');
 assert.equal(rejected.wallet.spent,400);
 assert.equal(Object.keys(rejected.wallet.receipts).length,MAX_SHOP_RECEIPTS);
});
