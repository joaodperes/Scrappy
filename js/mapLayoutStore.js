// Current map documents are registered during map build, before gameplay
// spawns/pickups are created. This module has no scene or progression imports.
const documents=new Map();
export function registerMapDocument(mapId,doc){
  if(!doc||doc.map!==mapId)throw Error('Mismatched map document: '+mapId);
  documents.set(mapId,doc);
}
export function getLoadedMapDocument(mapId){return documents.get(mapId)||null}
export function getMapMarkers(mapId,type,mode){
  const markers=documents.get(mapId)?.markers||[];
  return markers.filter(m=>m.type===type&&(!mode||!m.modes||m.modes.includes(mode)));
}
