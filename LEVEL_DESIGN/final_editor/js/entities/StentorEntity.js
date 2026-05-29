export const StentorEntity = {
  id: 'Stentor',
  label: 'Stentor',
  color: 'rgba(60, 190, 210, 0.78)',
  strokeColor: 'rgba(130, 230, 245, 0.9)',
  defaultRadius: 38,
  props: [],
};

export function makeDefaultStentorMouth() {
  return { enabled: true, turnRate: 0.08, idleSpin: 0.01, rotationDir: 1, rotationRange: [-90, 90] };
}

export function makeDefaultStentorBodyRotation() {
  return { enabled: true, idleSpin: 0.003, rotationDir: 1, rotationRange: [-25, 25] };
}
