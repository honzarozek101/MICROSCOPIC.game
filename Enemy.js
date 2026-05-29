import { approachAngle, wrapAngle } from "./utils.js";
import { Projectile, DEFAULTS as ProjDef } from "./Projectile.js";
import { GITParticle } from "./GITParticle.js";
import { Egg } from "./Egg.js";
import {
  getSpriteImage,
  getSequenceImage,
  normalizeSpriteIndex
} from "./spriteAssets.js";

// ------------------------------------------------------------
// Multi-sprite setup
// ------------------------------------------------------------

/*
  Metadata per sprite index.
  Tohle si můžeš později doladit pro každý spritesheet zvlášť.

  bodyU/bodyV   = kde leží logický střed těla uvnitř obrázku
  mouthU/mouthV = kde je mouth marker uvnitř obrázku
*/
const ENEMY_SPRITE_META = {
  1: {
    sx: 0, sy: 0, sw: 1280, sh: 1024,
    bodyU: 0.410,
    bodyV: 0.423,
    mouthU: 0.751,
    mouthV: 0.327,
    scale: 1.410,
    rotationOffset: 0.250
  },
  2: {
    sx: 0, sy: 0, sw: 1280, sh: 1024,
    bodyU: 0.410,
    bodyV: 0.423,
    mouthU: 0.751,
    mouthV: 0.327,
    scale: 1.410,
    rotationOffset: 0.250
  },
  3: {
    sx: 0, sy: 0, sw: 1280, sh: 1024,
    bodyU: 0.410,
    bodyV: 0.423,
    mouthU: 0.751,
    mouthV: 0.327,
    scale: 1.410,
    rotationOffset: 0.250
  },
  4: {
    sx: 0, sy: 0, sw: 1280, sh: 1024,
    bodyU: 0.410,
    bodyV: 0.423,
    mouthU: 0.751,
    mouthV: 0.327,
    scale: 1.410,
    rotationOffset: 0.250
  },
  5: {
    sx: 0, sy: 0, sw: 1280, sh: 1024,
    bodyU: 0.410,
    bodyV: 0.423,
    mouthU: 0.751,
    mouthV: 0.327,
    scale: 1.410,
    rotationOffset: 0.250
  }
};

const DEFAULT_SPRITE_META = {
  sx: 0,
  sy: 0,
  sw: 1280,
  sh: 1024,
  bodyU: 0.410,
  bodyV: 0.423,
  mouthU: 0.751,
  mouthV: 0.327,
  scale: 1.410,
  rotationOffset: 0.250
};

export const DEFAULTS = {
  radius: 25,
  color: "rgba(255, 140, 0, 0.7)",
  speed: 0.6,
  turnRate: 0.10,
  chaseRadius: 800,
  chaseBias: 1.0,
  wanderJitter: 0.02,
  bounceForce: 3,
  shrinkFactor: 2.7,
  minSpawnDistance: 300,
  velocityDamping: 0.952,
  maxGlideSpeed: 1.35,
  kickImpulse: 1.1,
  kickCooldownMs: 760,
  searchKickImpulse: 0.5,
  searchKickCooldownMs: 1650,
  trackingFOVDeg: 42,
  trackingKickJitterDeg: 14,
  scanTurnRate: 0.014,
  scanRetargetMs: 850,
  scanSweepAngleDeg: 115,

  // identity / editor
  instanceIndex: 0,
  spriteIndex: null,
  spriteFolder: "Enemy",
  spriteSubfolder: null,
  spriteFamily: "enemy",
  spriteVariant: null,

  // --- mouth ---
  mouthTurnRate: 0.03,
  mouthReturnRate: 0.04,
  mouthMinTargetDistance: 18,
  projectileBounceStrength: 0.5,
  mouthAbsorbRadius: 2,
  mouthIdleSpin: 0.0,
  mouthRestAngle: 0.0,
  mouthPointRadius: 5.5,
  mouthLineWidth: 3,
  mouthLineColor: "rgba(255, 220, 130, 0.95)",
  mouthInletColor: "rgba(255, 255, 255, 0.9)",

  // --- egg laying ---
  preLaySlowdownMs: 1800,
  preLayFriction: 0.94,
  eggGrowthRate: 0.08,
  eggTargetRadius: 14,
  eggDetachSpeed: 0.5,
  eggHatchEnemyRadius: 12,

  // --- GIT world settings ---
  gitMaxParticles: 5,
  gitShowCount: true,
  gitCountFontSize: 10,
  gitCountColor: "rgba(255, 255, 255, 0.70)",
  gitCircleFillColor: "rgba(200, 80, 0, 0.30)",
  gitCircleBorderColor: "rgba(255, 190, 80, 0.55)",
  gitCircleBorderWidth: 1.5,

  // --- per-instance GIT anatomy ---
  gitCircleOffsetAngleDeg: 180,
  gitCircleOffsetDistanceMul: 0.5944,
  gitCircleRadiusMul: 0.52,

  // --- per-instance GIT particle tuning ---
  gitParticleRadius: 2.6,
  gitParticleSpeed: 1.6,
  gitParticleMinSpeed: 0.3,
  gitParticleFriction: 0.975,
  gitParticleWallRestitution: 0.9,

  // --- sprite overrides ---
  spriteScale: null,
  spriteRotationOffset: null,
  spriteBodyU: null,
  spriteBodyV: null,
  spriteMouthU: null,
  spriteMouthV: null,
  spriteFlipX: false,
  spriteAlpha: 0.82,
  spriteDebug: false,

  // experimental frame-sequence animation
  spriteAnimationEnabled: true,
  spriteAnimationFolder: "Enemy",
  spriteAnimationSubfolder: null,
  spriteAnimationFrames: 5,
  spriteAnimationStart: 1,
  spriteAnimationFps: 12,
  spriteAnimationPadding: 5,
  spriteAnimationExt: "png"
};

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

