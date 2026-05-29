import { DEFAULTS as STONE_DEFAULTS } from "./Stone.js";
import { getSpriteImage, normalizeSpriteIndex } from "./spriteAssets.js";

export const DEFAULTS = {
  ...STONE_DEFAULTS,
  radius: 34,
  angularFriction: 0.985,
  angularImpulseFactor: 0.0009,
  maxAngularSpeed: 0.03,
  circles: [
    { dx: 0, dy: 0, r: 34 },
    { dx: 28, dy: 8, r: 22 },
    { dx: -22, dy: 18, r: 18 }
  ],
  spriteIndex: 1,
  spriteScale: 1.18,
  spriteReferenceRadius: 34,
  spriteRotationOffset: 0,
  spriteBodyU: 0.5,
  spriteBodyV: 0.5,
  spriteFlipX: false,
  spriteDebug: true,
  spriteSubfolder: ""
};

const VARIANT_PHYSICS = {
  1: {},
  2: {},
  3: {},
  4: {},
  5: {}
};

function resolvePhysicsValue(overrideValue, variantValue, fallbackValue) {
  const overrideNum = Number(overrideValue);
  if (Number.isFinite(overrideNum)) return overrideNum;

  const variantNum = Number(variantValue);
  if (Number.isFinite(variantNum)) return variantNum;

  return fallbackValue;
}

export class ComposedStone {
  constructor(x, y, circles = DEFAULTS.circles, color = DEFAULTS.color, opts = {}) {
    this.x = x;
    this.y = y;
    this.color = color;

    this.dx = 0;
    this.dy = 0;
    this.angle = 0;
    this.angularVelocity = 0;

    this.spriteIndex = normalizeSpriteIndex(opts.spriteIndex, DEFAULTS.spriteIndex);
    const variantPhysics = VARIANT_PHYSICS[this.spriteIndex] ?? {};

    this.impulseFactor  = resolvePhysicsValue(opts.impulseFactor, variantPhysics.impulseFactor, DEFAULTS.impulseFactor);
    this.friction       = resolvePhysicsValue(opts.friction, variantPhysics.friction, DEFAULTS.friction);
    this.maxSpeed       = resolvePhysicsValue(opts.maxSpeed, variantPhysics.maxSpeed, DEFAULTS.maxSpeed);
    this.wallBounce     = resolvePhysicsValue(opts.wallBounce, variantPhysics.wallBounce, DEFAULTS.wallBounce);
    this.bounceForce    = resolvePhysicsValue(opts.bounceForce, variantPhysics.bounceForce, DEFAULTS.bounceForce);
    this.density        = resolvePhysicsValue(opts.density, variantPhysics.density, DEFAULTS.density);
    this.highlightColor = DEFAULTS.highlightColor;
    this.angularFriction = resolvePhysicsValue(opts.angularFriction, variantPhysics.angularFriction, DEFAULTS.angularFriction);
    this.angularImpulseFactor = resolvePhysicsValue(opts.angularImpulseFactor, variantPhysics.angularImpulseFactor, DEFAULTS.angularImpulseFactor);
    this.maxAngularSpeed = resolvePhysicsValue(opts.maxAngularSpeed, variantPhysics.maxAngularSpeed, DEFAULTS.maxAngularSpeed);
    this.spriteScale = Number.isFinite(Number(opts.spriteScale)) ? Number(opts.spriteScale) : DEFAULTS.spriteScale;
    this.spriteReferenceRadius = Number.isFinite(Number(opts.spriteReferenceRadius))
      ? Number(opts.spriteReferenceRadius)
      : DEFAULTS.spriteReferenceRadius;
    this.spriteRotationOffset = Number.isFinite(Number(opts.spriteRotationOffset)) ? Number(opts.spriteRotationOffset) : DEFAULTS.spriteRotationOffset;
    this.spriteBodyU = Number.isFinite(Number(opts.spriteBodyU)) ? Number(opts.spriteBodyU) : DEFAULTS.spriteBodyU;
    this.spriteBodyV = Number.isFinite(Number(opts.spriteBodyV)) ? Number(opts.spriteBodyV) : DEFAULTS.spriteBodyV;
    this.spriteFlipX = !!opts.spriteFlipX;
    this.spriteDebug = opts.spriteDebug == null ? DEFAULTS.spriteDebug : !!opts.spriteDebug;
    this.spriteSubfolder = typeof opts.spriteSubfolder === "string" ? opts.spriteSubfolder : DEFAULTS.spriteSubfolder;

    this._circles = this._normalizeCircles(circles);
    this.radius = this._computeBoundingRadius();
    this._mass = this._computeMass();
  }

  _getSpriteSubfolder() {
    if (this.spriteSubfolder?.trim()) return this.spriteSubfolder.trim();
    return `CompoundStone_${String(normalizeSpriteIndex(this.spriteIndex, 1)).padStart(2, "0")}`;
  }

  _getSpriteImage() {
    return getSpriteImage({
      folder: "CompoundStone",
      subfolder: this._getSpriteSubfolder(),
      family: "compoundstone",
      index: normalizeSpriteIndex(this.spriteIndex, 1)
    });
  }

  _normalizeCircles(circles) {
    const source = Array.isArray(circles) && circles.length > 0
      ? circles
      : DEFAULTS.circles;

    return source.map(circle => ({
      dx: Number(circle.dx ?? 0),
      dy: Number(circle.dy ?? 0),
      r: Math.max(1, Number(circle.r ?? DEFAULTS.radius))
    }));
  }

  _computeBoundingRadius() {
    return this._circles.reduce(
      (max, circle) => Math.max(max, Math.hypot(circle.dx, circle.dy) + circle.r),
      0
    );
  }

