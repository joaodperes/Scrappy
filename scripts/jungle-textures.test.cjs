// Jungle material integrity, independent of Babylon rendering.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(base,p),'utf8');
const layout=JSON.parse(read('assets/maps/jungle.json'));
const moduleSrc=read('js/jungleMaterials.js');
const recipesSource=moduleSrc.replace(/^export\s+/gm,'');
const {JUNGLE_TEXTURE_RECIPES}=new Function(recipesSource+'\nreturn {JUNGLE_TEXTURE_RECIPES};')();
const assignments=layout.objects.filter(o=>o.params?.mat&&o.params.mat!=='jungleBoundary');
const byId=id=>layout.objects.find(o=>o.id===id);

test('every Jungle material key has a recipe and a bundled texture',()=>{
 const keys=new Set(Object.keys(JUNGLE_TEXTURE_RECIPES));
 for(const [key,r] of Object.entries(JUNGLE_TEXTURE_RECIPES)){
   assert.match(key,/^jungle[A-Z]/);
   assert.ok(r.u>0&&r.v>0&&r.u<=30&&r.v<=30,key+' UV repeats must be bounded');
   assert.ok(r.tint.every(n=>n>=0&&n<=1),key+' tint must remain within 0..1');
   assert.ok(fs.existsSync(path.join(base,'assets/textures/lq',r.file)),
     key+' references missing image '+r.file);
 }
 for(const o of assignments)
   assert.ok(keys.has(o.params.mat),'missing Jungle texture recipe for '+o.id+' / '+o.params.mat);
 assert.ok(assignments.length>=120);
});

test('ground, temple, each mine stratum, ceilings, ramps and rails have differentiated textures',()=>{
 assert.equal(byId('jungle-entity-0001').params.mat,'jungleSoil');
 assert.equal(byId('jungle-entity-0010').params.mat,'jungleRuinStone');
 assert.equal(byId('j5-surface-01').params.mat,'jungleMossFloor');
 assert.equal(byId('j5-m1-floor-01').params.mat,'jungleMineFloor');
 assert.equal(byId('j5-m2-floor-01').params.mat,'jungleMineFloor');
 assert.equal(byId('j5-m3-floor-01').params.mat,'jungleDeepFloor');
 assert.equal(byId('j5-m4-floor-01').params.mat,'jungleDeepFloor');
 assert.equal(byId('j5-m1-wall-west').params.mat,'jungleMineWall');
 assert.equal(byId('j5-m4-wall-west').params.mat,'jungleDeepWall');
 assert.equal(byId('j5-m1-ceiling-1').params.mat,'jungleMineCeiling');
 assert.equal(byId('j5-ramp-m1-m2').params.mat,'jungleRamp');
 assert.equal(byId('j5-ramp-m1-m2-rail-left').params.mat,'jungleIron');
 assert.equal(byId('j-border-n').params.mat,'jungleBoundary');
});

test('legacy IDs/colliders and hazard topology remain unchanged by the texture pass',()=>{
 assert.equal(layout.objects.length,161);
 assert.equal(new Set(layout.objects.map(o=>o.id)).size,161);
 assert.equal(layout.objects.filter(o=>o.generator==='createLava').length,6);
 assert.equal(layout.objects.filter(o=>o.generator==='createSpikeTrap').length,6);
 assert.equal(layout.objects.filter(o=>o.generator==='createRampBox'&&!o.id.includes('-rail')).length,5);
 for(const o of layout.objects){
   if(o.generator==='createSlab')
     assert.ok(Number.isFinite(o.params.surfY)&&o.params.sx>0&&o.params.sz>0,o.id);
 }
});
test('Jungle builder registers new keys before instantiating JSON; no shader noise dependencies',()=>{
 const source=read('js/levelJungle.js');
 assert.match(source,/createJungleMaterials\(scene,BABYLON\)/);
 assert.match(source,/Object\.entries\(palette\)\)registerMaterial\(key,mat\)/);
 assert.ok(source.indexOf('Object.entries(palette)')<source.indexOf("loadMapOverride('jungle')"));
 assert.doesNotMatch(source,/NoiseProceduralTexture/);
});
