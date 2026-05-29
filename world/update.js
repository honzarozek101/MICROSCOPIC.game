import { config } from "../config.js";
import { DEFAULTS as PlayerDef } from "../Player.js";
import { buildSpatialGrid } from "../spawn.js";
import { enforceProjectileLimit } from "./projectileLimit.js";
import {
  resolveProjectileAlgaeCollisions,
  resolveProjectileEggCollisions,
  resolveParticleEggCollisions,
  resolveAntibodyEnemyCollisions,
  resolveAntibodyMacrophageCollisions,
  resolveEnemyStoneCollisions,
  resolveEnemyObstacleCollisions,
  resolveMacrophageObstacleCollisions,
  resolveMacrophageStoneCollisions,
  resolveMacrophageMacrophageCollisions,
  resolveEnemyEnemyCollisions,
  resolveEnemyEggCollisions,
  resolveEnemyMacrophageCollisions,
  resolveMacrophageEggCollisions,
  resolvePlayerEnemyCollision,
  resolvePlayerMacrophageCollisions,
  resolvePlayerParticleAbsorption,
  resolvePlayerParticleCapture,
  resolvePlayerProjectileCollisions,
  resolvePlayerStoneCollisions,
  resolvePlayerObstacleCollisions,
  resolveStoneObstacleCollisions,
  resolveStoneStoneCollisions,
  resolvePlayerEggCollisions,
  resolveEggObstacleCollisions,
  resolveEggStoneCollisions,
  resolveEggEggMerge,
  resolvePlayerStentor,
  resolveStentor_Obstacle,
  resolveStentor_Stone,
  resolveStentor_Enemy,
  resolveStentor_Particle,
  resolveStentor_Projectile,
  resolveStentor_Macrophage,
  resolveStentor_Egg,
  resolveStentor_Stentor
} from "../collisions.js";
import { world } from "../worldState.js";
import { applyEntityEdgeAvoidance, clampEntityInsideBounds } from "./shared.js";

const getPlayerRadius = () => world.player?.radius ?? PlayerDef.radius;
const isPlayerUsingOldbody = oldbody =>
  world.player?.emergingFromOldbody === oldbody || world.player?.splitOldbody === oldbody;

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

function constrainQuansistorNoozles(bounds) {
  for (const oldbody of world.oldbodies ?? []) {
    const quansistor = oldbody?.quansistor;
    if (!quansistor || quansistor.absorbed || quansistor.removed) continue;
    if (typeof quansistor.updateNoozles === "function") {
      quansistor.updateNoozles(oldbody, bounds, { integrate: false });
    }
  }
}

function sanitizeEntityKinematics(entity, fallbackRadius = 2) {
  if (!entity) return;

  if (Number.isFinite(entity.x)) entity._lastFiniteX = entity.x;
  if (Number.isFinite(entity.y)) entity._lastFiniteY = entity.y;
  if (Number.isFinite(entity.dx)) entity._lastFiniteDx = entity.dx;
  if (Number.isFinite(entity.dy)) entity._lastFiniteDy = entity.dy;

  if (!Number.isFinite(entity.x)) entity.x = Number.isFinite(entity._lastFiniteX) ? entity._lastFiniteX : 0;
  if (!Number.isFinite(entity.y)) entity.y = Number.isFinite(entity._lastFiniteY) ? entity._lastFiniteY : 0;
  if ("dx" in entity && !Number.isFinite(entity.dx)) entity.dx = 0;
  if ("dy" in entity && !Number.isFinite(entity.dy)) entity.dy = 0;
  if ("radius" in entity && !Number.isFinite(entity.radius)) entity.radius = fallbackRadius;
  if ("displayRadius" in entity && !Number.isFinite(entity.displayRadius)) entity.displayRadius = entity.radius ?? fallbackRadius;
}

