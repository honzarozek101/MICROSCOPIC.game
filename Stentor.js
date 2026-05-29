import { Macrophage } from "./Macrophage.js";
import { Particle } from "./Particle.js";
import { makeTintGreen, makeTintRed, wrapAngle, approachAngle } from "./utils.js";

export const DEFAULTS = {
  count:  1,
  radius: 38,
  color:  "rgba(60, 190, 210, 0.78)",

  minSpawnDistanceFromPlayer: 260,
  minSpawnDistanceFromEnemy:  180,
  minSpawnDistanceFromOthers: 140,

  // collision resolution (Stentor is stationary; these control how hard it pushes others)
  bounceForce: 0.3,
  wallBounce:  0.55,
};

export class Stentor extends Macrophage {
  constructor(
    x,
    y,
    radius           = DEFAULTS.radius,
    color            = DEFAULTS.color,
    bodyCircles      = null,
    mouthSettings    = null,
    bodyRotationSettings = null
  ) {
    super(x, y, radius, color, mouthSettings);

    // override Macrophage bounce defaults with Stentor-specific ones
    this.bounceForce = DEFAULTS.bounceForce;
    this.wallBounce  = DEFAULTS.wallBounce;

    this._bodyCircles = Array.isArray(bodyCircles) && bodyCircles.length > 0
      ? bodyCircles.map(c => ({ dx: c.dx, dy: c.dy, r: c.r }))
      : null;

    this._growingParticle = null;

    const tail = this._getLocalTailCircle();
    this._holdfastX = x + tail.dx;
    this._holdfastY = y + tail.dy;

    this.bodyRotation = this._normalizeBodyRotationSettings(bodyRotationSettings);
    this._bodyIdleDirFlip = 1;
    this._bodyAngleOffset = 0;

    const facing = this._getBodyFacingAngleFromCircles(this._getCircles());
    this._spawnAngle = facing;
    this.angle       = facing;
    this.targetAngle = facing;
  }

  _normalizeBodyRotationSettings(settings) {
    if (!settings || typeof settings !== "object") return null;

    let rotationRange = null;
    if (Array.isArray(settings.rotationRange) && settings.rotationRange.length === 2) {
      const a = Number(settings.rotationRange[0]);
      const b = Number(settings.rotationRange[1]);
      if (Number.isFinite(a) && Number.isFinite(b)) rotationRange = [Math.min(a, b), Math.max(a, b)];
    }

    return {
      enabled:      settings.enabled      ?? null,
      idleSpin:     Number.isFinite(settings.idleSpin)     ? settings.idleSpin     : null,
      rotationDir:  Number.isFinite(settings.rotationDir)  ? settings.rotationDir  : null,
      rotationRange
    };
  }

  _bodyRotationEnabled() { return this.bodyRotation?.enabled    ?? true; }
  _bodyRotationDir()     { return this.bodyRotation?.rotationDir ?? 1; }
  _bodyIdleSpin()        { return this.bodyRotation?.idleSpin    ?? 0; }
  _bodyRotationRange()   { return this.bodyRotation?.rotationRange ?? null; }

  _getLocalCircles() {
    if (this._bodyCircles?.length > 0) {
      return this._bodyCircles.map(c => ({ dx: c.dx, dy: c.dy, r: c.r }));
    }
    return [
      { dx: 0, dy: 0,                   r: this.radius },
      { dx: 0, dy: this.radius * 0.75,  r: this.radius * 0.65 },
      { dx: 0, dy: this.radius * 1.38,  r: this.radius * 0.38 }
    ];
  }

  _getLocalTailCircle() {
    const cs = this._getLocalCircles();
    return cs[cs.length - 1] ?? { dx: 0, dy: this.radius, r: this.radius * 0.4 };
  }

