import { world } from "./worldState.js";
import { Cyst } from "./Cyst.js";
import {
  getPlayerCollisionRule as getProfilePlayerCollisionRule,
  getPlayerCollisionTargetKey
} from "./playerCollisionProfile.js";

const OLDBODY_STONE_TRANSFER_SCALE = 0.12;
const PLAYER_OLDBODY_POSITION_TRANSFER = 0.42;
const PLAYER_OLDBODY_IMPULSE_BOOST = 2.1;
const HATCHING_EGG_PROJECTILE_BOUNCE = 1.4;
const HATCHING_EGG_PROJECTILE_TRANSFER = 0.06;
const PLAYER_PROJECTILE_BOUNCE = 1.25;
const PLAYER_PROJECTILE_TRANSFER = 0.08;

function getStonelikeBodies() {
  return [
    ...(world.stones ?? []),
    ...(world.composedStones ?? []),
    ...(world.algae ?? []),
    ...(world.oldbodies ?? []),
    ...getQuansistorNoozleBodies()
  ];
}

function getQuansistorNoozleBodies() {
  const bodies = [];
  for (const oldbody of world.oldbodies ?? []) {
    const quansistor = oldbody?.quansistor;
    if (!quansistor || quansistor.absorbed || quansistor.removed) continue;
    if (typeof quansistor.getNoozleBodies === "function") {
      bodies.push(...quansistor.getNoozleBodies());
    }
  }
  return bodies;
}

function isPlayerUnavailable() {
  return !world.player ||
    world.player.absorbed ||
    world.player.isCaptured?.() ||
    world.player.isBeingParticleAbsorbed?.();
}

function getPlayerCollisionRule(targetKey) {
  return typeof world.player?.getCollisionRule === "function"
    ? world.player.getCollisionRule(targetKey)
    : getProfilePlayerCollisionRule(world.player?.collisionProfile, targetKey);
}

function isPlayerCollisionEnabled(rule) {
  return rule?.enabled !== false;
}

function getRuleScale(rule, key) {
  const scale = Number(rule?.[key]);
  return Number.isFinite(scale) ? Math.max(0, scale) : 1;
}

function createAntibodyRemnant(entity) {
  if (!entity) return null;

  const baseRadius = Math.max(entity.cfg?.eggTargetRadius ?? 1, entity.radius ?? 1);
  const cyst = new Cyst(entity.x, entity.y, (entity.angle ?? 0) + Math.PI, {
    baseRadius,
    sourceKind: entity.constructor?.name ?? "Entity",
    sourceEnemyRadius: entity.radius,
    hatchEnemyRadius: entity.cfg?.eggHatchEnemyRadius ?? entity.radius,
    parentConfig: entity.cfg ? { ...entity.cfg } : null
  });

  cyst.dx = 0;
  cyst.dy = 0;
  cyst.x = entity.x;
  cyst.y = entity.y;

  entity.dx = 0;
  entity.dy = 0;
  if (Array.isArray(entity.gitParticles)) entity.gitParticles = [];
  if ("slowingDown" in entity) entity.slowingDown = false;
  if ("layingEgg" in entity) entity.layingEgg = false;
  if ("_egg" in entity) entity._egg = null;
  entity.removed = true;

  return cyst;
}

function getBodyCircles(body) {
  const circles =
    typeof body?._getBodyCircles === "function"
      ? body._getBodyCircles()
      : typeof body?._getCircles === "function"
        ? body._getCircles()
        : [{ cx: body.x, cy: body.y, r: body.radius }];

  return (circles ?? []).filter(circle =>
    Number.isFinite(circle?.cx) &&
    Number.isFinite(circle?.cy) &&
    Number.isFinite(circle?.r) &&
    circle.r > 0
  );
}

function getBestBodyCollision(entity, body) {
  let best = null;

  for (const circle of getBodyCircles(body)) {
    const dx = entity.x - circle.cx;
    const dy = entity.y - circle.cy;
    const minDist = entity.radius + circle.r;
    const distSq = dx * dx + dy * dy;
    const minDistSq = minDist * minDist;

    if (distSq >= minDistSq || distSq <= 0.00000001) continue;

    const dist = Math.sqrt(distSq);
    const collision = {
      nx: dx / dist,
      ny: dy / dist,
      overlap: minDist - dist,
      dist,
      circle
    };

    if (
      !best ||
      collision.overlap > best.overlap ||
      (collision.overlap === best.overlap && collision.dist < best.dist)
    ) {
      best = collision;
    }
  }

  return best;
}

function getBestBodyPairCollision(a, b) {
  let best = null;

  for (const ac of getBodyCircles(a)) {
    for (const bc of getBodyCircles(b)) {
      const dx = bc.cx - ac.cx;
      const dy = bc.cy - ac.cy;
      const minDist = ac.r + bc.r;
      const distSq = dx * dx + dy * dy;
      const minDistSq = minDist * minDist;

      if (distSq >= minDistSq || distSq <= 0.00000001) continue;

      const dist = Math.sqrt(distSq);
      const collision = {
        nx: dx / dist,
        ny: dy / dist,
        overlap: minDist - dist,
        dist,
        ac,
        bc
      };

      if (
        !best ||
        collision.overlap > best.overlap ||
        (collision.overlap === best.overlap && collision.dist < best.dist)
      ) {
        best = collision;
      }
    }
  }

  return best;
}

function getBodyMass(body) {
  if (Number.isFinite(body?.mass) && body.mass > 0) return body.mass;
  if (Number.isFinite(body?.radius) && body.radius > 0) return Math.PI * body.radius * body.radius;
  return 1;
}

function getInverseMass(body) {
  const mass = getBodyMass(body);
  return mass > 0.0001 ? 1 / mass : 0;
}

function applyStoneImpulse(body, nx, ny, strength, circle = null) {
  body.receiveImpulse(nx, ny, strength, circle?.cx ?? body.x, circle?.cy ?? body.y);
}

function applyCollisionStoneImpulse(body, nx, ny, strength, hit = null, circle = null) {
  applyStoneImpulse(body, nx, ny, strength, circle);
}

