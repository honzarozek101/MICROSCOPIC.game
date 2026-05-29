import { config } from "./config.js";
import { clamp, rand, makeTintGreen, makeTintRed } from "./utils.js";
import { getSpriteImage } from "./spriteAssets.js";
import { calculateProjectileAlgaeFieldAt } from "./projectileAlgaeField.js";

const PARTICLE_SPRITE_SCALE = 1.0;
const PARTICLE_SPRITE_ALPHA = 0.78;
const PARTICLE_SPRITE_INSET_PX = 2.5;
const PROJECTILE_STONE_BOUNCE_MULTIPLIER = 1.35;
const PROJECTILE_STONE_MIN_BOUNCE = 1.4;
const PROJECTILE_STONE_TRANSFER_SCALE = 0.08;
const PLAYER_CAPTURE_SIZE_ADVANTAGE = 2;
const PLAYER_CAPTURE_DURATION_MS = 2100;
const PLAYER_CAPTURE_COOLDOWN_MS = 2600;
const PLAYER_CAPTURE_RELEASE_RADIUS = 3;
const PLAYER_CAPTURE_RELEASE_SPEED = 1.05;
const PLAYER_CAPTURE_CARRY_OFFSET_RATIO = 0.18;
const PLAYER_CAPTURE_SHRINK_TARGET_RADIUS = 5;
const PLAYER_CAPTURE_ABSORB_RATE = 0.12;

export class Particle {
  constructor(x, y, radius, dx, dy, color, isPlayer = false, isProjectile = false) {
    this.x = x;
    this.y = y;
    this.radius = radius;

    this.dx = dx ?? (Math.random() * 2 - 1);
    this.dy = dy ?? (Math.random() * 2 - 1);

    this.color         = color;
    this.isPlayer      = isPlayer;
    this.isProjectile  = isProjectile;

    this.absorbed      = false;
    this.isStationary  = false;
    this.absorbing     = null;

    this.isDividing      = false;
    this.divisionStartMs = 0;

    this.prevRadius          = radius;
    this.divisionLockUntilMs = 0;

    this.lastThreatCheck  = 0;
    this.lastKick         = 0;
    this.lastMicroImpulse = 0;

    this.spawnTime = performance.now();

    this.kickCooldownLocal   = config.kickCooldownMs * (0.6 + Math.random() * 1.2);
    this.minSpeedLocal       = config.minSpeed * (0.7 + Math.random() * 1.0);
    this.kickStrengthLocal   = config.kickStrength * (0.7 + Math.random() * 0.8);
    this.kickJitterLocal     = config.kickJitter * (0.6 + Math.random() * 1.2);

    this.threatIntervalLocal = config.threatInterval * (0.5 + Math.random() * 1.8);
    this.threatDistanceLocal = config.threatDistance * (0.7 + Math.random() * 1.6);
    this.escapeForceLocal    = config.escapeForce * (0.6 + Math.random() * 1.3);

    this.microImpulseIntervalLocal =
      config.microImpulseBaseIntervalMs * (0.6 + Math.random() * 1.4);
    this.microImpulseStrengthLocal =
      config.microImpulseStrength * (0.6 + Math.random() * 1.2);

    this.tintGreen = makeTintGreen();
    this.tintRed   = makeTintRed();
    this.tintGroup = null;
    this.spriteIndex = 1;
    this.spriteFolder = "Particle";
    this.spriteFamily = "particle";
    this.spriteVariant = "green";
    this.growthStartRadius = null;
    this.growthTargetRadius = null;
    this.growthStartMs = 0;
    this.growthDurationMs = 0;
    this.canCapturePlayer = true;
    this.absorbingPlayer = null;
    this.absorbingPlayerDirX = 1;
    this.absorbingPlayerDirY = 0;
    this.capturedPlayer = null;
    this.capturedPlayerOffsetX = 0;
    this.capturedPlayerOffsetY = 0;
    this.capturedPlayerReleaseAtMs = 0;
    this.playerCaptureCooldownUntilMs = 0;
    this.oldbodyFeedCooldownUntilMs = 0;
    this.quansistorAbsorbing = null;
    this.quansistorAbsorbingOldbody = null;
  }

  get isCell() {
    return !this.isPlayer && !this.isProjectile;
  }

  findNearestEnemy(enemies) {
    let nearest = null;
    let nearestDist = Infinity;

    for (const enemy of enemies ?? []) {
      if (!enemy) continue;

      const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
      if (dist < nearestDist) {
        nearest = enemy;
        nearestDist = dist;
      }
    }

    return { enemy: nearest, distance: nearestDist };
  }