function keepWorldEntitiesInsideBounds(bounds) {
  constrainPlayerInsideBounds(bounds);

  const groups = [
    world.particles,
    world.enemies,
    world.eggs,
    world.macrophages,
    world.stentors,
    world.obstacles,
    world.stones,
    world.composedStones,
    world.algae,
    world.oldbodies,
    world.particleZones
  ];

  for (const group of groups) {
    for (const entity of group ?? []) {
      if (!entity || entity.absorbed || entity.removed) continue;
      if (entity === world.player || entity.isPlayer) continue;
      clampEntityInsideBounds(entity, bounds);
    }
  }
}

function constrainPlayerInsideBounds(bounds) {
  if (!world.player || world.player.removed) return;
  if (typeof world.player.constrainInsideBounds === "function") {
    world.player.constrainInsideBounds(bounds);
    return;
  }
  clampEntityInsideBounds(world.player, bounds, { inset: config.playerEdgeInset });
}

function applyWorldEdgeAvoidance(bounds) {
  if (world.player && !world.player.absorbed && !world.player.removed) {
    const playerIsTransfering =
      world.player.splitOldbody ||
      world.player.emergingFromOldbody ||
      world.player.isCaptured?.() ||
      world.player.isBeingParticleAbsorbed?.();
    if (!playerIsTransfering && typeof world.player.edgeAvoid === "function") {
      world.player.edgeAvoid(bounds);
    } else if (!playerIsTransfering) {
      const playerBoundsRadius = typeof world.player.getBoundsRadius === "function"
        ? world.player.getBoundsRadius()
        : world.player.radius;
      applyEntityEdgeAvoidance(world.player, bounds, {
        inset: config.playerEdgeInset,
        distance: Math.max(1, playerBoundsRadius * config.edgeAvoidDistanceFactor),
        force: config.edgeAvoidForce * 1.8,
        damping: config.edgeAvoidDamping
      });
    }
  }

  const mobileGroups = [
    world.particles,
    world.enemies,
    world.stones,
    world.composedStones,
    world.oldbodies
  ];

  for (const group of mobileGroups) {
    for (const entity of group ?? []) {
      if (!entity || entity.absorbed || entity.removed) continue;
      if (entity === world.player || entity.isPlayer || entity.isStationary) continue;
      applyEntityEdgeAvoidance(entity, bounds, {
        distance: Math.max(1, (entity.displayRadius ?? entity.radius ?? 1) * config.edgeAvoidDistanceFactor),
        force: config.edgeAvoidForce,
        damping: config.edgeAvoidDamping
      });
    }
  }

  for (const egg of world.eggs ?? []) {
    if (!egg || egg.absorbed || egg.removed || egg.hatched) continue;
    applyEntityEdgeAvoidance(egg, bounds, {
      distance: Math.max(
        1,
        (egg.displayRadius ?? egg.radius ?? 1) *
          (config.eggEdgeAvoidDistanceFactor ?? config.edgeAvoidDistanceFactor)
      ),
      force: config.eggEdgeAvoidForce ?? config.edgeAvoidForce,
      damping: config.eggEdgeAvoidDamping ?? config.edgeAvoidDamping
    });
  }

  for (const macrophage of world.macrophages ?? []) {
    if (!macrophage || macrophage.absorbed || macrophage.removed) continue;
    if (typeof macrophage._orbitMode === "function" && macrophage._orbitMode() !== "free") continue;
    applyEntityEdgeAvoidance(macrophage, bounds, {
      distance: Math.max(1, (macrophage.radius ?? 1) * config.edgeAvoidDistanceFactor),
      force: config.edgeAvoidForce,
      damping: config.edgeAvoidDamping
    });
  }
}

function updateEntities(entities, bounds) {
  for (const entity of entities ?? []) {
    entity.update(bounds);
  }
}

function getMaxLiveParticleCount() {
  const value = Number(config.maxParticleCount);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : Infinity;
}

function getLiveParticleCount() {
  return (world.particles ?? []).filter(particle =>
    particle &&
    !particle.absorbed &&
    !particle.removed
  ).length;
}