function applyStoneTorque(body, nx, ny, strength, circle = null) {
  if (typeof body.receiveTorque !== "function") return;
  body.receiveTorque(nx, ny, strength, circle?.cx ?? body.x, circle?.cy ?? body.y);
}

function translateBody(body, dx, dy) {
  if (!body || (!dx && !dy)) return;

  body.x += dx;
  body.y += dy;

  for (const cargo of body.cargoParticles ?? []) {
    cargo.x += dx;
    cargo.y += dy;
  }
  if (body.quansistor && typeof body.quansistor.translate === "function") {
    body.quansistor.translate(dx, dy);
  }
}

function isOldbody(body) {
  return Array.isArray(body?.cargoParticles);
}

function areLinkedQuansistorBodies(a, b) {
  return !!(
    (a?.isQuansistorNoozle && (a.hostOldbody === b || a.hostQuansistor === b?.quansistor)) ||
    (b?.isQuansistorNoozle && (b.hostOldbody === a || b.hostQuansistor === a?.quansistor)) ||
    (a?.isQuansistorNoozle && b?.quansistorMiningNoozle === a) ||
    (b?.isQuansistorNoozle && a?.quansistorMiningNoozle === b)
  );
}

function translateCollisionBody(body, dx, dy, hit = null) {
  translateBody(body, dx, dy);
}

function addVelocity(body, dx, dy) {
  if (!body || (!dx && !dy)) return;

  body.dx += dx;
  body.dy += dy;
}

function addCollisionVelocity(body, dx, dy, hit = null) {
  addVelocity(body, dx, dy);
}

function getBestEntityStoneCollision(entity, stone) {
  return getBestBodyCollision(entity, stone);
}

function getBestEntityStonePairCollision(entity, stone) {
  return getBestBodyPairCollision(entity, stone);
}

function absorbProjectileIntoAlgae(algae, projectile) {
  if (!algae || !projectile || projectile.absorbed || !projectile.isProjectile) return false;

  if (typeof algae.tryAbsorbProjectile === "function") {
    return algae.tryAbsorbProjectile(projectile);
  }

  projectile.absorbed = true;
  projectile.dx = 0;
  projectile.dy = 0;

  const maxStored = Math.max(1, Math.round(Number(algae.maxStoredProjectiles) || 1));
  const production = Math.max(1, Math.round(Number(algae.productionPerProjectile) || 1));
  const stored = Math.max(0, Math.round(Number(algae.storedProjectiles) || 0));
  algae.storedProjectiles = Math.min(maxStored, stored + production);
  algae.dx = 0;
  algae.dy = 0;
  if (Number.isFinite(algae.angularVelocity)) algae.angularVelocity = 0;
  return true;
}

function getProjectileAlgaeHit(projectile, algae) {
  const radius = Math.max(0, Number(projectile?.radius) || 0);
  let best = getBestBodyCollision({ x: projectile.x, y: projectile.y, radius }, algae);
  if (best) return best;

  const startX = Number.isFinite(projectile.prevX) ? projectile.prevX : projectile.x - (Number(projectile.dx) || 0);
  const startY = Number.isFinite(projectile.prevY) ? projectile.prevY : projectile.y - (Number(projectile.dy) || 0);
  const endX = projectile.x;
  const endY = projectile.y;
  const segX = endX - startX;
  const segY = endY - startY;
  const segLenSq = segX * segX + segY * segY;

  for (const circle of getBodyCircles(algae)) {
    if (Math.hypot(endX - circle.cx, endY - circle.cy) < radius + circle.r) {
      return { nx: 1, ny: 0, overlap: radius + circle.r, dist: 0, circle };
    }
    if (segLenSq <= 0.0001) continue;

    const t = Math.max(0, Math.min(1, ((circle.cx - startX) * segX + (circle.cy - startY) * segY) / segLenSq));
    const closestX = startX + segX * t;
    const closestY = startY + segY * t;
    const dx = closestX - circle.cx;
    const dy = closestY - circle.cy;
    const dist = Math.hypot(dx, dy);
    const minDist = radius + circle.r;

    if (dist >= minDist) continue;

    const nx = dist > 0.0001 ? dx / dist : -segX / Math.sqrt(segLenSq);
    const ny = dist > 0.0001 ? dy / dist : -segY / Math.sqrt(segLenSq);
    const hit = {
      nx,
      ny,
      overlap: minDist - dist,
      dist,
      circle,
      contactX: closestX,
      contactY: closestY
    };

    if (!best || hit.overlap > best.overlap || (hit.overlap === best.overlap && hit.dist < best.dist)) {
      best = hit;
    }
  }

  return best;
}

export function resolveProjectileEggCollisions() {
  for (const e of world.eggs) {
    for (const p of world.particles) {
      if (!p || p.absorbed || !p.isProjectile || p.isAntibody) continue;

      const dx   = p.x - e.x;
      const dy   = p.y - e.y;
      const dist = Math.hypot(dx, dy);
      const eggRadius = e.displayRadius ?? e.radius;

      if (dist < eggRadius + p.radius && dist > 0.0001) {
        if (e.hatching) {
          const nx = dx / dist;
          const ny = dy / dist;
          const overlap = eggRadius + p.radius - dist;
          const incomingNormalSpeed = p.dx * nx + p.dy * ny;

          p.x += nx * overlap;
          p.y += ny * overlap;

          if (incomingNormalSpeed < 0) {
            p.dx -= 2 * incomingNormalSpeed * nx;
            p.dy -= 2 * incomingNormalSpeed * ny;
          }

          p.dx += nx * HATCHING_EGG_PROJECTILE_BOUNCE;
          p.dy += ny * HATCHING_EGG_PROJECTILE_BOUNCE;

          e.dx += p.dx * HATCHING_EGG_PROJECTILE_TRANSFER;
          e.dy += p.dy * HATCHING_EGG_PROJECTILE_TRANSFER;
          continue;
        }

        e.dx += p.dx * 0.08;
        e.dy += p.dy * 0.08;
        e.absorbProjectile(p);
      }
    }
  }
}

export function resolveProjectileAlgaeCollisions() {
  for (const algae of world.algae ?? []) {
    if (!algae) continue;

    for (const p of world.particles ?? []) {
      if (!p || p.absorbed || !p.isProjectile) continue;

      const hit = getProjectileAlgaeHit(p, algae);
      if (!hit) continue;

      absorbProjectileIntoAlgae(algae, p);
    }
  }
}

