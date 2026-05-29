export const PlayerEntity = {
  id: 'Player',
  label: 'Player',
  color: 'rgba(60, 100, 255, 0.75)',
  strokeColor: 'rgba(120,160,255,0.9)',
  defaultRadius: 20,
  props: [
    { key: 'radius', label: 'Radius', type: 'number', min: 5, max: 120 },
    { key: 'clickForce', label: 'Click force', type: 'number', min: 0, max: 10, step: 0.05, default: 0.9 },
    { key: 'absorptionFactor', label: 'Absorption factor', type: 'number', min: 0.5, max: 2, step: 0.001, default: 0.99 },
    { key: 'splitRadius', label: 'Split radius', type: 'number', min: 5, max: 200, step: 1, default: 51 },
    { key: 'splitChildRadius', label: 'Split child radius', type: 'number', min: 2, max: 120, step: 1, default: 14 },
    { key: 'splitMinParentRadius', label: 'Split min parent', type: 'number', min: 2, max: 160, step: 1, default: 18 },
    { key: 'splitLaunchSpeed', label: 'Split launch speed', type: 'number', min: 0, max: 20, step: 0.1, default: 3.2 },
    { key: 'splitParentKick', label: 'Split parent kick', type: 'number', min: 0, max: 20, step: 0.1, default: 1.4 }
  ],
};
