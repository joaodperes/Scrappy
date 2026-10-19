// Generic scene builder for every user-authored map from catalog.json.
// No map-specific JS and no arbitrary script execution from JSON.
import { walkableMeshes, jumpPads, explosiveBarrels } from './level.js';
import { setLevelMaterials, registerMaterial, loadMapDocument,
  applyEditableLayout } from './levelHelpers.js';

const BABYLON=window.BABYLON;
export const movingPlatforms=[];
export const hazardZones=[];
export const destructibleWalls=[];
export const powerSwitches=[];
export const spikeTrapZones=[];
export const NAVMESH_PARAMS={
  cs:.2,ch:.2,walkableSlopeAngle:55,walkableHeight:2.5,
  walkableClimb:.6,walkableRadius:.5,maxEdgeLen:12,
  maxSimplificationError:1.3,minRegionArea:4,mergeRegionArea:20,
  maxVertsPerPoly:6,detailSampleDist:6,detailSampleMaxError:1
};
export async function buildCommunityLevel(customScene=null,mapId=null){
  if(!mapId)throw Error('Community map builder requires a map ID');
  const scene=customScene||window.__levelScene;
  const nav=window.__levelNavPlugin;
  if(!scene||!nav?.createNavMesh)throw Error('Scene/NavMesh not initialized');
  walkableMeshes.length=0;
  jumpPads.length=0;explosiveBarrels.length=0;
  movingPlatforms.length=0;hazardZones.length=0;powerSwitches.length=0;
  destructibleWalls.length=0;spikeTrapZones.length=0;
  // Consistent material defaults for entirely data-driven maps.
  const make=(name,color)=>{
    const mat=new BABYLON.StandardMaterial('custom_'+name,scene);
    mat.diffuseColor=color;
    return mat;
  };
  const concrete=make('concrete',new BABYLON.Color3(.51,.56,.59));
  const steel=make('steel',new BABYLON.Color3(.39,.44,.52));
  const garden=make('garden',new BABYLON.Color3(.27,.48,.31));
  const asphalt=make('asphalt',new BABYLON.Color3(.24,.28,.32));
  const glass=make('glass',new BABYLON.Color3(.44,.68,.82));
  glass.alpha=.45;glass.backFaceCulling=false;
  setLevelMaterials(concrete,steel,garden,asphalt,glass);
  for(const [k,m] of Object.entries({concrete,steel,garden,asphalt,glass}))
    registerMaterial(k,m);
  if(!scene.lights.some(l=>l.name==='hemiCommunity')){
    const sky=new BABYLON.HemisphericLight('hemiCommunity',
      new BABYLON.Vector3(0,1,0),scene);
    sky.intensity=.9;
  }
  const doc=await loadMapDocument(mapId);
  applyEditableLayout(doc.objects,
    {hazardZones,destructibleWalls,movingPlatforms,powerSwitches});
  const surfaces=walkableMeshes.filter(m=>m.isEnabled());
  surfaces.forEach(m=>m.computeWorldMatrix(true));
  nav.createNavMesh(surfaces,NAVMESH_PARAMS);
}
