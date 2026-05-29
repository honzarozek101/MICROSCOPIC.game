import { Particle } from "./Particle.js";
import { Enemy } from "./Enemy.js";
import { Macrophage, DEFAULTS as MacrophageDefaults } from "./Macrophage.js";
import { makeTintGreen, makeTintRed } from "./utils.js";
import { getSpriteImage } from "./spriteAssets.js";

export const DEFAULTS = {
  targetRadius:     10,
  growthRate:       0.18,
  detachSpeed:      0.8,
  spawnRadius:      35,
  bumpGrowRate:     0.12,
  bumpDetachSize:   6,
  bumpDetachSpeed:  0.6,
  mergeDurationMs:  600,
  hatchGrowRate:    0.10,
  hatchRadius:      40,
  hatchDurationMs:  3000,
  hatchEnemyRadius: 18,
  sourceEnemyRadius: 18,

  // stone-like physics (egg behaves like a stone once detached)
  friction:      0.95,
  maxSpeed:      1,
  wallBounce:    0.55,
  bounceForce:   1,
  impulseFactor: 2,
  spriteFolder:  "Egg",
  spriteFamily:  "egg",
  spriteVariant: null,
  spriteIndex:   1,
  spriteAlpha:   0.78,
};

export class Egg {
  constructor(contactX, contactY, angle) {
    this.contactX = contactX;
    this.contactY = contactY;
    this.angle    = angle;

    this.radius        = 0;
    this.displayRadius = 0;
    this.detached      = false;
    this.hatched       = false;
    this.absorbed      = false;
    this.absorbingOldbody = null;
    this.oldbodyCargo = null;

    this.x = contactX;
    this.y = contactY;

    this.dx = 0;
    this.dy = 0;
    this.spriteRotation = Math.random() * Math.PI * 2;
    this.sourceEnemyRadius = DEFAULTS.sourceEnemyRadius;
    this.hatchEnemyRadius = DEFAULTS.hatchEnemyRadius;
    this.targetRadius = DEFAULTS.targetRadius;
    this.growthRate = DEFAULTS.growthRate;
    this.spawnRadius = DEFAULTS.spawnRadius;
    this.bumpGrowRate = DEFAULTS.bumpGrowRate;
    this.bumpDetachSize = DEFAULTS.bumpDetachSize;
    this.bumpDetachSpeed = DEFAULTS.bumpDetachSpeed;
    this.mergeDurationMs = DEFAULTS.mergeDurationMs;
    this.hatchGrowRate = DEFAULTS.hatchGrowRate;
    this.hatchRadius = DEFAULTS.hatchRadius;
    this.hatchDurationMs = DEFAULTS.hatchDurationMs;
    this.spriteFolder = DEFAULTS.spriteFolder;
    this.spriteFamily = DEFAULTS.spriteFamily;
    this.spriteVariant = DEFAULTS.spriteVariant;
    this.spriteIndex = DEFAULTS.spriteIndex;
    this.spriteAlpha = DEFAULTS.spriteAlpha;
    this.sourceKind = null;
    this.sourceMacrophageSpriteIndex = null;

    this.bumps = [];

    // ── per-instance physics (same as stone by default) ───────────────────
    this.wallBounce    = DEFAULTS.wallBounce;
    this.bounceForce   = DEFAULTS.bounceForce;
    this.impulseFactor = DEFAULTS.impulseFactor;
    this.detachSpeed   = DEFAULTS.detachSpeed;

    // ── merge animation ────────────────────────────────────────────────────
    this.merging         = false;
    this.mergeFromRadius = 0;
    this.mergeStartMs    = 0;

    // ── hatching ──────────────────────────────────────────────────────────
    this.hatching      = false;
    this.hatchStartMs  = 0;
    this.merged        = false;
  }

  // ── Growing phase (called by Enemy each frame until detached) ─────────────
  grow() {
    this.radius = Math.min(this.radius + this.growthRate, this.targetRadius);
    this.displayRadius = this.radius;

    // While attached, keep the egg center anchored on the parent's outline
    // so it reads as "being laid" rather than growing out from inside.
    this.x = this.contactX;
    this.y = this.contactY;

    return this.radius >= this.targetRadius;
  }

  updateContact(contactX, contactY, angle) {
    this.contactX = contactX;
    this.contactY = contactY;
    this.angle    = angle;
  }