  findNearestMacrophage(macrophages, spriteIndex = null) {
    let nearest = null;
    let nearestDist = Infinity;

    for (const macrophage of macrophages ?? []) {
      if (!macrophage) continue;
      if (spriteIndex != null && Number(macrophage.spriteIndex) !== Number(spriteIndex)) continue;

      const dist = Math.hypot(macrophage.x - this.x, macrophage.y - this.y);
      if (dist < nearestDist) {
        nearest = macrophage;
        nearestDist = dist;
      }
    }

    return { macrophage: nearest, distance: nearestDist };
  }

  draw(ctx) {
    if (this.absorbed) return;

    ctx.save();

    if (this.isDividing) {
      const elapsed = performance.now() - this.divisionStartMs;
      const t = Math.min(elapsed / config.divisionPauseMs, 1.0);
      const glow = 8 + 14 * Math.abs(Math.sin(t * Math.PI * 2));
      ctx.shadowColor = "white";
      ctx.shadowBlur = glow;
    }

    const usedSprite = this.isCell && this.drawSprite(ctx);
    if (!usedSprite) this.drawFallbackBody(ctx);

    if (this.capturedPlayer && typeof this.capturedPlayer.drawDigestForm === "function") {
      const carryRadius = Math.max(1.2, Math.min(this.radius * 0.34, 6));
      this.capturedPlayer.drawDigestForm(
        ctx,
        this.x + this.capturedPlayerOffsetX,
        this.y + this.capturedPlayerOffsetY,
        carryRadius,
        0.92
      );
    }

    ctx.restore();
  }

  drawFallbackBody(ctx) {
    ctx.beginPath();
    const gradient = ctx.createRadialGradient(
      this.x, this.y, this.radius / 2,
      this.x, this.y, this.radius
    );
    gradient.addColorStop(0, "white");
    gradient.addColorStop(1, this.color);
    ctx.fillStyle = gradient;
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.closePath();
  }

  drawSprite(ctx) {
    const img = getSpriteImage({
      folder: this.spriteFolder,
      family: this.spriteFamily,
      variant: this.spriteVariant,
      index: this.spriteIndex
    });
    if (!img || !img.complete || !img.naturalWidth) return false;

    const drawSize = this.radius * PARTICLE_SPRITE_SCALE * 2;
    const inset = Math.min(
      PARTICLE_SPRITE_INSET_PX,
      Math.max(0, img.naturalWidth * 0.125),
      Math.max(0, img.naturalHeight * 0.125)
    );

    ctx.globalAlpha = PARTICLE_SPRITE_ALPHA;
    ctx.drawImage(
      img,
      inset,
      inset,
      img.naturalWidth - inset * 2,
      img.naturalHeight - inset * 2,
      this.x - drawSize / 2,
      this.y - drawSize / 2,
      drawSize,
      drawSize
    );

    return true;
  }

absorbStep(target) {
  if (!target || target.absorbed) {
    this.absorbing = null;
    return;
  }
  if (target.isDividing) {
    this.absorbing = null;
    return;
  }

  let dx = target.x - this.x;
  let dy = target.y - this.y;
  let dist = Math.hypot(dx, dy);

  // fallback kdyby byly středy skoro přes sebe
  if (dist <= 0.0001) {
    dx = 1;
    dy = 0;
    dist = 1;
  }

  const nx = dx / dist;
  const ny = dy / dist;

  // utlum pohyb absorbované částice
  target.dx *= 0.65;
  target.dy *= 0.65;

  // absorbce
  const absorbRate = 0.12;
  const taken = Math.min(absorbRate, target.radius);
  const gainFactor = this.isPlayer
    ? config.playerAbsorptionGain
    : config.particleAbsorptionGain;
  const maxSelfRadius =
    this.isPlayer && typeof this.getMaxOuterRadius === "function"
      ? this.getMaxOuterRadius()
      : Infinity;
  const appliedGain = Math.min(
    taken * gainFactor,
    Math.max(0, maxSelfRadius - this.radius)
  );

  const targetMinRadius =
    target.isPlayer && typeof target.getMinRadius === "function"
      ? target.getMinRadius()
      : 0;
  target.radius = Math.max(targetMinRadius, target.radius - taken);
  this.radius += appliedGain;

  // přesně udržuj dotyk obou kruhů
  const contactDist = this.radius + target.radius;
  target.x = this.x + nx * contactDist;
  target.y = this.y + ny * contactDist;

  if (!target.isPlayer && target.radius < 0.5) {
    const finalGain = Math.min(
      target.radius * gainFactor,
      Math.max(0, maxSelfRadius - this.radius)
    );
    this.radius += finalGain;
    target.absorbed = true;
    this.absorbing = null;
  }

  this.prevRadius = this.radius;
}

