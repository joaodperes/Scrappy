// Pure map-editor transform utilities, shared between UI and tests.
// Babylon mesh rotation is expressed in radians; editor numeric inputs use degrees.
export const RAD_TO_DEG = 180 / Math.PI;
export const DEG_TO_RAD = Math.PI / 180;
export function quantize(value, step) {
  if (!Number.isFinite(value)) throw new Error('Transform must be finite');
  if (!Number.isFinite(step) || step <= 0) throw new Error('Snap step must be positive');
  // Prevent floating-point drift from accumulating after repeated snapping.
  return Number((Math.round(value / step) * step).toFixed(8));
}
export function snapVector(values, step) {
  return {
    x: quantize(values.x, step),
    y: quantize(values.y, step),
    z: quantize(values.z, step),
  };
}
export function normalizeEditorTransform(position, rotationRadians, scaling,
  { gridEnabled = false, gridSize = 1, angleEnabled = false, angleDegrees = 15 } = {}) {
  const pos = gridEnabled ? snapVector(position, gridSize) : {...position};
  const deg = {
    x: rotationRadians.x * RAD_TO_DEG,
    y: rotationRadians.y * RAD_TO_DEG,
    z: rotationRadians.z * RAD_TO_DEG,
  };
  const rot = angleEnabled ? snapVector(deg, angleDegrees) : deg;
  return {
    position: pos,
    rotation: {x:rot.x * DEG_TO_RAD, y:rot.y * DEG_TO_RAD, z:rot.z * DEG_TO_RAD},
    scaling: {...scaling},
  };
}
export function validateTransformGroup(group, values) {
  if (!['position', 'rotation', 'scaling'].includes(group)) throw new Error('Unknown transform group');
  const parsed = {};
  for (const axis of ['x','y','z']) {
    const raw = String(values[axis]).trim();
    if (raw === '') throw new Error(group + '.' + axis + ' requires a value');
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(group + '.' + axis + ' must be finite');
    if (Math.abs(n) > 100000) throw new Error(group + '.' + axis + ' is out of range');
    if (group === 'scaling' && Math.abs(n) < 0.00001)
      throw new Error('Scale cannot be zero; use Reset scale to return to 1');
    parsed[axis] = n;
  }
  return parsed;
}
