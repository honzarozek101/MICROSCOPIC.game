export const ParticleEntity = {
  id: 'Particle',
  label: 'Particle',
  color: 'rgba(60, 200, 80, 0.75)',
  strokeColor: 'rgba(100,240,100,0.9)',
  defaultRadius: 14,
  props: [
    { key: 'radius', label: 'Radius', type: 'number', min: 2, max: 100 },
    { key: 'spriteIndex', label: 'Sprite index', type: 'number', min: 1, max: 5, step: 1, default: 1 }
  ],
};
