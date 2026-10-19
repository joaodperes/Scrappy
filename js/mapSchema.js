// Shared, Babylon-independent map document format.
// Browser ES module; deliberately has no imports so Node validation can load it.
export const MAP_SCHEMA_VERSION = 2;
const number = (required=true, min=-10000, max=10000) => ({type:'number',required,min,max});
const positive = (required=true) => number(required,0.001,10000);
const bool = () => ({type:'boolean',required:false});
const str = (required=false) => ({type:'string',required});
const list = () => ({type:'string[]',required:false});

// Keep generator names aligned with levelHelpers.instantiateFromParams.
// These descriptions also drive the editor parameter inspector and docs.
export const ENTITY_DEFINITIONS = Object.freeze({
  createSlab: {label:'Floor / Slab',category:'Geometry',fields:{
    px:number(),surfY:number(),pz:number(),sx:positive(),sz:positive(),mat:str(),lift:bool(),thickness:positive(false)}},
  createWall: {label:'Wall',category:'Geometry',fields:{
    px:number(),py:number(),pz:number(),sx:positive(),sy:positive(),sz:positive(),mat:str()}},
  createPillar:{label:'Pillar',category:'Geometry',fields:{
    px:number(),pz:number(),baseY:number(),height:positive(),diameter:positive(false),mat:str()}},
  createColumn:{label:'Column',category:'Geometry',fields:{
    px:number(),py:number(),pz:number(),height:positive(),size:positive(),mat:str()}},
  createGlass:{label:'Glass',category:'Geometry',fields:{
    px:number(),py:number(),pz:number(),sx:positive(),sy:positive(),sz:positive(),mat:str(),collides:bool()}},
  createRampBox:{label:'Freeform Ramp',category:'Traversal',fields:{
    px:number(),py:number(),pz:number(),sx:positive(),sy:positive(),sz:positive(),rotX:number(false),rotZ:number(false),mat:str()}},
  createStaircase:{label:'Staircase (composite)',category:'Traversal',fields:{
    px:number(),py:number(),pz:number(),width:positive(),depth:positive(),
    steps:{type:'integer',required:true,min:2,max:80},
    dirX:{type:'enum',values:[-1,0,1],required:true},
    dirZ:{type:'enum',values:[-1,0,1],required:true},
    stepHeight:positive(false),flareEnds:bool(),mat:str()}},
  createRamp:{label:'Rise Ramp',category:'Traversal',fields:{
    cx:number(),cz:number(),dir:{type:'enum',values:['N','S','E','W'],required:true},width:positive(),
    fromY:number(),toY:number(),length:positive(),mat:str()}},
  createCeiling:{label:'Ceiling',category:'Geometry',fields:{
    px:number(),y:number(),pz:number(),sx:positive(),sz:positive(),mat:str(),collides:bool()}},
  createBarrel:{label:'Explosive Barrel',category:'Prop',fields:{px:number(),pz:number(),yOff:number(false)}},
  createCrate:{label:'Crate',category:'Prop',fields:{
    px:number(),py:number(),pz:number(),sx:positive(),sy:positive(),sz:positive(),mat:str()}},
  createLava:{label:'Lava',category:'Hazard',fields:{
    cx:number(),cz:number(),sx:positive(),sz:positive(),surfY:number(false)}},
  createDestructibleWall:{label:'Destructible Wall',category:'Hazard',fields:{
    px:number(),surfY:number(),pz:number(),sx:positive(),sh:positive(),sz:positive(),hp:positive()}},
  createSpikeTrap:{label:'Spikes',category:'Hazard',fields:{
    cx:number(),cz:number(),sx:positive(),sz:positive(),surfY:number()}},
  createJumpPad:{label:'Jump Pad',category:'Traversal',fields:{
    px:number(),floorY:number(),pz:number(),force:positive(),rotY:number(false)}},
  createZipline:{label:'Zipline / Cable Car',category:'Traversal',fields:{
    name:str(),startX:number(),startY:number(),startZ:number(),
    endX:number(),endY:number(),endZ:number(),
    worldSpeed:positive(),width:positive(),depth:positive()}},
  createMovingPlatform:{label:'Moving Platform',category:'Traversal',fields:{
    startX:number(),startY:number(),startZ:number(),endX:number(),endY:number(),endZ:number(),
    sx:positive(),sz:positive(),speed:positive(),waitTime:number(false,0,1000)}},
  createPowerSwitch:{label:'Power Switch',category:'Traversal',fields:{
    px:number(),py:number(),pz:number(),targetPlatformIds:list()}},
});

