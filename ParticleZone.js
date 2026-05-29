import { Particle } from "./Particle.js";
import { normalizeSpriteIndex } from "./spriteAssets.js";

const DEFAULTS = {
  minSize: 10,
  maxSize: 25,
  spawnIntervalMs: 1800,
  growthDurationMs: 1200,
  spawnStartScale: 0.28,
  spriteIndex: 1,
  spawnArcCenterDeg: 0,
  spawnArcSpanDeg: 360
};

function clampNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getTintGroup(radius, playerRadius) {
  return radius > playerRadius ? "red" : "green";
}

function normalizeDeg(value) {
  let deg = clampNumber(value, 0) % 360;
  if (deg <= -180) deg += 360;
  if (deg > 180) deg -= 360;
  return deg;
}

export class ParticleZone {
  constructor(x, y, radius, options = {}) {
    this.x = x;
    this.y = y;
    this.radius = Math.max(4, clampNumber(radius, 60));
    this.minSize = Math.max(2, clampNumber(options.minSize, DEFAULTS.minSize));
    this.maxSize = Math.max(this.minSize, clampNumber(options.maxSize, DEFAULTS.maxSize));
    this.spawnIntervalMs = Math.max(80, clampNumber(options.spawnIntervalMs, DEFAULTS.spawnIntervalMs));
    this.growthDurationMs = Math.max(0, clampNumber(options.growthDurationMs, DEFAULTS.growthDurationMs));
    this.spawnStartScale = Math.max(0.05, Math.min(clampNumber(options.spawnStartScale, DEFAULTS.spawnStartScale), 1));
    this.spriteIndex = Math.min(5, normalizeSpriteIndex(options.spriteIndex, DEFAULTS.spriteIndex));
    this.spawnArcCenterDeg = normalizeDeg(options.spawnArcCenterDeg ?? DEFAULTS.spawnArcCenterDeg);
    this.spawnArcSpanDeg = Math.max(0, Math.min(360, clampNumber(options.spawnArcSpanDeg, DEFAULTS.spawnArcSpanDeg)));
    this.lastSpawnTime = performance.now() - Math.random() * this.spawnIntervalMs;
  }

  _pickTargetRadius() {
    if (this.maxSize <= this.minSize) return this.minSize;
    return this.minSize + Math.random() * (this.maxSize - this.minSize);
  }

  _createParticle(playerRadius, bounds) {
    const targetRadius = this._pickTargetRadius();
    const startRadius = Math.max(1, targetRadius * this.spawnStartScale);
    const span = Math.max(0, Math.min(360, this.spawnArcSpanDeg));
    const center = this.spawnArcCenterDeg;
    const angleDeg = span >= 360
      ? Math.random() * 360 - 180
      : center - span * 0.5 + Math.random() * span;
    const angle = (angleDeg * Math.PI) / 180;
    const x = this.x + Math.cos(angle) * this.radius;
    const y = this.y + Math.sin(angle) * this.radius;
    const tintGroup = getTintGroup(targetRadius, playerRadius);

    const particle = new Particle(
      x,
      y,
      startRadius,
      Math.cos(angle) * 0.18,
      Math.sin(angle) * 0.18,
      "rgba(0,0,0,0)",
      false,
      false
    );

    particle.growthStartRadius = startRadius;
    particle.growthTargetRadius = targetRadius;
    particle.growthStartMs = performance.now();
    particle.growthDurationMs = this.growthDurationMs;
    particle.tintGroup = tintGroup;
    particle.color = tintGroup === "red" ? particle.tintRed : particle.tintGreen;
    particle.spriteVariant = tintGroup;
    particle.spriteIndex = this.spriteIndex;

    if (bounds) {
      particle.x = Math.max(targetRadius, Math.min(bounds.width - targetRadius, particle.x));
      particle.y = Math.max(targetRadius, Math.min(bounds.height - targetRadius, particle.y));
    }

    return particle;
  }

  update(worldParticles, playerRadius, bounds) {
    if (!Array.isArray(worldParticles)) return;

    const now = performance.now();
    while (now - this.lastSpawnTime >= this.spawnIntervalMs) {
      this.lastSpawnTime += this.spawnIntervalMs;
      worldParticles.push(this._createParticle(playerRadius, bounds));
    }
  }
}