export function resolveAntibodyEnemyCollisions() {
  for (const enemy of world.enemies) {
    if (!enemy || enemy.removed) continue;

    for (const p of world.particles) {
      if (!p || p.absorbed || !p.isAntibody) continue;

      const hit = getBestBodyCollision({ x: p.x, y: p.y, radius: p.radius }, enemy);
      if (!hit) continue;

      const nextRadius = Math.max(2, enemy.radius - (p.antibodyShrink ?? 0.5));
      if (typeof enemy.setRadius === "function") {
        enemy.setRadius(nextRadius);
      } else {
        enemy.radius = nextRadius;
      }
      p.absorbed = true;

      const cystThreshold = enemy.cfg?.eggTargetRadius ?? 10;
      if (enemy.radius <= cystThreshold) {
        const remnant = createAntibodyRemnant(enemy);
        if (remnant) world.eggs.push(remnant);
        break;
      }
    }
  }
}

export function resolveAntibodyMacrophageCollisions() {
  for (const macrophage of world.macrophages ?? []) {
    if (!macrophage) continue;

    for (const p of world.particles) {
      if (!p || p.absorbed || !p.isAntibody) continue;
      if ((p.antibodyTargetKind ?? "Enemy") !== "Macrophage") continue;
      if (
        p.antibodyTargetMacrophageSpriteIndex != null &&
        Number(macrophage.spriteIndex) !== Number(p.antibodyTargetMacrophageSpriteIndex)
      ) continue;

      const hit = getBestBodyCollision({ x: p.x, y: p.y, radius: p.radius }, macrophage);
      if (!hit) continue;

      const nextRadius = Math.max(2, macrophage.radius - (p.antibodyShrink ?? 0.5));
      if (typeof macrophage.setRadius === "function") {
        macrophage.setRadius(nextRadius);
      } else {
        macrophage.radius = nextRadius;
      }
      p.absorbed = true;
    }
  }
}

export function resolveParticleEggCollisions() {
  for (const e of world.eggs) {
    for (const p of world.particles) {
      if (!p || p.absorbed || p.isProjectile || p.isPlayer) continue;

      const dx      = p.x - e.x;
      const dy      = p.y - e.y;
      const dist    = Math.hypot(dx, dy);
      const minDist = p.radius + e.radius;

      if (dist >= minDist || dist <= 0.0001) continue;

      const nx      = dx / dist;
      const ny      = dy / dist;
      const overlap = minDist - dist;

      p.x += nx * overlap;
      p.y += ny * overlap;
      // Use the egg's own bounceForce (stone-like by default)
      p.dx += nx * e.bounceForce;
      p.dy += ny * e.bounceForce;

      e.receiveImpulse(nx, ny, e.bounceForce * 0.3);
    }
  }
}

// Enemy ↔ Stone
export function resolveEnemyStoneCollisions() {
  for (const enemy of world.enemies) {
    for (const s of getStonelikeBodies()) {
      const hit = getBestEntityStonePairCollision(enemy, s);
      if (!hit) continue;

      const enemyMass = getBodyMass(enemy);
      const stoneMass = getBodyMass(s);
      const totalMass = enemyMass + stoneMass;
      const enemyShare = stoneMass / totalMass;
      const stoneShare = enemyMass / totalMass;

      enemy.x -= hit.nx * hit.overlap * enemyShare;
      enemy.y -= hit.ny * hit.overlap * enemyShare;
      translateCollisionBody(s, hit.nx * hit.overlap * stoneShare, hit.ny * hit.overlap * stoneShare, hit);

      const relVel = (s.dx - enemy.dx) * hit.nx + (s.dy - enemy.dy) * hit.ny;
      if (relVel < 0) {
        const restitution = ((enemy.wallBounce ?? enemy.bounceForce ?? 0.5) + (s.wallBounce ?? 0.5)) * 0.5;
        const enemyInv = getInverseMass(enemy);
        const stoneInv = getInverseMass(s);
        const impulse = -((1 + restitution) * relVel) / Math.max(0.0001, enemyInv + stoneInv);
        enemy.dx -= impulse * enemyInv * hit.nx;
        enemy.dy -= impulse * enemyInv * hit.ny;
        addCollisionVelocity(s, impulse * stoneInv * hit.nx, impulse * stoneInv * hit.ny, hit);
        applyStoneTorque(s, hit.nx, hit.ny, impulse * stoneInv, hit.bc);
      }
    }
  }
}

// Enemy ↔ Obstacle
export function resolveEnemyObstacleCollisions() {
  for (const enemy of world.enemies) {
    for (const o of world.obstacles) {
      const hit = getBestBodyCollision({ x: o.x, y: o.y, radius: o.radius }, enemy);
      if (!hit) continue;

      enemy.x -= hit.nx * hit.overlap;
      enemy.y -= hit.ny * hit.overlap;

      const dot = enemy.dx * hit.nx + enemy.dy * hit.ny;
      if (dot > 0) {
        enemy.dx -= 2 * dot * hit.nx * o.wallBounce;
        enemy.dy -= 2 * dot * hit.ny * o.wallBounce;
      }
    }
  }
}

// Macrophage ↔ Obstacle
export function resolveMacrophageObstacleCollisions() {
  for (const m of world.macrophages) {
    for (const o of world.obstacles) {
      const hit = getBestBodyCollision(o, m);
      if (!hit) continue;

      m.x -= hit.nx * hit.overlap;
      m.y -= hit.ny * hit.overlap;

      const dot = m.dx * (-hit.nx) + m.dy * (-hit.ny);
      if (dot < 0) {
        m.dx -= 2 * dot * (-hit.nx) * o.wallBounce;
        m.dy -= 2 * dot * (-hit.ny) * o.wallBounce;
      }
    }
  }
}

