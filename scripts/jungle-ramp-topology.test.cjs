// Source-level guarantees for Jungle's five deliberately excavated ramps.
// This does not replace real Babylon collision/navmesh and editor testing.
const test=require('node:test'),assert=require('node:assert/strict');
const layout=require('../assets/maps/jungle.json');
const objects=layout.objects||[];
const slabs=objects.filter(o=>o.generator==='createSlab');
const walls=objects.filter(o=>o.generator==='createWall');
const ramps=objects.filter(o=>o.generator==='createRampBox'&&!o.id.includes('rail'));
const near=(a,b,tol=.08)=>Math.abs(a-b)<=tol;
function inSlab(o,x,z,tol=0){
 const p=o.params;
 return Math.abs(x-p.px)<=p.sx/2+tol&&Math.abs(z-p.pz)<=p.sz/2+tol;
}
function rampEnds(o){
 const p=o.params,half=p.sz/2,theta=p.rotX||0;
 return [-1,1].map(sign=>({
  x:p.px,z:p.pz+sign*half*Math.cos(theta),
  y:p.py-sign*half*Math.sin(theta)+p.sy/2*Math.cos(theta),
  dir:sign*Math.sign(Math.cos(theta))
 }));
}
test('Jungle has five walkable real-ramp connectors and paired guard rails',()=>{
 const ids=['j5-entry-west','j5-entry-east','j5-ramp-m1-m2','j5-ramp-m2-m3','j5-ramp-m3-m4'];
 assert.deepEqual(ramps.map(o=>o.id),ids);
 for(const ramp of ramps){
  assert.equal(ramp.params.mat,'jungleRamp');
  assert.ok(ramp.params.sx>=6,'wide enough for bots and players');
  for(const side of ['left','right'])
   assert.ok(objects.some(o=>o.id===ramp.id+'-rail-'+side));
 }
});
test('both ramp ends meet their floor elevations and connect to a solid dock',()=>{
 for(const r of ramps){
  const ends=rampEnds(r);
  const lower=ends.reduce((a,b)=>a.y<b.y?a:b);
  const upper=ends.reduce((a,b)=>a.y>b.y?a:b);
  const expected=r.id.startsWith('j5-entry')?[-7.5,0]:
   r.id==='j5-ramp-m1-m2'?[-15,-7.5]:
   r.id==='j5-ramp-m2-m3'?[-30,-15]:[-45,-30];
  assert.ok(near(lower.y,expected[0]),r.id+' lower height '+lower.y);
  assert.ok(near(upper.y,expected[1]),r.id+' upper height '+upper.y);
  for(const end of ends){
   const dir=end.z>r.params.pz?1:-1;
   const deckZ=end.z+dir*1.5;
   assert.ok(slabs.some(fl=>near(fl.params.surfY,end.y,.08)&&
     inSlab(fl,end.x,deckZ,.18)),r.id+' missing floor dock at '+deckZ);
  }
 }
});
test('excavated ramps never intersect intact horizontal floors or solid walls',()=>{
 for(const ramp of ramps){
  const p=ramp.params,half=p.sz/2;
  for(let i=1;i<10;i++){
   const t=-1+2*i/10,z=p.pz+t*half*Math.cos(p.rotX);
   const y=p.py-t*half*Math.sin(p.rotX)+p.sy/2*Math.cos(p.rotX);
   for(const slab of slabs){
    if(!inSlab(slab,p.px,z,-.1))continue;
    const other=slab.params.surfY;
    // A horizontal slab *at* this elevation would be a collider inside
    // the ramp corridor; one far overhead is an intentional mine roof.
    // Lower-floor support is expected at the ramp lip; only intact
    // slabs crossing the player's standing/head clearance block travel.
    assert.ok(!(other>y+.15&&other<y+2.25),
      ramp.id+' blocked by overhanging slab '+slab.id);
   }
   for(const wall of walls){
    const w=wall.params;
    if(Math.abs(p.px-w.px)>w.sx/2+p.sx/2-.25||
       Math.abs(z-w.pz)>w.sz/2+.2)continue;
    assert.ok(y>w.py+w.sy/2+2||y<w.py-w.sy/2-2,
      ramp.id+' intersects solid wall '+wall.id);
   }
  }
 }
});
test('lava is a solid, damaging hazard and the mine has enclosed floors',()=>{
 const lava=objects.filter(o=>o.generator==='createLava');
 assert.ok(lava.length>=6);
 assert.ok(lava.every(o=>o.params.sx>0&&o.params.sz>0));
 const helpers=require('node:fs').readFileSync(
  require('node:path').join(__dirname,'../js/levelHelpers.js'),'utf8');
 const level=require('node:fs').readFileSync(
  require('node:path').join(__dirname,'../js/levelJungle.js'),'utf8');
 assert.match(helpers,/export function createLava[^]*?m\.checkCollisions = true/);
 assert.match(helpers,/hazardType: 'LAVA'/);
 assert.match(level,/applyEditableLayout\(override, \{ hazardZones, destructibleWalls/);
 for(const y of [-7.5,-15,-30,-45])
  assert.ok(slabs.some(o=>o.params.surfY===y),'missing level floor '+y);
 const boundaries=walls.filter(o=>/^j-border-/.test(o.id));
 assert.equal(boundaries.length,4);
});
