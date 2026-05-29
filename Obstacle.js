export const DEFAULTS = {
  color:      "rgba(100, 110, 130, 0.80)",
  bounceForce: 1.5,
  wallBounce:  0.55,
  count:       5,
  minRadius:   22,
  maxRadius:   58,
  minSpawnDistanceFromPlayer: 160,
  minSpawnDistanceFromEnemy:  120,
  minSpawnDistanceFromOthers: 80,
};

export class Obstacle {
  constructor(x, y, radius, color = DEFAULTS.color) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.color  = color;

    // per-instance tunable physics
    this.bounceForce = DEFAULTS.bounceForce;
    this.wallBounce  = DEFAULTS.wallBounce;
  }

  draw(ctx) {
    // Obstacle acts as an invisible collision volume in normal gameplay.
    void ctx;
  }
}
