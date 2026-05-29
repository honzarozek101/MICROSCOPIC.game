import { Particle } from "./Particle.js";
import { ComposedStone, DEFAULTS as COMPOSED_STONE_DEFAULTS } from "./ComposedStone.js";
import {
  buildSpriteAssetCandidatePaths,
  getSpriteImage,
  normalizeSpriteIndex,
  preloadImage
} from "./spriteAssets.js";

export const DEFAULTS = {
  ...COMPOSED_STONE_DEFAULTS,
  radius: 30,
  circles: [
    { dx: 0, dy: 0, r: 30 },
    { dx: 22, dy: -6, r: 17 },
    { dx: -18, dy: 14, r: 15 },
    { dx: 10, dy: 22, r: 12 }
  ],
  spriteScale: 1.08,
  spriteReferenceRadius: 30,
  spriteDebug: false,
  absorbImpulseTransfer: 0.12,
  maxStoredProjectiles: 18,
  productionPerProjectile: 1,
  productionIntervalMs: 420,
  maxProducedPerTick: 2,
  particleRadius: 3.4,
  particleSpeed: 1.45,
  particleSpread: 0.9,
  particleColor: "rgba(110, 226, 140, 0.88)",
  particleSpriteIndex: 1,
  particleTintGroup: "green",
  germinationEnabled: false,
  germinationFeedCount: 10,
  germinationBodyCircleIndex: 2,
  germinationAngleDeg: -30,
  germinationStartScale: 0.34,
  germinationGrowthRate: 0.08,
  germinationDetachScale: 0.6,
  germinationLaunchSpeed: 0.35,
  germinationMirrorOffspringX: false,
  germinationLaunchJitter: 0.18,
  germinationInitialAngleJitterDeg: 8
};