  // ── Merge: absorb another egg, start visual transition ────────────────────
  mergeWith(other) {
    const combined = Math.sqrt(this.radius ** 2 + other.radius ** 2);

    const wa = this.radius ** 2;
    const wb = other.radius ** 2;
    this.x = (this.x * wa + other.x * wb) / (wa + wb);
    this.y = (this.y * wa + other.y * wb) / (wa + wb);

    this.dx = (this.dx + other.dx) * 0.5;
    this.dy = (this.dy + other.dy) * 0.5;

    this.mergeFromRadius = this.displayRadius;
    this.radius          = combined;
    this.merging         = true;
    this.mergeStartMs    = performance.now();
    this.merged          = true;
    this.sourceEnemyRadius =
      ((this.sourceEnemyRadius ?? this.hatchEnemyRadius ?? DEFAULTS.sourceEnemyRadius) +
       (other.sourceEnemyRadius ?? other.hatchEnemyRadius ?? DEFAULTS.sourceEnemyRadius)) / 2;
    this.hatchEnemyRadius = this.sourceEnemyRadius;
    const thisWeight = wa;
    const otherWeight = wb;
    if (this.sourceKind === "Macrophage" || other.sourceKind === "Macrophage") {
      if (this.sourceKind !== "Macrophage") {
        this.sourceKind = other.sourceKind;
        this.sourceMacrophageSpriteIndex = other.sourceMacrophageSpriteIndex ?? null;
      } else if (other.sourceKind === "Macrophage" && otherWeight > thisWeight) {
        this.sourceMacrophageSpriteIndex = other.sourceMacrophageSpriteIndex ?? this.sourceMacrophageSpriteIndex ?? null;
      }
    }

    for (const b of other.bumps) this.bumps.push(b);

    this.hatching     = true;
    this.hatchStartMs = performance.now();
  }

  // ── Projectile sticks to surface as a bump ────────────────────────────────
  absorbProjectile(projectile) {
    if (this.hatching) return;
    projectile.absorbed = true;

    const dx  = projectile.x - this.x;
    const dy  = projectile.y - this.y;
    const ang = Math.atan2(dy, dx);

    this.bumps.push({ angle: ang, radius: projectile.radius });
  }

  // ── Bump growth & detach ──────────────────────────────────────────────────
  _updateBumps(playerRadius) {
    if (this.hatching) return [];

    const surviving = [];
    const spawned   = [];

    for (const b of this.bumps) {
      b.radius += this.bumpGrowRate;

      if (b.radius >= this.bumpDetachSize) {
        const bx = this.x + Math.cos(b.angle) * (this.displayRadius + b.radius);
        const by = this.y + Math.sin(b.angle) * (this.displayRadius + b.radius);

        const tintGreen = makeTintGreen();
        const tintRed   = makeTintRed();
        const tintGroup = b.radius > (playerRadius ?? 20) ? "red" : "green";
        const color     = tintGroup === "red" ? tintRed : tintGreen;

        const p = new Particle(
          bx, by, b.radius,
          Math.cos(b.angle) * this.bumpDetachSpeed,
          Math.sin(b.angle) * this.bumpDetachSpeed,
          color, false, false
        );
        p.tintGroup = tintGroup;
        p.tintGreen = tintGreen;
        p.tintRed   = tintRed;

        spawned.push(p);
      } else {
        surviving.push(b);
      }
    }

    this.bumps = surviving;
    return spawned;
  }

  get readyToSpawn() {
    return this.radius >= this.spawnRadius && !this.hatching;
  }

  toParticle(playerRadius) {
    const tintGreen = makeTintGreen();
    const tintRed   = makeTintRed();
    const tintGroup = this.radius > playerRadius ? "red" : "green";
    const color     = tintGroup === "red" ? tintRed : tintGreen;

    const angle = Math.random() * Math.PI * 2;
    const speed = 0.4 + Math.random() * 0.6;

    const p = new Particle(
      this.x, this.y, this.radius,
      Math.cos(angle) * speed, Math.sin(angle) * speed,
      color, false, false
    );
    p.tintGroup = tintGroup;
    p.tintGreen = tintGreen;
    p.tintRed   = tintRed;
    return p;
  }

  receiveImpulse(nx, ny, strength) {
    if (this.hatching) return;
    this.dx -= nx * strength * this.impulseFactor;
    this.dy -= ny * strength * this.impulseFactor;
  }

