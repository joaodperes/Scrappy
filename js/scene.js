// scene.js – Babylon.js engine, scene, camera
const BABYLON = window.BABYLON;

export const canvas = document.getElementById('c');
export const engine = new BABYLON.Engine(canvas, false, {
  powerPreference: 'high-performance',
  limitDeviceRatio: 1.5,
});

export const scene = new BABYLON.Scene(engine);

await window.Recast();
export const navPlugin = new BABYLON.RecastJSPlugin();

scene.clearColor = new BABYLON.Color4(0x30/255, 0x28/255, 0x1e/255, 1);
scene.fogMode    = BABYLON.Scene.FOGMODE_LINEAR;
scene.fogColor   = new BABYLON.Color3(0x30/255, 0x28/255, 0x1e/255);
scene.fogStart   = 40;
scene.fogEnd     = 140;
scene.gravity    = new BABYLON.Vector3(0, -26, 0);

// UniversalCamera driven entirely by player.js (inputs cleared)
export const camera = new BABYLON.UniversalCamera('cam', new BABYLON.Vector3(0, 1.72, 0), scene);
camera.minZ = 0.15;
camera.maxZ = 200;
camera.fov  = 1.48;   // ≈85 ° hfov
camera.inputs.clear();
camera.setTarget(new BABYLON.Vector3(0, 1.72, 1));

window.addEventListener('resize', () => engine.resize());