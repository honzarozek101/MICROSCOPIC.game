export const ParticleZoneEntity = {
  id: 'ParticleZone',
  label: 'Zone',
  color: 'rgba(60, 200, 80, 0.30)',
  strokeColor: 'rgba(100,240,100,0.6)',
  defaultRadius: 60,
  props: [
    { key: 'minSize', label: 'Min size', type: 'number', min: 2, max: 100, step: 1, default: 10 },
    { key: 'maxSize', label: 'Max size', type: 'number', min: 2, max: 140, step: 1, default: 25 },
    { key: 'spawnIntervalMs', label: 'Spawn ms', type: 'number', min: 80, max: 30000, step: 10, default: 1800 },
    { key: 'growthDurationMs', label: 'Grow ms', type: 'number', min: 0, max: 10000, step: 10, default: 1200 },
    { key: 'spawnArcCenterDeg', label: 'Arc center °', type: 'number', min: -180, max: 180, step: 1, default: 0 },
    { key: 'spawnArcSpanDeg', label: 'Arc span °', type: 'number', min: 0, max: 360, step: 1, default: 360 }
  ],
};
