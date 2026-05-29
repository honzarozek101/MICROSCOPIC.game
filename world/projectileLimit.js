import { config } from "../config.js";
import { world } from "../worldState.js";

function getMaxProjectileCount() {
  const value = Number(config.maxProjectileCount);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : Infinity;
}

function getProjectileDistanceSq(projectile) {
  const player = world.player;
  if (!player || !Number.isFinite(player.x) || !Number.isFinite(player.y)) {
    return Number.isFinite(projectile?.spawnTime) ? projectile.spawnTime : 0;
  }

  const dx = (Number(projectile?.x) || 0) - player.x;
  const dy = (Number(projectile?.y) || 0) - player.y;
  return dx * dx + dy * dy;
}

export function enforceProjectileLimit() {
  const maxProjectiles = getMaxProjectileCount();
  if (!Number.isFinite(maxProjectiles)) return;

  const projectiles = (world.particles ?? []).filter(particle =>
    particle &&
    !particle.absorbed &&
    particle.isProjectile === true &&
    particle.isAntibody !== true
  );
  const overflow = projectiles.length - maxProjectiles;
  if (overflow <= 0) return;

  const toRemove = new Set(
    projectiles
      .sort((a, b) => getProjectileDistanceSq(b) - getProjectileDistanceSq(a))
      .slice(0, overflow)
  );

  for (const projectile of toRemove) {
    projectile.absorbed = true;
  }
  world.particles = (world.particles ?? []).filter(particle => !toRemove.has(particle));
}
