import { DEFAULTS as EnemyDef } from "../Enemy.js";

export function scaleRelativeCircles(circles, radius) {
  return circles.map(circle => ({
    dx: (circle.dxR ?? 0) * radius,
    dy: (circle.dyR ?? 0) * radius,
    r: (circle.rR ?? 1) * radius
  }));
}

function scaleRelativeArtifacts(artifacts, radius) {
  return artifacts.map(artifact => ({
    dx: (artifact.dxR ?? 0) * radius,
    dy: (artifact.dyR ?? 0) * radius,
    radius: (artifact.rR ?? 0.25) * radius,
    spriteIndex: artifact.spriteIndex ?? 1
  }));
}

export function clamp(v, r, max) {
  return Math.min(Math.max(v, r), max - r);
}

export function getEntityExtentRadius(entity) {
  if (!entity) return 0;

  if (typeof entity.getBoundsRadius === "function") {
    const boundsRadius = Number(entity.getBoundsRadius());
    if (Number.isFinite(boundsRadius) && boundsRadius > 0) return boundsRadius;
  }

  const circleSets = [entity.bodyCircles, entity.circles, entity._circles];
  for (const circles of circleSets) {
    if (!Array.isArray(circles) || circles.length === 0) continue;
    return circles.reduce(
      (max, circle) => Math.max(max, Math.hypot(circle.dx ?? 0, circle.dy ?? 0) + (circle.r ?? 0)),
      0
    );
  }

  return Math.max(0, entity.displayRadius ?? entity.radius ?? 0);
}

export function clampEntityInsideBounds(entity, bounds, options = {}) {
  if (!entity || !bounds) return;

  const width = Number(bounds.width);
  const height = Number(bounds.height);
  if (!(width > 0) || !(height > 0)) return;

  const inset = Math.max(0, Number(options.inset ?? 0) || 0);
  const extentRadius = getEntityExtentRadius(entity) + inset;
  if (!(extentRadius > 0)) return;

  const maxX = width - extentRadius;
  const maxY = height - extentRadius;

  if (extentRadius * 2 >= width) {
    entity.x = width * 0.5;
    if (typeof entity.dx === "number") entity.dx = 0;
  } else if (entity.x < extentRadius) {
    entity.x = extentRadius;
    if (typeof entity.dx === "number") entity.dx = Math.abs(entity.dx);
  } else if (entity.x > maxX) {
    entity.x = maxX;
    if (typeof entity.dx === "number") entity.dx = -Math.abs(entity.dx);
  }

  if (extentRadius * 2 >= height) {
    entity.y = height * 0.5;
    if (typeof entity.dy === "number") entity.dy = 0;
  } else if (entity.y < extentRadius) {
    entity.y = extentRadius;
    if (typeof entity.dy === "number") entity.dy = Math.abs(entity.dy);
  } else if (entity.y > maxY) {
    entity.y = maxY;
    if (typeof entity.dy === "number") entity.dy = -Math.abs(entity.dy);
  }
}

export function applyEntityEdgeAvoidance(entity, bounds, options = {}) {
  if (!entity || !bounds || typeof entity.dx !== "number" || typeof entity.dy !== "number") return false;

  const width = Number(bounds.width);
  const height = Number(bounds.height);
  if (!(width > 0) || !(height > 0)) return false;

  const inset = Math.max(0, Number(options.inset ?? 0) || 0);
  const extentRadius = getEntityExtentRadius(entity);
  if (!(extentRadius > 0)) return false;

  const distance = Math.max(1, Number(options.distance ?? extentRadius * 4) || 1);
  const force = Math.max(0, Number(options.force ?? 0.08) || 0);
  const damping = Math.max(0, Math.min(1, Number(options.damping ?? 0.98) || 0.98));

  const leftDist = entity.x - extentRadius - inset;
  const rightDist = width - entity.x - extentRadius - inset;
  const topDist = entity.y - extentRadius - inset;
  const bottomDist = height - entity.y - extentRadius - inset;
  let pushing = false;

  if (leftDist < distance) {
    entity.dx += force * (1 - Math.max(0, Math.min(1, leftDist / distance)));
    pushing = true;
  }
  if (rightDist < distance) {
    entity.dx -= force * (1 - Math.max(0, Math.min(1, rightDist / distance)));
    pushing = true;
  }
  if (topDist < distance) {
    entity.dy += force * (1 - Math.max(0, Math.min(1, topDist / distance)));
    pushing = true;
  }
  if (bottomDist < distance) {
    entity.dy -= force * (1 - Math.max(0, Math.min(1, bottomDist / distance)));
    pushing = true;
  }

  if (!pushing) return false;

  entity.dx *= damping;
  entity.dy *= damping;
  return true;
}

