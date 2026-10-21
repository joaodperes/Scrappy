// Topology checks for Moon Base. Browser physics/navmesh remain owner QA.
const {test}=require('node:test'),assert=require('node:assert/strict');
const map=require('../assets/maps/terminal.json');
const objects=map.objects,slabs=objects.filter(o=>o.generator==='createSlab');
const ramps=objects.filter(o=>o.generator==='createRampBox'&&!o.id.includes('guard'));
const near=(x,y,tol=.45)=>Math.abs(x-y)<=tol;
const on=(fl,x,z)=>Math.abs(x-fl.params.px)<=fl.params.sx/2+.1&&
 Math.abs(z-fl.params.pz)<=fl.params.sz/2+.1;
function ends(r){
 const {px,py,pz,sx,sy,sz,rotX=0,rotZ=0}=r.params;
 if(rotX)return [-1,1].map(sign=>({x:px,z:pz+sign*sz/2*Math.cos(rotX),
  y:py-sign*sz/2*Math.sin(rotX)+sy/2*Math.cos(rotX)}));
 return [-1,1].map(sign=>({x:px+sign*sx/2*Math.cos(rotZ),z:pz,
  y:py+sign*sx/2*Math.sin(rotZ)+sy/2*Math.cos(rotZ)}));
}
const count=(r,lo,hi)=>{
 const e=ends(r),top=e.find(p=>p.y===Math.max(...e.map(q=>q.y))),
  bottom=e.find(p=>p!==top);
 assert.ok(near(top.y,hi),r.id+' upper endpoint '+top.y);
 assert.ok(near(bottom.y,lo),r.id+' lower endpoint '+bottom.y);
 const highInner={
  x:top.x+(bottom.x-top.x)*.13,z:top.z+(bottom.z-top.z)*.13},
  lowOuter={x:bottom.x+(bottom.x-top.x)*.13,z:bottom.z+(bottom.z-top.z)*.13};
 assert.ok(slabs.some(s=>near(s.params.surfY,hi,.25)&&on(s,highInner.x,highInner.z)),
   r.id+' lacks raised deck');
 assert.ok(slabs.some(s=>near(s.params.surfY,lo,.25)&&on(s,lowOuter.x,lowOuter.z)),
   r.id+' lacks lower deck');
};
test('Moon Base ring connects four cardinal ramps from ground to y8 balcony',()=>{
 const main=ramps.filter(r=>r.id.startsWith('terminal-entity-'));
 assert.equal(main.length,4);
 for(const r of main)count(r,0,8);
});
test('all four Moon Base floaters have guarded reversible foot ramps',()=>{
 const floaters=ramps.filter(r=>r.id.startsWith('moon-floater-'));
 assert.equal(floaters.length,4);
 for(const r of floaters){
  count(r,8,14);
  for(const side of ['left','right'])
   assert.ok(objects.some(o=>o.id===r.id+'-guard-'+side),r.id+' guard '+side);
 }
});
test('floating health and armor pickups occupy solid upper pads',()=>{
 const markers=map.markers||[];
 assert.equal(markers.filter(m=>/healthPickup|armorPickup/.test(m.type)).length,4);
 for(const marker of markers){
  assert.ok(['healthPickup','armorPickup'].includes(marker.type),marker.id+' type');
  assert.ok(marker.modes.includes('survival'));
  const floater=slabs.find(s=>s.id.startsWith('moon-floater-')&&
    !s.id.includes('ramp')&&on(s,marker.position.x,marker.position.z));
  assert.ok(floater,marker.id+' lacks a supporting floater platform');
  assert.ok(marker.position.y>floater.params.surfY&&
   marker.position.y-floater.params.surfY<2,'pickup must be near platform surface');
 }
});
test('exposed upper jetpack decks are solid and inside the map bounds',()=>{
 const high=slabs.filter(o=>o.id.startsWith('moon-high-'));
 assert.equal(high.length,5);
 for(const h of high){
  assert.ok(h.params.surfY>=28&&h.params.sx>=10&&h.params.sz>=10);
  assert.ok(Math.abs(h.params.px)<55&&Math.abs(h.params.pz)<45);
 }
});
