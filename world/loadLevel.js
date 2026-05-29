import { Particle } from "../Particle.js";
import { ParticleZone } from "../ParticleZone.js";
import { Player, DEFAULTS as PlayerDef } from "../Player.js";
import { Enemy, DEFAULTS as EnemyDef } from "../Enemy.js";
import { Egg, DEFAULTS as EggDef } from "../Egg.js";
import { Cyst } from "../Cyst.js";
import { Macrophage, DEFAULTS as MacroDef } from "../Macrophage.js";
import { Stentor, DEFAULTS as StentorDef } from "../Stentor.js";
import { Obstacle } from "../Obstacle.js";
import { Stone } from "../Stone.js";
import { ComposedStone, DEFAULTS as ComposedStoneDef } from "../ComposedStone.js";
import { Algae, DEFAULTS as AlgaeDef } from "../Algae.js";
import { ComposedEntity, DEFAULTS as ComposedEntityDef } from "../ComposedEntity.js";
import { Oldbody } from "../Oldbody.js";
import { config } from "../config.js";
import { normalizePlayerCollisionProfile } from "../playerCollisionProfile.js";
import { getCachedImage, normalizeSpriteIndex } from "../spriteAssets.js";
import { initVectorField, buildSpatialGrid } from "../spawn.js";
import { world } from "../worldState.js";
import { resetWorldState } from "./reset.js";
import {
  getLevelScale,
  resolveLevelPoint,
  resolveLevelVector,
  buildEnemySettingsFromLevelEntity,
  scaleRelativeCircles,
  clampEntityInsideBounds
} from "./shared.js";

