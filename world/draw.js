import { config } from "../config.js";
import { world } from "../worldState.js";
import { calculateProjectileAlgaeFieldAt } from "../projectileAlgaeField.js";
import { getBackgroundDrawRect } from "./shared.js";

function strokeCircle(ctx, x, y, radius, color, lineWidth = 2) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.closePath();
}

function drawMarker(ctx, x, y, color = "rgba(130,255,243,0.95)", size = 6) {
  ctx.beginPath();
  ctx.moveTo(x - size, y);
  ctx.lineTo(x + size, y);
  ctx.moveTo(x, y - size);
  ctx.lineTo(x, y + size);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.closePath();
}

function drawFieldLineArrowHead(ctx, points) {
  if (!Array.isArray(points) || points.length < 2) return;

  const end = points[points.length - 1];
  const prev = points[points.length - 2];
  const dx = end.x - prev.x;
  const dy = end.y - prev.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 0.0001)) return;

  const nx = dx / length;
  const ny = dy / length;
  const head = 8;
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(
    end.x - nx * head - ny * head * 0.72,
    end.y - ny * head + nx * head * 0.72
  );
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(
    end.x - nx * head + ny * head * 0.72,
    end.y - ny * head - nx * head * 0.72
  );
  ctx.stroke();
  ctx.closePath();
}

function isNearAnyAlgae(x, y, algaeList, padding = 12) {
  for (const algae of algaeList) {
    const radius = Math.max(0, Number(algae.radius) || 0) + padding;
    const dx = x - algae.x;
    const dy = y - algae.y;
    if (dx * dx + dy * dy <= radius * radius) return true;
  }
  return false;
}

function findNearestAlgaeInRange(x, y, algaeList, range) {
  let nearest = null;
  let nearestDistSq = Infinity;
  const rangeSq = range > 0 ? range * range : Infinity;

  for (const algae of algaeList) {
    const dx = algae.x - x;
    const dy = algae.y - y;
    const distSq = dx * dx + dy * dy;
    if (distSq > rangeSq || distSq >= nearestDistSq) continue;
    nearest = algae;
    nearestDistSq = distSq;
  }

  return nearest ? { algae: nearest, dist: Math.sqrt(nearestDistSq) } : null;
}