  _getCircles() {
    const local = this._getLocalCircles();
    if (!local.length) return [];

    const tail = local[local.length - 1];
    const a    = this._bodyAngleOffset;
    const ca   = Math.cos(a);
    const sa   = Math.sin(a);

    return local.map(c => {
      const rx = c.dx - tail.dx;
      const ry = c.dy - tail.dy;
      return {
        cx: this._holdfastX + rx * ca - ry * sa,
        cy: this._holdfastY + rx * sa + ry * ca,
        r:  c.r
      };
    });
  }

  _getBodyFacingAngleFromCircles(cs) {
    if (!cs?.length) return -Math.PI / 2;
    if (cs.length >= 2) {
      const oral = cs[0];
      const next = cs[1];
      return Math.atan2(oral.cy - next.cy, oral.cx - next.cx);
    }
    const tail = cs[cs.length - 1];
    return Math.atan2(tail.cy - this._holdfastY, tail.cx - this._holdfastX) - Math.PI;
  }

  _updateBodyRotation() {
    if (!this._bodyRotationEnabled()) return;

    const spin = this._bodyIdleSpin() * this._bodyRotationDir() * this._bodyIdleDirFlip;
    if (!spin) return;

    const range = this._bodyRotationRange();
    if (!range) {
      this._bodyAngleOffset = wrapAngle(this._bodyAngleOffset + spin);
      return;
    }

    const minRad = range[0] * (Math.PI / 180);
    const maxRad = range[1] * (Math.PI / 180);

    this._bodyAngleOffset += spin;

    if (this._bodyAngleOffset > maxRad) {
      this._bodyAngleOffset = maxRad;
      this._bodyIdleDirFlip = -1;
    } else if (this._bodyAngleOffset < minRad) {
      this._bodyAngleOffset = minRad;
      this._bodyIdleDirFlip = 1;
    }
  }

  _tailCircle() {
    const cs = this._getCircles();
    return cs[cs.length - 1];
  }

  _backSurface() {
    const cs   = this._getCircles();
    const tail = cs[cs.length - 1];
    if (!tail) return { x: this.x, y: this.y };

    const dir = this._tailDir();
    return {
      x: tail.cx + dir.dx * tail.r,
      y: tail.cy + dir.dy * tail.r
    };
  }

  _tailDir() {
    const cs   = this._getCircles();
    const tail = cs[cs.length - 1];
    if (!tail) return { dx: 0, dy: 1 };

    if (cs.length >= 2) {
      const prev = cs[cs.length - 2];
      const d    = Math.hypot(tail.cx - prev.cx, tail.cy - prev.cy) || 1;
      return { dx: (tail.cx - prev.cx) / d, dy: (tail.cy - prev.cy) / d };
    }

    return { dx: Math.cos(this.angle + Math.PI), dy: Math.sin(this.angle + Math.PI) };
  }

  _updateExcretion(playerRadius) {
    const growRate = 0.05;
    const targetR  = 12;

    if (this._growingParticle) {
      if (this._growingParticle.absorbed) {
        this._growingParticle = null;
      } else {
        this._growingParticle.radius = Math.min(this._growingParticle.radius + growRate, targetR);
        const exit = this._backSurface();
        const dir  = this._tailDir();
        this._growingParticle.x = exit.x + dir.dx * this._growingParticle.radius;
        this._growingParticle.y = exit.y + dir.dy * this._growingParticle.radius;
        if (this._growingParticle.radius >= targetR) this._growingParticle = null;
      }
      return null;
    }

    if (this.excretionQueue <= 0) return null;
    this.excretionQueue--;

    const exit      = this._backSurface();
    const dir       = this._tailDir();
    const pr        = playerRadius ?? 20;
    const tintGreen = makeTintGreen();
    const tintRed   = makeTintRed();
    const tintGroup = targetR > pr ? "red" : "green";
    const color     = tintGroup === "red" ? tintRed : tintGreen;
    const speed     = 0.5 + Math.random() * 0.5;

    const p = new Particle(
      exit.x + dir.dx, exit.y + dir.dy, 1,
      dir.dx * speed, dir.dy * speed,
      color, false, false
    );
    p.tintGroup = tintGroup;
    p.tintGreen = tintGreen;
    p.tintRed   = tintRed;

    this._growingParticle = p;
    return p;
  }