  _computeMass() {
    return this._circles.reduce(
      (sum, circle) => sum + Math.PI * circle.r * circle.r * this.density,
      0
    );
  }

  get mass() {
    return this._mass;
  }

  _getCircles() {
    const ca = Math.cos(this.angle);
    const sa = Math.sin(this.angle);

    return this._circles.map(circle => {
      const rx = circle.dx * ca - circle.dy * sa;
      const ry = circle.dx * sa + circle.dy * ca;

      return {
        cx: this.x + rx,
        cy: this.y + ry,
        r: circle.r
      };
    });
  }

  _clampAngularSpeed() {
    if (Math.abs(this.angularVelocity) > this.maxAngularSpeed) {
      this.angularVelocity = Math.sign(this.angularVelocity) * this.maxAngularSpeed;
    }
  }

  receiveImpulse(nx, ny, strength, contactX = this.x, contactY = this.y) {
    this.dx -= nx * strength * this.impulseFactor;
    this.dy -= ny * strength * this.impulseFactor;

    this.receiveTorque(nx, ny, strength, contactX, contactY);
  }

  receiveTorque(nx, ny, strength, contactX = this.x, contactY = this.y) {
    const rx = contactX - this.x;
    const ry = contactY - this.y;
    const torque = (ry * nx - rx * ny) * strength;

    this.angularVelocity += torque * this.angularImpulseFactor;
    this._clampAngularSpeed();
  }

  _getExtents() {
    const circles = this._getCircles();
    return circles.reduce((extents, circle) => ({
      minX: Math.min(extents.minX, circle.cx - circle.r),
      maxX: Math.max(extents.maxX, circle.cx + circle.r),
      minY: Math.min(extents.minY, circle.cy - circle.r),
      maxY: Math.max(extents.maxY, circle.cy + circle.r)
    }), {
      minX: Infinity,
      maxX: -Infinity,
      minY: Infinity,
      maxY: -Infinity
    });
  }

  update(bounds) {
    this.dx *= this.friction;
    this.dy *= this.friction;
    this.angularVelocity *= this.angularFriction;
    this._clampAngularSpeed();

    const speed = Math.hypot(this.dx, this.dy);
    if (speed > this.maxSpeed) {
      this.dx = (this.dx / speed) * this.maxSpeed;
      this.dy = (this.dy / speed) * this.maxSpeed;
    }

    this.x += this.dx;
    this.y += this.dy;
    this.angle += this.angularVelocity;

    const extents = this._getExtents();

    if (extents.minX < 0) {
      this.x += -extents.minX;
      this.dx = Math.abs(this.dx) * this.wallBounce;
      this.angularVelocity *= 0.96;
    } else if (extents.maxX > bounds.width) {
      this.x -= extents.maxX - bounds.width;
      this.dx = -Math.abs(this.dx) * this.wallBounce;
      this.angularVelocity *= 0.96;
    }

    if (extents.minY < 0) {
      this.y += -extents.minY;
      this.dy = Math.abs(this.dy) * this.wallBounce;
      this.angularVelocity *= 0.96;
    } else if (extents.maxY > bounds.height) {
      this.y -= extents.maxY - bounds.height;
      this.dy = -Math.abs(this.dy) * this.wallBounce;
      this.angularVelocity *= 0.96;
    }
  }

  draw(ctx) {
    const sprite = this._getSpriteImage();

    if (sprite && sprite.complete && sprite.naturalWidth) {
      const drawW = Math.max(2, Number(this.spriteReferenceRadius ?? DEFAULTS.spriteReferenceRadius)) * this.spriteScale * 2.0;
      const drawH = drawW * (sprite.naturalHeight / Math.max(sprite.naturalWidth, 1));
      const anchorX = drawW * this.spriteBodyU;
      const anchorY = drawH * this.spriteBodyV;

      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle + this.spriteRotationOffset);
      if (this.spriteFlipX) ctx.scale(-1, 1);
      ctx.drawImage(sprite, -anchorX, -anchorY, drawW, drawH);

      if (this.spriteDebug) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(0,255,255,0.9)";
        ctx.lineWidth = 1;
        ctx.strokeRect(-anchorX, -anchorY, drawW, drawH);
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
      }

      ctx.restore();
    }

    const circles = this._getCircles();

    if (this.spriteDebug) {
      for (const [index, circle] of circles.entries()) {
        ctx.beginPath();
        ctx.arc(circle.cx, circle.cy, circle.r, 0, Math.PI * 2);
        ctx.strokeStyle = index === 0 ? "rgba(0,255,255,0.98)" : "rgba(0,255,255,0.75)";
        ctx.lineWidth = index === 0 ? 2.2 : 1.6;
        ctx.stroke();
        ctx.closePath();
      }

      ctx.beginPath();
      ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,255,255,0.95)";
      ctx.fill();
      ctx.closePath();
    }

    if (sprite && sprite.complete && sprite.naturalWidth) {
      return;
    }

    for (let i = circles.length - 1; i >= 0; i--) {
      const circle = circles[i];

      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur  = 10;

      ctx.beginPath();
      const gradient = ctx.createRadialGradient(
        circle.cx - circle.r * 0.28,
        circle.cy - circle.r * 0.28,
        circle.r * 0.1,
        circle.cx,
        circle.cy,
        circle.r
      );
      gradient.addColorStop(0, this.highlightColor);
      gradient.addColorStop(1, this.color);
      ctx.fillStyle = gradient;
      ctx.arc(circle.cx, circle.cy, circle.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.closePath();

      ctx.restore();

      ctx.beginPath();
      ctx.arc(circle.cx, circle.cy, circle.r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth   = 1.5;
      ctx.stroke();
      ctx.closePath();
    }
  }
}