export function normToPxX(xNorm, bounds) {
  return (xNorm ?? 0.5) * bounds.width;
}

export function normToPxY(yNorm, bounds) {
  return (yNorm ?? 0.5) * bounds.height;
}

export function getBackgroundDrawRect(background, bounds) {
  if (!background) return null;

  const sourceWidth = Number(background.width ?? background.image?.naturalWidth ?? 0);
  const sourceHeight = Number(background.height ?? background.image?.naturalHeight ?? 0);
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) return null;

  const fitScale = Math.max(bounds.width / sourceWidth, bounds.height / sourceHeight);
  const drawScale = fitScale * Math.max(0.05, Number(background.scaleMul) || 1);

  return {
    x: (Number(background.offsetXNorm) || 0) * bounds.width,
    y: (Number(background.offsetYNorm) || 0) * bounds.height,
    width: sourceWidth * drawScale,
    height: sourceHeight * drawScale
  };
}

function getBackgroundDrawScale(background, bounds) {
  const rect = getBackgroundDrawRect(background, bounds);
  const sourceWidth = Number(background?.width ?? background?.image?.naturalWidth ?? 0);
  if (!rect || !(sourceWidth > 0)) return null;
  return rect.width / sourceWidth;
}

export function getLevelScale(levelJson, bounds, background = null) {
  if (background && levelJson?.background) {
    const currentBgScale = getBackgroundDrawScale(background, bounds);
    const referenceBgScale = getBackgroundDrawScale(levelJson.background, levelJson.canvasRef ?? {});

    if ((currentBgScale ?? 0) > 0 && (referenceBgScale ?? 0) > 0) {
      return currentBgScale / referenceBgScale;
    }
  }

  const sourceWidth = Number(levelJson?.canvasRef?.width ?? 0);
  const sourceHeight = Number(levelJson?.canvasRef?.height ?? 0);
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) return 1;

  return Math.min(
    bounds.width / sourceWidth,
    bounds.height / sourceHeight
  );
}

function getCanvasRefTransform(levelJson, bounds) {
  const sourceWidth = Number(levelJson?.canvasRef?.width ?? 0);
  const sourceHeight = Number(levelJson?.canvasRef?.height ?? 0);
  if (!(sourceWidth > 0) || !(sourceHeight > 0) || !(bounds?.width > 0) || !(bounds?.height > 0)) {
    return null;
  }

  const scale = Math.min(bounds.width / sourceWidth, bounds.height / sourceHeight);
  return {
    sourceWidth,
    sourceHeight,
    scale,
    offsetX: (bounds.width - sourceWidth * scale) * 0.5,
    offsetY: (bounds.height - sourceHeight * scale) * 0.5
  };
}