export const MARKER_DEFINITIONS = Object.freeze({
  playerSpawn:{label:'Player Spawn',options:['team','modes']},
  enemySpawn:{label:'Enemy Spawn',options:['modes']},
  pvpSpawn:{label:'PvP Spawn',options:['team','modes']},
  weaponPickup:{label:'Weapon Pickup',options:['weapon','modes']},
  healthPickup:{label:'Health Pickup',options:['modes']},
  armorPickup:{label:'Armor Pickup',options:['modes']},
  ammoPickup:{label:'Ammo Pickup',options:['modes']},
});
const validId = /^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/;
const vector = v => v && typeof v==='object' && ['x','y','z'].every(k=>Number.isFinite(v[k]));

export function stableEntityId(mapId,index){
  return String(mapId).replace(/[^a-zA-Z0-9_-]/g,'').toLowerCase()+'-entity-'+String(index+1).padStart(4,'0');
}
export function normalizeMapDocument(input,expectedMap=null){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Map document must be an object');
  const map=input.map||expectedMap;
  if(!validId.test(map||''))throw Error('Map must have a valid ID');
  if(expectedMap && map!==expectedMap)throw Error('Map mismatch: expected '+expectedMap+', got '+map);
  if(!Array.isArray(input.objects))throw Error('Map document must contain an objects array');
  const objects=input.objects.map((raw,i)=>({
    ...raw, id:raw?.id||stableEntityId(map,i),
    params:raw?.params ? {...raw.params}:{},
  }));
  return {
    ...input,
    version:MAP_SCHEMA_VERSION,
    map,
    objects,
    markers:Array.isArray(input.markers)?input.markers.map(m=>({...m})):[],
  };
}
export function validateMapDocument(input,{expectedMap=null,strictIds=true}={}){
  const errors=[];
  let doc;
  try{doc=normalizeMapDocument(input,expectedMap)}catch(e){return {valid:false,errors:[e.message],document:null}}
  if(input.version!=null && Number(input.version)>MAP_SCHEMA_VERSION)errors.push('Unsupported future schema version '+input.version);
  const ids=new Set();
  const validEntity=(item,where)=>{
    if(!validId.test(item.id||''))errors.push(where+'.id must be alphanumeric, hyphen or underscore');
    if(ids.has(item.id))errors.push('Duplicate map ID: '+item.id);
    ids.add(item.id);
    if(strictIds&&!item.id)errors.push(where+' missing stable ID');
  };
  for(const [i,o] of doc.objects.entries()){
    const where='objects['+i+']';
    if(!o||typeof o!=='object'){errors.push(where+' must be an object');continue}
    if(strictIds&&!input.objects[i]?.id)errors.push(where+' missing stable ID');
    validEntity(o,where);
    const def=ENTITY_DEFINITIONS[o.generator];
    if(!def){errors.push(where+' unsupported generator '+String(o.generator));continue}
    if(!o.params||typeof o.params!=='object'||Array.isArray(o.params)){errors.push(where+'.params must be an object');continue}
    for(const [key,field] of Object.entries(def.fields)){
      const val=o.params[key];
      if(val===undefined||val===null){
        if(field.required)errors.push(where+'.params.'+key+' is required');
        continue;
      }
      if(field.type==='number' && (!Number.isFinite(val)||val<field.min||val>field.max))
        errors.push(where+'.params.'+key+' must be a finite number in ['+field.min+', '+field.max+']');
      if(field.type==='boolean' && typeof val!=='boolean')errors.push(where+'.params.'+key+' must be boolean');
      if(field.type==='integer' && (!Number.isInteger(val)||val<field.min||val>field.max))
        errors.push(where+'.params.'+key+' must be an integer between '+field.min+' and '+field.max);
      if(field.type==='string' && (typeof val!=='string'||val.length>100))errors.push(where+'.params.'+key+' must be a string <= 100 chars');
      if(field.type==='string[]' && (!Array.isArray(val)||val.some(x=>typeof x!=='string'||!validId.test(x))))
        errors.push(where+'.params.'+key+' must be an array of valid entity IDs');
      if(field.type==='enum' && !field.values.includes(val))
        errors.push(where+'.params.'+key+' must be one of '+field.values.join(', '));
    }
    if(o.generator==='createZipline'){
      const p=o.params;
      if([p.startX,p.startY,p.startZ,p.endX,p.endY,p.endZ].every(Number.isFinite)
        && Math.hypot(p.endX-p.startX,p.endY-p.startY,p.endZ-p.startZ)<0.1)
        errors.push(where+' zipline endpoints must differ');
    }
    if(o.generator==='createStaircase'){
      const {dirX,dirZ}=o.params;
      if(Math.abs(dirX||0)+Math.abs(dirZ||0)!==1)
        errors.push(where+' staircase must follow exactly one horizontal axis');
    }
    for(const key of ['position','rotation','scaling']){
      if(o[key]!==undefined && !vector(o[key]))errors.push(where+'.'+key+' requires finite x/y/z');
    }
    if(o.scaling && ['x','y','z'].some(k=>o.scaling[k]===0))errors.push(where+'.scaling cannot contain zero');
  }
  for(const [i,m] of doc.markers.entries()){
    const where='markers['+i+']';
    if(!m||typeof m!=='object'){errors.push(where+' must be an object');continue}
    validEntity(m,where);
    if(!MARKER_DEFINITIONS[m.type])errors.push(where+' unknown marker type: '+m.type);
    if(!vector(m.position))errors.push(where+'.position must have finite x/y/z');
    if(m.team!==undefined && !['RED','BLUE','ANY'].includes(m.team))errors.push(where+'.team must be RED, BLUE or ANY');
    if(m.modes!==undefined && (!Array.isArray(m.modes)||m.modes.some(v=>!['survival','tdm','ffa','gunGame'].includes(v))))
      errors.push(where+'.modes contains unsupported mode');
    if(m.type==='weaponPickup' && (typeof m.weapon!=='string'||!validId.test(m.weapon)))
      errors.push(where+'.weapon must name an existing weapon key');
  }
  for(const [i,o] of doc.objects.entries()){
    if(o.generator!=='createPowerSwitch')continue;
    for(const id of o.params?.targetPlatformIds||[]){
      const target=doc.objects.find(x=>x.id===id);
      if(target?.generator!=='createMovingPlatform')
        errors.push('objects['+i+'] switch target '+id+' must identify a moving platform');
    }
  }
  return {valid:errors.length===0,errors,document:doc};
}
export function serializeEditableMesh(mesh){
  if(!mesh?.metadata?.editable||!mesh.metadata.generator)throw Error('Mesh is not a serialized map entity');
  const m=mesh.metadata;
  return {
    id:m.editorId,
    generator:m.generator,
    params:JSON.parse(JSON.stringify(m.params)),
    position:{x:mesh.position.x,y:mesh.position.y,z:mesh.position.z},
    // Babylon rotation gizmos often use a quaternion. Persist their actual
    // orientation instead of silently exporting stale Euler values.
    rotation:(()=>{
      const euler=mesh.rotationQuaternion?.toEulerAngles?.() || mesh.rotation;
      return {x:euler.x,y:euler.y,z:euler.z};
    })(),
    scaling:{x:mesh.scaling.x,y:mesh.scaling.y,z:mesh.scaling.z},
  };
}