function drawProjectileAlgaeGuideLine(ctx, startX, startY, target, range) {
  if (!target?.algae || !(target.dist > 1)) return;

  const algae = target.algae;
  const dist = target.dist;
  const dx = algae.x - startX;
  const dy = algae.y - startY;
  const nx = dx / dist;
  const ny = dy / dist;
  const algaeRadius = Math.max(0, Number(algae.radius) || 0);
  if (dist < algaeRadius + 28) return;

  const endX = algae.x - nx * (algaeRadius + 18);
  const endY = algae.y - ny * (algaeRadius + 18);
  const curl = Number.isFinite(Number(config.projectileAlgaeFieldCurl))
    ? Number(config.projectileAlgaeFieldCurl)
    : 0.5;
  const curlSign = Math.sin(startX * 0.017 + startY * 0.013 + algae.x * 0.005) >= 0 ? 1 : -1;
  const bend = Math.min(280, dist * 0.32) * curl * curlSign;
  const midX = (startX + endX) * 0.5 - ny * bend;
  const midY = (startY + endY) * 0.5 + nx * bend;
  const alpha = Math.max(0.42, Math.min(0.9, 1 - dist / Math.max(range, 1) + 0.35));

  const points = [];
  for (let i = 0; i <= 18; i++) {
    const t = i / 18;
    const mt = 1 - t;
    points.push({
      x: mt * mt * startX + 2 * mt * t * midX + t * t * endX,
      y: mt * mt * startY + 2 * mt * t * midY + t * t * endY
    });
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.strokeStyle = `rgba(24, 255, 178, ${alpha})`;
  ctx.lineWidth = 3.2;
  ctx.shadowColor = "rgba(36, 255, 184, 0.86)";
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.closePath();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = `rgba(242, 255, 248, ${Math.min(1, alpha + 0.15)})`;
  ctx.lineWidth = 1.7;
  drawFieldLineArrowHead(ctx, points);

  ctx.beginPath();
  ctx.arc(startX, startY, 3.4, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(242, 255, 248, ${Math.min(0.92, alpha + 0.1)})`;
  ctx.fill();
  ctx.closePath();
}

function traceProjectileAlgaeFieldLine(seedX, seedY, algaeList, width, height, direction = 1) {
  const step = Math.max(20, Math.min(52, Math.sqrt(width * height) / 46));
  const maxSteps = Math.max(
    42,
    Math.min(120, Math.round((Math.max(width, height) / step) * 1.55))
  );
  const points = [];
  let x = seedX;
  let y = seedY;
  let totalForce = 0;

  for (let i = 0; i < maxSteps; i++) {
    if (x < 0 || y < 0 || x > width || y > height) break;

    const { fx, fy } = calculateProjectileAlgaeFieldAt(x, y, algaeList);
    const force = Math.hypot(fx, fy);
    if (!(force > 0.00025)) break;

    points.push({ x, y });
    totalForce += force;
    if (direction > 0 && i > 1 && isNearAnyAlgae(x, y, algaeList)) break;

    x += (fx / force) * step * direction;
    y += (fy / force) * step * direction;
  }

  return {
    points,
    averageForce: points.length > 0 ? totalForce / points.length : 0
  };
}

function drawProjectileAlgaeFieldLine(ctx, points, averageForce, maxForce) {
  if (!Array.isArray(points) || points.length < 5) return;

  const visualMax = Number.isFinite(maxForce) && maxForce > 0 ? maxForce : 0.05;
  const alpha = Math.max(0.42, Math.min(0.92, 0.35 + (averageForce / visualMax) * 0.95));

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.strokeStyle = `rgba(48, 255, 186, ${alpha})`;
  ctx.lineWidth = 2.15;
  ctx.shadowColor = "rgba(72, 255, 196, 0.72)";
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.closePath();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = `rgba(238, 255, 248, ${Math.min(0.98, alpha + 0.12)})`;
  ctx.lineWidth = 1.45;
  drawFieldLineArrowHead(ctx, points);
}

function drawProjectileAlgaeFieldDebug(ctx, bounds) {
  if (!config.projectileAlgaeFieldEnabled) return;

  const algaeList = (world.algae ?? []).filter(algae =>
    algae &&
    !algae.absorbed &&
    !algae.removed &&
    Number.isFinite(algae.x) &&
    Number.isFinite(algae.y)
  );
  if (algaeList.length === 0) return;

  const width = Math.max(1, Number(bounds?.width ?? ctx.canvas.width) || 1);
  const height = Math.max(1, Number(bounds?.height ?? ctx.canvas.height) || 1);
  const viewX = Math.max(0, Number(bounds?.viewX ?? 0) || 0);
  const viewY = Math.max(0, Number(bounds?.viewY ?? 0) || 0);
  const viewWidth = Math.max(1, Number(bounds?.viewWidth ?? width) || width);
  const viewHeight = Math.max(1, Number(bounds?.viewHeight ?? height) || height);
  const minX = Math.max(0, viewX);
  const minY = Math.max(0, viewY);
  const maxX = Math.min(width, viewX + viewWidth);
  const maxY = Math.min(height, viewY + viewHeight);
  const range = Math.max(0, Number(config.projectileAlgaeFieldRange) || 0);
  const maxForce = Math.max(0, Number(config.projectileAlgaeFieldMaxForce) || 0.05);
  const visibleArea = Math.max(1, (maxX - minX) * (maxY - minY));
  const seedStep = Math.max(170, Math.min(340, Math.sqrt(visibleArea / 42)));
  const linesPerAlgae = Math.max(8, Math.min(16, Math.round(Math.sqrt(visibleArea) / 130)));

  ctx.save();
  ctx.globalCompositeOperation = "source-over";

  if (range > 0) {
    ctx.setLineDash([18, 12]);
    ctx.strokeStyle = "rgba(72, 255, 196, 0.42)";
    ctx.lineWidth = 2.4;
    for (const algae of algaeList) {
      ctx.beginPath();
      ctx.arc(algae.x, algae.y, range, 0, Math.PI * 2);
      ctx.stroke();
      ctx.closePath();
    }
    ctx.setLineDash([]);
  }

  ctx.fillStyle = "rgba(4, 28, 18, 0.86)";
  ctx.fillRect(minX + 16, minY + 82, 172, 30);
  ctx.strokeStyle = "rgba(24, 255, 178, 0.9)";
  ctx.lineWidth = 1.25;
  ctx.strokeRect(minX + 16, minY + 82, 172, 30);
  ctx.fillStyle = "rgba(232, 255, 246, 0.98)";
  ctx.font = "12px monospace";
  ctx.fillText("CO2 FIELD LINES ON", minX + 28, minY + 102);

  let row = 0;
  for (let y = minY + seedStep * 0.45; y < maxY; y += seedStep, row++) {
    const rowOffset = row % 2 === 0 ? 0 : seedStep * 0.5;
    for (let x = minX + seedStep * 0.42 + rowOffset; x < maxX; x += seedStep) {
      const target = findNearestAlgaeInRange(x, y, algaeList, range);
      drawProjectileAlgaeGuideLine(ctx, x, y, target, range);

      const line = traceProjectileAlgaeFieldLine(x, y, algaeList, width, height, 1);
      drawProjectileAlgaeFieldLine(ctx, line.points, line.averageForce, maxForce);
    }
  }

  for (const algae of algaeList) {
    const seedRadius = Math.max(36, (Number(algae.radius) || 0) + 28);
    const angleOffset = (algae.x * 0.013 + algae.y * 0.007) % (Math.PI * 2);
    for (let i = 0; i < linesPerAlgae; i++) {
      const angle = angleOffset + (i / linesPerAlgae) * Math.PI * 2;
      const seedX = algae.x + Math.cos(angle) * seedRadius;
      const seedY = algae.y + Math.sin(angle) * seedRadius;
      const line = traceProjectileAlgaeFieldLine(seedX, seedY, algaeList, width, height, -1);
      const points = line.points.reverse();
      drawProjectileAlgaeFieldLine(ctx, points, line.averageForce, maxForce);
    }
  }

  ctx.restore();
}

function drawMicroscopeBackdrop(ctx, width, height) {
  const base = ctx.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, "#263737");
  base.addColorStop(0.42, "#617071");
  base.addColorStop(1, "#1f2a2c");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(
    width * 0.48,
    height * 0.42,
    Math.min(width, height) * 0.08,
    width * 0.5,
    height * 0.48,
    Math.max(width, height) * 0.72
  );
  glow.addColorStop(0, "rgba(235, 255, 247, 0.26)");
  glow.addColorStop(0.55, "rgba(119, 179, 172, 0.10)");
  glow.addColorStop(1, "rgba(5, 11, 13, 0.22)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
}

function drawLiquidDepthLayer(ctx, width, height) {
  const now = performance.now() * 0.00012;
  ctx.save();
  ctx.globalCompositeOperation = "screen";

  for (let i = 0; i < 9; i++) {
    const seed = i + 1;
    const x = ((Math.sin(seed * 8.31 + now * (1.4 + seed * 0.09)) * 0.5 + 0.5) * width);
    const y = ((Math.cos(seed * 5.77 - now * (1.1 + seed * 0.11)) * 0.5 + 0.5) * height);
    const radius = Math.min(width, height) * (0.08 + (seed % 4) * 0.018);
    const haze = ctx.createRadialGradient(x, y, 0, x, y, radius);
    haze.addColorStop(0, "rgba(210, 255, 242, 0.055)");
    haze.addColorStop(0.5, "rgba(115, 213, 201, 0.026)");
    haze.addColorStop(1, "rgba(115, 213, 201, 0)");
    ctx.fillStyle = haze;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = "rgba(236, 255, 250, 0.032)";
  ctx.lineWidth = Math.max(1, Math.min(width, height) * 0.0014);
  for (let i = 0; i < 7; i++) {
    const y = height * (0.14 + i * 0.13) + Math.sin(now * 9 + i) * 9;
    ctx.beginPath();
    ctx.moveTo(-width * 0.05, y);
    ctx.bezierCurveTo(
      width * 0.22,
      y + Math.sin(now * 14 + i) * 18,
      width * 0.68,
      y - Math.cos(now * 11 + i) * 20,
      width * 1.05,
      y + Math.sin(now * 7 + i) * 14
    );
    ctx.stroke();
  }

  ctx.restore();
}

function drawFloatingSpecimenDust(ctx, width, height) {
  const now = performance.now() * 0.00006;
  const count = Math.max(28, Math.min(86, Math.round((width * height) / 36000)));

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < count; i++) {
    const seed = i + 1;
    const baseX = ((seed * 0.61803398875) % 1) * width;
    const baseY = ((seed * 0.75487766625) % 1) * height;
    const driftX = Math.sin(now * (32 + (seed % 9)) + seed * 2.1) * 10;
    const driftY = Math.cos(now * (24 + (seed % 7)) + seed * 1.7) * 8;
    const x = (baseX + driftX + width) % width;
    const y = (baseY + driftY + height) % height;
    const radius = 0.55 + (seed % 5) * 0.22;
    const alpha = 0.035 + (seed % 4) * 0.012;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(236, 255, 247, ${alpha})`;
    ctx.fill();
  }
  ctx.restore();
}

function drawMicroscopeGlassOverlay(ctx, width, height) {
  ctx.save();

  const vignette = ctx.createRadialGradient(
    width * 0.5,
    height * 0.48,
    Math.min(width, height) * 0.32,
    width * 0.5,
    height * 0.5,
    Math.max(width, height) * 0.72
  );
  vignette.addColorStop(0, "rgba(255, 255, 255, 0)");
  vignette.addColorStop(0.74, "rgba(6, 16, 18, 0.06)");
  vignette.addColorStop(1, "rgba(2, 7, 9, 0.34)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  ctx.globalCompositeOperation = "screen";
  const lens = ctx.createRadialGradient(
    width * 0.36,
    height * 0.28,
    0,
    width * 0.36,
    height * 0.28,
    Math.min(width, height) * 0.55
  );
  lens.addColorStop(0, "rgba(255, 255, 255, 0.055)");
  lens.addColorStop(0.45, "rgba(166, 255, 236, 0.018)");
  lens.addColorStop(1, "rgba(166, 255, 236, 0)");
  ctx.fillStyle = lens;
  ctx.fillRect(0, 0, width, height);

  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = "rgba(230, 255, 250, 0.045)";
  ctx.lineWidth = Math.max(1, Math.min(width, height) * 0.001);
  for (let y = 0.5; y < height; y += 18) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawLevelDebugOverlay(ctx, bgRect, bounds = null) {
  ctx.save();

  if (bgRect) {
    ctx.strokeStyle = "rgba(130,255,243,0.95)";
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 6]);
    ctx.strokeRect(bgRect.x, bgRect.y, bgRect.width, bgRect.height);
    ctx.setLineDash([]);
    drawMarker(ctx, bgRect.x, bgRect.y, "rgba(255,210,120,0.95)", 7);
    drawMarker(ctx, bgRect.x + bgRect.width / 2, bgRect.y + bgRect.height / 2, "rgba(130,255,243,0.95)", 9);

    ctx.fillStyle = "rgba(7,13,15,0.82)";
    ctx.fillRect(bgRect.x + 10, bgRect.y + 10, 250, 58);
    ctx.strokeStyle = "rgba(130,255,243,0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(bgRect.x + 10, bgRect.y + 10, 250, 58);
    ctx.fillStyle = "rgba(230,248,245,0.96)";
    ctx.font = "12px monospace";
    ctx.fillText("LEVEL DEBUG OVERLAY", bgRect.x + 22, bgRect.y + 31);
    ctx.fillText(`bg: ${Math.round(bgRect.width)} x ${Math.round(bgRect.height)}`, bgRect.x + 22, bgRect.y + 51);
  }

  for (const obstacle of world.obstacles ?? []) {
    strokeCircle(ctx, obstacle.x, obstacle.y, obstacle.radius, "rgba(255,157,178,0.95)");
    drawMarker(ctx, obstacle.x, obstacle.y, "rgba(255,157,178,0.95)");
  }

  for (const zone of world.particleZones ?? []) {
    strokeCircle(ctx, zone.x, zone.y, zone.radius, "rgba(125,255,160,0.9)");
    drawMarker(ctx, zone.x, zone.y, "rgba(125,255,160,0.95)");
  }

  for (const stone of world.stones ?? []) {
    strokeCircle(ctx, stone.x, stone.y, stone.radius, "rgba(175,255,130,0.95)");
    drawMarker(ctx, stone.x, stone.y, "rgba(175,255,130,0.95)");
  }

  for (const entity of world.composedStones ?? []) {
    drawMarker(ctx, entity.x, entity.y, "rgba(255,210,120,0.95)");
    if (Array.isArray(entity.circles)) {
      for (const circle of entity.circles) {
        strokeCircle(ctx, entity.x + circle.dx, entity.y + circle.dy, circle.r, "rgba(255,210,120,0.9)");
      }
    }
  }

  for (const entity of world.algae ?? []) {
    drawMarker(ctx, entity.x, entity.y, "rgba(140,255,170,0.95)");
    const circles = typeof entity._getCircles === "function" ? entity._getCircles() : [];
    for (const circle of circles) {
      strokeCircle(ctx, circle.cx, circle.cy, circle.r, "rgba(140,255,170,0.86)");
    }
  }

  for (const entity of world.stentors ?? []) {
    drawMarker(ctx, entity.x, entity.y, "rgba(130,255,243,0.95)");
    if (Array.isArray(entity.bodyCircles)) {
      for (const circle of entity.bodyCircles) {
        strokeCircle(ctx, entity.x + circle.dx, entity.y + circle.dy, circle.r, "rgba(130,255,243,0.8)");
      }
    }
  }

  for (const entity of world.macrophages ?? []) {
    drawMarker(ctx, entity.x, entity.y, "rgba(210,140,255,0.95)");
    if (typeof entity._getBodyCircles === "function") {
      for (const circle of entity._getBodyCircles()) {
        strokeCircle(ctx, circle.cx, circle.cy, circle.r, "rgba(210,140,255,0.82)");
      }
    } else {
      strokeCircle(ctx, entity.x, entity.y, entity.radius, "rgba(210,140,255,0.82)");
    }
    if (typeof entity._mouthCircle === "function") {
      const mouth = entity._mouthCircle();
      if (mouth && Number.isFinite(mouth.x) && Number.isFinite(mouth.y) && Number.isFinite(mouth.r) && mouth.r > 0) {
        strokeCircle(ctx, mouth.x, mouth.y, mouth.r, "rgba(255, 244, 160, 0.92)", 1.5);
        drawMarker(ctx, mouth.x, mouth.y, "rgba(255, 244, 160, 0.98)", 5);
      }
    } else if (typeof entity._mouthPoint === "function" && typeof entity._mouthAbsorbRadius === "function") {
      const mouth = entity._mouthPoint();
      const absorbRadius = entity._mouthAbsorbRadius();
      if (mouth && Number.isFinite(mouth.x) && Number.isFinite(mouth.y) && Number.isFinite(absorbRadius) && absorbRadius > 0) {
        strokeCircle(ctx, mouth.x, mouth.y, absorbRadius, "rgba(255, 244, 160, 0.92)", 1.5);
        drawMarker(ctx, mouth.x, mouth.y, "rgba(255, 244, 160, 0.98)", 5);
      }
    }
  }

  for (const entity of world.enemies ?? []) {
    drawMarker(ctx, entity.x, entity.y, "rgba(255,132,66,0.95)");
    if (Array.isArray(entity.bodyCircles)) {
      const cos = Math.cos(entity.angle);
      const sin = Math.sin(entity.angle);
      for (const circle of entity.bodyCircles) {
        const cx = entity.x + circle.dx * cos - circle.dy * sin;
        const cy = entity.y + circle.dx * sin + circle.dy * cos;
        strokeCircle(ctx, cx, cy, circle.r, "rgba(255,132,66,0.82)");
      }
    } else {
      strokeCircle(ctx, entity.x, entity.y, entity.radius, "rgba(255,132,66,0.82)");
    }
  }

  if (world.player && !world.player.absorbed && !world.player.isCaptured?.()) {
    strokeCircle(ctx, world.player.x, world.player.y, world.player.radius, "rgba(92, 196, 255, 0.95)");
    drawMarker(ctx, world.player.x, world.player.y, "rgba(92, 196, 255, 0.98)", 8);
  }

  let particleDebugCount = 0;
  for (const entity of world.particles ?? []) {
    if (!entity || entity.absorbed || entity.isPlayer || entity.isProjectile) continue;
    drawMarker(ctx, entity.x, entity.y, "rgba(255,255,255,0.72)", 4);
    particleDebugCount += 1;
    if (particleDebugCount >= 24) break;
  }

  drawProjectileAlgaeFieldDebug(ctx, bounds);

  ctx.restore();
}

export function toggleLevelDebugOverlay(force) {
  world.debug.levelOverlay = typeof force === "boolean" ? force : !world.debug.levelOverlay;
  world.debug.enabled = world.debug.levelOverlay;
  return world.debug.levelOverlay;
}

export function toggleDebugMode(force) {
  const enabled = typeof force === "boolean" ? force : !world.debug.enabled;
  world.debug.enabled = enabled;
  world.debug.levelOverlay = enabled;
  return enabled;
}

export function drawWorld(ctx, viewport = null) {
  const viewRect = viewport?.viewRect ?? viewport ?? null;
  const worldBounds = viewport?.worldBounds ?? null;
  const sourceRect = viewport?.sourceRect ?? null;
  const renderWidth = Math.max(1, Math.round(viewRect?.width ?? ctx.canvas.width));
  const renderHeight = Math.max(1, Math.round(viewRect?.height ?? ctx.canvas.height));
  const offsetX = Math.round(viewRect?.x ?? 0);
  const offsetY = Math.round(viewRect?.y ?? 0);
  const worldWidth = Math.max(1, Number(worldBounds?.width ?? renderWidth));
  const worldHeight = Math.max(1, Number(worldBounds?.height ?? renderHeight));
  const cameraX = Number(sourceRect?.x ?? 0) || 0;
  const cameraY = Number(sourceRect?.y ?? 0) || 0;
  const cameraWidth = Math.max(1, Number(sourceRect?.width ?? worldWidth));
  const cameraHeight = Math.max(1, Number(sourceRect?.height ?? worldHeight));
  const scaleX = renderWidth / cameraWidth;
  const scaleY = renderHeight / cameraHeight;

  ctx.save();
  if (viewRect) {
    ctx.translate(offsetX, offsetY);
    ctx.beginPath();
    ctx.rect(0, 0, renderWidth, renderHeight);
    ctx.clip();
  }
  if (viewRect && worldBounds) {
    ctx.scale(scaleX, scaleY);
    ctx.translate(-cameraX, -cameraY);
  }

  const bg = world.background;
  const bgRect = getBackgroundDrawRect(bg, { width: worldWidth, height: worldHeight });
  drawMicroscopeBackdrop(ctx, worldWidth, worldHeight);

  if (bg?.image && bgRect) {
    ctx.drawImage(
      bg.image,
      bgRect.x,
      bgRect.y,
      bgRect.width,
      bgRect.height
    );
  }
  drawLiquidDepthLayer(ctx, worldWidth, worldHeight);

  const activeSplitOldbodies = new Set(
    [world.player?.splitOldbody, world.player?.emergingFromOldbody].filter(Boolean)
  );

  const drawGroups = [
    world.obstacles,
    world.stones,
    world.composedStones,
    world.algae,
    world.composedEntities,
    world.oldbodies,
    world.eggs,
    world.particles,
    world.macrophages,
    world.stentors,
    world.enemies
  ];

  for (const group of drawGroups) {
    for (const entity of group ?? []) {
      if (group === world.oldbodies && activeSplitOldbodies.has(entity)) {
        entity.draw(ctx, { skipOverlay: true });
      } else {
        entity.draw(ctx);
      }
    }
  }

  for (const oldbody of activeSplitOldbodies) {
    if (oldbody && typeof oldbody.drawOverlay === "function") {
      oldbody.drawOverlay(ctx);
    }
  }

  drawFloatingSpecimenDust(ctx, worldWidth, worldHeight);
  drawMicroscopeGlassOverlay(ctx, worldWidth, worldHeight);

  if (world.debug?.enabled || world.debug?.levelOverlay) {
    drawLevelDebugOverlay(ctx, bgRect, {
      width: worldWidth,
      height: worldHeight,
      viewX: cameraX,
      viewY: cameraY,
      viewWidth: cameraWidth,
      viewHeight: cameraHeight
    });
  }

  ctx.restore();
}