  pushOutFromBody(body, bounceStrength = 0.5) {
    if (!body) return;

    const circles =
      typeof body._getBodyCircles === "function"
        ? body._getBodyCircles()
        : typeof body._getCircles === "function"
          ? body._getCircles()
          : [{ cx: body.x, cy: body.y, r: body.radius }];

    let best = null;
    for (const circle of circles) {
      const dx = this.x - circle.cx;
      const dy = this.y - circle.cy;
      const minDist = this.radius + circle.r;
      const distSq = dx * dx + dy * dy;
      const minDistSq = minDist * minDist;

      if (distSq >= minDistSq || distSq <= 0.00000001) continue;

      const dist = Math.sqrt(distSq);
      const hit = {
        nx: dx / dist,
        ny: dy / dist,
        overlap: minDist - dist,
        circle
      };

      if (!best || hit.overlap > best.overlap) best = hit;
    }

    if (!best) return;

    if (this.isProjectile && typeof body.tryAbsorbProjectile === "function") {
      const wasAbsorbed = body.tryAbsorbProjectile(this, {
        ...best,
        contactX: best.circle?.cx ?? body.x,
        contactY: best.circle?.cy ?? body.y
      });
      if (wasAbsorbed) return;
    }

    this.x += best.nx * best.overlap;
    this.y += best.ny * best.overlap;
    this.dx += best.nx * bounceStrength;
    this.dy += best.ny * bounceStrength;
  }

  pushOutFromStone(stone) {
    if (!stone) return;
    const isOldbody = Array.isArray(stone.cargoParticles);

    const circles = typeof stone._getCircles === "function"
      ? stone._getCircles()
      : [{ cx: stone.x, cy: stone.y, r: stone.radius }];

    let best = null;
    for (const circle of circles) {
      const dx = this.x - circle.cx;
      const dy = this.y - circle.cy;
      const minDist = this.radius + circle.r;
      const distSq = dx * dx + dy * dy;
      const minDistSq = minDist * minDist;

      if (distSq >= minDistSq || distSq <= 0.00000001) continue;

      const dist = Math.sqrt(distSq);
      const hit = {
        nx: dx / dist,
        ny: dy / dist,
        overlap: minDist - dist,
        circle
      };

      if (!best || hit.overlap > best.overlap) best = hit;
    }

    if (!best) return;

    if (this.isProjectile && typeof stone.tryAbsorbProjectile === "function") {
      const wasAbsorbed = stone.tryAbsorbProjectile(this, {
        ...best,
        contactX: best.circle?.cx ?? stone.x,
        contactY: best.circle?.cy ?? stone.y
      });
      if (wasAbsorbed) return;
    }

    this.x += best.nx * best.overlap;
    this.y += best.ny * best.overlap;

    if (this.isProjectile) {
      const incomingNormalSpeed = this.dx * best.nx + this.dy * best.ny;
      const projectileBounce = Math.max(
        PROJECTILE_STONE_MIN_BOUNCE,
        (stone.bounceForce ?? 1) * PROJECTILE_STONE_BOUNCE_MULTIPLIER
      );

      if (incomingNormalSpeed < 0) {
        this.dx -= 2 * incomingNormalSpeed * best.nx;
        this.dy -= 2 * incomingNormalSpeed * best.ny;
      }

      this.dx += best.nx * projectileBounce;
      this.dy += best.ny * projectileBounce;

      if (!isOldbody || this.isPlayer) {
        this.applyStoneCollisionImpulse(stone, best, projectileBounce * PROJECTILE_STONE_TRANSFER_SCALE);
      }
      return;
    }

    const force = stone.bounceForce ?? 1;
    this.dx += best.nx * force;
    this.dy += best.ny * force;

    if (stone.type === "Algae" && !this.isPlayer) return;

    if (isOldbody && !this.isPlayer) return;

    this.applyStoneCollisionImpulse(stone, best, force);
  }

  applyStoneCollisionImpulse(stone, hit, force) {
    stone.receiveImpulse(hit.nx, hit.ny, force, hit.circle?.cx ?? stone.x, hit.circle?.cy ?? stone.y);
  }

  updateLifetime(now) {
    if (!this.isProjectile) return false;

    if (now - this.spawnTime > config.projectileTTLms) {
      this.absorbed = true;
      return true;
    }

    return false;
  }

  updatePosition() {
    this.prevX = this.x;
    this.prevY = this.y;
    this.x += this.dx;
    this.y += this.dy;
  }

  updateGrowth(now) {
    if (!Number.isFinite(this.growthTargetRadius) || this.growthTargetRadius == null) return;
    if (!Number.isFinite(this.growthStartRadius) || this.growthStartRadius == null) {
      this.growthStartRadius = this.radius;
    }

    const durationMs = Math.max(0, Number(this.growthDurationMs) || 0);
    if (durationMs <= 0) {
      this.radius = Math.max(this.radius, this.growthTargetRadius);
      this.growthStartRadius = null;
      this.growthTargetRadius = null;
      this.growthStartMs = 0;
      this.growthDurationMs = 0;
      return;
    }

    if (!this.growthStartMs) this.growthStartMs = now;

    const elapsed = Math.max(0, now - this.growthStartMs);
    const t = Math.min(elapsed / durationMs, 1);
    const grownRadius =
      this.growthStartRadius + (this.growthTargetRadius - this.growthStartRadius) * t;

    if (grownRadius > this.radius) {
      this.radius = grownRadius;
    }

    if (t >= 1 || this.radius >= this.growthTargetRadius) {
      this.radius = Math.max(this.radius, this.growthTargetRadius);
      this.growthStartRadius = null;
      this.growthTargetRadius = null;
      this.growthStartMs = 0;
      this.growthDurationMs = 0;
    }
  }

