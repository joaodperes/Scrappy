// node --test scripts/editor-transforms.test.cjs
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.join(__dirname,'../js');
async function load(name){
  const src=fs.readFileSync(path.join(base,name),'utf8');
  return import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
}
test('world grid snapping aligns both positive and negative coordinates',async()=>{
  const {snapVector}=await load('editorTransforms.js');
  assert.deepEqual(snapVector({x:1.24,y:-2.76,z:0.49},.5),{x:1,y:-3,z:.5});
});
test('angle snapping rounds to configurable degrees without affecting size',async()=>{
  const {normalizeEditorTransform,DEG_TO_RAD}=await load('editorTransforms.js');
  const result=normalizeEditorTransform(
    {x:3.6,y:2,z:-2.4},
    {x:16*DEG_TO_RAD,y:-29*DEG_TO_RAD,z:0},
    {x:1.25,y:0.75,z:1},
    {gridEnabled:true,gridSize:1,angleEnabled:true,angleDegrees:15});
  assert.deepEqual(result.position,{x:4,y:2,z:-2});
  assert.ok(Math.abs(result.rotation.x-15*DEG_TO_RAD)<1e-10);
  assert.ok(Math.abs(result.rotation.y+30*DEG_TO_RAD)<1e-10);
  assert.deepEqual(result.scaling,{x:1.25,y:.75,z:1});
});
test('numeric transform fields reject empty, invalid, and zero scale',async()=>{
  const {validateTransformGroup}=await load('editorTransforms.js');
  assert.deepEqual(validateTransformGroup('position',{x:' 1.25 ',y:'-2',z:'0'}),
    {x:1.25,y:-2,z:0});
  assert.throws(()=>validateTransformGroup('scaling',{x:1,y:0,z:1}),/Scale cannot be zero/);
  assert.throws(()=>validateTransformGroup('position',{x:'',y:2,z:3}),/requires a value/);
  assert.throws(()=>validateTransformGroup('rotation',{x:'NaN',y:2,z:3}),/finite/);
});
test('map serialization preserves rotation quaternion and default scale',async()=>{
  const {serializeEditableMesh}=await load('mapSchema.js');
  const mesh={
    metadata:{editable:true,editorId:'item',generator:'createWall',
      params:{px:1,py:2,pz:3,sx:4,sy:5,sz:6}},
    position:{x:1,y:2,z:3},rotation:{x:0,y:0,z:0},
    rotationQuaternion:{toEulerAngles:()=>({x:.2,y:-.4,z:.6})},
    scaling:{x:1,y:1,z:1},
  };
  const item=serializeEditableMesh(mesh);
  assert.deepEqual(item.rotation,{x:.2,y:-.4,z:.6});
  assert.deepEqual(item.scaling,{x:1,y:1,z:1});
  assert.deepEqual(item.params,{px:1,py:2,pz:3,sx:4,sy:5,sz:6});
});