export function resolveLevelPoint(entity, bounds, background = null, levelJson = null) {
  const backgroundRect = getBackgroundDrawRect(background, bounds);
  if (backgroundRect && (entity?.xBgNorm != null || entity?.yBgNorm != null)) {
    return {
      x: backgroundRect.x + (Number(entity.xBgNorm) || 0) * backgroundRect.width,
      y: backgroundRect.y + (Number(entity.yBgNorm) || 0) * backgroundRect.height
    };
  }

  const transform = getCanvasRefTransform(levelJson, bounds);
  if (transform) {
    if (Number.isFinite(Number(entity?.x)) && Number.isFinite(Number(entity?.y))) {
      return {
        x: Number(entity.x) * transform.scale + transform.offsetX,
        y: Number(entity.y) * transform.scale + transform.offsetY
      };
    }

    if (entity?.xNorm != null || entity?.yNorm != null) {
      return {
        x: (Number(entity.xNorm) || 0) * transform.sourceWidth * transform.scale + transform.offsetX,
        y: (Number(entity.yNorm) || 0) * transform.sourceHeight * transform.scale + transform.offsetY
      };
    }
  }

  return {
    x: normToPxX(entity?.xNorm, bounds),
    y: normToPxY(entity?.yNorm, bounds)
  };
}

export function resolveLevelVector(vector, bounds, background = null, levelJson = null) {
  const backgroundRect = getBackgroundDrawRect(background, bounds);
  if (backgroundRect && (vector?.dxBgNorm != null || vector?.dyBgNorm != null)) {
    return {
      dx: (Number(vector.dxBgNorm) || 0) * backgroundRect.width,
      dy: (Number(vector.dyBgNorm) || 0) * backgroundRect.height
    };
  }

  const transform = getCanvasRefTransform(levelJson, bounds);
  if (transform) {
    if (Number.isFinite(Number(vector?.dx)) && Number.isFinite(Number(vector?.dy))) {
      return {
        dx: Number(vector.dx) * transform.scale,
        dy: Number(vector.dy) * transform.scale
      };
    }

    if (vector?.dxNorm != null || vector?.dyNorm != null) {
      return {
        dx: (Number(vector.dxNorm) || 0) * transform.sourceWidth * transform.scale,
        dy: (Number(vector.dyNorm) || 0) * transform.sourceHeight * transform.scale
      };
    }
  }

  return {
    dx: (vector?.dxNorm ?? 0) * bounds.width,
    dy: (vector?.dyNorm ?? 0) * bounds.height
  };
}

export function buildEnemySettingsFromLevelEntity(e, fallbackRadius = EnemyDef.radius, levelScale = 1) {
  const nested = (e.enemy && typeof e.enemy === "object") ? e.enemy : {};

  const enemySettings = {
    ...nested,
    ...e
  };

  delete enemySettings.type;
  delete enemySettings.xNorm;
  delete enemySettings.yNorm;
  delete enemySettings.xBgNorm;
  delete enemySettings.yBgNorm;
  delete enemySettings.enemy;

  const explicitRadius = e.radius ?? nested.radius;
  enemySettings.radius = explicitRadius != null
    ? Number(explicitRadius) * levelScale
    : fallbackRadius;
  enemySettings.color = e.color ?? nested.color ?? EnemyDef.color;
  if (Array.isArray(e.bodyCircles) && e.bodyCircles.length > 0) {
    enemySettings.bodyCircles = scaleRelativeCircles(e.bodyCircles, enemySettings.radius);
  } else if (Array.isArray(nested.bodyCircles) && nested.bodyCircles.length > 0) {
    enemySettings.bodyCircles = scaleRelativeCircles(nested.bodyCircles, enemySettings.radius);
  }
  if (Array.isArray(e.innerArtifacts) && e.innerArtifacts.length > 0) {
    enemySettings.innerArtifacts = scaleRelativeArtifacts(e.innerArtifacts, enemySettings.radius);
  } else if (Array.isArray(nested.innerArtifacts) && nested.innerArtifacts.length > 0) {
    enemySettings.innerArtifacts = scaleRelativeArtifacts(nested.innerArtifacts, enemySettings.radius);
  }

  if (enemySettings.instanceIndex == null) {
    enemySettings.instanceIndex =
      e.index ??
      nested.index ??
      e.id ??
      nested.id ??
      null;
  }

  return enemySettings;
}
