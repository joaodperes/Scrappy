const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const dir=path.join(__dirname,'..');
const layout=JSON.parse(fs.readFileSync(path.join(dir,'assets/maps/terminal.json'),'utf8'));
const objects=layout.objects;
const find=id=>objects.find(o=>o.id===id);
const floor=(x,z,y)=>objects.some(o=>o.generator==='createSlab' && o.params.surfY===y &&
  Math.abs(x-o.params.px)<o.params.sx/2 && Math.abs(z-o.params.pz)<o.params.sz/2);
test('Moon Base remains a valid shared v2 editable map',async()=>{
  const src=fs.readFileSync(path.join(dir,'js/mapSchema.js'),'utf8');
  const {validateMapDocument}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
  const val=validateMapDocument(layout,{expectedMap:'terminal',strictIds:true});
  assert.equal(val.valid,true,val.errors.join('\n'));
});
test('four protected resource floaters have ramps connecting the y=8 balcony to y=14',()=>{
  for(const side of ['south','north'])for(const face of ['west','east']){
    const name='moon-floater-'+face+'-'+side;
    const x=face==='west'?-20:20,z=side==='south'?-24:24;
    assert.equal(find(name).params.surfY,14);
    assert.equal(floor(x,z,14),true);
    assert.equal(find(name+'-ramp').generator,'createRampBox');
    assert.ok(find(name+'-ramp').params.rotX!==0);
    assert.equal(find(name+'-cover-inner').generator,'createWall');
    for(const rail of ['guard-left','guard-right'])
      assert.equal(find(name+'-ramp-'+rail).generator,'createRampBox');
    const lowZ=side==='north'?43.5:-43.5;
    assert.equal(floor(x,lowZ,8),true,'balcony landing at '+x+','+lowZ);
  }
});
test('balcony has waist-height cover and one ramp entry per cardinal side',()=>{
  for(const side of ['west','east','south','north']){
    assert.ok(objects.some(o=>o.id.startsWith('moon-balcony-'+side+'-')),'cover '+side);
  }
  assert.equal(objects.filter(o=>o.generator==='createRampBox' && o.id.startsWith('terminal-entity-')).length,4);
});
test('floating pads provide both health and armor marker pickups',()=>{
  const types=layout.markers.map(m=>m.type);
  assert.equal(types.filter(x=>x==='healthPickup').length,2);
  assert.equal(types.filter(x=>x==='armorPickup').length,2);
  for(const m of layout.markers){
    assert.ok(m.position.y>14);
    assert.equal(floor(m.position.x,m.position.z,14),true,m.id);
  }
});
test('bots apply per-map gravity and Moon players retain their jetpack',()=>{
  const bots=fs.readFileSync(path.join(dir,'js/enemies.js'),'utf8');
  const player=fs.readFileSync(path.join(dir,'js/player.js'),'utf8');
  const map=fs.readFileSync(path.join(dir,'js/mapManager.js'),'utf8');
  assert.match(bots,/const botGravityMult=getMapMeta\(getCurrentMap\(\)\)\.gravityMult \?\? 1/);
  assert.match(bots,/e\._yVel -= 35\.0 \* botGravityMult \* dt/);
  assert.match(map,/gravityMult:\s*0\.55/);
  assert.match(player,/getCurrentMap\(\) === 'terminal'/);
  assert.match(player,/jetpackHeat/);
  assert.doesNotMatch(player,/camera\.position\.y < -27/);
});

test('all Moon weapon pickup coordinates have solid floor support',()=>{
  const cfg=fs.readFileSync(path.join(dir,'js/mapManager.js'),'utf8');
  const part=cfg.slice(cfg.indexOf('  terminal: {'),cfg.indexOf('  },\n};',cfg.indexOf('  terminal: {')));
  const weaponLines=[...part.matchAll(/\{ wName:\s*'([A-Z_]+)',\s*x:\s*(-?\d+),\s*y:\s*([\d.]+),\s*z:\s*(-?\d+) \}/g)];
  assert.ok(weaponLines.length>=13,'Moon weapons should include legacy and new floater pickups');
  for(const [,name,x,y,z] of weaponLines){
    const surface=Math.round(Number(y));
    assert.equal(floor(Number(x),Number(z),surface),true,
      name+' pickup at '+[x,y,z]+' lacks solid floating platform');
  }
});
