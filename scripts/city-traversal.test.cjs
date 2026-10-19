// City A- transportation regression guard: JSON must contain each original
// zipline, rooftop lift, and bridge once and without orphaned IDs.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const city=JSON.parse(fs.readFileSync(path.join(root,'assets/maps/city.json'),'utf8'));
const objects=city.objects;
const get=type=>objects.filter(o=>o.generator===type);
test('City transportation objects are stored once in v2 JSON',()=>{
  assert.equal(get('createZipline').length,13);
  assert.equal(get('createRooftopLift').length,17);
  assert.equal(get('createSkybridge').length,8);
  const ids=objects.map(o=>o.id);
  assert.equal(new Set(ids).size,ids.length);
});
test('City ziplines preserve their original speed and endpoints',()=>{
  const zips=get('createZipline');
  for(const z of zips){
    assert.equal(z.params.worldSpeed,11.5);
    assert.ok(Number.isFinite(z.params.startY));
    assert.ok(Number.isFinite(z.params.endY));
    assert.equal(z.position.x,z.params.startX);
    assert.equal(z.position.y,z.params.startY-.15);
    assert.equal(z.position.z,z.params.startZ);
    assert.ok(Math.hypot(z.params.endX-z.params.startX,
      z.params.endY-z.params.startY,z.params.endZ-z.params.startZ)>0.01);
  }
});
test('City lifts remain anchored to their wall-facing shaft positions',()=>{
  const lifts=get('createRooftopLift');
  const names=new Set(lifts.map(o=>o.id.split('-').at(-1)));
  assert.deepEqual([...names].sort(),
    'ABCDEFGHIJKLMNOPQ'.split(''));
  for(const lift of lifts){
    const p=lift.params;
    assert.ok(['N','S','E','W'].includes(p.face));
    assert.ok(p.topSurfY>0);
    assert.equal(lift.position.y,-.15);
  }
});
test('City skybridge spans retain eight rooftop route connections',()=>{
  const bridges=get('createSkybridge');
  assert.deepEqual(bridges.map(x=>x.id).sort(),
    ['city-bridge-EF','city-bridge-EG','city-bridge-EH','city-bridge-EI',
     'city-bridge-FN','city-bridge-GO','city-bridge-HP','city-bridge-IQ'].sort());
  assert.ok(bridges.every(b=>b.params.bridgeW===4));
});
test('City wrecks are atomic editor entities with exactly one roof pad each',()=>{
  const cars=get('createCarWreck');
  assert.equal(cars.length,44);
  assert.equal(new Set(cars.map(c=>c.id)).size,44);
  for(const car of cars){
    assert.equal(car.position.x,car.params.cx);
    assert.equal(car.position.y,.5);
    assert.equal(car.position.z,car.params.cz);
    assert.equal(car.rotation.y,car.params.rotY);
  }
});
test('City rooftop and relay pads are JSON entries with effective launch force',()=>{
  const pads=get('createJumpPad');
  assert.equal(pads.length,33);
  assert.equal(pads.filter(x=>x.params.force===27).length,16);
  for(const pad of pads){
    assert.equal(pad.position.x,pad.params.px);
    assert.equal(pad.position.z,pad.params.pz);
    assert.ok(pad.params.force>=27 && pad.params.force<=36);
    assert.ok(Math.abs(pad.position.y-pad.params.floorY-.22)<1e-10);
  }
});
test('City script no longer duplicates serialized transport systems',()=>{
  const source=fs.readFileSync(path.join(root,'js/levelCity.js'),'utf8');
  assert.doesNotMatch(source,/\b_(?:zipline|lift|bridge|car|jp)\s*\(/);
});
