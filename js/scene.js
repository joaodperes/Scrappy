// Shared Babylon scene. Gameplay uses the existing #c canvas; editor.html
// injects its own scene and deliberately skips gameplay navigation.
const BABYLON = window.BABYLON;
let scene, camera, engine, navPlugin;

if (window.__levelScene) {
  scene = window.__levelScene;
  camera = scene.activeCamera;
  engine = scene.getEngine();
  navPlugin = window.__levelNavPlugin || { createNavMesh: () => {} };
} else {
  const canvas = document.getElementById('c');
  if (!canvas) throw new Error('[scene] Missing #c gameplay canvas');
  engine = new BABYLON.Engine(canvas, false, {
    powerPreference: 'high-performance', limitDeviceRatio: 1.5,
  });
  scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0x30/255, 0x28/255, 0x1e/255, 1);
  scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR;
  scene.fogColor = new BABYLON.Color3(0x30/255, 0x28/255, 0x1e/255);
  scene.fogStart = 40;
  scene.fogEnd = 140;
  scene.gravity = new BABYLON.Vector3(0, -26, 0);

  camera = new BABYLON.UniversalCamera('cam', new BABYLON.Vector3(0, 1.72, 0), scene);
  camera.minZ = 0.15;
  camera.maxZ = 200;
  camera.fov = 1.48;
  camera.inputs.clear();
  camera.setTarget(new BABYLON.Vector3(0, 1.72, 1));
  scene.activeCamera = camera;

  // Recast is required: a straight-line fallback silently breaks stairs,
  // map obstacles, and off-mesh traversal. Fail visibly if the CDN is down.
  if (typeof window.Recast !== 'function') {
    throw new Error('[scene] Recast is unavailable; check recast.js script loading');
  }
  const recast = await window.Recast();
  navPlugin = new BABYLON.RecastJSPlugin(recast);
  window.__levelScene = scene;
  window.__levelNavPlugin = navPlugin;
}

export { scene, camera, engine, navPlugin };