function parseOptionalJsonArray(value) {
  if (value == null) return null;

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function createInvisibleParticle(x, y, radius) {
  return new Particle(
    x,
    y,
    radius,
    null,
    null,
    "rgba(0,0,0,0)",
    false,
    false
  );
}

function applyParticleVisuals(particle, playerRadius) {
  particle.tintGroup = particle.radius > playerRadius ? "red" : "green";
  particle.color = particle.tintGroup === "red" ? particle.tintRed : particle.tintGreen;
  particle.spriteVariant = particle.tintGroup;
  return particle;
}

function mapLevelCircles(circles, bounds, background, levelScale) {
  if (!Array.isArray(circles) || circles.length === 0) return null;

  return circles.map(circle => ({
    ...resolveLevelVector(circle, bounds, background, { canvasRef: bounds.__levelCanvasRef }),
    r: circle.r * levelScale
  }));
}

function loadLevelBackground(levelJson) {
  const bg = levelJson?.background;
  if (!bg?.src) {
    world.background = null;
    return;
  }

  const img = getCachedImage(bg.src);

  world.background = {
    image: img,
    name: bg.name ?? "background.png",
    width: Number(bg.width ?? 0) || null,
    height: Number(bg.height ?? 0) || null,
    offsetXNorm: Number.isFinite(Number(bg.offsetXNorm)) ? Number(bg.offsetXNorm) : 0,
    offsetYNorm: Number.isFinite(Number(bg.offsetYNorm)) ? Number(bg.offsetYNorm) : 0,
    scaleMul: Number.isFinite(Number(bg.scaleMul)) ? Number(bg.scaleMul) : 1
  };
}

export function initWorldFromLevel(levelJson, bounds) {
  resetWorldState();
  initVectorField(bounds);
  loadLevelBackground(levelJson);
  const levelScale = getLevelScale(levelJson, bounds, world.background);
  const resolveBounds = { ...bounds, __levelCanvasRef: levelJson?.canvasRef ?? null };
  const positionDebug = [];

  let playerPlaced = false;

  for (const e of levelJson.entities ?? []) {
    const { x: px, y: py } = resolveLevelPoint(e, resolveBounds, world.background, levelJson);
    const r = (e.radius ?? 20) * levelScale;
    if (positionDebug.length < 10) {
      positionDebug.push({
        type: e?.type ?? "Unknown",
        src: {
          x: Number.isFinite(Number(e?.x)) ? Number(e.x) : null,
          y: Number.isFinite(Number(e?.y)) ? Number(e.y) : null,
          xNorm: Number.isFinite(Number(e?.xNorm)) ? Number(e.xNorm) : null,
          yNorm: Number.isFinite(Number(e?.yNorm)) ? Number(e.yNorm) : null,
          xBgNorm: Number.isFinite(Number(e?.xBgNorm)) ? Number(e.xBgNorm) : null,
          yBgNorm: Number.isFinite(Number(e?.yBgNorm)) ? Number(e.yBgNorm) : null,
          radius: Number.isFinite(Number(e?.radius)) ? Number(e.radius) : null
        },
        resolved: {
          x: Number.isFinite(px) ? Number(px.toFixed(2)) : px,
          y: Number.isFinite(py) ? Number(py.toFixed(2)) : py,
          radius: Number.isFinite(r) ? Number(r.toFixed(2)) : r
        }
      });
    }

    switch (e.type) {
      case "Player": {
        const p = new Player(px, py, r);
        if (Number.isFinite(Number(e.clickForce))) p.clickForce = Number(e.clickForce);
        if (Number.isFinite(Number(e.absorptionFactor))) p.absorptionFactor = Number(e.absorptionFactor);
        if (Number.isFinite(Number(e.splitRadius))) p.splitRadius = Number(e.splitRadius) * levelScale;
        if (Number.isFinite(Number(e.splitChildRadius))) p.splitChildRadius = Number(e.splitChildRadius) * levelScale;
        if (Number.isFinite(Number(e.splitMinParentRadius))) p.splitMinParentRadius = Number(e.splitMinParentRadius) * levelScale;
        if (Number.isFinite(Number(e.splitLaunchSpeed))) p.splitLaunchSpeed = Number(e.splitLaunchSpeed);
        if (Number.isFinite(Number(e.splitParentKick))) p.splitParentKick = Number(e.splitParentKick);
        p.setCollisionProfile(normalizePlayerCollisionProfile(e.collisionProfile));
        world.player = p;
        world.particles.push(p);
        playerPlaced = true;
        break;
      }

      case "Enemy": {
        const enemySettings = buildEnemySettingsFromLevelEntity(
          e,
          EnemyDef.radius * levelScale,
          levelScale
        );
        const enemy = new Enemy(px, py, enemySettings);
        world.enemies.push(enemy);
        break;
      }

      case "Egg": {
        const eggAngle = Number.isFinite(Number(e.angle)) ? Number(e.angle) : 0;
        const egg = new Egg(px, py, eggAngle);
        const eggRadius = Number.isFinite(Number(e.radius))
          ? Number(e.radius) * levelScale
          : EggDef.targetRadius * levelScale;

        egg.radius = eggRadius;
        egg.displayRadius = eggRadius;
        egg.detached = e.detached !== false;
        egg.dx = Number.isFinite(Number(e.dx)) ? Number(e.dx) : 0;
        egg.dy = Number.isFinite(Number(e.dy)) ? Number(e.dy) : 0;
        egg.spriteIndex = normalizeSpriteIndex(e.spriteIndex, EggDef.spriteIndex);
        egg.spriteAlpha = Number.isFinite(Number(e.spriteAlpha)) ? Number(e.spriteAlpha) : EggDef.spriteAlpha;
        egg.hatching = !!e.hatching;
        egg.hatched = !!e.hatched;
        egg.sourceEnemyRadius = Number.isFinite(Number(e.sourceEnemyRadius))
          ? Number(e.sourceEnemyRadius) * levelScale
          : eggRadius;
        egg.hatchEnemyRadius = Number.isFinite(Number(e.hatchEnemyRadius))
          ? Number(e.hatchEnemyRadius) * levelScale
          : egg.sourceEnemyRadius;

        world.eggs.push(egg);
        break;
      }

      case "Cyst": {
        const cystAngle = Number.isFinite(Number(e.angle)) ? Number(e.angle) : 0;
        const cystRadius = Number.isFinite(Number(e.radius))
          ? Number(e.radius) * levelScale
          : EggDef.targetRadius * (config.cystRadiusScale ?? 1.5) * levelScale;
        const cyst = new Cyst(px, py, cystAngle, {
          baseRadius: cystRadius,
          radiusScale: 1
        });

        cyst.radius = cystRadius;
        cyst.displayRadius = cystRadius;
        cyst.dx = Number.isFinite(Number(e.dx)) ? Number(e.dx) : 0;
        cyst.dy = Number.isFinite(Number(e.dy)) ? Number(e.dy) : 0;
        cyst.spriteAlpha = Number.isFinite(Number(e.spriteAlpha)) ? Number(e.spriteAlpha) : cyst.spriteAlpha;

        world.eggs.push(cyst);
        break;
      }

      case "Macrophage": {
        const bodyCircles = Array.isArray(e.bodyCircles) && e.bodyCircles.length > 0
          ? scaleRelativeCircles(e.bodyCircles, r)
          : null;
        const digestPath = e.digestPath && typeof e.digestPath === "object"
          ? Object.fromEntries(
              Object.entries(e.digestPath).map(([key, point]) => [
                key,
                {
                  dx: Number.isFinite(Number(point?.dx))
                    ? Number(point.dx) * levelScale
                    : (Number(point?.dxR ?? 0) || 0) * r,
                  dy: Number.isFinite(Number(point?.dy))
                    ? Number(point.dy) * levelScale
                    : (Number(point?.dyR ?? 0) || 0) * r
                }
              ])
            )
          : null;
        const mouthSource = e.mouth && typeof e.mouth === "object" ? e.mouth : {};
        const mouthSettings = {
          ...mouthSource,
          turnEnabled: mouthSource.turnEnabled ?? (mouthSource.turn === false ? false : undefined),
          absorbRadius: Number.isFinite(Number(mouthSource.absorbRadius))
            ? Number(mouthSource.absorbRadius) * levelScale
            : (Number.isFinite(Number(e.mouthAbsorbRadius)) ? Number(e.mouthAbsorbRadius) * levelScale : mouthSource.absorbRadius),
          offsetDistance: Number.isFinite(Number(mouthSource.offsetDistance))
            ? Number(mouthSource.offsetDistance) * levelScale
            : (Number.isFinite(Number(e.mouthOffsetDistance)) ? Number(e.mouthOffsetDistance) * levelScale : mouthSource.offsetDistance),
          rotationDir: Number.isFinite(Number(mouthSource.rotationDir))
            ? Number(mouthSource.rotationDir)
            : (Number.isFinite(Number(e.rotationDir)) ? Number(e.rotationDir) : mouthSource.rotationDir),
          rotationRange: Array.isArray(mouthSource.rotationRange) && mouthSource.rotationRange.length === 2
            ? mouthSource.rotationRange
            : parseOptionalJsonArray(e.rotationRange) ?? mouthSource.rotationRange
        };
        const bodyRotation = e.bodyRotation && typeof e.bodyRotation === "object"
          ? {
              ...e.bodyRotation,
              baseAngleDeg: Number.isFinite(Number(e.bodyRotation.baseAngleDeg))
                ? Number(e.bodyRotation.baseAngleDeg)
                : 0,
              pivotDx: Number.isFinite(Number(e.bodyRotation.pivotDx))
                ? Number(e.bodyRotation.pivotDx) * levelScale
                : (Number(e.bodyRotation.pivotDxR ?? 0) || 0) * r,
              pivotDy: Number.isFinite(Number(e.bodyRotation.pivotDy))
                ? Number(e.bodyRotation.pivotDy) * levelScale
                : (Number(e.bodyRotation.pivotDyR ?? 0) || 0) * r,
              pivotRadius: Number.isFinite(Number(e.bodyRotation.pivotRadius))
                ? Number(e.bodyRotation.pivotRadius) * levelScale
                : Math.max(4, (Number(e.bodyRotation.pivotRadiusR ?? (12 / Math.max(r, 0.0001))) || 0) * r)
            }
          : null;
        const orbitSource = e.orbit && typeof e.orbit === "object" ? e.orbit : null;
        const orbitSettings = orbitSource
          ? (() => {
              const orbitVector = resolveLevelVector(
                {
                  dx: orbitSource.centerDx,
                  dy: orbitSource.centerDy,
                  dxNorm: orbitSource.centerDxNorm,
                  dyNorm: orbitSource.centerDyNorm,
                  dxBgNorm: orbitSource.centerDxBgNorm,
                  dyBgNorm: orbitSource.centerDyBgNorm
                },
                resolveBounds,
                world.background,
                levelJson
              );
              const orbitSegments = Array.isArray(orbitSource.segments)
                ? orbitSource.segments.map(segment => {
                    const segmentVector = resolveLevelVector(
                      {
                        dx: segment.centerDx,
                        dy: segment.centerDy,
                        dxNorm: segment.centerDxNorm,
                        dyNorm: segment.centerDyNorm,
                        dxBgNorm: segment.centerDxBgNorm,
                        dyBgNorm: segment.centerDyBgNorm
                      },
                      resolveBounds,
                      world.background,
                      levelJson
                    );
                    return {
                      ...segment,
                      centerDx: segmentVector.dx,
                      centerDy: segmentVector.dy,
                      radius: Number.isFinite(Number(segment.radius))
                        ? Number(segment.radius) * levelScale
                        : (Number(segment.radiusPx ?? 0) || 0) * levelScale,
                      startDeg: Number.isFinite(Number(segment.startDeg)) ? Number(segment.startDeg) : 0,
                      endDeg: Number.isFinite(Number(segment.endDeg)) ? Number(segment.endDeg) : 0,
                      speed: Number.isFinite(Number(segment.speed)) ? Number(segment.speed) : 0
                    };
                  })
                : null;
              const orbitSplinePoints = Array.isArray(orbitSource.splinePoints)
                ? orbitSource.splinePoints.map(point => {
                    const pointVector = resolveLevelVector(
                      {
                        dx: point.dx,
                        dy: point.dy,
                        dxNorm: point.dxNorm,
                        dyNorm: point.dyNorm,
                        dxBgNorm: point.dxBgNorm,
                        dyBgNorm: point.dyBgNorm
                      },
                      resolveBounds,
                      world.background,
                      levelJson
                    );
                    return {
                      dx: pointVector.dx,
                      dy: pointVector.dy
                    };
                  })
                : null;
              return {
                ...orbitSource,
                mode: typeof orbitSource.mode === "string" ? orbitSource.mode : undefined,
                centerDx: orbitVector.dx,
                centerDy: orbitVector.dy,
                radius: Number.isFinite(Number(orbitSource.radius))
                  ? Number(orbitSource.radius) * levelScale
                  : (Number(orbitSource.radiusPx ?? 0) || 0) * levelScale,
                speed: Number.isFinite(Number(orbitSource.speed)) ? Number(orbitSource.speed) : 0,
                phaseDeg: Number.isFinite(Number(orbitSource.phaseDeg)) ? Number(orbitSource.phaseDeg) : null,
                loop: orbitSource.loop ?? true,
                segments: orbitSegments && orbitSegments.length > 0 ? orbitSegments : null,
                splinePoints: orbitSplinePoints && orbitSplinePoints.length > 2 ? orbitSplinePoints : null,
                freeMove: orbitSource.freeMove && typeof orbitSource.freeMove === "object"
                  ? {
                      ...orbitSource.freeMove,
                      previewRadius: Number.isFinite(Number(orbitSource.freeMove.previewRadius))
                        ? Number(orbitSource.freeMove.previewRadius) * levelScale
                        : (Number(orbitSource.freeMove.previewRadiusPx ?? 0) || 0) * levelScale
                    }
                  : null
              };
            })()
          : null;
        const absorbTargetSettings = e.absorbTargets && typeof e.absorbTargets === "object"
          ? {
              particle: e.absorbTargets.particle !== false,
              projectile: !!e.absorbTargets.projectile,
              player: e.absorbTargets.player !== false,
              enemy: !!e.absorbTargets.enemy
            }
          : null;
        const eggSpawnSettings = e.eggSpawn && typeof e.eggSpawn === "object"
          ? {
              bodyCircleIndex: Math.max(0, Math.round(Number(e.eggSpawn.bodyCircleIndex ?? 1) || 0)),
              angleDeg: Number.isFinite(Number(e.eggSpawn.angleDeg)) ? Number(e.eggSpawn.angleDeg) : 25,
              feedCount: Math.max(1, Math.round(Number(e.eggSpawn.feedCount ?? 6) || 6))
            }
          : null;
        const germinationSettings = e.germination && typeof e.germination === "object"
          ? {
              enabled: !!e.germination.enabled,
              bodyCircleIndex: Math.max(0, Math.round(Number(e.germination.bodyCircleIndex ?? 2) || 0)),
              angleDeg: Number.isFinite(Number(e.germination.angleDeg)) ? Number(e.germination.angleDeg) : -30,
              feedCount: Math.max(1, Math.round(Number(e.germination.feedCount ?? 10) || 10)),
              startScale: Number.isFinite(Number(e.germination.startScale)) ? Number(e.germination.startScale) : undefined,
              growthRate: Number.isFinite(Number(e.germination.growthRate)) ? Number(e.germination.growthRate) : undefined,
              detachScale: Number.isFinite(Number(e.germination.detachScale)) ? Number(e.germination.detachScale) : undefined,
              launchSpeed: Number.isFinite(Number(e.germination.launchSpeed)) ? Number(e.germination.launchSpeed) : undefined,
              mirrorOffspringX: !!e.germination.mirrorOffspringX,
              launchJitter: Number.isFinite(Number(e.germination.launchJitter)) ? Number(e.germination.launchJitter) : undefined,
              initialAngleJitterDeg: Number.isFinite(Number(e.germination.initialAngleJitterDeg)) ? Number(e.germination.initialAngleJitterDeg) : undefined,
              mouthWakeDelayMs: Number.isFinite(Number(e.germination.mouthWakeDelayMs)) ? Number(e.germination.mouthWakeDelayMs) : undefined
            }
          : null;
        const projectileSpawnSettings = e.projectileSpawn && typeof e.projectileSpawn === "object"
          ? {
              bodyCircleIndex: Math.max(0, Math.round(Number(e.projectileSpawn.bodyCircleIndex ?? 0) || 0)),
              angleDeg: Number.isFinite(Number(e.projectileSpawn.angleDeg)) ? Number(e.projectileSpawn.angleDeg) : 180
            }
          : null;
        const growthSettings = e.growth && typeof e.growth === "object"
          ? {
              enabled: !!e.growth.enabled,
              perAbsorb: Number.isFinite(Number(e.growth.perAbsorb)) ? Number(e.growth.perAbsorb) * levelScale : undefined,
              maxRadius: Number.isFinite(Number(e.growth.maxRadius)) ? Number(e.growth.maxRadius) * levelScale : undefined,
              growthRate: Number.isFinite(Number(e.growth.growthRate)) ? Number(e.growth.growthRate) * levelScale : undefined
            }
          : null;
        const bodyCiliaSettings = e.bodyCilia && typeof e.bodyCilia === "object"
          ? {
              ...e.bodyCilia,
              splineOffset: Number.isFinite(Number(e.bodyCilia.splineOffset))
                ? Number(e.bodyCilia.splineOffset) * levelScale
                : undefined,
              segments: Array.isArray(e.bodyCilia.segments)
                ? e.bodyCilia.segments.map(segment => ({
                    enabled: segment?.enabled ?? true,
                    start: Number.isFinite(Number(segment?.start)) ? Number(segment.start) : 0,
                    end: Number.isFinite(Number(segment?.end)) ? Number(segment.end) : 1
                  }))
                : undefined
            }
          : null;
        const spriteSettings = {
          instanceIndex: Math.max(1, Math.round(Number(e.instanceIndex ?? e.spriteIndex ?? 1) || 1)),
          spriteIndex: normalizeSpriteIndex(e.spriteIndex, e.instanceIndex ?? 1),
          spriteSubfolder: typeof e.spriteSubfolder === "string" ? e.spriteSubfolder : null,
          spriteAnimationEnabled: e.spriteAnimationEnabled !== false,
          spriteAnimationFolder: "Macrophage",
          spriteAnimationSubfolder: typeof e.spriteAnimationSubfolder === "string" ? e.spriteAnimationSubfolder : null,
          spriteAnimationFrames: Math.max(1, Math.round(Number(e.spriteAnimationFrames ?? 5) || 5)),
          spriteAnimationStart: normalizeSpriteIndex(e.spriteAnimationStart, 1),
          spriteAnimationFps: Math.max(1, Number(e.spriteAnimationFps ?? 12) || 12),
          spriteAnimationMode: e.spriteAnimationMode === "pingpong" ? "pingpong" : "loop",
          spriteAnimationPadding: Math.max(1, Math.round(Number(e.spriteAnimationPadding ?? 5) || 5)),
          spriteScale: Number.isFinite(Number(e.spriteScale)) ? Number(e.spriteScale) : undefined,
          spriteRotationOffset: Number.isFinite(Number(e.spriteRotationOffset)) ? Number(e.spriteRotationOffset) : undefined,
          spriteBodyU: Number.isFinite(Number(e.spriteBodyU)) ? Number(e.spriteBodyU) : undefined,
          spriteBodyV: Number.isFinite(Number(e.spriteBodyV)) ? Number(e.spriteBodyV) : undefined,
          spriteFlipX: !!e.spriteFlipX,
          spriteDebug: !!e.spriteDebug
        };
        const m = new Macrophage(px, py, r, MacroDef.color, bodyCircles, mouthSettings, digestPath, bodyRotation, spriteSettings, orbitSettings, absorbTargetSettings, eggSpawnSettings, germinationSettings, projectileSpawnSettings, growthSettings, bodyCiliaSettings);
        m.gitParticleRadius = Number.isFinite(Number(e.gitParticleRadius))
          ? Math.max(0.4, Number(e.gitParticleRadius) * levelScale)
          : Math.max(0.4, r / 8);

        world.macrophages.push(m);
        break;
      }

      case "Stentor": {
        world.stentors.push(
          new Stentor(
            px,
            py,
            r,
            StentorDef.color,
            mapLevelCircles(e.circles, resolveBounds, world.background, levelScale),
            e.mouth ?? null,
            e.bodyRotation ?? null
          )
        );
        break;
      }

      case "Obstacle": {
        world.obstacles.push(new Obstacle(px, py, r));
        break;
      }

      case "Stone": {
        let innerArtifacts = [];

        if (Array.isArray(e.innerArtifacts) && e.innerArtifacts.length > 0) {
          innerArtifacts = e.innerArtifacts.map(artifact => ({
            dx: (artifact.dxR ?? 0) * r,
            dy: (artifact.dyR ?? 0) * r,
            radius: (artifact.rR ?? 0.25) * r,
            spriteIndex: artifact.spriteIndex ?? 1
          }));
        }

        world.stones.push(new Stone(px, py, r, undefined, innerArtifacts));
        break;
      }

      case "ComposedStone": {
        world.composedStones.push(
          new ComposedStone(px, py, mapLevelCircles(e.circles, resolveBounds, world.background, levelScale) ?? ComposedStoneDef.circles, undefined, {
            spriteIndex: e.spriteIndex,
            spriteScale: e.spriteScale,
            spriteReferenceRadius: Number.isFinite(Number(e.spriteReferenceRadius))
              ? Number(e.spriteReferenceRadius) * levelScale
              : undefined,
            spriteRotationOffset: e.spriteRotationOffset,
            spriteBodyU: e.spriteBodyU,
            spriteBodyV: e.spriteBodyV,
            spriteFlipX: !!e.spriteFlipX,
            spriteDebug: e.spriteDebug == null ? true : e.spriteDebug,
            spriteSubfolder: e.spriteSubfolder,
            impulseFactor: e.impulseFactor,
            friction: e.friction,
            maxSpeed: e.maxSpeed,
            wallBounce: e.wallBounce,
            bounceForce: e.bounceForce,
            density: e.density,
            angularFriction: e.angularFriction,
            angularImpulseFactor: e.angularImpulseFactor,
            maxAngularSpeed: e.maxAngularSpeed
          })
        );
        break;
      }

      case "Algae": {
        world.algae.push(
          new Algae(px, py, mapLevelCircles(e.circles, resolveBounds, world.background, levelScale) ?? AlgaeDef.circles, undefined, {
            name: e.name,
            spriteIndex: e.spriteIndex,
            spriteScale: e.spriteScale,
            spriteReferenceRadius: Number.isFinite(Number(e.spriteReferenceRadius))
              ? Number(e.spriteReferenceRadius) * levelScale
              : undefined,
            spriteRotationOffset: e.spriteRotationOffset,
            spriteBodyU: e.spriteBodyU,
            spriteBodyV: e.spriteBodyV,
            spriteFlipX: !!e.spriteFlipX,
            spriteDebug: !!e.spriteDebug,
            spriteSubfolder: e.spriteSubfolder,
            impulseFactor: e.impulseFactor,
            friction: e.friction,
            maxSpeed: e.maxSpeed,
            wallBounce: e.wallBounce,
            bounceForce: e.bounceForce,
            density: e.density,
            angularFriction: e.angularFriction,
            angularImpulseFactor: e.angularImpulseFactor,
            maxAngularSpeed: e.maxAngularSpeed,
            absorbImpulseTransfer: e.absorbImpulseTransfer,
            maxStoredProjectiles: e.maxStoredProjectiles,
            productionPerProjectile: e.productionPerProjectile,
            productionIntervalMs: e.productionIntervalMs,
            maxProducedPerTick: e.maxProducedPerTick,
            particleRadius: Number.isFinite(Number(e.particleRadius))
              ? Number(e.particleRadius) * levelScale
              : undefined,
            particleSpeed: e.particleSpeed,
            particleSpread: e.particleSpread,
            particleColor: e.particleColor,
            particleSpriteIndex: e.particleSpriteIndex,
            particleTintGroup: e.particleTintGroup,
            storedProjectiles: e.storedProjectiles,
            germinationSettings: e.germination && typeof e.germination === "object"
              ? {
                  enabled: !!e.germination.enabled,
                  bodyCircleIndex: Math.max(0, Math.round(Number(e.germination.bodyCircleIndex ?? 2) || 0)),
                  angleDeg: Number.isFinite(Number(e.germination.angleDeg)) ? Number(e.germination.angleDeg) : -30,
                  feedCount: Math.max(1, Math.round(Number(e.germination.feedCount ?? 10) || 10)),
                  startScale: Number.isFinite(Number(e.germination.startScale)) ? Number(e.germination.startScale) : undefined,
                  growthRate: Number.isFinite(Number(e.germination.growthRate)) ? Number(e.germination.growthRate) : undefined,
                  detachScale: Number.isFinite(Number(e.germination.detachScale)) ? Number(e.germination.detachScale) : undefined,
                  launchSpeed: Number.isFinite(Number(e.germination.launchSpeed)) ? Number(e.germination.launchSpeed) : undefined,
                  mirrorOffspringX: !!e.germination.mirrorOffspringX,
                  launchJitter: Number.isFinite(Number(e.germination.launchJitter)) ? Number(e.germination.launchJitter) : undefined,
                  initialAngleJitterDeg: Number.isFinite(Number(e.germination.initialAngleJitterDeg)) ? Number(e.germination.initialAngleJitterDeg) : undefined
                }
              : null
          })
        );
        break;
      }

      case "ComposedEntity": {
        world.composedEntities.push(
          new ComposedEntity(px, py, {
            name: e.name,
            sourcePath: e.sourcePath,
            spriteIndex: e.spriteIndex,
            spriteSubfolder: e.spriteSubfolder,
            spriteScale: e.spriteScale,
            spriteReferenceRadius: Number.isFinite(Number(e.spriteReferenceRadius))
              ? Number(e.spriteReferenceRadius) * levelScale
              : ComposedEntityDef.spriteReferenceRadius,
            spriteRotationOffset: e.spriteRotationOffset,
            spriteBodyU: e.spriteBodyU,
            spriteBodyV: e.spriteBodyV,
            spriteFlipX: !!e.spriteFlipX,
            spriteDebug: !!e.spriteDebug,
            width: Number.isFinite(Number(e.width)) ? Number(e.width) * levelScale : 0,
            height: Number.isFinite(Number(e.height)) ? Number(e.height) * levelScale : 0,
            radius: Number.isFinite(Number(e.radius))
              ? Number(e.radius) * levelScale
              : ComposedEntityDef.radius
          })
        );
        break;
      }

      case "Oldbody": {
        world.oldbodies.push(new Oldbody(px, py, r));
        break;
      }

      case "Particle": {
        const p = createInvisibleParticle(px, py, r);
        p.spriteIndex = Math.min(5, normalizeSpriteIndex(e.spriteIndex, 1));
        world.particles.push(applyParticleVisuals(p, PlayerDef.radius));
        break;
      }

      case "ParticleZone": {
        world.particleZones.push(
          new ParticleZone(px, py, r, {
            minSize: (e.minSize ?? 8) * levelScale,
            maxSize: (e.maxSize ?? 25) * levelScale,
            spawnIntervalMs: Number(e.spawnIntervalMs ?? 1800),
            growthDurationMs: Number(e.growthDurationMs ?? 1200),
            spriteIndex: normalizeSpriteIndex(e.spriteIndex ?? e.spriteIndexMin ?? 1, 1),
            spawnArcCenterDeg: Number(e.spawnArcCenterDeg ?? 0),
            spawnArcSpanDeg: Number(e.spawnArcSpanDeg ?? 360)
          })
        );

        break;
      }

      default:
        break;
    }
  }

  const allowFallbackPlayer = levelJson?.spawnFallbackPlayer !== false;

  if (!playerPlaced && allowFallbackPlayer) {
    const p = new Player(bounds.width / 2, bounds.height / 2);
    world.player = p;
    world.particles.push(p);
  }

  for (const group of [
    [world.player],
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
    for (const entity of group ?? []) {
      if (!entity || entity.absorbed || entity.removed) continue;
      clampEntityInsideBounds(entity, bounds, { inset: entity === world.player ? config.playerEdgeInset : 0 });
      if ("_spawnX" in entity) entity._spawnX = entity.x;
      if ("_spawnY" in entity) entity._spawnY = entity.y;
    }
  }

  const importDebug = {
    levelName: levelJson?.__debugLevelName ?? null,
    bounds,
    canvasRef: levelJson?.canvasRef ?? null,
    background: levelJson?.background ?? null,
    levelScale,
    positionDebug,
    counts: {
      entities: (levelJson?.entities ?? []).length,
      particles: world.particles.length,
      enemies: world.enemies.length,
      macrophages: world.macrophages.length,
      stentors: world.stentors.length,
      obstacles: world.obstacles.length,
      particleZones: world.particleZones.length,
      stones: world.stones.length,
      composedStones: world.composedStones.length,
      algae: world.algae.length,
      eggs: world.eggs.length
    }
  };

  if (typeof window !== "undefined") {
    window.__levelImportDebug = importDebug;
  }

  console.group("[Level Import Debug]");
  console.log(importDebug);
  console.log("bounds", importDebug.bounds);
  console.log("canvasRef", importDebug.canvasRef);
  console.log("background", importDebug.background);
  console.log("levelScale", importDebug.levelScale);
  console.table(importDebug.positionDebug);
  console.log("counts", importDebug.counts);
  console.log("window.__levelImportDebug", typeof window !== "undefined" ? window.__levelImportDebug : importDebug);
  console.log("Tip: copy(window.__levelImportDebug)");
  console.log({
    entities: (levelJson?.entities ?? []).length,
    particles: world.particles.length,
    enemies: world.enemies.length,
    macrophages: world.macrophages.length,
    stentors: world.stentors.length,
    obstacles: world.obstacles.length,
    particleZones: world.particleZones.length,
    stones: world.stones.length,
    composedStones: world.composedStones.length,
    algae: world.algae.length,
    eggs: world.eggs.length
  });
  console.groupEnd();

  buildSpatialGrid();
  return world;
}
