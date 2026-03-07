// lighting.js – scene lighting setup  (Babylon.js port)
const BABYLON = window.BABYLON;
import { scene } from './scene.js';

export function setupLighting() {
  // Hemisphere light: sky colour + ground colour, high intensity for flat shading feel
  const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0), scene);
  hemi.intensity    = 2.2;
  hemi.diffuse      = new BABYLON.Color3(0.91, 0.94, 1.0);   // cool sky
  hemi.groundColor  = new BABYLON.Color3(0.54, 0.48, 0.38);  // warm ground
  hemi.specular     = BABYLON.Color3.Black();

  // Soft fill for shadowed areas
  const fill = new BABYLON.HemisphericLight('fill', new BABYLON.Vector3(0, -1, 0), scene);
  fill.intensity   = 0.5;
  fill.diffuse     = new BABYLON.Color3(1.0,  0.95, 0.88);
  fill.specular    = BABYLON.Color3.Black();
}