  handleMaxRadius() {
    // Player uses split/growth mechanics and must not freeze at global maxRadius.
    if (this.isCell || this.isPlayer) return false;
    if (this.radius < config.maxRadius) return false;

    this.dx = 0;
    this.dy = 0;
    this.isStationary = true;
    return true;
  }

  handleDivision(now, particles, enemies, macrophages) {
    if (!this.isCell) return false;
    if (this.absorbed) return false;

    const canDivide = now >= this.divisionLockUntilMs;

    if (!this.isDividing && canDivide && this.radius >= config.divisionRadius) {
      this.isDividing = true;
      this.divisionStartMs = now;
      this.absorbing = null;
      this.dx = 0;
      this.dy = 0;
    }

    if (!this.isDividing) return false;

    this.dx = 0;
    this.dy = 0;
    this.absorbing = null;

    for (const enemy of enemies ?? []) {
      const distToEnemy = Math.hypot(this.x - enemy.x, this.y - enemy.y);
      const minDist = this.radius + enemy.radius;

      if (distToEnemy < minDist && distToEnemy > 0.0001) {
        const angle = Math.atan2(this.y - enemy.y, this.x - enemy.x);
        const overlap = minDist - distToEnemy;
        this.x += Math.cos(angle) * overlap;
        this.y += Math.sin(angle) * overlap;
      }
    }

    for (const m of macrophages ?? []) {
      const distToM = Math.hypot(this.x - m.x, this.y - m.y);
      const minDist = this.radius + m.radius;

      if (distToM < minDist && distToM > 0.0001) {
        const angle = Math.atan2(this.y - m.y, this.x - m.x);
        const overlap = minDist - distToM;
        this.x += Math.cos(angle) * overlap;
        this.y += Math.sin(angle) * overlap;
      }
    }

    const elapsed = now - this.divisionStartMs;

    if (elapsed >= config.divisionPauseMs) {
      const childRadius = this.radius * config.divisionChildScale;
      const axis = Math.random() * Math.PI * 2;
      const baseSpawn = childRadius + 2;
      const asym = (Math.random() - 0.5) * 2 * config.divisionAngleAsym;

      for (let i = 0; i < 2; i++) {
        const jitter = (Math.random() - 0.5) * 2 * config.divisionAngleJitter;

        const a = i === 0
          ? axis + jitter
          : axis + Math.PI + asym + jitter;

        const spMul = rand(config.divisionSpeedMinMul, config.divisionSpeedMaxMul);
        const spdChild = config.divisionSpeedBoost * spMul;

        const spawnMul = 1 + (Math.random() - 0.5) * 2 * config.divisionSpawnJitterMul;
        const spawnOffset = baseSpawn * spawnMul;

        const child = new Particle(
          this.x + Math.cos(a) * spawnOffset,
          this.y + Math.sin(a) * spawnOffset,
          childRadius,
          Math.cos(a) * spdChild,
          Math.sin(a) * spdChild,
          this.color,
          false,
          false
        );

        child.divisionLockUntilMs = now + config.divisionCooldownMs;
        child.prevRadius = child.radius;
        child.tintGroup = null;

        particles.push(child);
      }

      this.absorbed = true;
      return true;
    }

    return true;
  }

  updateAmbientTint(player) {
    if (!this.isCell || !player) return;

    const m = config.colorHysteresisPx;
    const pr = player.radius;

    if (!this.tintGroup) {
      this.tintGroup = this.radius > pr ? "red" : "green";
    } else {
      if (this.tintGroup === "green" && this.radius > pr + m) this.tintGroup = "red";
      else if (this.tintGroup === "red" && this.radius < pr - m) this.tintGroup = "green";
    }

    this.color = this.tintGroup === "red" ? this.tintRed : this.tintGreen;
    this.spriteVariant = this.tintGroup;
  }

  getFriction() {
    return this.isPlayer ? config.playerFriction : config.particleFriction;
  }

  applyProjectileAlgaeField(algaeList) {
    if (!this.isProjectile) return;
    const { fx, fy } = calculateProjectileAlgaeFieldAt(this.x, this.y, algaeList);
    this.dx += fx;
    this.dy += fy;
  }

