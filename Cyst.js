import { config } from "./config.js";
import { Egg, DEFAULTS as EggDefaults } from "./Egg.js";

export const DEFAULTS = {
  radiusScale: 1.5,
  shellColor: "rgba(160, 205, 176, 0.86)",
  coreColor: "rgba(66, 92, 72, 0.72)",
  rimColor: "rgba(225, 255, 232, 0.72)"
};

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function getCystRadiusScale(settings = {}) {
  const value = Number(settings.radiusScale ?? config.cystRadiusScale ?? DEFAULTS.radiusScale);
  return Number.isFinite(value) && value > 0 ? value : DEFAULTS.radiusScale;
}

export class Cyst extends Egg {
  constructor(x, y, angle = 0, settings = {}) {
    super(x, y, angle);

    this.type = "Cyst";
    this.isCyst = true;
    this.detached = true;
    this.hatching = false;
    this.hatched = false;
    this.merged = false;
    this.sourceKind = settings.sourceKind ?? "Enemy";
    this.parentConfig = settings.parentConfig ?? null;

    const baseRadius = Math.max(
      1,
      Number(settings.baseRadius ?? settings.radius ?? EggDefaults.targetRadius) || EggDefaults.targetRadius
    );
    const radius = baseRadius * getCystRadiusScale(settings);
    this.radius = radius;
    this.displayRadius = radius;
    this.targetRadius = radius;
    this.sourceEnemyRadius = settings.sourceEnemyRadius ?? baseRadius;
    this.hatchEnemyRadius = settings.hatchEnemyRadius ?? baseRadius;
    this.spriteAlpha = settings.spriteAlpha ?? 0.82;
  }

  get readyToSpawn() {
    return false;
  }

  mergeWith() {
    return false;
  }

  toParticle() {
    return null;
  }

  draw(ctx) {
    const r = this.displayRadius ?? this.radius;
    if (r <= 0) return;

    const t = performance.now() * 0.001;
    const pulse = 0.5 + Math.sin(t * 1.7 + this.spriteRotation) * 0.5;
    const alpha = clamp01(this.spriteAlpha ?? 0.82);

    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.shadowColor = "rgba(130, 220, 165, 0.28)";
    ctx.shadowBlur = 8 + r * 0.35 + pulse * 5;

    const gradient = ctx.createRadialGradient(
      this.x - r * 0.28,
      this.y - r * 0.30,
      r * 0.08,
      this.x,
      this.y,
      r
    );
    gradient.addColorStop(0, "rgba(245, 255, 236, 0.95)");
    gradient.addColorStop(0.38, DEFAULTS.shellColor);
    gradient.addColorStop(0.78, "rgba(84, 128, 92, 0.72)");
    gradient.addColorStop(1, DEFAULTS.coreColor);

    ctx.beginPath();
    ctx.ellipse(this.x, this.y, r * 1.02, r * 0.94, this.spriteRotation * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, r * 0.98, r * 0.90, this.spriteRotation * 0.12, 0, Math.PI * 2);
    ctx.strokeStyle = DEFAULTS.rimColor;
    ctx.lineWidth = Math.max(1.5, r * 0.06);
    ctx.stroke();

    ctx.globalAlpha *= 0.34;
    for (let i = 0; i < 5; i++) {
      const a = t * 0.08 + this.spriteRotation + i * 1.256;
      ctx.beginPath();
      ctx.ellipse(
        this.x + Math.cos(a) * r * 0.26,
        this.y + Math.sin(a) * r * 0.20,
        r * (0.13 + i * 0.01),
        r * 0.045,
        a + Math.PI * 0.5,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = "rgba(40, 78, 55, 0.55)";
      ctx.fill();
    }

    ctx.restore();
  }
}