// Macrophage ↔ Stone
export function resolveMacrophageStoneCollisions() {
  for (const m of world.macrophages) {
    for (const s of getStonelikeBodies()) {
      if (s.type === "Algae") {
        const hit = getBestBodyPairCollision(m, s);
        if (!hit) continue;

        const macrophageMass = getBodyMass(m);
        const stoneMass = getBodyMass(s);
        const totalMass = macrophageMass + stoneMass;
        const macrophageShare = stoneMass / totalMass;
        const stoneShare = macrophageMass / totalMass;

        m.x -= hit.nx * hit.overlap * macrophageShare;
        m.y -= hit.ny * hit.overlap * macrophageShare;
        translateCollisionBody(s, hit.nx * hit.overlap * stoneShare, hit.ny * hit.overlap * stoneShare, hit);

        const relVel = (s.dx - m.dx) * hit.nx + (s.dy - m.dy) * hit.ny;
        if (relVel < 0) {
          const restitution = ((m.wallBounce ?? m.bounceForce ?? 0.5) + (s.wallBounce ?? 0.5)) * 0.5;
          const macrophageInv = getInverseMass(m);
          const stoneInv = getInverseMass(s);
          const impulse = -((1 + restitution) * relVel) / Math.max(0.0001, macrophageInv + stoneInv);

          m.dx -= impulse * macrophageInv * hit.nx;
          m.dy -= impulse * macrophageInv * hit.ny;
          addCollisionVelocity(s, impulse * stoneInv * hit.nx, impulse * stoneInv * hit.ny, hit);
          applyStoneTorque(s, hit.nx, hit.ny, impulse * stoneInv, hit.bc);
        }

        continue;
      }

      const hit = getBestEntityStoneCollision(m, s);
      if (!hit) continue;

      const macroInv = getInverseMass(m);
      const stoneInv = getInverseMass(s);
      const invSum = macroInv + stoneInv || 1;
      const macroMoveShare = macroInv / invSum;
      const stoneMoveShare = stoneInv / invSum;

      m.x += hit.nx * hit.overlap * macroMoveShare;
      m.y += hit.ny * hit.overlap * macroMoveShare;
      translateCollisionBody(s, -hit.nx * hit.overlap * stoneMoveShare, -hit.ny * hit.overlap * stoneMoveShare, hit);

      const relVel = (m.dx - s.dx) * hit.nx + (m.dy - s.dy) * hit.ny;
      if (relVel > 0) {
        const impulse = relVel * (1 + s.wallBounce) / invSum;
        m.dx -= impulse * macroInv * hit.nx;
        m.dy -= impulse * macroInv * hit.ny;
        addCollisionVelocity(s, impulse * stoneInv * hit.nx, impulse * stoneInv * hit.ny, hit);
        applyStoneTorque(s, -hit.nx, -hit.ny, impulse * stoneInv, hit.circle);
      }
    }
  }
}

// Macrophage ↔ Macrophage
export function resolveMacrophageMacrophageCollisions() {
  for (let i = 0; i < world.macrophages.length; i++) {
    for (let j = i + 1; j < world.macrophages.length; j++) {
      const a = world.macrophages[i];
      const b = world.macrophages[j];
      const aAttachedToB = a?._germinationAttachment?.parent === b;
      const bAttachedToA = b?._germinationAttachment?.parent === a;
      if (aAttachedToB || bAttachedToA) continue;

      const hit = getBestBodyPairCollision(a, b);
      if (!hit) continue;

      a.x -= hit.nx * hit.overlap * 0.5;
      a.y -= hit.ny * hit.overlap * 0.5;
      b.x += hit.nx * hit.overlap * 0.5;
      b.y += hit.ny * hit.overlap * 0.5;

      const relVel = (b.dx - a.dx) * hit.nx + (b.dy - a.dy) * hit.ny;
      if (relVel < 0) {
        const restitution = (a.wallBounce + b.wallBounce) * 0.5;
        const impulse     = -(1 + restitution) * relVel * 0.5;
        a.dx -= impulse * hit.nx;
        a.dy -= impulse * hit.ny;
        b.dx += impulse * hit.nx;
        b.dy += impulse * hit.ny;
      }
    }
  }
}

// Macrophage ↔ Egg
export function resolveMacrophageEggCollisions() {
  for (const m of world.macrophages) {
    for (const e of world.eggs) {
      const hit = getBestBodyPairCollision(m, { x: e.x, y: e.y, radius: e.displayRadius ?? e.radius });
      if (!hit) continue;

      m.x -= hit.nx * hit.overlap * 0.5;
      m.y -= hit.ny * hit.overlap * 0.5;
      e.x += hit.nx * hit.overlap * 0.5;
      e.y += hit.ny * hit.overlap * 0.5;

      const relVel = (e.dx - m.dx) * hit.nx + (e.dy - m.dy) * hit.ny;
      if (relVel > 0) {
        const impulse = relVel * 0.5 * (1 + e.wallBounce);
        m.dx -= impulse * hit.nx * 0.3;
        m.dy -= impulse * hit.ny * 0.3;
        e.dx += impulse * hit.nx;
        e.dy += impulse * hit.ny;
      }
    }
  }
}

// Enemy ↔ Enemy
export function resolveEnemyEnemyCollisions() {
  for (let i = 0; i < world.enemies.length; i++) {
    for (let j = i + 1; j < world.enemies.length; j++) {
      const a = world.enemies[i];
      const b = world.enemies[j];

      const dx      = b.x - a.x;
      const dy      = b.y - a.y;
      const dist    = Math.hypot(dx, dy);
      const minDist = a.radius + b.radius;

      if (dist >= minDist || dist <= 0.0001) continue;

      const nx      = dx / dist;
      const ny      = dy / dist;
      const overlap = minDist - dist;

      a.x -= nx * overlap * 0.5;
      a.y -= ny * overlap * 0.5;
      b.x += nx * overlap * 0.5;
      b.y += ny * overlap * 0.5;

      const relVel = (b.dx - a.dx) * nx + (b.dy - a.dy) * ny;
      if (relVel < 0) {
        const impulse = -(1 + 0.5) * relVel * 0.5;
        a.dx -= impulse * nx;
        a.dy -= impulse * ny;
        b.dx += impulse * nx;
        b.dy += impulse * ny;
      }
    }
  }
}