  applyMotionForces(vectorField, bounds, algaeList) {
    const friction = this.getFriction();

    this.dx *= friction;
    this.dy *= friction;

    if (!this.isPlayer) {
      this.dx += (Math.random() - 0.5) * config.brownianStrength;
      this.dy += (Math.random() - 0.5) * config.brownianStrength;

      const vfKey = `${Math.floor(this.x / config.gridSize)},${Math.floor(this.y / config.gridSize)}`;
      const vf = vectorField?.[vfKey];

      if (vf) {
        this.dx += vf.fx;
        this.dy += vf.fy;
      }
    }

    this.applyProjectileAlgaeField(algaeList);
    this.edgeAvoid(bounds);

    if (config.boundaryBounce) {
      if (this.x - this.radius - 10 < 0 && this.dx < 0) this.dx = Math.abs(this.dx);
      if (this.x + this.radius + 10 > bounds.width && this.dx > 0) this.dx = -Math.abs(this.dx);
      if (this.y - this.radius - 10 < 0 && this.dy < 0) this.dy = Math.abs(this.dy);
      if (this.y + this.radius + 10 > bounds.height && this.dy > 0) this.dy = -Math.abs(this.dy);
    }
  }

  handleBodyCollisions(enemies, macrophages, obstacles, stones) {
    for (const enemy of enemies ?? []) {
      if (this.isProjectile) {
        const inMouthZone = typeof enemy.isProjectileInMouthZone === "function"
          ? enemy.isProjectileInMouthZone(this)
          : false;

        if (!inMouthZone) {
          this.pushOutFromBody(enemy, enemy.projectileBounceStrength ?? 0.5);
        }
      } else {
        this.pushOutFromBody(enemy, 0.8);
      }
    }

    for (const m of macrophages ?? []) {
      this.pushOutFromBody(m, m.bounceForce ?? 0.8);
    }

    for (const o of obstacles ?? []) {
      this.pushOutFromBody(o, o.bounceForce ?? 1.5);
    }

    for (const s of stones ?? []) {
      if (this.absorbed) break;
      this.pushOutFromStone(s);
    }
  }

  handleAmbientImpulses(now, spatialGrid) {
    if (this.isPlayer) return;

    if (now - this.lastMicroImpulse > this.microImpulseIntervalLocal) {
      this.lastMicroImpulse = now;

      const baseAng = config.microImpulseUsesLeastDenseDir
        ? this.pickLeastDenseDirection(spatialGrid)
        : Math.random() * Math.PI * 2;

      const jitter = (Math.random() - 0.5) * this.kickJitterLocal * 0.6;
      const a = baseAng + jitter;

      this.dx += Math.cos(a) * this.microImpulseStrengthLocal;
      this.dy += Math.sin(a) * this.microImpulseStrengthLocal;
    }
  }

  handleThreatAvoidance(now, spatialGrid) {
    if (this.isPlayer) return;

    if (now - this.lastThreatCheck <= this.threatIntervalLocal * 1000) return;

    this.lastThreatCheck = now;

    let threat = null;
    let minDist = Infinity;

    const cellX = Math.floor(this.x / config.gridSize);
    const cellY = Math.floor(this.y / config.gridSize);
    const nearby = this.getNearbyCells(cellX, cellY, spatialGrid);

    for (const particle of nearby) {
      if (this === particle || particle.isPlayer || particle.absorbed || particle.radius <= this.radius) continue;

      const dist = Math.hypot(this.x - particle.x, this.y - particle.y);
      if (dist < minDist) {
        minDist = dist;
        threat = particle;
      }
    }

    if (threat && minDist < this.threatDistanceLocal) {
      const angle = Math.atan2(this.y - threat.y, this.x - threat.x);
      this.dx += Math.cos(angle) * this.escapeForceLocal;
      this.dy += Math.sin(angle) * this.escapeForceLocal;
    }
  }

  handleLowSpeedKick(now, spatialGrid) {
    if (this.isPlayer) return;

    const speed = Math.hypot(this.dx, this.dy);

    if (speed < this.minSpeedLocal && (now - this.lastKick) > this.kickCooldownLocal) {
      this.lastKick = now;

      const baseAng = this.pickLeastDenseDirection(spatialGrid);
      const jitter = (Math.random() - 0.5) * this.kickJitterLocal;
      const a = baseAng + jitter;

      const strength = this.kickStrengthLocal * config.senseAvoidStrength;
      this.dx += Math.cos(a) * strength;
      this.dy += Math.sin(a) * strength;
    }
  }

