// ========================================
// Math helpers
// ========================================

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function rand(min, max) {
  return min + Math.random() * (max - min);
}


// ========================================
// Angle helpers
// ========================================

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function approachAngle(current, target, rate) {
  const diff = wrapAngle(target - current);
  return current + diff * rate;
}


// ========================================
// Color helpers
// ========================================

export function hsla(h, s, l, a) {
  return `hsla(${h.toFixed(1)}, ${s.toFixed(1)}%, ${l.toFixed(1)}%, ${a})`;
}


// ========================================
// Tint generators for organisms
// ========================================

export function makeTintGreen() {
  const h = rand(55, 115);
  const s = rand(55, 90);
  const l = rand(28, 50);
  const a = 0.55;
  return hsla(h, s, l, a);
}

export function makeTintRed() {
  const h = (rand(-20, 20) + 360) % 360;
  const s = rand(70, 95);
  const l = rand(35, 55);
  const a = 0.55;
  return hsla(h, s, l, a);
}


// ========================================
// Distance helpers
// (zatím nepoužité, ale hodí se)
// ========================================

export function distSq(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function dist(ax, ay, bx, by) {
  return Math.sqrt(distSq(ax, ay, bx, by));
}