  _beadPos(t) {
    const cs   = this._getCircles();
    const oral = cs[0] ?? { cx: this.x, cy: this.y, r: this.radius };

    const mouth = {
      x: oral.cx + Math.cos(this.angle) * oral.r * 0.9,
      y: oral.cy + Math.sin(this.angle) * oral.r * 0.9
    };

    const tail = cs[cs.length - 1] ?? oral;
    let bdx, bdy;
    if (cs.length >= 2) {
      const prev = cs[cs.length - 2];
      const d    = Math.hypot(tail.cx - prev.cx, tail.cy - prev.cy) || 1;
      bdx = (tail.cx - prev.cx) / d;
      bdy = (tail.cy - prev.cy) / d;
    } else {
      bdx = Math.cos(this.angle + Math.PI);
      bdy = Math.sin(this.angle + Math.PI);
    }

    const backEdge = {
      x: tail.cx + bdx * tail.r * 0.85,
      y: tail.cy + bdy * tail.r * 0.85
    };

    const pts = [mouth, ...cs.map(c => ({ x: c.cx, y: c.cy })), backEdge];
    const n   = pts.length;
    if (n === 1) return { x: pts[0].x, y: pts[0].y };

    const seg = Math.min(Math.floor(t * (n - 1)), n - 2);
    const lt  = t * (n - 1) - seg;

    const p0 = pts[Math.max(0, seg - 1)];
    const p1 = pts[seg];
    const p2 = pts[seg + 1];
    const p3 = pts[Math.min(n - 1, seg + 2)];

    const t2 = lt * lt;
    const t3 = t2 * lt;

    return {
      x: 0.5 * (2*p1.x + (-p0.x + p2.x)*lt + (2*p0.x - 5*p1.x + 4*p2.x - p3.x)*t2 + (-p0.x + 3*p1.x - 3*p2.x + p3.x)*t3),
      y: 0.5 * (2*p1.y + (-p0.y + p2.y)*lt + (2*p0.y - 5*p1.y + 4*p2.y - p3.y)*t2 + (-p0.y + 3*p1.y - 3*p2.y + p3.y)*t3)
    };
  }

  update(particles, playerRadius) {
    this.dx = 0;
    this.dy = 0;

    this._updateBodyRotation();

    const circles = this._getCircles();
    const oral    = circles[0] ?? { cx: this._spawnX, cy: this._spawnY, r: this.radius };
    this.x      = oral.cx;
    this.y      = oral.cy;
    this.radius = oral.r;

    const bodyFacing = this._getBodyFacingAngleFromCircles(circles);
    this._spawnAngle = bodyFacing;
    if (!Number.isFinite(this.angle)) this.angle = bodyFacing;

    if (!this.absorbing) {
      const { target } = this.findNearestEdible(particles);

      if (target && this._mouthEnabled()) {
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        this.targetAngle = Math.atan2(dy, dx);
        this.angle = approachAngle(this.angle, this.targetAngle, this._mouthTurnRate());
        this._clampAngle();
      } else if (this._mouthEnabled()) {
        this._idleSpin();
      } else {
        this.angle = this._spawnAngle;
      }

      for (const p of particles) {
        if (this.isInMouthZone(p)) { this.absorbing = p; break; }
      }
    } else {
      const done = this.absorbStep(this.absorbing);
      if (done) this._spawnBead();
    }

    this._updateBeads();
    return this._updateExcretion(playerRadius);
  }

