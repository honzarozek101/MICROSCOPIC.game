export let STENTOR_PRESETS = [
  { id: 'standard', name: 'Standard', circleRatios: [{ dxR:0, dyR:0, rR:1.00 }, { dxR:0, dyR:0.90, rR:0.65 }, { dxR:0, dyR:1.60, rR:0.38 }] },
  { id: 'compact', name: 'Compact', circleRatios: [{ dxR:0, dyR:0, rR:1.00 }, { dxR:0, dyR:0.75, rR:0.72 }, { dxR:0, dyR:1.35, rR:0.48 }] },
  { id: 'elongated', name: 'Elongated', circleRatios: [{ dxR:0, dyR:0, rR:1.00 }, { dxR:0, dyR:1.10, rR:0.55 }, { dxR:0, dyR:2.00, rR:0.28 }] },
  { id: 'wide', name: 'Wide', circleRatios: [{ dxR:0, dyR:0, rR:1.00 }, { dxR:0, dyR:0.65, rR:0.82 }, { dxR:0, dyR:1.22, rR:0.52 }] },
  { id: 'micro', name: 'Micro (2-circle)', circleRatios: [{ dxR:0, dyR:0, rR:1.00 }, { dxR:0, dyR:0.80, rR:0.50 }] },
  { id: 'giant', name: 'Giant', circleRatios: [{ dxR:0, dyR:0, rR:1.00 }, { dxR:0, dyR:1.00, rR:0.70 }, { dxR:0, dyR:1.90, rR:0.50 }, { dxR:0, dyR:2.60, rR:0.30 }] },
];

export function setStentorPresets(next) {
  STENTOR_PRESETS = next;
}
