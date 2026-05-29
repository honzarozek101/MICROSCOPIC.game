export const CystEntity = {
  id: 'Cyst',
  label: 'Cyst',
  color: 'rgba(160, 205, 176, 0.86)',
  strokeColor: 'rgba(225, 255, 232, 0.82)',
  defaultRadius: 21,
  props: [
    { key: 'radius', label: 'Radius', type: 'number', min: 2, max: 200, step: 1, default: 21 },
    { key: 'spriteAlpha', label: 'Alpha', type: 'number', min: 0, max: 1, step: 0.01, default: 0.82 }
  ]
};
