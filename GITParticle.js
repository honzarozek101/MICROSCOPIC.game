export const DEFAULTS = {
  speed:           1.6,
  minSpeed:        0.25,
  radius:          3.5,
  friction:        0.975,
  wallRestitution: 0.82,
  color:           "rgba(20, 20, 20, 0.72)",
  borderColor:     "rgba(210, 210, 210, 0.42)",
  glowColor:       "rgba(255, 255, 255, 0.14)",
};

export class GITParticle {
  constructor(x, y, dx, dy) {
    this.x = x;
    this.y = y;

    this.dx = dx ?? (Math.random() * 2 - 1) * DEFAULTS.speed;
    this.dy = dy ?? (Math.random() * 2 - 1) * DEFAULTS.speed;

    this.radius = DEFAULTS.radius;
    this.color  = DEFAULTS.color;
  }

  /**
   * Update position and bounce off the circular GIT wall.
   * @param {number} gitCX     - GIT circle center X (moves with Enemy)
   * @param {number} gitCY     - GIT circle center Y
   * @param {number} gitRadius - radius of the GIT circle
   */
  update(gitCX, gitCY, gitRadius) {
    this.dx *= DEFAULTS.friction;
    this.dy *= DEFAULTS.friction;

    const spd = Math.hypot(this.dx, this.dy);
    if (spd < DEFAULTS.minSpeed && spd > 0.0001) {
      const scale = DEFAULTS.minSpeed / spd;
      this.dx *= scale;
      this.dy *= scale;
    }

    this.x += this.dx;
    this.y += this.dy;

    const dx      = this.x - gitCX;
    const dy      = this.y - gitCY;
    const dist    = Math.hypot(dx, dy);
    const maxDist = gitRadius - this.radius;

    if (dist > maxDist && dist > 0.0001) {
      const nx = dx / dist;
      const ny = dy / dist;

      this.x = gitCX + nx * maxDist;
      this.y = gitCY + ny * maxDist;

      const dot = this.dx * nx + this.dy * ny;
      if (dot > 0) {
        this.dx -= 2 * dot * nx * DEFAULTS.wallRestitution;
        this.dy -= 2 * dot * ny * DEFAULTS.wallRestitution;
      }
    }
  }

  draw(ctx) {
    ctx.save();

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 1.95, 0, Math.PI * 2);
    ctx.fillStyle = DEFAULTS.glowColor;
    ctx.fill();
    ctx.closePath();

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = DEFAULTS.borderColor;
    ctx.stroke();
    ctx.closePath();

    ctx.restore();
  }
}