// Enemy ↔ Egg
export function resolveEnemyEggCollisions() {
  for (const enemy of world.enemies) {
    for (const e of world.eggs) {
      if (e.hatching) continue;

      const hit = getBestBodyCollision({ x: e.x, y: e.y, radius: e.displayRadius ?? e.radius }, enemy);
      if (!hit) continue;

      enemy.x -= hit.nx * hit.overlap * 0.5;
      enemy.y -= hit.ny * hit.overlap * 0.5;
      e.x     += hit.nx * hit.overlap * 0.5;
      e.y     += hit.ny * hit.overlap * 0.5;

      const relVel = (e.dx - enemy.dx) * hit.nx + (e.dy - enemy.dy) * hit.ny;
      if (relVel < 0) {
        const impulse = -relVel * 0.5 * (1 + e.wallBounce);
        enemy.dx -= impulse * hit.nx * 0.5;
        enemy.dy -= impulse * hit.ny * 0.5;
        e.dx     += impulse * hit.nx;
        e.dy     += impulse * hit.ny;
      }
    }
  }
}

// Enemy ↔ Macrophage
export function resolveEnemyMacrophageCollisions() {
  for (const enemy of world.enemies) {
    for (const m of world.macrophages) {
      const hit = getBestBodyPairCollision(enemy, m);
      if (!hit) continue;

      enemy.x -= hit.nx * hit.overlap * 0.7;
      enemy.y -= hit.ny * hit.overlap * 0.7;
      m.x     += hit.nx * hit.overlap * 0.3;
      m.y     += hit.ny * hit.overlap * 0.3;

      const relVel = (m.dx - enemy.dx) * hit.nx + (m.dy - enemy.dy) * hit.ny;
      if (relVel < 0) {
        const impulse = -relVel * 0.5 * (1 + m.wallBounce);
        enemy.dx -= impulse * hit.nx;
        enemy.dy -= impulse * hit.ny;
        m.dx     += impulse * hit.nx * 0.3;
        m.dy     += impulse * hit.ny * 0.3;
      }
    }
  }
}

export function resolvePlayerEnemyCollision() {
  if (isPlayerUnavailable()) return;

  const rule = getPlayerCollisionRule("Enemy");
  if (!isPlayerCollisionEnabled(rule)) return;
  const bounceScale = getRuleScale(rule, "bounceScale");

  for (const enemy of world.enemies) {
    const hit = getBestBodyCollision(world.player, enemy);
    if (!hit) continue;
    const bounceForce = (enemy?.bounceForce ?? enemy?.wallBounce ?? 0.5) * bounceScale;

    world.player.x += hit.nx * hit.overlap;
    world.player.y += hit.ny * hit.overlap;
    world.player.dx += hit.nx * bounceForce;
    world.player.dy += hit.ny * bounceForce;
  }
}

export function resolvePlayerMacrophageCollisions() {
  if (isPlayerUnavailable()) return;

  const rule = getPlayerCollisionRule("Macrophage");
  if (!isPlayerCollisionEnabled(rule)) return;
  const bounceScale = getRuleScale(rule, "bounceScale");

  for (const m of world.macrophages) {
    const hit = getBestBodyCollision(world.player, m);
    if (!hit) continue;
    const bounceForce = (m?.bounceForce ?? m?.wallBounce ?? 0.5) * bounceScale;

    world.player.x  += hit.nx * hit.overlap;
    world.player.y  += hit.ny * hit.overlap;
    world.player.dx += hit.nx * bounceForce;
    world.player.dy += hit.ny * bounceForce;
  }
}

export function resolvePlayerObstacleCollisions() {
  if (isPlayerUnavailable()) return;

  const rule = getPlayerCollisionRule("Obstacle");
  if (!isPlayerCollisionEnabled(rule)) return;
  const bounceScale = getRuleScale(rule, "bounceScale");

  for (const o of world.obstacles) {
    const dx = world.player.x - o.x;
    const dy = world.player.y - o.y;
    const dist = Math.hypot(dx, dy);
    const minDist = world.player.radius + o.radius;
    if (dist >= minDist || dist <= 0.0001) continue;

    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = minDist - dist;
    const bounceForce = (o?.bounceForce ?? o?.wallBounce ?? 1) * bounceScale;

    world.player.x += nx * overlap;
    world.player.y += ny * overlap;
    world.player.dx += nx * bounceForce;
    world.player.dy += ny * bounceForce;
  }
}

export function resolvePlayerParticleAbsorption() {
  if (isPlayerUnavailable()) return;
  if (world.player.absorbing) return;

  const rule = getPlayerCollisionRule("Particle");
  if (!isPlayerCollisionEnabled(rule) || rule.absorptionEnabled === false) return;

  for (const particle of world.particles ?? []) {
    if (!particle || particle.absorbed || particle.isPlayer || particle.isProjectile) continue;
    if (world.player.radius <= particle.radius) continue;

    const dx = particle.x - world.player.x;
    const dy = particle.y - world.player.y;
    const dist = Math.hypot(dx, dy);
    const minDist = world.player.radius + particle.radius;
    if (dist >= minDist || dist <= 0.0001) continue;

    world.player.absorbStep(particle);
    if (particle.absorbed || world.player.absorbing) break;
  }
}

export function resolvePlayerParticleCapture() {
  if (isPlayerUnavailable()) return;

  const rule = getPlayerCollisionRule("Particle");
  if (!isPlayerCollisionEnabled(rule) || rule.captureEnabled === false) return;

  const now = performance.now();
  for (const particle of world.particles ?? []) {
    if (!particle || particle.absorbed || particle.isPlayer || particle.isProjectile) continue;
    if (typeof particle.canCapturePlayerNow !== "function" || !particle.canCapturePlayerNow(world.player, now)) continue;

    const dx = world.player.x - particle.x;
    const dy = world.player.y - particle.y;
    const dist = Math.hypot(dx, dy);
    const minDist = world.player.radius + particle.radius;
    if (dist >= minDist) continue;

    if (particle.startPlayerAbsorption(world.player, now)) break;
  }
}