function getEnemySpriteFolderName(spriteIndex, preferredSubfolder = null) {
  if (preferredSubfolder != null && String(preferredSubfolder).trim()) {
    return String(preferredSubfolder).trim();
  }

  return `Enemy_${String(normalizeSpriteIndex(spriteIndex, 1)).padStart(2, "0")}`;
}

function getEnemyAnimationSubfolder(spriteIndex, preferredSubfolder = null) {
  if (preferredSubfolder != null && String(preferredSubfolder).trim()) {
    return String(preferredSubfolder).trim();
  }

  const index = normalizeSpriteIndex(spriteIndex, 1);
  return index > 1 ? getEnemySpriteFolderName(index, null) : null;
}

export class Enemy {
  constructor(x, y, radiusOrOpts = DEFAULTS.radius, color = DEFAULTS.color, legacyOpts = null) {
    let opts = {};

    // new Enemy(x, y, opts)
    if (radiusOrOpts && typeof radiusOrOpts === "object" && !Array.isArray(radiusOrOpts)) {
      opts = radiusOrOpts;
    }
    // new Enemy(x, y, radius, color, opts)
    else if (legacyOpts && typeof legacyOpts === "object") {
      opts = {
        ...legacyOpts,
        radius: legacyOpts.radius ?? radiusOrOpts,
        color: legacyOpts.color ?? color
      };
    }
    // new Enemy(x, y, radius, color)
    else {
      opts = {
        radius: radiusOrOpts,
        color
      };
    }

    const cfg = { ...DEFAULTS, ...opts };
    this.cfg = cfg;

    this.x = x;
    this.y = y;
    this.isEnemy = true;
    this.radius = cfg.radius;
    this.color = cfg.color;
    this.bodyCircles = this._normalizeBodyCircles(cfg.bodyCircles);
    this.innerArtifacts = this._normalizeInnerArtifacts(cfg.innerArtifacts);

    this.instanceIndex = cfg.instanceIndex ?? 0;
    this.spriteIndex = normalizeSpriteIndex(cfg.spriteIndex ?? cfg.instanceIndex ?? 1);

    this.dx = 0;
    this.dy = 0;

    this.angle = cfg.mouthRestAngle;
    this.targetAngle = this.angle;

    this.lastShot = 0;
    this.lastKickMs = performance.now() - Math.random() * cfg.searchKickCooldownMs;
    this.scanTargetAngle = this.angle;
    this.nextScanRetargetMs = 0;
    this.animationPhaseMs = Math.random() * 1000;

    // physics
    this.speed = cfg.speed;
    this.bounceForce = cfg.bounceForce;
    this.projectileBounceStrength = cfg.projectileBounceStrength;

    // sprite tuning
    this._rebuildSpriteConfig();

    // GIT
    this.gitParticles = [];
    this.removed = false;

    // Egg laying
    this.layingEgg = false;
    this._egg = null;
    this.slowingDown = false;
    this.slowStartMs = 0;
  }

  _normalizeBodyCircles(bodyCircles) {
    if (!Array.isArray(bodyCircles) || bodyCircles.length === 0) {
      return [{ dx: 0, dy: 0, r: this.radius }];
    }

    return bodyCircles.map((circle, index) => ({
      dx: Number(circle?.dx ?? 0),
      dy: Number(circle?.dy ?? 0),
      r: Math.max(2, Number(circle?.r ?? (index === 0 ? this.radius : this.radius * 0.65)))
    }));
  }

  _normalizeInnerArtifacts(innerArtifacts) {
    if (!Array.isArray(innerArtifacts)) return [];

    return innerArtifacts.map(artifact => ({
      dx: Number(artifact.dx ?? 0),
      dy: Number(artifact.dy ?? 0),
      radius: Math.max(2, Number(artifact.radius ?? this.radius * 0.25)),
      spriteIndex: normalizeSpriteIndex(artifact.spriteIndex, 1)
    }));
  }

  _syncRadiusFromBody() {
    const primary = this.bodyCircles?.[0];
    this.radius = Math.max(2, Number(primary?.r ?? this.radius));
    this.cfg.radius = this.radius;
  }

  setRadius(nextRadius) {
    const targetRadius = Math.max(2, Number(nextRadius ?? this.radius));
    const currentRadius = Math.max(0.0001, this.radius || 1);
    const scale = targetRadius / currentRadius;

    if (Array.isArray(this.bodyCircles) && this.bodyCircles.length > 0) {
      this.bodyCircles = this.bodyCircles.map(circle => ({
        dx: circle.dx * scale,
        dy: circle.dy * scale,
        r: Math.max(2, circle.r * scale)
      }));
    }

    if (Array.isArray(this.innerArtifacts) && this.innerArtifacts.length > 0) {
      this.innerArtifacts = this.innerArtifacts.map(artifact => ({
        dx: artifact.dx * scale,
        dy: artifact.dy * scale,
        radius: Math.max(2, artifact.radius * scale),
        spriteIndex: artifact.spriteIndex
      }));
    }

    this.radius = targetRadius;
    this.cfg.radius = targetRadius;
  }