  draw(ctx) {
    const circles = this._getCircles();
    const oral    = circles[0] ?? { cx: this.x, cy: this.y, r: this.radius };
    const now     = performance.now();

    for (let i = circles.length - 1; i >= 0; i--) {
      const c    = circles[i];
      const frac = circles.length > 1 ? i / (circles.length - 1) : 0;

      ctx.save();
      ctx.shadowColor = `rgba(30, 160, 190, ${(0.30 - frac * 0.12).toFixed(2)})`;
      ctx.shadowBlur  = 14 - frac * 8;

      const grad = ctx.createRadialGradient(
        c.cx - c.r * 0.3, c.cy - c.r * 0.3, c.r * 0.05,
        c.cx, c.cy, c.r
      );
      grad.addColorStop(0, `rgba(${Math.round(200 + (1-frac)*55)}, ${Math.round(248 - frac*30)}, 255, 0.95)`);
      grad.addColorStop(0.55, `rgba(${Math.round(80 + (1-frac)*40)}, ${Math.round(200 + (1-frac)*15)}, ${Math.round(230 + (1-frac)*10)}, 0.88)`);
      grad.addColorStop(1, this.color);

      ctx.beginPath();
      ctx.arc(c.cx, c.cy, c.r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.closePath();
      ctx.restore();
    }

    const ciliaCount = 22;
    const ciliaBase  = oral.r * 0.20;
    const wavePhase  = now * 0.003;

    ctx.save();
    ctx.lineWidth = 1.3;
    ctx.lineCap   = "round";
    for (let i = 0; i < ciliaCount; i++) {
      const ang  = (i / ciliaCount) * Math.PI * 2;
      const wave = Math.sin(wavePhase + i * 0.65);
      const len  = ciliaBase * (0.7 + 0.55 * Math.abs(wave));
      const curl = 0.10 * wave;

      const bx = oral.cx + Math.cos(ang) * oral.r;
      const by = oral.cy + Math.sin(ang) * oral.r;
      const tx = oral.cx + Math.cos(ang + curl) * (oral.r + len);
      const ty = oral.cy + Math.sin(ang + curl) * (oral.r + len);

      ctx.strokeStyle = `rgba(190, 245, 255, ${(0.30 + 0.40 * Math.abs(wave)).toFixed(2)})`;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }
    ctx.restore();

    const br     = this._beadRadius;
    const sorted = [...this.gitBeads].sort((a, b) => a.t - b.t);

    if (sorted.length >= 2) {
      const tMin = sorted[0].t;
      const tMax = sorted[sorted.length - 1].t;

      ctx.beginPath();
      const fp = this._beadPos(tMin);
      ctx.moveTo(fp.x, fp.y);

      const steps = 30;
      for (let s = 1; s <= steps; s++) {
        const pp = this._beadPos(tMin + (tMax - tMin) * (s / steps));
        ctx.lineTo(pp.x, pp.y);
      }

      ctx.strokeStyle = "rgba(255, 220, 80, 0.38)";
      ctx.lineWidth   = 1.5;
      ctx.stroke();
    }

    for (const bead of sorted) {
      const pos = this._beadPos(bead.t);

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, br * 1.7, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 240, 80, 0.13)";
      ctx.fill();
      ctx.closePath();

      const grad = ctx.createRadialGradient(
        pos.x - br * 0.3, pos.y - br * 0.3, br * 0.08,
        pos.x, pos.y, br
      );
      grad.addColorStop(0, "rgba(255, 255, 230, 0.98)");
      grad.addColorStop(1, "rgba(255, 205, 50, 0.88)");

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, br, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.closePath();
    }

    const mx = oral.cx + Math.cos(this.angle) * oral.r;
    const my = oral.cy + Math.sin(this.angle) * oral.r;

    ctx.beginPath();
    ctx.moveTo(oral.cx, oral.cy);
    ctx.lineTo(mx, my);
    ctx.lineWidth   = 3;
    ctx.strokeStyle = "rgba(200, 245, 255, 0.95)";
    ctx.stroke();
    ctx.closePath();

    ctx.beginPath();
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.arc(mx, my, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.closePath();
  }
}