function clampPositive(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

function wrapAngle(angle) {
  const twoPi = Math.PI * 2;
  return ((angle % twoPi) + twoPi) % twoPi;
}

const ALGAE_SPRITE_DISCOVERY_LIMIT = 64;
const discoveredAlgaeSpriteIndexes = new Set([normalizeSpriteIndex(DEFAULTS.spriteIndex, 1)]);
let algaeSpriteDiscoveryStarted = false;

function formatAlgaeSpriteIndex(index) {
  return String(normalizeSpriteIndex(index, 1)).padStart(2, "0");
}

function getAlgaeSpriteSubfolder(index) {
  return `Algae_${formatAlgaeSpriteIndex(index)}`;
}

function rememberAlgaeSpriteIndex(index) {
  const spriteIndex = normalizeSpriteIndex(index, 1);
  if (spriteIndex > 0) discoveredAlgaeSpriteIndexes.add(spriteIndex);
}

function rememberAlgaeSpriteSubfolder(subfolder) {
  if (typeof subfolder !== "string") return;
  const match = subfolder.match(/Algae_(\d+)/i);
  if (match) rememberAlgaeSpriteIndex(Number(match[1]));
}

async function probeAlgaeSpriteIndex(index) {
  if (typeof Image === "undefined") return false;

  const spriteIndex = normalizeSpriteIndex(index, 1);
  const paths = buildSpriteAssetCandidatePaths({
    folder: "Algae",
    subfolder: getAlgaeSpriteSubfolder(spriteIndex),
    family: "algae",
    index: spriteIndex
  });

  const images = await Promise.all(paths.map(path => preloadImage(path).catch(() => null)));
  const found = images.some(img => img?.naturalWidth > 0);
  if (found) rememberAlgaeSpriteIndex(spriteIndex);
  return found;
}

function discoverAlgaeSpriteIndexesFromDirectory() {
  if (typeof window === "undefined" || typeof fetch !== "function") return;

  try {
    const directoryUrl = new URL("./src/Algae/", window.location.href);
    fetch(directoryUrl.href, { cache: "force-cache" })
      .then(response => response.ok ? response.text() : "")
      .then(html => {
        const matches = html.matchAll(/Algae_(\d+)/gi);
        for (const match of matches) rememberAlgaeSpriteIndex(Number(match[1]));
      })
      .catch(() => {});
  } catch {}
}

function discoverAvailableAlgaeSpriteIndexes() {
  if (algaeSpriteDiscoveryStarted) return;
  algaeSpriteDiscoveryStarted = true;
  discoverAlgaeSpriteIndexesFromDirectory();
  (async () => {
    let foundAny = false;
    let missesAfterFound = 0;
    for (let i = 1; i <= ALGAE_SPRITE_DISCOVERY_LIMIT; i++) {
      const found = await probeAlgaeSpriteIndex(i);
      if (found) {
        foundAny = true;
        missesAfterFound = 0;
        continue;
      }
      if (foundAny) {
        missesAfterFound += 1;
        if (missesAfterFound >= 2) break;
      }
    }
  })();
}

function randomAlgaeOffspringSpriteOptions(fallbackIndex = DEFAULTS.spriteIndex) {
  discoverAvailableAlgaeSpriteIndexes();
  const indexes = [...discoveredAlgaeSpriteIndexes]
    .filter(index => Number.isFinite(index) && index > 0)
    .sort((a, b) => a - b);
  const fallback = normalizeSpriteIndex(fallbackIndex, DEFAULTS.spriteIndex);
  const spriteIndex = indexes.length > 0
    ? indexes[Math.floor(Math.random() * indexes.length)]
    : fallback;

  return {
    spriteIndex,
    spriteSubfolder: getAlgaeSpriteSubfolder(spriteIndex)
  };
}

export class Algae extends ComposedStone {
  constructor(x, y, circles = DEFAULTS.circles, color = DEFAULTS.color, opts = {}) {
    discoverAvailableAlgaeSpriteIndexes();
    rememberAlgaeSpriteIndex(opts.spriteIndex ?? DEFAULTS.spriteIndex);
    rememberAlgaeSpriteSubfolder(opts.spriteSubfolder);

    super(x, y, circles, color, {
      ...opts,
      spriteIndex: normalizeSpriteIndex(opts.spriteIndex, DEFAULTS.spriteIndex),
      spriteScale: Number.isFinite(Number(opts.spriteScale)) ? Number(opts.spriteScale) : DEFAULTS.spriteScale,
      spriteReferenceRadius: Number.isFinite(Number(opts.spriteReferenceRadius))
        ? Number(opts.spriteReferenceRadius)
        : DEFAULTS.spriteReferenceRadius,
      spriteRotationOffset: Number.isFinite(Number(opts.spriteRotationOffset))
        ? Number(opts.spriteRotationOffset)
        : DEFAULTS.spriteRotationOffset,
      spriteBodyU: Number.isFinite(Number(opts.spriteBodyU)) ? Number(opts.spriteBodyU) : DEFAULTS.spriteBodyU,
      spriteBodyV: Number.isFinite(Number(opts.spriteBodyV)) ? Number(opts.spriteBodyV) : DEFAULTS.spriteBodyV,
      spriteDebug: opts.spriteDebug == null ? DEFAULTS.spriteDebug : !!opts.spriteDebug,
      spriteSubfolder: typeof opts.spriteSubfolder === "string" ? opts.spriteSubfolder : DEFAULTS.spriteSubfolder
    });

    this.type = "Algae";
    this.absorbImpulseTransfer = clampPositive(opts.absorbImpulseTransfer, DEFAULTS.absorbImpulseTransfer);
    this.maxStoredProjectiles = Math.max(1, Math.round(clampPositive(opts.maxStoredProjectiles, DEFAULTS.maxStoredProjectiles)));
    this.productionPerProjectile = Math.max(1, Math.round(clampPositive(opts.productionPerProjectile, DEFAULTS.productionPerProjectile)));
    this.productionIntervalMs = Math.max(16, Math.round(clampPositive(opts.productionIntervalMs, DEFAULTS.productionIntervalMs)));
    this.maxProducedPerTick = Math.max(1, Math.round(clampPositive(opts.maxProducedPerTick, DEFAULTS.maxProducedPerTick)));
    this.particleRadius = clampPositive(opts.particleRadius, DEFAULTS.particleRadius);
    this.particleSpeed = clampPositive(opts.particleSpeed, DEFAULTS.particleSpeed);
    this.particleSpread = clampPositive(opts.particleSpread, DEFAULTS.particleSpread);
    this.particleColor = typeof opts.particleColor === "string" && opts.particleColor.trim()
      ? opts.particleColor
      : DEFAULTS.particleColor;
    this.particleSpriteIndex = normalizeSpriteIndex(opts.particleSpriteIndex, DEFAULTS.particleSpriteIndex);
    this.particleTintGroup = opts.particleTintGroup === "red" ? "red" : DEFAULTS.particleTintGroup;
    this.germination = this._normalizeGerminationSettings(opts.germinationSettings ?? opts.germination);

    this.storedProjectiles = Math.max(0, Math.min(
      this.maxStoredProjectiles,
      Math.round(Number(opts.storedProjectiles ?? 0) || 0)
    ));
    this._lastProductionAtMs = performance.now();
    this._absorbedSinceLastGermination = 0;
    this._pendingGerminationSpawns = 0;
    this._germinationAttachment = null;
    this._isGerminatedOffspring = false;
    this._growthTargetRadius = null;
    this._growthRate = 0;
  }

  _getSpriteSubfolder() {
    if (this.spriteSubfolder?.trim()) return this.spriteSubfolder.trim();
    return `Algae_${String(normalizeSpriteIndex(this.spriteIndex, 1)).padStart(2, "0")}`;
  }

  _getSpriteImage() {
    return getSpriteImage({
      folder: "Algae",
      subfolder: this._getSpriteSubfolder(),
      family: "algae",
      index: normalizeSpriteIndex(this.spriteIndex, 1)
    });
  }

  _normalizeGerminationSettings(s) {
    if (!s || typeof s !== "object") {
      return {
        enabled: DEFAULTS.germinationEnabled,
        bodyCircleIndex: DEFAULTS.germinationBodyCircleIndex,
        angleDeg: DEFAULTS.germinationAngleDeg,
        feedCount: DEFAULTS.germinationFeedCount,
        startScale: DEFAULTS.germinationStartScale,
        growthRate: DEFAULTS.germinationGrowthRate,
        detachScale: DEFAULTS.germinationDetachScale,
        launchSpeed: DEFAULTS.germinationLaunchSpeed,
        mirrorOffspringX: DEFAULTS.germinationMirrorOffspringX,
        launchJitter: DEFAULTS.germinationLaunchJitter,
        initialAngleJitterDeg: DEFAULTS.germinationInitialAngleJitterDeg
      };
    }

    return {
      enabled: s.enabled ?? DEFAULTS.germinationEnabled,
      bodyCircleIndex: Math.max(0, Math.round(Number(s.bodyCircleIndex ?? DEFAULTS.germinationBodyCircleIndex) || 0)),
      angleDeg: Number.isFinite(Number(s.angleDeg)) ? Number(s.angleDeg) : DEFAULTS.germinationAngleDeg,
      feedCount: Math.max(1, Math.round(Number(s.feedCount ?? DEFAULTS.germinationFeedCount) || DEFAULTS.germinationFeedCount)),
      startScale: clamp(Number.isFinite(Number(s.startScale)) ? Number(s.startScale) : DEFAULTS.germinationStartScale, 0.1, 0.95),
      growthRate: Math.max(0.001, Number.isFinite(Number(s.growthRate)) ? Number(s.growthRate) : DEFAULTS.germinationGrowthRate),
      detachScale: clamp(Number.isFinite(Number(s.detachScale)) ? Number(s.detachScale) : DEFAULTS.germinationDetachScale, 0.1, 1),
      launchSpeed: Math.max(0, Number.isFinite(Number(s.launchSpeed)) ? Number(s.launchSpeed) : DEFAULTS.germinationLaunchSpeed),
      mirrorOffspringX: s.mirrorOffspringX ?? DEFAULTS.germinationMirrorOffspringX,
      launchJitter: clamp(Number.isFinite(Number(s.launchJitter)) ? Number(s.launchJitter) : DEFAULTS.germinationLaunchJitter, 0, 1),
      initialAngleJitterDeg: Math.max(0, Number.isFinite(Number(s.initialAngleJitterDeg)) ? Number(s.initialAngleJitterDeg) : DEFAULTS.germinationInitialAngleJitterDeg)
    };
  }

  setRadius(nextRadius) {
    const current = Math.max(0.0001, this.radius || DEFAULTS.radius);
    const target = Math.max(2, Number(nextRadius) || current);
    const scale = target / current;
    this._circles = this._circles.map(circle => ({
      dx: circle.dx * scale,
      dy: circle.dy * scale,
      r: Math.max(1, circle.r * scale)
    }));
    this.radius = this._computeBoundingRadius();
    this._mass = this._computeMass();
    this.spriteReferenceRadius *= scale;
    this.particleRadius *= scale;
  }

  _surfaceSpawnPoint(settings = null) {
    const circles = this._getCircles();
    const idx = Math.max(0, Math.min(settings?.bodyCircleIndex ?? 0, circles.length - 1));
    const circle = circles[idx] ?? circles[0] ?? { cx: this.x, cy: this.y, r: this.radius };
    const angle = degToRad(settings?.angleDeg ?? 0) + this.angle;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    return {
      x: circle.cx + dirX * circle.r,
      y: circle.cy + dirY * circle.r,
      dirX,
      dirY
    };
  }

  _germinationPoint() {
    return this._surfaceSpawnPoint(this.germination);
  }

  _getSurfacePoint(surfaceAngle) {
    const circles = this._getCircles();
    let best = null;
    let bestProjection = -Infinity;
    const dirX = Math.cos(surfaceAngle);
    const dirY = Math.sin(surfaceAngle);
    for (const circle of circles) {
      const x = circle.cx + dirX * circle.r;
      const y = circle.cy + dirY * circle.r;
      const projection = (x - this.x) * dirX + (y - this.y) * dirY;
      if (projection > bestProjection) {
        bestProjection = projection;
        best = { x, y };
      }
    }
    return best ?? { x: this.x + dirX * this.radius, y: this.y + dirY * this.radius };
  }

  _positionFromGerminationAnchor(anchor, extraDistance = 0) {
    if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return;
    const dirX = Number.isFinite(anchor.dirX) ? anchor.dirX : 0;
    const dirY = Number.isFinite(anchor.dirY) ? anchor.dirY : 0;
    const backPoint = this._getSurfacePoint(Math.atan2(-dirY, -dirX));
    this.x = anchor.x - (backPoint.x - this.x) + dirX * Math.max(0, extraDistance);
    this.y = anchor.y - (backPoint.y - this.y) + dirY * Math.max(0, extraDistance);
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
      initialAngleJitterDeg: Math.max(0, Number(settings?.initialAngleJitterDeg ?? DEFAULTS.germinationInitialAngleJitterDeg) || 0)
    };
    this.dx = 0;
    this.dy = 0;
    this.angularVelocity = 0;
  }

  _detachGerminationBud(anchor = null) {
    const attachment = this._germinationAttachment;
    if (!attachment) return false;
    const detachPoint = anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.y)
      ? anchor
      : attachment.parent?._surfaceSpawnPoint(attachment.settings ?? null) ?? null;
    const jitter = clamp(Number(attachment.launchJitter ?? 0), 0, 1);
    const impulse = Math.max(0, (Number(attachment.launchSpeed) || 0) * (1 + ((Math.random() * 2 - 1) * jitter)));

    if (detachPoint && Number.isFinite(detachPoint.dirX) && Number.isFinite(detachPoint.dirY)) {
      this._positionFromGerminationAnchor(detachPoint, Math.max(this.radius * 0.08, impulse * 8));
      this.dx = detachPoint.dirX * impulse;
      this.dy = detachPoint.dirY * impulse;
    }

    const angleJitterDeg = Math.max(0, Number(attachment.initialAngleJitterDeg ?? 0) || 0);
    if (angleJitterDeg > 0.0001) {
      this.angle = wrapAngle(this.angle + degToRad((Math.random() * 2 - 1) * angleJitterDeg));
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
    this.dx = 0;
    this.dy = 0;
    this.angularVelocity = 0;
    this._positionFromGerminationAnchor(anchor);
    this.angle = parent.angle;

    if (this.radius + 0.0001 >= attachment.detachRadius || !(this._growthTargetRadius > this.radius)) {
      this._detachGerminationBud(anchor);
    }
    return true;
  }

  _updateGrowth() {
    if (!(this._growthTargetRadius > this.radius) || !(this._growthRate > 0)) return;
    const nextRadius = Math.min(this._growthTargetRadius, this.radius + this._growthRate);
    if (nextRadius > this.radius + 0.0001) this.setRadius(nextRadius);
    if (nextRadius >= this._growthTargetRadius - 0.0001) {
      this.setRadius(this._growthTargetRadius);
      this._growthTargetRadius = null;
      this._growthRate = 0;
    }
  }

  _cloneOffspringOptions() {
    const offspringSprite = randomAlgaeOffspringSpriteOptions(this.spriteIndex);
    return {
      spriteIndex: offspringSprite.spriteIndex,
      spriteScale: this.spriteScale,
      spriteReferenceRadius: this.spriteReferenceRadius,
      spriteRotationOffset: this.spriteRotationOffset,
      spriteBodyU: this.spriteBodyU,
      spriteBodyV: this.spriteBodyV,
      spriteFlipX: this.germination?.mirrorOffspringX ? !this.spriteFlipX : this.spriteFlipX,
      spriteDebug: this.spriteDebug,
      spriteSubfolder: offspringSprite.spriteSubfolder,
      impulseFactor: this.impulseFactor,
      friction: this.friction,
      maxSpeed: this.maxSpeed,
      wallBounce: this.wallBounce,
      bounceForce: this.bounceForce,
      density: this.density,
      angularFriction: this.angularFriction,
      angularImpulseFactor: this.angularImpulseFactor,
      maxAngularSpeed: this.maxAngularSpeed,
      absorbImpulseTransfer: this.absorbImpulseTransfer,
      maxStoredProjectiles: this.maxStoredProjectiles,
      productionPerProjectile: this.productionPerProjectile,
      productionIntervalMs: this.productionIntervalMs,
      maxProducedPerTick: this.maxProducedPerTick,
      particleRadius: this.particleRadius,
      particleSpeed: this.particleSpeed,
      particleSpread: this.particleSpread,
      particleColor: this.particleColor,
      particleSpriteIndex: this.particleSpriteIndex,
      particleTintGroup: this.particleTintGroup,
      germinationSettings: { ...this.germination }
    };
  }

  _spawnAlgaeFromGermination() {
    if (!(this.germination?.enabled ?? DEFAULTS.germinationEnabled)) return null;
    const spawn = this._germinationPoint();
    const circles = this._circles.map(circle => ({
      dx: this.germination?.mirrorOffspringX ? -circle.dx : circle.dx,
      dy: circle.dy,
      r: circle.r
    }));
    const child = new Algae(spawn.x, spawn.y, circles, this.color, this._cloneOffspringOptions());
    child.angle = this.germination?.mirrorOffspringX ? -this.angle : this.angle;

    const targetRadius = this.radius;
    const startRadius = Math.max(2, targetRadius * (this.germination?.startScale ?? DEFAULTS.germinationStartScale));
    const startScale = clamp(startRadius / Math.max(targetRadius, 0.0001), 0.1, 1);
    const detachScale = clamp(this.germination?.detachScale ?? DEFAULTS.germinationDetachScale, startScale, 1);
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
    return child;
  }

  tryAbsorbProjectile(projectile, hit = null) {
    if (!projectile || projectile.absorbed || !projectile.isProjectile) return false;

    projectile.absorbed = true;
    projectile.dx = 0;
    projectile.dy = 0;
    this.storedProjectiles = Math.min(
      this.maxStoredProjectiles,
      this.storedProjectiles + this.productionPerProjectile
    );
    if (this.germination?.enabled ?? DEFAULTS.germinationEnabled) {
      this._absorbedSinceLastGermination += 1;
      if (this._absorbedSinceLastGermination >= (this.germination?.feedCount ?? DEFAULTS.germinationFeedCount)) {
        this._absorbedSinceLastGermination = 0;
        this._pendingGerminationSpawns += 1;
      }
    }
    this._lockProjectileAbsorbMotion();
    return true;
  }

  _lockProjectileAbsorbMotion(durationMs = 140) {
    this.dx = 0;
    this.dy = 0;
    this.angularVelocity = 0;
    this._projectileAbsorbLockUntilMs = performance.now() + durationMs;
    this._projectileAbsorbAnchor = {
      x: this.x,
      y: this.y,
      angle: this.angle
    };
  }

  _spawnProducedParticle() {
    const circles = this._getCircles();
    const source = circles[Math.floor(Math.random() * Math.max(circles.length, 1))] ?? {
      cx: this.x,
      cy: this.y,
      r: this.radius
    };
    const angle = Math.random() * Math.PI * 2;
    const spawnDistance = source.r + Math.max(1.2, this.particleRadius * 0.35);
    const spreadOffset = (Math.random() - 0.5) * this.particleSpread;
    const direction = angle + spreadOffset;
    const speed = this.particleSpeed * (0.72 + Math.random() * 0.56);

    const particle = new Particle(
      source.cx + Math.cos(angle) * spawnDistance,
      source.cy + Math.sin(angle) * spawnDistance,
      this.particleRadius,
      Math.cos(direction) * speed,
      Math.sin(direction) * speed,
      this.particleColor,
      false,
      false
    );

    particle.spriteIndex = this.particleSpriteIndex;
    particle.tintGroup = this.particleTintGroup;
    particle.color = particle.tintGroup === "red" ? particle.tintRed : particle.tintGreen;
    particle.spriteVariant = particle.tintGroup;
    return particle;
  }

  update(bounds, playerRadius = null, options = {}) {
    if (this._updateAttachedGerminationBud()) {
      this._updateGrowth();
      return null;
    }

    const absorbMotionLocked =
      Number.isFinite(this._projectileAbsorbLockUntilMs) &&
      performance.now() < this._projectileAbsorbLockUntilMs;

    if (absorbMotionLocked) {
      this.dx = 0;
      this.dy = 0;
      this.angularVelocity = 0;
      if (this._projectileAbsorbAnchor) {
        this.x = this._projectileAbsorbAnchor.x;
        this.y = this._projectileAbsorbAnchor.y;
        this.angle = this._projectileAbsorbAnchor.angle;
      }
    }

    super.update(bounds);

    if (absorbMotionLocked) {
      this.dx = 0;
      this.dy = 0;
      this.angularVelocity = 0;
      if (this._projectileAbsorbAnchor) {
        this.x = this._projectileAbsorbAnchor.x;
        this.y = this._projectileAbsorbAnchor.y;
        this.angle = this._projectileAbsorbAnchor.angle;
      }
    }

    this._updateGrowth();

    let spawnedAlgae = null;
    if (this._pendingGerminationSpawns > 0) {
      this._pendingGerminationSpawns -= 1;
      spawnedAlgae = this._spawnAlgaeFromGermination();
    }

    const rawParticleSlots = Number(options?.particleSlotsAvailable);
    const particleSlotsAvailable = Number.isFinite(rawParticleSlots)
      ? Math.max(0, Math.floor(rawParticleSlots))
      : Infinity;

    if (this.storedProjectiles <= 0 || particleSlotsAvailable <= 0) {
      return spawnedAlgae ? { algae: spawnedAlgae } : null;
    }

    const now = performance.now();
    if (now - this._lastProductionAtMs < this.productionIntervalMs) {
      return spawnedAlgae ? { algae: spawnedAlgae } : null;
    }

    const elapsed = now - this._lastProductionAtMs;
    const possibleCount = Math.max(1, Math.floor(elapsed / this.productionIntervalMs));
    const emitCount = Math.min(
      this.maxProducedPerTick,
      this.storedProjectiles,
      possibleCount,
      particleSlotsAvailable
    );
    if (emitCount <= 0) return spawnedAlgae ? { algae: spawnedAlgae } : null;

    this._lastProductionAtMs = now;
    this.storedProjectiles -= emitCount;

    const particles = [];
    for (let i = 0; i < emitCount; i++) {
      particles.push(this._spawnProducedParticle(playerRadius));
    }
    return { particles, algae: spawnedAlgae };
  }
}