  collapseIntoEgg() {
    const egg = new Egg(this.x, this.y, this.angle + Math.PI);
    this._applyEggConfig(egg);

    const eggRadius = Math.max(this.cfg.eggTargetRadius ?? 1, this.radius);
    egg.radius = eggRadius;
    egg.displayRadius = eggRadius;
    egg.detached = true;
    egg.dx = 0;
    egg.dy = 0;
    egg.x = this.x;
    egg.y = this.y;
    egg.parentConfig = { ...this.cfg };

    this.dx = 0;
    this.dy = 0;
    this.gitParticles = [];
    this.slowingDown = false;
    this.layingEgg = false;
    this._egg = null;
    this.removed = true;

    return egg;
  }

  _getBodyCircles() {
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);

    return (this.bodyCircles?.length ? this.bodyCircles : [{ dx: 0, dy: 0, r: this.radius }]).map(circle => ({
      cx: this.x + circle.dx * cos - circle.dy * sin,
      cy: this.y + circle.dx * sin + circle.dy * cos,
      r: circle.r
    }));
  }

  get mass() {
    return this.bodyCircles.reduce((sum, circle) => sum + Math.PI * circle.r * circle.r, 0);
  }

  drawInnerArtifacts(ctx) {
    if (!this.innerArtifacts?.length) return;

    ctx.save();
    ctx.beginPath();
    for (const circle of this._getBodyCircles()) {
      ctx.moveTo(circle.cx + circle.r, circle.cy);
      ctx.arc(circle.cx, circle.cy, circle.r, 0, Math.PI * 2);
    }
    ctx.clip();

    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);

    for (const artifact of this.innerArtifacts) {
      const ax = this.x + artifact.dx * cos - artifact.dy * sin;
      const ay = this.y + artifact.dx * sin + artifact.dy * cos;
      const size = artifact.radius * 2;
      const img = getSpriteImage({
        folder: "Particle",
        family: "particle",
        variant: "green",
        index: artifact.spriteIndex
      });

      if (img && img.complete && img.naturalWidth) {
        ctx.globalAlpha = 0.92;
        ctx.drawImage(img, ax - size / 2, ay - size / 2, size, size);
      } else {
        const gradient = ctx.createRadialGradient(
          ax - artifact.radius * 0.3,
          ay - artifact.radius * 0.3,
          artifact.radius * 0.08,
          ax,
          ay,
          artifact.radius
        );
        gradient.addColorStop(0, "rgba(240,255,240,0.95)");
        gradient.addColorStop(1, "rgba(120,190,120,0.82)");
        ctx.beginPath();
        ctx.arc(ax, ay, artifact.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.closePath();
      }
    }

    ctx.restore();
  }

  _rebuildSpriteConfig() {
    const meta = ENEMY_SPRITE_META[this.spriteIndex] ?? DEFAULT_SPRITE_META;
    const animationFrames = Math.max(1, Math.round(Number(this.cfg.spriteAnimationFrames ?? 1)));
    const animationStart = normalizeSpriteIndex(this.cfg.spriteAnimationStart ?? 1);
    const animationFps = Math.max(1, Number(this.cfg.spriteAnimationFps ?? 12));
    const animationPadding = Math.max(1, Math.round(Number(this.cfg.spriteAnimationPadding ?? 5)));
    const animationEnabled = !!this.cfg.spriteAnimationEnabled;

    this.sprite = {
      index: this.spriteIndex,
      imageCandidates: animationEnabled ? [] : [
        getSpriteImage({
          folder: this.cfg.spriteFolder,
          subfolder: getEnemySpriteFolderName(this.spriteIndex, this.cfg.spriteSubfolder),
          family: this.cfg.spriteFamily,
          variant: this.cfg.spriteVariant,
          index: this.spriteIndex
        }),
        getSpriteImage({
          folder: this.cfg.spriteFolder,
          family: this.cfg.spriteFamily,
          variant: this.cfg.spriteVariant,
          index: this.spriteIndex
        })
      ],

      sx: meta.sx ?? DEFAULT_SPRITE_META.sx,
      sy: meta.sy ?? DEFAULT_SPRITE_META.sy,
      sw: meta.sw ?? DEFAULT_SPRITE_META.sw,
      sh: meta.sh ?? DEFAULT_SPRITE_META.sh,

      bodyU: this.cfg.spriteBodyU ?? meta.bodyU ?? DEFAULT_SPRITE_META.bodyU,
      bodyV: this.cfg.spriteBodyV ?? meta.bodyV ?? DEFAULT_SPRITE_META.bodyV,

      mouthU: this.cfg.spriteMouthU ?? meta.mouthU ?? DEFAULT_SPRITE_META.mouthU,
      mouthV: this.cfg.spriteMouthV ?? meta.mouthV ?? DEFAULT_SPRITE_META.mouthV,
      flipX: !!this.cfg.spriteFlipX,

      scale: this.cfg.spriteScale ?? meta.scale ?? DEFAULT_SPRITE_META.scale,
      alpha: Math.max(0, Math.min(Number(this.cfg.spriteAlpha ?? 1), 1)),
      rotationOffset:
        this.cfg.spriteRotationOffset ?? meta.rotationOffset ?? DEFAULT_SPRITE_META.rotationOffset,

      debug: !!this.cfg.spriteDebug,
      animationEnabled,
      animationFolder: this.cfg.spriteAnimationFolder ?? this.cfg.spriteFolder,
      animationSubfolder: getEnemyAnimationSubfolder(
        this.spriteIndex,
        this.cfg.spriteAnimationSubfolder ?? this.cfg.spriteSubfolder ?? null
      ),
      animationFrames,
      animationStart,
      animationFps,
      animationPadding,
      animationExt: this.cfg.spriteAnimationExt ?? "png"
    };
  }

  _getAnimatedSpriteImage(now = performance.now()) {
    const baseSpriteImage =
      this.sprite?.imageCandidates?.find(img => img && img.complete && img.naturalWidth) ??
      this.sprite?.imageCandidates?.[0] ??
      null;

    if (!this.sprite?.animationEnabled || this.sprite.animationFrames <= 1) {
      return baseSpriteImage;
    }

    const frameDurationMs = 1000 / Math.max(1, this.sprite.animationFps);
    const frameOffset = Math.floor((now + this.animationPhaseMs) / frameDurationMs) % this.sprite.animationFrames;
    const frameIndex = this.sprite.animationStart + frameOffset;

    const frameCandidates = [];
    if (this.sprite.animationSubfolder) {
      frameCandidates.push(getSequenceImage({
        folder: this.sprite.animationFolder,
        subfolder: this.sprite.animationSubfolder,
        index: frameIndex,
        padding: this.sprite.animationPadding,
        ext: this.sprite.animationExt
      }));
    }
    frameCandidates.push(getSequenceImage({
      folder: this.sprite.animationFolder,
      index: frameIndex,
      padding: this.sprite.animationPadding,
      ext: this.sprite.animationExt
    }));
    const frameImage =
      frameCandidates.find(img => img && img.complete && img.naturalWidth) ??
      frameCandidates[0] ??
      null;

    if (frameImage && frameImage.complete && frameImage.naturalWidth) {
      return frameImage;
    }

    return baseSpriteImage ?? frameImage ?? null;
  }

  setSpriteIndex(index) {
    this.spriteIndex = normalizeSpriteIndex(index);
    this.cfg.spriteIndex = this.spriteIndex;
    this._rebuildSpriteConfig();
  }

  get gitIsFull() {
    return this.gitParticles.length >= this.cfg.gitMaxParticles;
  }

  _mouthPoint() {
    return {
      x: this.x + Math.cos(this.angle) * this.radius,
      y: this.y + Math.sin(this.angle) * this.radius
    };
  }

  _gitCircle() {
    const r = Math.max(0.5, this.radius * this.cfg.gitCircleRadiusMul);
    const offsetAngle = this.angle + degToRad(this.cfg.gitCircleOffsetAngleDeg);
    const dist = this.radius * this.cfg.gitCircleOffsetDistanceMul;

    return {
      cx: this.x + Math.cos(offsetAngle) * dist,
      cy: this.y + Math.sin(offsetAngle) * dist,
      r
    };
  }

  _eggContact() {
    const oppAngle = this.angle + Math.PI;
    return {
      cx: this.x + Math.cos(oppAngle) * this.radius,
      cy: this.y + Math.sin(oppAngle) * this.radius,
      angle: oppAngle
    };
  }

  _applyEggConfig(egg) {
    if (!egg) return egg;

    egg.growthRate = this.cfg.eggGrowthRate;
    egg.targetRadius = this.cfg.eggTargetRadius;
    egg.detachSpeed = this.cfg.eggDetachSpeed;
    egg.hatchEnemyRadius = this.cfg.eggHatchEnemyRadius;
    egg.sourceEnemyRadius = this.radius;

    return egg;
  }

  _applyGITParticleConfig(particle, radiusScale = 1) {
    if (!particle) return particle;

    particle.radius = this.cfg.gitParticleRadius * radiusScale;
    particle.friction = this.cfg.gitParticleFriction;
    particle.wallRestitution = this.cfg.gitParticleWallRestitution;
    particle.minSpeed = this.cfg.gitParticleMinSpeed;

    return particle;
  }

  findNearestYellow(particles) {
    let nearest = null;
    let nearestDist = Infinity;

    for (const p of particles) {
      if (!p || p.absorbed || !p.isProjectile || p.isAntibody) continue;

      const dx = p.x - this.x;
      const dy = p.y - this.y;
      const d = Math.hypot(dx, dy);

      if (d < nearestDist) {
        nearestDist = d;
        nearest = p;
      }
    }

    return { target: nearest, distance: nearestDist };
  }

  _pickScanTarget(now) {
    const sweep = degToRad(this.cfg.scanSweepAngleDeg);
    const offset = (Math.random() * 2 - 1) * sweep;
    this.scanTargetAngle = wrapAngle(this.cfg.mouthRestAngle + offset);
    this.nextScanRetargetMs = now + this.cfg.scanRetargetMs * (0.75 + Math.random() * 0.6);
  }

  _smallestAngleTo(targetAngle) {
    return wrapAngle(targetAngle - this.angle);
  }

  _canKick(now, cooldownMs) {
    return now - this.lastKickMs >= cooldownMs;
  }

  _applyKick(now, angle, impulse) {
    this.dx += Math.cos(angle) * impulse;
    this.dy += Math.sin(angle) * impulse;
    this.lastKickMs = now;
  }

  _dampVelocity() {
    this.dx *= this.cfg.velocityDamping;
    this.dy *= this.cfg.velocityDamping;
  }

  _limitVelocity() {
    const speed = Math.hypot(this.dx, this.dy);
    if (speed <= this.cfg.maxGlideSpeed || speed <= 0.0001) return;

    this.dx = (this.dx / speed) * this.cfg.maxGlideSpeed;
    this.dy = (this.dy / speed) * this.cfg.maxGlideSpeed;
  }

  isProjectileInMouthZone(projectile) {
    if (!projectile || projectile.absorbed || !projectile.isProjectile) return false;

    const mouth = this._mouthPoint();

    if (
      Math.hypot(projectile.x - mouth.x, projectile.y - mouth.y) >
      this.cfg.mouthAbsorbRadius + projectile.radius
    ) {
      return false;
    }

    const mouthDirX = Math.cos(this.angle);
    const mouthDirY = Math.sin(this.angle);
    const cx = projectile.x - this.x;
    const cy = projectile.y - this.y;
    const cLen = Math.hypot(cx, cy) || 0.0001;

    return mouthDirX * (cx / cLen) + mouthDirY * (cy / cLen) > 0.75;
  }

  _spawnGITParticle() {
    if (this.gitIsFull) return;

    const { cx, cy, r } = this._gitCircle();

    const dist = r * Math.sqrt(Math.random()) * 0.8;
    const ang = Math.random() * Math.PI * 2;

    const baseSpd = this.cfg.gitParticleSpeed * (0.7 + Math.random() * 0.8);
    const dir = Math.random() * Math.PI * 2;

    const gp = new GITParticle(
      cx + Math.cos(ang) * dist,
      cy + Math.sin(ang) * dist,
      Math.cos(dir) * baseSpd,
      Math.sin(dir) * baseSpd
    );

    this._applyGITParticleConfig(gp);
    this.gitParticles.push(gp);
  }

  _resolveGITParticleCollisions(gitCX, gitCY, gitRadius) {
    if (this.gitParticles.length < 2) return;

    for (let i = 0; i < this.gitParticles.length; i++) {
      const a = this.gitParticles[i];
      if (!a) continue;

      for (let j = i + 1; j < this.gitParticles.length; j++) {
        const b = this.gitParticles[j];
        if (!b) continue;

        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);

        if (dist <= 0.0001) {
          const ang = Math.random() * Math.PI * 2;
          dx = Math.cos(ang);
          dy = Math.sin(ang);
          dist = 1;
        }

        // Allow about 10% overlap so the attached egg still feels organic.
        const minDist = (a.radius + b.radius) * 0.9;
        if (dist >= minDist) continue;

        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;
        const push = overlap * 0.5;

        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;

        const av = a.dx * nx + a.dy * ny;
        const bv = b.dx * nx + b.dy * ny;
        const rel = bv - av;

        if (rel < 0) {
          const impulse = -rel * 0.35;
          a.dx -= nx * impulse;
          a.dy -= ny * impulse;
          b.dx += nx * impulse;
          b.dy += ny * impulse;
        }
      }
    }

    for (const gp of this.gitParticles) {
      const dx = gp.x - gitCX;
      const dy = gp.y - gitCY;
      const dist = Math.hypot(dx, dy);
      const maxDist = Math.max(0, gitRadius - gp.radius);

      if (dist > maxDist && dist > 0.0001) {
        const nx = dx / dist;
        const ny = dy / dist;
        gp.x = gitCX + nx * maxDist;
        gp.y = gitCY + ny * maxDist;
      }
    }
  }

  _drawFallbackBody(ctx) {
    ctx.beginPath();
    ctx.fillStyle = this.color;
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.closePath();
  }

  _drawEnemySprite(ctx) {
    const img = this._getAnimatedSpriteImage();

    if (!img || !img.complete || !img.naturalWidth) {
      this._drawFallbackBody(ctx);
      return;
    }

    const hasLegacyFullFrameRect =
      this.sprite.sx === 0 &&
      this.sprite.sy === 0 &&
      this.sprite.sw === DEFAULT_SPRITE_META.sw &&
      this.sprite.sh === DEFAULT_SPRITE_META.sh;

    const sourceX = hasLegacyFullFrameRect ? 0 : this.sprite.sx;
    const sourceY = hasLegacyFullFrameRect ? 0 : this.sprite.sy;
    const sourceW = hasLegacyFullFrameRect ? img.naturalWidth : this.sprite.sw;
    const sourceH = hasLegacyFullFrameRect ? img.naturalHeight : this.sprite.sh;

    const drawW = this.radius * this.sprite.scale * 2.0;
    const drawH = drawW * (sourceH / Math.max(sourceW, 1));

    const bodyAnchorX = drawW * this.sprite.bodyU;
    const bodyAnchorY = drawH * this.sprite.bodyV;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle + this.sprite.rotationOffset);
    if (this.sprite.flipX) ctx.scale(1, -1);
    ctx.globalAlpha = this.sprite.alpha;

    ctx.drawImage(
      img,
      sourceX,
      sourceY,
      sourceW,
      sourceH,
      -bodyAnchorX,
      -bodyAnchorY,
      drawW,
      drawH
    );

    if (this.sprite.debug) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(0,255,255,0.9)";
      ctx.lineWidth = 1;
      ctx.strokeRect(-bodyAnchorX, -bodyAnchorY, drawW, drawH);
      ctx.closePath();

      ctx.beginPath();
      ctx.strokeStyle = "rgba(0,255,255,0.95)";
      ctx.lineWidth = 2;
      ctx.moveTo(-8, 0);
      ctx.lineTo(8, 0);
      ctx.moveTo(0, -8);
      ctx.lineTo(0, 8);
      ctx.stroke();
      ctx.closePath();

      const mouthLocalXBase = drawW * this.sprite.mouthU - bodyAnchorX;
      const mouthLocalX = this.sprite.flipX ? -mouthLocalXBase : mouthLocalXBase;
      const mouthLocalY = drawH * this.sprite.mouthV - bodyAnchorY;

      ctx.beginPath();
      ctx.fillStyle = "rgba(255, 0, 0, 0.95)";
      ctx.arc(mouthLocalX, mouthLocalY, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.closePath();

      ctx.beginPath();
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "bold 12px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`#${this.sprite.index}`, 0, -this.radius - 12);
      ctx.closePath();
    }

    ctx.restore();
  }

  update(particles, bounds) {
    if (this.removed) return null;

    const now = performance.now();

    if ((this.cfg.spriteIndex ?? null) !== this.spriteIndex) {
      this.setSpriteIndex(this.cfg.spriteIndex ?? this.instanceIndex ?? 1);
    }

    // EGG LAYING
    if (this.layingEgg) {
      this.dx = 0;
      this.dy = 0;

      const contact = this._eggContact();
      this._egg.updateContact(contact.cx, contact.cy, contact.angle);

      const done = this._egg.grow();
      const targetRadius = this._egg.targetRadius || this.cfg.eggTargetRadius || 1;
      const layProgress = Math.min(this._egg.radius / targetRadius, 1.0);
      const gitRadiusScale = Math.max(0.2, 1.0 - layProgress * 0.8);

      const git = this._gitCircle();
      for (const gp of this.gitParticles) {
        this._applyGITParticleConfig(gp, gitRadiusScale);
        gp.update(git.cx, git.cy, git.r);
      }
      this._resolveGITParticleCollisions(git.cx, git.cy, git.r);

      if (done) {
        const oppAngle = this.angle + Math.PI;
        this._egg.dx = Math.cos(oppAngle) * this._egg.detachSpeed;
        this._egg.dy = Math.sin(oppAngle) * this._egg.detachSpeed;
        this._egg.detached = true;
        this._egg.parentConfig = { ...this.cfg };

        const detached = this._egg;
        this._egg = null;
        this.layingEgg = false;
        this.gitParticles = [];

        return detached;
      }

      return null;
    }

    // SLOWING DOWN
    if (this.slowingDown) {
      const elapsed = performance.now() - this.slowStartMs;
      const t = Math.min(elapsed / this.cfg.preLaySlowdownMs, 1.0);

      this.dx *= this.cfg.preLayFriction;
      this.dy *= this.cfg.preLayFriction;

      this.x += this.dx;
      this.y += this.dy;

      const git = this._gitCircle();
      for (const gp of this.gitParticles) {
        this._applyGITParticleConfig(gp);
        gp.update(git.cx, git.cy, git.r);
      }
      this._resolveGITParticleCollisions(git.cx, git.cy, git.r);

      if (this.x - this.radius < 0) this.x = this.radius;
      else if (this.x + this.radius > bounds.width) this.x = bounds.width - this.radius;

      if (this.y - this.radius < 0) this.y = this.radius;
      else if (this.y + this.radius > bounds.height) this.y = bounds.height - this.radius;

      if (t >= 1.0) {
        this.dx = 0;
        this.dy = 0;
        this.slowingDown = false;
        this.layingEgg = true;

        const contact = this._eggContact();
        this._egg = new Egg(contact.cx, contact.cy, contact.angle);
        this._applyEggConfig(this._egg);
      }

      return null;
    }

    // Start slowing when GIT is full
    if (this.gitIsFull && !this.slowingDown && !this.layingEgg) {
      this.slowingDown = true;
      this.slowStartMs = now;
      return null;
    }

    const { target, distance } = this.findNearestYellow(particles);
    const trackingFOV = degToRad(this.cfg.trackingFOVDeg);

    this._dampVelocity();

    if (target && distance < this.cfg.chaseRadius) {
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const dist = Math.max(0.0001, Math.hypot(dx, dy));
      const targetAngle = Math.atan2(dy, dx);
      const angleDiff = this._smallestAngleTo(targetAngle);

      this.targetAngle = targetAngle;
      this.angle = approachAngle(this.angle, this.targetAngle, this.cfg.mouthTurnRate);

      if (Math.abs(angleDiff) <= trackingFOV * 0.5 && this._canKick(now, this.cfg.kickCooldownMs)) {
        const proximityMul = 1 + (1 - Math.min(dist / this.cfg.chaseRadius, 1)) * this.cfg.chaseBias * 0.18;
        const jitter = degToRad(this.cfg.trackingKickJitterDeg) * (Math.random() * 2 - 1);
        this._applyKick(now, this.targetAngle + jitter, this.cfg.kickImpulse * proximityMul);
      }
    } else {
      if (now >= this.nextScanRetargetMs) this._pickScanTarget(now);

      this.angle = approachAngle(this.angle, this.scanTargetAngle, this.cfg.scanTurnRate);

      if (this.cfg.mouthIdleSpin) {
        this.angle = wrapAngle(this.angle + this.cfg.mouthIdleSpin);
      }

      if (
        this._canKick(now, this.cfg.searchKickCooldownMs) &&
        Math.hypot(this.dx, this.dy) <= this.cfg.searchKickImpulse * 0.55
      ) {
        const exploratoryAngle = wrapAngle(
          this.angle + (Math.random() * 2 - 1) * degToRad(12)
        );
        this._applyKick(now, exploratoryAngle, this.cfg.searchKickImpulse);
      }
    }

    this.dx += (Math.random() - 0.5) * this.cfg.wanderJitter;
    this.dy += (Math.random() - 0.5) * this.cfg.wanderJitter;
    this._limitVelocity();

    this.x += this.dx;
    this.y += this.dy;

    if (this.x - this.radius < 0) {
      this.x = this.radius;
      this.dx = Math.abs(this.dx) + this.bounceForce * 0.1;
    } else if (this.x + this.radius > bounds.width) {
      this.x = bounds.width - this.radius;
      this.dx = -Math.abs(this.dx) - this.bounceForce * 0.1;
    }

    if (this.y - this.radius < 0) {
      this.y = this.radius;
      this.dy = Math.abs(this.dy) + this.bounceForce * 0.1;
    } else if (this.y + this.radius > bounds.height) {
      this.y = bounds.height - this.radius;
      this.dy = -Math.abs(this.dy) - this.bounceForce * 0.1;
    }

    for (const p of particles) {
      if (!p || p.absorbed || !p.isProjectile || p.isAntibody) continue;

      if (this.isProjectileInMouthZone(p)) {
        p.absorbed = true;
        if (!this.gitIsFull) this._spawnGITParticle();
      }
    }

    const git = this._gitCircle();
    for (const gp of this.gitParticles) {
      this._applyGITParticleConfig(gp);
      gp.update(git.cx, git.cy, git.r);
    }
    this._resolveGITParticleCollisions(git.cx, git.cy, git.r);

    return null;
  }

  shootYellow(particles) {
    const mouth = this._mouthPoint();

    particles.push(
      new Projectile(
        mouth.x,
        mouth.y,
        Math.cos(this.angle) * ProjDef.speed,
        Math.sin(this.angle) * ProjDef.speed
      )
    );
  }

  toJSON() {
    return {
      type: "Enemy",
      instanceIndex: this.instanceIndex,
      spriteIndex: this.spriteIndex,

      x: this.x,
      y: this.y,
      radius: this.radius,
      bodyCircles: this.bodyCircles.map(circle => ({
        dxR: Number((circle.dx / Math.max(this.radius, 0.0001)).toFixed(4)),
        dyR: Number((circle.dy / Math.max(this.radius, 0.0001)).toFixed(4)),
        rR: Number((circle.r / Math.max(this.radius, 0.0001)).toFixed(4))
      })),
      innerArtifacts: this.innerArtifacts.map(artifact => ({
        dxR: Number((artifact.dx / Math.max(this.radius, 0.0001)).toFixed(4)),
        dyR: Number((artifact.dy / Math.max(this.radius, 0.0001)).toFixed(4)),
        rR: Number((artifact.radius / Math.max(this.radius, 0.0001)).toFixed(4)),
        spriteIndex: artifact.spriteIndex
      })),
      color: this.color,

      speed: this.cfg.speed,
      bounceForce: this.cfg.bounceForce,
      projectileBounceStrength: this.cfg.projectileBounceStrength,
      chaseRadius: this.cfg.chaseRadius,
      chaseBias: this.cfg.chaseBias,
      wanderJitter: this.cfg.wanderJitter,
      velocityDamping: this.cfg.velocityDamping,
      maxGlideSpeed: this.cfg.maxGlideSpeed,
      kickImpulse: this.cfg.kickImpulse,
      kickCooldownMs: this.cfg.kickCooldownMs,
      searchKickImpulse: this.cfg.searchKickImpulse,
      searchKickCooldownMs: this.cfg.searchKickCooldownMs,
      trackingFOVDeg: this.cfg.trackingFOVDeg,
      trackingKickJitterDeg: this.cfg.trackingKickJitterDeg,
      scanTurnRate: this.cfg.scanTurnRate,
      scanRetargetMs: this.cfg.scanRetargetMs,
      scanSweepAngleDeg: this.cfg.scanSweepAngleDeg,

      mouthTurnRate: this.cfg.mouthTurnRate,
      mouthReturnRate: this.cfg.mouthReturnRate,
      mouthMinTargetDistance: this.cfg.mouthMinTargetDistance,
      mouthAbsorbRadius: this.cfg.mouthAbsorbRadius,
      mouthIdleSpin: this.cfg.mouthIdleSpin,
      mouthRestAngle: this.cfg.mouthRestAngle,
      mouthPointRadius: this.cfg.mouthPointRadius,
      mouthLineWidth: this.cfg.mouthLineWidth,
      mouthLineColor: this.cfg.mouthLineColor,
      mouthInletColor: this.cfg.mouthInletColor,

      preLaySlowdownMs: this.cfg.preLaySlowdownMs,
      preLayFriction: this.cfg.preLayFriction,
      eggGrowthRate: this.cfg.eggGrowthRate,
      eggTargetRadius: this.cfg.eggTargetRadius,
      eggDetachSpeed: this.cfg.eggDetachSpeed,
      eggHatchEnemyRadius: this.cfg.eggHatchEnemyRadius,

      gitMaxParticles: this.cfg.gitMaxParticles,
      gitShowCount: this.cfg.gitShowCount,
      gitCountFontSize: this.cfg.gitCountFontSize,
      gitCountColor: this.cfg.gitCountColor,
      gitCircleFillColor: this.cfg.gitCircleFillColor,
      gitCircleBorderColor: this.cfg.gitCircleBorderColor,
      gitCircleBorderWidth: this.cfg.gitCircleBorderWidth,

      gitCircleOffsetAngleDeg: this.cfg.gitCircleOffsetAngleDeg,
      gitCircleOffsetDistanceMul: this.cfg.gitCircleOffsetDistanceMul,
      gitCircleRadiusMul: this.cfg.gitCircleRadiusMul,

      gitParticleRadius: this.cfg.gitParticleRadius,
      gitParticleSpeed: this.cfg.gitParticleSpeed,
      gitParticleMinSpeed: this.cfg.gitParticleMinSpeed,
      gitParticleFriction: this.cfg.gitParticleFriction,
      gitParticleWallRestitution: this.cfg.gitParticleWallRestitution,

      spriteScale: this.cfg.spriteScale,
      spriteSubfolder: this.cfg.spriteSubfolder,
      spriteRotationOffset: this.cfg.spriteRotationOffset,
      spriteAlpha: this.cfg.spriteAlpha,
      spriteBodyU: this.cfg.spriteBodyU,
      spriteBodyV: this.cfg.spriteBodyV,
      spriteMouthU: this.cfg.spriteMouthU,
      spriteMouthV: this.cfg.spriteMouthV,
      spriteFlipX: this.cfg.spriteFlipX,
      spriteDebug: this.cfg.spriteDebug,
      spriteAnimationEnabled: this.cfg.spriteAnimationEnabled,
      spriteAnimationFolder: this.cfg.spriteAnimationFolder,
      spriteAnimationSubfolder: this.cfg.spriteAnimationSubfolder,
      spriteAnimationFrames: this.cfg.spriteAnimationFrames,
      spriteAnimationStart: this.cfg.spriteAnimationStart,
      spriteAnimationFps: this.cfg.spriteAnimationFps,
      spriteAnimationPadding: this.cfg.spriteAnimationPadding,
      spriteAnimationExt: this.cfg.spriteAnimationExt
    };
  }

  draw(ctx) {
    this._drawEnemySprite(ctx);
    this.drawInnerArtifacts(ctx);

    if (this.sprite.debug) {
      for (const circle of this._getBodyCircles()) {
        ctx.beginPath();
        ctx.arc(circle.cx, circle.cy, circle.r, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(0, 255, 255, 0.95)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.closePath();
      }

      ctx.beginPath();
      ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 255, 255, 0.95)";
      ctx.fill();
      ctx.closePath();
      const { cx: gcx, cy: gcy, r: gr } = this._gitCircle();

      ctx.beginPath();
      ctx.arc(gcx, gcy, gr, 0, Math.PI * 2);
      ctx.fillStyle = this.cfg.gitCircleFillColor;
      ctx.fill();
      ctx.closePath();

      ctx.beginPath();
      ctx.arc(gcx, gcy, gr, 0, Math.PI * 2);
      ctx.strokeStyle = this.cfg.gitCircleBorderColor;
      ctx.lineWidth = this.cfg.gitCircleBorderWidth;
      ctx.stroke();
      ctx.closePath();

      const mouth = this._mouthPoint();

      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(mouth.x, mouth.y);
      ctx.lineWidth = this.cfg.mouthLineWidth;
      ctx.strokeStyle = this.cfg.mouthLineColor;
      ctx.stroke();
      ctx.closePath();

      ctx.beginPath();
      ctx.fillStyle = this.cfg.mouthInletColor;
      ctx.arc(mouth.x, mouth.y, this.cfg.mouthPointRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.closePath();
    }

    const { cx: gcx, cy: gcy, r: gr } = this._gitCircle();

    ctx.save();
    ctx.beginPath();
    ctx.arc(gcx, gcy, gr - 0.5, 0, Math.PI * 2);
    ctx.clip();
    for (const gp of this.gitParticles) gp.draw(ctx);
    ctx.restore();

    if (this.sprite.debug && this.cfg.gitShowCount && this.gitParticles.length > 0) {
      ctx.font = `bold ${this.cfg.gitCountFontSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = this.cfg.gitCountColor;
      ctx.fillText(`${this.gitParticles.length}/${this.cfg.gitMaxParticles}`, gcx, gcy);
    }

    if (this.layingEgg && this._egg) this._egg.draw(ctx);
  }
}
