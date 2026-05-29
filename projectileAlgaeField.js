import { config } from "./config.js";
import { clamp } from "./utils.js";

export function calculateProjectileAlgaeFieldAt(x, y, algaeList) {
  if (!config.projectileAlgaeFieldEnabled) return { fx: 0, fy: 0 };
  if (!Array.isArray(algaeList) || algaeList.length === 0) return { fx: 0, fy: 0 };

  const range = Math.max(0, Number(config.projectileAlgaeFieldRange) || 0);
  const strength = Math.max(0, Number(config.projectileAlgaeFieldStrength) || 0);
  if (!(range > 0) || !(strength > 0)) return { fx: 0, fy: 0 };

  const rangeSq = range * range;
  const curlRatio = Number.isFinite(Number(config.projectileAlgaeFieldCurl))
    ? Number(config.projectileAlgaeFieldCurl)
    : 0;
  const innerCurlFade = Math.max(1, Number(config.projectileAlgaeFieldInnerCurlFade) || 1);
  const maxForce = Math.max(0, Number(config.projectileAlgaeFieldMaxForce) || Infinity);

  let fx = 0;
  let fy = 0;

  for (const algae of algaeList) {
    if (!algae || algae.absorbed || algae.removed) continue;
    if (!Number.isFinite(algae.x) || !Number.isFinite(algae.y)) continue;

    const toX = algae.x - x;
    const toY = algae.y - y;
    const distSq = toX * toX + toY * toY;
    if (distSq <= 0.000001 || distSq > rangeSq) continue;

    const dist = Math.sqrt(distSq);
    const nx = toX / dist;
    const ny = toY / dist;
    const falloff = 1 - clamp(dist / range, 0, 1);
    const smoothFalloff = falloff * falloff * (3 - 2 * falloff);
    const algaeRadius = Math.max(0, Number(algae.radius) || 0);
    const surfaceDistance = Math.max(0, dist - algaeRadius);
    const curlFade = clamp(surfaceDistance / innerCurlFade, 0, 1);
    const innerPull = 1 + (1 - curlFade) * 1.2;
    const radialForce = strength * smoothFalloff * innerPull;
    const curlForce = radialForce * curlRatio * curlFade;

    fx += nx * radialForce - ny * curlForce;
    fy += ny * radialForce + nx * curlForce;
  }

  const force = Math.hypot(fx, fy);
  if (!(force > 0.000001)) return { fx: 0, fy: 0 };

  if (force > maxForce && maxForce > 0) {
    const scale = maxForce / force;
    fx *= scale;
    fy *= scale;
  }

  return { fx, fy };
}