function updateAlgaeEntities(bounds, playerRadius) {
  const producedParticles = [];
  const producedAlgae = [];
  const maxLiveParticles = getMaxLiveParticleCount();
  let particleSlotsAvailable = Number.isFinite(maxLiveParticles)
    ? Math.max(0, maxLiveParticles - getLiveParticleCount())
    : Infinity;

  for (const algae of world.algae ?? []) {
    const result = algae.update(bounds, playerRadius, { particleSlotsAvailable });
    if (!result) continue;

    if (Array.isArray(result.particles) && result.particles.length > 0) {
      const accepted = result.particles
        .filter(Boolean)
        .slice(0, particleSlotsAvailable);
      producedParticles.push(...accepted);
      particleSlotsAvailable -= accepted.length;
    } else if (result.particle) {
      if (particleSlotsAvailable > 0) {
        producedParticles.push(result.particle);
        particleSlotsAvailable -= 1;
      }
    }
    if (result.algae) producedAlgae.push(result.algae);
  }

  if (producedParticles.length > 0) {
    world.particles.push(...producedParticles);
  }
  if (producedAlgae.length > 0) {
    world.algae.push(...producedAlgae);
  }
}

function appendProducedParticles(entities, fallbackRadius = getPlayerRadius(), bounds = null) {
  const producedParticles = [];
  const producedEggs = [];
  const producedMacrophages = [];

  for (const entity of entities ?? []) {
    const result = entity.update(world.particles, fallbackRadius, { enemies: world.enemies, bounds });
    if (!result) continue;
    if (Array.isArray(result.particles) && result.particles.length > 0) {
      producedParticles.push(...result.particles.filter(Boolean));
    }
    if (result.particle) producedParticles.push(result.particle);
    else if (!("egg" in result) && !("particle" in result) && !("macrophage" in result) && !Array.isArray(result?.particles)) {
      producedParticles.push(result);
    }
    if (result.egg) producedEggs.push(result.egg);
    if (result.macrophage) producedMacrophages.push(result.macrophage);
  }

  if (producedParticles.length > 0) world.particles.push(...producedParticles);
  if (producedEggs.length > 0) world.eggs.push(...producedEggs);
  if (producedMacrophages.length > 0) world.macrophages.push(...producedMacrophages);
}

function updateParticleZones(bounds, playerRadius) {
  for (const zone of world.particleZones ?? []) {
    zone.update(world.particles, playerRadius, bounds);
  }
}

function isOldbodyFeedingParticle(particle, now = performance.now()) {
  if (!particle || particle.absorbed || particle.removed) return false;
  if (!particle.isCell || particle.isPlayer || particle.isProjectile || particle.isAntibody) return false;
  if ((particle.tintGroup ?? particle.spriteVariant) !== "green") return false;
  if (now < (particle.oldbodyFeedCooldownUntilMs ?? 0)) return false;

  const maxRadius = Math.max(0.1, Number(config.oldbodyFeedingParticleMaxRadius) || 10);
  return particle.radius < maxRadius;
}

function hasActiveQuansistor(oldbody) {
  return !!(
    oldbody?.quansistor &&
    !oldbody.quansistor.absorbed &&
    !oldbody.quansistor.removed
  );
}

function hasQuansistorSeed(oldbody) {
  return !!(
    oldbody &&
    typeof oldbody.isQuansistorSeed === "function" &&
    (oldbody.cargoParticles ?? []).some(cargo => oldbody.isQuansistorSeed(cargo))
  );
}

function canBecomeOrHasQuansistor(oldbody) {
  return hasActiveQuansistor(oldbody) || hasQuansistorSeed(oldbody);
}

function isQuansistorFeedingParticle(particle) {
  if (!particle || particle.absorbed || particle.removed) return false;
  if (!particle.isCell || particle.isPlayer || particle.isProjectile || particle.isAntibody) return false;
  if (particle.isDividing || particle.absorbingPlayer || particle.capturedPlayer) return false;

  const maxRadius = Math.max(0.1, Number(config.quansistorParticleMaxRadius) || 12);
  return particle.radius <= maxRadius;
}

