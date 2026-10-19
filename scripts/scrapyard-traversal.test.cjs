// Prevent accidentally deleting or duplicating Scrapyard's A+ traversal
// while migrating its procedural geometry to JSON.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const layout=JSON.parse(fs.readFileSync(path.join(root,'assets/maps/scrapyard.json'),'utf8'));
test('Scrapyard has exactly six serialized staircase flights and twelve jump pads',()=>{
  const stair=layout.objects.filter(o=>o.generator==='createStaircase');
  const pads=layout.objects.filter(o=>o.generator==='createJumpPad');
  assert.equal(stair.length,6);
  assert.equal(pads.length,12);
  assert.deepEqual(stair.map(o=>o.params.steps),[12,12,12,12,13,13]);
  assert.ok(stair.every(o=>o.params.flareEnds===true));
  assert.deepEqual(pads.map(o=>o.params.floorY),[6,6,6,6,12,12,12,12,12,12,18,24]);
});
test('every composite staircase starts at its original first-step coordinates',()=>{
  const stair=layout.objects.filter(o=>o.generator==='createStaircase');
  for(const {params:p,position} of stair){
    assert.equal(position.x,p.px);
    assert.equal(position.y,p.py+p.stepHeight/2);
    assert.equal(position.z,p.pz);
    assert.equal(Math.abs(p.dirX)+Math.abs(p.dirZ),1);
  }
});