  // ── update(): returns { particles, enemy } ─────────────────────────────────
  update(bounds, playerRadius) {
    const now     = performance.now();
    const spawned = this._updateBumps(playerRadius);
    let   newEnemy = null;
    let   newMacrophage = null;

    // ── merge animation ──────────────────────────────────────────────────
    if (this.merging) {
      const elapsed = now - this.mergeStartMs;
      const t       = Math.min(elapsed / this.mergeDurationMs, 1.0);
      const ease    = 1 - (1 - t) ** 3;
      this.displayRadius = this.mergeFromRadius + (this.radius - this.mergeFromRadius) * ease;

      if (t >= 1.0) {
        this.displayRadius = this.radius;
        this.merging       = false;
      }
    } else {
      this.displayRadius = this.radius;
    }

    // ── hatching ─────────────────────────────────────────────────────────
    if (this.hatching) {
      const targetHatchRadius = Math.max(
        this.hatchEnemyRadius ?? this.sourceEnemyRadius ?? this.hatchRadius,
        1
      );

      this.radius        = Math.min(this.radius + this.hatchGrowRate, targetHatchRadius);
      this.displayRadius = this.radius;

      const elapsed = now - this.hatchStartMs;

      if (this.radius >= targetHatchRadius && elapsed >= this.hatchDurationMs) {
        if (this.sourceKind === "Macrophage") {
          const hatchRadius = this.hatchEnemyRadius ?? this.sourceEnemyRadius ?? MacrophageDefaults.radius;
          newMacrophage = new Macrophage(
            this.x,
            this.y,
            hatchRadius,
            MacrophageDefaults.color,
            null,
            null,
            null,
            null,
            {
              instanceIndex: this.sourceMacrophageSpriteIndex ?? 1,
              spriteIndex: this.sourceMacrophageSpriteIndex ?? 1
            }
          );
        } else {
          newEnemy = new Enemy(
            this.x, this.y,
            this.hatchEnemyRadius ?? this.sourceEnemyRadius ?? DEFAULTS.hatchEnemyRadius
          );
        }
        this.hatched = true;
      }

      this.x += this.dx;
      this.y += this.dy;
      this.dx *= DEFAULTS.friction;
      this.dy *= DEFAULTS.friction;

      return { particles: spawned, enemy: newEnemy, macrophage: newMacrophage };
    }

    // ── normal stone-like physics ─────────────────────────────────────────
    this.dx *= DEFAULTS.friction;
    this.dy *= DEFAULTS.friction;

    const spd = Math.hypot(this.dx, this.dy);
    if (spd > DEFAULTS.maxSpeed) {
      this.dx = (this.dx / spd) * DEFAULTS.maxSpeed;
      this.dy = (this.dy / spd) * DEFAULTS.maxSpeed;
    }

    this.x += this.dx;
    this.y += this.dy;

    if (this.x - this.displayRadius < 0) {
      this.x  = this.displayRadius;
      this.dx = Math.abs(this.dx) * this.wallBounce;
    } else if (this.x + this.displayRadius > bounds.width) {
      this.x  = bounds.width - this.displayRadius;
      this.dx = -Math.abs(this.dx) * this.wallBounce;
    }

    if (this.y - this.displayRadius < 0) {
      this.y  = this.displayRadius;
      this.dy = Math.abs(this.dy) * this.wallBounce;
    } else if (this.y + this.displayRadius > bounds.height) {
      this.y  = bounds.height - this.displayRadius;
      this.dy = -Math.abs(this.dy) * this.wallBounce;
    }

    return { particles: spawned, enemy: null, macrophage: null };
  }