function detachParticleFromOldbody(particle, oldbody, nx, ny, now = performance.now()) {
  const impulse = Math.max(0, Number(config.oldbodyFeedingDetachImpulse) || 0);
  const cooldownMs = Math.max(0, Number(config.oldbodyFeedingDetachCooldownMs) || 0);

  particle.dx += nx * impulse;
  particle.dy += ny * impulse;
  particle.oldbodyFeedCooldownUntilMs = now + cooldownMs;

  const contactDistance = (oldbody.radius ?? 0) + (particle.radius ?? 0) + Math.max(2, Number(config.oldbodyFeedingRangePadding) || 0);
  particle.x = oldbody.x + nx * contactDistance;
  particle.y = oldbody.y + ny * contactDistance;
}

function resolveParticleOldbodyFeeding(activeSplitOldbodies = new Set()) {
  const oldbodies = (world.oldbodies ?? []).filter(oldbody =>
    oldbody &&
    !oldbody.absorbed &&
    !oldbody.removed &&
    !canBecomeOrHasQuansistor(oldbody) &&
    !activeSplitOldbodies.has(oldbody) &&
    !isPlayerUsingOldbody(oldbody)
  );
  if (!oldbodies.length) return;

  const now = performance.now();
  const feedPadding = Math.max(0, Number(config.oldbodyFeedingRangePadding) || 0);
  const feedRate = Math.max(0, Number(config.oldbodyFeedingRate) || 0);
  const growthGain = Math.max(0, Number(config.oldbodyFeedingGrowthGain) || 0);
  const drag = Math.max(0, Math.min(1, Number(config.oldbodyFeedingDrag) || 1));
  const detachRadius = Math.max(0.1, Number(config.oldbodyFeedingDetachRadius) || 10);

  if (!(feedRate > 0)) return;

  for (const particle of world.particles ?? []) {
    if (!isOldbodyFeedingParticle(particle, now)) continue;

    let target = null;
    let bestDistance = Infinity;
    for (const oldbody of oldbodies) {
      if (!oldbody || oldbody.absorbed || oldbody.removed) continue;
      const distance = Math.hypot(oldbody.x - particle.x, oldbody.y - particle.y);
      const feedRange = (oldbody.radius ?? 0) + (particle.radius ?? 0) + feedPadding;
      if (distance > feedRange || distance >= bestDistance) continue;
      target = oldbody;
      bestDistance = distance;
    }
    if (!target) continue;

    let nx = particle.x - target.x;
    let ny = particle.y - target.y;
    const normalLength = Math.hypot(nx, ny);
    if (normalLength > 0.0001) {
      nx /= normalLength;
      ny /= normalLength;
    } else {
      const angle = Math.random() * Math.PI * 2;
      nx = Math.cos(angle);
      ny = Math.sin(angle);
    }

    const taken = typeof target.consumeNutrients === "function"
      ? target.consumeNutrients(feedRate)
      : 0;
    if (!(taken > 0)) continue;

    const growthRoom = Math.max(0, detachRadius - particle.radius);
    const growth = Math.min(growthRoom, taken * growthGain);
    particle.radius += growth;
    particle.prevRadius = particle.radius;
    particle.dx *= drag;
    particle.dy *= drag;

    const contactDistance = (target.radius ?? 0) + (particle.radius ?? 0) + 0.5;
    particle.x = target.x + nx * contactDistance;
    particle.y = target.y + ny * contactDistance;

    if (particle.radius >= detachRadius - 0.0001 || target.absorbed || target.removed) {
      particle.radius = Math.min(particle.radius, detachRadius);
      detachParticleFromOldbody(particle, target, nx, ny, now);
    }
  }
}

