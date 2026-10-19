// JSON-driven community map catalog. No Babylon.js or Firebase imports.
// A map requires only a layout JSON and one manifest entry; the shared
// builder handles all entities defined in mapSchema.js.
export const CATALOG_PATH='assets/maps/catalog.json';
const idPattern=/^[a-z][a-z0-9_-]{1,39}$/;
const BUILT_INS=new Set(['scrapyard','city','jungle','terminal']);
const MODES=new Set(['survival','tdm','ffa','gunGame']);
export function validateMapCatalog(raw){
  const errors=[],seen=new Set();
  if(!raw||typeof raw!=='object'||Array.isArray(raw))
    return {valid:false,errors:['Catalog must be an object'],maps:[]};
  if(raw.version!==1)errors.push('Catalog version must be 1');
  if(!Array.isArray(raw.maps))errors.push('Catalog maps must be an array');
  const items=Array.isArray(raw.maps)?raw.maps:[];
  const maps=[];
  for(const [i,item] of items.entries()){
    const at='maps['+i+']';
    if(!item||typeof item!=='object'||Array.isArray(item)){
      errors.push(at+' must be an object');continue;
    }
    const id=item.id;
    if(typeof id!=='string'||!idPattern.test(id)||BUILT_INS.has(id))
      errors.push(at+'.id must be a new lowercase safe map ID');
    if(seen.has(id))errors.push(at+'.id is duplicated');
    seen.add(id);
    if(typeof item.name!=='string'||!item.name.trim()||item.name.length>60)
      errors.push(at+'.name must be 1–60 characters');
    if(item.desc!==undefined&&(typeof item.desc!=='string'||item.desc.length>240))
      errors.push(at+'.desc must be <=240 characters');
    if(item.icon!==undefined&&(typeof item.icon!=='string'||item.icon.length>12))
      errors.push(at+'.icon must be <=12 characters');
    if(!Number.isInteger(item.teamSize)||item.teamSize<1||item.teamSize>12)
      errors.push(at+'.teamSize must be an integer from 1 to 12');
    if(!Array.isArray(item.supportedModes)||item.supportedModes.length===0||
       item.supportedModes.some(mode=>!MODES.has(mode))||
       new Set(item.supportedModes).size!==item.supportedModes.length)
      errors.push(at+'.supportedModes must contain unique supported modes');
    const spawn=item.spawn;
    if(!spawn||!['x','yOffset','z'].every(k=>Number.isFinite(spawn[k])))
      errors.push(at+'.spawn needs finite x, yOffset and z');
    maps.push({id:item.id,name:item.name,icon:item.icon||'🗺️',
      desc:item.desc||'',teamSize:item.teamSize,
      supportedModes:item.supportedModes,spawn:item.spawn});
  }
  return {valid:errors.length===0,errors,maps};
}
export async function loadMapCatalog(fetcher=fetch){
  const response=await fetcher(CATALOG_PATH,{cache:'no-cache'});
  if(!response.ok)throw Error('Map catalog HTTP '+response.status);
  let doc;
  try{doc=await response.json()}catch(e){throw Error('Map catalog contains invalid JSON: '+e.message)}
  const checked=validateMapCatalog(doc);
  if(!checked.valid)throw Error('Invalid map catalog:\n'+checked.errors.join('\n'));
  return checked.maps;
}
