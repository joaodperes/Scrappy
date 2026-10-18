// node scripts/validate-map-data.cjs
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const allowed=new Set([
  'createWall','createSlab','createPillar','createColumn','createGlass',
  'createRamp','createRampBox','createCeiling','createBarrel','createCrate',
  'createLava','createSpikeTrap','createDestructibleWall','createJumpPad',
  'createMovingPlatform','createPowerSwitch',
]);
for(const name of ['scrapyard','jungle','city','terminal']){
  const layout=JSON.parse(fs.readFileSync(path.join(root,'assets/maps',name+'.json'),'utf8'));
  assert.ok(Array.isArray(layout.objects),name+' objects must be an array');
  const ids=new Set(),lookup=new Map();
  for(const [index,entry] of layout.objects.entries()){
    assert.ok(allowed.has(entry.generator),name+' invalid generator at '+index);
    assert.ok(entry.params && typeof entry.params==='object',name+' missing params '+index);
    if(entry.id){
      assert.ok(!ids.has(entry.id),name+' duplicate ID '+entry.id);
      ids.add(entry.id);lookup.set(entry.id,entry);
    }
    for(const field of ['position','rotation','scaling']){
      if(!entry[field])continue;
      for(const axis of ['x','y','z']){
        assert.ok(Number.isFinite(entry[field][axis]),name+' invalid '+field+'.'+axis+' at '+index);
      }
    }
  }
  for(const entry of layout.objects){
    if(entry.generator!=='createPowerSwitch')continue;
    for(const id of entry.params.targetPlatformIds||[]){
      assert.equal(lookup.get(id)?.generator,'createMovingPlatform',name+' bad switch link '+id);
    }
  }
  console.log(name+': '+layout.objects.length+' validated objects');
}