function resolveParticleQuansistorAbsorption(activeSplitOldbodies = new Set()) {
  const oldbodies = (world.oldbodies ?? []).filter(oldbody =>
    oldbody &&
    !oldbody.absorbed &&
    !oldbody.removed &&
    hasActiveQuansistor(oldbody) &&
    !activeSplitOldbodies.has(oldbody) &&
    !isPlayerUsingOldbody(oldbody)
  );
  if (!oldbodies.length) return;

  const rangePadding = Math.max(0, Number(config.quansistorParticleRangePadding) || 0);

  for (const particle of world.particles ?? []) {
    if (!isQuansistorFeedingParticle(particle)) continue;

    let targetOldbody = particle.quansistorAbsorbingOldbody ?? null;
    if (
      !targetOldbody ||
      targetOldbody.absorbed ||
      targetOldbody.removed ||
      !hasActiveQuansistor(targetOldbody) ||
      activeSplitOldbodies.has(targetOldbody) ||
      isPlayerUsingOldbody(targetOldbody)
    ) {
      targetOldbody = null;
      particle.quansistorAbsorbing = null;
      particle.quansistorAbsorbingOldbody = null;
    }

    if (!targetOldbody) {
      let best = null;
      for (const oldbody of oldbodies) {
        const distance = Math.hypot(oldbody.x - particle.x, oldbody.y - particle.y);
        const intakeRange = (oldbody.radius ?? 0) + (particle.radius ?? 0) + rangePadding;
        if (distance > intakeRange) continue;

        const overlap = intakeRange - distance;
        if (!best || overlap > best.overlap) best = { oldbody, overlap };
      }
      targetOldbody = best?.oldbody ?? null;
    }

    if (!targetOldbody?.quansistor) continue;
    targetOldbody.quansistor.absorbParticleStep(particle, targetOldbody);
  }
}

function resolveOldbodyQuansistorResorption(activeSplitOldbodies = new Set()) {
  const sources = (world.oldbodies ?? []).filter(oldbody =>
    oldbody &&
    !oldbody.absorbed &&
    !oldbody.removed &&
    hasActiveQuansistor(oldbody) &&
    !activeSplitOldbodies.has(oldbody) &&
    !isPlayerUsingOldbody(oldbody)
  );
  if (!sources.length) return;

  const targets = (world.oldbodies ?? []).filter(oldbody =>
    oldbody &&
    !oldbody.absorbed &&
    !oldbody.removed &&
    !canBecomeOrHasQuansistor(oldbody) &&
    !activeSplitOldbodies.has(oldbody) &&
    !isPlayerUsingOldbody(oldbody)
  );
  if (!targets.length) return;

  const rangePadding = Math.max(0, Number(config.quansistorOldbodyRangePadding) || 0);

  for (const target of targets) {
    if (!target || target.absorbed || target.removed) continue;

    let source = target.quansistorResorbingOldbody ?? null;
    if (
      !source ||
      source === target ||
      source.absorbed ||
      source.removed ||
      !hasActiveQuansistor(source) ||
      activeSplitOldbodies.has(source) ||
      isPlayerUsingOldbody(source)
    ) {
      source = null;
      target.quansistorResorbing = null;
      target.quansistorResorbingOldbody = null;
    }

    if (!source) {
      let best = null;
      for (const candidate of sources) {
        if (candidate === target) continue;
        const distance = Math.hypot(candidate.x - target.x, candidate.y - target.y);
        const intakeRange = (candidate.radius ?? 0) + (target.radius ?? 0) + rangePadding;
        if (distance > intakeRange) continue;

        const overlap = intakeRange - distance;
        if (!best || overlap > best.overlap) best = { source: candidate, overlap };
      }
      source = best?.source ?? null;
    }

    if (!source?.quansistor) continue;
    source.quansistor.absorbOldbodyStep(target, source);
  }
}

function resolveQuansistorNoozleMining(bounds, activeSplitOldbodies = new Set()) {
  const composedStones = (world.composedStones ?? []).filter(stone =>
    stone &&
    !stone.absorbed &&
    !stone.removed
  );
  if (!composedStones.length) {
    world.composedStones = composedStones;
    return;
  }

  const sources = (world.oldbodies ?? []).filter(oldbody =>
    oldbody &&
    !oldbody.absorbed &&
    !oldbody.removed &&
    hasActiveQuansistor(oldbody) &&
    !activeSplitOldbodies.has(oldbody) &&
    !isPlayerUsingOldbody(oldbody)
  );
  if (!sources.length) return;

  for (const oldbody of sources) {
    const quansistor = oldbody.quansistor;
    if (typeof quansistor?.updateNoozleMining === "function") {
      quansistor.updateNoozleMining(composedStones, oldbody, bounds);
    }
  }

  world.composedStones = composedStones.filter(stone =>
    stone &&
    !stone.absorbed &&
    !stone.removed
  );
}

