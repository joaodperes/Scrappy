// scene.js – provides the Babylon scene, camera, engine, and navPlugin.
// If window.__levelScene is already set (e.g., from the editor), reuse it.
const BABYLON = window.BABYLON;

let scene, camera, engine, navPlugin;

if (typeof window !== 'undefined' && window.__levelScene) {
  // --- Reuse the existing scene (e.g., from editor.html) ---
  scene = window.__levelScene;
  camera = scene.activeCamera;
  engine = scene.getEngine();
  // Use the provided nav plugin or a no-op fallback
  navPlugin = window.__levelNavPlugin || { createNavMesh: () => {} };
  //console.log('[scene.js] Reusing existing scene from window.__levelScene');
} else {
  // --- Create a brand new scene (normal game startup) ---
  const canvas = document.createElement('canvas');
  canvas.id = 'renderCanvas';
  document.body.prepend(canvas);
  canvas.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; display:block;';

  engine = new BABYLON.Engine(canvas, true);
  scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color3(0.1, 0.1, 0.15);

  // FPS camera — player.js drives .position and .rotation.x/y manually every
  // frame. Do NOT use ArcRotateCamera here: its view matrix is rebuilt every
  // frame from alpha/beta/radius/target, silently overwriting any manual
  // .position/.rotation. That's correct for editor.html's free-orbit camera,
  // but for gameplay it means the camera just sits at target(0,0,0)+radius(120)
  // forever — outside every map's walls — regardless of WASD/mouse input.
  camera = new BABYLON.UniversalCamera('camera', new BABYLON.Vector3(0, 1.72, 0), scene);
  camera.minZ = 0.05;
  camera.fov = 1.48;
  scene.activeCamera = camera;
  // no attachControl() — player.js's pointer-lock mouse-look + WASD own input

  const light = new BABYLON.HemisphericLight('light', new BABYLON.Vector3(0, 1, 0), scene);
  light.intensity = 0.8;

  navPlugin = {
    createNavMesh: (meshes, params) => {
      //console.warn('[scene.js] NavMesh plugin not initialised – using no-op.');
    },
    getClosestPoint: (point) => point,
    computePath: (start, end) => [start, end],
  };

  window.__levelScene = scene;
  window.__levelNavPlugin = navPlugin;

  //console.log('[scene.js] Created new scene');
}

export { scene, camera, engine, navPlugin };