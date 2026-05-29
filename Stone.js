import { getSpriteImage, normalizeSpriteIndex } from "./spriteAssets.js";

export const DEFAULTS = {
  color:          "rgba(140, 125, 105, 0.88)",
  highlightColor: "rgba(210, 200, 185, 0.80)",
  density:        1,
  impulseFactor:  2,
  friction:       0.95,
  maxSpeed:       1,
  wallBounce:     0.55,
  bounceForce:    1,
  count:          5,
  minRadius:      18,
  maxRadius:      42,
  minSpawnDistanceFromPlayer: 150,
  minSpawnDistanceFromEnemy:  110,
  minSpawnDistanceFromOthers: 70,
};

export class Stone {
  constructor(x, y, radius, color = DEFAULTS.color, innerArtifacts = []) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.color  = color;

    this.dx = 0;
    this.dy = 0;

    // per-instance tunable physics
    this.impulseFactor  = DEFAULTS.impulseFactor;
    this.friction       = DEFAULTS.friction;
    this.maxSpeed       = DEFAULTS.maxSpeed;
    this.wallBounce     = DEFAULTS.wallBounce;
    this.bounceForce    = DEFAULTS.bounceForce;
    this.density        = DEFAULTS.density;
    this.highlightColor = DEFAULTS.highlightColor;

    this.innerArtifacts = this._normalizeInnerArtifacts(innerArtifacts);
  }

  get mass() {
    return Math.PI * this.radius * this.radius * this.density;
  }

  receiveImpulse(nx, ny, strength) {
    this.dx -= nx * strength * this.impulseFactor;
    this.dy -= ny * strength * this.impulseFactor;
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

  drawInnerArtifacts(ctx) {
    if (!this.innerArtifacts?.length) return;

    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.clip();

    for (const artifact of this.innerArtifacts) {
      const ax = this.x + artifact.dx;
      const ay = this.y + artifact.dy;
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

  update(bounds) {
    this.dx *= this.friction;
    this.dy *= this.friction;

    const speed = Math.hypot(this.dx, this.dy);
    if (speed > this.maxSpeed) {
      this.dx = (this.dx / speed) * this.maxSpeed;
      this.dy = (this.dy / speed) * this.maxSpeed;
    }

    this.x += this.dx;
    this.y += this.dy;

    if (this.x - this.radius < 0) {
      this.x  = this.radius;
      this.dx = Math.abs(this.dx) * this.wallBounce;
    } else if (this.x + this.radius > bounds.width) {
      this.x  = bounds.width - this.radius;
      this.dx = -Math.abs(this.dx) * this.wallBounce;
    }

    if (this.y - this.radius < 0) {
      this.y  = this.radius;
      this.dy = Math.abs(this.dy) * this.wallBounce;
    } else if (this.y + this.radius > bounds.height) {
      this.y  = bounds.height - this.radius;
      this.dy = -Math.abs(this.dy) * this.wallBounce;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur  = 10;

    ctx.beginPath();
    const gradient = ctx.createRadialGradient(
      this.x - this.radius * 0.28,
      this.y - this.radius * 0.28,
      this.radius * 0.1,
      this.x,
      this.y,
      this.radius
    );
    gradient.addColorStop(0, this.highlightColor);
    gradient.addColorStop(1, this.color);
    ctx.fillStyle = gradient;
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.closePath();

    this.drawInnerArtifacts(ctx);

    ctx.restore();

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    ctx.closePath();
  }
}
