import { config } from "./config.js";
import { Particle } from "./Particle.js";
import { Quansistor } from "./Quansistor.js";
import { Stone, DEFAULTS as StoneDefaults } from "./Stone.js";

export const DEFAULTS = {
  ...StoneDefaults,
  color: "rgba(26, 115, 232, 0.50)",
  highlightColor: "rgba(220, 238, 255, 0.85)",
};

const OLDBODY_BASE_SCALE = 1.08;
const OLDBODY_OVERLAY_SCALE = 1.08;
const OLDBODY_INNER_RADIUS_RATIO = 0.6;
const OLDBODY_INNER_MAX_RADIUS = 30;
const OLDBODY_CARGO_SHELL_INSET = 1.5;
const OLDBODY_PROCEDURAL_POINTS = 96;
let nextOldbodyId = 1;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function readPositive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function drawProceduralOldbodyShell(ctx, x, y, radius, options = {}) {
  const r = Math.max(0.1, Number(radius) || 0.1);
  const t = Number.isFinite(options.time) ? options.time : performance.now() * 0.001;
  const alpha = clamp01(options.alpha ?? 1);
  const squashY = Number.isFinite(options.squashY) ? options.squashY : 0.96;

  if (alpha <= 0 || r <= 0.1) return;

  ctx.save();
  const baseAlpha = ctx.globalAlpha;
  ctx.globalAlpha = baseAlpha * alpha;

  ctx.beginPath();
  for (let i = 0; i <= OLDBODY_PROCEDURAL_POINTS; i++) {
    const a = (i / OLDBODY_PROCEDURAL_POINTS) * Math.PI * 2;
    const wobble =
      1 +
      Math.sin(a * 3.1 + t * 0.4) * 0.025 +
      Math.sin(a * 7.3 - t * 0.25) * 0.012;
    const rr = r * wobble;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr * squashY;

    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();

  const shellGradient = ctx.createRadialGradient(
    x - r * 0.25,
    y - r * 0.28,
    r * 0.05,
    x,
    y,
    r
  );
  shellGradient.addColorStop(0.00, "rgba(255, 255, 255, 0.95)");
  shellGradient.addColorStop(0.35, "rgba(230, 232, 232, 0.90)");
  shellGradient.addColorStop(0.72, "rgba(190, 198, 198, 0.72)");
  shellGradient.addColorStop(1.00, "rgba(120, 130, 130, 0.45)");

  ctx.shadowColor = "rgba(220, 255, 255, 0.20)";
  ctx.shadowBlur = r * 0.28;
  ctx.fillStyle = shellGradient;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.globalAlpha *= 0.28;
  for (let i = 0; i < 18; i++) {
    const a = i * 2.399 + t * 0.05;
    const d = r * (0.15 + ((i * 37) % 70) / 100);
    const spotRadius = r * (0.08 + ((i * 17) % 18) / 100);

    ctx.beginPath();
    ctx.ellipse(
      x + Math.cos(a) * d * 0.55,
      y + Math.sin(a) * d * 0.45,
      spotRadius * 1.8,
      spotRadius,
      a,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = i % 3 === 0
      ? "rgba(255, 210, 240, 0.22)"
      : "rgba(245, 255, 255, 0.18)";
    ctx.fill();
  }

  ctx.globalAlpha = baseAlpha * alpha;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.9, r * 0.9 * squashY, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.lineWidth = Math.max(1.5, r * 0.035);
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(x, y, r * 1.01, r * 1.01 * squashY, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(70, 80, 80, 0.28)";
  ctx.lineWidth = Math.max(1, r * 0.025);
  ctx.stroke();

  ctx.restore();
}

function drawProceduralOldbodyOverlay(ctx, x, y, radius, options = {}) {
  const r = Math.max(0.1, Number(radius) || 0.1);
  const t = Number.isFinite(options.time) ? options.time : performance.now() * 0.001;
  const alpha = clamp01(options.alpha ?? 1);

  if (alpha <= 0 || r <= 0.1) return;

  ctx.save();
  const baseAlpha = ctx.globalAlpha;
  ctx.globalAlpha = baseAlpha * alpha;
  ctx.shadowColor = "rgba(255, 112, 92, 0.22)";
  ctx.shadowBlur = r * 0.25;

  const coreGradient = ctx.createRadialGradient(
    x - r * 0.18,
    y - r * 0.22,
    r * 0.08,
    x,
    y,
    r
  );
  coreGradient.addColorStop(0, "rgba(255, 255, 255, 0.26)");
  coreGradient.addColorStop(0.45, "rgba(230, 246, 246, 0.16)");
  coreGradient.addColorStop(1, "rgba(120, 130, 130, 0.04)");

  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.82, Math.sin(t * 0.12) * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = coreGradient;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.lineCap = "round";
  for (let i = 0; i < 8; i++) {
    const a = i * (Math.PI * 2 / 8) + t * 0.035;
    const inner = r * (0.16 + (i % 3) * 0.035);
    const outer = r * (0.72 + (i % 2) * 0.08);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * inner, y + Math.sin(a) * inner * 0.82);
    ctx.quadraticCurveTo(
      x + Math.cos(a + 0.55) * r * 0.45,
      y + Math.sin(a - 0.35) * r * 0.34,
      x + Math.cos(a + 0.18) * outer,
      y + Math.sin(a + 0.18) * outer * 0.82
    );
    ctx.strokeStyle = i % 2 === 0
      ? "rgba(255, 255, 255, 0.16)"
      : "rgba(120, 140, 140, 0.10)";
    ctx.lineWidth = Math.max(0.8, r * 0.035);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.96, r * 0.79, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
  ctx.lineWidth = Math.max(1, r * 0.035);
  ctx.stroke();

  ctx.restore();
}

export class Oldbody extends Stone {
  constructor(x, y, radius, settings = {}) {
    super(x, y, radius, settings.color ?? DEFAULTS.color);

    this.highlightColor = settings.highlightColor ?? DEFAULTS.highlightColor;
    this.impulseFactor  = settings.impulseFactor  ?? DEFAULTS.impulseFactor;
    this.friction       = settings.friction       ?? DEFAULTS.friction;
    this.maxSpeed       = settings.maxSpeed       ?? DEFAULTS.maxSpeed;
    this.wallBounce     = settings.wallBounce     ?? DEFAULTS.wallBounce;
    this.bounceForce    = settings.bounceForce    ?? DEFAULTS.bounceForce;
    this.baseImpulseFactor = this.impulseFactor;
    this.baseFriction = this.friction;
    this.baseMaxSpeed = this.maxSpeed;
    this.baseWallBounce = this.wallBounce;
    this.baseBounceForce = this.bounceForce;

    this.internalParticleColor = "rgba(255, 120, 120, 0.78)";
    this.internalParticleGlow = "rgba(255, 90, 90, 0.55)";
    this.quansistorSeedColor = "rgba(105, 255, 201, 0.84)";
    this.quansistorSeedGlow = "rgba(86, 255, 202, 0.64)";
    this.cargoParticles = [];
    this.quansistor = null;
    this.quansistorResorbing = null;
    this.quansistorResorbingOldbody = null;
    this.lastDefenseShotMs = 0;
    this.oldbodyId = nextOldbodyId++;
    this.nutrients = Math.max(0, this.radius - config.oldbodyFeedingMinRadius);
    this.maxNutrients = this.nutrients;
  }

  get mass() {
    return super.mass;
  }

  consumeNutrients(amount) {
    if (this.absorbed || this.removed) return 0;

    const minRadius = Math.max(0.5, Number(config.oldbodyFeedingMinRadius) || 0.5);
    const rate = Math.max(0, Number(amount) || 0);
    if (!(rate > 0) || this.radius <= minRadius) {
      this.absorbed = true;
      this.removed = true;
      return 0;
    }

    if (!Number.isFinite(this.nutrients)) {
      this.nutrients = Math.max(0, this.radius - minRadius);
    }
    if (!Number.isFinite(this.maxNutrients)) {
      this.maxNutrients = Math.max(this.nutrients, 0);
    }

    const radiusLoss = Math.min(
      this.radius - minRadius,
      rate * Math.max(0, Number(config.oldbodyFeedingOldbodyShrink) || 0)
    );
    if (!(radiusLoss > 0)) return 0;

    this.radius -= radiusLoss;
    this.nutrients = Math.max(0, this.nutrients - radiusLoss);

    for (const cargo of this.cargoParticles ?? []) {
      if (this.isMigratingQuansistorSeed(cargo)) continue;
      this.placeCargoNearInnerEdge(cargo, cargo.angleHint ?? Math.random() * Math.PI * 2);
    }

    if (this.radius <= minRadius + 0.0001 || this.nutrients <= 0.0001) {
      this.radius = minRadius;
      this.nutrients = 0;
      this.cargoParticles = [];
      if (this.quansistor) {
        this.quansistor.absorbed = true;
        this.quansistor.removed = true;
        this.quansistor = null;
      }
      this.absorbed = true;
      this.removed = true;
    }

    return radiusLoss;
  }

  absorbEgg(egg, options = {}) {
    if (this.absorbed || this.removed) return false;
    if (!egg || egg.absorbed || egg.hatching) return false;
    if (egg.absorbingOldbody && egg.absorbingOldbody !== this) return false;

    const dx = egg.x - this.x;
    const dy = egg.y - this.y;
    const dist = Math.hypot(dx, dy);
    const eggRadius = egg.displayRadius ?? egg.radius;
    const minDist = this.radius + eggRadius;
    const forced = options.force === true;

    if (!forced && !egg.absorbingOldbody && (dist >= minDist || dist <= 0.0001)) return false;

    const angle = Number.isFinite(options.angle)
      ? options.angle
      : dist > 0.0001
      ? Math.atan2(dy, dx)
      : (egg.oldbodyCargo?.angleHint ?? Math.random() * Math.PI * 2);
    const nx = Math.cos(angle);
    const ny = Math.sin(angle);
    const taken = Math.min(config.oldbodyEggAbsorbRate, egg.radius);
    const isCyst = egg.isCyst === true;
    const cargo = egg.oldbodyCargo ?? this.createCargoParticle(angle, {
      kind: isCyst ? "quansistorSeed" : "nutrient",
      phase: isCyst ? "absorbing" : null,
      sourceKind: isCyst ? "Cyst" : (egg.sourceKind ?? null),
      cystSourceKind: isCyst ? (egg.sourceKind ?? null) : null,
      sourceRadius: isCyst ? eggRadius : null,
      sourceMacrophageSpriteIndex: Number.isFinite(Number(egg.sourceMacrophageSpriteIndex))
        ? Number(egg.sourceMacrophageSpriteIndex)
        : null
    });
    if (isCyst) {
      cargo.kind = "quansistorSeed";
      cargo.phase ??= "absorbing";
      cargo.sourceKind = "Cyst";
      cargo.cystSourceKind = egg.sourceKind ?? cargo.cystSourceKind ?? null;
      cargo.sourceRadius = Number.isFinite(Number(cargo.sourceRadius))
        ? Math.max(Number(cargo.sourceRadius), eggRadius)
        : eggRadius;
    }

    egg.absorbingOldbody = this;
    egg.oldbodyCargo = cargo;

    egg.radius = Math.max(0, egg.radius - taken);
    egg.displayRadius = egg.radius;
    egg.x = this.x + nx * (this.radius + Math.max(egg.radius, 0));
    egg.y = this.y + ny * (this.radius + Math.max(egg.radius, 0));
    egg.dx *= 0.7;
    egg.dy *= 0.7;

    cargo.radius += taken;
    if (!this.isMigratingQuansistorSeed(cargo)) {
      this.placeCargoNearInnerEdge(cargo, angle);
    }

    if (egg.radius <= 0.35) {
      egg.absorbed = true;
      egg.absorbingOldbody = null;
      egg.oldbodyCargo = null;
      if (isCyst) {
        this.releaseQuansistorSeed(cargo, angle);
      }
    }

    return true;
  }

  createCargoParticle(angle, metadata = {}) {
    const cargo = {
      x: this.x,
      y: this.y,
      dx: 0,
      dy: 0,
      radius: 0,
      angleHint: angle,
      kind: metadata.kind ?? "nutrient",
      phase: metadata.phase ?? null,
      sourceKind: metadata.sourceKind ?? null,
      cystSourceKind: metadata.cystSourceKind ?? null,
      sourceRadius: metadata.sourceRadius ?? null,
      sourceMacrophageSpriteIndex: metadata.sourceMacrophageSpriteIndex ?? null
    };
    this.placeCargoNearInnerEdge(cargo, angle);
    this.cargoParticles.push(cargo);
    return cargo;
  }

  placeCargoNearInnerEdge(cargo, angle) {
    const orbitDistance = Math.max(
      0,
      this.radius - cargo.radius - OLDBODY_CARGO_SHELL_INSET
    );
    cargo.x = this.x + Math.cos(angle) * orbitDistance;
    cargo.y = this.y + Math.sin(angle) * orbitDistance;
    cargo.angleHint = angle;
  }

  isQuansistorSeed(cargo) {
    return cargo?.kind === "quansistorSeed";
  }

  isMigratingQuansistorSeed(cargo) {
    return this.isQuansistorSeed(cargo) && cargo?.phase === "migrating";
  }

  releaseQuansistorSeed(cargo, angle = 0) {
    if (!cargo) return;

    cargo.kind = "quansistorSeed";
    cargo.phase = "migrating";
    cargo.angleHint = Number.isFinite(angle) ? angle : (cargo.angleHint ?? 0);
    if (Number.isFinite(Number(cargo.sourceRadius)) && Number(cargo.sourceRadius) > 0) {
      cargo.radius = Number(cargo.sourceRadius);
    }

    const dx = this.x - cargo.x;
    const dy = this.y - cargo.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.0001) {
      cargo.dx += (dx / dist) * 0.22;
      cargo.dy += (dy / dist) * 0.22;
    }
  }

  finalizeQuansistorSeed(cargo) {
    if (!cargo || cargo.absorbed) return null;

    if (this.quansistor && !this.quansistor.removed && !this.quansistor.absorbed) {
      this.quansistor.absorbSeed(cargo);
    } else {
      this.quansistor = new Quansistor(this, cargo);
      this.quansistor.createArm(this, this.lastBounds);
    }

    cargo.absorbed = true;
    cargo.radius = 0;
    return this.quansistor;
  }

  update(bounds) {
    this.lastBounds = bounds ?? this.lastBounds ?? null;
    const prevX = this.x;
    const prevY = this.y;

    super.update(bounds);

    const shiftX = this.x - prevX;
    const shiftY = this.y - prevY;

    for (const cargo of this.cargoParticles) {
      cargo.x += shiftX;
      cargo.y += shiftY;
    }
    if (this.quansistor && !this.quansistor.removed && !this.quansistor.absorbed) {
      this.quansistor.translate(shiftX, shiftY);
    }

    this.updateCargoParticles();
    if (this.quansistor && !this.quansistor.removed && !this.quansistor.absorbed) {
      this.quansistor.update(this, this.lastBounds);
    } else if (this.quansistor?.removed || this.quansistor?.absorbed) {
      this.quansistor = null;
    }
  }

  updateCargoParticles() {
    const maxRadius = Math.max(0, this.radius - OLDBODY_CARGO_SHELL_INSET);
    this.cargoParticles = this.cargoParticles.filter(cargo => cargo.radius > 0 && !cargo.absorbed);

    for (const cargo of this.cargoParticles) {
      const migratingSeed = this.isMigratingQuansistorSeed(cargo);
      const friction = migratingSeed
        ? readPositive(config.quansistorSeedFriction, 0.92)
        : readPositive(config.oldbodyCargoFriction, 0.96);
      const driftStrength = migratingSeed
        ? Math.max(0, Number(config.quansistorSeedDriftStrength) || 0)
        : Math.max(0, Number(config.oldbodyCargoDriftStrength) || 0);

      cargo.dx *= Math.min(1, friction);
      cargo.dy *= Math.min(1, friction);
      cargo.dx += (Math.random() - 0.5) * driftStrength;
      cargo.dy += (Math.random() - 0.5) * driftStrength;

      if (migratingSeed) {
        const toCenterX = this.x - cargo.x;
        const toCenterY = this.y - cargo.y;
        const centerForce = Math.max(0, Number(config.quansistorSeedCenterForce) || 0);
        cargo.dx += toCenterX * centerForce;
        cargo.dy += toCenterY * centerForce;

        const maxSpeed = readPositive(config.quansistorSeedMaxSpeed, 0.85);
        const speed = Math.hypot(cargo.dx, cargo.dy);
        if (speed > maxSpeed) {
          cargo.dx = (cargo.dx / speed) * maxSpeed;
          cargo.dy = (cargo.dy / speed) * maxSpeed;
        }
      }

      cargo.x += cargo.dx;
      cargo.y += cargo.dy;

      const dx = cargo.x - this.x;
      const dy = cargo.y - this.y;
      const dist = Math.hypot(dx, dy);
      const limit = Math.max(0, maxRadius - cargo.radius);

      if (!migratingSeed && dist > 0.0001) {
        const nx = dx / dist;
        const ny = dy / dist;
        cargo.x = this.x + nx * limit;
        cargo.y = this.y + ny * limit;

        const normalVelocity = cargo.dx * nx + cargo.dy * ny;
        cargo.dx -= normalVelocity * nx;
        cargo.dy -= normalVelocity * ny;
        cargo.angleHint = Math.atan2(ny, nx);
      } else if (!migratingSeed && limit > 0) {
        this.placeCargoNearInnerEdge(cargo, cargo.angleHint ?? Math.random() * Math.PI * 2);
      } else if (migratingSeed) {
        if (dist > limit && dist > 0.0001) {
          const nx = dx / dist;
          const ny = dy / dist;
          cargo.x = this.x + nx * limit;
          cargo.y = this.y + ny * limit;

          const normalVelocity = cargo.dx * nx + cargo.dy * ny;
          if (normalVelocity > 0) {
            cargo.dx -= normalVelocity * nx;
            cargo.dy -= normalVelocity * ny;
          }
          cargo.angleHint = Math.atan2(ny, nx);
        }

        const centerDistance = Math.hypot(cargo.x - this.x, cargo.y - this.y);
        const formationDistance = readPositive(config.quansistorFormationDistance, 2.2);
        if (centerDistance <= formationDistance || limit <= 0.0001) {
          this.finalizeQuansistorSeed(cargo);
        }
      }
    }

    this.cargoParticles = this.cargoParticles.filter(cargo => cargo.radius > 0 && !cargo.absorbed);

    for (let i = 0; i < this.cargoParticles.length; i++) {
      for (let j = i + 1; j < this.cargoParticles.length; j++) {
        const a = this.cargoParticles[i];
        const b = this.cargoParticles[j];

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minDist = a.radius + b.radius;

        if (dist >= minDist || dist <= 0.0001) continue;

        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;

        a.x -= nx * overlap * 0.5;
        a.y -= ny * overlap * 0.5;
        b.x += nx * overlap * 0.5;
        b.y += ny * overlap * 0.5;

        a.dx -= nx * 0.03;
        a.dy -= ny * 0.03;
        b.dx += nx * 0.03;
        b.dy += ny * 0.03;
      }
    }

    for (const cargo of this.cargoParticles) {
      if (this.isMigratingQuansistorSeed(cargo)) continue;
      this.placeCargoNearInnerEdge(cargo, cargo.angleHint ?? Math.random() * Math.PI * 2);
    }

    this.cargoParticles = this.cargoParticles.filter(cargo => cargo.radius > 0 && !cargo.absorbed);
  }

  findNearestDefenseTarget(enemies, macrophages, cargo = null) {
    let nearest = null;
    let nearestDist = Infinity;

    const wantsMacrophage = cargo?.sourceKind === "Macrophage" && Number.isFinite(Number(cargo?.sourceMacrophageSpriteIndex));

    if (wantsMacrophage) {
      for (const macrophage of macrophages ?? []) {
        if (!macrophage) continue;
        if (Number(macrophage.spriteIndex) !== Number(cargo.sourceMacrophageSpriteIndex)) continue;

        const dist = Math.hypot(macrophage.x - this.x, macrophage.y - this.y);
        if (dist < nearestDist) {
          nearest = macrophage;
          nearestDist = dist;
        }
      }
      return { target: nearest, distance: nearestDist };
    }

    for (const enemy of enemies ?? []) {
      if (!enemy) continue;

      const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
      if (dist < nearestDist) {
        nearest = enemy;
        nearestDist = dist;
      }
    }

    return { target: nearest, distance: nearestDist };
  }

  maybeShootAntibody(enemies, macrophages) {
    const now = performance.now();
    if (now - this.lastDefenseShotMs < config.oldbodyDefenseCooldownMs) return null;

    const cargoCandidates = [...this.cargoParticles]
      .filter(item => !this.isQuansistorSeed(item) && item.radius > config.oldbodyAntibodyCost + 0.05)
      .sort((a, b) => b.radius - a.radius);
    if (!cargoCandidates.length) return null;

    let cargo = null;
    let target = null;
    let distance = Infinity;
    for (const candidate of cargoCandidates) {
      const result = this.findNearestDefenseTarget(enemies, macrophages, candidate);
      if (result.target && result.distance <= config.oldbodyDefenseRange) {
        cargo = candidate;
        target = result.target;
        distance = result.distance;
        break;
      }
    }
    if (!cargo || !target || distance > config.oldbodyDefenseRange) return null;

    const secretionAngle =
      cargo.angleHint ??
      Math.atan2(cargo.y - this.y, cargo.x - this.x) ??
      Math.atan2(target.y - this.y, target.x - this.x);
    const launchAngle = Math.atan2(target.y - cargo.y, target.x - cargo.x);
    const spawnDistance = this.radius + config.oldbodyAntibodyRadius;
    const antibody = new Particle(
      this.x + Math.cos(secretionAngle) * spawnDistance,
      this.y + Math.sin(secretionAngle) * spawnDistance,
      config.oldbodyAntibodyRadius,
      Math.cos(launchAngle) * config.oldbodyAntibodySpeed,
      Math.sin(launchAngle) * config.oldbodyAntibodySpeed,
      "rgba(255, 70, 70, 0.95)"
    );

    antibody.isAntibody = true;
    antibody.antibodyShrink = config.oldbodyAntibodyShrink;
    antibody.antibodyFriction = config.oldbodyAntibodyFriction;
    antibody.antibodyMaxSpeed = config.oldbodyAntibodyMaxSpeed;
    antibody.antibodyHomingForce = config.oldbodyAntibodyHomingForce;
    antibody.antibodyDrift = config.oldbodyAntibodyDrift;
    antibody.antibodyTTLms = config.oldbodyAntibodyTTLms;
    antibody.spriteFolder = "Particle";
    antibody.spriteFamily = "particle";
    antibody.spriteVariant = "red";
    antibody.spriteIndex = 1;
    antibody.antibodyTargetKind = cargo.sourceKind === "Macrophage" ? "Macrophage" : "Enemy";
    antibody.antibodyTargetMacrophageSpriteIndex = cargo.sourceKind === "Macrophage"
      ? cargo.sourceMacrophageSpriteIndex
      : null;

    cargo.radius = Math.max(0, cargo.radius - config.oldbodyAntibodyCost);
    this.lastDefenseShotMs = now;

    return antibody;
  }

  draw(ctx, options = {}) {
    const { skipOverlay = false } = options;

    ctx.save();

    drawProceduralOldbodyShell(ctx, this.x, this.y, this.radius * OLDBODY_BASE_SCALE, {
      alpha: 0.94
    });

    for (const cargo of this.cargoParticles) {
      if (cargo.radius <= 0.02) continue;
      const isQuansistorSeed = this.isQuansistorSeed(cargo);

      ctx.shadowColor = isQuansistorSeed ? this.quansistorSeedGlow : this.internalParticleGlow;
      ctx.shadowBlur = isQuansistorSeed ? 14 : 10;

      const gradient = ctx.createRadialGradient(
        cargo.x - cargo.radius * 0.3,
        cargo.y - cargo.radius * 0.3,
        cargo.radius * 0.1,
        cargo.x,
        cargo.y,
        cargo.radius
      );
      gradient.addColorStop(0, isQuansistorSeed ? "rgba(236, 255, 246, 0.96)" : "rgba(255, 235, 235, 0.95)");
      gradient.addColorStop(1, isQuansistorSeed ? this.quansistorSeedColor : this.internalParticleColor);

      ctx.beginPath();
      ctx.arc(cargo.x, cargo.y, cargo.radius, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.closePath();

      if (isQuansistorSeed) {
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(cargo.x, cargo.y, Math.max(1, cargo.radius * 0.64), 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(232, 255, 246, 0.62)";
        ctx.lineWidth = Math.max(1, cargo.radius * 0.08);
        ctx.stroke();
        ctx.closePath();
      }
    }

    if (this.quansistor && !this.quansistor.removed && !this.quansistor.absorbed) {
      this.quansistor.draw(ctx);
    }

    if (!skipOverlay) {
      const overlayRadius = Math.min(
        this.radius * OLDBODY_INNER_RADIUS_RATIO,
        OLDBODY_INNER_MAX_RADIUS,
        this.radius
      );
      ctx.shadowBlur = 0;
      drawProceduralOldbodyOverlay(
        ctx,
        this.x,
        this.y,
        overlayRadius * OLDBODY_OVERLAY_SCALE,
        { alpha: 0.96 }
      );
    } else {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.closePath();
    }

    ctx.restore();
  }

  drawOverlay(ctx) {
    ctx.save();
    const overlayRadius = Math.min(
      this.radius * OLDBODY_INNER_RADIUS_RATIO,
      OLDBODY_INNER_MAX_RADIUS,
      this.radius
    );
    drawProceduralOldbodyOverlay(
      ctx,
      this.x,
      this.y,
      overlayRadius * OLDBODY_OVERLAY_SCALE,
      { alpha: 0.96 }
    );
    ctx.restore();
  }
}