export function resolvePlayerProjectileCollisions() {
  if (isPlayerUnavailable()) return;

  const rule = getPlayerCollisionRule("Projectile");
  if (!isPlayerCollisionEnabled(rule)) return;
  const bounceScale = getRuleScale(rule, "bounceScale");
  const playerTransferScale = getRuleScale(rule, "playerTransferScale");

  for (const projectile of world.particles ?? []) {
    if (!projectile || projectile.absorbed || !projectile.isProjectile || projectile.isAntibody) continue;

    const dx = projectile.x - world.player.x;
    const dy = projectile.y - world.player.y;
    const dist = Math.hypot(dx, dy);
    const minDist = projectile.radius + world.player.radius;
    if (dist >= minDist) continue;

    const nx = dist > 0.0001 ? dx / dist : 1;
    const ny = dist > 0.0001 ? dy / dist : 0;
    const overlap = minDist - dist;

    projectile.x += nx * overlap;
    projectile.y += ny * overlap;

    const incomingNormalSpeed = projectile.dx * nx + projectile.dy * ny;
    if (incomingNormalSpeed < 0) {
      projectile.dx -= 2 * incomingNormalSpeed * nx;
      projectile.dy -= 2 * incomingNormalSpeed * ny;
    }

    const bounceForce = PLAYER_PROJECTILE_BOUNCE * bounceScale;
    projectile.dx += nx * bounceForce;
    projectile.dy += ny * bounceForce;
    world.player.dx -= nx * bounceForce * PLAYER_PROJECTILE_TRANSFER * playerTransferScale;
    world.player.dy -= ny * bounceForce * PLAYER_PROJECTILE_TRANSFER * playerTransferScale;
  }
}

export function resolvePlayerStoneCollisions() {
  if (isPlayerUnavailable()) return;

  for (const s of getStonelikeBodies()) {
    if (world.player.emergingFromOldbody === s) continue;

    const targetKey = getPlayerCollisionTargetKey(s);
    const rule = getPlayerCollisionRule(targetKey);
    if (!isPlayerCollisionEnabled(rule)) continue;
    const bounceScale = getRuleScale(rule, "bounceScale");
    const bodyImpulseScale = getRuleScale(rule, "bodyImpulseScale");

    const hit = getBestEntityStoneCollision(world.player, s);
    if (!hit) continue;

    const playerMass = getBodyMass(world.player);
    const stoneMass = getBodyMass(s);
    const totalMass = playerMass + stoneMass;
    const playerShare = stoneMass / totalMass;
    const stoneShare = playerMass / totalMass;
    const bounceForce = (s?.bounceForce ?? s?.wallBounce ?? 1) * bounceScale;

    const oldbodyCollision = isOldbody(s);
    const oldbodyPositionShare = oldbodyCollision ? PLAYER_OLDBODY_POSITION_TRANSFER : 0;
    const playerPositionShare = 1 - oldbodyPositionShare;
    const stoneImpulseBoost = oldbodyCollision ? PLAYER_OLDBODY_IMPULSE_BOOST : 1;

    world.player.x  += hit.nx * hit.overlap * playerPositionShare;
    world.player.y  += hit.ny * hit.overlap * playerPositionShare;
    translateCollisionBody(s, -hit.nx * hit.overlap * oldbodyPositionShare, -hit.ny * hit.overlap * oldbodyPositionShare, hit);
    world.player.dx += hit.nx * bounceForce * playerShare;
    world.player.dy += hit.ny * bounceForce * playerShare;

    applyCollisionStoneImpulse(s, hit.nx, hit.ny, bounceForce * stoneShare * stoneImpulseBoost * bodyImpulseScale, hit, hit.circle);
  }
}

export function resolveStoneObstacleCollisions() {
  for (const s of getStonelikeBodies()) {
    for (const o of world.obstacles) {
      const hit = getBestEntityStoneCollision(o, s);
      if (!hit) continue;

      translateCollisionBody(s, -hit.nx * hit.overlap, -hit.ny * hit.overlap, hit);

      const dot = s.dx * (-hit.nx) + s.dy * (-hit.ny);
      if (dot < 0) {
        addCollisionVelocity(
          s,
          -2 * dot * (-hit.nx) * s.wallBounce,
          -2 * dot * (-hit.ny) * s.wallBounce,
          hit
        );
        applyStoneTorque(s, -hit.nx, -hit.ny, -2 * dot, hit.circle);
      }
    }
  }
}