function absorbEggsIntoOldbodies(activeSplitOldbodies = new Set()) {
  const availableOldbodies = (world.oldbodies ?? []).filter(oldbody =>
    oldbody &&
    !oldbody.absorbed &&
    !oldbody.removed &&
    !activeSplitOldbodies.has(oldbody) &&
    !isPlayerUsingOldbody(oldbody)
  );

  for (const egg of world.eggs ?? []) {
    if (!egg || egg.absorbed || egg.hatching) continue;

    if (egg.absorbingOldbody) {
      egg.absorbingOldbody.absorbEgg(egg);
      continue;
    }

    let best = null;
    for (const oldbody of availableOldbodies) {
      const eggRadius = egg.displayRadius ?? egg.radius;
      const dx = egg.x - oldbody.x;
      const dy = egg.y - oldbody.y;
      const minDist = oldbody.radius + eggRadius;
      const distSq = dx * dx + dy * dy;
      if (distSq >= minDist * minDist || distSq <= 0.00000001) continue;

      const overlap = minDist - Math.sqrt(distSq);
      if (!best || overlap > best.overlap) best = { oldbody, overlap };
    }

    if (best?.oldbody?.absorbEgg(egg)) continue;
  }
}

export function updateWorld(bounds) {
  sanitizeEntityKinematics(world.player, PlayerDef.radius);
  world.particles = world.particles.filter(p => !p.absorbed);
  enforceProjectileLimit();
  if (world.player && !world.player.removed && !world.particles.includes(world.player)) {
    world.player.absorbed = false;
    world.particles.push(world.player);
  }
  constrainPlayerInsideBounds(bounds);
  world.enemies = world.enemies.filter(enemy => !enemy?.removed);

  buildSpatialGrid();

  resolveProjectileAlgaeCollisions();

  const stonelikeObjects = [
    ...world.stones,
    ...(world.composedStones ?? []),
    ...(world.algae ?? []),
    ...(world.oldbodies ?? []),
    ...getQuansistorNoozleBodies()
  ];

  for (const p of world.particles) {
    p.update(
      world.particles,
      world.spatialGrid,
      world.enemies,
      world.macrophages,
      world.player,
      world.vectorField,
      bounds,
      world.obstacles ?? [],
      stonelikeObjects,
      world.algae ?? []
    );
  }
  constrainPlayerInsideBounds(bounds);

  if (
    world.player &&
    (world.player.captureState === "capturedByParticle" || world.player.captureState === "absorbingIntoParticle")
  ) {
    const host = world.player.captureHost;
    const now = performance.now();
    if (
      host &&
      host.capturedPlayer === world.player &&
      Number.isFinite(host.capturedPlayerReleaseAtMs) &&
      now >= host.capturedPlayerReleaseAtMs &&
      typeof world.player.forceReleaseFromParticleHost === "function"
    ) {
      world.player.forceReleaseFromParticleHost(host, world.player.postExcretionRadius);
    }
  }

  for (const enemy of world.enemies) {
    const newEgg = enemy.update(world.particles, bounds);
    if (newEgg) world.eggs.push(newEgg);
  }

  const playerRadius = getPlayerRadius();
  updateParticleZones(bounds, playerRadius);
  appendProducedParticles(world.macrophages, playerRadius, bounds);
  appendProducedParticles(world.stentors, playerRadius, bounds);
  constrainPlayerInsideBounds(bounds);

  updateEntities(world.stones, bounds);
  updateEntities(world.composedStones, bounds);
  updateAlgaeEntities(bounds, playerRadius);
  const activeSplitOldbodies = new Set((world.oldbodies ?? []).filter(oldbody => isPlayerUsingOldbody(oldbody)));
  for (const oldbody of world.oldbodies ?? []) {
    if (isPlayerUsingOldbody(oldbody)) {
      oldbody.dx = 0;
      oldbody.dy = 0;
      continue;
    }
    oldbody.update(bounds);
  }
  absorbEggsIntoOldbodies(activeSplitOldbodies);

  for (const e of world.eggs) {
    const result = e.update(bounds, playerRadius);
    for (const p of result.particles) world.particles.push(p);
    if (result.enemy) world.enemies.push(result.enemy);
    if (result.macrophage) world.macrophages.push(result.macrophage);
  }

  absorbEggsIntoOldbodies(activeSplitOldbodies);

  for (const oldbody of world.oldbodies ?? []) {
    if (isPlayerUsingOldbody(oldbody)) continue;
    const antibody = oldbody.maybeShootAntibody(world.enemies, world.macrophages);
    if (antibody) world.particles.push(antibody);
  }

  resolveParticleQuansistorAbsorption(activeSplitOldbodies);
  resolveOldbodyQuansistorResorption(activeSplitOldbodies);
  resolveQuansistorNoozleMining(bounds, activeSplitOldbodies);
  resolveParticleOldbodyFeeding(activeSplitOldbodies);
  world.oldbodies = world.oldbodies.filter(oldbody => oldbody && !oldbody.absorbed && !oldbody.removed);

  world.eggs = world.eggs.filter(e => !e.hatched && !e.absorbed);
  world.algae = world.algae.filter(algae => !algae?.removed && !algae?.absorbed);

  resolveProjectileAlgaeCollisions();
  resolveProjectileEggCollisions();
  resolveAntibodyEnemyCollisions();
  resolveAntibodyMacrophageCollisions();
  world.enemies = world.enemies.filter(enemy => !enemy?.removed);
  resolveParticleEggCollisions();

  const eggsToRemove = new Set();
  for (const e of world.eggs) {
    if (e.readyToSpawn && !e.merged) {
      world.particles.push(e.toParticle(playerRadius));
      eggsToRemove.add(e);
    }
  }
  if (eggsToRemove.size > 0) {
    world.eggs = world.eggs.filter(e => !eggsToRemove.has(e));
  }

  resolvePlayerEnemyCollision();
  resolvePlayerParticleAbsorption();
  resolvePlayerParticleCapture();
  resolvePlayerProjectileCollisions();
  resolvePlayerMacrophageCollisions();
  resolvePlayerObstacleCollisions();
  resolvePlayerStoneCollisions();
  resolvePlayerEggCollisions();
  constrainPlayerInsideBounds(bounds);

  resolveEnemyEnemyCollisions();
  resolveEnemyStoneCollisions();
  resolveEnemyObstacleCollisions();
  resolveEnemyMacrophageCollisions();
  resolveEnemyEggCollisions();

  resolveMacrophageObstacleCollisions();
  resolveMacrophageStoneCollisions();
  resolveMacrophageMacrophageCollisions();
  resolveMacrophageEggCollisions();

  resolveStoneObstacleCollisions();
  resolveStoneStoneCollisions();

  resolveEggObstacleCollisions();
  resolveEggStoneCollisions();
  resolveEggEggMerge();

  resolvePlayerStentor();
  resolveStentor_Obstacle();
  resolveStentor_Stone();
  resolveStentor_Enemy();
  resolveStentor_Particle();
  resolveStentor_Projectile();
  resolveStentor_Macrophage();
  resolveStentor_Egg();
  resolveStentor_Stentor();
  constrainQuansistorNoozles(bounds);

  sanitizeEntityKinematics(world.player, PlayerDef.radius);
  for (const group of [
    world.particles,
    world.enemies,
    world.eggs,
    world.macrophages,
    world.stentors,
    world.obstacles,
    world.stones,
    world.composedStones,
    world.algae,
    world.oldbodies,
    world.particleZones
  ]) {
    for (const entity of group ?? []) sanitizeEntityKinematics(entity);
  }

  applyWorldEdgeAvoidance(bounds);
  keepWorldEntitiesInsideBounds(bounds);
  enforceProjectileLimit();
}
