import { approachAngle, wrapAngle, makeTintGreen, makeTintRed } from "./utils.js";
import { Particle } from "./Particle.js";
import { Projectile, DEFAULTS as ProjectileDefaults } from "./Projectile.js";
import { Egg } from "./Egg.js";
import { getSequenceImage, normalizeSpriteIndex } from "./spriteAssets.js";

export const DEFAULTS = {
  count:  1,
  radius: 38,
  color:  "rgba(170, 80, 255, 0.75)",

  // mouth
  mouthAbsorbRadius:    22,
  mouthTurnRate:        0.05,
  mouthTurnEnabled:     true,
  mouthIdleSpin:        0.01,
  mouthRotationEnabled: true,
  mouthRotationDir:     1,
  mouthRotationRange:   [-30, 30],
  mouthCiliaEnabled:    true,
  mouthCiliaCount:      22,
  mouthCiliaLengthScale: 0.20,
  mouthCiliaWaveAmount: 0.55,
  mouthCiliaWaveSpeed:  0.003,
  mouthCiliaCurl:       0.10,
  mouthCiliaLineWidth:  1.3,
  mouthCiliaAlpha:      1,
  mouthCiliaArcEnabled: false,
  mouthCiliaArcCenterDeg: 0,
  mouthCiliaArcSpreadDeg: 120,

  // body spline cilia
  bodyCiliaEnabled:     false,
  bodyCiliaCount:       96,
  bodyCiliaLengthScale: 0.16,
  bodyCiliaWaveAmount:  0.55,
  bodyCiliaWaveSpeed:   0.0025,
  bodyCiliaCurl:        0.08,
  bodyCiliaLineWidth:   1.1,
  bodyCiliaAlpha:       0.82,
  bodyCiliaSplineOffset: 3,
  bodyCiliaSplineSamples: 96,
  bodyCiliaSegments: [{ enabled: true, start: 0, end: 1 }],

  // body rotation
  bodyRotationEnabled:  false,
  bodyRotationIdleSpin: 0,
  bodyRotationIdleWaveEnabled: false,
  bodyRotationIdleWaveAmount: 0.35,
  bodyRotationIdleWaveSpeedHz: 0.45,
  bodyRotationMode:     "pingpong",
  bodyRotationDir:      1,
  bodyRotationBaseAngleDeg: 0,
  bodyRotationRange:    [-12, 12],
  bodyRotationMovementFollowEnabled: false,
  bodyRotationMovementFollowStrength: 0.35,
  bodyRotationMovementFollowSmoothing: 0.08,
  bodyRotationMovementFollowMinSpeed: 0.18,
  bodyPivotDx:          0,
  bodyPivotDy:          0,
  bodyPivotRadius:      12,

  // orbit
  orbitEnabled:         false,
  orbitMode:            "orbit",
  orbitCenterDx:        0,
  orbitCenterDy:        0,
  orbitRadius:          0,
  orbitSpeed:           0,
  orbitPhaseDeg:        null,
  freeMoveDirectionDeg: 0,
  freeMoveSpreadDeg:    70,
  freeMovePreviewRadius: 140,
  freeMoveImpulse:      0.55,
  freeMoveIntervalMs:   1200,
  freeMoveIntervalMinMs: 1200,
  freeMoveIntervalMaxMs: 1200,
  freeMoveTurnAngleMinDeg: 0,
  freeMoveTurnAngleMaxDeg: 0,
  freeMoveVelocityDamping: 0.965,
  freeMoveMaxSpeed:     1.4,

  // absorb targets
  absorbParticle:       true,
  absorbProjectile:     false,
  absorbPlayer:         true,
  absorbEnemy:          false,

  // sprite / animation
  instanceIndex:        1,
  spriteIndex:          1,
  spriteAnimationEnabled: true,
  spriteAnimationFolder: "Macrophage",
  spriteAnimationSubfolder: null,
  spriteAnimationFrames: 5,
  spriteAnimationStart: 1,
  spriteAnimationFps: 12,
  spriteAnimationMode: "loop",
  spriteAnimationPadding: 5,
  spriteAnimationExt: "png",
  spriteScale:          1.18,
  spriteRotationOffset: 0,
  spriteBodyU:          0.5,
  spriteBodyV:          0.5,
  spriteFlipX:          false,
  spriteAlpha:          0.9,
  spriteDebug:          false,

  // spawn distances
  minSpawnDistanceFromPlayer: 260,
  minSpawnDistanceFromEnemy:  180,
  minSpawnDistanceFromOthers: 120,

  // physics
  bounceForce:   0.8,
  wallBounce:    0.55,

  // digestion
  absorbRate:    0.35,
  pullStrength:  1.2,
  absorbFriction: 0.85,

  // macronucleus bead chain
  maxBeads:              7,
  gitParticleRadius:     4.75,
  beadGrowDurationMs:    220,
  beadDriftSpeed:        0.0008,
  excretionGrowRate:     0.05,
  excretionTargetRadius: 12,
  eggSpawnFeedCount:     6,
  germinationEnabled:    false,
  germinationFeedCount:  10,
  germinationStartScale: 0.34,
  germinationGrowthRate: 0.08,
  germinationDetachScale: 0.6,
  germinationLaunchSpeed: 0.35,
  germinationMirrorOffspringX: false,
  germinationLaunchJitter: 0.18,
  germinationInitialAngleJitterDeg: 8,
  germinationMouthWakeDelayMs: 260,
  projectileSpawnBodyCircleIndex: 0,
  projectileSpawnAngleDeg: 180,
  growthEnabled:         false,
  growthPerAbsorb:       0.6,
  growthMaxRadius:       76,
  growthRate:            0.03,
  capturedPlayerReleaseRadius: 3,
  capturedPlayerReleaseSpeed: 1.15,
};

function makeDefaultOrbitSplinePoints(radius = DEFAULTS.orbitRadius || DEFAULTS.radius * 2.4) {
  const r = Math.max(24, Number(radius) || DEFAULTS.radius * 2.4);
  return [
    { dx: 0, dy: -r },
    { dx: r, dy: 0 },
    { dx: 0, dy: r },
    { dx: -r, dy: 0 }
  ];
}

const BODY_ROTATION_IDLE_SPIN_SCALE = 0.01;
const MOTION_RELEASE_MIN_SPEED = 0.12;
const MOTION_RELEASE_BASE_SPEED = 0.2;
const MOTION_RELEASE_VELOCITY_CARRY = 0.18;
const MOTION_RELEASE_SURFACE_OFFSET = 1.2;
const MOTION_RELEASE_INTERVAL_MS = 280;

function normalizeBodyRotationRange(range, baseAngleDeg = 0, fallback = DEFAULTS.bodyRotationRange) {
  const source = Array.isArray(range) && range.length === 2 ? range : fallback;
  let a = Number(source[0]);
  let b = Number(source[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    a = fallback[0];
    b = fallback[1];
  }
  if (a > b) [a, b] = [b, a];
  const base = Number(baseAngleDeg) || 0;
  const crossesZero = a <= 0 && b >= 0;
  if (Math.abs(base) > 0.0001 && !crossesZero && Math.sign(a || 0) === Math.sign(b || 0)) {
    const mid = (a + b) * 0.5;
    a -= mid;
    b -= mid;
    if (a > b) [a, b] = [b, a];
  }
  return [a, b];
}

function getMacrophageSpriteFolderName(spriteIndex, preferredSubfolder = null) {
  if (preferredSubfolder != null && String(preferredSubfolder).trim()) {
    return String(preferredSubfolder).trim();
  }

  return `Macrophage_${String(normalizeSpriteIndex(spriteIndex, 1)).padStart(2, "0")}`;
}

function cubicBezierPoint(p0, p1, p2, p3, t) {
  const inv = 1 - t;
  const a = inv * inv * inv;
  const b = 3 * inv * inv * t;
  const c = 3 * inv * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y
  };
}

function normalizeDigestControlKeyOrder(a, b) {
  const ai = Number(String(a).slice(1)) || 0;
  const bi = Number(String(b).slice(1)) || 0;
  return ai - bi;
}

function getDigestPathPointKeys(path) {
  const controlKeys = Object.keys(path ?? {})
    .filter(key => /^c\d+$/.test(key))
    .sort(normalizeDigestControlKeyOrder);
  return ["start", ...controlKeys, "end"];
}

function bezierPoint(points, t) {
  const safePoints = Array.isArray(points) ? points.filter(Boolean) : [];
  if (safePoints.length === 0) return { x: 0, y: 0 };
  if (safePoints.length === 1) return { x: safePoints[0].x, y: safePoints[0].y };
  let current = safePoints.map(point => ({ x: point.x, y: point.y }));
  const clampedT = Math.max(0, Math.min(1, Number(t) || 0));
  while (current.length > 1) {
    const next = [];
    for (let i = 0; i < current.length - 1; i++) {
      next.push({
        x: current[i].x + (current[i + 1].x - current[i].x) * clampedT,
        y: current[i].y + (current[i + 1].y - current[i].y) * clampedT
      });
    }
    current = next;
  }
  return current[0];
}

function catmullRomPoint(p0, p1, p2, p3, t) {
  const tt = t * t;
  const ttt = tt * t;
  return {
    x: 0.5 * (
      (2 * p1.x) +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * tt +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * ttt
    ),
    y: 0.5 * (
      (2 * p1.y) +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * tt +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * ttt
    )
  };
}

function sampleClosedCatmullRom(points, t) {
  const safePoints = Array.isArray(points) ? points.filter(Boolean) : [];
  const count = safePoints.length;
  if (count === 0) return { x: 0, y: 0 };
  if (count === 1) return { x: safePoints[0].x, y: safePoints[0].y };
  if (count === 2) {
    const clampedT = ((Number(t) || 0) % 1 + 1) % 1;
    return {
      x: safePoints[0].x + (safePoints[1].x - safePoints[0].x) * clampedT,
      y: safePoints[0].y + (safePoints[1].y - safePoints[0].y) * clampedT
    };
  }
  const wrappedT = ((Number(t) || 0) % 1 + 1) % 1;
  const scaled = wrappedT * count;
  const index = Math.floor(scaled) % count;
  const localT = scaled - Math.floor(scaled);
  const p0 = safePoints[(index - 1 + count) % count];
  const p1 = safePoints[index % count];
  const p2 = safePoints[(index + 1) % count];
  const p3 = safePoints[(index + 2) % count];
  return catmullRomPoint(p0, p1, p2, p3, localT);
}

function approximateClosedSplineLength(points, samples = 96) {
  const safePoints = Array.isArray(points) ? points.filter(Boolean) : [];
  if (safePoints.length <= 1) return 0;
  let total = 0;
  let prev = sampleClosedCatmullRom(safePoints, 0);
  for (let i = 1; i <= samples; i++) {
    const curr = sampleClosedCatmullRom(safePoints, i / samples);
    total += Math.hypot(curr.x - prev.x, curr.y - prev.y);
    prev = curr;
  }
  return total;
}

function degToRad(deg) {
  return (Number(deg) || 0) * Math.PI / 180;
}

function normalizeSignedDeg(deg) {
  let value = Number(deg) || 0;
  value = ((value + 180) % 360 + 360) % 360 - 180;
  return value;
}

function mirrorAbsDeg(value) {
  return normalizeSignedDeg(180 - (Number(value) || 0));
}

function mirrorRelativeDeg(value) {
  return normalizeSignedDeg(-(Number(value) || 0));
}

function mirrorRelativeRangeDeg(range, fallback = [-30, 30]) {
  const source = Array.isArray(range) && range.length === 2 ? range : fallback;
  const a = -(Number(source[1]) || 0);
  const b = -(Number(source[0]) || 0);
  return [Math.min(a, b), Math.max(a, b)];
}

function mirrorHorizontalOffsets(items, key = "dx") {
  if (!Array.isArray(items)) return items;
  return items.map(item => ({ ...item, [key]: -(Number(item?.[key] ?? 0) || 0) }));
}

function mirrorOffsetsAroundPivot(items, pivotValue = 0, key = "dy") {
  if (!Array.isArray(items)) return items;
  const pivot = Number(pivotValue) || 0;
  return items.map(item => ({
    ...item,
    [key]: pivot * 2 - (Number(item?.[key] ?? 0) || 0)
  }));
}

function mirrorDigestPath(path, pivotDy = 0) {
  if (!path || typeof path !== "object") return path;
  const pivot = Number(pivotDy) || 0;
  return Object.fromEntries(
    Object.entries(path).map(([key, point]) => [
      key,
      point && typeof point === "object"
        ? { ...point, dy: pivot * 2 - (Number(point.dy ?? 0) || 0) }
        : point
    ])
  );
}

function normalizePositiveAngle(rad) {
  const twoPi = Math.PI * 2;
  let value = Number(rad) || 0;
  value %= twoPi;
  if (value < 0) value += twoPi;
  return value;
}