export function resolveStoneStoneCollisions() {
  const bodies = getStonelikeBodies();

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i];
      const b = bodies[j];

      if (areLinkedQuansistorBodies(a, b)) continue;

      const aIsOldbody = isOldbody(a);
      const bIsOldbody = isOldbody(b);

      let hit = null;
      if (aIsOldbody && !bIsOldbody) {
        const oldbodyHit = getBestEntityStonePairCollision(b, a);
        hit = oldbodyHit
          ? {
              ...oldbodyHit,
              nx: -oldbodyHit.nx,
              ny: -oldbodyHit.ny,
              ac: oldbodyHit.bc,
              bc: oldbodyHit.ac
            }
          : null;
      } else if (bIsOldbody && !aIsOldbody) {
        hit = getBestEntityStonePairCollision(a, b);
      } else {
        hit = getBestBodyPairCollision(a, b);
      }

      if (!hit) continue;

      if (aIsOldbody !== bIsOldbody) {
        const oldbody = aIsOldbody ? a : b;
        const other = aIsOldbody ? b : a;
        const oldbodyCircle = aIsOldbody ? hit.ac : hit.bc;
        const otherCircle = aIsOldbody ? hit.bc : hit.ac;
        const dir = aIsOldbody ? 1 : -1;
        const resistance = 1;
        const pushShare = Math.min(0.985, 0.9 + (1 - 1 / resistance) * 0.085);
        const transferScale = OLDBODY_STONE_TRANSFER_SCALE * Math.min(2.8, 1 + (resistance - 1) * 0.15);

        translateCollisionBody(
          oldbody,
          -hit.nx * hit.overlap * pushShare * dir,
          -hit.ny * hit.overlap * pushShare * dir,
          hit
        );
        other.x += hit.nx * hit.overlap * (1 - pushShare) * dir;
        other.y += hit.ny * hit.overlap * (1 - pushShare) * dir;

        const relVel = (b.dx - a.dx) * hit.nx + (b.dy - a.dy) * hit.ny;
        if (relVel < 0) {
          const oldbodyBounce = oldbody.bounceForce ?? oldbody.wallBounce ?? 1;
          const otherBounce = other.bounceForce ?? other.wallBounce ?? 1;
          const reflectedImpulse = -(1 + Math.max(oldbodyBounce, otherBounce)) * relVel;
          const oldbodyImpulseScale = Math.max(0.12, 1 / resistance);

          addCollisionVelocity(
            oldbody,
            -hit.nx * reflectedImpulse * oldbodyImpulseScale * dir,
            -hit.ny * reflectedImpulse * oldbodyImpulseScale * dir,
            hit
          );
          other.dx += hit.nx * reflectedImpulse * transferScale * dir;
          other.dy += hit.ny * reflectedImpulse * transferScale * dir;

          applyStoneTorque(oldbody, hit.nx * dir, hit.ny * dir, reflectedImpulse * oldbodyImpulseScale, oldbodyCircle);
          applyStoneTorque(other, -hit.nx * dir, -hit.ny * dir, reflectedImpulse * transferScale, otherCircle);
        }
        continue;
      }

      const invMassA = getInverseMass(a);
      const invMassB = getInverseMass(b);
      const invSum = invMassA + invMassB || 1;
      const moveA = invMassA / invSum;
      const moveB = invMassB / invSum;

      translateCollisionBody(a, -hit.nx * hit.overlap * moveA, -hit.ny * hit.overlap * moveA, hit);
      translateCollisionBody(b, hit.nx * hit.overlap * moveB, hit.ny * hit.overlap * moveB, hit);

      const relVel = (b.dx - a.dx) * hit.nx + (b.dy - a.dy) * hit.ny;
      if (relVel < 0) {
        const restitution = (a.wallBounce + b.wallBounce) * 0.5;
        const impulse     = -(1 + restitution) * relVel / invSum;
        addCollisionVelocity(a, -impulse * invMassA * hit.nx, -impulse * invMassA * hit.ny, hit);
        addCollisionVelocity(b, impulse * invMassB * hit.nx, impulse * invMassB * hit.ny, hit);
        applyStoneTorque(a, hit.nx, hit.ny, impulse * invMassA, hit.ac);
        applyStoneTorque(b, -hit.nx, -hit.ny, impulse * invMassB, hit.bc);
      }
    }
  }
}

export function resolvePlayerEggCollisions() {
  if (isPlayerUnavailable()) return;

  const rule = getPlayerCollisionRule("Egg");
  if (!isPlayerCollisionEnabled(rule)) return;
  const bounceScale = getRuleScale(rule, "bounceScale");
  const bodyImpulseScale = getRuleScale(rule, "bodyImpulseScale");

  for (const e of world.eggs) {
    const dx      = world.player.x - e.x;
    const dy      = world.player.y - e.y;
    const dist    = Math.hypot(dx, dy);
    const minDist = world.player.radius + e.radius;

    if (dist < minDist && dist > 0.0001) {
      const nx      = dx / dist;
      const ny      = dy / dist;
      const overlap = minDist - dist;
      const bounceForce = (e?.bounceForce ?? e?.wallBounce ?? 1) * bounceScale;

      world.player.x  += nx * overlap;
      world.player.y  += ny * overlap;
      world.player.dx += nx * bounceForce;
      world.player.dy += ny * bounceForce;

      e.receiveImpulse(nx, ny, bounceForce * bodyImpulseScale);
    }
  }
}

export function resolveEggObstacleCollisions() {
  for (const e of world.eggs) {
    for (const o of world.obstacles) {
      const dx      = e.x - o.x;
      const dy      = e.y - o.y;
      const dist    = Math.hypot(dx, dy);
      const minDist = e.radius + o.radius;

      if (dist >= minDist || dist <= 0.0001) continue;

      const nx      = dx / dist;
      const ny      = dy / dist;
      const overlap = minDist - dist;

      e.x += nx * overlap;
      e.y += ny * overlap;

      const dot = e.dx * nx + e.dy * ny;
      if (dot < 0) {
        e.dx -= 2 * dot * nx * e.wallBounce;
        e.dy -= 2 * dot * ny * e.wallBounce;
      }
    }
  }
}

export function resolveEggStoneCollisions() {
  for (const e of world.eggs) {
    for (const s of getStonelikeBodies()) {
      const hit = getBestEntityStoneCollision(e, s);
      if (!hit) continue;

      const eggInv = getInverseMass(e);
      const stoneInv = getInverseMass(s);
      const invSum = eggInv + stoneInv || 1;
      const eggMoveShare = eggInv / invSum;
      const stoneMoveShare = stoneInv / invSum;

      e.x += hit.nx * hit.overlap * eggMoveShare;
      e.y += hit.ny * hit.overlap * eggMoveShare;
      translateCollisionBody(s, -hit.nx * hit.overlap * stoneMoveShare, -hit.ny * hit.overlap * stoneMoveShare, hit);

      const relVel = (e.dx - s.dx) * hit.nx + (e.dy - s.dy) * hit.ny;
      if (relVel > 0) {
        const impulse = relVel * (1 + s.wallBounce) / invSum;
        e.dx -= impulse * eggInv * hit.nx;
        e.dy -= impulse * eggInv * hit.ny;
        addCollisionVelocity(s, impulse * stoneInv * hit.nx, impulse * stoneInv * hit.ny, hit);
        applyStoneTorque(s, -hit.nx, -hit.ny, impulse * stoneInv, hit.circle);
      }
    }
  }
}

