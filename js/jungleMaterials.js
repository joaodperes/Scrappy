// Jungle-only, editor-friendly material palette.
//
// All image files are bundled with Scrappy and reused across the surface,
// temple and four-level mine. Texture paths are relative to index.html and
// editor.html. Per-family UV repeats prevent giant slabs/walls from looking
// like a single smeared pixel. No geometry, collision or NavMesh changes.
const ROOT='assets/textures/lq/';

export const JUNGLE_TEXTURE_RECIPES=Object.freeze({
  jungleSoil:       {file:'med_bigdirt.png',u:14,v:14,tint:[0.67,0.70,0.54],spec:.035},
  jungleMossFloor:  {file:'gravel1.png',u:11,v:11,tint:[0.48,0.62,0.37],spec:.025},
  jungleRuinStone:  {file:'conc1_1.png',u:5,v:5,tint:[0.69,0.74,0.64],spec:.06},
  jungleMineFloor:  {file:'gravel1.png',u:12,v:12,tint:[0.53,0.48,0.39],spec:.025},
  jungleDeepFloor:  {file:'darkrock.png',u:14,v:14,tint:[0.47,0.46,0.44],spec:.03},
  jungleMineWall:   {file:'darkrock.png',u:12,v:5,tint:[0.62,0.58,0.49],spec:.035},
  jungleDeepWall:   {file:'darkrock.png',u:14,v:7,tint:[0.44,0.48,0.52],spec:.03},
  jungleMineCeiling:{file:'darkrock.png',u:9,v:8,tint:[0.32,0.34,0.34],spec:.025},
  jungleRamp:       {file:'met_brn_grate.png',u:3,v:9,tint:[0.65,0.56,0.43],spec:.09},
  jungleIron:       {file:'met_brn_block.png',u:5,v:3,tint:[0.57,0.62,0.57],spec:.13},
});

export function createJungleMaterials(scene,BABYLON){
  const materials={};
  for(const [key,recipe] of Object.entries(JUNGLE_TEXTURE_RECIPES)){
    const mat=new BABYLON.StandardMaterial(key,scene);
    const tex=new BABYLON.Texture(ROOT+recipe.file,scene);
    tex.uScale=recipe.u;
    tex.vScale=recipe.v;
    tex.wrapU=BABYLON.Texture.WRAP_ADDRESSMODE;
    tex.wrapV=BABYLON.Texture.WRAP_ADDRESSMODE;
    mat.diffuseTexture=tex;
    mat.diffuseColor=new BABYLON.Color3(...recipe.tint);
    mat.specularColor=new BABYLON.Color3(recipe.spec,recipe.spec,recipe.spec);
    mat.maxSimultaneousLights=8;
    // Map primitives are boxes with proper inward/outward faces. Keep normal
    // backface culling for better frame time throughout the stacked mine.
    mat.backFaceCulling=true;
    materials[key]=mat;
  }
  return materials;
}