function angularDistanceAlongDirection(from, to, dir = 1) {
  const a = normalizePositiveAngle(from);
  const b = normalizePositiveAngle(to);
  return dir >= 0
    ? (b - a + Math.PI * 2) % (Math.PI * 2)
    : (a - b + Math.PI * 2) % (Math.PI * 2);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resolveSequenceFrameIndex(start, frameCount, mode, now, fps, phaseMs = 0) {
  const safeCount = Math.max(1, Math.round(Number(frameCount) || 1));
  const safeStart = normalizeSpriteIndex(start, 1);
  const safeFps = Math.max(1, Number(fps) || 1);
  const frameDurationMs = 1000 / safeFps;
  const tick = Math.floor((now + phaseMs) / frameDurationMs);

  if (mode === "pingpong" && safeCount > 1) {
    const cycleLength = safeCount * 2 - 2;
    const cycleIndex = ((tick % cycleLength) + cycleLength) % cycleLength;
    const frameOffset = cycleIndex < safeCount
      ? cycleIndex
      : cycleLength - cycleIndex;
    return safeStart + frameOffset;
  }

  return safeStart + ((((tick % safeCount) + safeCount) % safeCount));
}

function makeDefaultBodyCircles(radius = DEFAULTS.radius) {
  const r = Math.max(5, Number(radius) || DEFAULTS.radius);
  return [
    { dx: 0, dy: 0, r },
    { dx: -r * 0.52, dy: r * 0.18, r: r * 0.56 },
    { dx: r * 0.5, dy: r * 0.24, r: r * 0.52 },
    { dx: 0, dy: r * 0.7, r: r * 0.46 }
  ];
}

/**
 * Macrophage — stationary ciliate (round body).
 * Supports per-instance mouth config overrides via mouthSettings:
 * { enabled, turnEnabled, absorbRadius, offsetDistance, turnRate, idleSpin, rotationDir, rotationRange }
 * Supports per-instance digest path overrides via digestPath:
 * { start:{dx,dy}, c1:{dx,dy}, c2:{dx,dy}, ..., end:{dx,dy} }
 */
export class Macrophage {
  constructor(
    x,
    y,
    radius       = DEFAULTS.radius,
    color        = DEFAULTS.color,
    bodyCirclesOrMouthSettings = null,
    mouthSettings = null,
    digestPath = null,
    bodyRotationSettings = null,
    spriteSettings = null,
    orbitSettings = null,
    absorbTargetSettings = null,
    eggSpawnSettings = null,
    germinationSettings = null,
    projectileSpawnSettings = null,
    growthSettings = null,
    bodyCiliaSettings = null
  ) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.color  = color;

    this.dx = 0;
    this.dy = 0;
    this._spawnX = x;
    this._spawnY = y;

    this.angle       = 0;
    this._spawnAngle = 0;
    this.targetAngle = 0;

    this.absorbing = null;
    this.capturedPlayer = null;
    this.capturedPlayerDigestState = null;

    const explicitBodyCircles = Array.isArray(bodyCirclesOrMouthSettings)
      ? bodyCirclesOrMouthSettings
      : null;
    const explicitMouthSettings = explicitBodyCircles
      ? mouthSettings
      : bodyCirclesOrMouthSettings;

    this.bodyCircles = this._normalizeBodyCircles(explicitBodyCircles);
    this._syncRadiusFromBody();

    this.gitBeads        = [];
    this.excretionActive = false;
    this.excretionRadius = 0;
    this.excretionQueue  = 0;

    // per-instance tunable physics
    this.bounceForce = DEFAULTS.bounceForce;
    this.wallBounce  = DEFAULTS.wallBounce;

    this.mouth = this._normalizeMouthSettings(explicitMouthSettings);
    this.bodyCilia = this._normalizeBodyCiliaSettings(bodyCiliaSettings);
    this.digestPath = this._normalizeDigestPath(digestPath);
    this.bodyRotation = this._normalizeBodyRotationSettings(bodyRotationSettings);
    this._idleDirFlip = 1;
    this._bodyIdleDirFlip = 1;
    this._bodyAngleOffset = 0;
    this._bodyMovementFollowOffset = 0;
    this.animationPhaseMs = Math.random() * 1000;
    this.spriteCfg = { ...DEFAULTS, ...(spriteSettings ?? {}) };
    this.instanceIndex = Math.max(1, Math.round(Number(this.spriteCfg.instanceIndex ?? DEFAULTS.instanceIndex) || DEFAULTS.instanceIndex));
    this.spriteIndex = normalizeSpriteIndex(this.spriteCfg.spriteIndex ?? this.instanceIndex ?? DEFAULTS.spriteIndex);
    this._lastRenderableSpriteImage = null;
    this._rebuildSpriteConfig();
    this.orbit = this._normalizeOrbitSettings(orbitSettings);
    this._orbitSegmentIndex = 0;
    this._orbitSplineT = 0;
    this._freeMoveHeadingOffsetRad = 0;
    this._lastFreeMoveImpulseMs = performance.now() - Math.random() * this._freeMoveSampleIntervalMs();
    this._nextFreeMoveImpulseMs = performance.now() + this._freeMoveSampleIntervalMs();
    this._nextMotionReleaseAtMs = performance.now() + this._motionReleaseIntervalMs() * (0.35 + Math.random() * 0.65);
    this._orbitAngle = this._resolveInitialOrbitAngle();
    if (this._orbitEnabled() && this._orbitMode() !== "free") {
      this._updateOrbitPosition();
    }
    this.absorbTargets = this._normalizeAbsorbTargetSettings(absorbTargetSettings);
    this.eggSpawn = this._normalizeEggSpawnSettings(eggSpawnSettings);
    this.germination = this._normalizeGerminationSettings(germinationSettings);
    this.projectileSpawn = this._normalizeProjectileSpawnSettings(projectileSpawnSettings);
    this.growth = this._normalizeGrowthSettings(growthSettings);
    this._absorbedSinceLastEgg = 0;
    this._absorbedSinceLastGermination = 0;
    this._growthTargetRadius = null;
    this._growthRate = 0;
    this._resumeOrbitAfterGrowth = false;
    this._germinationAttachment = null;
    this._isGerminatedOffspring = false;
    this._mouthWakeAtMs = 0;
    this.angle = this._initialMouthAngle();
    this.targetAngle = this.angle;
  }

  _normalizeBodyCircles(bodyCircles) {
    const source = Array.isArray(bodyCircles) && bodyCircles.length > 0
      ? bodyCircles
      : makeDefaultBodyCircles(this.radius);

    return source.map((circle, index) => ({
      dx: Number(circle?.dx ?? 0),
      dy: Number(circle?.dy ?? 0),
      r: Math.max(2, Number(circle?.r ?? (index === 0 ? this.radius : this.radius * 0.6)))
    }));
  }

  _syncRadiusFromBody() {
    const primary = this.bodyCircles?.[0];
    this.radius = Math.max(2, Number(primary?.r ?? this.radius));
  }

  setRadius(nextRadius) {
    const targetRadius = Math.max(2, Number(nextRadius) || this.radius);
    const prevRadius = Math.max(0.0001, this.radius);
    const scale = targetRadius / prevRadius;

    if (Array.isArray(this.bodyCircles) && this.bodyCircles.length > 0) {
      this.bodyCircles = this.bodyCircles.map(circle => ({
        dx: circle.dx * scale,
        dy: circle.dy * scale,
        r: Math.max(2, circle.r * scale)
      }));
    }

    if (this.mouth?.offsetDistance != null) {
      this.mouth.offsetDistance *= scale;
    }
    if (this.mouth?.absorbRadius != null) {
      this.mouth.absorbRadius *= scale;
    }

    if (this.digestPath) {
      for (const key of getDigestPathPointKeys(this.digestPath)) {
        if (!this.digestPath[key]) continue;
        this.digestPath[key].dx *= scale;
        this.digestPath[key].dy *= scale;
      }
    }

    if (Number.isFinite(this.gitParticleRadius)) {
      this.gitParticleRadius = Math.max(0.4, this.gitParticleRadius * scale);
    }

    if (this.bodyRotation) {
      if (this.bodyRotation.pivotDx != null) this.bodyRotation.pivotDx *= scale;
      if (this.bodyRotation.pivotDy != null) this.bodyRotation.pivotDy *= scale;
      if (this.bodyRotation.pivotRadius != null) this.bodyRotation.pivotRadius *= scale;
    }
    if (Number.isFinite(this.excretionRadius)) {
      this.excretionRadius *= scale;
    }

    this.radius = targetRadius;
    this._syncRadiusFromBody();
  }

  _getBodyCircles() {
    if (!Array.isArray(this.bodyCircles) || this.bodyCircles.length === 0) {
      return [{ cx: this.x, cy: this.y, r: this.radius }];
    }

    const circles = this.bodyCircles.map(circle => {
      const point = this._transformBodyLocalPoint(circle.dx, circle.dy);
      return {
        cx: point.x,
        cy: point.y,
        r: circle.r
      };
    }).filter(circle =>
      Number.isFinite(circle?.cx) &&
      Number.isFinite(circle?.cy) &&
      Number.isFinite(circle?.r) &&
      circle.r > 0
    );

    return circles.length > 0 ? circles : [{ cx: this.x, cy: this.y, r: this.radius }];
  }

  get mass() {
    return this._getBodyCircles().reduce((sum, circle) => sum + Math.PI * circle.r * circle.r, 0);
  }

  _getSurfacePoint(surfaceAngle) {
    const dirX = Math.cos(surfaceAngle);
    const dirY = Math.sin(surfaceAngle);
    let best = null;

    for (const circle of this._getBodyCircles()) {
      const support = circle.cx * dirX + circle.cy * dirY + circle.r;
      if (!best || support > best.support) {
        best = { support, x: circle.cx + dirX * circle.r, y: circle.cy + dirY * circle.r };
      }
    }

    return best ?? { x: this.x + dirX * this.radius, y: this.y + dirY * this.radius };
  }

  _normalizeMouthSettings(s) {
    if (!s || typeof s !== "object") return null;

    let range = null;
    if (Array.isArray(s.rotationRange) && s.rotationRange.length === 2) {
      const a = Number(s.rotationRange[0]);
      const b = Number(s.rotationRange[1]);
      if (Number.isFinite(a) && Number.isFinite(b)) range = [a, b];
    }

    const ciliaSource = s.cilia && typeof s.cilia === "object" ? s.cilia : null;
    const cilia = ciliaSource
      ? {
          enabled: ciliaSource.enabled ?? null,
          count: Number.isFinite(Number(ciliaSource.count)) ? Math.max(0, Math.round(Number(ciliaSource.count))) : null,
          lengthScale: Number.isFinite(Number(ciliaSource.lengthScale)) ? Math.max(0, Number(ciliaSource.lengthScale)) : null,
          waveAmount: Number.isFinite(Number(ciliaSource.waveAmount)) ? Math.max(0, Number(ciliaSource.waveAmount)) : null,
          waveSpeed: Number.isFinite(Number(ciliaSource.waveSpeed)) ? Math.max(0, Number(ciliaSource.waveSpeed)) : null,
          curl: Number.isFinite(Number(ciliaSource.curl)) ? Number(ciliaSource.curl) : null,
          lineWidth: Number.isFinite(Number(ciliaSource.lineWidth)) ? Math.max(0.1, Number(ciliaSource.lineWidth)) : null,
          alpha: Number.isFinite(Number(ciliaSource.alpha)) ? clamp(Number(ciliaSource.alpha), 0, 1) : null,
          arcEnabled: ciliaSource.arcEnabled ?? null,
          arcCenterDeg: Number.isFinite(Number(ciliaSource.arcCenterDeg)) ? Number(ciliaSource.arcCenterDeg) : null,
          arcSpreadDeg: Number.isFinite(Number(ciliaSource.arcSpreadDeg)) ? Math.max(0, Number(ciliaSource.arcSpreadDeg)) : null
        }
      : null;

    return {
      enabled:     s.enabled     ?? null,
      turnEnabled: s.turnEnabled ?? null,
      absorbRadius: Number.isFinite(s.absorbRadius) ? s.absorbRadius : null,
      offsetDistance: Number.isFinite(s.offsetDistance) ? s.offsetDistance : null,
      turnRate:    Number.isFinite(s.turnRate)    ? s.turnRate    : null,
      idleSpin:    Number.isFinite(s.idleSpin)    ? s.idleSpin    : null,
      rotationDir: Number.isFinite(s.rotationDir) ? s.rotationDir : null,
      rotationRange: range,
      cilia
    };
  }

  _normalizeBodyCiliaSettings(s) {
    if (!s || typeof s !== "object") return null;

    const segments = Array.isArray(s.segments)
      ? s.segments
          .map(segment => ({
            enabled: segment?.enabled ?? true,
            start: clamp(Number(segment?.start ?? 0), 0, 1),
            end: clamp(Number(segment?.end ?? 1), 0, 1)
          }))
          .filter(segment => Math.abs(segment.end - segment.start) > 0.0001)
      : null;

    return {
      enabled: s.enabled ?? null,
      count: Number.isFinite(Number(s.count)) ? Math.max(0, Math.round(Number(s.count))) : null,
      lengthScale: Number.isFinite(Number(s.lengthScale)) ? Math.max(0, Number(s.lengthScale)) : null,
      waveAmount: Number.isFinite(Number(s.waveAmount)) ? Math.max(0, Number(s.waveAmount)) : null,
      waveSpeed: Number.isFinite(Number(s.waveSpeed)) ? Math.max(0, Number(s.waveSpeed)) : null,
      curl: Number.isFinite(Number(s.curl)) ? Number(s.curl) : null,
      lineWidth: Number.isFinite(Number(s.lineWidth)) ? Math.max(0.1, Number(s.lineWidth)) : null,
      alpha: Number.isFinite(Number(s.alpha)) ? clamp(Number(s.alpha), 0, 1) : null,
      splineOffset: Number.isFinite(Number(s.splineOffset)) ? Number(s.splineOffset) : null,
      splineSamples: Number.isFinite(Number(s.splineSamples)) ? Math.max(12, Math.round(Number(s.splineSamples))) : null,
      segments: segments && segments.length > 0 ? segments : null
    };
  }

  _normalizeBodyRotationSettings(s) {
    if (!s || typeof s !== "object") return null;

    let rotationRange = null;
    const baseAngleDeg = Number.isFinite(Number(s.baseAngleDeg)) ? Number(s.baseAngleDeg) : null;
    if (Array.isArray(s.rotationRange) && s.rotationRange.length === 2) {
      rotationRange = normalizeBodyRotationRange(s.rotationRange, baseAngleDeg ?? 0);
    }

    return {
      enabled: s.enabled ?? null,
      idleSpin: Number.isFinite(s.idleSpin) ? s.idleSpin : null,
      idleWave: {
        enabled: s.idleWave?.enabled ?? null,
        amount: Number.isFinite(Number(s.idleWave?.amount))
          ? clamp(Number(s.idleWave.amount), 0, 1)
          : (Number.isFinite(Number(s.bodyRotationIdleWaveAmount)) ? clamp(Number(s.bodyRotationIdleWaveAmount), 0, 1) : null),
        speedHz: Number.isFinite(Number(s.idleWave?.speedHz))
          ? Math.max(0, Number(s.idleWave.speedHz))
          : (Number.isFinite(Number(s.bodyRotationIdleWaveSpeedHz)) ? Math.max(0, Number(s.bodyRotationIdleWaveSpeedHz)) : null)
      },
      rotationMode: s.rotationMode === "loop" ? "loop" : null,
      rotationDir: Number.isFinite(s.rotationDir) ? s.rotationDir : null,
      baseAngleDeg: baseAngleDeg,
      rotationRange,
      movementFollow: {
        enabled: s.movementFollow?.enabled ?? null,
        strength: Number.isFinite(Number(s.movementFollow?.strength))
          ? clamp(Number(s.movementFollow.strength), 0, 1)
          : (Number.isFinite(Number(s.bodyRotationMovementFollowStrength)) ? clamp(Number(s.bodyRotationMovementFollowStrength), 0, 1) : null),
        smoothing: Number.isFinite(Number(s.movementFollow?.smoothing))
          ? clamp(Number(s.movementFollow.smoothing), 0, 1)
          : (Number.isFinite(Number(s.bodyRotationMovementFollowSmoothing)) ? clamp(Number(s.bodyRotationMovementFollowSmoothing), 0, 1) : null),
        minSpeed: Number.isFinite(Number(s.movementFollow?.minSpeed))
          ? Math.max(0, Number(s.movementFollow.minSpeed))
          : (Number.isFinite(Number(s.bodyRotationMovementFollowMinSpeed)) ? Math.max(0, Number(s.bodyRotationMovementFollowMinSpeed)) : null)
      },
      pivotDx: Number.isFinite(s.pivotDx) ? s.pivotDx : null,
      pivotDy: Number.isFinite(s.pivotDy) ? s.pivotDy : null,
      pivotRadius: Number.isFinite(s.pivotRadius) ? s.pivotRadius : null
    };
  }

  _normalizeOrbitSettings(s) {
    if (!s || typeof s !== "object") return null;

    const segments = Array.isArray(s.segments)
      ? s.segments
          .map(segment => ({
            centerDx: Number.isFinite(Number(segment?.centerDx)) ? Number(segment.centerDx) : 0,
            centerDy: Number.isFinite(Number(segment?.centerDy)) ? Number(segment.centerDy) : 0,
            radius: Number.isFinite(Number(segment?.radius)) ? Math.max(0, Number(segment.radius)) : 0,
            startDeg: Number.isFinite(Number(segment?.startDeg)) ? Number(segment.startDeg) : 0,
            endDeg: Number.isFinite(Number(segment?.endDeg)) ? Number(segment.endDeg) : 0,
            speed: Number.isFinite(Number(segment?.speed)) ? Number(segment.speed) : null
          }))
          .filter(segment => Number.isFinite(segment.radius))
      : null;
    const splinePoints = Array.isArray(s.splinePoints)
      ? s.splinePoints
          .map(point => ({
            dx: Number.isFinite(Number(point?.dx)) ? Number(point.dx) : 0,
            dy: Number.isFinite(Number(point?.dy)) ? Number(point.dy) : 0
          }))
          .filter(point => Number.isFinite(point.dx) && Number.isFinite(point.dy))
      : null;
    const freeMoveSource = s.freeMove && typeof s.freeMove === "object" ? s.freeMove : {};
    const inferredMode = splinePoints && splinePoints.length > 2 ? "spline" : (segments && segments.length > 0 ? "segments" : "orbit");
    const mode = typeof s.mode === "string" && ["orbit", "segments", "spline", "free"].includes(s.mode)
      ? s.mode
      : inferredMode;
    const normalizedSplinePoints = splinePoints && splinePoints.length > 2
      ? splinePoints
      : (mode === "spline"
          ? makeDefaultOrbitSplinePoints(
              Number.isFinite(Number(s.radius)) ? Number(s.radius) : DEFAULTS.radius * 2.4
            )
          : null);

    return {
      enabled: s.enabled ?? null,
      mode,
      centerDx: Number.isFinite(Number(s.centerDx)) ? Number(s.centerDx) : null,
      centerDy: Number.isFinite(Number(s.centerDy)) ? Number(s.centerDy) : null,
      radius: Number.isFinite(Number(s.radius)) ? Math.max(0, Number(s.radius)) : null,
      speed: Number.isFinite(Number(s.speed)) ? Number(s.speed) : null,
      phaseDeg: Number.isFinite(Number(s.phaseDeg)) ? Number(s.phaseDeg) : null,
      loop: s.loop ?? true,
      segments: segments && segments.length > 0 ? segments : null,
      splinePoints: normalizedSplinePoints,
      freeMove: {
        directionDeg: Number.isFinite(Number(freeMoveSource.directionDeg))
          ? Number(freeMoveSource.directionDeg)
          : (Number.isFinite(Number(s.freeMoveDirectionDeg)) ? Number(s.freeMoveDirectionDeg) : null),
        spreadDeg: Number.isFinite(Number(freeMoveSource.spreadDeg))
          ? Math.max(0, Number(freeMoveSource.spreadDeg))
          : (Number.isFinite(Number(s.freeMoveSpreadDeg)) ? Math.max(0, Number(s.freeMoveSpreadDeg)) : null),
        previewRadius: Number.isFinite(Number(freeMoveSource.previewRadius))
          ? Math.max(10, Number(freeMoveSource.previewRadius))
          : (Number.isFinite(Number(s.freeMovePreviewRadius)) ? Math.max(10, Number(s.freeMovePreviewRadius)) : null),
        impulse: Number.isFinite(Number(freeMoveSource.impulse))
          ? Math.max(0, Number(freeMoveSource.impulse))
          : (Number.isFinite(Number(s.freeMoveImpulse)) ? Math.max(0, Number(s.freeMoveImpulse)) : null),
        intervalMs: Number.isFinite(Number(freeMoveSource.intervalMs))
          ? Math.max(0, Number(freeMoveSource.intervalMs))
          : (Number.isFinite(Number(s.freeMoveIntervalMs)) ? Math.max(0, Number(s.freeMoveIntervalMs)) : null),
        intervalMinMs: Number.isFinite(Number(freeMoveSource.intervalMinMs))
          ? Math.max(0, Number(freeMoveSource.intervalMinMs))
          : (Number.isFinite(Number(s.freeMoveIntervalMinMs)) ? Math.max(0, Number(s.freeMoveIntervalMinMs)) : null),
        intervalMaxMs: Number.isFinite(Number(freeMoveSource.intervalMaxMs))
          ? Math.max(0, Number(freeMoveSource.intervalMaxMs))
          : (Number.isFinite(Number(s.freeMoveIntervalMaxMs)) ? Math.max(0, Number(s.freeMoveIntervalMaxMs)) : null),
        turnAngleMinDeg: Number.isFinite(Number(freeMoveSource.turnAngleMinDeg))
          ? Math.max(0, Number(freeMoveSource.turnAngleMinDeg))
          : (Number.isFinite(Number(s.freeMoveTurnAngleMinDeg)) ? Math.max(0, Number(s.freeMoveTurnAngleMinDeg)) : null),
        turnAngleMaxDeg: Number.isFinite(Number(freeMoveSource.turnAngleMaxDeg))
          ? Math.max(0, Number(freeMoveSource.turnAngleMaxDeg))
          : (Number.isFinite(Number(s.freeMoveTurnAngleMaxDeg)) ? Math.max(0, Number(s.freeMoveTurnAngleMaxDeg)) : null),
        velocityDamping: Number.isFinite(Number(freeMoveSource.velocityDamping))
          ? clamp(Number(freeMoveSource.velocityDamping), 0, 0.9999)
          : (Number.isFinite(Number(s.freeMoveVelocityDamping)) ? clamp(Number(s.freeMoveVelocityDamping), 0, 0.9999) : null),
        maxSpeed: Number.isFinite(Number(freeMoveSource.maxSpeed))
          ? Math.max(0, Number(freeMoveSource.maxSpeed))
          : (Number.isFinite(Number(s.freeMoveMaxSpeed)) ? Math.max(0, Number(s.freeMoveMaxSpeed)) : null)
      }
    };
  }

  _normalizeAbsorbTargetSettings(s) {
    if (!s || typeof s !== "object") {
      return {
        particle: DEFAULTS.absorbParticle,
        projectile: DEFAULTS.absorbProjectile,
        player: DEFAULTS.absorbPlayer,
        enemy: DEFAULTS.absorbEnemy
      };
    }

    return {
      particle: s.particle ?? DEFAULTS.absorbParticle,
      projectile: s.projectile ?? DEFAULTS.absorbProjectile,
      player: s.player ?? DEFAULTS.absorbPlayer,
      enemy: s.enemy ?? DEFAULTS.absorbEnemy
    };
  }

  _normalizeEggSpawnSettings(s) {
    if (!s || typeof s !== "object") {
      return {
        bodyCircleIndex: 1,
        angleDeg: 25,
        feedCount: DEFAULTS.eggSpawnFeedCount
      };
    }

    return {
      bodyCircleIndex: Math.max(0, Math.round(Number(s.bodyCircleIndex ?? 1) || 0)),
      angleDeg: Number.isFinite(Number(s.angleDeg)) ? Number(s.angleDeg) : 25,
      feedCount: Math.max(1, Math.round(Number(s.feedCount ?? DEFAULTS.eggSpawnFeedCount) || DEFAULTS.eggSpawnFeedCount))
    };
  }

  _normalizeGerminationSettings(s) {
    if (!s || typeof s !== "object") {
      return {
        enabled: DEFAULTS.germinationEnabled,
        bodyCircleIndex: 2,
        angleDeg: -30,
        feedCount: DEFAULTS.germinationFeedCount,
        startScale: DEFAULTS.germinationStartScale,
        growthRate: DEFAULTS.germinationGrowthRate,
        detachScale: DEFAULTS.germinationDetachScale,
        launchSpeed: DEFAULTS.germinationLaunchSpeed,
        mirrorOffspringX: DEFAULTS.germinationMirrorOffspringX,
        launchJitter: DEFAULTS.germinationLaunchJitter,
        initialAngleJitterDeg: DEFAULTS.germinationInitialAngleJitterDeg,
        mouthWakeDelayMs: DEFAULTS.germinationMouthWakeDelayMs
      };
    }

    return {
      enabled: s.enabled ?? DEFAULTS.germinationEnabled,
      bodyCircleIndex: Math.max(0, Math.round(Number(s.bodyCircleIndex ?? 2) || 0)),
      angleDeg: Number.isFinite(Number(s.angleDeg)) ? Number(s.angleDeg) : -30,
      feedCount: Math.max(1, Math.round(Number(s.feedCount ?? DEFAULTS.germinationFeedCount) || DEFAULTS.germinationFeedCount)),
      startScale: clamp(Number.isFinite(Number(s.startScale)) ? Number(s.startScale) : DEFAULTS.germinationStartScale, 0.1, 0.95),
      growthRate: Math.max(0.001, Number.isFinite(Number(s.growthRate)) ? Number(s.growthRate) : DEFAULTS.germinationGrowthRate),
      detachScale: clamp(Number.isFinite(Number(s.detachScale)) ? Number(s.detachScale) : DEFAULTS.germinationDetachScale, 0.1, 1),
      launchSpeed: Math.max(0, Number.isFinite(Number(s.launchSpeed)) ? Number(s.launchSpeed) : DEFAULTS.germinationLaunchSpeed),
      mirrorOffspringX: s.mirrorOffspringX ?? DEFAULTS.germinationMirrorOffspringX,
      launchJitter: clamp(Number.isFinite(Number(s.launchJitter)) ? Number(s.launchJitter) : DEFAULTS.germinationLaunchJitter, 0, 1),
      initialAngleJitterDeg: Math.max(0, Number.isFinite(Number(s.initialAngleJitterDeg)) ? Number(s.initialAngleJitterDeg) : DEFAULTS.germinationInitialAngleJitterDeg),
      mouthWakeDelayMs: Math.max(0, Math.round(Number(s.mouthWakeDelayMs ?? DEFAULTS.germinationMouthWakeDelayMs) || DEFAULTS.germinationMouthWakeDelayMs))
    };
  }

  _normalizeProjectileSpawnSettings(s) {
    if (!s || typeof s !== "object") {
      return {
        bodyCircleIndex: DEFAULTS.projectileSpawnBodyCircleIndex,
        angleDeg: DEFAULTS.projectileSpawnAngleDeg
      };
    }

    return {
      bodyCircleIndex: Math.max(0, Math.round(Number(s.bodyCircleIndex ?? DEFAULTS.projectileSpawnBodyCircleIndex) || 0)),
      angleDeg: Number.isFinite(Number(s.angleDeg)) ? Number(s.angleDeg) : DEFAULTS.projectileSpawnAngleDeg
    };
  }

  _normalizeGrowthSettings(s) {
    if (!s || typeof s !== "object") {
      return {
        enabled: DEFAULTS.growthEnabled,
        perAbsorb: DEFAULTS.growthPerAbsorb,
        maxRadius: DEFAULTS.growthMaxRadius,
        growthRate: DEFAULTS.growthRate
      };
    }

    return {
      enabled: s.enabled ?? DEFAULTS.growthEnabled,
      perAbsorb: Math.max(0, Number.isFinite(Number(s.perAbsorb)) ? Number(s.perAbsorb) : DEFAULTS.growthPerAbsorb),
      maxRadius: Math.max(2, Number.isFinite(Number(s.maxRadius)) ? Number(s.maxRadius) : DEFAULTS.growthMaxRadius),
      growthRate: Math.max(0.001, Number.isFinite(Number(s.growthRate)) ? Number(s.growthRate) : DEFAULTS.growthRate)
    };
  }

  _defaultDigestPath() {
    return {
      start: { dx: this._mouthOffsetDistance() * 0.82, dy: 0 },
      c1: { dx: this.radius * 0.18, dy: this.radius * 0.34 },
      c2: { dx: -this.radius * 0.24, dy: this.radius * 0.18 },
      end: { dx: -this.radius * 0.58, dy: 0 }
    };
  }

  _normalizeDigestPath(path) {
    const fallback = this._defaultDigestPath();
    if (!path || typeof path !== "object") return fallback;

    const readPoint = (value, backup) => ({
      dx: Number.isFinite(Number(value?.dx)) ? Number(value.dx) : backup.dx,
      dy: Number.isFinite(Number(value?.dy)) ? Number(value.dy) : backup.dy
    });
    const fallbackControlKeys = getDigestPathPointKeys(fallback).filter(key => key !== "start" && key !== "end");
    const sourceControlKeys = getDigestPathPointKeys(path).filter(key => key !== "start" && key !== "end");
    const activeControlKeys = sourceControlKeys.length > 0 ? sourceControlKeys : fallbackControlKeys;
    const normalized = {
      start: readPoint(path.start, fallback.start)
    };

    activeControlKeys.forEach((key, index) => {
      const fallbackKey = fallbackControlKeys[Math.min(index, fallbackControlKeys.length - 1)] ?? "c2";
      normalized[key] = readPoint(path[key], fallback[fallbackKey] ?? fallback.c2);
    });

    normalized.end = readPoint(path.end, fallback.end);
    return normalized;
  }

  setMouthSettings(s) {
    this.mouth = this._normalizeMouthSettings(s);
    this._idleDirFlip = 1;
  }

  setDigestPath(path) {
    this.digestPath = this._normalizeDigestPath(path);
  }

  setBodyRotationSettings(s) {
    this.bodyRotation = this._normalizeBodyRotationSettings(s);
    this._bodyIdleDirFlip = 1;
    this._bodyMovementFollowOffset = 0;
  }

  setOrbitSettings(s) {
    this.orbit = this._normalizeOrbitSettings(s);
    this._orbitSegmentIndex = 0;
    this._orbitSplineT = 0;
    this._freeMoveHeadingOffsetRad = 0;
    this._lastFreeMoveImpulseMs = performance.now() - this._freeMoveSampleIntervalMs();
    this._nextFreeMoveImpulseMs = performance.now() + this._freeMoveSampleIntervalMs();
    this._orbitAngle = this._resolveInitialOrbitAngle();
    if (this._orbitMode() !== "free") this._updateOrbitPosition();
  }

  setAbsorbTargetSettings(s) {
    this.absorbTargets = this._normalizeAbsorbTargetSettings(s);
  }

  setEggSpawnSettings(s) {
    this.eggSpawn = this._normalizeEggSpawnSettings(s);
  }

  setGerminationSettings(s) {
    this.germination = this._normalizeGerminationSettings(s);
  }

  setGrowthSettings(s) {
    this.growth = this._normalizeGrowthSettings(s);
  }

  _rebuildSpriteConfig() {
    const animationFrames = Math.max(1, Math.round(Number(this.spriteCfg.spriteAnimationFrames ?? DEFAULTS.spriteAnimationFrames)));
    const animationStart = normalizeSpriteIndex(this.spriteCfg.spriteAnimationStart ?? DEFAULTS.spriteAnimationStart);
    const animationFps = Math.max(1, Number(this.spriteCfg.spriteAnimationFps ?? DEFAULTS.spriteAnimationFps));
    const animationMode = this.spriteCfg.spriteAnimationMode === "pingpong" ? "pingpong" : "loop";
    const animationPadding = Math.max(1, Math.round(Number(this.spriteCfg.spriteAnimationPadding ?? DEFAULTS.spriteAnimationPadding)));

    this.sprite = {
      index: this.spriteIndex,
      bodyU: Number(this.spriteCfg.spriteBodyU ?? DEFAULTS.spriteBodyU),
      bodyV: Number(this.spriteCfg.spriteBodyV ?? DEFAULTS.spriteBodyV),
      flipX: !!this.spriteCfg.spriteFlipX,
      scale: Number(this.spriteCfg.spriteScale ?? DEFAULTS.spriteScale),
      alpha: Math.max(0, Math.min(Number(this.spriteCfg.spriteAlpha ?? DEFAULTS.spriteAlpha), 1)),
      rotationOffset: Number(this.spriteCfg.spriteRotationOffset ?? DEFAULTS.spriteRotationOffset),
      debug: !!this.spriteCfg.spriteDebug,
      animationEnabled: this.spriteCfg.spriteAnimationEnabled !== false,
      animationFolder: this.spriteCfg.spriteAnimationFolder ?? DEFAULTS.spriteAnimationFolder,
      animationSubfolder:
        this.spriteCfg.spriteAnimationSubfolder ??
        this.spriteCfg.spriteSubfolder ??
        getMacrophageSpriteFolderName(this.spriteIndex, null),
      animationFrames,
      animationStart,
      animationFps,
      animationMode,
      animationPadding,
      animationExt: this.spriteCfg.spriteAnimationExt ?? DEFAULTS.spriteAnimationExt
    };

    // Warm up the first frame immediately so the first render is less likely to flicker
    getSequenceImage({
      folder: this.sprite.animationFolder,
      subfolder: getMacrophageSpriteFolderName(this.sprite.index, this.sprite.animationSubfolder),
      index: this.sprite.animationStart,
      padding: this.sprite.animationPadding,
      ext: this.sprite.animationExt
    });
  }

  _getAnimatedSpriteImage(now = performance.now()) {
    if (!this.sprite) return null;

    const frameIndex = this.sprite.animationEnabled
      ? resolveSequenceFrameIndex(
          this.sprite.animationStart,
          this.sprite.animationFrames,
          this.sprite.animationMode,
          now,
          this.sprite.animationFps,
          this.animationPhaseMs
        )
      : this.sprite.animationStart;

    const frameCandidates = [
      getSequenceImage({
        folder: this.sprite.animationFolder,
        subfolder: getMacrophageSpriteFolderName(this.sprite.index, this.sprite.animationSubfolder),
        index: frameIndex,
        padding: this.sprite.animationPadding,
        ext: this.sprite.animationExt
      })
    ];

    const renderableFrame = frameCandidates.find(img => img && img.complete && img.naturalWidth) ?? null;
    if (renderableFrame) {
      this._lastRenderableSpriteImage = renderableFrame;
      return renderableFrame;
    }

    return this._lastRenderableSpriteImage ?? frameCandidates[0] ?? null;
  }

  _drawFallbackBody(ctx) {
    for (const circle of this._getBodyCircles()) {
      ctx.beginPath();
      ctx.fillStyle = this.color;
      ctx.arc(circle.cx, circle.cy, circle.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.closePath();
    }
  }

  _drawBodySpriteOrFallback(ctx) {
    const img = this._getAnimatedSpriteImage();
    if (!img || !img.complete || !img.naturalWidth) {
      // A sprite is configured but still loading: avoid flashing the
      // purple geometric fallback during the first few frames.
      if (!this.sprite?.animationFolder) {
        this._drawFallbackBody(ctx);
      }
      return;
    }

    const drawW = this.radius * this.sprite.scale * 2.0;
    const drawH = drawW * (img.naturalHeight / Math.max(img.naturalWidth, 1));
    const bodyAnchorX = drawW * this.sprite.bodyU;
    const bodyAnchorY = drawH * this.sprite.bodyV;
    const pivot = this._bodyPivot();
    const pivotWorld = {
      x: this.x + pivot.dx,
      y: this.y + pivot.dy
    };

    ctx.save();
    ctx.translate(pivotWorld.x, pivotWorld.y);
    ctx.rotate(this._bodyWorldAngle() + this.sprite.rotationOffset);
    if (this.sprite.flipX) ctx.scale(1, -1);
    ctx.globalAlpha = this.sprite.alpha;
    ctx.drawImage(img, -pivot.dx - bodyAnchorX, -pivot.dy - bodyAnchorY, drawW, drawH);

    if (this.sprite.debug) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(230,205,255,0.9)";
      ctx.lineWidth = 1;
      ctx.strokeRect(-pivot.dx - bodyAnchorX, -pivot.dy - bodyAnchorY, drawW, drawH);
      ctx.closePath();
    }

    ctx.restore();
  }

  _drawMouthCilia(ctx, now = performance.now()) {
    if (!this._mouthEnabled()) return;
    const cilia = this._mouthCiliaSettings();
    if (!cilia.enabled || cilia.count <= 0 || cilia.lengthScale <= 0 || cilia.alpha <= 0) return;

    const oral = this._mouthCircle();
    if (!oral) return;
    const ciliaCount = cilia.count;
    const ciliaBase  = oral.r * cilia.lengthScale;
    const wavePhase  = now * cilia.waveSpeed;

    ctx.save();
    ctx.lineWidth = cilia.lineWidth;
    ctx.lineCap   = "round";
    const useArc = cilia.arcEnabled && cilia.arcSpreadDeg < 360;
    const arcCenter = (oral.angle ?? this._worldMouthAngle()) + degToRad(cilia.arcCenterDeg);
    const arcSpread = degToRad(cilia.arcSpreadDeg);
    const arcStart = arcCenter - arcSpread * 0.5;
    for (let i = 0; i < ciliaCount; i++) {
      const t = ciliaCount <= 1 ? 0.5 : i / (ciliaCount - 1);
      const ang = useArc
        ? arcStart + arcSpread * t
        : (i / ciliaCount) * Math.PI * 2;
      const wave = Math.sin(wavePhase + i * 0.65);
      const waveStrength = Math.abs(wave);
      const len  = ciliaBase * (0.7 + cilia.waveAmount * waveStrength);
      const curl = cilia.curl * wave;

      const bx = oral.x + Math.cos(ang) * oral.r;
      const by = oral.y + Math.sin(ang) * oral.r;
      const tx = oral.x + Math.cos(ang + curl) * (oral.r + len);
      const ty = oral.y + Math.sin(ang + curl) * (oral.r + len);

      ctx.strokeStyle = `rgba(190, 245, 255, ${((0.30 + 0.40 * waveStrength) * cilia.alpha).toFixed(2)})`;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }
    ctx.restore();
  }

  _bodyCiliaSettings() {
    const cilia = this.bodyCilia ?? {};
    const readNumber = (value, fallback) => {
      if (value == null || value === "") return fallback;
      const n = Number(value);
      return Number.isFinite(n) ? n : fallback;
    };
    const segments = Array.isArray(cilia.segments) && cilia.segments.length > 0
      ? cilia.segments
      : DEFAULTS.bodyCiliaSegments;
    return {
      enabled: cilia.enabled ?? DEFAULTS.bodyCiliaEnabled,
      count: Math.max(0, Math.round(readNumber(cilia.count, DEFAULTS.bodyCiliaCount))),
      lengthScale: Math.max(0, readNumber(cilia.lengthScale, DEFAULTS.bodyCiliaLengthScale)),
      waveAmount: Math.max(0, readNumber(cilia.waveAmount, DEFAULTS.bodyCiliaWaveAmount)),
      waveSpeed: Math.max(0, readNumber(cilia.waveSpeed, DEFAULTS.bodyCiliaWaveSpeed)),
      curl: readNumber(cilia.curl, DEFAULTS.bodyCiliaCurl),
      lineWidth: Math.max(0.1, readNumber(cilia.lineWidth, DEFAULTS.bodyCiliaLineWidth)),
      alpha: clamp(readNumber(cilia.alpha, DEFAULTS.bodyCiliaAlpha), 0, 1),
      splineOffset: readNumber(cilia.splineOffset, DEFAULTS.bodyCiliaSplineOffset),
      splineSamples: Math.max(12, Math.round(readNumber(cilia.splineSamples, DEFAULTS.bodyCiliaSplineSamples))),
      segments: segments.map(segment => ({
        enabled: segment?.enabled ?? true,
        start: clamp(Number(segment?.start ?? 0), 0, 1),
        end: clamp(Number(segment?.end ?? 1), 0, 1)
      }))
    };
  }

  _getBodyCiliaSpline(settings = this._bodyCiliaSettings()) {
    const circles = this._getBodyCircles();
    const centerX = circles.reduce((sum, circle) => sum + circle.cx, 0) / Math.max(1, circles.length);
    const centerY = circles.reduce((sum, circle) => sum + circle.cy, 0) / Math.max(1, circles.length);
    const samples = Math.max(12, settings.splineSamples);
    const points = [];

    for (let i = 0; i < samples; i++) {
      const angle = (i / samples) * Math.PI * 2;
      const nx = Math.cos(angle);
      const ny = Math.sin(angle);
      let best = null;
      for (const circle of circles) {
        const vx = circle.cx - centerX;
        const vy = circle.cy - centerY;
        const support = vx * nx + vy * ny + circle.r;
        if (!best || support > best.support) {
          best = { support };
        }
      }
      const distance = Math.max(0, (best?.support ?? this.radius) + settings.splineOffset);
      points.push({
        x: centerX + nx * distance,
        y: centerY + ny * distance,
        nx,
        ny,
        angle,
        t: i / samples
      });
    }

    return points;
  }

  _isBodyCiliaTEnabled(t, segments) {
    for (const segment of segments ?? []) {
      if (segment?.enabled === false) continue;
      let start = clamp(Number(segment?.start ?? 0), 0, 1);
      let end = clamp(Number(segment?.end ?? 1), 0, 1);
      if (Math.abs(start - end) <= 0.0001) continue;
      if (start <= end) {
        if (t >= start && t <= end) return true;
      } else if (t >= start || t <= end) {
        return true;
      }
    }
    return false;
  }

  _drawBodyCilia(ctx, now = performance.now()) {
    const cilia = this._bodyCiliaSettings();
    if (!cilia.enabled || cilia.count <= 0 || cilia.lengthScale <= 0 || cilia.alpha <= 0) return;

    const spline = this._getBodyCiliaSpline(cilia);
    if (spline.length < 3) return;

    const bodyScale = Math.max(4, this.radius);
    const ciliaBase = bodyScale * cilia.lengthScale;
    const wavePhase = now * cilia.waveSpeed;
    const count = cilia.count;

    ctx.save();
    ctx.lineWidth = cilia.lineWidth;
    ctx.lineCap = "round";
    for (let i = 0; i < count; i++) {
      const t = count <= 1 ? 0.5 : i / count;
      if (!this._isBodyCiliaTEnabled(t, cilia.segments)) continue;
      const point = spline[Math.min(spline.length - 1, Math.floor(t * spline.length))];
      const wave = Math.sin(wavePhase + i * 0.42);
      const waveStrength = Math.abs(wave);
      const len = ciliaBase * (0.7 + cilia.waveAmount * waveStrength);
      const curl = cilia.curl * wave;
      const ang = point.angle + curl;
      const tx = point.x + Math.cos(ang) * len;
      const ty = point.y + Math.sin(ang) * len;

      ctx.strokeStyle = `rgba(190, 245, 255, ${((0.24 + 0.42 * waveStrength) * cilia.alpha).toFixed(2)})`;
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }
    ctx.restore();
  }

  _mouthEnabled()      { return this.mouth?.enabled      ?? DEFAULTS.mouthRotationEnabled; }
  _mouthTurnEnabled()  { return this.mouth?.turnEnabled  ?? DEFAULTS.mouthTurnEnabled; }
  _mouthAbsorbRadius() { return this.mouth?.absorbRadius ?? DEFAULTS.mouthAbsorbRadius; }
  _mouthOffsetDistance(){ return this.mouth?.offsetDistance ?? this.radius; }
  _mouthTurnRate()     { return this.mouth?.turnRate      ?? DEFAULTS.mouthTurnRate; }
  _mouthIdleSpin()     { return this.mouth?.idleSpin      ?? DEFAULTS.mouthIdleSpin; }
  _mouthRotationDir()  { return this.mouth?.rotationDir   ?? DEFAULTS.mouthRotationDir; }
  _mouthRotationRange(){ return this.mouth?.rotationRange ?? DEFAULTS.mouthRotationRange; }
  _mouthCiliaSettings() {
    const cilia = this.mouth?.cilia ?? {};
    const readNumber = (value, fallback) => {
      if (value == null || value === "") return fallback;
      const n = Number(value);
      return Number.isFinite(n) ? n : fallback;
    };
    return {
      enabled: cilia.enabled ?? DEFAULTS.mouthCiliaEnabled,
      count: Math.max(0, Math.round(readNumber(cilia.count, DEFAULTS.mouthCiliaCount))),
      lengthScale: Math.max(0, readNumber(cilia.lengthScale, DEFAULTS.mouthCiliaLengthScale)),
      waveAmount: Math.max(0, readNumber(cilia.waveAmount, DEFAULTS.mouthCiliaWaveAmount)),
      waveSpeed: Math.max(0, readNumber(cilia.waveSpeed, DEFAULTS.mouthCiliaWaveSpeed)),
      curl: readNumber(cilia.curl, DEFAULTS.mouthCiliaCurl),
      lineWidth: Math.max(0.1, readNumber(cilia.lineWidth, DEFAULTS.mouthCiliaLineWidth)),
      alpha: clamp(readNumber(cilia.alpha, DEFAULTS.mouthCiliaAlpha), 0, 1),
      arcEnabled: cilia.arcEnabled ?? DEFAULTS.mouthCiliaArcEnabled,
      arcCenterDeg: readNumber(cilia.arcCenterDeg, DEFAULTS.mouthCiliaArcCenterDeg),
      arcSpreadDeg: Math.max(0, Math.min(360, readNumber(cilia.arcSpreadDeg, DEFAULTS.mouthCiliaArcSpreadDeg)))
    };
  }
  _mouthCircle() {
    const mouth = this._mouthPoint();
    const radius = this._mouthAbsorbRadius();
    if (!mouth || !Number.isFinite(mouth.x) || !Number.isFinite(mouth.y) || !Number.isFinite(radius) || radius <= 0) {
      return null;
    }
    return {
      x: mouth.x,
      y: mouth.y,
      r: Math.max(0, radius),
      angle: this._worldMouthAngle()
    };
  }
  _initialMouthAngle() {
    const range = this._mouthRotationRange();
    if (Array.isArray(range) && range.length === 2) {
      return ((Number(range[0]) || 0) + (Number(range[1]) || 0)) * 0.5 * (Math.PI / 180);
    }
    return 0;
  }
  _bodyRotationEnabled(){ return this.bodyRotation?.enabled ?? DEFAULTS.bodyRotationEnabled; }
  _bodyIdleWaveEnabled() { return this.bodyRotation?.idleWave?.enabled ?? DEFAULTS.bodyRotationIdleWaveEnabled; }
  _bodyIdleWaveAmount() { return clamp(this.bodyRotation?.idleWave?.amount ?? DEFAULTS.bodyRotationIdleWaveAmount, 0, 1); }
  _bodyIdleWaveSpeedHz() { return Math.max(0, this.bodyRotation?.idleWave?.speedHz ?? DEFAULTS.bodyRotationIdleWaveSpeedHz); }
  _bodyIdleSpin(now = performance.now()) {
    const baseSpin = (this.bodyRotation?.idleSpin ?? DEFAULTS.bodyRotationIdleSpin) * BODY_ROTATION_IDLE_SPIN_SCALE;
    if (!this._bodyIdleWaveEnabled() || baseSpin <= 0.0000001) return baseSpin;
    const phase = (this.animationPhaseMs ?? 0) * 0.001;
    const wave = Math.sin(now * 0.001 * this._bodyIdleWaveSpeedHz() * Math.PI * 2 + phase);
    return baseSpin * Math.max(0, 1 + wave * this._bodyIdleWaveAmount());
  }
  _bodyRotationMode()  { return this.bodyRotation?.rotationMode ?? DEFAULTS.bodyRotationMode; }
  _bodyRotationDir()   { return this.bodyRotation?.rotationDir ?? DEFAULTS.bodyRotationDir; }
  _bodyBaseAngle()     { return degToRad(this.bodyRotation?.baseAngleDeg ?? DEFAULTS.bodyRotationBaseAngleDeg); }
  _bodyMovementFollowEnabled() { return this.bodyRotation?.movementFollow?.enabled ?? DEFAULTS.bodyRotationMovementFollowEnabled; }
  _bodyMovementFollowStrength() { return clamp(this.bodyRotation?.movementFollow?.strength ?? DEFAULTS.bodyRotationMovementFollowStrength, 0, 1); }
  _bodyMovementFollowSmoothing() { return clamp(this.bodyRotation?.movementFollow?.smoothing ?? DEFAULTS.bodyRotationMovementFollowSmoothing, 0, 1); }
  _bodyMovementFollowMinSpeed() { return Math.max(0, this.bodyRotation?.movementFollow?.minSpeed ?? DEFAULTS.bodyRotationMovementFollowMinSpeed); }
  _bodyWorldAngle()    { return this._bodyBaseAngle() + this._bodyAngleOffset + this._bodyMovementFollowOffset; }
  _bodyRotationRange() { return this.bodyRotation?.rotationRange ?? DEFAULTS.bodyRotationRange; }
  _bodyPivot() {
    return {
      dx: this.bodyRotation?.pivotDx ?? DEFAULTS.bodyPivotDx,
      dy: this.bodyRotation?.pivotDy ?? DEFAULTS.bodyPivotDy,
      r: this.bodyRotation?.pivotRadius ?? DEFAULTS.bodyPivotRadius
    };
  }
  _orbitEnabled()      { return this.orbit?.enabled ?? DEFAULTS.orbitEnabled; }
  _orbitMode()         { return this.orbit?.mode ?? DEFAULTS.orbitMode; }
  _orbitCenterDx()     { return this.orbit?.centerDx ?? DEFAULTS.orbitCenterDx; }
  _orbitCenterDy()     { return this.orbit?.centerDy ?? DEFAULTS.orbitCenterDy; }
  _orbitRadius()       { return Math.max(0, this.orbit?.radius ?? DEFAULTS.orbitRadius); }
  _orbitSpeed()        { return this.orbit?.speed ?? DEFAULTS.orbitSpeed; }
  _orbitLoop()         { return this.orbit?.loop ?? true; }
  _canAbsorbParticles() { return this.absorbTargets?.particle ?? DEFAULTS.absorbParticle; }
  _canAbsorbProjectiles() { return this.absorbTargets?.projectile ?? DEFAULTS.absorbProjectile; }
  _canAbsorbPlayer() { return this.absorbTargets?.player ?? DEFAULTS.absorbPlayer; }
  _canAbsorbEnemy() { return this.absorbTargets?.enemy ?? DEFAULTS.absorbEnemy; }

  _orbitSegments() {
    return Array.isArray(this.orbit?.segments) && this.orbit.segments.length > 0
      ? this.orbit.segments
      : null;
  }

  _orbitSplinePointsLocal() {
    if (Array.isArray(this.orbit?.splinePoints) && this.orbit.splinePoints.length > 2) {
      return this.orbit.splinePoints;
    }
    return null;
  }

  _orbitSplinePointsWorld() {
    const points = this._orbitSplinePointsLocal();
    if (!points) return null;
    const center = this._orbitCenterWorld();
    return points.map(point => ({
      x: center.x + (point?.dx ?? 0),
      y: center.y + (point?.dy ?? 0)
    }));
  }

  _orbitUsesSegments() {
    return this._orbitMode() === "segments" && !!this._orbitSegments();
  }

  _orbitUsesSpline() {
    return this._orbitMode() === "spline" && !!this._orbitSplinePointsLocal();
  }

  _getOrbitSegment(index = this._orbitSegmentIndex ?? 0) {
    const segments = this._orbitSegments();
    if (!segments) return null;
    const safeIndex = Math.max(0, Math.min(index, segments.length - 1));
    return segments[safeIndex] ?? null;
  }

  _orbitSegmentCenterWorld(segment) {
    return {
      x: this._spawnX + (segment?.centerDx ?? 0),
      y: this._spawnY + (segment?.centerDy ?? 0)
    };
  }

  _orbitCenterWorld() {
    if (this._orbitUsesSegments()) {
      return this._orbitSegmentCenterWorld(this._getOrbitSegment());
    }
    return {
      x: this._spawnX + this._orbitCenterDx(),
      y: this._spawnY + this._orbitCenterDy()
    };
  }

  _resolveInitialOrbitAngle() {
    if (this._orbitUsesSegments()) {
      this._orbitSegmentIndex = 0;
      const first = this._getOrbitSegment(0);
      return degToRad(first?.startDeg ?? 0);
    }

    const explicitPhase = this.orbit?.phaseDeg;
    if (Number.isFinite(explicitPhase)) {
      return (explicitPhase * Math.PI) / 180;
    }

    const center = this._orbitCenterWorld();
    return Math.atan2(this.y - center.y, this.x - center.x);
  }

  _updateOrbitPosition() {
    if (this._orbitUsesSpline()) {
      const points = this._orbitSplinePointsWorld();
      if (!points || points.length < 2) return;
      const pos = sampleClosedCatmullRom(points, this._orbitSplineT);
      this.x = pos.x;
      this.y = pos.y;
      return;
    }
    if (this._orbitUsesSegments()) {
      const segment = this._getOrbitSegment();
      const center = this._orbitSegmentCenterWorld(segment);
      const radius = Math.max(0, Number(segment?.radius) || 0);
      this.x = center.x + Math.cos(this._orbitAngle) * radius;
      this.y = center.y + Math.sin(this._orbitAngle) * radius;
      return;
    }

    const center = this._orbitCenterWorld();
    const radius = this._orbitRadius();
    this.x = center.x + Math.cos(this._orbitAngle) * radius;
    this.y = center.y + Math.sin(this._orbitAngle) * radius;
  }

  _advanceSegmentedOrbit() {
    const segments = this._orbitSegments();
    if (!segments || segments.length === 0) {
      return;
    }

    let remaining = Math.abs(this._getOrbitSegment(this._orbitSegmentIndex)?.speed ?? this._orbitSpeed() ?? 0);
    if (remaining <= 0) {
      this._updateOrbitPosition();
      return;
    }

    let guard = 0;
    while (remaining > 0.000001 && guard < Math.max(8, segments.length * 4)) {
      guard += 1;
      const segment = this._getOrbitSegment();
      if (!segment) break;

      const speed = Number.isFinite(Number(segment.speed)) ? Number(segment.speed) : this._orbitSpeed();
      const dir = speed >= 0 ? 1 : -1;
      const endAngle = degToRad(segment.endDeg ?? 0);
      const distanceToEnd = angularDistanceAlongDirection(this._orbitAngle, endAngle, dir);

      if (distanceToEnd > 0.000001 && remaining < distanceToEnd) {
        this._orbitAngle = wrapAngle(this._orbitAngle + dir * remaining);
        remaining = 0;
        break;
      }

      this._orbitAngle = wrapAngle(endAngle);
      remaining = Math.max(0, remaining - distanceToEnd);

      if (segments.length === 1 && !this._orbitLoop()) {
        remaining = 0;
        break;
      }

      let nextIndex = this._orbitSegmentIndex + 1;
      if (nextIndex >= segments.length) {
        if (!this._orbitLoop()) {
          remaining = 0;
          break;
        }
        nextIndex = 0;
      }

      this._orbitSegmentIndex = nextIndex;
      const nextSegment = this._getOrbitSegment();
      this._orbitAngle = degToRad(nextSegment?.startDeg ?? 0);
    }

    this._updateOrbitPosition();
  }

  _advanceSplineOrbit() {
    const points = this._orbitSplinePointsWorld();
    if (!points || points.length < 2) return;
    const length = Math.max(0.0001, approximateClosedSplineLength(points, Math.max(48, points.length * 20)));
    const speed = this._orbitSpeed();
    const deltaT = (Math.abs(speed) * Math.max(this._orbitRadius(), this.radius, 1)) / length;
    if (deltaT <= 0.0000001) {
      this._updateOrbitPosition();
      return;
    }
    if (this._orbitLoop()) {
      this._orbitSplineT = ((this._orbitSplineT + (speed >= 0 ? deltaT : -deltaT)) % 1 + 1) % 1;
    } else {
      this._orbitSplineT = Math.max(0, Math.min(1, this._orbitSplineT + (speed >= 0 ? deltaT : -deltaT)));
    }
    this._updateOrbitPosition();
  }

  _advanceOrbit() {
    if (!this._orbitEnabled()) {
      this.x = this._spawnX;
      this.y = this._spawnY;
      return;
    }

    if (this._orbitMode() === "free") {
      return;
    }

    if (this._orbitUsesSegments()) {
      this._advanceSegmentedOrbit();
      return;
    }
    if (this._orbitUsesSpline()) {
      this._advanceSplineOrbit();
      return;
    }

    this._orbitAngle = wrapAngle(this._orbitAngle + this._orbitSpeed());
    this._updateOrbitPosition();
  }

  _freeMoveDirectionRad() {
    return wrapAngle(
      this._bodyWorldAngle() +
      degToRad(this.orbit?.freeMove?.directionDeg ?? DEFAULTS.freeMoveDirectionDeg)
    );
  }

  _freeMoveSpreadRad() {
    return degToRad(this.orbit?.freeMove?.spreadDeg ?? DEFAULTS.freeMoveSpreadDeg);
  }

  _freeMoveImpulse() {
    return Math.max(0, this.orbit?.freeMove?.impulse ?? DEFAULTS.freeMoveImpulse);
  }

  _freeMoveIntervalMs() {
    return Math.max(0, this.orbit?.freeMove?.intervalMs ?? DEFAULTS.freeMoveIntervalMs);
  }

  _freeMoveIntervalMinMs() {
    const fallback = this._freeMoveIntervalMs();
    return Math.max(0, this.orbit?.freeMove?.intervalMinMs ?? DEFAULTS.freeMoveIntervalMinMs ?? fallback);
  }

  _freeMoveIntervalMaxMs() {
    const minMs = this._freeMoveIntervalMinMs();
    const fallback = Math.max(minMs, this._freeMoveIntervalMs());
    return Math.max(minMs, this.orbit?.freeMove?.intervalMaxMs ?? DEFAULTS.freeMoveIntervalMaxMs ?? fallback);
  }

  _freeMoveTurnAngleMinRad() {
    return degToRad(Math.max(0, this.orbit?.freeMove?.turnAngleMinDeg ?? DEFAULTS.freeMoveTurnAngleMinDeg));
  }

  _freeMoveTurnAngleMaxRad() {
    const minRad = this._freeMoveTurnAngleMinRad();
    return Math.max(minRad, degToRad(Math.max(0, this.orbit?.freeMove?.turnAngleMaxDeg ?? DEFAULTS.freeMoveTurnAngleMaxDeg)));
  }

  _freeMoveSampleIntervalMs() {
    const minMs = this._freeMoveIntervalMinMs();
    const maxMs = this._freeMoveIntervalMaxMs();
    if (maxMs <= minMs) return minMs;
    return minMs + Math.random() * (maxMs - minMs);
  }

  _motionReleaseIntervalMs() {
    const sizeRatio = Math.max(0.28, Math.min(1, this.radius / Math.max(1, DEFAULTS.radius)));
    let interval = MOTION_RELEASE_INTERVAL_MS / sizeRatio;
    if (this._isGerminatedOffspring) interval *= 2.4;
    if (this._isGerminatedOffspring && this._growthTargetRadius > this.radius + 0.0001) {
      interval *= 2.2;
    }
    return interval;
  }

  _freeMoveApplyRandomTurn() {
    const minTurn = this._freeMoveTurnAngleMinRad();
    const maxTurn = this._freeMoveTurnAngleMaxRad();
    if (maxTurn <= 0.000001) return;
    const turn = minTurn + Math.random() * (maxTurn - minTurn);
    const sign = Math.random() < 0.5 ? -1 : 1;
    this._freeMoveHeadingOffsetRad = wrapAngle(this._freeMoveHeadingOffsetRad + turn * sign);
  }

  _freeMoveVelocityDamping() {
    return clamp(this.orbit?.freeMove?.velocityDamping ?? DEFAULTS.freeMoveVelocityDamping, 0, 0.9999);
  }

  _freeMoveMaxSpeed() {
    return Math.max(0, this.orbit?.freeMove?.maxSpeed ?? DEFAULTS.freeMoveMaxSpeed);
  }

  _applyFreeMoveImpulse(now, playerRadius = null) {
    if (Number.isFinite(this._nextFreeMoveImpulseMs) && now < this._nextFreeMoveImpulseMs) return null;

    this._freeMoveApplyRandomTurn();
    const spreadHalf = this._freeMoveSpreadRad() * 0.5;
    const angle = this._freeMoveDirectionRad() + this._freeMoveHeadingOffsetRad + (Math.random() * 2 - 1) * spreadHalf;
    const impulse = this._freeMoveImpulse();
    this.dx += Math.cos(angle) * impulse;
    this.dy += Math.sin(angle) * impulse;
    this._lastFreeMoveImpulseMs = now;
    this._nextFreeMoveImpulseMs = now + this._freeMoveSampleIntervalMs();
    return null;
  }

  _dampFreeMoveVelocity() {
    this.dx *= this._freeMoveVelocityDamping();
    this.dy *= this._freeMoveVelocityDamping();
  }

  _limitFreeMoveVelocity() {
    const speed = Math.hypot(this.dx, this.dy);
    const maxSpeed = this._freeMoveMaxSpeed();
    if (speed <= maxSpeed || speed <= 0.0001) return;
    this.dx = (this.dx / speed) * maxSpeed;
    this.dy = (this.dy / speed) * maxSpeed;
  }

  _advanceFreeMove(now, playerRadius = null) {
    if (!this._orbitEnabled()) {
      this.x = this._spawnX;
      this.y = this._spawnY;
      this.dx = 0;
      this.dy = 0;
      return [];
    }

    const spawnedParticles = [];
    const impulseParticle = this._applyFreeMoveImpulse(now, playerRadius);
    if (impulseParticle) spawnedParticles.push(impulseParticle);
    this._dampFreeMoveVelocity();
    this._limitFreeMoveVelocity();
    this.x += this.dx;
    this.y += this.dy;
    const driftParticle = this._maybeReleaseMotionParticle(now, playerRadius);
    if (driftParticle) spawnedParticles.push(driftParticle);
    return spawnedParticles;
  }

  _bodyExtentRadius() {
    if (!Array.isArray(this.bodyCircles) || this.bodyCircles.length === 0) {
      return Math.max(0, this.radius);
    }
    return this.bodyCircles.reduce(
      (max, circle) => Math.max(max, Math.hypot(circle?.dx ?? 0, circle?.dy ?? 0) + Math.max(0, circle?.r ?? 0)),
      Math.max(0, this.radius)
    );
  }

  _bounceInsideBounds(bounds, playerRadius = null) {
    if (!bounds || this._orbitMode() !== "free") return null;

    const extentRadius = this._bodyExtentRadius();
    if (!(extentRadius > 0)) return null;

    const maxX = bounds.width - extentRadius;
    const maxY = bounds.height - extentRadius;
    const restitution = Math.max(0, Number(this.wallBounce) || DEFAULTS.wallBounce);
    let bounced = false;

    if (extentRadius * 2 >= bounds.width) {
      this.x = bounds.width * 0.5;
      this.dx = 0;
    } else if (this.x < extentRadius) {
      this.x = extentRadius;
      this.dx = Math.abs(this.dx) * restitution;
      bounced = true;
    } else if (this.x > maxX) {
      this.x = maxX;
      this.dx = -Math.abs(this.dx) * restitution;
      bounced = true;
    }

    if (extentRadius * 2 >= bounds.height) {
      this.y = bounds.height * 0.5;
      this.dy = 0;
    } else if (this.y < extentRadius) {
      this.y = extentRadius;
      this.dy = Math.abs(this.dy) * restitution;
      bounced = true;
    } else if (this.y > maxY) {
      this.y = maxY;
      this.dy = -Math.abs(this.dy) * restitution;
      bounced = true;
    }

    return bounced ? this._releaseMotionParticleFromVelocity(playerRadius, 0.18) : null;
  }

  get _beadRadius() {
    return Math.max(0.4, Number(this.gitParticleRadius ?? (this.radius / 8)) || (this.radius / 8));
  }

  _transformBodyLocalPoint(dx, dy) {
    const pivot = this._bodyPivot();
    const rx = dx - pivot.dx;
    const ry = dy - pivot.dy;
    const bodyAngle = this._bodyWorldAngle();
    const ca = Math.cos(bodyAngle);
    const sa = Math.sin(bodyAngle);
    return {
      x: this.x + pivot.dx + rx * ca - ry * sa,
      y: this.y + pivot.dy + rx * sa + ry * ca
    };
  }

  _worldMouthAngle() {
    return wrapAngle(this.angle + this._bodyWorldAngle());
  }

  _getDigestPathPoints() {
    const path = this.digestPath ?? this._defaultDigestPath();
    const transform = point => this._transformBodyLocalPoint(point.dx, point.dy);
    return Object.fromEntries(
      getDigestPathPointKeys(path)
        .filter(key => path[key])
        .map(key => [key, transform(path[key])])
    );
  }

  _digestExit() {
    const path = this._getDigestPathPoints();
    const keys = getDigestPathPointKeys(path);
    const end = path.end ?? path[keys.at(-1)] ?? { x: this.x, y: this.y };
    const prev = path[keys.at(-2)] ?? end;
    const dx = end.x - prev.x;
    const dy = end.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    return {
      x: end.x,
      y: end.y,
      dirX: dx / len,
      dirY: dy / len
    };
  }

  _beadPos(t) {
    const path = this._getDigestPathPoints();
    const keys = getDigestPathPointKeys(path).filter(key => path[key]);
    return bezierPoint(keys.map(key => path[key]), Math.max(0, Math.min(1, t)));
  }

  _backSurface() {
    return this._getSurfacePoint(this._worldMouthAngle() + Math.PI);
  }

  _mouthAnchorPoint() {
    const circles = this._getBodyCircles();
    const primary = circles?.[0];
    if (primary && Number.isFinite(primary.cx) && Number.isFinite(primary.cy)) {
      return { x: primary.cx, y: primary.cy };
    }
    return this._transformBodyLocalPoint(0, 0);
  }

  _mouthPoint() {
    const dist = Math.max(0, this._mouthOffsetDistance());
    const anchor = this._mouthAnchorPoint();
    const angle = this._worldMouthAngle();
    return {
      x: anchor.x + Math.cos(angle) * dist,
      y: anchor.y + Math.sin(angle) * dist
    };
  }

  _surfaceSpawnPoint(settings = null) {
    const bodyCircles = this._getBodyCircles();
    const idx = Math.max(0, Math.min(settings?.bodyCircleIndex ?? 0, bodyCircles.length - 1));
    const circle = bodyCircles[idx] ?? bodyCircles[0] ?? { cx: this.x, cy: this.y, r: this.radius };
    const angle = ((settings?.angleDeg ?? 0) * Math.PI) / 180 + this._bodyWorldAngle();
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    return {
      x: circle.cx + dirX * circle.r,
      y: circle.cy + dirY * circle.r,
      dirX,
      dirY
    };
  }

  _eggSpawnPoint() {
    return this._surfaceSpawnPoint(this.eggSpawn);
  }

  _germinationPoint() {
    return this._surfaceSpawnPoint(this.germination);
  }

  _projectileSpawnPoint() {
    return this._surfaceSpawnPoint(this.projectileSpawn);
  }

  _isMouthAwake(now = performance.now()) {
    return now >= (this._mouthWakeAtMs ?? 0);
  }

  _isAttachedGerminationBud() {
    return !!this._germinationAttachment?.parent;
  }

  _attachGerminationBud(parent, settings, detachRadius, launchSpeed) {
    this._germinationAttachment = {
      parent,
      settings: settings && typeof settings === "object"
        ? {
            bodyCircleIndex: Math.max(0, Math.round(Number(settings.bodyCircleIndex ?? 0) || 0)),
            angleDeg: Number.isFinite(Number(settings.angleDeg)) ? Number(settings.angleDeg) : 0
          }
        : null,
      detachRadius: Math.max(2, Number(detachRadius) || this.radius),
      launchSpeed: Math.max(0, Number(launchSpeed) || 0),
      launchJitter: clamp(Number(settings?.launchJitter ?? DEFAULTS.germinationLaunchJitter), 0, 1),
      initialAngleJitterDeg: Math.max(0, Number(settings?.initialAngleJitterDeg ?? DEFAULTS.germinationInitialAngleJitterDeg) || 0),
      mouthWakeDelayMs: Math.max(0, Math.round(Number(settings?.mouthWakeDelayMs ?? DEFAULTS.germinationMouthWakeDelayMs) || 0))
    };
    this.absorbing = null;
    this.dx = 0;
    this.dy = 0;
  }

  _positionFromGerminationAnchor(anchor, extraDistance = 0) {
    if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return;
    const dirX = Number.isFinite(anchor.dirX) ? anchor.dirX : 0;
    const dirY = Number.isFinite(anchor.dirY) ? anchor.dirY : 0;
    const backAngle = Math.atan2(-dirY, -dirX);
    const backPoint = this._getSurfacePoint(backAngle);
    const offsetX = backPoint.x - this.x;
    const offsetY = backPoint.y - this.y;
    this.x = anchor.x - offsetX + dirX * Math.max(0, extraDistance);
    this.y = anchor.y - offsetY + dirY * Math.max(0, extraDistance);
  }

  _detachGerminationBud(anchor = null) {
    const attachment = this._germinationAttachment;
    if (!attachment) return false;

    const detachPoint = anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.y)
      ? anchor
      : attachment.parent?._surfaceSpawnPoint(attachment.settings ?? null) ?? null;
    const jitter = clamp(Number(attachment.launchJitter ?? 0), 0, 1);
    const impulseScale = 1 + ((Math.random() * 2 - 1) * jitter);
    const impulse = Math.max(0, (Number(attachment.launchSpeed) || 0) * impulseScale);

    if (detachPoint && Number.isFinite(detachPoint.dirX) && Number.isFinite(detachPoint.dirY)) {
      const detachDistance = Math.max(this.radius * 0.08, impulse * 8);
      this._positionFromGerminationAnchor(detachPoint, detachDistance);
      if (!(this._resumeOrbitAfterGrowth && this.orbit && this._orbitMode() !== "free")) {
        this.dx = detachPoint.dirX * impulse;
        this.dy = detachPoint.dirY * impulse;
      }
    }

    this._spawnX = this.x;
    this._spawnY = this.y;

    const angleJitterDeg = Math.max(0, Number(attachment.initialAngleJitterDeg ?? 0) || 0);
    if (angleJitterDeg > 0.0001) {
      const jitterRad = degToRad((Math.random() * 2 - 1) * angleJitterDeg);
      this.angle = wrapAngle(this.angle + jitterRad);
      this.targetAngle = wrapAngle(this.targetAngle + jitterRad);
      this._spawnAngle = wrapAngle(this._spawnAngle + jitterRad);
    }

    const wakeDelayMs = Math.max(0, Number(attachment.mouthWakeDelayMs) || 0);
    const now = performance.now();
    this._mouthWakeAtMs = now + wakeDelayMs;
    this._nextMotionReleaseAtMs = now + Math.max(wakeDelayMs, this._motionReleaseIntervalMs() * 1.35);

    if (this._resumeOrbitAfterGrowth && this.orbit) {
      this.orbit = { ...this.orbit, enabled: true };
      this._orbitAngle = this._resolveInitialOrbitAngle();
      this._resumeOrbitAfterGrowth = false;
    }

    this._germinationAttachment = null;
    return true;
  }

  _updateAttachedGerminationBud() {
    const attachment = this._germinationAttachment;
    if (!attachment) return false;

    const parent = attachment.parent;
    if (!parent || parent.removed) {
      this._detachGerminationBud();
      return true;
    }

    const anchor = parent._surfaceSpawnPoint(attachment.settings ?? parent.germination ?? null);
    this.absorbing = null;
    this.dx = 0;
    this.dy = 0;
    this._positionFromGerminationAnchor(anchor);
    this._spawnX = this.x;
    this._spawnY = this.y;
    this.angle = parent.angle;
    this.targetAngle = parent.targetAngle;
    this._spawnAngle = parent._spawnAngle;
    this._idleDirFlip = parent._idleDirFlip;
    this._bodyIdleDirFlip = parent._bodyIdleDirFlip;
    this._bodyAngleOffset = parent._bodyAngleOffset;
    this._bodyMovementFollowOffset = parent._bodyMovementFollowOffset;

    if (this.radius + 0.0001 >= attachment.detachRadius || !(this._growthTargetRadius > this.radius)) {
      this._detachGerminationBud(anchor);
    }
    return true;
  }

  _spawnEggFromMarker() {
    const spawn = this._eggSpawnPoint();
    const egg = new Egg(spawn.x, spawn.y, Math.atan2(spawn.dirY, spawn.dirX));
    const baseRadius = 10;
    egg.radius = baseRadius;
    egg.displayRadius = baseRadius;
    egg.detached = true;
    egg.x = spawn.x;
    egg.y = spawn.y;
    egg.dx = spawn.dirX * 0.25;
    egg.dy = spawn.dirY * 0.25;
    egg.sourceEnemyRadius = baseRadius;
    egg.hatchEnemyRadius = 18;
    egg.sourceKind = "Macrophage";
    egg.sourceMacrophageSpriteIndex = this.spriteIndex;
    return egg;
  }

  _cloneBodyCircles() {
    return Array.isArray(this.bodyCircles)
      ? this.bodyCircles.map(circle => ({
          dx: Number(circle?.dx ?? 0),
          dy: Number(circle?.dy ?? 0),
          r: Math.max(2, Number(circle?.r ?? this.radius))
        }))
      : null;
  }

  _cloneDigestPath() {
    const path = this.digestPath ?? this._defaultDigestPath();
    return Object.fromEntries(
      getDigestPathPointKeys(path)
        .filter(key => path[key])
        .map(key => [
          key,
          {
            dx: Number(path[key]?.dx ?? 0),
            dy: Number(path[key]?.dy ?? 0)
          }
        ])
    );
  }

  _cloneBodyRotationSettings() {
    if (!this.bodyRotation || typeof this.bodyRotation !== "object") return null;
    return {
      ...this.bodyRotation,
      rotationRange: Array.isArray(this.bodyRotation.rotationRange)
        ? [...this.bodyRotation.rotationRange]
        : null,
      idleWave: this.bodyRotation.idleWave && typeof this.bodyRotation.idleWave === "object"
        ? { ...this.bodyRotation.idleWave }
        : null,
      movementFollow: this.bodyRotation.movementFollow && typeof this.bodyRotation.movementFollow === "object"
        ? { ...this.bodyRotation.movementFollow }
        : null
    };
  }

  _cloneOrbitSettings() {
    if (!this.orbit || typeof this.orbit !== "object") return null;
    return {
      ...this.orbit,
      segments: Array.isArray(this.orbit.segments)
        ? this.orbit.segments.map(segment => ({ ...segment }))
        : null,
      splinePoints: Array.isArray(this.orbit.splinePoints)
        ? this.orbit.splinePoints.map(point => ({ ...point }))
        : null,
      freeMove: this.orbit.freeMove && typeof this.orbit.freeMove === "object"
        ? { ...this.orbit.freeMove }
        : null
    };
  }

  _mirrorOffspringConfigX(config) {
    if (!config || typeof config !== "object") return config;

    const pivotDy = Number(config.bodyRotation?.pivotDy ?? 0) || 0;
    const mirrored = {
      ...config,
      spriteSettings: config.spriteSettings && typeof config.spriteSettings === "object"
        ? {
            ...config.spriteSettings,
            spriteFlipX: !(config.spriteSettings.spriteFlipX ?? false),
            spriteRotationOffset: -(Number(config.spriteSettings.spriteRotationOffset ?? 0) || 0)
          }
        : config.spriteSettings,
      bodyCircles: mirrorOffsetsAroundPivot(config.bodyCircles, pivotDy, "dy"),
      digestPath: mirrorDigestPath(config.digestPath, pivotDy)
    };

    if (config.mouth && typeof config.mouth === "object") {
      mirrored.mouth = {
        ...config.mouth,
        rotationDir: -Math.max(-1, Math.min(1, Number(config.mouth.rotationDir ?? 1) || 1)),
        rotationRange: mirrorRelativeRangeDeg(config.mouth.rotationRange, DEFAULTS.mouthRotationRange)
      };
    }

    if (config.bodyRotation && typeof config.bodyRotation === "object") {
      mirrored.bodyRotation = {
        ...config.bodyRotation,
        baseAngleDeg: mirrorAbsDeg(config.bodyRotation.baseAngleDeg ?? DEFAULTS.bodyRotationBaseAngleDeg),
        rotationDir: -Math.max(-1, Math.min(1, Number(config.bodyRotation.rotationDir ?? 1) || 1)),
        rotationRange: mirrorRelativeRangeDeg(config.bodyRotation.rotationRange, DEFAULTS.bodyRotationRange)
      };
    }

    if (config.eggSpawnSettings && typeof config.eggSpawnSettings === "object") {
      mirrored.eggSpawnSettings = {
        ...config.eggSpawnSettings,
        angleDeg: mirrorRelativeDeg(config.eggSpawnSettings.angleDeg ?? 0)
      };
    }

    if (config.germinationSettings && typeof config.germinationSettings === "object") {
      mirrored.germinationSettings = {
        ...config.germinationSettings,
        angleDeg: mirrorRelativeDeg(config.germinationSettings.angleDeg ?? 0)
      };
    }

    if (config.projectileSpawnSettings && typeof config.projectileSpawnSettings === "object") {
      mirrored.projectileSpawnSettings = {
        ...config.projectileSpawnSettings,
        angleDeg: mirrorRelativeDeg(config.projectileSpawnSettings.angleDeg ?? 0)
      };
    }

    if (config.orbitSettings && typeof config.orbitSettings === "object") {
      mirrored.orbitSettings = {
        ...config.orbitSettings,
        centerDx: -(Number(config.orbitSettings.centerDx ?? 0) || 0)
      };
      if (config.orbitSettings.freeMove && typeof config.orbitSettings.freeMove === "object") {
        mirrored.orbitSettings.freeMove = {
          ...config.orbitSettings.freeMove,
          directionDeg: mirrorAbsDeg(config.orbitSettings.freeMove.directionDeg ?? 0)
        };
      }
      if (Array.isArray(config.orbitSettings.segments)) {
        mirrored.orbitSettings.segments = config.orbitSettings.segments.map(segment => ({
          ...segment,
          centerDx: -(Number(segment?.centerDx ?? 0) || 0),
          startDeg: mirrorAbsDeg(segment?.endDeg ?? 0),
          endDeg: mirrorAbsDeg(segment?.startDeg ?? 0)
        }));
      }
      if (Array.isArray(config.orbitSettings.splinePoints)) {
        mirrored.orbitSettings.splinePoints = mirrorHorizontalOffsets(config.orbitSettings.splinePoints, "dx");
      }
    }

    return mirrored;
  }

  _cloneOffspringConfig() {
    return {
      bodyCircles: this._cloneBodyCircles(),
      mouth: this.mouth && typeof this.mouth === "object"
        ? {
            ...this.mouth,
            rotationRange: Array.isArray(this.mouth.rotationRange)
              ? [...this.mouth.rotationRange]
              : null
          }
        : null,
      digestPath: this._cloneDigestPath(),
      bodyRotation: this._cloneBodyRotationSettings(),
      bodyCiliaSettings: this.bodyCilia && typeof this.bodyCilia === "object"
        ? {
            ...this.bodyCilia,
            segments: Array.isArray(this.bodyCilia.segments)
              ? this.bodyCilia.segments.map(segment => ({ ...segment }))
              : null
          }
        : null,
      spriteSettings: { ...this.spriteCfg, instanceIndex: this.instanceIndex, spriteIndex: this.spriteIndex },
      orbitSettings: this._cloneOrbitSettings(),
      absorbTargetSettings: this.absorbTargets && typeof this.absorbTargets === "object"
        ? { ...this.absorbTargets }
        : null,
      eggSpawnSettings: this.eggSpawn && typeof this.eggSpawn === "object"
        ? { ...this.eggSpawn }
        : null,
      germinationSettings: this.germination && typeof this.germination === "object"
        ? { ...this.germination }
        : null,
      projectileSpawnSettings: this.projectileSpawn && typeof this.projectileSpawn === "object"
        ? { ...this.projectileSpawn }
        : null,
      growthSettings: this.growth && typeof this.growth === "object"
        ? { ...this.growth }
        : null
    };
  }

  _spawnMacrophageFromGermination() {
    if (!(this.germination?.enabled ?? DEFAULTS.germinationEnabled)) return null;

    const spawn = this._germinationPoint();
    const clone = this.germination?.mirrorOffspringX
      ? this._mirrorOffspringConfigX(this._cloneOffspringConfig())
      : this._cloneOffspringConfig();
    const child = new Macrophage(
      spawn.x,
      spawn.y,
      this.radius,
      this.color,
      clone.bodyCircles,
      clone.mouth,
      clone.digestPath,
      clone.bodyRotation,
      clone.spriteSettings,
      clone.orbitSettings,
      clone.absorbTargetSettings,
      clone.eggSpawnSettings,
      clone.germinationSettings,
      clone.projectileSpawnSettings,
      clone.growthSettings,
      clone.bodyCiliaSettings
    );

    // Preserve the visible bud position even for orbiting variants whose
    // constructor snaps them onto their own orbit path.
    const shiftX = spawn.x - child.x;
    const shiftY = spawn.y - child.y;
    child.x += shiftX;
    child.y += shiftY;
    child._spawnX += shiftX;
    child._spawnY += shiftY;

    const targetRadius = this.radius;
    const startRadius = Math.max(2, targetRadius * (this.germination?.startScale ?? DEFAULTS.germinationStartScale));
    const startScale = clamp(startRadius / Math.max(targetRadius, 0.0001), 0.1, 1);
    const detachScale = clamp(
      this.germination?.detachScale ?? DEFAULTS.germinationDetachScale,
      startScale,
      1
    );
    const detachRadius = targetRadius * detachScale;
    if (startRadius + 0.0001 < detachRadius) {
      child.setRadius(startRadius);
      child._growthTargetRadius = detachRadius;
      child._growthRate = Math.max(0.001, this.germination?.growthRate ?? DEFAULTS.germinationGrowthRate);
    }
    child._attachGerminationBud(
      this,
      this.germination,
      detachRadius,
      this.germination?.launchSpeed ?? DEFAULTS.germinationLaunchSpeed
    );
    child._isGerminatedOffspring = true;
    child._positionFromGerminationAnchor(spawn);
    child._spawnX = child.x;
    child._spawnY = child.y;
    if (child._orbitEnabled() && child._orbitMode() !== "free" && child.orbit) {
      child.orbit = { ...child.orbit, enabled: false };
      child._resumeOrbitAfterGrowth = true;
    }
    child.bounceForce = this.bounceForce;
    child.wallBounce = this.wallBounce;
    child.animationPhaseMs = this.animationPhaseMs;
    child.angle = this.angle;
    child.targetAngle = this.targetAngle;
    child._spawnAngle = this._spawnAngle;
    child._idleDirFlip = this._idleDirFlip;
    child._bodyIdleDirFlip = this._bodyIdleDirFlip;
    child._bodyAngleOffset = this._bodyAngleOffset;
    child._bodyMovementFollowOffset = this._bodyMovementFollowOffset;
    return child;
  }

  _updateGrowth() {
    if (!(this._growthTargetRadius > this.radius) || !(this._growthRate > 0)) return;

    const nextRadius = Math.min(this._growthTargetRadius, this.radius + this._growthRate);
    if (nextRadius > this.radius + 0.0001) {
      this.setRadius(nextRadius);
    }

    if (nextRadius >= this._growthTargetRadius - 0.0001) {
      this.setRadius(this._growthTargetRadius);
      this._growthTargetRadius = null;
      this._growthRate = 0;
      if (this._resumeOrbitAfterGrowth && !this._isAttachedGerminationBud() && this.orbit) {
        this.orbit = { ...this.orbit, enabled: true };
        this._resumeOrbitAfterGrowth = false;
      }
    }
  }

  _canGrowFromAbsorb() {
    return this.growth?.enabled ?? DEFAULTS.growthEnabled;
  }

  _growthPerAbsorb() {
    return Math.max(0, this.growth?.perAbsorb ?? DEFAULTS.growthPerAbsorb);
  }

  _growthMaxRadius() {
    return Math.max(2, this.growth?.maxRadius ?? DEFAULTS.growthMaxRadius);
  }

  _growthRatePerUpdate() {
    return Math.max(0.001, this.growth?.growthRate ?? DEFAULTS.growthRate);
  }

  _shouldGrowFromTarget(target) {
    if (!this._canGrowFromAbsorb()) return false;
    if (!target || target.isProjectile || target.isPlayer || target.isEnemy) return false;
    return target.tintGroup === "red" || target.tintGroup === "green";
  }

  _applyAbsorbGrowth(target) {
    if (!this._shouldGrowFromTarget(target)) return;

    const maxRadius = this._growthMaxRadius();
    const currentTarget = Math.max(
      this.radius,
      Number.isFinite(this._growthTargetRadius) ? this._growthTargetRadius : this.radius
    );
    if (!(maxRadius > currentTarget)) return;

    const nextTarget = Math.min(maxRadius, currentTarget + this._growthPerAbsorb());
    if (!(nextTarget > currentTarget + 0.0001)) return;

    this._growthTargetRadius = nextTarget;
    this._growthRate = Math.max(this._growthRate || 0, this._growthRatePerUpdate());
  }

  _canAbsorbTarget(target) {
    if (!target || target === this) return false;
    if (target.absorbed || target.removed) return false;
    if (!Number.isFinite(target.x) || !Number.isFinite(target.y) || !Number.isFinite(target.radius)) return false;

    if (target.isProjectile) return this._canAbsorbProjectiles();
    if (target.isPlayer) return this._canAbsorbPlayer() && typeof target.canBeCaptured === "function" && target.canBeCaptured();
    if (target.isEnemy) return this._canAbsorbEnemy();

    return this._canAbsorbParticles() && (target.tintGroup === "red" || target.tintGroup === "green");
  }

  _buildAbsorbCandidates(particles, enemies = []) {
    const candidates = Array.isArray(particles) ? [...particles] : [];
    if (this._canAbsorbEnemy() && Array.isArray(enemies) && enemies.length > 0) {
      candidates.push(...enemies);
    }
    return candidates;
  }

  findNearestEdible(candidates) {
    let nearest = null;
    let nearestDist = Infinity;

    for (const p of candidates) {
      if (!this._canAbsorbTarget(p)) continue;

      const dx = p.x - this.x;
      const dy = p.y - this.y;
      const d  = Math.hypot(dx, dy);

      if (d < nearestDist) { nearestDist = d; nearest = p; }
    }
    return { target: nearest, distance: nearestDist };
  }

  isInMouthZone(p) {
    if (!this._canAbsorbTarget(p)) return false;

    const mouth = this._mouthPoint();
    const mx = mouth.x;
    const my = mouth.y;

    if (Math.hypot(p.x - mx, p.y - my) > this._mouthAbsorbRadius() + p.radius) return false;

    const cx   = p.x - this.x;
    const cy   = p.y - this.y;
    const cLen = Math.hypot(cx, cy) || 0.0001;

    const worldAngle = this._worldMouthAngle();
    return Math.cos(worldAngle) * (cx / cLen) + Math.sin(worldAngle) * (cy / cLen) > 0.75;
  }

  absorbStep(target) {
    if (!target || target.absorbed || target.removed) { this.absorbing = null; return false; }

    const mouth = this._mouthPoint();
    const mx   = mouth.x;
    const my   = mouth.y;
    const dx   = target.x - mx;
    const dy   = target.y - my;
    const dist = Math.hypot(dx, dy) || 0.0001;

    const pull = Math.min(dist, DEFAULTS.pullStrength);
    target.x -= (dx / dist) * pull;
    target.y -= (dy / dist) * pull;
    if (typeof target.dx === "number") target.dx *= DEFAULTS.absorbFriction;
    if (typeof target.dy === "number") target.dy *= DEFAULTS.absorbFriction;

    const minTargetRadius = target.isPlayer && typeof target.getMinRadius === "function"
      ? target.getMinRadius()
      : 0;
    const rate = Math.min(DEFAULTS.absorbRate, Math.max(0, target.radius - minTargetRadius));
    target.radius = Math.max(minTargetRadius, target.radius - rate);

    if (!target.isPlayer && target.radius <= 0.05) {
      if (target.isEnemy) target.removed = true;
      else target.absorbed = true;
      this.absorbing = null;
      return true;
    }
    return false;
  }

  _spawnBead() {
    if (this.gitBeads.length >= DEFAULTS.maxBeads) return;
    const start = this._getDigestPathPoints().start ?? { x: this.x, y: this.y };
    this.gitBeads.push({
      t: 0,
      justSpawned: true,
      spawnAtMs: performance.now(),
      spawnX: start.x,
      spawnY: start.y
    });
  }

  _beadDisplayScale(state, now = performance.now()) {
    if (!state || !Number.isFinite(state.spawnAtMs)) return 1;
    const duration = Math.max(1, Number(DEFAULTS.beadGrowDurationMs) || 220);
    const t = clamp((now - state.spawnAtMs) / duration, 0, 1);
    // Smoothly ramp the bead from tiny to full size.
    return t * t * (3 - 2 * t);
  }

  _advanceDigestState(state) {
    if (!state) return { arrived: false, pos: { x: this.x, y: this.y } };

    const pos = state.justSpawned && Number.isFinite(state.spawnX) && Number.isFinite(state.spawnY)
      ? { x: state.spawnX, y: state.spawnY }
      : this._beadPos(state.t);

    if (state.justSpawned) {
      state.justSpawned = false;
      return { arrived: false, pos };
    }

    state.t += DEFAULTS.beadDriftSpeed;
    return { arrived: state.t >= 1.0, pos };
  }

  _updateBeads() {
    let arrived = 0;
    for (const b of this.gitBeads) {
      const result = this._advanceDigestState(b);
      if (result.arrived) arrived++;
    }
    if (arrived > 0) {
      this.gitBeads = this.gitBeads.filter(b => b.t < 1.0);
      this.excretionQueue += arrived;
    }
  }

  _capturePlayer(target) {
    if (!target || this.capturedPlayer || this.absorbing) return false;
    if (typeof target.beginMacrophageCapture !== "function" || !target.beginMacrophageCapture(this)) return false;

    this.capturedPlayer = target;
    const start = this._getDigestPathPoints().start ?? { x: this.x, y: this.y };
    this.capturedPlayerDigestState = {
      t: 0,
      justSpawned: true,
      spawnX: start.x,
      spawnY: start.y
    };
    target.x = start.x;
    target.y = start.y;
    target.dx = 0;
    target.dy = 0;
    return true;
  }

  _releaseCapturedPlayer() {
    if (!this.capturedPlayer) return;

    const target = this.capturedPlayer;
    const exit = this._digestExit();
    const releaseRadius = Math.max(1, Number(DEFAULTS.capturedPlayerReleaseRadius) || 3);
    const releaseSpeed = Math.max(0.1, Number(DEFAULTS.capturedPlayerReleaseSpeed) || 1);
    const x = exit.x + exit.dirX * (releaseRadius + 4);
    const y = exit.y + exit.dirY * (releaseRadius + 4);

    target.releaseFromMacrophage(
      x,
      y,
      exit.dirX * releaseSpeed,
      exit.dirY * releaseSpeed,
      releaseRadius
    );

    this.capturedPlayer = null;
    this.capturedPlayerDigestState = null;
  }

  _updateCapturedPlayer() {
    if (!this.capturedPlayer || !this.capturedPlayerDigestState) return;

    if (this.capturedPlayer.removed || this.capturedPlayer.absorbed) {
      this.capturedPlayer = null;
      this.capturedPlayerDigestState = null;
      return;
    }

    const state = this.capturedPlayerDigestState;
    const result = this._advanceDigestState(state);
    const pos = result.pos;
    this.capturedPlayer.x = pos.x;
    this.capturedPlayer.y = pos.y;
    this.capturedPlayer.dx = 0;
    this.capturedPlayer.dy = 0;

    if (result.arrived) this._releaseCapturedPlayer();
  }

  _updateExcretion(playerRadius) {
    if (!this.excretionActive && this.excretionQueue <= 0) return null;

    if (!this.excretionActive && this.excretionQueue > 0) {
      this.excretionActive = true;
      this.excretionRadius = 1;
      this.excretionQueue--;
    }

    if (!this.excretionActive) return null;

    this.excretionRadius = Math.min(
      this.excretionRadius + DEFAULTS.excretionGrowRate,
      DEFAULTS.excretionTargetRadius
    );

    if (this.excretionRadius >= DEFAULTS.excretionTargetRadius) {
      this.excretionActive = false;

      const exit       = this._digestExit();
      const cx         = exit.x + exit.dirX * this.excretionRadius;
      const cy         = exit.y + exit.dirY * this.excretionRadius;

      const tintGreen = makeTintGreen();
      const tintRed   = makeTintRed();
      const pr        = playerRadius ?? 20;
      const tintGroup = this.excretionRadius > pr ? "red" : "green";
      const color     = tintGroup === "red" ? tintRed : tintGreen;
      const speed     = 0.5 + Math.random() * 0.5;

      const p = new Particle(
        cx, cy,
        this.excretionRadius,
        exit.dirX * speed,
        exit.dirY * speed,
        color, false, false
      );
      p.tintGroup = tintGroup;
      p.tintGreen = tintGreen;
      p.tintRed   = tintRed;
      return p;
    }

    return null;
  }

  _maybeReleaseMotionParticle(now, playerRadius, extraSpeed = 0) {
    if (!this._isMouthAwake(now)) return null;
    if (Number.isFinite(this._nextMotionReleaseAtMs) && now < this._nextMotionReleaseAtMs) return null;
    const particle = this._releaseMotionParticleFromVelocity(playerRadius, extraSpeed);
    this._nextMotionReleaseAtMs = now + this._motionReleaseIntervalMs();
    return particle;
  }

  _releaseMotionParticleFromVelocity(playerRadius, extraSpeed = 0) {
    const dirLength = Math.hypot(this.dx, this.dy);
    if (dirLength < MOTION_RELEASE_MIN_SPEED) return null;

    const dirX = this.dx / dirLength;
    const dirY = this.dy / dirLength;
    const releaseRadius = Math.max(0.5, Number(ProjectileDefaults.radius) || 1);
    const spawn = this._projectileSpawnPoint();
    const cx = spawn.x + spawn.dirX * (releaseRadius + MOTION_RELEASE_SURFACE_OFFSET);
    const cy = spawn.y + spawn.dirY * (releaseRadius + MOTION_RELEASE_SURFACE_OFFSET);
    const speed = MOTION_RELEASE_BASE_SPEED + dirLength * MOTION_RELEASE_VELOCITY_CARRY + Math.max(0, extraSpeed || 0);

    const tintGreen = makeTintGreen();
    const tintRed = makeTintRed();
    const pr = playerRadius ?? 20;
    const tintGroup = releaseRadius > pr ? "red" : "green";
    const color = tintGroup === "red" ? tintRed : tintGreen;

    const p = new Projectile(
      cx, cy,
      this.dx * 0.45 - dirX * speed,
      this.dy * 0.45 - dirY * speed,
      releaseRadius,
      color
    );
    return p;
  }

  _idleSpin() {
    if (!this._mouthEnabled()) return;

    const range   = this._mouthRotationRange();
    const spinMag = this._mouthIdleSpin();
    const dir     = this._mouthRotationDir();
    const spin    = spinMag * dir * this._idleDirFlip;

    if (!range) {
      this.angle = wrapAngle(this.angle + spin);
      return;
    }

    const minRad = this._spawnAngle + range[0] * (Math.PI / 180);
    const maxRad = this._spawnAngle + range[1] * (Math.PI / 180);

    this.angle += spin;

    if (this.angle > maxRad) {
      this.angle        = maxRad;
      this._idleDirFlip = -1;
    } else if (this.angle < minRad) {
      this.angle        = minRad;
      this._idleDirFlip = 1;
    }

    this.angle = wrapAngle(this.angle);
  }

  _updateBodyRotation(now = performance.now()) {
    if (this._bodyRotationEnabled()) {
      const spin = this._bodyIdleSpin(now) * this._bodyRotationDir() * this._bodyIdleDirFlip;
      if (spin) {
        const range = this._bodyRotationRange();
        if (!range) {
          this._bodyAngleOffset = wrapAngle(this._bodyAngleOffset + spin);
        } else {
          const minRad = range[0] * (Math.PI / 180);
          const maxRad = range[1] * (Math.PI / 180);
          if (this._bodyRotationMode() === "loop") {
            const span = maxRad - minRad;
            if (span <= 0.000001) {
              this._bodyAngleOffset = minRad;
            } else {
              let next = this._bodyAngleOffset + spin;
              while (next > maxRad) next -= span;
              while (next < minRad) next += span;
              this._bodyAngleOffset = next;
            }
          } else {
            this._bodyAngleOffset += spin;
            if (this._bodyAngleOffset > maxRad) {
              this._bodyAngleOffset = maxRad;
              this._bodyIdleDirFlip = -1;
            } else if (this._bodyAngleOffset < minRad) {
              this._bodyAngleOffset = minRad;
              this._bodyIdleDirFlip = 1;
            }
          }
        }
      }
    }

    if (!this._bodyMovementFollowEnabled()) {
      this._bodyMovementFollowOffset = approachAngle(this._bodyMovementFollowOffset, 0, this._bodyMovementFollowSmoothing());
      return;
    }

    const speed = Math.hypot(this.dx, this.dy);
    if (speed < this._bodyMovementFollowMinSpeed()) {
      this._bodyMovementFollowOffset = approachAngle(this._bodyMovementFollowOffset, 0, this._bodyMovementFollowSmoothing());
      return;
    }

    const movementAngle = Math.atan2(this.dy, this.dx);
    const baseRelativeTarget = wrapAngle(movementAngle - this._bodyBaseAngle() - this._bodyAngleOffset);
    const targetOffset = wrapAngle(baseRelativeTarget * this._bodyMovementFollowStrength());
    this._bodyMovementFollowOffset = approachAngle(
      this._bodyMovementFollowOffset,
      targetOffset,
      this._bodyMovementFollowSmoothing()
    );
  }

  _clampAngle() {
    const range = this._mouthRotationRange();
    if (!range) return;

    const minRad = this._spawnAngle + range[0] * (Math.PI / 180);
    const maxRad = this._spawnAngle + range[1] * (Math.PI / 180);

    if (this.angle < minRad) this.angle = minRad;
    if (this.angle > maxRad) this.angle = maxRad;
  }

  update(particles, playerRadius, options = null) {
    const now = performance.now();
    const mouthAwake = this._isMouthAwake(now);
    this._updateGrowth();
    if (this._updateAttachedGerminationBud()) {
      return {
        particles: [],
        particle: null,
        egg: null,
        macrophage: null
      };
    }
    const spawnedParticles = [];
    if (this._orbitMode() === "free") {
      spawnedParticles.push(...this._advanceFreeMove(now, playerRadius));
      const bounceParticle = this._bounceInsideBounds(options?.bounds ?? null, playerRadius);
      if (bounceParticle) spawnedParticles.push(bounceParticle);
    } else {
      this._advanceOrbit();
      this.dx = 0;
      this.dy = 0;
    }
    const candidates = this._buildAbsorbCandidates(particles, options?.enemies ?? []);
    this._updateCapturedPlayer();

    let spawnedEgg = null;
    let spawnedMacrophage = null;

    if (this.capturedPlayer) {
      if (mouthAwake && this._mouthTurnEnabled()) this._idleSpin();
    } else if (!this.absorbing) {
      const { target } = mouthAwake ? this.findNearestEdible(candidates) : { target: null };

      if (mouthAwake && target && this._mouthEnabled() && this._mouthTurnEnabled()) {
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        this.targetAngle = wrapAngle(Math.atan2(dy, dx) - this._bodyWorldAngle());
        this.angle = approachAngle(this.angle, this.targetAngle, this._mouthTurnRate());
        this._clampAngle();
      } else if (mouthAwake && this._mouthTurnEnabled()) {
        this._idleSpin();
      }

      if (mouthAwake) {
        for (const p of candidates) {
          if (!this.isInMouthZone(p)) continue;
          if (p.isPlayer) {
            if (this._capturePlayer(p)) break;
            continue;
          }
          this.absorbing = p;
          break;
        }
      }
    } else {
      const absorbedTarget = this.absorbing;
      const done = this.absorbStep(absorbedTarget);
      if (done) {
        this._applyAbsorbGrowth(absorbedTarget);
        this._spawnBead();
        this._absorbedSinceLastEgg += 1;
        if (this._absorbedSinceLastEgg >= (this.eggSpawn?.feedCount ?? DEFAULTS.eggSpawnFeedCount)) {
          this._absorbedSinceLastEgg = 0;
          spawnedEgg = this._spawnEggFromMarker();
        }
        if (this.germination?.enabled ?? DEFAULTS.germinationEnabled) {
          this._absorbedSinceLastGermination += 1;
          if (this._absorbedSinceLastGermination >= (this.germination?.feedCount ?? DEFAULTS.germinationFeedCount)) {
            this._absorbedSinceLastGermination = 0;
            spawnedMacrophage = this._spawnMacrophageFromGermination();
          }
        }
      }
    }

    this._updateBodyRotation(now);
    this._updateBeads();
    const excretionParticle = this._updateExcretion(playerRadius);
    if (excretionParticle) spawnedParticles.push(excretionParticle);
    return {
      particles: spawnedParticles,
      particle: null,
      egg: spawnedEgg,
      macrophage: spawnedMacrophage
    };
  }

  draw(ctx) {
    const drawNow = performance.now();
    this._drawBodySpriteOrFallback(ctx);
    this._drawBodyCilia(ctx, drawNow);
    this._drawMouthCilia(ctx, drawNow);

    ctx.save();
    ctx.beginPath();
    for (const circle of this._getBodyCircles()) {
      ctx.moveTo(circle.cx + Math.max(0, circle.r - 1), circle.cy);
      ctx.arc(circle.cx, circle.cy, Math.max(0, circle.r - 1), 0, Math.PI * 2);
    }
    ctx.clip();

    const br     = this._beadRadius;
    const sorted = [...this.gitBeads]
      .map(bead => ({ type: "bead", t: bead.t, bead }))
      .sort((a, b) => a.t - b.t);
    const capturedState = this.capturedPlayerDigestState;
    if (this.capturedPlayer && capturedState) {
      sorted.push({ type: "player", t: capturedState.t, bead: capturedState });
      sorted.sort((a, b) => a.t - b.t);
    }

    if (this.sprite?.debug && sorted.length >= 2) {
      const path = this._getDigestPathPoints();
      const keys = getDigestPathPointKeys(path).filter(key => path[key]);
      const points = keys.map(key => path[key]);
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      const steps = Math.max(24, points.length * 14);
      for (let i = 1; i <= steps; i++) {
        const pos = bezierPoint(points, i / steps);
        ctx.lineTo(pos.x, pos.y);
      }
      ctx.strokeStyle = "rgba(255, 220, 80, 0.40)";
      ctx.lineWidth   = 1.5;
      ctx.stroke();
    }

    for (const item of sorted) {
      const bead = item.bead;
      const pos = bead?.justSpawned && Number.isFinite(bead.spawnX) && Number.isFinite(bead.spawnY)
        ? { x: bead.spawnX, y: bead.spawnY }
        : this._beadPos(item.t);
      const beadScale = item.type === "bead" ? this._beadDisplayScale(bead, drawNow) : 1;
      const beadRadius = Math.max(0.2, br * beadScale);

      if (item.type === "player" && this.capturedPlayer) {
        this.capturedPlayer.drawDigestForm(ctx, pos.x, pos.y, br, 0.96);
        continue;
      }

      ctx.save();
      ctx.shadowColor = "rgba(220, 235, 255, 0.16)";
      ctx.shadowBlur = beadRadius * 1.45;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, beadRadius * 1.85, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(225, 236, 255, 0.055)";
      ctx.fill();
      ctx.closePath();
      ctx.restore();

      const grad = ctx.createRadialGradient(
        pos.x - beadRadius * 0.28, pos.y - beadRadius * 0.32, beadRadius * 0.08,
        pos.x, pos.y, beadRadius
      );
      grad.addColorStop(0, "rgba(72, 72, 78, 0.94)");
      grad.addColorStop(0.45, "rgba(22, 22, 26, 0.97)");
      grad.addColorStop(1, "rgba(4, 4, 6, 0.99)");

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, beadRadius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.closePath();
    }

    ctx.restore();

    if (this.excretionActive && this.excretionRadius > 0) {
      const exit       = this._digestExit();
      const er         = this.excretionRadius;
      const ecx        = exit.x + exit.dirX * er;
      const ecy        = exit.y + exit.dirY * er;
      const fraction   = er / DEFAULTS.excretionTargetRadius;

      ctx.save();
      ctx.shadowColor = `rgba(120, 255, 100, ${0.25 + fraction * 0.55})`;
      ctx.shadowBlur  = 6 + fraction * 14;

      const grad = ctx.createRadialGradient(
        ecx - er * 0.25, ecy - er * 0.25, er * 0.05,
        ecx, ecy, er
      );
      grad.addColorStop(0,    "rgba(255, 255, 220, 0.97)");
      grad.addColorStop(0.55, "rgba(160, 255, 110, 0.90)");
      grad.addColorStop(1,    "rgba(60, 190, 50, 0.85)");

      ctx.beginPath();
      ctx.arc(ecx, ecy, er, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.closePath();

      ctx.beginPath();
      ctx.arc(ecx, ecy, er, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(100, 220, 80, ${0.3 + fraction * 0.4})`;
      ctx.lineWidth   = 1.5;
      ctx.stroke();
      ctx.closePath();

      ctx.restore();
    }

    if (this.sprite?.debug) {
      const mouth = this._mouthCircle();
      if (!mouth) return;
      const mx = mouth.x;
      const my = mouth.y;

      const oral = this._transformBodyLocalPoint(0, 0);
      ctx.beginPath();
      ctx.moveTo(oral.x, oral.y);
      ctx.lineTo(mx, my);
      ctx.lineWidth   = 3;
      ctx.strokeStyle = "rgba(235, 215, 255, 0.95)";
      ctx.stroke();
      ctx.closePath();

      ctx.beginPath();
      ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
      ctx.arc(mx, my, Math.max(4, mouth.r * 0.25), 0, Math.PI * 2);
      ctx.fill();
      ctx.closePath();
    }
  }
}
