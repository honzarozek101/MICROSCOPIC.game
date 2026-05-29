export const MacrophageEntity = {
  id: 'Macrophage',
  label: 'Macro',
  color: 'rgba(170, 80, 255, 0.80)',
  strokeColor: 'rgba(210,140,255,0.9)',
  defaultRadius: 38,
  props: [
    { key: 'radius', label: 'Radius', type: 'number', min: 15, max: 100 },
    { key: 'rotationRange', label: 'Rotation range °', type: 'text', default: 'null', placeholder: 'e.g. [-90,90]' },
    { key: 'rotationDir', label: 'Rotation dir (1/-1)', type: 'number', min: -1, max: 1, step: 2, default: 1 },
  ],
};