export function resolveEggEggMerge() {
  const toRemove = new Set();

  for (let i = 0; i < world.eggs.length; i++) {
    for (let j = i + 1; j < world.eggs.length; j++) {
      const a = world.eggs[i];
      const b = world.eggs[j];

      if (toRemove.has(a) || toRemove.has(b)) continue;
      if (a.hatching || b.hatching) continue;

      const dx      = b.x - a.x;
      const dy      = b.y - a.y;
      const dist    = Math.hypot(dx, dy);
      const minDist = a.radius + b.radius;

      if (dist >= minDist || dist <= 0.0001) continue;

      if (a.isCyst || b.isCyst) {
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;
        const aMass = Math.max(1, (a.radius ?? 1) ** 2);
        const bMass = Math.max(1, (b.radius ?? 1) ** 2);
        const totalMass = aMass + bMass;
        const aShare = bMass / totalMass;
        const bShare = aMass / totalMass;

        a.x -= nx * overlap * aShare;
        a.y -= ny * overlap * aShare;
        b.x += nx * overlap * bShare;
        b.y += ny * overlap * bShare;

        const relVel = (b.dx - a.dx) * nx + (b.dy - a.dy) * ny;
        if (relVel < 0) {
          const impulse = -relVel * 0.5;
          a.dx -= nx * impulse * aShare;
          a.dy -= ny * impulse * aShare;
          b.dx += nx * impulse * bShare;
          b.dy += ny * impulse * bShare;
        }
        continue;
      }

      const survivor = a.radius >= b.radius ? a : b;
      const victim   = survivor === a ? b : a;

      survivor.mergeWith(victim);
      toRemove.add(victim);
    }
  }

  if (toRemove.size > 0) world.eggs = world.eggs.filter(e => !toRemove.has(e));
}

// ── Stentor collision helpers ─────────────────────────────────────────────
// Stentor is stationary — only the other entity bounces.
// Uses stentor.wallBounce and stentor.bounceForce instance props.

function _pushOutOfStentor(entity, stentor, bounce) {
  const wallBounce = bounce ?? stentor.wallBounce ?? 0.55;
  const circles    = stentor._getCircles();

  for (const c of circles) {
    const dx   = entity.x - c.cx;
    const dy   = entity.y - c.cy;
    const dist = Math.hypot(dx, dy);
    const minD = entity.radius + c.r;
    if (dist >= minD || dist <= 0.0001) continue;

    const nx      = dx / dist;
    const ny      = dy / dist;
    const overlap = minD - dist;

    entity.x += nx * overlap;
    entity.y += ny * overlap;

    const dot = entity.dx * nx + entity.dy * ny;
    if (dot < 0) {
      entity.dx -= 2 * dot * nx * wallBounce;
      entity.dy -= 2 * dot * ny * wallBounce;
    }
  }
}

export function resolvePlayerStentor() {
  if (isPlayerUnavailable()) return;
  const rule = getPlayerCollisionRule("Stentor");
  if (!isPlayerCollisionEnabled(rule)) return;
  const bounceScale = getRuleScale(rule, "bounceScale");
  for (const s of world.stentors) {
    _pushOutOfStentor(world.player, s, (s.wallBounce ?? 0.55) * bounceScale);
  }
}

export function resolveStentor_Obstacle() {
  // Stentor resets to _spawnX/_spawnY — nothing to do
}

export function resolveStentor_Stone() {
  for (const s of world.stentors) {
    for (const st of getStonelikeBodies()) {
      const hit = getBestBodyPairCollision(
        { _getCircles: () => s._getCircles() },
        st
      );
      if (!hit) continue;

      translateCollisionBody(st, hit.nx * hit.overlap, hit.ny * hit.overlap, hit);
      applyStoneImpulse(st, hit.nx, hit.ny, st.bounceForce * 0.4, hit.bc);
    }
  }
}

export function resolveStentor_Enemy() {
  for (const s of world.stentors) {
    for (const enemy of world.enemies) {
      _pushOutOfStentor(enemy, s, s.wallBounce);
    }
  }
}

export function resolveStentor_Projectile() {
  for (const s of world.stentors) {
    const circles = s._getCircles();
    for (const p of world.particles) {
      if (!p || p.absorbed || !p.isProjectile) continue;
      for (const c of circles) {
        const dx   = p.x - c.cx;
        const dy   = p.y - c.cy;
        const dist = Math.hypot(dx, dy);
        const minD = p.radius + c.r;
        if (dist >= minD || dist <= 0.0001) continue;
        const nx      = dx / dist;
        const ny      = dy / dist;
        p.x += nx * (minD - dist);
        p.y += ny * (minD - dist);
        const dot = p.dx * nx + p.dy * ny;
        if (dot < 0) {
          p.dx -= 2 * dot * nx * s.wallBounce;
          p.dy -= 2 * dot * ny * s.wallBounce;
        }
      }
    }
  }
}

export function resolveStentor_Particle() {
  for (const s of world.stentors) {
    const circles = s._getCircles();
    for (const p of world.particles) {
      if (!p || p.absorbed || p.isPlayer || p.isProjectile) continue;
      for (const c of circles) {
        const dx      = p.x - c.cx;
        const dy      = p.y - c.cy;
        const dist    = Math.hypot(dx, dy);
        const minD    = p.radius + c.r;
        if (dist >= minD || dist <= 0.0001) continue;
        const nx      = dx / dist;
        const ny      = dy / dist;
        const overlap = minD - dist;
        p.x += nx * overlap;
        p.y += ny * overlap;
        const dot = p.dx * nx + p.dy * ny;
        if (dot < 0) {
          p.dx -= 2 * dot * nx * s.wallBounce;
          p.dy -= 2 * dot * ny * s.wallBounce;
        }
      }
    }
  }
}

export function resolveStentor_Macrophage() {
  for (const s of world.stentors) {
    for (const m of world.macrophages) {
      const hit = getBestBodyPairCollision(
        { _getCircles: () => s._getCircles() },
        m
      );
      if (!hit) continue;
      m.x += hit.nx * hit.overlap * 0.5;
      m.y += hit.ny * hit.overlap * 0.5;
    }
  }
}

export function resolveStentor_Egg() {
  for (const s of world.stentors) {
    const circles = s._getCircles();
    for (const e of world.eggs) {
      for (const c of circles) {
        const dx   = e.x - c.cx;
        const dy   = e.y - c.cy;
        const dist = Math.hypot(dx, dy);
        const minD = (e.displayRadius ?? e.radius) + c.r;
        if (dist >= minD || dist <= 0.0001) continue;
        const nx = dx / dist;
        const ny = dy / dist;
        e.x += nx * (minD - dist);
        e.y += ny * (minD - dist);
        e.receiveImpulse(nx, ny, e.bounceForce * 0.3);
      }
    }
  }
}

export function resolveStentor_Stentor() {
  // Both are stationary — nothing to resolve
}
