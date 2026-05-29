import { config } from "./config.js";

export const DEFAULTS = {
  minRadius: 4,
  radiusScale: 1,
  maxRadiusRatio: 1,
  followStrength: 0.18,
  radiusEase: 0.08,
  noozleMinDistanceScale: 2,
  noozleMaxDistanceScale: 4,
  noozleInitialDistanceScale: 4,
  noozleRadiusScale: 0.55,
  noozleMinRadius: 3,
  noozleFriction: 0.965,
  noozleMaxSpeed: 1.2,
  noozleWallBounce: 0.55,
  noozleBounceForce: 1,
  noozleImpulseFactor: 2,
  noozleColor: "rgba(255, 58, 72, 0.94)",
  noozleGlowColor: "rgba(255, 54, 72, 0.56)",
  noozleMiningRangePadding: 10,
  noozleMiningMagnetRangePadding: 34,
  noozleMiningMagnetStrength: 0.16,
  noozleMiningMagnetStickiness: 0.18,
  noozleMiningMagnetDrag: 0.9,
  noozleMiningMagnetVelocityCoupling: 0.16,
  noozleMiningMagnetMaxSpeed: 1.45,
  noozleMiningMagnetSurfaceGap: 1.2,
  noozleMiningRate: 0.08,
  noozleMiningMinRadius: 6,
  noozlePacketRadius: 5,
  noozlePacketSpeed: 1.8,
  noozlePacketCooldownMs: 110,
  noozlePacketMaxCount: 64,
  noozlePacketTTLms: 9000,
  noozlePacketGrowthGain: 0.35,
  noozlePacketColor: "rgba(255, 88, 74, 0.94)",
  noozlePacketGlowColor: "rgba(255, 66, 54, 0.72)",
  shellColor: "rgba(215, 228, 222, 0.40)",
  shellRimColor: "rgba(232, 255, 246, 0.58)",
  membraneColor: "rgba(154, 255, 213, 0.78)",
  coreColor: "rgba(70, 202, 170, 0.86)",
  innerColor: "rgba(224, 255, 244, 0.95)"
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function readPositive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function readRatio(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export class Quansistor {
  constructor(oldbody, seed = {}, settings = {}) {
    this.type = "Quansistor";
    this.isQuansistor = true;
    this.hostOldbody = oldbody ?? null;
    this.absorbed = false;
    this.removed = false;

    this.x = Number.isFinite(Number(seed.x)) ? Number(seed.x) : (oldbody?.x ?? 0);
    this.y = Number.isFinite(Number(seed.y)) ? Number(seed.y) : (oldbody?.y ?? 0);
    this.dx = Number.isFinite(Number(seed.dx)) ? Number(seed.dx) * 0.25 : 0;
    this.dy = Number.isFinite(Number(seed.dy)) ? Number(seed.dy) * 0.25 : 0;

    this.minRadius = readPositive(settings.minRadius ?? config.quansistorMinRadius, DEFAULTS.minRadius);
    this.radiusScale = readPositive(settings.radiusScale ?? config.quansistorRadiusScale, DEFAULTS.radiusScale);
    this.maxRadiusRatio = readRatio(settings.maxRadiusRatio ?? config.quansistorMaxRadiusRatio, DEFAULTS.maxRadiusRatio);
    this.followStrength = clamp(
      Number(settings.followStrength ?? config.quansistorFollowStrength ?? DEFAULTS.followStrength),
      0.01,
      1
    );
    this.radiusEase = clamp(
      Number(settings.radiusEase ?? config.quansistorRadiusEase ?? DEFAULTS.radiusEase),
      0.01,
      1
    );

    const seedRadius = readPositive(seed.radius, this.minRadius);
    this.coreRadius = clamp(seedRadius * this.radiusScale, this.minRadius, this.getMaxRadius());
    this.radius = this.coreRadius;
    this.targetRadius = this.coreRadius;

    this.birthMs = performance.now();
    this.pulsePhase = Math.random() * Math.PI * 2;
    this.noozles = [];
    this.arms = this.noozles;
    this.noozlePackets = [];
    this.lastBounds = null;
    this.noozleColor = settings.noozleColor ?? settings.armColor ?? DEFAULTS.noozleColor;
    this.noozleGlowColor = settings.noozleGlowColor ?? settings.armGlowColor ?? DEFAULTS.noozleGlowColor;
    this.noozlePacketColor = settings.noozlePacketColor ?? DEFAULTS.noozlePacketColor;
    this.noozlePacketGlowColor = settings.noozlePacketGlowColor ?? DEFAULTS.noozlePacketGlowColor;
    this.shellColor = settings.shellColor ?? DEFAULTS.shellColor;
    this.shellRimColor = settings.shellRimColor ?? DEFAULTS.shellRimColor;
    this.membraneColor = settings.membraneColor ?? DEFAULTS.membraneColor;
    this.coreColor = settings.coreColor ?? DEFAULTS.coreColor;
    this.innerColor = settings.innerColor ?? DEFAULTS.innerColor;
  }

  getMaxRadius(oldbody = this.hostOldbody) {
    const hostRadius = readPositive(oldbody?.radius, this.minRadius * 2);
    return Math.max(this.minRadius, hostRadius * this.maxRadiusRatio);
  }

  absorbSeed(seed = {}) {
    if (this.removed || this.absorbed) return;

    const incomingRadius = readPositive(seed.radius, this.minRadius) * this.radiusScale;
    const combined = Math.sqrt(this.coreRadius ** 2 + incomingRadius ** 2);
    this.coreRadius = clamp(combined, this.minRadius, this.getMaxRadius());
    this.radius = Math.max(this.radius, this.coreRadius);
    this.targetRadius = Math.max(this.targetRadius, this.coreRadius);
  }

  createNoozle(oldbody = this.hostOldbody, bounds = null, settings = {}) {
    const minDistanceScale = readPositive(
      settings.minDistanceScale ?? config.quansistorNoozleMinDistanceScale,
      DEFAULTS.noozleMinDistanceScale
    );
    const maxDistanceScale = readPositive(
      settings.maxDistanceScale ?? config.quansistorNoozleMaxDistanceScale,
      DEFAULTS.noozleMaxDistanceScale
    );
    const initialDistanceScale = clamp(
      readPositive(
        settings.initialDistanceScale ?? config.quansistorNoozleInitialDistanceScale,
        DEFAULTS.noozleInitialDistanceScale
      ),
      minDistanceScale,
      maxDistanceScale
    );
    const radiusScale = readPositive(
      settings.radiusScale ?? config.quansistorNoozleRadiusScale,
      DEFAULTS.noozleRadiusScale
    );
    const minRadius = readPositive(
      settings.minRadius ?? config.quansistorNoozleMinRadius,
      DEFAULTS.noozleMinRadius
    );

    if (!this.noozles.length) {
      const radius = Math.max(minRadius, (this.coreRadius ?? this.radius) * radiusScale);
      const direction = this.getCanvasOutwardDirection(bounds);
      const hostRadius = readPositive(oldbody?.radius, this.coreRadius ?? this.radius);
      const distance = hostRadius * initialDistanceScale;
      const noozle = {
        type: "Noozle",
        isQuansistorNoozle: true,
        hostQuansistor: this,
        hostOldbody: oldbody ?? null,
        x: this.x + direction.nx * distance,
        y: this.y + direction.ny * distance,
        dx: 0,
        dy: 0,
        radius,
        minDistanceScale,
        maxDistanceScale,
        radiusScale,
        minRadius,
        friction: readPositive(config.quansistorNoozleFriction, DEFAULTS.noozleFriction),
        maxSpeed: readPositive(config.quansistorNoozleMaxSpeed, DEFAULTS.noozleMaxSpeed),
        wallBounce: readPositive(config.quansistorNoozleWallBounce, DEFAULTS.noozleWallBounce),
        bounceForce: readPositive(config.quansistorNoozleBounceForce, DEFAULTS.noozleBounceForce),
        impulseFactor: readPositive(config.quansistorNoozleImpulseFactor, DEFAULTS.noozleImpulseFactor),
        color: settings.color ?? this.noozleColor,
        glowColor: settings.glowColor ?? this.noozleGlowColor,
        angle: Math.atan2(direction.ny, direction.nx),
        _getCircles() {
          return [{ cx: this.x, cy: this.y, r: this.radius }];
        },
        receiveImpulse(nx, ny, strength) {
          this.dx -= nx * strength * this.impulseFactor;
          this.dy -= ny * strength * this.impulseFactor;
        },
        receiveTorque() {}
      };
      Object.defineProperty(noozle, "mass", {
        configurable: true,
        get() {
          return Math.PI * this.radius * this.radius;
        }
      });
      this.noozles.push(noozle);
    }

    this.updateNoozles(oldbody, bounds, { integrate: false });
    return this.noozles[0];
  }

  createArm(oldbody = this.hostOldbody, bounds = null, settings = {}) {
    return this.createNoozle(oldbody, bounds, settings);
  }

  getCanvasOutwardDirection(bounds = this.lastBounds) {
    const width = Number(bounds?.width);
    const height = Number(bounds?.height);
    const centerX = Number.isFinite(width) && width > 0 ? width * 0.5 : this.x;
    const centerY = Number.isFinite(height) && height > 0 ? height * 0.5 : this.y;

    let dx = this.x - centerX;
    let dy = this.y - centerY;
    let length = Math.hypot(dx, dy);
    if (length <= 0.0001) {
      dx = Math.cos(this.pulsePhase || 0);
      dy = Math.sin(this.pulsePhase || 0);
      length = 1;
    }

    return { nx: dx / length, ny: dy / length };
  }

  getNoozleBodies() {
    return this.noozles.filter(noozle => noozle && !noozle.absorbed && !noozle.removed);
  }

  updateArmPositions(oldbody = this.hostOldbody, bounds = this.lastBounds) {
    this.updateNoozles(oldbody, bounds, { integrate: false });
  }

  translate(dx, dy) {
    if (!dx && !dy) return;
    this.x += dx;
    this.y += dy;
    for (const noozle of this.noozles) {
      noozle.x += dx;
      noozle.y += dy;
    }
    for (const packet of this.noozlePackets) {
      packet.x += dx;
      packet.y += dy;
    }
  }

  updateNoozles(oldbody = this.hostOldbody, bounds = this.lastBounds, options = {}) {
    if (!this.noozles.length || !oldbody) return;
    if (bounds) this.lastBounds = bounds;

    const integrate = options.integrate !== false;
    const complexRadius = readPositive(oldbody?.radius, this.radius ?? this.coreRadius ?? this.minRadius);

    for (const noozle of this.noozles) {
      if (!noozle || noozle.absorbed || noozle.removed) continue;

      noozle.hostOldbody = oldbody;
      noozle.hostQuansistor = this;
      noozle.radius = Math.max(
        readPositive(noozle.minRadius, DEFAULTS.noozleMinRadius),
        (this.coreRadius ?? this.radius) * readPositive(noozle.radiusScale, DEFAULTS.noozleRadiusScale)
      );

      if (integrate) {
        const friction = clamp(Number(noozle.friction ?? DEFAULTS.noozleFriction), 0, 1);
        noozle.dx *= friction;
        noozle.dy *= friction;

        const maxSpeed = readPositive(noozle.maxSpeed, DEFAULTS.noozleMaxSpeed);
        const speed = Math.hypot(noozle.dx, noozle.dy);
        if (speed > maxSpeed) {
          noozle.dx = (noozle.dx / speed) * maxSpeed;
          noozle.dy = (noozle.dy / speed) * maxSpeed;
        }

        noozle.x += noozle.dx;
        noozle.y += noozle.dy;
      }

      this.constrainNoozle(noozle, complexRadius, bounds);
    }
  }

  constrainNoozle(noozle, complexRadius = this.hostOldbody?.radius ?? this.radius, bounds = this.lastBounds) {
    if (!noozle) return;

    const baseRadius = readPositive(complexRadius, this.radius ?? this.coreRadius ?? this.minRadius);
    const minDistance = baseRadius * readPositive(noozle.minDistanceScale, DEFAULTS.noozleMinDistanceScale);
    const maxDistance = Math.max(
      minDistance,
      baseRadius * readPositive(noozle.maxDistanceScale, DEFAULTS.noozleMaxDistanceScale)
    );

    let dx = noozle.x - this.x;
    let dy = noozle.y - this.y;
    let distance = Math.hypot(dx, dy);
    if (distance <= 0.0001) {
      const direction = this.getCanvasOutwardDirection(bounds);
      dx = direction.nx;
      dy = direction.ny;
      distance = 1;
    }

    const nx = dx / distance;
    const ny = dy / distance;
    let targetDistance = distance;
    let removeVelocitySign = 0;
    if (distance < minDistance) {
      targetDistance = minDistance;
      removeVelocitySign = -1;
    } else if (distance > maxDistance) {
      targetDistance = maxDistance;
      removeVelocitySign = 1;
    }

    if (targetDistance !== distance) {
      noozle.x = this.x + nx * targetDistance;
      noozle.y = this.y + ny * targetDistance;

      const radialVelocity = noozle.dx * nx + noozle.dy * ny;
      if (
        (removeVelocitySign < 0 && radialVelocity < 0) ||
        (removeVelocitySign > 0 && radialVelocity > 0)
      ) {
        noozle.dx -= radialVelocity * nx;
        noozle.dy -= radialVelocity * ny;
      }
    }

    const width = Number(bounds?.width);
    const height = Number(bounds?.height);
    if (Number.isFinite(width) && width > 0) {
      if (noozle.x - noozle.radius < 0) {
        noozle.x = noozle.radius;
        noozle.dx = Math.abs(noozle.dx) * noozle.wallBounce;
      } else if (noozle.x + noozle.radius > width) {
        noozle.x = width - noozle.radius;
        noozle.dx = -Math.abs(noozle.dx) * noozle.wallBounce;
      }
    }
    if (Number.isFinite(height) && height > 0) {
      if (noozle.y - noozle.radius < 0) {
        noozle.y = noozle.radius;
        noozle.dy = Math.abs(noozle.dy) * noozle.wallBounce;
      } else if (noozle.y + noozle.radius > height) {
        noozle.y = height - noozle.radius;
        noozle.dy = -Math.abs(noozle.dy) * noozle.wallBounce;
      }
    }

    noozle.angle = Math.atan2(noozle.y - this.y, noozle.x - this.x);
  }

  getMiningTargetCircles(target) {
    if (!target || target.absorbed || target.removed) return [];

    if (typeof target._getCircles === "function") {
      return target._getCircles()
        .map(circle => ({
          cx: Number(circle.cx),
          cy: Number(circle.cy),
          r: Number(circle.r)
        }))
        .filter(circle =>
          Number.isFinite(circle.cx) &&
          Number.isFinite(circle.cy) &&
          Number.isFinite(circle.r) &&
          circle.r > 0
        );
    }

    if (
      Number.isFinite(Number(target.x)) &&
      Number.isFinite(Number(target.y)) &&
      Number.isFinite(Number(target.radius)) &&
      Number(target.radius) > 0
    ) {
      return [{ cx: Number(target.x), cy: Number(target.y), r: Number(target.radius) }];
    }

    return [];
  }

  getNoozleTargetGap(noozle, target) {
    if (!noozle || noozle.absorbed || noozle.removed) return null;

    let best = null;
    for (const circle of this.getMiningTargetCircles(target)) {
      const dx = noozle.x - circle.cx;
      const dy = noozle.y - circle.cy;
      const distance = Math.hypot(dx, dy);
      const gap = distance - (noozle.radius + circle.r);
      if (!best || gap < best.gap) {
        best = { target, circle, distance, gap };
      }
    }
    return best;
  }

  findNoozleMiningTarget(noozle, composedStones = [], rangePadding = null) {
    const searchPadding = Math.max(
      0,
      Number(rangePadding ?? config.quansistorNoozleMiningRangePadding ?? DEFAULTS.noozleMiningRangePadding) ||
        DEFAULTS.noozleMiningRangePadding
    );
    let best = null;
    for (const target of composedStones ?? []) {
      if (!target || target.absorbed || target.removed || target.isQuansistorNoozle) continue;

      const hit = this.getNoozleTargetGap(noozle, target);
      if (!hit || hit.gap > searchPadding) continue;
      if (!best || hit.gap < best.gap) best = hit;
    }

    return best;
  }

  releaseMiningTarget(noozle, target = noozle?.miningTarget) {
    if (!target) return;
    if (target.quansistorMiningNoozle === noozle) {
      target.quansistorMiningNoozle = null;
      target.quansistorMiningQuansistor = null;
      target.quansistorMagnetized = false;
    }
  }

  magnetizeMiningTarget(noozle, hit) {
    const target = hit?.target;
    const circle = hit?.circle;
    if (!noozle || !target || !circle || target.absorbed || target.removed) return false;

    let dx = noozle.x - circle.cx;
    let dy = noozle.y - circle.cy;
    let distance = Math.hypot(dx, dy);
    if (distance <= 0.0001) {
      dx = Math.cos(noozle.angle ?? 0);
      dy = Math.sin(noozle.angle ?? 0);
      distance = 1;
    }

    const nx = dx / distance;
    const ny = dy / distance;
    const magnetRange = Math.max(
      0.1,
      Number(config.quansistorNoozleMiningMagnetRangePadding ?? DEFAULTS.noozleMiningMagnetRangePadding) ||
        DEFAULTS.noozleMiningMagnetRangePadding
    );
    const surfaceGap = Math.max(
      0,
      Number(config.quansistorNoozleMiningMagnetSurfaceGap ?? DEFAULTS.noozleMiningMagnetSurfaceGap) ||
        DEFAULTS.noozleMiningMagnetSurfaceGap
    );
    const gap = Math.max(0, Number(hit.gap) || 0);
    const normalizedPull = clamp(1 - gap / magnetRange, 0.12, 1);
    const strength = Math.max(
      0,
      Number(config.quansistorNoozleMiningMagnetStrength ?? DEFAULTS.noozleMiningMagnetStrength) ||
        DEFAULTS.noozleMiningMagnetStrength
    );
    const stickiness = clamp(
      Number(config.quansistorNoozleMiningMagnetStickiness ?? DEFAULTS.noozleMiningMagnetStickiness) ||
        DEFAULTS.noozleMiningMagnetStickiness,
      0,
      1
    );
    const drag = clamp(
      Number(config.quansistorNoozleMiningMagnetDrag ?? DEFAULTS.noozleMiningMagnetDrag) ||
        DEFAULTS.noozleMiningMagnetDrag,
      0,
      1
    );
    const coupling = clamp(
      Number(config.quansistorNoozleMiningMagnetVelocityCoupling ?? DEFAULTS.noozleMiningMagnetVelocityCoupling) ||
        DEFAULTS.noozleMiningMagnetVelocityCoupling,
      0,
      1
    );

    target.dx = Number.isFinite(Number(target.dx)) ? Number(target.dx) : 0;
    target.dy = Number.isFinite(Number(target.dy)) ? Number(target.dy) : 0;
    target.dx = (target.dx + nx * strength * normalizedPull + (noozle.dx ?? 0) * coupling) * drag;
    target.dy = (target.dy + ny * strength * normalizedPull + (noozle.dy ?? 0) * coupling) * drag;

    const maxSpeed = readPositive(
      config.quansistorNoozleMiningMagnetMaxSpeed,
      DEFAULTS.noozleMiningMagnetMaxSpeed
    );
    const speed = Math.hypot(target.dx, target.dy);
    if (speed > maxSpeed) {
      target.dx = (target.dx / speed) * maxSpeed;
      target.dy = (target.dy / speed) * maxSpeed;
    }

    if (gap > surfaceGap) {
      const correction = Math.min(gap - surfaceGap, (gap - surfaceGap) * stickiness + strength);
      target.x += nx * correction;
      target.y += ny * correction;
    }

    if (Number.isFinite(Number(target.angularVelocity))) {
      target.angularVelocity *= 0.94;
    }
    target.quansistorMiningNoozle = noozle;
    target.quansistorMiningQuansistor = this;
    target.quansistorMagnetized = true;
    return true;
  }

  shrinkMinedComposedStone(target, amount) {
    if (!target || target.absorbed || target.removed) return 0;

    const beforeRadius = Math.max(0, Number(target.radius) || 0);
    const minRadius = readPositive(
      config.quansistorNoozleMiningMinRadius,
      DEFAULTS.noozleMiningMinRadius
    );
    if (!(beforeRadius > minRadius)) {
      target.absorbed = true;
      target.removed = true;
      return 0;
    }

    const taken = Math.min(
      readPositive(amount, DEFAULTS.noozleMiningRate),
      Math.max(0, beforeRadius - minRadius)
    );
    if (!(taken > 0)) return 0;

    const nextRadius = Math.max(minRadius, beforeRadius - taken);
    const scale = clamp(nextRadius / beforeRadius, 0.01, 1);

    if (Array.isArray(target._circles) && target._circles.length > 0) {
      for (const circle of target._circles) {
        circle.dx *= scale;
        circle.dy *= scale;
        circle.r = Math.max(0.5, circle.r * scale);
      }
    } else {
      target.radius = nextRadius;
    }

    if (Number.isFinite(Number(target.spriteScale))) {
      target.spriteScale = Math.max(0.02, Number(target.spriteScale) * scale);
    }

    if (typeof target._computeBoundingRadius === "function") {
      target.radius = Math.max(0, target._computeBoundingRadius());
    } else {
      target.radius = nextRadius;
    }
    if (typeof target._computeMass === "function") {
      target._mass = target._computeMass();
    }

    const areaGain = Math.max(0, beforeRadius ** 2 - Math.max(0, target.radius) ** 2);
    if (target.radius <= minRadius + 0.0001) {
      target.absorbed = true;
      target.removed = true;
    }

    return areaGain;
  }

  spawnNoozlePacket(noozle, areaGain = 0) {
    if (!noozle || noozle.absorbed || noozle.removed) return null;

    const packetRadius = readPositive(
      config.quansistorNoozleMiningPacketRadius,
      DEFAULTS.noozlePacketRadius
    );
    const speed = readPositive(
      config.quansistorNoozleMiningPacketSpeed,
      DEFAULTS.noozlePacketSpeed
    );

    let dx = this.x - noozle.x;
    let dy = this.y - noozle.y;
    let distance = Math.hypot(dx, dy);
    if (distance <= 0.0001) {
      dx = Math.cos(noozle.angle ?? 0);
      dy = Math.sin(noozle.angle ?? 0);
      distance = 1;
    }

    const nx = dx / distance;
    const ny = dy / distance;
    const startOffset = Math.max(packetRadius, (noozle.radius ?? 0) * 0.45);
    const packet = {
      type: "QuansistorNoozlePacket",
      isQuansistorNoozlePacket: true,
      x: noozle.x + nx * startOffset,
      y: noozle.y + ny * startOffset,
      dx: nx * speed,
      dy: ny * speed,
      radius: packetRadius,
      sourceNoozle: noozle,
      birthMs: performance.now(),
      areaGain: Math.max(packetRadius ** 2, Number(areaGain) || 0),
      color: this.noozlePacketColor,
      glowColor: this.noozlePacketGlowColor
    };

    this.noozlePackets.push(packet);
    const maxCount = Math.max(
      1,
      Math.floor(readPositive(
        config.quansistorNoozleMiningPacketMaxCount,
        DEFAULTS.noozlePacketMaxCount
      ))
    );
    while (this.noozlePackets.length > maxCount) this.noozlePackets.shift();
    return packet;
  }

  updateNoozleMining(composedStones = [], oldbody = this.hostOldbody, bounds = this.lastBounds) {
    if (!oldbody || oldbody.absorbed || oldbody.removed || !Array.isArray(composedStones)) return false;
    if (bounds) this.lastBounds = bounds;

    const mineRate = readPositive(
      config.quansistorNoozleMiningRate,
      DEFAULTS.noozleMiningRate
    );
    const rangePadding = Math.max(
      0,
      Number(config.quansistorNoozleMiningRangePadding ?? DEFAULTS.noozleMiningRangePadding) ||
        DEFAULTS.noozleMiningRangePadding
    );
    const magnetRangePadding = Math.max(
      rangePadding,
      Number(config.quansistorNoozleMiningMagnetRangePadding ?? DEFAULTS.noozleMiningMagnetRangePadding) ||
        DEFAULTS.noozleMiningMagnetRangePadding
    );
    const packetCooldownMs = readPositive(
      config.quansistorNoozleMiningPacketCooldownMs,
      DEFAULTS.noozlePacketCooldownMs
    );
    const now = performance.now();
    let minedAny = false;

    for (const noozle of this.getNoozleBodies()) {
      const previousTarget = noozle.miningTarget ?? null;
      const hit = this.findNoozleMiningTarget(noozle, composedStones, magnetRangePadding);
      if (previousTarget && previousTarget !== hit?.target) {
        this.releaseMiningTarget(noozle, previousTarget);
      }

      noozle.miningTarget = hit?.target ?? null;
      noozle.isMagnetizing = !!hit?.target;
      noozle.isMining = !!hit?.target && hit.gap <= rangePadding;

      if (!hit?.target) continue;
      this.magnetizeMiningTarget(noozle, hit);

      const miningHit = this.getNoozleTargetGap(noozle, hit.target);
      if (!miningHit || miningHit.gap > rangePadding) continue;

      noozle.isMining = true;
      const areaGain = this.shrinkMinedComposedStone(hit.target, mineRate);
      if (hit.target.absorbed || hit.target.removed) {
        this.releaseMiningTarget(noozle, hit.target);
      }
      if (!(areaGain > 0)) continue;

      minedAny = true;
      if (now - (noozle.lastMiningPacketMs ?? 0) >= packetCooldownMs) {
        this.spawnNoozlePacket(noozle, areaGain);
        noozle.lastMiningPacketMs = now;
      }
    }

    return minedAny;
  }

  updateNoozlePackets(oldbody = this.hostOldbody) {
    if (!this.noozlePackets.length) return;

    const now = performance.now();
    const speed = readPositive(
      config.quansistorNoozleMiningPacketSpeed,
      DEFAULTS.noozlePacketSpeed
    );
    const ttlMs = readPositive(
      config.quansistorNoozleMiningPacketTTLms,
      DEFAULTS.noozlePacketTTLms
    );
    const growthGain = Math.max(
      0,
      Number(config.quansistorNoozleMiningGrowthGain ?? DEFAULTS.noozlePacketGrowthGain) ||
        DEFAULTS.noozlePacketGrowthGain
    );
    const activePackets = [];

    for (const packet of this.noozlePackets) {
      if (!packet || packet.absorbed || packet.removed) continue;
      if (now - (packet.birthMs ?? now) > ttlMs) continue;

      let dx = this.x - packet.x;
      let dy = this.y - packet.y;
      const distance = Math.hypot(dx, dy);
      const absorbDistance = Math.max(this.minRadius, this.coreRadius ?? this.radius) + packet.radius;

      if (distance <= absorbDistance + 0.5) {
        this.growHostShell(oldbody, Math.max(packet.radius ** 2, packet.areaGain ?? 0), growthGain);
        packet.absorbed = true;
        continue;
      }

      if (distance > 0.0001) {
        packet.dx = (dx / distance) * speed;
        packet.dy = (dy / distance) * speed;
      }
      packet.x += packet.dx;
      packet.y += packet.dy;
      activePackets.push(packet);
    }

    this.noozlePackets = activePackets;
  }

  growHostShell(oldbody, areaGain, growthGain) {
    if (!oldbody || oldbody.absorbed || oldbody.removed || !(areaGain > 0) || !(growthGain > 0)) return;

    const hostRadius = readPositive(oldbody.radius, this.coreRadius ?? this.minRadius);
    const nextRadius = Math.sqrt(hostRadius ** 2 + areaGain * growthGain);
    oldbody.radius = Math.max(hostRadius, nextRadius);
    oldbody.nutrients = Math.max(0, Number(oldbody.nutrients) || 0) + Math.max(0, oldbody.radius - hostRadius);
    oldbody.maxNutrients = Math.max(Number(oldbody.maxNutrients) || 0, oldbody.nutrients);
    this.updateArmPositions(oldbody, this.lastBounds);
  }

  canAbsorbParticle(particle) {
    if (!particle || particle.absorbed || particle.removed) return false;
    if (!particle.isCell || particle.isPlayer || particle.isProjectile || particle.isAntibody) return false;
    if (particle.isDividing || particle.absorbingPlayer || particle.capturedPlayer) return false;

    const maxRadius = readPositive(config.quansistorParticleMaxRadius, 12);
    return particle.radius <= maxRadius;
  }

  absorbParticleStep(particle, oldbody = this.hostOldbody) {
    if (!this.canAbsorbParticle(particle) || !oldbody || oldbody.absorbed || oldbody.removed) {
      this.releaseParticle(particle);
      return false;
    }

    particle.quansistorAbsorbing = this;
    particle.quansistorAbsorbingOldbody = oldbody;

    const hostRadius = readPositive(oldbody.radius, this.radius);
    let dx = particle.x - oldbody.x;
    let dy = particle.y - oldbody.y;
    let dist = Math.hypot(dx, dy);
    if (dist <= 0.0001) {
      const fallbackAngle = Math.atan2(particle.y - this.y, particle.x - this.x);
      dx = Math.cos(Number.isFinite(fallbackAngle) ? fallbackAngle : 0);
      dy = Math.sin(Number.isFinite(fallbackAngle) ? fallbackAngle : 0);
      dist = 1;
    }

    const nx = dx / dist;
    const ny = dy / dist;
    const rangePadding = Math.max(0, Number(config.quansistorParticleRangePadding) || 0);
    const shellDistance = hostRadius + particle.radius;
    const surfaceGap = dist - shellDistance;

    if (surfaceGap > rangePadding + 2) {
      this.releaseParticle(particle);
      return false;
    }

    const pull = Math.max(0, Number(config.quansistorParticlePull) || 0);
    const drag = clamp(Number(config.quansistorParticleDrag ?? 0.86), 0, 1);
    const contactX = oldbody.x + nx * shellDistance;
    const contactY = oldbody.y + ny * shellDistance;
    const toContactX = contactX - particle.x;
    const toContactY = contactY - particle.y;
    const contactDistance = Math.hypot(toContactX, toContactY);

    if (contactDistance > 0.75) {
      particle.dx = (particle.dx + (toContactX / contactDistance) * pull) * drag;
      particle.dy = (particle.dy + (toContactY / contactDistance) * pull) * drag;
      return true;
    }

    particle.x = contactX;
    particle.y = contactY;

    const radialVelocity = particle.dx * nx + particle.dy * ny;
    if (radialVelocity < 0) {
      particle.dx -= radialVelocity * nx;
      particle.dy -= radialVelocity * ny;
    }
    particle.dx *= drag;
    particle.dy *= drag;

    const oldRadius = Math.max(0, particle.radius);
    const taken = Math.min(readPositive(config.quansistorParticleAbsorbRate, 0.1), oldRadius);
    const newParticleRadius = Math.max(0, oldRadius - taken);
    const areaGain = Math.max(0, oldRadius ** 2 - newParticleRadius ** 2);
    const growthGain = Math.max(0, Number(config.quansistorParticleGrowthGain) || 0);

    this.growHostShell(oldbody, areaGain, growthGain);
    particle.radius = newParticleRadius;
    particle.prevRadius = particle.radius;

    const nextHostRadius = readPositive(oldbody.radius, hostRadius);
    const nextShellDistance = nextHostRadius + Math.max(particle.radius, 0);
    particle.x = oldbody.x + nx * nextShellDistance;
    particle.y = oldbody.y + ny * nextShellDistance;

    const minParticleRadius = Math.max(0, Number(config.quansistorParticleMinRadius) || 0);
    if (particle.radius <= minParticleRadius) {
      const finalAreaGain = Math.max(0, particle.radius ** 2) * growthGain;
      if (finalAreaGain > 0) {
        this.growHostShell(oldbody, finalAreaGain, 1);
      }
      particle.absorbed = true;
      this.releaseParticle(particle);
    }

    return true;
  }

  releaseParticle(particle) {
    if (!particle) return;
    if (particle.quansistorAbsorbing === this) {
      particle.quansistorAbsorbing = null;
      particle.quansistorAbsorbingOldbody = null;
    }
  }

  canAbsorbOldbody(target) {
    if (!target || target === this.hostOldbody || target.absorbed || target.removed) return false;
    if (target.quansistor && !target.quansistor.absorbed && !target.quansistor.removed) return false;
    if (typeof target.isQuansistorSeed === "function") {
      const hasSeed = (target.cargoParticles ?? []).some(cargo => target.isQuansistorSeed(cargo));
      if (hasSeed) return false;
    }
    return Array.isArray(target.cargoParticles);
  }

  absorbOldbodyStep(target, oldbody = this.hostOldbody) {
    if (!this.canAbsorbOldbody(target) || !oldbody || oldbody.absorbed || oldbody.removed) {
      this.releaseOldbody(target);
      return false;
    }

    target.quansistorResorbing = this;
    target.quansistorResorbingOldbody = oldbody;

    const hostRadius = readPositive(oldbody.radius, this.radius);
    let dx = target.x - oldbody.x;
    let dy = target.y - oldbody.y;
    let dist = Math.hypot(dx, dy);
    if (dist <= 0.0001) {
      dx = 1;
      dy = 0;
      dist = 1;
    }

    const nx = dx / dist;
    const ny = dy / dist;
    const rangePadding = Math.max(0, Number(config.quansistorOldbodyRangePadding) || 0);
    const targetRadius = Math.max(0, Number(target.radius) || 0);
    const shellDistance = hostRadius + targetRadius;
    const surfaceGap = dist - shellDistance;

    if (surfaceGap > rangePadding + 2) {
      this.releaseOldbody(target);
      return false;
    }

    const pull = Math.max(0, Number(config.quansistorOldbodyPull) || 0);
    const drag = clamp(Number(config.quansistorOldbodyDrag ?? 0.9), 0, 1);
    const contactX = oldbody.x + nx * shellDistance;
    const contactY = oldbody.y + ny * shellDistance;
    const toContactX = contactX - target.x;
    const toContactY = contactY - target.y;
    const contactDistance = Math.hypot(toContactX, toContactY);

    if (contactDistance > 0.75) {
      target.dx = (target.dx + (toContactX / contactDistance) * pull) * drag;
      target.dy = (target.dy + (toContactY / contactDistance) * pull) * drag;
      return true;
    }

    target.x = contactX;
    target.y = contactY;

    const radialVelocity = target.dx * nx + target.dy * ny;
    if (radialVelocity < 0) {
      target.dx -= radialVelocity * nx;
      target.dy -= radialVelocity * ny;
    }
    target.dx *= drag;
    target.dy *= drag;

    const minRadius = readPositive(config.quansistorOldbodyMinRadius, 6);
    const oldRadius = Math.max(minRadius, targetRadius);
    const taken = Math.min(readPositive(config.quansistorOldbodyAbsorbRate, 0.055), Math.max(0, oldRadius - minRadius));

    if (!(taken > 0)) {
      target.radius = minRadius;
      target.absorbed = true;
      target.removed = true;
      this.releaseOldbody(target);
      return true;
    }

    const newRadius = Math.max(minRadius, oldRadius - taken);
    const areaGain = Math.max(0, oldRadius ** 2 - newRadius ** 2);
    const growthGain = Math.max(0, Number(config.quansistorOldbodyGrowthGain) || 0);

    this.growHostShell(oldbody, areaGain, growthGain);

    target.radius = newRadius;
    if (Number.isFinite(Number(target.nutrients))) {
      target.nutrients = Math.max(0, target.nutrients - taken);
    }

    for (const cargo of target.cargoParticles ?? []) {
      if (typeof target.isMigratingQuansistorSeed === "function" && target.isMigratingQuansistorSeed(cargo)) continue;
      if (typeof target.placeCargoNearInnerEdge === "function") {
        target.placeCargoNearInnerEdge(cargo, cargo.angleHint ?? Math.random() * Math.PI * 2);
      }
    }

    const nextHostRadius = readPositive(oldbody.radius, hostRadius);
    const nextShellDistance = nextHostRadius + target.radius;
    target.x = oldbody.x + nx * nextShellDistance;
    target.y = oldbody.y + ny * nextShellDistance;

    if (target.radius <= minRadius + 0.0001) {
      target.radius = minRadius;
      target.cargoParticles = [];
      target.absorbed = true;
      target.removed = true;
      this.releaseOldbody(target);
    }

    return true;
  }

  releaseOldbody(target) {
    if (!target) return;
    if (target.quansistorResorbing === this) {
      target.quansistorResorbing = null;
      target.quansistorResorbingOldbody = null;
    }
  }

  update(oldbody = this.hostOldbody, bounds = this.lastBounds) {
    if (!oldbody || oldbody.absorbed || oldbody.removed) {
      this.removed = true;
      this.absorbed = true;
      return;
    }

    if (bounds) this.lastBounds = bounds;
    this.hostOldbody = oldbody;
    const prevX = this.x;
    const prevY = this.y;
    const targetX = oldbody.x;
    const targetY = oldbody.y;
    const pullX = (targetX - this.x) * this.followStrength;
    const pullY = (targetY - this.y) * this.followStrength;

    this.dx = (this.dx + pullX) * 0.78;
    this.dy = (this.dy + pullY) * 0.78;
    this.x += this.dx;
    this.y += this.dy;
    const shiftX = this.x - prevX;
    const shiftY = this.y - prevY;
    for (const noozle of this.noozles) {
      noozle.x += shiftX;
      noozle.y += shiftY;
    }
    for (const packet of this.noozlePackets) {
      packet.x += shiftX;
      packet.y += shiftY;
    }

    const coreRadius = this.coreRadius ?? this.minRadius;
    const maxRadius = Math.max(coreRadius, this.getMaxRadius(oldbody));
    this.targetRadius = clamp(this.targetRadius, coreRadius, maxRadius);
    this.radius += (this.targetRadius - this.radius) * this.radiusEase;
    this.radius = Math.max(coreRadius, this.radius);
    this.updateNoozles(oldbody, bounds, { integrate: true });
    this.updateNoozlePackets(oldbody);
  }

  draw(ctx) {
    if (this.removed || this.absorbed || this.radius <= 0) return;

    const t = (performance.now() - this.birthMs) * 0.001;
    const pulse = Math.sin(t * 2.2 + this.pulsePhase) * 0.5 + 0.5;
    const outerR = this.radius * (1 + (pulse - 0.5) * 0.025);
    const coreR = Math.min(
      this.coreRadius ?? this.radius,
      Math.max(this.minRadius, outerR)
    ) * (1 + (pulse - 0.5) * 0.035);

    ctx.save();
    ctx.globalAlpha *= 0.96;
    ctx.shadowColor = "rgba(114, 255, 211, 0.38)";
    ctx.shadowBlur = 12 + outerR * 0.35;

    for (const noozle of this.noozles) {
      if (!noozle || !(noozle.radius > 0)) continue;

      const noozlePulse = 1 + (pulse - 0.5) * 0.08;
      const noozleRadius = noozle.radius * noozlePulse;
      ctx.save();
      ctx.shadowColor = noozle.glowColor ?? this.noozleGlowColor;
      ctx.shadowBlur = 10 + noozleRadius * 0.9;
      ctx.beginPath();
      ctx.arc(noozle.x, noozle.y, noozleRadius, 0, Math.PI * 2);
      ctx.strokeStyle = noozle.color ?? this.noozleColor;
      ctx.lineWidth = Math.max(2, noozleRadius * 0.18);
      ctx.stroke();
      ctx.closePath();

      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(noozle.x, noozle.y, noozleRadius * 0.68, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 226, 230, 0.72)";
      ctx.lineWidth = Math.max(1, noozleRadius * 0.08);
      ctx.stroke();
      ctx.closePath();
      ctx.restore();
    }

    if (outerR > coreR + 0.35) {
      const shellGradient = ctx.createRadialGradient(
        this.x - outerR * 0.24,
        this.y - outerR * 0.28,
        coreR * 0.4,
        this.x,
        this.y,
        outerR
      );
      shellGradient.addColorStop(0, "rgba(230, 255, 246, 0.06)");
      shellGradient.addColorStop(0.58, this.shellColor);
      shellGradient.addColorStop(1, "rgba(118, 138, 132, 0.52)");

      ctx.beginPath();
      ctx.ellipse(
        this.x,
        this.y,
        outerR * 1.08,
        outerR * 0.92,
        Math.sin(t * 0.22) * 0.16,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = shellGradient;
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(1.1, outerR * 0.045);
      ctx.strokeStyle = this.shellRimColor;
      ctx.stroke();

      ctx.globalAlpha *= 0.34;
      ctx.lineCap = "round";
      for (let i = 0; i < 8; i++) {
        const a = this.pulsePhase * 0.4 + t * 0.08 + i * (Math.PI * 2 / 8);
        ctx.beginPath();
        ctx.moveTo(
          this.x + Math.cos(a) * coreR * 1.04,
          this.y + Math.sin(a) * coreR * 0.84
        );
        ctx.quadraticCurveTo(
          this.x + Math.cos(a + 0.55) * outerR * 0.72,
          this.y + Math.sin(a - 0.24) * outerR * 0.48,
          this.x + Math.cos(a + 0.16) * outerR * 0.96,
          this.y + Math.sin(a + 0.16) * outerR * 0.78
        );
        ctx.strokeStyle = i % 2 === 0
          ? "rgba(244, 255, 250, 0.38)"
          : "rgba(136, 170, 162, 0.28)";
        ctx.lineWidth = Math.max(0.7, outerR * 0.03);
        ctx.stroke();
      }
      ctx.globalAlpha /= 0.34;
      ctx.shadowColor = "rgba(114, 255, 211, 0.42)";
      ctx.shadowBlur = 10 + coreR * 0.38;
    }

    for (const packet of this.noozlePackets) {
      if (!packet || !(packet.radius > 0)) continue;

      const packetPulse = 1 + (pulse - 0.5) * 0.1;
      const packetRadius = packet.radius * packetPulse;
      ctx.save();
      ctx.globalAlpha *= 0.92;
      ctx.shadowColor = packet.glowColor ?? this.noozlePacketGlowColor;
      ctx.shadowBlur = 8 + packetRadius * 1.4;
      ctx.beginPath();
      ctx.arc(packet.x, packet.y, packetRadius, 0, Math.PI * 2);
      ctx.fillStyle = packet.color ?? this.noozlePacketColor;
      ctx.fill();
      ctx.closePath();

      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(packet.x - packetRadius * 0.22, packet.y - packetRadius * 0.24, Math.max(1, packetRadius * 0.28), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 244, 230, 0.72)";
      ctx.fill();
      ctx.closePath();
      ctx.restore();
    }

    const gradient = ctx.createRadialGradient(
      this.x - coreR * 0.28,
      this.y - coreR * 0.32,
      coreR * 0.08,
      this.x,
      this.y,
      coreR
    );
    gradient.addColorStop(0, this.innerColor);
    gradient.addColorStop(0.42, this.membraneColor);
    gradient.addColorStop(0.78, this.coreColor);
    gradient.addColorStop(1, "rgba(26, 92, 88, 0.72)");

    ctx.beginPath();
    ctx.ellipse(this.x, this.y, coreR * 1.08, coreR * 0.92, Math.sin(t * 0.4) * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(1.3, coreR * 0.08);
    ctx.strokeStyle = "rgba(230, 255, 246, 0.72)";
    ctx.stroke();

    ctx.globalAlpha *= 0.56;
    ctx.lineCap = "round";
    for (let i = 0; i < 6; i++) {
      const a = this.pulsePhase + t * 0.18 + i * (Math.PI * 2 / 6);
      const inner = coreR * (0.18 + (i % 2) * 0.04);
      const outer = coreR * (0.56 + (i % 3) * 0.06);
      ctx.beginPath();
      ctx.moveTo(this.x + Math.cos(a) * inner, this.y + Math.sin(a) * inner * 0.75);
      ctx.quadraticCurveTo(
        this.x + Math.cos(a + 0.65) * coreR * 0.35,
        this.y + Math.sin(a - 0.35) * coreR * 0.28,
        this.x + Math.cos(a + 0.22) * outer,
        this.y + Math.sin(a + 0.22) * outer * 0.78
      );
      ctx.strokeStyle = i % 2 === 0
        ? "rgba(236, 255, 247, 0.68)"
        : "rgba(72, 255, 198, 0.48)";
      ctx.lineWidth = Math.max(0.8, coreR * 0.045);
      ctx.stroke();
    }

    ctx.globalAlpha *= 0.62;
    ctx.beginPath();
    ctx.arc(this.x + coreR * 0.18, this.y - coreR * 0.12, Math.max(1, coreR * 0.16), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(245, 255, 250, 0.74)";
    ctx.fill();

    ctx.restore();
  }
}