  resolveNearbyParticleCollisions(spatialGrid) {
    const cellX = Math.floor(this.x / config.gridSize);
    const cellY = Math.floor(this.y / config.gridSize);
    const nearby = this.getNearbyCells(cellX, cellY, spatialGrid);

    for (const other of nearby) {
      if (this === other || other.absorbed) continue;
      if (other.isPlayer || this.isPlayer) continue;

      const dx = other.x - this.x;
      const dy = other.y - this.y;
      const dist = Math.hypot(dx, dy);
      const minDist = this.radius + other.radius;

      if (dist >= minDist || dist <= 0.0001) continue;

      if (this.isProjectile && other.isProjectile) {
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;

        const sep = overlap * 0.5 * config.yellowSeparationStrength;
        this.x -= nx * sep;
        this.y -= ny * sep;
        other.x += nx * sep;
        other.y += ny * sep;

        const impulse = config.yellowBounceImpulse;
        this.dx -= nx * impulse;
        this.dy -= ny * impulse;
        other.dx += nx * impulse;
        other.dy += ny * impulse;
        continue;
      }

      if (other.isDividing || this.isDividing) {
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;

        if (this.isDividing) {
          other.x += nx * overlap;
          other.y += ny * overlap;
          other.dx += nx * 0.5;
          other.dy += ny * 0.5;
        } else {
          this.x -= nx * overlap;
          this.y -= ny * overlap;
          this.dx -= nx * 0.5;
          this.dy -= ny * 0.5;
        }
        continue;
      }

      if (this.radius > other.radius) {
        this.absorbing = other;
        break;
      }
      if (other.radius > this.radius) {
        other.absorbing = this;
        break;
      }

      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = minDist - dist;

      this.x -= nx * (overlap / 2);
      this.y -= ny * (overlap / 2);
      other.x += nx * (overlap / 2);
      other.y += ny * (overlap / 2);

      const pushForce = 0.5;
      this.dx -= nx * pushForce;
      this.dy -= ny * pushForce;
      other.dx += nx * pushForce;
      other.dy += ny * pushForce;
    }
  }