  draw(ctx) {
    const r = this.displayRadius;
    if (r <= 0) return;

    const eggSprite = getSpriteImage({
      folder: this.spriteFolder,
      family: this.spriteFamily,
      variant: this.spriteVariant,
      index: this.spriteIndex
    });

    const spawnFraction = Math.min(r / Math.max(this.spawnRadius, 1), 1.0);

    const hatchFraction = this.hatching
      ? Math.min(
          r / Math.max(this.hatchEnemyRadius ?? this.sourceEnemyRadius ?? this.hatchRadius, 1),
          1.0
        )
      : 0;

    const glowColor = this.hatching
      ? `rgba(255, 100, 60, ${0.4 + hatchFraction * 0.6})`
      : `rgba(255, 220, 80, ${0.3 + spawnFraction * 0.5})`;
    const glowSize = this.hatching
      ? 12 + hatchFraction * 20 + Math.sin(performance.now() * 0.006) * 6
      : 8 + spawnFraction * 14;

    ctx.save();
    ctx.shadowColor = glowColor;
    ctx.shadowBlur  = glowSize;

    if (eggSprite.complete && eggSprite.naturalWidth) {
      const drawSize = r * 2;
      ctx.translate(this.x, this.y);
      ctx.rotate(this.spriteRotation);
      ctx.globalAlpha = Math.max(0, Math.min(Number(this.spriteAlpha ?? 1), 1));
      ctx.drawImage(
        eggSprite,
        -drawSize * 0.5,
        -drawSize * 0.5,
        drawSize,
        drawSize
      );
    } else {
      let cr, cg, cb;
      if (this.hatching) {
        cr = 220;
        cg = Math.round(80  - hatchFraction * 60);
        cb = Math.round(20  - hatchFraction * 10);
      } else {
        cr = Math.round(200 - spawnFraction * 120);
        cg = Math.round(120 + spawnFraction * 100);
        cb = Math.round(20  + spawnFraction * 40);
      }

      const grad = ctx.createRadialGradient(
        this.x - r * 0.25, this.y - r * 0.25, r * 0.05,
        this.x, this.y, r
      );
      grad.addColorStop(0,   "rgba(255, 250, 200, 0.95)");
      grad.addColorStop(0.6, `rgba(${Math.min(cr + 55, 255)}, ${Math.min(cg + 80, 255)}, ${Math.min(cb + 60, 255)}, 0.90)`);
      grad.addColorStop(1,   `rgba(${cr}, ${cg}, ${cb}, 0.88)`);

      ctx.beginPath();
      ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.closePath();
    }
    ctx.restore();

    if (!eggSprite.complete || !eggSprite.naturalWidth) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = this.hatching
        ? `rgba(255, 120, 60, ${0.4 + hatchFraction * 0.5})`
        : `rgba(255, 255, 200, ${0.15 + spawnFraction * 0.3})`;
      ctx.lineWidth = this.hatching ? 2.5 : 1.5;
      ctx.stroke();
      ctx.closePath();
    }

    if (this.hatching && hatchFraction > 0.6) {
      const crackAlpha = (hatchFraction - 0.6) / 0.4;
      ctx.save();
      ctx.strokeStyle = `rgba(80, 20, 0, ${crackAlpha * 0.7})`;
      ctx.lineWidth   = 1.5;
      const crackAngles = [0.3, 1.1, 2.0, 3.5, 4.8];
      for (const ca of crackAngles) {
        const cx1 = this.x + Math.cos(ca) * r * 0.4;
        const cy1 = this.y + Math.sin(ca) * r * 0.4;
        const cx2 = this.x + Math.cos(ca + 0.3) * r * 0.9;
        const cy2 = this.y + Math.sin(ca + 0.3) * r * 0.9;
        ctx.beginPath();
        ctx.moveTo(cx1, cy1);
        ctx.lineTo(cx2, cy2);
        ctx.stroke();
      }
      ctx.restore();
    }

    for (const bump of this.bumps) {
      const bx = this.x + Math.cos(bump.angle) * (r + bump.radius);
      const by = this.y + Math.sin(bump.angle) * (r + bump.radius);
      const t  = Math.min(bump.radius / Math.max(this.bumpDetachSize, 1), 1.0);

      ctx.save();
      ctx.shadowColor = "rgba(255, 255, 100, 0.6)";
      ctx.shadowBlur  = 4 + t * 8;

      const bgrad = ctx.createRadialGradient(
        bx - bump.radius * 0.2, by - bump.radius * 0.2, bump.radius * 0.05,
        bx, by, bump.radius
      );
      bgrad.addColorStop(0, "rgba(255, 255, 220, 0.98)");
      bgrad.addColorStop(1, `rgba(255, ${Math.round(200 + t * 55)}, 60, 0.85)`);

      ctx.beginPath();
      ctx.arc(bx, by, bump.radius, 0, Math.PI * 2);
      ctx.fillStyle = bgrad;
      ctx.fill();
      ctx.closePath();
      ctx.restore();
    }
  }
}
