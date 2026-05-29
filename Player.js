import { config } from "./config.js";
import { DEFAULTS as EggDef } from "./Egg.js";
import { Particle } from "./Particle.js";
import {
  getDefaultPlayerCollisionProfile,
  getPlayerCollisionRule,
  normalizePlayerCollisionProfile
} from "./playerCollisionProfile.js";
import { Projectile, DEFAULTS as ProjDef } from "./Projectile.js";
import { getNamedSpriteImage } from "./spriteAssets.js";

export const DEFAULTS = {
  radius:               30,
  color:                "rgba(0, 0, 255, 0.5)",
  clickForce:           0.9,
  absorptionFactor:     null,
  splitRadius:          null,
  splitChildRadius:     null,
  splitMinParentRadius: null,
  splitLaunchSpeed:     null,
  splitParentKick:      null
};

const INNER_CORE_OFFSET_RATIO = 0.16;
const INNER_CORE_SPRING = 0.16;
const INNER_CORE_DAMPING = 0.76;
const INNER_CORE_IDLE_RETURN = 0.1;
const PLAYER_INNER_MAX_RADIUS = 30;
const PLAYER_OUTER_TO_INNER_RATIO = 1.3;
const PLAYER_SPLIT_BRAKE_FRICTION = 0.7;
const PLAYER_SPLIT_STOP_SPEED = 0.05;
const PLAYER_EMERGE_FRICTION = 0.76;
const PLAYER_SPLIT_CLEARANCE = 2;
const PLAYER_SPLIT_REVEAL_BAND = 16;
const PLAYER_SPLIT_TRANSFER_MS = 1050;
const PLAYER_EMERGE_TRANSFER_MS = 1250;
const PLAYER_EMERGE_INNER_INSET = 0.75;
const PLAYER_TRANSFER_TRAIL_WIDTH = 0.34;
const PLAYER_OUTER_SCALE = 1.08;
const PLAYER_INNER_SCALE = 1.12;
const PLAYER_EDGE_POSITION_PUSH_FACTOR = 0.018;
const PLAYER_POST_EXCRETION_RADIUS = 3;
const PLAYER_POST_EXCRETION_RECOVERY_MS = 1200;
const PLAYER_CAPTURE_STATE_MACROPHAGE = "capturedByMacrophage";
const PLAYER_CAPTURE_STATE_PARTICLE = "capturedByParticle";
const PLAYER_CAPTURE_STATE_PARTICLE_ABSORBING = "absorbingIntoParticle";
const PLAYER_PARTICLE_CAPTURE_FAILSAFE_MS = 3200;
const PLAYER_OUTER_PROCEDURAL_POINTS = 96;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function drawProceduralPlayerOuter(ctx, x, y, radius, options = {}) {
  const r = Math.max(0.1, Number(radius) || 0.1);
  const t = Number.isFinite(options.time) ? options.time : performance.now() * 0.001;
  const alpha = clamp01(options.alpha ?? 1);
  const squashY = Number.isFinite(options.squashY) ? options.squashY : 0.96;

  if (alpha <= 0 || r <= 0.1) return;

  ctx.save();
  const baseAlpha = ctx.globalAlpha;
  ctx.globalAlpha = baseAlpha * alpha;

  ctx.beginPath();
  for (let i = 0; i <= PLAYER_OUTER_PROCEDURAL_POINTS; i++) {
    const a = (i / PLAYER_OUTER_PROCEDURAL_POINTS) * Math.PI * 2;
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

  const membraneGradient = ctx.createRadialGradient(
    x - r * 0.25,
    y - r * 0.28,
    r * 0.05,
    x,
    y,
    r
  );
  membraneGradient.addColorStop(0.00, "rgba(255, 255, 255, 0.95)");
  membraneGradient.addColorStop(0.35, "rgba(230, 232, 232, 0.90)");
  membraneGradient.addColorStop(0.72, "rgba(190, 198, 198, 0.72)");
  membraneGradient.addColorStop(1.00, "rgba(120, 130, 130, 0.45)");

  ctx.shadowColor = "rgba(220, 255, 255, 0.20)";
  ctx.shadowBlur = r * 0.28;
  ctx.fillStyle = membraneGradient;
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
  ctx.ellipse(x, y, r * 0.92, r * 0.92 * squashY, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.lineWidth = Math.max(1.5, r * 0.035);
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.99, r * 0.99 * squashY, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(70, 80, 80, 0.28)";
  ctx.lineWidth = Math.max(1, r * 0.025);
  ctx.stroke();

  ctx.restore();
}

export class Player extends Particle {
  constructor(
    x,
    y,
    radius = DEFAULTS.radius,
    color  = DEFAULTS.color
  ) {
    const minRadius = Number(config.playerMinRadius);
    const safeMinRadius = Number.isFinite(minRadius) && minRadius > 0 ? minRadius : 1;
    super(x, y, Math.max(safeMinRadius, Number(radius) || DEFAULTS.radius), 0, 0, color, true, false);
    this.clickForce = DEFAULTS.clickForce;
    this.absorptionFactor = DEFAULTS.absorptionFactor;
    this.splitRadius = DEFAULTS.splitRadius;
    this.splitChildRadius = DEFAULTS.splitChildRadius;
    this.splitMinParentRadius = DEFAULTS.splitMinParentRadius;
    this.splitLaunchSpeed = DEFAULTS.splitLaunchSpeed;
    this.splitParentKick = DEFAULTS.splitParentKick;
    this.innerCoreOffsetX = 0;
    this.innerCoreOffsetY = 0;
    this.innerCoreVelocityX = 0;
    this.innerCoreVelocityY = 0;
    this.emergingFromOldbody = null;
    this.splitOldbody = null;
    this.splitTransferStartMs = 0;
    this.emergenceAngle = 0;
    this.emergenceStartMs = 0;
    this.emergenceReleaseDx = 0;
    this.emergenceReleaseDy = 0;
    this.captureState = "active";
    this.captureHost = null;
    this.captureStartMs = 0;
    this.postExcretionRecoveryUntilMs = 0;
    this.postExcretionRadius = PLAYER_POST_EXCRETION_RADIUS;
    this.collisionProfile = getDefaultPlayerCollisionProfile();
  }

  setCollisionProfile(profile) {
    this.collisionProfile = normalizePlayerCollisionProfile(profile);
    return this.collisionProfile;
  }

  getCollisionRule(targetKey) {
    return getPlayerCollisionRule(this.collisionProfile, targetKey);
  }

  getFriction() {
    if (this.isCaptured() || this.isBeingParticleAbsorbed()) return 1;
    if (this.splitOldbody) return 1;
    if (this.emergingFromOldbody) return Math.min(config.playerFriction, PLAYER_EMERGE_FRICTION);

    const startRadius = Math.max(config.playerSlowdownStartRadius, DEFAULTS.radius);
    if (this.radius <= startRadius) return config.playerFriction;

    const splitRadius = Math.max(this.getSplitRadius(), startRadius + 1);
    const t = Math.min((this.radius - startRadius) / (splitRadius - startRadius), 1);

    const baseFriction = config.playerFriction + (config.playerMinFriction - config.playerFriction) * t;
    return this.canSplit()
      ? Math.min(baseFriction, PLAYER_SPLIT_BRAKE_FRICTION)
      : baseFriction;
  }

  getEdgeInset() {
    const inset = Number(config.playerEdgeInset);
    return Number.isFinite(inset) && inset > 0 ? inset : 0;
  }

  getBoundsRadius() {
    return Math.max(this.radius, this.radius * PLAYER_OUTER_SCALE);
  }

  constrainInsideBounds(bounds) {
    if (!bounds || !(bounds.width > 0) || !(bounds.height > 0)) return false;

    this._lastBounds = bounds;

    const width = Number(bounds.width);
    const height = Number(bounds.height);
    if (!(width > 0) || !(height > 0)) return false;

    const extent = Math.max(0.5, this.getBoundsRadius() + this.getEdgeInset());
    let clamped = false;

    if (extent * 2 >= width) {
      if (this.x !== width * 0.5) clamped = true;
      this.x = width * 0.5;
      this.dx = 0;
    } else if (this.x < extent) {
      this.x = extent;
      this.dx = Math.abs(this.dx);
      clamped = true;
    } else if (this.x > width - extent) {
      this.x = width - extent;
      this.dx = -Math.abs(this.dx);
      clamped = true;
    }

    if (extent * 2 >= height) {
      if (this.y !== height * 0.5) clamped = true;
      this.y = height * 0.5;
      this.dy = 0;
    } else if (this.y < extent) {
      this.y = extent;
      this.dy = Math.abs(this.dy);
      clamped = true;
    } else if (this.y > height - extent) {
      this.y = height - extent;
      this.dy = -Math.abs(this.dy);
      clamped = true;
    }

    return clamped;
  }

  edgeAvoid(bounds) {
    if (!bounds || !(bounds.width > 0) || !(bounds.height > 0)) return;

    const inset = this.getEdgeInset();
    const boundsRadius = this.getBoundsRadius();
    const configuredDistanceFactor = Number(config.playerEdgeAvoidDistanceFactor);
    const distanceFactor = Number.isFinite(configuredDistanceFactor) && configuredDistanceFactor > 0
      ? configuredDistanceFactor
      : config.edgeAvoidDistanceFactor;
    const configuredForce = Number(config.playerEdgeAvoidForce);
    const configuredPositionPushFactor = Number(config.playerEdgePositionPushFactor);
    const positionPushFactor = Number.isFinite(configuredPositionPushFactor) && configuredPositionPushFactor > 0
      ? configuredPositionPushFactor
      : PLAYER_EDGE_POSITION_PUSH_FACTOR;
    const d = Math.max(1, boundsRadius * distanceFactor);
    const leftDist = this.x - boundsRadius - inset;
    const rightDist = bounds.width - this.x - boundsRadius - inset;
    const topDist = this.y - boundsRadius - inset;
    const bottomDist = bounds.height - this.y - boundsRadius - inset;
    const force = Number.isFinite(configuredForce) && configuredForce >= 0
      ? configuredForce
      : config.edgeAvoidForce * 1.35;
    const positionForce = Math.max(0.18, boundsRadius * positionPushFactor);
    let pushX = 0;
    let pushY = 0;
    let pushing = false;

    if (leftDist < d) {
      const t = 1 - clamp01(leftDist / d);
      this.dx += force * t;
      pushX += positionForce * t;
      pushing = true;
    }
    if (rightDist < d) {
      const t = 1 - clamp01(rightDist / d);
      this.dx -= force * t;
      pushX -= positionForce * t;
      pushing = true;
    }
    if (topDist < d) {
      const t = 1 - clamp01(topDist / d);
      this.dy += force * t;
      pushY += positionForce * t;
      pushing = true;
    }
    if (bottomDist < d) {
      const t = 1 - clamp01(bottomDist / d);
      this.dy -= force * t;
      pushY -= positionForce * t;
      pushing = true;
    }

    if (pushing) {
      this.x += pushX;
      this.y += pushY;
      this.dx *= config.edgeAvoidDamping;
      this.dy *= config.edgeAvoidDamping;
      this.constrainInsideBounds(bounds);
    }
  }

  draw(ctx) {
    if (this.absorbed || this.isCaptured()) return;

    ctx.save();

    const speed = Math.hypot(this.dx, this.dy);
    const glowRadius = this.radius * (1.18 + Math.min(speed * 0.06, 0.22));
    const glow = ctx.createRadialGradient(
      this.x,
      this.y,
      this.radius * 0.25,
      this.x,
      this.y,
      glowRadius
    );
    glow.addColorStop(0, "rgba(245, 252, 255, 0.18)");
    glow.addColorStop(0.55, "rgba(82, 192, 255, 0.12)");
    glow.addColorStop(1, "rgba(82, 192, 255, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(this.x, this.y, glowRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.closePath();

    const outerRadius = this.radius;
    const maxOuterRadius = this.getMaxOuterRadius();
    const innerRadius = Math.min(
      this.radius / PLAYER_OUTER_TO_INNER_RATIO,
      PLAYER_INNER_MAX_RADIUS,
      maxOuterRadius - EggDef.targetRadius * 2,
      outerRadius
    );
    const maxInnerOffset = innerRadius * INNER_CORE_OFFSET_RATIO;
    const speedClamp = Math.min(speed / 3.5, 1);
    const desiredOffsetScale = maxInnerOffset * speedClamp;

    let targetOffsetX = 0;
    let targetOffsetY = 0;
    if (speed > 0.001) {
      targetOffsetX = (this.dx / speed) * desiredOffsetScale;
      targetOffsetY = (this.dy / speed) * desiredOffsetScale;
    }

    this.innerCoreVelocityX += (targetOffsetX - this.innerCoreOffsetX) * INNER_CORE_SPRING;
    this.innerCoreVelocityY += (targetOffsetY - this.innerCoreOffsetY) * INNER_CORE_SPRING;
    this.innerCoreVelocityX *= INNER_CORE_DAMPING;
    this.innerCoreVelocityY *= INNER_CORE_DAMPING;

    if (speed < 0.04) {
      this.innerCoreVelocityX += (0 - this.innerCoreOffsetX) * INNER_CORE_IDLE_RETURN;
      this.innerCoreVelocityY += (0 - this.innerCoreOffsetY) * INNER_CORE_IDLE_RETURN;
    }

    this.innerCoreOffsetX += this.innerCoreVelocityX;
    this.innerCoreOffsetY += this.innerCoreVelocityY;

    const offsetLength = Math.hypot(this.innerCoreOffsetX, this.innerCoreOffsetY);
    if (offsetLength > maxInnerOffset) {
      const scale = maxInnerOffset / offsetLength;
      this.innerCoreOffsetX *= scale;
      this.innerCoreOffsetY *= scale;
      this.innerCoreVelocityX *= 0.6;
      this.innerCoreVelocityY *= 0.6;
    }

    const innerX = this.x + this.innerCoreOffsetX;
    const innerY = this.y + this.innerCoreOffsetY;
    const innerSprite = getNamedSpriteImage("playerInner");
    const hasInnerSprite = !!(innerSprite && innerSprite.complete && innerSprite.naturalWidth);
    const isTransferringInsideOldbody = !!this.splitOldbody;
    const isEmergingInsideOldbody = !!this.emergingFromOldbody;
    const emergenceAlpha = this.getEmergenceAlpha();
    const emergenceGeometry = this.getEmergenceGeometry();
    const transferGeometry = this.getSplitTransferGeometry();

    if (isTransferringInsideOldbody || isEmergingInsideOldbody) {
      const transferProgress = this.getSplitTransferAlpha();
      const isResorbing = isEmergingInsideOldbody && !isTransferringInsideOldbody;
      const activeOldbody = this.getActiveOldbody();
      const innerTransferRadius = isResorbing
        ? innerRadius * (1 - emergenceAlpha * 0.72)
        : innerRadius * (0.92 + transferProgress * 0.08);
      let innerTransferX =
        transferGeometry?.innerX ??
        emergenceGeometry?.innerX ??
        innerX;
      let innerTransferY =
        transferGeometry?.innerY ??
        emergenceGeometry?.innerY ??
        innerY;

      if (isResorbing && activeOldbody) {
        const contactDistance = Math.max(
          0,
          activeOldbody.radius - innerTransferRadius - PLAYER_EMERGE_INNER_INSET
        );
        innerTransferX = activeOldbody.x + Math.cos(this.emergenceAngle) * contactDistance;
        innerTransferY = activeOldbody.y + Math.sin(this.emergenceAngle) * contactDistance;
      }
      const innerAlpha = isTransferringInsideOldbody
        ? (0.8 + transferProgress * 0.15)
        : 0.92 * (1 - emergenceAlpha * 0.72);
      const trailProgress = isTransferringInsideOldbody ? transferProgress : emergenceAlpha;
      const trailStartX = this.x + (innerTransferX - this.x) * 0.18;
      const trailStartY = this.y + (innerTransferY - this.y) * 0.18;
      const trailGradient = ctx.createLinearGradient(
        trailStartX,
        trailStartY,
        innerTransferX,
        innerTransferY
      );
      if (isTransferringInsideOldbody) {
        trailGradient.addColorStop(0, "rgba(120, 255, 210, 0.00)");
        trailGradient.addColorStop(0.45, `rgba(150, 255, 220, ${0.08 + trailProgress * 0.12})`);
        trailGradient.addColorStop(1, `rgba(240, 255, 250, ${0.22 + trailProgress * 0.18})`);
      } else {
        trailGradient.addColorStop(0, `rgba(240, 255, 250, ${0.18 * (1 - emergenceAlpha)})`);
        trailGradient.addColorStop(0.6, `rgba(150, 255, 220, ${0.14 * (1 - emergenceAlpha)})`);
        trailGradient.addColorStop(1, "rgba(120, 255, 210, 0.00)");
      }

      ctx.beginPath();
      ctx.moveTo(trailStartX, trailStartY);
      ctx.lineTo(innerTransferX, innerTransferY);
      ctx.strokeStyle = trailGradient;
      ctx.lineWidth = Math.max(1, innerTransferRadius * PLAYER_TRANSFER_TRAIL_WIDTH);
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.closePath();

      const glowRadius = innerTransferRadius * (1.35 + (isTransferringInsideOldbody ? trailProgress : 1 - emergenceAlpha) * 0.25);
      const transferGlow = ctx.createRadialGradient(
        innerTransferX,
        innerTransferY,
        innerTransferRadius * 0.16,
        innerTransferX,
        innerTransferY,
        glowRadius
      );
      transferGlow.addColorStop(0, `rgba(255, 255, 255, ${0.20 + innerAlpha * 0.25})`);
      transferGlow.addColorStop(0.55, `rgba(110, 255, 210, ${0.10 + innerAlpha * 0.16})`);
      transferGlow.addColorStop(1, "rgba(110, 255, 210, 0)");
      ctx.beginPath();
      ctx.arc(innerTransferX, innerTransferY, glowRadius, 0, Math.PI * 2);
      ctx.fillStyle = transferGlow;
      ctx.fill();
      ctx.closePath();

      if (hasInnerSprite) {
        const drawInnerSize = innerTransferRadius * 2 * PLAYER_INNER_SCALE;
        ctx.globalAlpha = innerAlpha;
        ctx.drawImage(
          innerSprite,
          innerTransferX - drawInnerSize * 0.5,
          innerTransferY - drawInnerSize * 0.5,
          drawInnerSize,
          drawInnerSize
        );
      } else {
        const innerGradient = ctx.createRadialGradient(
          innerTransferX - innerTransferRadius * 0.22,
          innerTransferY - innerTransferRadius * 0.25,
          innerTransferRadius * 0.08,
          innerTransferX,
          innerTransferY,
          innerTransferRadius
        );
        innerGradient.addColorStop(0, "rgba(255, 255, 255, 0.95)");
        innerGradient.addColorStop(0.5, "rgba(177, 247, 216, 0.92)");
        innerGradient.addColorStop(1, "rgba(34, 166, 126, 0.88)");

        ctx.beginPath();
        ctx.arc(innerTransferX, innerTransferY, innerTransferRadius, 0, Math.PI * 2);
        ctx.fillStyle = innerGradient;
        ctx.globalAlpha = innerAlpha;
        ctx.fill();
        ctx.closePath();
      }

      if (isTransferringInsideOldbody) {
        ctx.restore();
        return;
      }
    }

    const outerRevealScale = isEmergingInsideOldbody
      ? (0.42 + emergenceAlpha * 0.58)
      : 1;
    drawProceduralPlayerOuter(
      ctx,
      this.x,
      this.y,
      outerRadius * PLAYER_OUTER_SCALE * outerRevealScale,
      { alpha: 0.96 * emergenceAlpha }
    );

    if (!isTransferringInsideOldbody && hasInnerSprite) {
      const innerRevealScale = isEmergingInsideOldbody
        ? emergenceAlpha
        : 1;
      const drawInnerSize = innerRadius * 2 * PLAYER_INNER_SCALE * innerRevealScale;
      ctx.globalAlpha = 0.95 * (0.82 + emergenceAlpha * 0.18) * innerRevealScale;
      ctx.drawImage(
        innerSprite,
        innerX - drawInnerSize * 0.5,
        innerY - drawInnerSize * 0.5,
        drawInnerSize,
        drawInnerSize
      );
    } else if (!isTransferringInsideOldbody) {
      const innerRevealScale = isEmergingInsideOldbody
        ? emergenceAlpha
        : 1;
      const drawnInnerRadius = innerRadius * innerRevealScale;
      const innerGradient = ctx.createRadialGradient(
        innerX - drawnInnerRadius * 0.22,
        innerY - drawnInnerRadius * 0.25,
        drawnInnerRadius * 0.08,
        innerX,
        innerY,
        drawnInnerRadius
      );
      innerGradient.addColorStop(0, "rgba(255, 255, 255, 0.95)");
      innerGradient.addColorStop(0.5, "rgba(177, 247, 216, 0.92)");
      innerGradient.addColorStop(1, "rgba(34, 166, 126, 0.88)");

      ctx.beginPath();
      ctx.arc(innerX, innerY, drawnInnerRadius, 0, Math.PI * 2);
      ctx.fillStyle = innerGradient;
      ctx.globalAlpha = innerRevealScale;
      ctx.fill();
      ctx.closePath();

      ctx.beginPath();
      ctx.arc(innerX, innerY, drawnInnerRadius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = Math.max(1, drawnInnerRadius * 0.05);
      ctx.stroke();
      ctx.closePath();
    }

    ctx.restore();
  }

  canSplit() {
    if (!this.canTakeActions()) return false;
    const childRadius = this.getSplitSpawnRadius();
    const minParentRadius = this.getSplitMinParentRadius();
    return this.radius >= this.getSplitRadius()
      && (this.radius * this.radius) >= (childRadius * childRadius + minParentRadius * minParentRadius);
  }

  split(targetX, targetY) {
    if (this.absorbed || !this.canSplit()) return null;

    const angle = Math.atan2(targetY - this.y, targetX - this.x);
    const childRadius = this.getSplitSpawnRadius();
    const remainingRadius = Math.sqrt(
      Math.max(
        this.getSplitMinParentRadius() * this.getSplitMinParentRadius(),
        this.radius * this.radius - childRadius * childRadius
      )
    );

    const child = new Player(
      this.x,
      this.y,
      childRadius,
      this.color
    );

    child.dx = Math.cos(angle) * this.clickForce;
    child.dy = Math.sin(angle) * this.clickForce;

    return {
      child,
      angle,
      remainingRadius
    };
  }

  shoot(targetX, targetY) {
    if (!this.canTakeActions()) return null;

    const angle = Math.atan2(targetY - this.y, targetX - this.x);

    // recoil
    this.dx -= Math.cos(angle) * this.clickForce;
    this.dy -= Math.sin(angle) * this.clickForce;

    // cost of shooting
    this.radius = Math.max(this.getMinRadius(), this.radius * this.getAbsorptionFactor());
    this.prevRadius = this.radius;

    const distanceFromPlayer = this.radius + ProjDef.radius + 1;
    const px = this.x + Math.cos(angle) * distanceFromPlayer;
    const py = this.y + Math.sin(angle) * distanceFromPlayer;

    return new Projectile(
      px, py,
      Math.cos(angle) * ProjDef.speed,
      Math.sin(angle) * ProjDef.speed
    );
  }

  getAbsorptionFactor() {
    return Number.isFinite(this.absorptionFactor) ? this.absorptionFactor : config.absorptionFactor;
  }

  static getConfiguredMinRadius() {
    const minRadius = Number(config.playerMinRadius);
    return Number.isFinite(minRadius) && minRadius > 0 ? minRadius : 1;
  }

  getMinRadius() {
    return Player.getConfiguredMinRadius();
  }

  drawDigestForm(ctx, x = this.x, y = this.y, radiusOverride = null, alpha = 1) {
    const innerSprite = getNamedSpriteImage("playerInner");
    const hasInnerSprite = !!(innerSprite && innerSprite.complete && innerSprite.naturalWidth);
    const outerRadius = Math.max(1.2, Number(radiusOverride) || this.radius);
    const innerRadius = Math.max(0.8, Math.min(
      outerRadius / PLAYER_OUTER_TO_INNER_RATIO,
      PLAYER_INNER_MAX_RADIUS,
      outerRadius
    ));

    ctx.save();
    ctx.globalAlpha *= Math.max(0, Math.min(1, alpha));

    const glow = ctx.createRadialGradient(
      x,
      y,
      outerRadius * 0.16,
      x,
      y,
      outerRadius * 1.7
    );
    glow.addColorStop(0, "rgba(255, 255, 255, 0.24)");
    glow.addColorStop(0.55, "rgba(110, 215, 255, 0.18)");
    glow.addColorStop(1, "rgba(110, 215, 255, 0)");
    ctx.beginPath();
    ctx.arc(x, y, outerRadius * 1.7, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();
    ctx.closePath();

    drawProceduralPlayerOuter(ctx, x, y, outerRadius * PLAYER_OUTER_SCALE * 0.95);

    if (hasInnerSprite) {
      const drawInnerSize = innerRadius * 2 * PLAYER_INNER_SCALE;
      ctx.globalAlpha *= 0.95;
      ctx.drawImage(
        innerSprite,
        x - drawInnerSize * 0.5,
        y - drawInnerSize * 0.5,
        drawInnerSize,
        drawInnerSize
      );
    } else {
      const innerGradient = ctx.createRadialGradient(
        x - innerRadius * 0.22,
        y - innerRadius * 0.25,
        innerRadius * 0.08,
        x,
        y,
        innerRadius
      );
      innerGradient.addColorStop(0, "rgba(255, 255, 255, 0.95)");
      innerGradient.addColorStop(0.5, "rgba(177, 247, 216, 0.92)");
      innerGradient.addColorStop(1, "rgba(34, 166, 126, 0.88)");

      ctx.beginPath();
      ctx.arc(x, y, innerRadius, 0, Math.PI * 2);
      ctx.fillStyle = innerGradient;
      ctx.fill();
      ctx.closePath();
    }

    ctx.restore();
  }

  isCaptured() {
    return this.captureState === PLAYER_CAPTURE_STATE_MACROPHAGE || this.captureState === PLAYER_CAPTURE_STATE_PARTICLE;
  }

  isBeingParticleAbsorbed() {
    return this.captureState === PLAYER_CAPTURE_STATE_PARTICLE_ABSORBING;
  }

  isInRecoveryWindow(now = performance.now()) {
    return now < this.postExcretionRecoveryUntilMs;
  }

  canBeCaptured(now = performance.now()) {
    return !this.absorbed && !this.isCaptured() && !this.isBeingParticleAbsorbed() && !this.splitOldbody && !this.emergingFromOldbody && !this.isInRecoveryWindow(now);
  }

  canTakeActions() {
    return !this.absorbed && !this.isCaptured() && !this.isBeingParticleAbsorbed() && !this.splitOldbody && !this.emergingFromOldbody;
  }

  beginMacrophageCapture(macrophage) {
    if (!this.canBeCaptured()) return false;

    this.absorbed = false;
    this.removed = false;
    this.absorbing = null;
    this.captureState = PLAYER_CAPTURE_STATE_MACROPHAGE;
    this.captureHost = macrophage ?? null;
    this.captureStartMs = performance.now();
    this.dx = 0;
    this.dy = 0;
    return true;
  }

  beginParticleCapture(particle) {
    if (!(this.canBeCaptured() || this.isBeingParticleAbsorbed())) return false;

    this.absorbed = false;
    this.removed = false;
    this.absorbing = null;
    this.captureState = PLAYER_CAPTURE_STATE_PARTICLE;
    this.captureHost = particle ?? null;
    this.captureStartMs = performance.now();
    this.dx = 0;
    this.dy = 0;
    return true;
  }

  beginParticleAbsorption(particle) {
    if (!this.canBeCaptured()) return false;

    this.absorbed = false;
    this.removed = false;
    this.absorbing = null;
    this.captureState = PLAYER_CAPTURE_STATE_PARTICLE_ABSORBING;
    this.captureHost = particle ?? null;
    this.captureStartMs = performance.now();
    this.dx = 0;
    this.dy = 0;
    return true;
  }

  releaseFromCapture(x, y, dx, dy, radius = this.postExcretionRadius) {
    this.absorbed = false;
    this.removed = false;
    this.absorbing = null;
    this.isStationary = false;
    this.captureState = "postExcretionRecovery";
    this.captureHost = null;
    this.captureStartMs = 0;
    this.x = x;
    this.y = y;
    this.dx = dx;
    this.dy = dy;
    this.radius = Math.max(this.getMinRadius(), Number(radius) || this.postExcretionRadius);
    this.prevRadius = this.radius;
    this.postExcretionRecoveryUntilMs = performance.now() + PLAYER_POST_EXCRETION_RECOVERY_MS;
    this.constrainInsideBounds(this._lastBounds);
  }

  releaseFromMacrophage(x, y, dx, dy, radius = this.postExcretionRadius) {
    this.releaseFromCapture(x, y, dx, dy, radius);
  }

  releaseFromParticle(x, y, dx, dy, radius = this.postExcretionRadius) {
    this.releaseFromCapture(x, y, dx, dy, radius);
  }

  forceReleaseFromParticleHost(host = this.captureHost, radius = this.postExcretionRadius) {
    const releaseRadius = Math.max(this.getMinRadius(), Number(radius) || this.postExcretionRadius);
    if (!host) {
      this.releaseFromParticle(this.x, this.y, 0, 0, releaseRadius);
      return;
    }

    let dirX = this.x - host.x;
    let dirY = this.y - host.y;
    const dist = Math.hypot(dirX, dirY);

    if (dist > 0.0001) {
      dirX /= dist;
      dirY /= dist;
    } else {
      const hostSpeed = Math.hypot(host.dx ?? 0, host.dy ?? 0);
      if (hostSpeed > 0.0001) {
        dirX = (host.dx ?? 0) / hostSpeed;
        dirY = (host.dy ?? 0) / hostSpeed;
      } else {
        dirX = 1;
        dirY = 0;
      }
    }

    const releaseDistance = Math.max(releaseRadius + 4, (host.radius ?? 0) + releaseRadius + 6);
    if (host.absorbingPlayer === this) host.absorbingPlayer = null;
    if (host.capturedPlayer === this) {
      host.capturedPlayer = null;
      host.capturedPlayerOffsetX = 0;
      host.capturedPlayerOffsetY = 0;
      host.capturedPlayerReleaseAtMs = 0;
      host.playerCaptureCooldownUntilMs = performance.now() + 2600;
    }
    this.releaseFromParticle(
      (host.x ?? this.x) + dirX * releaseDistance,
      (host.y ?? this.y) + dirY * releaseDistance,
      dirX * 1.05,
      dirY * 1.05,
      releaseRadius
    );
  }

  clearCaptureState() {
    this.captureState = "active";
    this.captureHost = null;
    this.captureStartMs = 0;
  }

  getMaxInnerRadius() {
    return PLAYER_INNER_MAX_RADIUS;
  }

  getMaxOuterRadius() {
    return this.getMaxInnerRadius() + EggDef.targetRadius * 2;
  }

  getSplitRadius() {
    const configured = Number.isFinite(this.splitRadius) ? this.splitRadius : config.playerSplitRadius;
    return Math.max(this.getMaxOuterRadius(), configured);
  }

  getSplitSpawnRadius() {
    return Math.max(this.getMinRadius(), this.getSplitChildRadius());
  }

  getSplitChildRadius() {
    return Number.isFinite(this.splitChildRadius) ? this.splitChildRadius : config.playerSplitChildRadius;
  }

  getSplitMinParentRadius() {
    const configured = Number.isFinite(this.splitMinParentRadius) ? this.splitMinParentRadius : config.playerSplitMinParentRadius;
    return Math.max(this.getMinRadius(), configured);
  }

  getSplitLaunchSpeed() {
    return Number.isFinite(this.splitLaunchSpeed) ? this.splitLaunchSpeed : config.playerSplitLaunchSpeed;
  }

  getSplitParentKick() {
    return Number.isFinite(this.splitParentKick) ? this.splitParentKick : config.playerSplitParentKick;
  }

  getEmergenceAlpha() {
    if (!this.emergingFromOldbody) return 1;
    const elapsed = performance.now() - this.emergenceStartMs;
    return clamp01(elapsed / Math.max(PLAYER_EMERGE_TRANSFER_MS, 1));
  }

  getSplitTransferAlpha() {
    if (!this.splitOldbody) return 1;
    const elapsed = performance.now() - this.splitTransferStartMs;
    return clamp01(elapsed / Math.max(PLAYER_SPLIT_TRANSFER_MS, 1));
  }

  getActiveOldbody() {
    return this.splitOldbody ?? this.emergingFromOldbody ?? null;
  }

  getActiveEmergenceAngle() {
    return this.emergenceAngle;
  }

  getSafeEmergenceAngle(angle, oldbody = this.getActiveOldbody(), bounds = this._lastBounds) {
    if (!oldbody || !bounds || !(bounds.width > 0) || !(bounds.height > 0)) return angle;

    const width = Number(bounds.width);
    const height = Number(bounds.height);
    if (!(width > 0) || !(height > 0)) return angle;

    const extent = Math.max(0.5, this.getBoundsRadius() + this.getEdgeInset());
    const outerDistance = oldbody.radius + this.radius + PLAYER_SPLIT_CLEARANCE;
    const candidateX = oldbody.x + Math.cos(angle) * outerDistance;
    const candidateY = oldbody.y + Math.sin(angle) * outerDistance;
    const minX = extent;
    const minY = extent;
    const maxX = width - extent;
    const maxY = height - extent;
    const safeX = minX <= maxX
      ? Math.min(Math.max(candidateX, minX), maxX)
      : width * 0.5;
    const safeY = minY <= maxY
      ? Math.min(Math.max(candidateY, minY), maxY)
      : height * 0.5;

    let dirX = safeX - oldbody.x;
    let dirY = safeY - oldbody.y;
    let dirLength = Math.hypot(dirX, dirY);

    if (dirLength <= 0.0001) {
      dirX = width * 0.5 - oldbody.x;
      dirY = height * 0.5 - oldbody.y;
      dirLength = Math.hypot(dirX, dirY);
    }

    return dirLength > 0.0001 ? Math.atan2(dirY, dirX) : angle;
  }

  alignEmergenceToBounds(bounds = this._lastBounds) {
    if (!this.emergingFromOldbody) return;

    const angle = this.getSafeEmergenceAngle(this.emergenceAngle, this.emergingFromOldbody, bounds);
    if (!Number.isFinite(angle)) return;

    this.emergenceAngle = angle;

    const releaseSpeed = Math.hypot(this.emergenceReleaseDx, this.emergenceReleaseDy);
    if (releaseSpeed > 0.0001) {
      this.emergenceReleaseDx = Math.cos(angle) * releaseSpeed;
      this.emergenceReleaseDy = Math.sin(angle) * releaseSpeed;
    }
  }

  getSplitTransferGeometry() {
    if (!this.splitOldbody) return null;

    const progress = this.getSplitTransferAlpha();
    const smooth = progress * progress * (3 - 2 * progress);
    const angle = this.getActiveEmergenceAngle();
    const nx = Math.cos(angle);
    const ny = Math.sin(angle);
    const oldbody = this.splitOldbody;
    const innerRadius = Math.min(
      this.radius / PLAYER_OUTER_TO_INNER_RATIO,
      PLAYER_INNER_MAX_RADIUS,
      this.getMaxOuterRadius() - EggDef.targetRadius * 2,
      this.radius
    );
    const targetInnerDistance = Math.max(0, oldbody.radius - innerRadius - PLAYER_EMERGE_INNER_INSET);
    const startInnerDistance = Math.max(0, oldbody.radius * 0.12);
    const innerDistance =
      startInnerDistance + (targetInnerDistance - startInnerDistance) * smooth;

    return {
      innerX: oldbody.x + nx * innerDistance,
      innerY: oldbody.y + ny * innerDistance,
      progress: smooth
    };
  }

  getEmergenceGeometry() {
    if (!this.emergingFromOldbody) return null;

    const progress = this.getEmergenceAlpha();
    const smooth = progress * progress * (3 - 2 * progress);
    const safeAngle = this.getSafeEmergenceAngle(this.emergenceAngle, this.emergingFromOldbody, this._lastBounds);
    const innerAngle = safeAngle;
    const outerAngle = safeAngle;
    const innerNX = Math.cos(innerAngle);
    const innerNY = Math.sin(innerAngle);
    const outerNX = Math.cos(outerAngle);
    const outerNY = Math.sin(outerAngle);
    const oldbody = this.emergingFromOldbody;
    const innerRadius = Math.min(
      this.radius / PLAYER_OUTER_TO_INNER_RATIO,
      PLAYER_INNER_MAX_RADIUS,
      this.getMaxOuterRadius() - EggDef.targetRadius * 2,
      this.radius
    );
    const targetInnerDistance = Math.max(0, oldbody.radius - innerRadius - PLAYER_EMERGE_INNER_INSET);
    const innerDistance = targetInnerDistance;
    const outerDistance =
      oldbody.radius + this.radius * (0.25 + smooth * 0.75) + PLAYER_SPLIT_CLEARANCE;

    return {
      innerX: oldbody.x + innerNX * innerDistance,
      innerY: oldbody.y + innerNY * innerDistance,
      outerX: oldbody.x + outerNX * outerDistance,
      outerY: oldbody.y + outerNY * outerDistance,
      progress: smooth
    };
  }

  beginEmergenceFromOldbody(oldbody, angle, releaseDx = 0, releaseDy = 0) {
    this.emergingFromOldbody = oldbody;
    this.splitOldbody = null;
    this.emergenceAngle = angle;
    this.emergenceStartMs = performance.now();
    this.emergenceReleaseDx = releaseDx;
    this.emergenceReleaseDy = releaseDy;
    this.alignEmergenceToBounds(this._lastBounds);

    const geometry = this.getEmergenceGeometry();
    if (geometry) {
      this.x = geometry.outerX;
      this.y = geometry.outerY;
    }

    this.dx = 0;
    this.dy = 0;
    this.constrainInsideBounds(this._lastBounds);
  }

  beginSplitTransfer(oldbody, angle, releaseDx = 0, releaseDy = 0) {
    this.splitOldbody = oldbody;
    this.emergingFromOldbody = null;
    this.splitTransferStartMs = performance.now();
    this.emergenceAngle = angle;
    this.emergenceReleaseDx = releaseDx;
    this.emergenceReleaseDy = releaseDy;
    this.radius = Math.max(this.getMinRadius(), this.getSplitSpawnRadius());
    this.prevRadius = this.radius;
    this.x = oldbody.x;
    this.y = oldbody.y;
    this.dx = 0;
    this.dy = 0;
    this.constrainInsideBounds(this._lastBounds);
  }

  update(particles, spatialGrid, enemies, macrophages, player, vectorField, bounds, obstacles, stones, algaeList) {
    this._lastBounds = bounds;

    if (this.isCaptured() || this.isBeingParticleAbsorbed()) {
      const now = performance.now();
      const isParticleCapture =
        this.captureState === PLAYER_CAPTURE_STATE_PARTICLE ||
        this.captureState === PLAYER_CAPTURE_STATE_PARTICLE_ABSORBING;

      if (isParticleCapture) {
        const host = this.captureHost;
        const hostMissing = !host || host.removed || host.absorbed;
        const hostNoLongerCarriesPlayer = !!host && host.capturedPlayer !== this && host.absorbingPlayer !== this;
        const timedCarryRelease =
          this.captureState === PLAYER_CAPTURE_STATE_PARTICLE &&
          !!host &&
          host.capturedPlayer === this &&
          Number.isFinite(host.capturedPlayerReleaseAtMs) &&
          now >= host.capturedPlayerReleaseAtMs;
        const failsafeRelease = now - this.captureStartMs >= PLAYER_PARTICLE_CAPTURE_FAILSAFE_MS;

        if (timedCarryRelease || failsafeRelease || hostMissing || hostNoLongerCarriesPlayer) {
          this.forceReleaseFromParticleHost(host, this.postExcretionRadius);
        } else {
          this.dx = 0;
          this.dy = 0;
          this.constrainInsideBounds(bounds);
          return;
        }
      } else if (!this.captureHost || this.captureHost.removed || this.captureHost.absorbed) {
        this.clearCaptureState();
      } else {
        this.dx = 0;
        this.dy = 0;
        this.constrainInsideBounds(bounds);
        return;
      }
    }

    if (this.captureState === "postExcretionRecovery" && !this.isInRecoveryWindow()) {
      this.captureState = "active";
    }

    if (this.radius < this.getMinRadius()) {
      this.radius = this.getMinRadius();
      this.prevRadius = this.radius;
    }

    if (this.splitOldbody) {
      const geometry = this.getSplitTransferGeometry();
      this.x = this.splitOldbody.x;
      this.y = this.splitOldbody.y;
      if (geometry) {
        this.innerCoreOffsetX = geometry.innerX - this.x;
        this.innerCoreOffsetY = geometry.innerY - this.y;
      }
      this.innerCoreVelocityX = 0;
      this.innerCoreVelocityY = 0;
      this.dx = 0;
      this.dy = 0;
      this.constrainInsideBounds(bounds);
    }

    if (this.emergingFromOldbody) {
      this.alignEmergenceToBounds(bounds);
      const geometry = this.getEmergenceGeometry();
      if (geometry) {
        this.x = geometry.outerX;
        this.y = geometry.outerY;
      }
      this.dx = 0;
      this.dy = 0;
      this.constrainInsideBounds(bounds);
    }

    const filteredStones = this.emergingFromOldbody
      ? (stones ?? []).filter(stone => stone !== this.emergingFromOldbody)
      : stones;

    super.update(
      particles,
      spatialGrid,
      enemies,
      macrophages,
      player,
      vectorField,
      bounds,
      obstacles,
      filteredStones,
      algaeList
    );

    if (this.splitOldbody) {
      this.x = this.splitOldbody.x;
      this.y = this.splitOldbody.y;
      this.dx = 0;
      this.dy = 0;
      this.constrainInsideBounds(bounds);

      const geometry = this.getSplitTransferGeometry();
      if (geometry) {
        this.innerCoreOffsetX = geometry.innerX - this.x;
        this.innerCoreOffsetY = geometry.innerY - this.y;
      }

      if (this.getSplitTransferAlpha() >= 1) {
        this.beginEmergenceFromOldbody(
          this.splitOldbody,
          this.getActiveEmergenceAngle(),
          this.emergenceReleaseDx,
          this.emergenceReleaseDy
        );
      }
      return;
    }

    if (this.emergingFromOldbody) {
      this.alignEmergenceToBounds(bounds);
      const geometry = this.getEmergenceGeometry();
      if (geometry) {
        this.x = geometry.outerX;
        this.y = geometry.outerY;
      }
      this.dx = 0;
      this.dy = 0;
      this.constrainInsideBounds(bounds);

      if (this.getEmergenceAlpha() >= 1) {
        this.dx = this.emergenceReleaseDx;
        this.dy = this.emergenceReleaseDy;
        this.emergingFromOldbody = null;
        this.constrainInsideBounds(bounds);
      }
    }

    this.constrainInsideBounds(bounds);

    if (!this.canSplit()) return;

    const speed = Math.hypot(this.dx, this.dy);
    if (speed <= PLAYER_SPLIT_STOP_SPEED) {
      this.dx = 0;
      this.dy = 0;
    }
  }
}