  getNearbyCells(cellX, cellY, spatialGrid) {
    const result = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = `${cellX + dx},${cellY + dy}`;
        const cell = spatialGrid[key];
        if (cell) for (const p of cell) result.push(p);
      }
    }
    return result;
  }

  pickLeastDenseDirection(spatialGrid) {
    const R = config.senseRadius;
    const n = config.senseSamples;
    const cx = Math.floor(this.x / config.gridSize);
    const cy = Math.floor(this.y / config.gridSize);
    const span = Math.ceil(R / config.gridSize);

    let bestDir = Math.random() * Math.PI * 2;
    let bestWeight = Infinity;

    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2;
      let weight = 0;

      for (let ddx = -span; ddx <= span; ddx++) {
        for (let ddy = -span; ddy <= span; ddy++) {
          const key = `${cx + ddx},${cy + ddy}`;
          const cell = spatialGrid[key];
          if (!cell) continue;

          for (const other of cell) {
            if (other === this || other.absorbed) continue;
            const dx = other.x - this.x;
            const dy = other.y - this.y;
            const dist = Math.hypot(dx, dy);
            if (dist >= R || dist <= 0) continue;

            const dot = Math.cos(angle) * (dx / dist) + Math.sin(angle) * (dy / dist);
            if (dot > 0) weight += dot * (1 - dist / R);
          }
        }
      }

      if (weight < bestWeight) {
        bestWeight = weight;
        bestDir = angle;
      }
    }

    return bestDir;
  }

  edgeAvoid(bounds) {
    if (!bounds || !(bounds.width > 0) || !(bounds.height > 0)) return;

    const d = this.radius * config.edgeAvoidDistanceFactor;

    const leftDist = this.x - this.radius;
    const rightDist = bounds.width - this.x - this.radius;
    const topDist = this.y - this.radius;
    const bottomDist = bounds.height - this.y - this.radius;

    let pushing = false;

    if (leftDist < d) {
      this.dx += config.edgeAvoidForce * (1 - clamp(leftDist / d, 0, 1));
      pushing = true;
    }
    if (rightDist < d) {
      this.dx -= config.edgeAvoidForce * (1 - clamp(rightDist / d, 0, 1));
      pushing = true;
    }
    if (topDist < d) {
      this.dy += config.edgeAvoidForce * (1 - clamp(topDist / d, 0, 1));
      pushing = true;
    }
    if (bottomDist < d) {
      this.dy -= config.edgeAvoidForce * (1 - clamp(bottomDist / d, 0, 1));
      pushing = true;
    }

    if (pushing) {
      this.dx *= config.edgeAvoidDamping;
      this.dy *= config.edgeAvoidDamping;
    }
  }

  canCapturePlayerNow(player, now = performance.now()) {
    if (!this.canCapturePlayer || this.absorbingPlayer || this.capturedPlayer || this.absorbed || this.isPlayer || this.isProjectile) return false;
    if (now < this.playerCaptureCooldownUntilMs) return false;
    if (!player || typeof player.canBeCaptured !== "function" || !player.canBeCaptured(now)) return false;
    return this.radius >= player.radius + PLAYER_CAPTURE_SIZE_ADVANTAGE;
  }

  startPlayerAbsorption(player, now = performance.now()) {
    if (!this.canCapturePlayerNow(player, now)) return false;
    if (typeof player.beginParticleAbsorption !== "function" || !player.beginParticleAbsorption(this)) return false;

    let dirX = player.x - this.x;
    let dirY = player.y - this.y;
    const dist = Math.hypot(dirX, dirY);
    if (dist > 0.0001) {
      dirX /= dist;
      dirY /= dist;
    } else {
      const hostSpeed = Math.hypot(this.dx, this.dy);
      if (hostSpeed > 0.0001) {
        dirX = this.dx / hostSpeed;
        dirY = this.dy / hostSpeed;
      } else {
        dirX = 1;
        dirY = 0;
      }
    }

    this.absorbingPlayer = player;
    this.absorbingPlayerDirX = dirX;
    this.absorbingPlayerDirY = dirY;
    player.dx = 0;
    player.dy = 0;
    return true;
  }

  absorbPlayerStep(now = performance.now()) {
    const player = this.absorbingPlayer;
    if (!player) return;
    if (player.absorbed || player.removed) {
      this.absorbingPlayer = null;
      this.absorbingPlayerDirX = 1;
      this.absorbingPlayerDirY = 0;
      return;
    }

    let dirX = this.absorbingPlayerDirX;
    let dirY = this.absorbingPlayerDirY;
    const dirLength = Math.hypot(dirX, dirY);
    if (dirLength > 0.0001) {
      dirX /= dirLength;
      dirY /= dirLength;
    } else {
      let dx = player.x - this.x;
      let dy = player.y - this.y;
      let dist = Math.hypot(dx, dy);
      if (dist <= 0.0001) {
        dx = 1;
        dy = 0;
        dist = 1;
      }
      dirX = dx / dist;
      dirY = dy / dist;
    }

    this.absorbingPlayerDirX = dirX;
    this.absorbingPlayerDirY = dirY;
    player.dx *= 0.55;
    player.dy *= 0.55;

    const playerMinRadius = typeof player.getMinRadius === "function" ? player.getMinRadius() : 1;
    const shrinkTargetRadius = Math.max(playerMinRadius, PLAYER_CAPTURE_SHRINK_TARGET_RADIUS);
    const availableToShrink = Math.max(0, player.radius - shrinkTargetRadius);
    const taken = Math.min(PLAYER_CAPTURE_ABSORB_RATE, availableToShrink);
    this.radius += taken * config.particleAbsorptionGain;
    player.radius = Math.max(shrinkTargetRadius, player.radius - taken);
    player.prevRadius = player.radius;
    this.prevRadius = this.radius;

    const contactDist = this.radius + player.radius;
    player.x = this.x + dirX * contactDist;
    player.y = this.y + dirY * contactDist;

    if (player.radius <= shrinkTargetRadius + 0.0001) {
      this.absorbingPlayer = null;
      this.capturePlayer(player, now);
    }
  }

  capturePlayer(player, now = performance.now()) {
    if (!player || this.capturedPlayer) return false;
    if (typeof player.beginParticleCapture !== "function" || !player.beginParticleCapture(this)) return false;

    const offsetMagnitude = Math.min(this.radius * PLAYER_CAPTURE_CARRY_OFFSET_RATIO, Math.max(2, this.radius - 2));
    let dirX = this.absorbingPlayerDirX;
    let dirY = this.absorbingPlayerDirY;
    const dirLength = Math.hypot(dirX, dirY);
    if (dirLength > 0.0001) {
      dirX /= dirLength;
      dirY /= dirLength;
    } else {
      const angle = Math.random() * Math.PI * 2;
      dirX = Math.cos(angle);
      dirY = Math.sin(angle);
    }
    this.capturedPlayer = player;
    this.capturedPlayerOffsetX = dirX * offsetMagnitude;
    this.capturedPlayerOffsetY = dirY * offsetMagnitude;
    this.capturedPlayerReleaseAtMs = now + PLAYER_CAPTURE_DURATION_MS;
    player.x = this.x + this.capturedPlayerOffsetX;
    player.y = this.y + this.capturedPlayerOffsetY;
    player.dx = 0;
    player.dy = 0;
    return true;
  }

  releaseCapturedPlayer() {
    if (!this.capturedPlayer) return;

    const player = this.capturedPlayer;
    const speed = Math.hypot(this.dx, this.dy);
    const randomAngle = Math.random() * Math.PI * 2;
    let dirX = speed > 0.0001 ? this.dx / speed : Math.cos(randomAngle);
    let dirY = speed > 0.0001 ? this.dy / speed : Math.sin(randomAngle);
    if (Math.hypot(dirX, dirY) <= 0.0001) {
      dirX = 1;
      dirY = 0;
    }

    const releaseRadius = PLAYER_CAPTURE_RELEASE_RADIUS;
    const releaseDistance = this.radius + releaseRadius + 2;
    player.releaseFromParticle(
      this.x + dirX * releaseDistance,
      this.y + dirY * releaseDistance,
      dirX * PLAYER_CAPTURE_RELEASE_SPEED,
      dirY * PLAYER_CAPTURE_RELEASE_SPEED,
      releaseRadius
    );

    this.playerCaptureCooldownUntilMs = performance.now() + PLAYER_CAPTURE_COOLDOWN_MS;
    this.absorbingPlayer = null;
    this.absorbingPlayerDirX = 1;
    this.absorbingPlayerDirY = 0;
    this.capturedPlayer = null;
    this.capturedPlayerOffsetX = 0;
    this.capturedPlayerOffsetY = 0;
    this.capturedPlayerReleaseAtMs = 0;
  }

  updateCapturedPlayer(now = performance.now()) {
    if (!this.capturedPlayer) return;

    if (this.capturedPlayer.absorbed || this.capturedPlayer.removed) {
      this.absorbingPlayer = null;
      this.absorbingPlayerDirX = 1;
      this.absorbingPlayerDirY = 0;
      this.capturedPlayer = null;
      this.capturedPlayerOffsetX = 0;
      this.capturedPlayerOffsetY = 0;
      this.capturedPlayerReleaseAtMs = 0;
      return;
    }

    this.capturedPlayer.x = this.x + this.capturedPlayerOffsetX;
    this.capturedPlayer.y = this.y + this.capturedPlayerOffsetY;
    this.capturedPlayer.dx = 0;
    this.capturedPlayer.dy = 0;

    if (now >= this.capturedPlayerReleaseAtMs) {
      this.releaseCapturedPlayer();
    }
  }

  update(particles, spatialGrid, enemies, macrophages, player, vectorField, bounds, obstacles, stones, algaeList) {
    if (this.absorbed || this.isStationary) return;

    const now = performance.now();

    if (this.absorbingPlayer) {
      this.absorbPlayerStep(now);
    }
    if (this.capturedPlayer) {
      this.updateCapturedPlayer(now);
    }

    if (this.updateLifetime(now)) return;
    this.updateGrowth(now);

    if (this.isAntibody && !this.isProjectile) {
      if (now - this.spawnTime > (this.antibodyTTLms ?? Infinity)) {
        this.absorbed = true;
        return;
      }

      const targetKind = this.antibodyTargetKind ?? "Enemy";
      const target = targetKind === "Macrophage"
        ? this.findNearestMacrophage(macrophages, this.antibodyTargetMacrophageSpriteIndex).macrophage
        : this.findNearestEnemy(enemies).enemy;
      if (target) {
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.max(0.0001, Math.hypot(dx, dy));
        const pull = this.antibodyHomingForce ?? 0.05;

        this.dx += (dx / dist) * pull;
        this.dy += (dy / dist) * pull;
      }

      this.dx *= this.antibodyFriction ?? config.oldbodyAntibodyFriction ?? config.particleFriction;
      this.dy *= this.antibodyFriction ?? config.oldbodyAntibodyFriction ?? config.particleFriction;
      this.dx += (Math.random() - 0.5) * (this.antibodyDrift ?? 0.01);
      this.dy += (Math.random() - 0.5) * (this.antibodyDrift ?? 0.01);
      this.edgeAvoid(bounds);

      const maxSpeed = this.antibodyMaxSpeed ?? 1;
      const speed = Math.hypot(this.dx, this.dy);
      if (speed > maxSpeed && speed > 0.0001) {
        this.dx = (this.dx / speed) * maxSpeed;
        this.dy = (this.dy / speed) * maxSpeed;
      }

      this.updatePosition();

      for (const o of obstacles ?? []) {
        this.pushOutFromBody(o, o.bounceForce ?? 1.0);
      }

      for (const s of stones ?? []) {
        this.pushOutFromStone(s);
      }

      this.prevRadius = this.radius;
      return;
    }

    this.updatePosition();
    this.updateAmbientTint(player);
    this.applyMotionForces(vectorField, bounds, algaeList);
    this.handleBodyCollisions(enemies, macrophages, obstacles, stones);

    if (this.absorbing) {
      this.absorbStep(this.absorbing);

      if (this.handleDivision(now, particles, enemies, macrophages)) {
        this.prevRadius = this.radius;
        return;
      }
      if (this.handleMaxRadius()) {
        this.prevRadius = this.radius;
        return;
      }

      this.prevRadius = this.radius;
      return;
    }

    this.handleAmbientImpulses(now, spatialGrid);
    this.handleThreatAvoidance(now, spatialGrid);
    this.handleLowSpeedKick(now, spatialGrid);
    this.resolveNearbyParticleCollisions(spatialGrid);

    if (this.handleDivision(now, particles, enemies, macrophages)) {
      this.prevRadius = this.radius;
      return;
    }
    if (this.handleMaxRadius()) {
      this.prevRadius = this.radius;
      return;
    }

    this.prevRadius = this.radius;
  }
}
