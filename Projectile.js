import { Particle } from "./Particle.js";

export const DEFAULTS = {
  radius: 1,
  speed:  3,
  color:  "rgba(255, 255, 0, 0.9)",
};

export class Projectile extends Particle {
  constructor(
    x,
    y,
    dx,
    dy,
    radius = DEFAULTS.radius,
    color  = DEFAULTS.color
  ) {
    super(x, y, radius, dx, dy, color, false, true);
  }
}
