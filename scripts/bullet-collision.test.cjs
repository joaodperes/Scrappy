// node --test scripts/bullet-collision.test.cjs
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../js/bulletCollision.js'),'utf8');
const uri='data:text/javascript;base64,'+Buffer.from(src).toString('base64');
test('City grey walls block shots, even if not editor-editable',async()=>{
  const {blocksBullet}=await import(uri);
  const mesh={checkCollisions:true,isPickable:true,isEnabled:()=>true,
    metadata:{type:'wall',editable:false}};
  assert.equal(blocksBullet(mesh),true);
  assert.equal(blocksBullet({...mesh,metadata:{type:'skybridge'}}),true);
  assert.equal(blocksBullet({...mesh,isEnabled:()=>false}),false);
});
test('glass is transparent to bullets even when it physically collides',async()=>{
  const {blocksBullet}=await import(uri);
  const solid={checkCollisions:true,isEnabled:()=>true};
  assert.equal(blocksBullet({...solid,metadata:{type:'glass'}}),false);
  assert.equal(blocksBullet({...solid,metadata:{generator:'createGlass'}}),false);
  assert.equal(blocksBullet({...solid,metadata:{type:'wall'}}),true);
});
test('closest obstruction wins regardless of entity or raycast return order',async()=>{
  const {closestBulletHit}=await import(uri);
  const hit=d=>({hit:true,distance:d});
  const candidates=[
    {kind:'enemy',hit:hit(22)}, {kind:'barrel',hit:hit(16)},
    {kind:'wall',hit:hit(8)},
  ];
  assert.equal(closestBulletHit(candidates).kind,'wall');
  assert.equal(closestBulletHit([{kind:'enemy',hit:hit(4)},...candidates]).kind,'enemy');
  assert.equal(closestBulletHit([{kind:'wall',hit:hit(8)}, {kind:'destructible',hit:hit(8)}]).kind,'destructible');
  assert.equal(closestBulletHit([{kind:'enemy',hit:null}]),null);
});
test('projectile and PvP hit paths apply shared solid-geometry blocker',()=>{
  const game=fs.readFileSync(path.join(__dirname,'../js/projectiles.js'),'utf8');
  const pvp=fs.readFileSync(path.join(__dirname,'../js/pvp.js'),'utf8');
  const geometry=fs.readFileSync(path.join(__dirname,'../js/levelHelpers.js'),'utf8');
  assert.match(game,/const wallHit = scene\.pickWithRay\(ray, blocksBullet\)/);
  assert.match(game,/closestBulletHit\(/);
  assert.match(pvp,/_remoteMeshMap\.has\(m\) \|\| blocksBullet\(m\)/);
  assert.match(geometry,/m\.isPickable = !!editable \|\|/);
});

test('swept projectiles detect enemies/barrels crossed between frames',async()=>{
  const {segmentSphereHit}=await import(uri);
  const v=(x,y,z)=>({x,y,z});
  assert.equal(segmentSphereHit(v(-10,0,0),v(10,0,0),v(0,0,0),1),0.45);
  assert.equal(segmentSphereHit(v(0,0,0),v(10,0,0),v(0,0,0),1),0);
  assert.equal(segmentSphereHit(v(-10,2,0),v(10,2,0),v(0,0,0),1),null);
  assert.equal(segmentSphereHit(v(0,0,0),v(0,0,0),v(5,0,0),1),null);
  assert.equal(segmentSphereHit(v(-10,0,0),v(10,0,0),v(0,0,0),0),null);
  assert.ok(segmentSphereHit(v(-30,0,0),v(30,0,0),v(0,0,0),0.75)!==null);
});
test('shared projectile loop uses segment sweep and first-wall occlusion',()=>{
  const game=fs.readFileSync(path.join(__dirname,'../js/projectiles.js'),'utf8');
  assert.match(game,/segmentSphereHit\(from,to,b\.pos,0\.75\)/);
  assert.match(game,/segmentSphereHit\(from,to,center,/);
  assert.match(game,/new BABYLON\.Ray\(from,direction,distance\),blocksBullet/);
  assert.match(game,/plasmaSniper \? 0\.28/);
});
