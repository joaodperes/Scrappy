// node --test scripts/map-schema.test.cjs
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const url='data:text/javascript;base64,'+
  fs.readFileSync(path.join(__dirname,'../js/mapSchema.js')).toString('base64');
async function schema(){return import(url)}
function fixture(){
  return {map:'testmap',version:2,objects:[
    {id:'floor_1',generator:'createSlab',params:{px:0,pz:0,surfY:0,sx:10,sz:10}},
    {id:'platform_1',generator:'createMovingPlatform',params:{
      startX:0,startY:2,startZ:0,endX:10,endY:2,endZ:0,sx:3,sz:3,speed:0.2}},
    {id:'switch_1',generator:'createPowerSwitch',params:{
      px:2,py:1,pz:0,targetPlatformIds:['platform_1']}},
  ],markers:[{id:'spawn_1',type:'playerSpawn',position:{x:0,y:0,z:0}},
    {id:'pickup_1',type:'weaponPickup',weapon:'PISTOL',position:{x:2,y:1,z:0}}]};
}
test('valid map passes with gameplay markers and linked switches',async()=>{
  const {validateMapDocument}=await schema();
  const result=validateMapDocument(fixture(),{expectedMap:'testmap'});
  assert.deepEqual(result.errors,[]);
  assert.equal(result.document.version,2);
});
test('legacy map gets deterministic stable entity IDs',async()=>{
  const {normalizeMapDocument,validateMapDocument}=await schema();
  const input=fixture();delete input.objects[0].id;input.version='1.0';
  const doc=normalizeMapDocument(input);
  assert.equal(doc.objects[0].id,'testmap-entity-0001');
  assert.equal(normalizeMapDocument(input).objects[0].id,doc.objects[0].id);
  assert.equal(validateMapDocument(input,{strictIds:true}).valid,false);
  assert.equal(validateMapDocument(input,{strictIds:false}).valid,true);
});
test('rejects invalid references, duplicate ids and non-finite geometry',async()=>{
  const {validateMapDocument}=await schema();
  const input=fixture();
  input.objects[1].params.speed=NaN;
  input.objects[2].params.targetPlatformIds=['missing'];
  input.markers[0].id='floor_1';
  const result=validateMapDocument(input);
  assert.equal(result.valid,false);
  assert.match(result.errors.join(';'),/speed/);
  assert.match(result.errors.join(';'),/Duplicate/);
  assert.match(result.errors.join(';'),/moving platform/);
});
test('rejects invalid modes, unknown generators and mismatched map identifiers',async()=>{
  const {validateMapDocument}=await schema();
  const doc=fixture();doc.markers[1].modes=['unknown'];
  doc.objects[0].generator='makeAlien';
  assert.equal(validateMapDocument(doc).valid,false);
  assert.equal(validateMapDocument(fixture(),{expectedMap:'anothermap'}).valid,false);
});
