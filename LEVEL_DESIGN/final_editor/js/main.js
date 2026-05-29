import { ENTITY_TYPES, INDEXED_TYPES } from './entities/index.js';
import { STENTOR_PRESETS, setStentorPresets } from './core/presets.js';
import { makeDefaultStentorMouth, makeDefaultStentorBodyRotation } from './entities/StentorEntity.js';
import {
  PLAYER_COLLISION_TARGETS,
  normalizePlayerCollisionProfile
} from '../../../playerCollisionProfile.js';

let entities = [];
let selectedId = null;
let selectedIds = [];
let selectedComposedEntityInstanceId = null;
let activeTool = 'select';
let dragState = null;
let hoverResize = false;
let hoverStentorHandle = null;
let hoverEnemyAnatomyHandle = null;
let hoverInnerArtifactHandle = null;
let idCounter = 1;
let randSizeEnabled = false;
let randMin = 8;
let randMax = 40;
let backgroundImage = null;
let backgroundImageSrc = '';
let backgroundImageName = '';
let backgroundImageAlpha = 0.55;
let backgroundEditMode = false;
let backgroundOffsetX = 0;
let backgroundOffsetY = 0;
let backgroundScale = 1;
const GRID_SIZE = 40;
const INITIAL_VIEW_PADDING_RATIO = 0.2;
let snapToGrid = false;
let mousePos = { x: 0, y: 0, inside: false };
const activeIndex = { Stentor: 1, Stone: 1, ComposedStone: 1, Obstacle: 1, Enemy: 1, Macrophage: 1, Algae: 1 };
const PRESET_PANEL_TYPES = [...INDEXED_TYPES, 'ComposedEntity'];
let activeStentorPreset = 'standard';
let projectRootHandle = null;
let projectDirHandle = null;
let entitiesDirHandle = null;
let levelsDirHandle = null;
let srcDirHandle = null;
let enemyAnatomyOverlay = true;
let macrophageMouthOverlay = true;
let macrophageBodyOverlay = true;
let selectedMacrophageOrbitSegmentIdx = 0;
let selectedMacrophageOrbitSplinePointIdx = 0;
let entityPresetsByType = { Enemy: [], Macrophage: [], Stone: [], ComposedStone: [], Obstacle: [], Algae: [], ComposedEntity: [] };
let activeEntityPreset = { Enemy: null, Macrophage: null, Stone: null, ComposedStone: null, Obstacle: null, Algae: null, ComposedEntity: null };
let spriteCalState = null;
let spriteCalDrag = null;
let animationFrameHandle = null;
let sceneResizeLocked = false;
let pendingSaveRecoverySnapshot = null;
let pendingSaveRecoveryLabel = '';
const collapsedPropSections = new Map();
const editorSpriteCache = new Map();
const editorImageLoadCache = new Map();
let editorSceneAssetsReady = false;
let editorSceneAssetKey = '';
let editorSceneAssetPromise = null;
let importedLevelGeometry = null;
const PRESET_SOURCE_ROOT = '../../../src';
const AUTO_PRESET_SCAN_LIMIT = 24;
const LEVELS_DIR_LABEL = 'LEVELS';
const PROJECT_ROOT_LABEL = 'microscopic.game';
const HANDLE_DB_NAME = 'microscopic-level-editor';
const HANDLE_STORE_NAME = 'handles';
const PROJECT_ROOT_HANDLE_KEY = 'project-root';
const EDITOR_DRAFT_STORAGE_KEY = 'microscopic-level-editor-draft';
const EDITOR_DRAFT_FULL_KEY = 'editor-draft-full';
const SRC_PRESET_CONFIGS = {
  Enemy: { entityType: 'Enemy', folder: 'Enemy', folderPrefix: 'Enemy_', jsonPrefix: 'enemy_' },
  Macrophage: { entityType: 'Macrophage', folder: 'Macrophage', folderPrefix: 'Macrophage_', jsonPrefix: 'macrophage_' },
  Stone: { entityType: 'Stone', folder: 'Stone', folderPrefix: 'Stone_', jsonPrefix: 'stone_' },
  ComposedStone: { entityType: 'ComposedStone', folder: 'CompoundStone', folderPrefix: 'CompoundStone_', jsonPrefix: 'compoundstone_' },
  Algae: { entityType: 'Algae', folder: 'Algae', folderPrefix: 'Algae_', jsonPrefix: 'algae_' },
  Obstacle: { entityType: 'Obstacle', folder: 'Obstacle', folderPrefix: 'Obstacle_', jsonPrefix: 'obstacle_' }
};

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const wrap = document.getElementById('canvas-wrap');
const toolBtns = document.getElementById('tool-btns');
const propsPanel = document.getElementById('props-content');
const spriteCalCanvas = document.getElementById('sprite-cal-canvas');
const spriteCalCtx = spriteCalCanvas.getContext('2d');
const ENEMY_SPRITE_INDEX_MAX = 999;
const CYST_DEFAULT_RADIUS = 21;
const CYST_DEFAULT_ALPHA = 0.82;

function getEntityType(id) { return ENTITY_TYPES.find(e => e.id === id); }
function snap(v) { return snapToGrid ? Math.round(v / GRID_SIZE) * GRID_SIZE : v; }
function safeRound(v) { return Math.round(Number(v) || 0); }
function getEditorEntityLocalExtents(entity) {
  if (!entity) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  if (entity.type === 'ComposedEntity') {
    const width = Math.max(1, clampNum(entity.width, entity.bounds?.width ?? 80));
    const height = Math.max(1, clampNum(entity.height, entity.bounds?.height ?? 80));
    return { minX: 0, minY: 0, maxX: width, maxY: height };
  }

  const circles = Array.isArray(entity.bodyCircles) && entity.bodyCircles.length
    ? entity.bodyCircles
    : (Array.isArray(entity.circles) && entity.circles.length ? entity.circles : null);

  if (circles) {
    return circles.reduce((extents, circle) => {
      const dx = clampNum(circle.dx, 0);
      const dy = clampNum(circle.dy, 0);
      const r = Math.max(0, clampNum(circle.r, entity.radius ?? 0));
      return {
        minX: Math.min(extents.minX, dx - r),
        minY: Math.min(extents.minY, dy - r),
        maxX: Math.max(extents.maxX, dx + r),
        maxY: Math.max(extents.maxY, dy + r)
      };
    }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  }

  const radius = Math.max(0, clampNum(entity.displayRadius ?? entity.radius, 0));
  return { minX: -radius, minY: -radius, maxX: radius, maxY: radius };
}
function clampEditorEntityInsideCanvas(entity) {
  if (!entity || !(canvas.width > 0) || !(canvas.height > 0)) return;
  const extents = getEditorEntityLocalExtents(entity);
  const width = extents.maxX - extents.minX;
  const height = extents.maxY - extents.minY;

  if (width >= canvas.width) entity.x = (canvas.width - extents.minX - extents.maxX) * 0.5;
  else entity.x = Math.min(Math.max(entity.x, -extents.minX), canvas.width - extents.maxX);

  if (height >= canvas.height) entity.y = (canvas.height - extents.minY - extents.maxY) * 0.5;
  else entity.y = Math.min(Math.max(entity.y, -extents.minY), canvas.height - extents.maxY);
}
function clampEditorEntitiesInsideCanvas(items = entities) {
  for (const entity of items ?? []) clampEditorEntityInsideCanvas(entity);
}
function syncSelectionState() {
  const validIds = new Set(entities.map(entity => entity._id));
  selectedIds = selectedIds.filter((id, idx) => validIds.has(id) && selectedIds.indexOf(id) === idx);
  if (selectedId != null && validIds.has(selectedId) && !selectedIds.includes(selectedId)) selectedIds.push(selectedId);
  if (!selectedIds.length) selectedId = null;
  else if (selectedId == null || !selectedIds.includes(selectedId)) selectedId = selectedIds[selectedIds.length - 1];
}
function getSelected() { syncSelectionState(); return entities.find(e => e._id === selectedId) ?? null; }
function getSelectedEntities() {
  syncSelectionState();
  if (!selectedIds.length) return [];
  const ids = new Set(selectedIds);
  return entities.filter(entity => ids.has(entity._id));
}
function getSelectedComposedEntityInstance() {
  if (!selectedComposedEntityInstanceId) return null;
  const instances = getComposedEntityInstances();
  return instances.find(instance => instance.id === selectedComposedEntityInstanceId) ?? null;
}
function isEntitySelected(entityOrId) {
  syncSelectionState();
  const id = typeof entityOrId === 'object' ? entityOrId?._id : entityOrId;
  return id != null && selectedIds.includes(id);
}
function clearSelection() {
  selectedId = null;
  selectedIds = [];
  selectedComposedEntityInstanceId = null;
}
function setSingleSelection(entityOrId) {
  const id = typeof entityOrId === 'object' ? entityOrId?._id : entityOrId;
  if (id == null) return clearSelection();
  selectedId = id;
  selectedIds = [id];
  selectedComposedEntityInstanceId = null;
}
function addSelection(entityOrId) {
  const id = typeof entityOrId === 'object' ? entityOrId?._id : entityOrId;
  if (id == null) return;
  if (!selectedIds.includes(id)) selectedIds.push(id);
  selectedId = id;
}
function removeSelection(entityOrId) {
  const id = typeof entityOrId === 'object' ? entityOrId?._id : entityOrId;
  if (id == null) return;
  selectedIds = selectedIds.filter(selected => selected !== id);
  if (selectedId === id) selectedId = selectedIds[selectedIds.length - 1] ?? null;
}
function toggleSelection(entityOrId) {
  const id = typeof entityOrId === 'object' ? entityOrId?._id : entityOrId;
  if (id == null) return;
  if (selectedIds.includes(id)) removeSelection(id);
  else addSelection(id);
  selectedComposedEntityInstanceId = null;
}
function isMultiCircleEntity(entity) { return entity?.type === 'Stentor' || entity?.type === 'ComposedStone' || entity?.type === 'Algae'; }
function hasBodyCircleEditor(entity) { return entity?.type === 'Enemy' || entity?.type === 'Macrophage'; }
function getPlayerEntity() { return entities.find(e => e.type === 'Player') ?? null; }

function makeDefaultEnemyBodyCircles(radius) {
  const r = Math.max(5, Math.round(radius || 25));
  return [{ dx: 0, dy: 0, r }];
}

function makeDefaultMacrophageBodyCircles(radius) {
  const r = Math.max(5, Math.round(radius || 38));
  return [
    { dx: 0, dy: 0, r },
    { dx: Math.round(-r * 0.52), dy: Math.round(r * 0.18), r: Math.max(5, Math.round(r * 0.56)) },
    { dx: Math.round(r * 0.5), dy: Math.round(r * 0.24), r: Math.max(5, Math.round(r * 0.52)) },
    { dx: 0, dy: Math.round(r * 0.7), r: Math.max(5, Math.round(r * 0.46)) }
  ];
}

function makeDefaultMacrophageDigestPath(radius, mouthOffsetDistance = null) {
  const r = Math.max(5, Number(radius) || 38);
  const mouthDist = Math.max(r * 0.82, Number(mouthOffsetDistance) || r);
  return {
    start: { dx: mouthDist * 0.82, dy: 0 },
    c1: { dx: r * 0.18, dy: r * 0.34 },
    c2: { dx: -r * 0.24, dy: r * 0.18 },
    end: { dx: -r * 0.58, dy: 0 }
  };
}

function makeDefaultMacrophageMouthCilia() {
  return {
    enabled: true,
    count: 22,
    lengthScale: 0.2,
    waveAmount: 0.55,
    waveSpeed: 0.003,
    curl: 0.1,
    lineWidth: 1.3,
    alpha: 1,
    arcEnabled: false,
    arcCenterDeg: 0,
    arcSpreadDeg: 120
  };
}

function makeDefaultMacrophageBodyCilia() {
  return {
    enabled: false,
    count: 96,
    lengthScale: 0.16,
    waveAmount: 0.55,
    waveSpeed: 0.0025,
    curl: 0.08,
    lineWidth: 1.1,
    alpha: 0.82,
    splineOffset: 3,
    splineSamples: 96,
    segments: [{ enabled: true, start: 0, end: 1 }]
  };
}

function compareMacrophageDigestControlKeys(a, b) {
  const ai = Number(String(a).slice(1)) || 0;
  const bi = Number(String(b).slice(1)) || 0;
  return ai - bi;
}

function getMacrophageDigestPathPointKeys(path) {
  const controlKeys = Object.keys(path ?? {})
    .filter(key => /^c\d+$/.test(key))
    .sort(compareMacrophageDigestControlKeys);
  return ['start', ...controlKeys, 'end'];
}

function getMacrophageDigestControlKeys(path) {
  return getMacrophageDigestPathPointKeys(path).filter(key => key !== 'start' && key !== 'end');
}

function getMacrophageDigestBezierPoint(points, t) {
  const safePoints = Array.isArray(points) ? points.filter(Boolean) : [];
  if (safePoints.length === 0) return { x: 0, y: 0 };
  if (safePoints.length === 1) return { x: safePoints[0].x, y: safePoints[0].y };
  let current = safePoints.map(point => ({ x: point.x, y: point.y }));
  const clampedT = Math.max(0, Math.min(1, Number(t) || 0));
  while (current.length > 1) {
    const next = [];
    for (let i = 0; i < current.length - 1; i++) {
      next.push({
        x: current[i].x + (current[i + 1].x - current[i].x) * clampedT,
        y: current[i].y + (current[i + 1].y - current[i].y) * clampedT
      });
    }
    current = next;
  }
  return current[0];
}

function makeDefaultMacrophageBodyRotation() {
  return {
    enabled: false,
    idleSpin: 0,
    idleWave: {
      enabled: false,
      amount: 0.35,
      speedHz: 0.45
    },
    rotationMode: 'pingpong',
    rotationDir: 1,
    baseAngleDeg: 0,
    rotationRange: [-12, 12],
    movementFollow: {
      enabled: false,
      strength: 0.35,
      smoothing: 0.08,
      minSpeed: 0.18
    },
    pivotDx: 0,
    pivotDy: 0,
    pivotRadius: 12
  };
}

function normalizeMacrophageBodyRotationRange(range, baseAngleDeg = 0, fallback = [-12, 12]) {
  const source = Array.isArray(range) && range.length === 2 ? range : fallback;
  let a = Number(source[0]);
  let b = Number(source[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    a = fallback[0];
    b = fallback[1];
  }
  a = clampNum(a, fallback[0]);
  b = clampNum(b, fallback[1]);
  if (a > b) [a, b] = [b, a];
  const base = normalizeSignedDeg(clampNum(baseAngleDeg, 0));
  const crossesZero = a <= 0 && b >= 0;
  if (Math.abs(base) > 0.0001 && !crossesZero && Math.sign(a || 0) === Math.sign(b || 0)) {
    const mid = (a + b) * 0.5;
    a = clampNum(a - mid, fallback[0]);
    b = clampNum(b - mid, fallback[1]);
    if (a > b) [a, b] = [b, a];
  }
  return [a, b];
}

function makeDefaultMacrophageOrbit() {
  return {
    enabled: false,
    mode: 'orbit',
    centerDx: 0,
    centerDy: 0,
    radius: 0,
    speed: 0.01,
    loop: true,
    segments: [],
    splinePoints: [],
    freeMove: {
      directionDeg: 0,
      spreadDeg: 70,
      previewRadius: 140,
      impulse: 0.55,
      intervalMs: 1200,
      intervalMinMs: 1200,
      intervalMaxMs: 1200,
      turnAngleMinDeg: 0,
      turnAngleMaxDeg: 0,
      velocityDamping: 0.965,
      maxSpeed: 1.4
    }
  };
}

function makeDefaultMacrophageOrbitSplinePoints(radius = 140, count = 4) {
  const safeRadius = Math.max(24, clampNum(radius, 140));
  const safeCount = Math.max(4, Math.round(clampNum(count, 4)));
  return Array.from({ length: safeCount }, (_, idx) => {
    const angle = (idx / safeCount) * Math.PI * 2 - Math.PI * 0.5;
    return {
      dx: Math.cos(angle) * safeRadius,
      dy: Math.sin(angle) * safeRadius
    };
  });
}

function makeDefaultMacrophageOrbitSegment(base = {}) {
  return {
    centerDx: clampNum(base.centerDx, 0),
    centerDy: clampNum(base.centerDy, 0),
    radius: Math.max(0, clampNum(base.radius, 140)),
    startDeg: clampNum(base.startDeg, 0),
    endDeg: clampNum(base.endDeg, 120),
    speed: clampNum(base.speed, 0.01)
  };
}

function makeDefaultMacrophageFreeMove(base = {}) {
  const baseIntervalMs = Math.max(0, Math.round(clampNum(base.intervalMs, 1200)));
  const intervalMinMs = Math.max(0, Math.round(clampNum(base.intervalMinMs, baseIntervalMs)));
  const intervalMaxMs = Math.max(intervalMinMs, Math.round(clampNum(base.intervalMaxMs, Math.max(intervalMinMs, baseIntervalMs))));
  const turnAngleMinDeg = Math.max(0, clampNum(base.turnAngleMinDeg, 0));
  const turnAngleMaxDeg = Math.max(turnAngleMinDeg, clampNum(base.turnAngleMaxDeg, Math.max(turnAngleMinDeg, 0)));
  return {
    directionDeg: normalizeSignedDeg(clampNum(base.directionDeg, 0)),
    spreadDeg: Math.max(0, clampNum(base.spreadDeg, 70)),
    previewRadius: Math.max(12, clampNum(base.previewRadius, 140)),
    impulse: Math.max(0, clampNum(base.impulse, 0.55)),
    intervalMs: baseIntervalMs,
    intervalMinMs,
    intervalMaxMs,
    turnAngleMinDeg,
    turnAngleMaxDeg,
    velocityDamping: Math.max(0, Math.min(0.9999, clampNum(base.velocityDamping, 0.965))),
    maxSpeed: Math.max(0, clampNum(base.maxSpeed, 1.4))
  };
}

function makeDefaultMacrophageAbsorbTargets() {
  return {
    particle: true,
    projectile: false,
    player: false,
    enemy: false
  };
}

function makeDefaultMacrophageEggSpawn() {
  return {
    bodyCircleIndex: 1,
    angleDeg: 25,
    feedCount: 6
  };
}

function makeDefaultMacrophageGermination() {
  return {
    enabled: false,
    bodyCircleIndex: 2,
    angleDeg: -30,
    feedCount: 10,
    startScale: 0.34,
    growthRate: 0.08,
    detachScale: 0.6,
    launchSpeed: 0.35,
    mirrorOffspringX: false,
    launchJitter: 0.18,
    initialAngleJitterDeg: 8,
    mouthWakeDelayMs: 260
  };
}

function makeDefaultMacrophageProjectileSpawn() {
  return {
    bodyCircleIndex: 0,
    angleDeg: 180
  };
}

function makeDefaultMacrophageGrowth() {
  return {
    enabled: false,
    perAbsorb: 0.6,
    maxRadius: 76,
    growthRate: 0.03
  };
}

function makeDefaultComposedStoneCircles(radius) {
  const r = Math.max(5, Math.round(radius || 34));
  return [
    { dx: 0, dy: 0, r },
    { dx: Math.round(r * 0.82), dy: Math.round(r * 0.24), r: Math.max(5, Math.round(r * 0.65)) },
    { dx: Math.round(-r * 0.65), dy: Math.round(r * 0.53), r: Math.max(5, Math.round(r * 0.53)) }
  ];
}

function makeDefaultAlgaeCircles(radius) {
  const r = Math.max(5, Math.round(radius || 30));
  return [
    { dx: 0, dy: 0, r },
    { dx: Math.round(r * 0.74), dy: Math.round(-r * 0.2), r: Math.max(5, Math.round(r * 0.57)) },
    { dx: Math.round(-r * 0.6), dy: Math.round(r * 0.47), r: Math.max(5, Math.round(r * 0.5)) },
    { dx: Math.round(r * 0.34), dy: Math.round(r * 0.74), r: Math.max(5, Math.round(r * 0.4)) }
  ];
}

function makeDefaultAlgaeGermination() {
  return {
    enabled: false,
    bodyCircleIndex: 2,
    angleDeg: -30,
    feedCount: 10,
    startScale: 0.34,
    growthRate: 0.08,
    detachScale: 0.6,
    launchSpeed: 0.35,
    mirrorOffspringX: false,
    launchJitter: 0.18,
    initialAngleJitterDeg: 8
  };
}

function getComposedStoneMetrics(entity, circles = entity?.circles ?? []) {
  const safeCircles = Array.isArray(circles) && circles.length ? circles : makeDefaultComposedStoneCircles(entity?.radius ?? 34);
  const primaryCircle = safeCircles[0] ?? { r: entity?.radius ?? 34 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let boundingRadius = 0;

  for (const circle of safeCircles) {
    const dx = clampNum(circle.dx, 0);
    const dy = clampNum(circle.dy, 0);
    const r = Math.max(2, clampNum(circle.r, entity?.radius ?? 34));
    minX = Math.min(minX, dx - r);
    minY = Math.min(minY, dy - r);
    maxX = Math.max(maxX, dx + r);
    maxY = Math.max(maxY, dy + r);
    boundingRadius = Math.max(boundingRadius, Math.hypot(dx, dy) + r);
  }

  return {
    circles: safeCircles,
    primaryRadius: Math.max(2, clampNum(primaryCircle.r, entity?.radius ?? 34)),
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    boundingRadius: Math.max(2, boundingRadius)
  };
}

function getComposedStoneSpriteReferenceRadius(entity) {
  if (!entity) return 34;
  const metrics = getComposedStoneMetrics(entity, entity.circles);
  return Math.max(2, clampNum(entity.spriteReferenceRadius, metrics.primaryRadius));
}

function getAlgaeMetrics(entity, circles = entity?.circles ?? []) {
  const safeEntity = entity ? { ...entity, radius: entity.radius ?? 30 } : { radius: 30 };
  const safeCircles = Array.isArray(circles) && circles.length ? circles : makeDefaultAlgaeCircles(safeEntity.radius);
  return getComposedStoneMetrics(safeEntity, safeCircles);
}

function getAlgaeSpriteReferenceRadius(entity) {
  if (!entity) return 30;
  const metrics = getAlgaeMetrics(entity, entity.circles);
  return Math.max(2, clampNum(entity.spriteReferenceRadius, metrics.primaryRadius));
}

function computeComposedEntityMetrics(entity) {
  const width = Math.max(1, clampNum(entity?.width, entity?.bounds?.width ?? 80));
  const height = Math.max(1, clampNum(entity?.height, entity?.bounds?.height ?? 80));
  return {
    width,
    height,
    centerX: (entity?.x ?? 0) + width * 0.5,
    centerY: (entity?.y ?? 0) + height * 0.5,
    radius: Math.max(8, Math.hypot(width * 0.5, height * 0.5))
  };
}

function getEntityBoundingBox(entity) {
  if (!entity) return null;
  if (entity.type === 'ComposedEntity') {
    ensureComposedEntityDefaults(entity);
    return { minX: entity.x, minY: entity.y, maxX: entity.x + entity.width, maxY: entity.y + entity.height };
  }
  if (isMultiCircleEntity(entity) && Array.isArray(entity.circles) && entity.circles.length) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const circle of entity.circles) {
      const cx = entity.x + clampNum(circle.dx, 0);
      const cy = entity.y + clampNum(circle.dy, 0);
      const r = Math.max(2, clampNum(circle.r, entity.radius ?? 8));
      minX = Math.min(minX, cx - r);
      minY = Math.min(minY, cy - r);
      maxX = Math.max(maxX, cx + r);
      maxY = Math.max(maxY, cy + r);
    }
    return { minX, minY, maxX, maxY };
  }
  if (hasBodyCircleEditor(entity) && Array.isArray(entity.bodyCircles) && entity.bodyCircles.length) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < entity.bodyCircles.length; i++) {
      const c = getBodyCircleAbs(entity, i);
      minX = Math.min(minX, c.x - c.r);
      minY = Math.min(minY, c.y - c.r);
      maxX = Math.max(maxX, c.x + c.r);
      maxY = Math.max(maxY, c.y + c.r);
    }
    return { minX, minY, maxX, maxY };
  }
  const r = Math.max(2, clampNum(entity.radius, 8));
  return { minX: entity.x - r, minY: entity.y - r, maxX: entity.x + r, maxY: entity.y + r };
}

function getComposedEntityInstances() {
  const grouped = new Map();
  for (const entity of entities) {
    const instanceId = entity?._composedEntityInstanceId;
    if (!instanceId) continue;
    if (!grouped.has(instanceId)) {
      grouped.set(instanceId, {
        id: instanceId,
        name: entity._composedEntityName ?? 'ComposedEntity',
        presetId: entity._composedEntityPresetId ?? null,
        sourcePath: entity._composedEntitySourcePath ?? null,
        entityIds: [],
        entities: [],
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity
      });
    }
    const group = grouped.get(instanceId);
    group.entityIds.push(entity._id);
    group.entities.push(entity);
    const bounds = getEntityBoundingBox(entity);
    if (!bounds) continue;
    group.minX = Math.min(group.minX, bounds.minX);
    group.minY = Math.min(group.minY, bounds.minY);
    group.maxX = Math.max(group.maxX, bounds.maxX);
    group.maxY = Math.max(group.maxY, bounds.maxY);
  }
  return Array.from(grouped.values())
    .filter(group => Number.isFinite(group.minX) && Number.isFinite(group.minY) && Number.isFinite(group.maxX) && Number.isFinite(group.maxY))
    .map(group => ({
      ...group,
      width: group.maxX - group.minX,
      height: group.maxY - group.minY
    }));
}

function findComposedEntityPresetForInstance(instance) {
  if (!instance) return null;
  return entityPresetsByType.ComposedEntity?.find(p =>
    (instance.presetId && p.id === instance.presetId) ||
    (instance.sourcePath && p.sourcePath === instance.sourcePath) ||
    (instance.name && p.name === instance.name)
  ) ?? null;
}

function getComposedEntityRuntimeAnchor(instance, presetData = null) {
  const children = Array.isArray(presetData?.entities) ? presetData.entities : [];
  const entitiesForAnchor = Array.isArray(instance?.entities) ? instance.entities : [];
  const anchorCandidates = [];

  for (let i = 0; i < Math.min(children.length, entitiesForAnchor.length); i++) {
    const child = children[i];
    const entity = entitiesForAnchor[i];
    const ax = Number(entity?.x) - Number(child?.offsetX ?? 0);
    const ay = Number(entity?.y) - Number(child?.offsetY ?? 0);
    if (Number.isFinite(ax) && Number.isFinite(ay)) {
      anchorCandidates.push({ x: ax, y: ay });
    }
  }

  if (anchorCandidates.length) {
    const sum = anchorCandidates.reduce((acc, point) => ({
      x: acc.x + point.x,
      y: acc.y + point.y
    }), { x: 0, y: 0 });
    return {
      x: sum.x / anchorCandidates.length,
      y: sum.y / anchorCandidates.length
    };
  }

  return {
    x: Number.isFinite(Number(instance?.minX)) ? Number(instance.minX) : 0,
    y: Number.isFinite(Number(instance?.minY)) ? Number(instance.minY) : 0
  };
}

function buildComposedEntityRuntimeExport(instance, referenceRect) {
  const preset = findComposedEntityPresetForInstance(instance);
  const presetData = preset?.data ?? null;
  if (!presetData) return null;

  ensureComposedEntityDefaults(presetData);
  const anchor = getComposedEntityRuntimeAnchor(instance, presetData);
  const pointNorm = normalizePointToRect(anchor.x, anchor.y, referenceRect);

  return {
    version: 1,
    type: 'ComposedEntity',
    runtimeOnly: true,
    name: presetData.name ?? instance.name ?? 'ComposedEntity',
    sourcePath: preset.sourcePath ?? instance.sourcePath ?? null,
    spriteIndex: presetData.spriteIndex,
    spriteSubfolder: presetData.spriteSubfolder,
    spriteScale: presetData.spriteScale,
    spriteRotationOffset: presetData.spriteRotationOffset,
    spriteBodyU: presetData.spriteBodyU,
    spriteBodyV: presetData.spriteBodyV,
    spriteFlipX: !!presetData.spriteFlipX,
    spriteReferenceRadius: presetData.spriteReferenceRadius,
    spriteDebug: !!presetData.spriteDebug,
    width: presetData.width ?? instance.width ?? 0,
    height: presetData.height ?? instance.height ?? 0,
    radius: presetData.radius ?? Math.max(instance.width ?? 0, instance.height ?? 0) * 0.5,
    x: anchor.x,
    y: anchor.y,
    xNorm: parseFloat((anchor.x / canvas.width).toFixed(5)),
    yNorm: parseFloat((anchor.y / canvas.height).toFixed(5)),
    xBgNorm: pointNorm.x,
    yBgNorm: pointNorm.y
  };
}

function buildComposedEntityEditorSpriteEntity(instance) {
  if (!instance) return null;
  const preset = findComposedEntityPresetForInstance(instance);
  const presetData = preset?.data ?? null;
  if (!presetData) return null;

  ensureComposedEntityDefaults(presetData);
  const anchor = getComposedEntityRuntimeAnchor(instance, presetData);
  return {
    ...structuredClone(presetData),
    type: 'ComposedEntity',
    runtimeOnly: true,
    x: anchor.x,
    y: anchor.y
  };
}

function setComposedEntitySelection(instance) {
  if (!instance) return clearSelection();
  selectedComposedEntityInstanceId = instance.id;
  selectedIds = [...instance.entityIds];
  selectedId = selectedIds[selectedIds.length - 1] ?? null;
}

function hitTestComposedEntityInstance(mx, my) {
  const tolerance = 8;
  for (const instance of getComposedEntityInstances().slice().reverse()) {
    const inHorizontal = mx >= instance.minX - tolerance && mx <= instance.maxX + tolerance;
    const inVertical = my >= instance.minY - tolerance && my <= instance.maxY + tolerance;
    const nearLeft = Math.abs(mx - instance.minX) <= tolerance && inVertical;
    const nearRight = Math.abs(mx - instance.maxX) <= tolerance && inVertical;
    const nearTop = Math.abs(my - instance.minY) <= tolerance && inHorizontal;
    const nearBottom = Math.abs(my - instance.maxY) <= tolerance && inHorizontal;
    const onLabel = mx >= instance.minX && mx <= instance.maxX && my >= instance.minY - 20 && my <= instance.minY + 4;
    if (nearLeft || nearRight || nearTop || nearBottom || onLabel) return instance;
  }
  return null;
}

function getComposedEntitySpriteFolderName(entity, preferredSubfolder = null) {
  const explicit = typeof preferredSubfolder === 'string' ? preferredSubfolder.trim() : '';
  if (explicit) return explicit;
  const own = typeof entity?.spriteSubfolder === 'string' ? entity.spriteSubfolder.trim() : '';
  if (own) return own;
  const slot = formatPresetSlot(entity?.spriteIndex ?? entity?.instanceIndex ?? 1);
  return `ComposedEntity_${slot}`;
}

function getComposedEntityJsonFileName(entity) {
  const slot = formatPresetSlot(entity?.spriteIndex ?? entity?.instanceIndex ?? 1);
  return `composedentity_${slot}.json`;
}

function getComposedEntityPngFileName(entity) {
  const slot = formatPresetSlot(entity?.spriteIndex ?? entity?.instanceIndex ?? 1);
  return `composedentity_${slot}.png`;
}

function buildComposedEntitySourcePath(entity, fileName = null) {
  const folder = getComposedEntitySpriteFolderName(entity, entity?.spriteSubfolder);
  const resolvedFileName = fileName ?? getComposedEntityJsonFileName(entity);
  return `src/ComposedEntity/${folder}/${resolvedFileName}`;
}

function buildComposedEntitySpritePathCandidates(entity) {
  const subfolder = getComposedEntitySpriteFolderName(entity, entity?.spriteSubfolder);
  const spriteIndex = normalizeSpriteIndex(entity?.spriteIndex, 1);
  const pngName = getComposedEntityPngFileName(entity);
  return [
    buildEditorAssetPath({ folder: 'ComposedEntity', subfolder, fileName: pngName }),
    buildEditorAssetPath({ folder: 'ComposedEntity', subfolder, fileName: `ComposedEntity_${formatPresetSlot(spriteIndex)}.png` }),
    buildEditorAssetPath({ folder: 'ComposedEntity', subfolder, fileName: 'composedentity.png' }),
    buildEditorAssetPath({ folder: 'ComposedEntity', subfolder, fileName: `${makeSafeFilename(entity?.name ?? 'composed_entity')}.png` })
  ];
}

function getCircleEditorLabels(entity) {
  if (entity?.type === 'Stentor') return ['oral disc','mid body','holdfast'];
  if (entity?.type === 'Enemy') return entity?.bodyCircles?.map((_, i) => (i === 0 ? 'main body' : `body ${i + 1}`)) ?? [];
  if (entity?.type === 'Macrophage') return entity?.bodyCircles?.map((_, i) => (i === 0 ? 'oral body' : `lobe ${i}`)) ?? [];
  return entity?.circles?.map((_, i) => `circle ${i + 1}`) ?? [];
}

function makeDefaultStoneInnerArtifact(radius) {
  return {
    dx: 0,
    dy: 0,
    radius: Math.max(4, Math.round((radius ?? 28) * 0.32)),
    spriteIndex: 1
  };
}

function makeDefaultEnemyInnerArtifact(radius) {
  return {
    dx: 0,
    dy: 0,
    radius: Math.max(4, Math.round((radius ?? 25) * 0.28)),
    spriteIndex: 1
  };
}

function clampNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeSpriteIndex(value, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.round(n));
}

function formatSpriteIndex(value, fallback = 1) {
  return String(normalizeSpriteIndex(value, fallback)).padStart(2, '0');
}

function formatSequenceFrame(value, padding = 5, fallback = 1) {
  return String(normalizeSpriteIndex(value, fallback)).padStart(padding, '0');
}

function formatPresetSlot(value, padding = 2) {
  return String(normalizeSpriteIndex(value, 1)).padStart(padding, '0');
}

function buildSpriteFileName({ family, variant = null, index = 1, ext = 'png' }) {
  const parts = [family];
  if (variant) parts.push(variant);
  parts.push(formatSpriteIndex(index));
  return `${parts.join('_')}.${ext}`;
}

function buildEditorAssetPath({ folder, subfolder = null, fileName }) {
  const pathParts = ['..', '..', '..', 'src', folder];
  if (subfolder) pathParts.push(subfolder);
  pathParts.push(fileName);
  return pathParts.join('/');
}

function buildEditorSpritePath({ folder, subfolder = null, family, variant = null, index = 1 }) {
  return buildEditorAssetPath({
    folder,
    subfolder,
    fileName: buildSpriteFileName({ family, variant, index })
  });
}

function buildEditorSequencePath({ folder, subfolder = null, index = 1, padding = 5, ext = 'png' }) {
  return buildEditorAssetPath({
    folder,
    subfolder,
    fileName: `${formatSequenceFrame(index, padding)}.${ext}`
  });
}

function getEditorSpriteImage(spec) {
  const path = buildEditorSpritePath(spec);
  return getEditorImageByPath(path);
}

function getEditorImageByPath(path) {
  if (!editorSpriteCache.has(path)) {
    const img = new Image();
    img.decoding = 'async';
    img.src = path;
    editorSpriteCache.set(path, img);
    if (!editorImageLoadCache.has(path)) {
      const loadPromise = new Promise(resolve => {
        const finish = () => resolve(img);
        if (img.complete && img.naturalWidth) {
          finish();
          return;
        }
        img.addEventListener('load', () => {
          if (typeof img.decode === 'function') {
            img.decode().catch(() => {}).finally(finish);
            return;
          }
          finish();
        }, { once: true });
        img.addEventListener('error', finish, { once: true });
      });
      editorImageLoadCache.set(path, loadPromise);
    }
  }
  return editorSpriteCache.get(path);
}

function preloadEditorImage(path) {
  getEditorImageByPath(path);
  return editorImageLoadCache.get(path) ?? Promise.resolve(null);
}

function buildEnemySequencePathCandidates(entity, frameIndex) {
  const padding = Math.max(1, Math.round(clampNum(entity?.spriteAnimationPadding, 5)));
  const explicitOrDerivedSubfolder = getEnemySpriteFolderName(
    entity,
    entity?.spriteAnimationSubfolder ?? entity?.spriteSubfolder
  );

  return [
    buildEditorSequencePath({
      folder: 'Enemy',
      subfolder: explicitOrDerivedSubfolder,
      index: frameIndex,
      padding,
      ext: 'png'
    }),
    buildEditorSequencePath({
      folder: 'Enemy',
      index: frameIndex,
      padding,
      ext: 'png'
    })
  ];
}

function getLoadedEditorImage(paths) {
  for (const path of paths) {
    const img = getEditorImageByPath(path);
    if (img && img.complete && img.naturalWidth) return { path, img };
  }
  return { path: paths[0] ?? null, img: paths[0] ? getEditorImageByPath(paths[0]) : null };
}

function getLoadedEditorImageSticky(paths, stickyKey, owner = null) {
  const result = getLoadedEditorImage(paths);
  if (result.img && result.img.complete && result.img.naturalWidth) {
    if (owner && stickyKey) owner[stickyKey] = result.img;
    return result.img;
  }

  if (owner && stickyKey && owner[stickyKey] && owner[stickyKey].complete && owner[stickyKey].naturalWidth) {
    return owner[stickyKey];
  }

  return result.img ?? null;
}

function getEnemyAnimationFrameIndex(entity, now = performance.now()) {
  const frameCount = Math.max(1, Math.round(clampNum(entity?.spriteAnimationFrames, 5)));
  const startFrame = normalizeSpriteIndex(entity?.spriteAnimationStart, 1);
  const fps = Math.max(1, clampNum(entity?.spriteAnimationFps, 12));
  const mode = entity?.spriteAnimationMode === 'pingpong' ? 'pingpong' : 'loop';
  const frameDurationMs = 1000 / fps;
  const tick = Math.floor(now / frameDurationMs);
  if (mode === 'pingpong' && frameCount > 1) {
    const cycleLength = frameCount * 2 - 2;
    const cycleIndex = ((tick % cycleLength) + cycleLength) % cycleLength;
    const frameOffset = cycleIndex < frameCount ? cycleIndex : cycleLength - cycleIndex;
    return startFrame + frameOffset;
  }
  return startFrame + ((((tick % frameCount) + frameCount) % frameCount));
}

function buildMacrophageSequencePathCandidates(entity, frameIndex) {
  const padding = Math.max(1, Math.round(clampNum(entity?.spriteAnimationPadding, 5)));
  const explicitOrDerivedSubfolder = getMacrophageSpriteFolderName(
    entity,
    entity?.spriteAnimationSubfolder ?? entity?.spriteSubfolder
  );

  return [
    buildEditorSequencePath({
      folder: 'Macrophage',
      subfolder: explicitOrDerivedSubfolder,
      index: frameIndex,
      padding,
      ext: 'png'
    }),
    buildEditorSequencePath({
      folder: 'Macrophage',
      index: frameIndex,
      padding,
      ext: 'png'
    })
  ];
}

function getEnemySpriteFolderName(entity, preferredSubfolder = null) {
  if (typeof preferredSubfolder === 'string') {
    return preferredSubfolder.trim();
  }

  const spriteIndex = normalizeSpriteIndex(entity?.spriteIndex, entity?.instanceIndex || 1);
  return `Enemy_${String(spriteIndex).padStart(2, '0')}`;
}

function getMacrophageSpriteFolderName(entity, preferredSubfolder = null) {
  if (preferredSubfolder != null && String(preferredSubfolder).trim()) {
    return String(preferredSubfolder).trim();
  }

  const spriteIndex = normalizeSpriteIndex(entity?.spriteIndex, entity?.instanceIndex || 1);
  return `Macrophage_${String(spriteIndex).padStart(2, '0')}`;
}

function getEnemySpriteCalPath(entity) {
  if (!entity) return null;
  return buildEnemySequencePathCandidates(entity, normalizeSpriteIndex(entity.spriteAnimationStart, 1))[0];
}

function getMacrophageSpriteCalPath(entity) {
  if (!entity) return null;
  return buildMacrophageSequencePathCandidates(entity, normalizeSpriteIndex(entity.spriteAnimationStart, 1))[0];
}

function getComposedStoneSpriteFolderName(entity, preferredSubfolder = null) {
  if (preferredSubfolder != null && String(preferredSubfolder).trim()) {
    return String(preferredSubfolder).trim();
  }

  const spriteIndex = normalizeSpriteIndex(entity?.spriteIndex, entity?.instanceIndex || 1);
  return `CompoundStone_${String(spriteIndex).padStart(2, '0')}`;
}

function isAutoComposedStoneSpriteSubfolder(value) {
  return typeof value === 'string' && /^CompoundStone_\d{2}$/.test(value.trim());
}

function syncComposedStoneSpriteSubfolder(entity, previousSpriteIndex = null, previousInstanceIndex = null) {
  if (!entity || entity.type !== 'ComposedStone') return;

  const previousDerived = `CompoundStone_${String(
    normalizeSpriteIndex(previousSpriteIndex, previousInstanceIndex || 1)
  ).padStart(2, '0')}`;
  const currentValue = typeof entity.spriteSubfolder === 'string' ? entity.spriteSubfolder.trim() : '';

  if (!currentValue || currentValue === previousDerived || isAutoComposedStoneSpriteSubfolder(currentValue)) {
    entity.spriteSubfolder = getComposedStoneSpriteFolderName(entity, null);
  }
}

function buildComposedStoneSpritePathCandidates(entity) {
  const subfolder = getComposedStoneSpriteFolderName(
    entity,
    entity?.spriteSubfolder
  );
  const spriteIndex = normalizeSpriteIndex(entity?.spriteIndex, entity?.instanceIndex || 1);

  return [
    buildEditorSpritePath({
      folder: 'CompoundStone',
      subfolder,
      family: 'compoundstone',
      index: spriteIndex
    }),
    buildEditorSpritePath({
      folder: 'CompoundStone',
      subfolder,
      family: 'compoundstone',
      index: 1
    }),
    buildEditorSpritePath({
      folder: 'CompoundStone',
      family: 'compoundstone',
      index: spriteIndex
    }),
    buildEditorSpritePath({
      folder: 'CompoundStone',
      family: 'compoundstone',
      index: 1
    })
  ];
}

function getComposedStoneSpriteCalPath(entity) {
  if (!entity) return null;
  return buildComposedStoneSpritePathCandidates(entity)[0];
}

function getAlgaeSpriteFolderName(entity, preferredSubfolder = null) {
  if (preferredSubfolder != null && String(preferredSubfolder).trim()) {
    return String(preferredSubfolder).trim();
  }

  const spriteIndex = normalizeSpriteIndex(entity?.spriteIndex, entity?.instanceIndex || 1);
  return `Algae_${String(spriteIndex).padStart(2, '0')}`;
}

function isAutoAlgaeSpriteSubfolder(value) {
  return typeof value === 'string' && /^Algae_\d{2}$/.test(value.trim());
}

function syncAlgaeSpriteSubfolder(entity, previousSpriteIndex = null, previousInstanceIndex = null) {
  if (!entity || entity.type !== 'Algae') return;

  const previousDerived = `Algae_${String(
    normalizeSpriteIndex(previousSpriteIndex, previousInstanceIndex || 1)
  ).padStart(2, '0')}`;
  const currentValue = typeof entity.spriteSubfolder === 'string' ? entity.spriteSubfolder.trim() : '';

  if (!currentValue || currentValue === previousDerived || isAutoAlgaeSpriteSubfolder(currentValue)) {
    entity.spriteSubfolder = getAlgaeSpriteFolderName(entity, null);
  }
}

function buildAlgaeSpritePathCandidates(entity) {
  const subfolder = getAlgaeSpriteFolderName(entity, entity?.spriteSubfolder);
  const spriteIndex = normalizeSpriteIndex(entity?.spriteIndex, entity?.instanceIndex || 1);
  const candidates = [
    buildEditorSpritePath({
      folder: 'Algae',
      subfolder,
      family: 'algae',
      index: spriteIndex
    })
  ];

  if (!subfolder) {
    candidates.push(buildEditorSpritePath({
      folder: 'Algae',
      family: 'algae',
      index: spriteIndex
    }));
  }

  return candidates;
}

function getAlgaeSpriteCalPath(entity) {
  if (!entity) return null;
  return buildAlgaeSpritePathCandidates(entity)[0];
}

function getEnemySpritePath(entity, now = performance.now()) {
  if (!entity) return null;

  if (entity.spriteAnimationEnabled === false) {
    return buildEnemySequencePathCandidates(entity, normalizeSpriteIndex(entity.spriteAnimationStart, 1))[0];
  }

  return buildEnemySequencePathCandidates(entity, getEnemyAnimationFrameIndex(entity, now))[0];
}

function getMacrophageSpritePath(entity, now = performance.now()) {
  if (!entity) return null;

  if (entity.spriteAnimationEnabled === false) {
    return buildMacrophageSequencePathCandidates(entity, normalizeSpriteIndex(entity.spriteAnimationStart, 1))[0];
  }

  return buildMacrophageSequencePathCandidates(entity, getEnemyAnimationFrameIndex(entity, now))[0];
}

function getPreviewAssetPathsForTool(toolId) {
  switch (toolId) {
    case 'Enemy': {
      const previewEnemy = {
        spriteIndex: activeIndex.Enemy ?? 1,
        instanceIndex: activeIndex.Enemy ?? 1,
        spriteAnimationEnabled: true,
        spriteAnimationFrames: 5,
        spriteAnimationStart: 1,
        spriteAnimationPadding: 5
      };
      const paths = [];
      for (let frame = 1; frame <= 5; frame++) {
        paths.push(...buildEnemySequencePathCandidates(previewEnemy, frame));
      }
      return paths;
    }
    case 'ComposedStone': {
      const presetId = activeEntityPreset.ComposedStone;
      const preset = entityPresetsByType.ComposedStone?.find(p => p.id === presetId) ?? null;
      return buildComposedStoneSpritePathCandidates({
        spriteIndex: preset?.data?.spriteIndex ?? activeIndex.ComposedStone ?? 1,
        instanceIndex: preset?.data?.instanceIndex ?? activeIndex.ComposedStone ?? 1,
        spriteSubfolder: preset?.data?.spriteSubfolder ?? ''
      });
    }
    case 'Algae': {
      const presetId = activeEntityPreset.Algae;
      const preset = entityPresetsByType.Algae?.find(p => p.id === presetId) ?? null;
      return buildAlgaeSpritePathCandidates({
        spriteIndex: preset?.data?.spriteIndex ?? activeIndex.Algae ?? 1,
        instanceIndex: preset?.data?.instanceIndex ?? activeIndex.Algae ?? 1,
        spriteSubfolder: preset?.data?.spriteSubfolder ?? ''
      });
    }
    case 'ComposedEntity': {
      const presetId = activeEntityPreset.ComposedEntity;
      const preset = entityPresetsByType.ComposedEntity?.find(p => p.id === presetId) ?? null;
      return buildComposedEntitySpritePathCandidates(preset?.data ?? { name: preset?.name ?? 'composed_entity' });
    }
    case 'Macrophage': {
      const presetId = activeEntityPreset.Macrophage;
      const preset = entityPresetsByType.Macrophage?.find(p => p.id === presetId) ?? null;
      const previewMacrophage = {
        spriteIndex: preset?.data?.spriteIndex ?? activeIndex.Macrophage ?? 1,
        instanceIndex: preset?.data?.instanceIndex ?? activeIndex.Macrophage ?? 1,
        spriteSubfolder: preset?.data?.spriteSubfolder ?? '',
        spriteAnimationSubfolder: preset?.data?.spriteAnimationSubfolder ?? preset?.data?.spriteSubfolder ?? '',
        spriteAnimationEnabled: preset?.data?.spriteAnimationEnabled ?? true,
        spriteAnimationFrames: preset?.data?.spriteAnimationFrames ?? 5,
        spriteAnimationStart: preset?.data?.spriteAnimationStart ?? 1,
        spriteAnimationMode: preset?.data?.spriteAnimationMode === 'pingpong' ? 'pingpong' : 'loop',
        spriteAnimationPadding: preset?.data?.spriteAnimationPadding ?? 5,
        spriteAnimationFps: preset?.data?.spriteAnimationFps ?? 12
      };
      const paths = [];
      const frameCount = Math.max(1, Math.round(clampNum(previewMacrophage.spriteAnimationFrames, 5)));
      const startFrame = normalizeSpriteIndex(previewMacrophage.spriteAnimationStart, 1);
      for (let offset = 0; offset < frameCount; offset++) {
        paths.push(...buildMacrophageSequencePathCandidates(previewMacrophage, startFrame + offset));
      }
      return paths;
    }
    case 'Egg':
      return [buildEditorSpritePath({ folder: 'Egg', family: 'egg', index: 1 })];
    case 'Player':
      return [
        buildEditorAssetPath({ folder: 'Player', fileName: 'Player_outer_01.png' }),
        buildEditorAssetPath({ folder: 'Player', fileName: 'Player_inner_01.png' })
      ];
    case 'Oldbody':
      return [
        buildEditorAssetPath({ folder: 'Player', fileName: 'Player_outer_01.png' }),
        buildEditorAssetPath({ folder: 'Player', fileName: 'old_body01.png' })
      ];
    case 'Particle':
    case 'ParticleZone':
    case 'Stone':
      return [buildEditorSpritePath({ folder: 'Particle', family: 'particle', variant: 'green', index: 1 })];
    default:
      return [];
  }
}

function getEntityAssetPaths(entity) {
  if (!entity) return [];

  switch (entity.type) {
    case 'Enemy': {
      const frames = Math.max(1, Math.round(clampNum(entity.spriteAnimationFrames, 5)));
      const start = normalizeSpriteIndex(entity.spriteAnimationStart, 1);
      const paths = [];
      for (let frame = 0; frame < frames; frame++) {
        paths.push(...buildEnemySequencePathCandidates(entity, start + frame));
      }
      return paths;
    }
    case 'Macrophage': {
      const frames = Math.max(1, Math.round(clampNum(entity.spriteAnimationFrames, 5)));
      const start = normalizeSpriteIndex(entity.spriteAnimationStart, 1);
      const paths = [];
      for (let frame = 0; frame < frames; frame++) {
        paths.push(...buildMacrophageSequencePathCandidates(entity, start + frame));
      }
      return paths;
    }
    case 'ComposedStone':
      return buildComposedStoneSpritePathCandidates(entity);
    case 'Algae':
      return buildAlgaeSpritePathCandidates(entity);
    case 'ComposedEntity':
      return buildComposedEntitySpritePathCandidates(entity);
    case 'Egg':
      return [buildEditorSpritePath({
        folder: 'Egg',
        family: 'egg',
        index: normalizeSpriteIndex(entity.spriteIndex, 1)
      })];
    case 'Player':
      return [
        buildEditorAssetPath({ folder: 'Player', fileName: 'Player_outer_01.png' }),
        buildEditorAssetPath({ folder: 'Player', fileName: 'Player_inner_01.png' })
      ];
    case 'Oldbody':
      return [
        buildEditorAssetPath({ folder: 'Player', fileName: 'Player_outer_01.png' }),
        buildEditorAssetPath({ folder: 'Player', fileName: 'old_body01.png' })
      ];
    case 'Particle':
      return [buildEditorSpritePath({
        folder: 'Particle',
        family: 'particle',
        variant: entity.tintGroup === 'red' ? 'red' : 'green',
        index: normalizeSpriteIndex(entity.spriteIndex, 1)
      })];
    case 'ParticleZone':
    case 'Stone':
      return [buildEditorSpritePath({ folder: 'Particle', family: 'particle', variant: 'green', index: 1 })];
    default:
      return [];
  }
}

function collectEditorSceneAssetPaths() {
  const paths = new Set();

  if (backgroundImageSrc) {
    paths.add(backgroundImageSrc);
  }

  entities.forEach(entity => {
    getEntityAssetPaths(entity).forEach(path => {
      if (path) paths.add(path);
    });
  });

  getComposedEntityInstances().forEach(instance => {
    const spriteEntity = buildComposedEntityEditorSpriteEntity(instance);
    if (!spriteEntity) return;
    buildComposedEntitySpritePathCandidates(spriteEntity).forEach(path => {
      if (path) paths.add(path);
    });
  });

  getPreviewAssetPathsForTool(activeTool).forEach(path => {
    if (path) paths.add(path);
  });

  return Array.from(paths);
}

function ensureEditorSceneAssetsLoaded() {
  const paths = collectEditorSceneAssetPaths();
  const nextKey = JSON.stringify(paths);

  if (nextKey === editorSceneAssetKey && editorSceneAssetsReady) {
    return true;
  }

  if (nextKey !== editorSceneAssetKey) {
    editorSceneAssetKey = nextKey;
    editorSceneAssetsReady = false;
    editorSceneAssetPromise = Promise.all(paths.map(preloadEditorImage))
      .catch(() => {})
      .finally(() => {
        editorSceneAssetsReady = true;
        editorSceneAssetPromise = null;
        render();
      });
  }

  return editorSceneAssetsReady;
}

function drawEnemySprite(e, selected, isPreview = false) {
  ensureEnemyDefaults(e);

  const now = performance.now();
  const spriteCandidates = e.spriteAnimationEnabled === false
    ? buildEnemySequencePathCandidates(e, normalizeSpriteIndex(e.spriteAnimationStart, 1))
    : buildEnemySequencePathCandidates(e, getEnemyAnimationFrameIndex(e, now));
  const { img } = getLoadedEditorImage(spriteCandidates);
  const angle = getEnemyMouthAngleRad(e);
  const drawW = e.radius * clampNum(e.spriteScale, 1.41) * 2.0;
  const drawH = drawW * (1024 / 1280);
  const flipX = !!e.spriteFlipX;
  const bodyU = clampNum(e.spriteBodyU, 0.410);
  const mouthU = clampNum(e.spriteMouthU, 0.751);
  const bodyAnchorX = drawW * bodyU;
  const bodyAnchorY = drawH * clampNum(e.spriteBodyV, 0.423);

  if (img && img.complete && img.naturalWidth) {
    if (selected && !isPreview) {
      ctx.save();
      ctx.shadowColor = 'rgba(124,106,247,0.45)';
      ctx.shadowBlur = 20;
    }

    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(angle + clampNum(e.spriteRotationOffset, 0.25));
    if (flipX) ctx.scale(1, -1);
    ctx.globalAlpha = 0.82;
    ctx.drawImage(img, -bodyAnchorX, -bodyAnchorY, drawW, drawH);

    if (e.spriteDebug) {
      const mouthLocalX = drawW * mouthU - bodyAnchorX;
      const mouthLocalY = drawH * clampNum(e.spriteMouthV, 0.327) - bodyAnchorY;
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0,255,255,0.9)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-bodyAnchorX, -bodyAnchorY, drawW, drawH);
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0,255,255,0.95)';
      ctx.lineWidth = 2;
      ctx.moveTo(-8, 0);
      ctx.lineTo(8, 0);
      ctx.moveTo(0, -8);
      ctx.lineTo(0, 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255,0,0,0.95)';
      ctx.arc(mouthLocalX, mouthLocalY, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (selected && !isPreview) ctx.restore();
    return true;
  }

  if (selected && !isPreview) {
    ctx.save();
    ctx.shadowColor = 'rgba(124,106,247,0.8)';
    ctx.shadowBlur = 20;
  }
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 140, 0, 0.80)';
  ctx.fill();
  ctx.strokeStyle = selected ? '#7c6af7' : 'rgba(255,200,80,0.9)';
  ctx.lineWidth = selected ? 2.5 : 1.5;
  ctx.stroke();
  if (selected && !isPreview) ctx.restore();
  return false;
}

function drawMacrophageSprite(e, selected, isPreview = false) {
  ensureMacrophageDefaults(e);

  const now = performance.now();
  const spriteCandidates = e.spriteAnimationEnabled === false
    ? buildMacrophageSequencePathCandidates(e, normalizeSpriteIndex(e.spriteAnimationStart, 1))
    : buildMacrophageSequencePathCandidates(e, getEnemyAnimationFrameIndex(e, now));
  const img = getLoadedEditorImageSticky(
    spriteCandidates,
    isPreview ? '_editorPreviewLastRenderableSpriteImage' : '_editorLastRenderableSpriteImage',
    e
  );

  if (!(img && img.complete && img.naturalWidth)) {
    if (!isPreview) e._editorMacrophageSpriteGeometry = null;
    // Sprite is expected, but still loading: suppress the geometric fallback
    // to avoid the initial purple-circle flash in the level editor.
    return true;
  }

  const drawW = e.radius * clampNum(e.spriteScale, 1.18) * 2.0;
  const drawH = drawW * (img.naturalHeight / Math.max(img.naturalWidth, 1));
  const flipX = !!e.spriteFlipX;
  const bodyAnchorX = drawW * clampNum(e.spriteBodyU, 0.5);
  const bodyAnchorY = drawH * clampNum(e.spriteBodyV, 0.5);
  const pivotDx = Number(e.bodyRotation?.pivotDx ?? 0) || 0;
  const pivotDy = Number(e.bodyRotation?.pivotDy ?? 0) || 0;
  const totalAngle = getMacrophageBodyBaseAngleRad(e) + clampNum(e.spriteRotationOffset, 0);
  const pivotWorldX = e.x + pivotDx;
  const pivotWorldY = e.y + pivotDy;
  const rectLeft = -pivotDx - bodyAnchorX;
  const rectTop = -pivotDy - bodyAnchorY;
  const topCenterLocal = { x: rectLeft + drawW * 0.5, y: rectTop };
  const handleLocal = { x: topCenterLocal.x, y: topCenterLocal.y - 26 };
  const rotateLocalPoint = point => ({
    x: pivotWorldX + point.x * Math.cos(totalAngle) - point.y * Math.sin(totalAngle),
    y: pivotWorldY + point.x * Math.sin(totalAngle) + point.y * Math.cos(totalAngle)
  });
  if (!isPreview) {
    e._editorMacrophageSpriteGeometry = {
      pivot: { x: pivotWorldX, y: pivotWorldY },
      topCenter: rotateLocalPoint(topCenterLocal),
      handle: rotateLocalPoint(handleLocal),
      localHandleAngle: Math.atan2(handleLocal.y, handleLocal.x),
      spriteRotationOffset: clampNum(e.spriteRotationOffset, 0)
    };
  }

  ctx.save();
  if (selected && !isPreview) {
    ctx.shadowColor = 'rgba(210,140,255,0.45)';
    ctx.shadowBlur = 20;
  }
  ctx.translate(pivotWorldX, pivotWorldY);
  ctx.rotate(totalAngle);
  if (flipX) ctx.scale(1, -1);
  ctx.globalAlpha = 0.9;
  ctx.drawImage(img, -pivotDx - bodyAnchorX, -pivotDy - bodyAnchorY, drawW, drawH);

  if (selected && !isPreview) {
    ctx.strokeStyle = 'rgba(230,205,255,0.82)';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(-pivotDx - bodyAnchorX, -pivotDy - bodyAnchorY, drawW, drawH);
  }

  ctx.restore();
  return true;
}

function getMacrophageSpriteSelectionGeometry(e) {
  if (!e || e.type !== 'Macrophage') return null;
  return e._editorMacrophageSpriteGeometry ?? null;
}

function randomIntInclusive(min, max) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.floor(lo + Math.random() * (hi - lo + 1));
}

const SPRITE_CAL_FIELDS = [
  { key: 'radius', label: 'Radius', min: 5, max: 220, step: 1, decimals: 0 },
  { key: 'spriteScale', label: 'Scale', min: 0.05, max: 10, step: 0.01, decimals: 3 },
  { key: 'spriteRotationOffset', label: 'Rotation', min: -6.28, max: 6.28, step: 0.01, decimals: 2 },
  { key: 'simAngle', label: 'Sim angle', min: -6.28, max: 6.28, step: 0.01, decimals: 2 },
  { key: 'spriteBodyU', label: 'Body U', min: -2, max: 2, step: 0.001, decimals: 3 },
  { key: 'spriteBodyV', label: 'Body V', min: -2, max: 2, step: 0.001, decimals: 3 },
];

function hasBackgroundImage() {
  return !!backgroundImage;
}

function fitBackgroundToCanvas() {
  if (!backgroundImage || !backgroundImage.naturalWidth || !backgroundImage.naturalHeight) return;
  const scaleX = canvas.width / backgroundImage.naturalWidth;
  const scaleY = canvas.height / backgroundImage.naturalHeight;
  backgroundScale = Math.max(scaleX, scaleY);
  const drawW = backgroundImage.naturalWidth * backgroundScale;
  const drawH = backgroundImage.naturalHeight * backgroundScale;
  backgroundOffsetX = (canvas.width - drawW) * 0.5;
  backgroundOffsetY = (canvas.height - drawH) * 0.5;
}

function getBackgroundRect() {
  if (!backgroundImage || !backgroundImage.naturalWidth || !backgroundImage.naturalHeight) return null;
  return {
    x: backgroundOffsetX,
    y: backgroundOffsetY,
    width: backgroundImage.naturalWidth * backgroundScale,
    height: backgroundImage.naturalHeight * backgroundScale
  };
}

function getReferenceRect() {
  return getBackgroundRect() ?? { x: 0, y: 0, width: canvas.width, height: canvas.height };
}

function getCanvasRefRect(canvasRef = null) {
  const sourceWidth = Number(canvasRef?.width ?? 0);
  const sourceHeight = Number(canvasRef?.height ?? 0);
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) {
    return {
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
      sourceWidth: canvas.width,
      sourceHeight: canvas.height
    };
  }

  const scale = Math.min(canvas.width / sourceWidth, canvas.height / sourceHeight);
  return {
    x: (canvas.width - sourceWidth * scale) * 0.5,
    y: (canvas.height - sourceHeight * scale) * 0.5,
    width: sourceWidth * scale,
    height: sourceHeight * scale,
    sourceWidth,
    sourceHeight,
    scale
  };
}

function mapInitialViewToCanvas(initialView = null, canvasRef = null) {
  const canvasRect = getCanvasRefRect(canvasRef);
  const sourceWidth = Math.max(1, canvasRect.sourceWidth || canvasRect.width || canvas.width || 1);
  const sourceHeight = Math.max(1, canvasRect.sourceHeight || canvasRect.height || canvas.height || 1);
  const fallbackScale = 1 + INITIAL_VIEW_PADDING_RATIO;
  const fallbackWidth = sourceWidth / fallbackScale;
  const fallbackHeight = sourceHeight / fallbackScale;
  const sourceRect = {
    x: Number.isFinite(Number(initialView?.x)) ? Number(initialView.x) : (sourceWidth - fallbackWidth) * 0.5,
    y: Number.isFinite(Number(initialView?.y)) ? Number(initialView.y) : (sourceHeight - fallbackHeight) * 0.5,
    width: Math.max(1, Number(initialView?.width) || fallbackWidth),
    height: Math.max(1, Number(initialView?.height) || fallbackHeight)
  };
  const scaleX = canvasRect.width / sourceWidth;
  const scaleY = canvasRect.height / sourceHeight;
  return {
    x: canvasRect.x + sourceRect.x * scaleX,
    y: canvasRect.y + sourceRect.y * scaleY,
    width: sourceRect.width * scaleX,
    height: sourceRect.height * scaleY,
    paddingRatio: Number.isFinite(Number(initialView?.paddingRatio))
      ? Number(initialView.paddingRatio)
      : INITIAL_VIEW_PADDING_RATIO
  };
}

function getInitialViewRect() {
  if (importedLevelGeometry) {
    return mapInitialViewToCanvas(importedLevelGeometry.initialView, importedLevelGeometry.canvasRef);
  }

  const scale = 1 + INITIAL_VIEW_PADDING_RATIO;
  const width = Math.max(1, canvas.width / scale);
  const height = Math.max(1, canvas.height / scale);
  return {
    x: (canvas.width - width) * 0.5,
    y: (canvas.height - height) * 0.5,
    width,
    height,
    paddingRatio: INITIAL_VIEW_PADDING_RATIO
  };
}

function normalizePointToRect(x, y, rect) {
  return {
    x: Number(((x - rect.x) / Math.max(rect.width, 1)).toFixed(6)),
    y: Number(((y - rect.y) / Math.max(rect.height, 1)).toFixed(6))
  };
}

function normalizeVectorToRect(dx, dy, rect) {
  return {
    dx: Number((dx / Math.max(rect.width, 1)).toFixed(6)),
    dy: Number((dy / Math.max(rect.height, 1)).toFixed(6))
  };
}

function normalizeScalarToRect(value, rect) {
  return Number((Number(value || 0) / Math.max(Math.min(rect.width, rect.height), 1)).toFixed(6));
}

function resolvePointFromRect(entity, rect, options = {}) {
  const normRect = options.normRect ?? { x: 0, y: 0, width: canvas.width, height: canvas.height };
  if (entity?.xBgNorm != null || entity?.yBgNorm != null) {
    return {
      x: rect.x + (Number(entity.xBgNorm) || 0) * rect.width,
      y: rect.y + (Number(entity.yBgNorm) || 0) * rect.height
    };
  }

  if (entity?.xNorm !== undefined || entity?.yNorm !== undefined) {
    return {
      x: normRect.x + (Number(entity.xNorm) || 0) * normRect.width,
      y: normRect.y + (Number(entity.yNorm) || 0) * normRect.height
    };
  }

  if (Number.isFinite(Number(entity?.x)) && Number.isFinite(Number(entity?.y)) && normRect.sourceWidth && normRect.sourceHeight) {
    return {
      x: normRect.x + (Number(entity.x) / Math.max(1, normRect.sourceWidth)) * normRect.width,
      y: normRect.y + (Number(entity.y) / Math.max(1, normRect.sourceHeight)) * normRect.height
    };
  }

  return {
    x: entity?.x,
    y: entity?.y
  };
}

function resolveVectorFromRect(vector, rect, options = {}) {
  const normRect = options.normRect ?? { width: canvas.width, height: canvas.height };
  if (vector?.dxBgNorm != null || vector?.dyBgNorm != null) {
    return {
      dx: Math.round((Number(vector.dxBgNorm) || 0) * rect.width),
      dy: Math.round((Number(vector.dyBgNorm) || 0) * rect.height)
    };
  }

  return {
    dx: Math.round((vector?.dxNorm ?? 0) * normRect.width),
    dy: Math.round((vector?.dyNorm ?? 0) * normRect.height)
  };
}

function getBackgroundFitScale(targetCanvasWidth = canvas.width, targetCanvasHeight = canvas.height) {
  if (!backgroundImage || !backgroundImage.naturalWidth || !backgroundImage.naturalHeight) return 1;
  return Math.max(targetCanvasWidth / backgroundImage.naturalWidth, targetCanvasHeight / backgroundImage.naturalHeight);
}

function resolveStoredBackgroundPlacement(img, options = {}) {
  if (!img || !img.naturalWidth || !img.naturalHeight) return null;

  const {
    offsetXNorm = 0,
    offsetYNorm = 0,
    scaleMul = 1,
    canvasRef = null,
    targetWidth = canvas.width,
    targetHeight = canvas.height
  } = options;

  const sourceWidth = Math.max(1, Number(canvasRef?.width) || targetWidth || 1);
  const sourceHeight = Math.max(1, Number(canvasRef?.height) || targetHeight || 1);
  const fitScale = Math.max(sourceWidth / img.naturalWidth, sourceHeight / img.naturalHeight);
  const resolvedScale = Math.max(0.05, fitScale * Math.max(0.05, Number(scaleMul) || 1));

  const rectOnSource = {
    x: (Number(offsetXNorm) || 0) * sourceWidth,
    y: (Number(offsetYNorm) || 0) * sourceHeight,
    width: img.naturalWidth * resolvedScale,
    height: img.naturalHeight * resolvedScale
  };

  if (sourceWidth === targetWidth && sourceHeight === targetHeight) {
    return rectOnSource;
  }

  const uniformScale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const offsetX = (targetWidth - sourceWidth * uniformScale) * 0.5;
  const offsetY = (targetHeight - sourceHeight * uniformScale) * 0.5;

  return {
    x: rectOnSource.x * uniformScale + offsetX,
    y: rectOnSource.y * uniformScale + offsetY,
    width: rectOnSource.width * uniformScale,
    height: rectOnSource.height * uniformScale
  };
}

function buildBackgroundExport() {
  if (!backgroundImage || !backgroundImageSrc) return null;
  const fitScale = Math.max(getBackgroundFitScale(), 0.0001);
  return {
    name: backgroundImageName || 'background.png',
    src: backgroundImageSrc,
    width: backgroundImage.naturalWidth,
    height: backgroundImage.naturalHeight,
    alpha: Number(backgroundImageAlpha.toFixed(4)),
    offsetXNorm: Number((backgroundOffsetX / Math.max(canvas.width, 1)).toFixed(6)),
    offsetYNorm: Number((backgroundOffsetY / Math.max(canvas.height, 1)).toFixed(6)),
    scaleMul: Number((backgroundScale / fitScale).toFixed(6))
  };
}

function applyBackgroundState(src, name = 'background.png', options = {}) {
  if (!src) {
    clearBackgroundImage();
    return;
  }

  const {
    alpha = 0.55,
    offsetXNorm = null,
    offsetYNorm = null,
    scaleMul = null,
    canvasRef = null,
    onLoad = null
  } = options;

  const img = new Image();
  img.onload = () => {
    backgroundImage = img;
    backgroundImageSrc = src;
    backgroundImageName = name;
    backgroundImageAlpha = clampNum(alpha, 0.55);

    if (offsetXNorm == null || offsetYNorm == null || scaleMul == null) {
      fitBackgroundToCanvas();
    } else {
      const resolvedRect = resolveStoredBackgroundPlacement(img, {
        offsetXNorm,
        offsetYNorm,
        scaleMul,
        canvasRef
      });
      if (resolvedRect) {
        backgroundScale = resolvedRect.width / Math.max(img.naturalWidth, 1);
        backgroundOffsetX = resolvedRect.x;
        backgroundOffsetY = resolvedRect.y;
      } else {
        const fitScale = getBackgroundFitScale(canvas.width, canvas.height);
        backgroundScale = Math.max(0.05, fitScale * Math.max(0.05, Number(scaleMul) || 1));
        backgroundOffsetX = (Number(offsetXNorm) || 0) * canvas.width;
        backgroundOffsetY = (Number(offsetYNorm) || 0) * canvas.height;
      }
    }

    updateBackgroundButtons();
    render();
    if (typeof onLoad === 'function') onLoad();
  };
  img.src = src;
}

function ensureEnemyDefaults(e) {
  if (!e || e.type !== 'Enemy') return;
  e.instanceIndex = Math.max(1, Math.round(clampNum(e.instanceIndex, 1)));
  e.spriteIndex = normalizeSpriteIndex(e.spriteIndex, e.instanceIndex || 1);
  e.radius = clampNum(e.radius, 25);
  e.speed = clampNum(e.speed, 0.6);
  e.velocityDamping = clampNum(e.velocityDamping, 0.952);
  e.maxGlideSpeed = clampNum(e.maxGlideSpeed, 1.35);
  e.kickImpulse = clampNum(e.kickImpulse, 1.1);
  e.kickCooldownMs = Math.max(0, Math.round(clampNum(e.kickCooldownMs, 760)));
  e.searchKickImpulse = clampNum(e.searchKickImpulse, 0.5);
  e.searchKickCooldownMs = Math.max(0, Math.round(clampNum(e.searchKickCooldownMs, 1650)));
  e.trackingFOVDeg = clampNum(e.trackingFOVDeg, 42);
  e.trackingKickJitterDeg = clampNum(e.trackingKickJitterDeg, 14);
  e.scanTurnRate = clampNum(e.scanTurnRate, 0.014);
  e.scanRetargetMs = Math.max(0, Math.round(clampNum(e.scanRetargetMs, 850)));
  e.scanSweepAngleDeg = clampNum(e.scanSweepAngleDeg, 115);
  e.gitCircleOffsetAngleDeg = clampNum(e.gitCircleOffsetAngleDeg, 160);
  e.gitCircleOffsetDistanceMul = clampNum(e.gitCircleOffsetDistanceMul, 0.58);
  e.gitCircleRadiusMul = clampNum(e.gitCircleRadiusMul, 0.48);
  e.mouthRestAngle = clampNum(e.mouthRestAngle, -0.35);
  e.mouthTurnRate = clampNum(e.mouthTurnRate, 0.025);
  e.mouthReturnRate = clampNum(e.mouthReturnRate, 0.03);
  e.mouthAbsorbRadius = clampNum(e.mouthAbsorbRadius, 4.5);
  e.gitMaxParticles = Math.max(1, Math.round(clampNum(e.gitMaxParticles, 6)));
  e.gitParticleRadius = clampNum(e.gitParticleRadius, 2.8);
  e.gitParticleSpeed = clampNum(e.gitParticleSpeed, 1.2);
  e.gitParticleMinSpeed = clampNum(e.gitParticleMinSpeed, 0.15);
  e.gitParticleFriction = clampNum(e.gitParticleFriction, 0.975);
  e.gitParticleWallRestitution = clampNum(e.gitParticleWallRestitution, 0.88);
  e.eggGrowthRate = clampNum(e.eggGrowthRate, 0.09);
  e.eggTargetRadius = clampNum(e.eggTargetRadius, 14);
  e.eggDetachSpeed = clampNum(e.eggDetachSpeed, 0.55);
  e.eggHatchEnemyRadius = clampNum(e.eggHatchEnemyRadius, 18);
  e.preLaySlowdownMs = Math.max(0, Math.round(clampNum(e.preLaySlowdownMs, 3200)));
  e.preLayFriction = clampNum(e.preLayFriction, 0.96);
  e.spriteScale = clampNum(e.spriteScale, 1.18);
  e.spriteFlipX = !!e.spriteFlipX;
  e.spriteSubfolder = e.spriteSubfolder ?? '';
  e.spriteRotationOffset = clampNum(e.spriteRotationOffset, 0.18);
  e.spriteBodyU = clampNum(e.spriteBodyU, 0.39);
  e.spriteBodyV = clampNum(e.spriteBodyV, 0.43);
  e.spriteMouthU = clampNum(e.spriteMouthU, 0.58);
  e.spriteMouthV = clampNum(e.spriteMouthV, 0.35);
  e.spriteAnimationEnabled = e.spriteAnimationEnabled ?? true;
  e.spriteAnimationSubfolder = e.spriteAnimationSubfolder ?? e.spriteSubfolder ?? '';
  e.spriteAnimationFrames = Math.max(1, Math.round(clampNum(e.spriteAnimationFrames, 5)));
  e.spriteAnimationStart = normalizeSpriteIndex(e.spriteAnimationStart, 1);
  e.spriteAnimationFps = Math.max(1, clampNum(e.spriteAnimationFps, 12));
  e.spriteAnimationMode = e.spriteAnimationMode === 'pingpong' ? 'pingpong' : 'loop';
  e.spriteAnimationPadding = Math.max(1, Math.round(clampNum(e.spriteAnimationPadding, 5)));
  e.bodyCircles = Array.isArray(e.bodyCircles) && e.bodyCircles.length
    ? e.bodyCircles.map((circle, index) => ({
        dx: clampNum(circle.dx, 0),
        dy: clampNum(circle.dy, 0),
        r: Math.max(2, clampNum(circle.r, index === 0 ? e.radius : Math.max(5, e.radius * 0.65)))
      }))
    : makeDefaultEnemyBodyCircles(e.radius);
  e.innerArtifacts = Array.isArray(e.innerArtifacts)
    ? e.innerArtifacts.map(artifact => ({
        dx: clampNum(artifact.dx, 0),
        dy: clampNum(artifact.dy, 0),
        radius: Math.max(2, clampNum(artifact.radius, Math.max(4, e.radius * 0.28))),
        spriteIndex: Math.min(ENEMY_SPRITE_INDEX_MAX, normalizeSpriteIndex(artifact.spriteIndex, 1))
      }))
    : [];
  e.radius = Math.max(2, clampNum(e.bodyCircles[0]?.r, e.radius));
}

function ensureMacrophageDefaults(e) {
  if (!e || e.type !== 'Macrophage') return;
  e.radius = Math.max(5, clampNum(e.radius, 38));
  e.instanceIndex = Math.max(1, Math.round(clampNum(e.instanceIndex, 1)));
  e.spriteIndex = normalizeSpriteIndex(e.spriteIndex, e.instanceIndex || 1);
  const fallbackRange = Array.isArray(e.rotationRange) && e.rotationRange.length === 2
    ? [clampNum(e.rotationRange[0], -30), clampNum(e.rotationRange[1], 30)]
    : [-30, 30];
  const mouth = (e.mouth && typeof e.mouth === 'object') ? e.mouth : {};
  const cilia = (mouth.cilia && typeof mouth.cilia === 'object') ? mouth.cilia : {};
  e.mouth = {
    enabled: mouth.enabled ?? true,
    turnEnabled: mouth.turnEnabled ?? true,
    absorbRadius: Math.max(2, clampNum(mouth.absorbRadius ?? e.mouthAbsorbRadius, 22)),
    offsetDistance: Math.max(0, clampNum(mouth.offsetDistance ?? e.mouthOffsetDistance, Math.max(e.radius, 24))),
    turnRate: clampNum(mouth.turnRate, 0.05),
    idleSpin: clampNum(mouth.idleSpin, 0.01),
    rotationDir: Math.max(-1, Math.min(1, clampNum(mouth.rotationDir ?? e.rotationDir, 1))),
    rotationRange: Array.isArray(mouth.rotationRange) && mouth.rotationRange.length === 2
      ? [
          clampNum(mouth.rotationRange[0], fallbackRange[0]),
          clampNum(mouth.rotationRange[1], fallbackRange[1])
        ]
      : fallbackRange,
    cilia: {
      ...makeDefaultMacrophageMouthCilia(),
      enabled: cilia.enabled ?? true,
      count: Math.max(0, Math.round(clampNum(cilia.count, 22))),
      lengthScale: Math.max(0, clampNum(cilia.lengthScale, 0.2)),
      waveAmount: Math.max(0, clampNum(cilia.waveAmount, 0.55)),
      waveSpeed: Math.max(0, clampNum(cilia.waveSpeed, 0.003)),
      curl: clampNum(cilia.curl, 0.1),
      lineWidth: Math.max(0.1, clampNum(cilia.lineWidth, 1.3)),
      alpha: Math.max(0, Math.min(1, clampNum(cilia.alpha, 1))),
      arcEnabled: cilia.arcEnabled ?? false,
      arcCenterDeg: normalizeSignedDeg(clampNum(cilia.arcCenterDeg, 0)),
      arcSpreadDeg: Math.max(0, Math.min(360, clampNum(cilia.arcSpreadDeg, 120)))
    }
  };
  e.rotationDir = e.mouth.rotationDir;
  e.rotationRange = `[${Math.round(e.mouth.rotationRange[0])},${Math.round(e.mouth.rotationRange[1])}]`;
  e.mouthAbsorbRadius = e.mouth.absorbRadius;
  e.mouthOffsetDistance = e.mouth.offsetDistance;
  const bodyCilia = (e.bodyCilia && typeof e.bodyCilia === 'object') ? e.bodyCilia : {};
  e.bodyCilia = {
    ...makeDefaultMacrophageBodyCilia(),
    ...bodyCilia,
    enabled: bodyCilia.enabled ?? false,
    count: Math.max(0, Math.round(clampNum(bodyCilia.count, 96))),
    lengthScale: Math.max(0, clampNum(bodyCilia.lengthScale, 0.16)),
    waveAmount: Math.max(0, clampNum(bodyCilia.waveAmount, 0.55)),
    waveSpeed: Math.max(0, clampNum(bodyCilia.waveSpeed, 0.0025)),
    curl: clampNum(bodyCilia.curl, 0.08),
    lineWidth: Math.max(0.1, clampNum(bodyCilia.lineWidth, 1.1)),
    alpha: Math.max(0, Math.min(1, clampNum(bodyCilia.alpha, 0.82))),
    splineOffset: clampNum(bodyCilia.splineOffset, 3),
    splineSamples: Math.max(12, Math.round(clampNum(bodyCilia.splineSamples, 96))),
    segments: Array.isArray(bodyCilia.segments) && bodyCilia.segments.length
      ? bodyCilia.segments.map(segment => ({
          enabled: segment?.enabled ?? true,
          start: Math.max(0, Math.min(1, clampNum(segment?.start, 0))),
          end: Math.max(0, Math.min(1, clampNum(segment?.end, 1)))
        })).filter(segment => Math.abs(segment.end - segment.start) > 0.0001)
      : [{ enabled: true, start: 0, end: 1 }]
  };
  const bodyRotation = (e.bodyRotation && typeof e.bodyRotation === 'object') ? e.bodyRotation : {};
  const idleWave = (bodyRotation.idleWave && typeof bodyRotation.idleWave === 'object')
    ? bodyRotation.idleWave
    : {};
  const movementFollow = (bodyRotation.movementFollow && typeof bodyRotation.movementFollow === 'object')
    ? bodyRotation.movementFollow
    : {};
  e.bodyRotation = {
    ...makeDefaultMacrophageBodyRotation(),
    ...bodyRotation,
    enabled: bodyRotation.enabled ?? false,
    idleSpin: clampNum(bodyRotation.idleSpin, 0),
    idleWave: {
      ...makeDefaultMacrophageBodyRotation().idleWave,
      ...idleWave,
      enabled: idleWave.enabled ?? false,
      amount: Math.max(0, Math.min(1, clampNum(idleWave.amount, 0.35))),
      speedHz: Math.max(0, clampNum(idleWave.speedHz, 0.45))
    },
    rotationMode: bodyRotation.rotationMode === 'loop' ? 'loop' : 'pingpong',
    rotationDir: Math.max(-1, Math.min(1, clampNum(bodyRotation.rotationDir, 1))),
    baseAngleDeg: normalizeSignedDeg(clampNum(bodyRotation.baseAngleDeg, 0)),
    rotationRange: normalizeMacrophageBodyRotationRange(
      bodyRotation.rotationRange,
      bodyRotation.baseAngleDeg ?? 0,
      [-180, 180]
    ),
    movementFollow: {
      ...makeDefaultMacrophageBodyRotation().movementFollow,
      ...movementFollow,
      enabled: movementFollow.enabled ?? false,
      strength: Math.max(0, Math.min(1, clampNum(movementFollow.strength, 0.35))),
      smoothing: Math.max(0, Math.min(1, clampNum(movementFollow.smoothing, 0.08))),
      minSpeed: Math.max(0, clampNum(movementFollow.minSpeed, 0.18))
    },
    pivotDx: clampNum(bodyRotation.pivotDx, 0),
    pivotDy: clampNum(bodyRotation.pivotDy, 0),
    pivotRadius: Math.max(4, clampNum(bodyRotation.pivotRadius, 12))
  };
  const orbit = (e.orbit && typeof e.orbit === 'object') ? e.orbit : {};
  e.orbit = {
    ...makeDefaultMacrophageOrbit(),
    ...orbit,
    mode: ['orbit', 'segments', 'spline', 'free'].includes(orbit.mode) ? orbit.mode : (Array.isArray(orbit.splinePoints) && orbit.splinePoints.length > 2 ? 'spline' : (Array.isArray(orbit.segments) && orbit.segments.length ? 'segments' : 'orbit')),
    enabled: orbit.enabled ?? false,
    centerDx: clampNum(orbit.centerDx, 0),
    centerDy: clampNum(orbit.centerDy, 0),
    radius: Math.max(0, clampNum(orbit.radius, 0)),
    speed: clampNum(orbit.speed, 0.01),
    loop: orbit.loop ?? true,
    segments: Array.isArray(orbit.segments)
      ? orbit.segments.map(segment => makeDefaultMacrophageOrbitSegment(segment))
      : [],
    splinePoints: Array.isArray(orbit.splinePoints) && orbit.splinePoints.length > 2
      ? orbit.splinePoints.map(point => ({
          dx: clampNum(point?.dx, 0),
          dy: clampNum(point?.dy, 0)
        }))
      : makeDefaultMacrophageOrbitSplinePoints(Math.max(orbit.radius ?? 0, e.radius * 2.4, 80)),
    freeMove: makeDefaultMacrophageFreeMove(orbit.freeMove)
  };
  const absorbTargets = (e.absorbTargets && typeof e.absorbTargets === 'object') ? e.absorbTargets : {};
  e.absorbTargets = {
    ...makeDefaultMacrophageAbsorbTargets(),
    ...absorbTargets,
    particle: absorbTargets.particle ?? true,
    projectile: absorbTargets.projectile ?? false,
    player: absorbTargets.player ?? false,
    enemy: absorbTargets.enemy ?? false
  };
  const eggSpawn = (e.eggSpawn && typeof e.eggSpawn === 'object') ? e.eggSpawn : {};
  const germination = (e.germination && typeof e.germination === 'object') ? e.germination : {};
  const projectileSpawn = (e.projectileSpawn && typeof e.projectileSpawn === 'object') ? e.projectileSpawn : {};
  const growth = (e.growth && typeof e.growth === 'object') ? e.growth : {};
  const fallbackPath = makeDefaultMacrophageDigestPath(e.radius, e.mouth.offsetDistance);
  if (e.digestPath && typeof e.digestPath === 'object') {
    const fallbackControlKeys = getMacrophageDigestControlKeys(fallbackPath);
    const sourceControlKeys = getMacrophageDigestControlKeys(e.digestPath);
    const activeControlKeys = sourceControlKeys.length > 0 ? sourceControlKeys : fallbackControlKeys;
    const normalizedDigestPath = {
      start: {
        dx: clampNum(e.digestPath.start?.dx, fallbackPath.start.dx),
        dy: clampNum(e.digestPath.start?.dy, fallbackPath.start.dy)
      }
    };
    activeControlKeys.forEach((key, index) => {
      const fallbackKey = fallbackControlKeys[Math.min(index, fallbackControlKeys.length - 1)] ?? 'c2';
      normalizedDigestPath[key] = {
        dx: clampNum(e.digestPath[key]?.dx, fallbackPath[fallbackKey]?.dx ?? fallbackPath.c2.dx),
        dy: clampNum(e.digestPath[key]?.dy, fallbackPath[fallbackKey]?.dy ?? fallbackPath.c2.dy)
      };
    });
    normalizedDigestPath.end = {
      dx: clampNum(e.digestPath.end?.dx, fallbackPath.end.dx),
      dy: clampNum(e.digestPath.end?.dy, fallbackPath.end.dy)
    };
    e.digestPath = normalizedDigestPath;
  } else {
    e.digestPath = fallbackPath;
  }
  e.bodyCircles = Array.isArray(e.bodyCircles) && e.bodyCircles.length
    ? e.bodyCircles.map((circle, index) => ({
        dx: clampNum(circle.dx, 0),
        dy: clampNum(circle.dy, 0),
        r: Math.max(2, clampNum(circle.r, index === 0 ? e.radius : Math.max(5, e.radius * 0.55)))
      }))
    : makeDefaultMacrophageBodyCircles(e.radius);
  e.radius = Math.max(2, clampNum(e.bodyCircles[0]?.r, e.radius));
  const germinationStartScale = Math.max(0.1, Math.min(0.95, clampNum(germination.startScale, 0.34)));
  e.eggSpawn = {
    ...makeDefaultMacrophageEggSpawn(),
    ...eggSpawn,
    bodyCircleIndex: Math.max(0, Math.min(e.bodyCircles.length - 1, Math.round(clampNum(eggSpawn.bodyCircleIndex, Math.min(1, e.bodyCircles.length - 1))))),
    angleDeg: normalizeSignedDeg(clampNum(eggSpawn.angleDeg, 25)),
    feedCount: Math.max(1, Math.round(clampNum(eggSpawn.feedCount, 6)))
  };
  e.germination = {
    ...makeDefaultMacrophageGermination(),
    ...germination,
    enabled: germination.enabled ?? false,
    bodyCircleIndex: Math.max(0, Math.min(e.bodyCircles.length - 1, Math.round(clampNum(germination.bodyCircleIndex, Math.min(2, e.bodyCircles.length - 1))))),
    angleDeg: normalizeSignedDeg(clampNum(germination.angleDeg, -30)),
    feedCount: Math.max(1, Math.round(clampNum(germination.feedCount, 10))),
    startScale: germinationStartScale,
    growthRate: Math.max(0.001, clampNum(germination.growthRate, 0.08)),
    detachScale: Math.max(germinationStartScale, Math.min(1, clampNum(germination.detachScale, 0.6))),
    launchSpeed: Math.max(0, clampNum(germination.launchSpeed, 0.35)),
    mirrorOffspringX: germination.mirrorOffspringX ?? false,
    launchJitter: Math.max(0, Math.min(1, clampNum(germination.launchJitter, 0.18))),
    initialAngleJitterDeg: Math.max(0, clampNum(germination.initialAngleJitterDeg, 8)),
    mouthWakeDelayMs: Math.max(0, Math.round(clampNum(germination.mouthWakeDelayMs, 260)))
  };
  e.projectileSpawn = {
    ...makeDefaultMacrophageProjectileSpawn(),
    ...projectileSpawn,
    bodyCircleIndex: Math.max(0, Math.min(e.bodyCircles.length - 1, Math.round(clampNum(projectileSpawn.bodyCircleIndex, 0)))),
    angleDeg: normalizeSignedDeg(clampNum(projectileSpawn.angleDeg, 180))
  };
  e.growth = {
    ...makeDefaultMacrophageGrowth(),
    ...growth,
    enabled: growth.enabled ?? false,
    perAbsorb: Math.max(0, clampNum(growth.perAbsorb, 0.6)),
    maxRadius: Math.max(e.radius, clampNum(growth.maxRadius, 76)),
    growthRate: Math.max(0.001, clampNum(growth.growthRate, 0.03))
  };
  e.gitParticleRadius = Math.max(0.4, clampNum(e.gitParticleRadius, e.radius / 8));
  e.spriteScale = clampNum(e.spriteScale, 1.18);
  e.spriteFlipX = !!e.spriteFlipX;
  e.spriteRotationOffset = clampNum(e.spriteRotationOffset, 0);
  e.spriteBodyU = clampNum(e.spriteBodyU, 0.5);
  e.spriteBodyV = clampNum(e.spriteBodyV, 0.5);
  e.spriteSubfolder = typeof e.spriteSubfolder === 'string' ? e.spriteSubfolder : '';
  e.spriteAnimationEnabled = e.spriteAnimationEnabled ?? true;
  e.spriteAnimationSubfolder = e.spriteAnimationSubfolder ?? e.spriteSubfolder ?? '';
  e.spriteAnimationFrames = Math.max(1, Math.round(clampNum(e.spriteAnimationFrames, 5)));
  e.spriteAnimationStart = normalizeSpriteIndex(e.spriteAnimationStart, 1);
  e.spriteAnimationFps = Math.max(1, clampNum(e.spriteAnimationFps, 12));
  e.spriteAnimationMode = e.spriteAnimationMode === 'pingpong' ? 'pingpong' : 'loop';
  e.spriteAnimationPadding = Math.max(1, Math.round(clampNum(e.spriteAnimationPadding, 5)));

  for (const path of buildMacrophageSequencePathCandidates(e, e.spriteAnimationStart)) {
    getEditorImageByPath(path);
  }
}

function ensureComposedStoneDefaults(e) {
  if (!e || e.type !== 'ComposedStone') return;
  const prevSpriteIndex = e.spriteIndex;
  const prevInstanceIndex = e.instanceIndex;
  e.instanceIndex = Math.max(1, Math.round(clampNum(e.instanceIndex, 1)));
  e.spriteIndex = normalizeSpriteIndex(e.spriteIndex, e.instanceIndex || 1);
  e.radius = Math.max(5, clampNum(e.radius, 34));
  e.spriteScale = clampNum(e.spriteScale, 1.18);
  e.spriteFlipX = !!e.spriteFlipX;
  e.spriteRotationOffset = clampNum(e.spriteRotationOffset, 0);
  e.spriteBodyU = clampNum(e.spriteBodyU, 0.5);
  e.spriteBodyV = clampNum(e.spriteBodyV, 0.5);
  e.spriteDebug = e.spriteDebug == null ? true : !!e.spriteDebug;
  e.spriteSubfolder = typeof e.spriteSubfolder === 'string' ? e.spriteSubfolder : '';
  syncComposedStoneSpriteSubfolder(e, prevSpriteIndex, prevInstanceIndex);
  e.circles = Array.isArray(e.circles) && e.circles.length
    ? e.circles.map(circle => ({
        dx: clampNum(circle.dx, 0),
        dy: clampNum(circle.dy, 0),
        r: Math.max(2, clampNum(circle.r, e.radius))
      }))
    : makeDefaultComposedStoneCircles(e.radius);
  e.radius = getComposedStoneMetrics(e, e.circles).boundingRadius;
  e.spriteReferenceRadius = getComposedStoneSpriteReferenceRadius(e);
}

function ensureAlgaeDefaults(e) {
  if (!e || e.type !== 'Algae') return;
  const prevSpriteIndex = e.spriteIndex;
  const prevInstanceIndex = e.instanceIndex;
  e.name = typeof e.name === 'string' && e.name.trim() ? e.name.trim() : 'Algae';
  e.instanceIndex = Math.max(1, Math.round(clampNum(e.instanceIndex, 1)));
  e.spriteIndex = normalizeSpriteIndex(e.spriteIndex, e.instanceIndex || 1);
  e.radius = Math.max(5, clampNum(e.radius, 30));
  e.spriteScale = clampNum(e.spriteScale, 1.08);
  e.spriteFlipX = !!e.spriteFlipX;
  e.spriteRotationOffset = clampNum(e.spriteRotationOffset, 0);
  e.spriteBodyU = clampNum(e.spriteBodyU, 0.5);
  e.spriteBodyV = clampNum(e.spriteBodyV, 0.5);
  e.spriteDebug = e.spriteDebug == null ? false : !!e.spriteDebug;
  e.spriteSubfolder = typeof e.spriteSubfolder === 'string' ? e.spriteSubfolder : '';
  syncAlgaeSpriteSubfolder(e, prevSpriteIndex, prevInstanceIndex);
  e.circles = Array.isArray(e.circles) && e.circles.length
    ? e.circles.map(circle => ({
        dx: clampNum(circle.dx, 0),
        dy: clampNum(circle.dy, 0),
        r: Math.max(2, clampNum(circle.r, e.radius))
    }))
    : makeDefaultAlgaeCircles(e.radius);
  e.radius = getAlgaeMetrics(e, e.circles).boundingRadius;
  e.spriteReferenceRadius = getAlgaeSpriteReferenceRadius(e);
  const germination = (e.germination && typeof e.germination === 'object') ? e.germination : {};
  const germinationStartScale = Math.max(0.1, Math.min(0.95, clampNum(germination.startScale, 0.34)));
  e.germination = {
    ...makeDefaultAlgaeGermination(),
    ...germination,
    enabled: germination.enabled ?? false,
    bodyCircleIndex: Math.max(0, Math.min(e.circles.length - 1, Math.round(clampNum(germination.bodyCircleIndex, Math.min(2, e.circles.length - 1))))),
    angleDeg: normalizeSignedDeg(clampNum(germination.angleDeg, -30)),
    feedCount: Math.max(1, Math.round(clampNum(germination.feedCount, 10))),
    startScale: germinationStartScale,
    growthRate: Math.max(0.001, clampNum(germination.growthRate, 0.08)),
    detachScale: Math.max(germinationStartScale, Math.min(1, clampNum(germination.detachScale, 0.6))),
    launchSpeed: Math.max(0, clampNum(germination.launchSpeed, 0.35)),
    mirrorOffspringX: germination.mirrorOffspringX ?? false,
    launchJitter: Math.max(0, Math.min(1, clampNum(germination.launchJitter, 0.18))),
    initialAngleJitterDeg: Math.max(0, clampNum(germination.initialAngleJitterDeg, 8))
  };
  e.absorbImpulseTransfer = Math.max(0, clampNum(e.absorbImpulseTransfer, 0.12));
  e.maxStoredProjectiles = Math.max(1, Math.round(clampNum(e.maxStoredProjectiles, 18)));
  e.productionPerProjectile = Math.max(1, Math.round(clampNum(e.productionPerProjectile, 1)));
  e.productionIntervalMs = Math.max(16, Math.round(clampNum(e.productionIntervalMs, 420)));
  e.maxProducedPerTick = Math.max(1, Math.round(clampNum(e.maxProducedPerTick, 2)));
  e.particleRadius = Math.max(0.5, clampNum(e.particleRadius, 3.4));
  e.particleSpeed = Math.max(0, clampNum(e.particleSpeed, 1.45));
  e.particleSpread = Math.max(0, clampNum(e.particleSpread, 0.9));
  e.particleColor = typeof e.particleColor === 'string' && e.particleColor.trim()
    ? e.particleColor
    : 'rgba(110, 226, 140, 0.88)';
  e.particleSpriteIndex = normalizeSpriteIndex(e.particleSpriteIndex, 1);
  e.particleTintGroup = e.particleTintGroup === 'red' ? 'red' : 'green';
  e.storedProjectiles = Math.max(0, Math.round(clampNum(e.storedProjectiles, 0)));
}

function ensureComposedEntityDefaults(e) {
  if (!e || e.type !== 'ComposedEntity') return;
  e.name = typeof e.name === 'string' && e.name.trim() ? e.name.trim() : 'ComposedEntity';
  e.anchorMode = e.anchorMode === 'top-left' ? 'top-left' : 'top-left';
  e.entities = Array.isArray(e.entities) ? e.entities.map(child => ({ ...child })) : [];
  const bounds = e.bounds && typeof e.bounds === 'object' ? e.bounds : {};
  e.width = Math.max(12, clampNum(e.width, bounds.width ?? 80));
  e.height = Math.max(12, clampNum(e.height, bounds.height ?? 80));
  e.bounds = {
    minX: clampNum(bounds.minX, 0),
    minY: clampNum(bounds.minY, 0),
    maxX: clampNum(bounds.maxX, e.width),
    maxY: clampNum(bounds.maxY, e.height),
    width: e.width,
    height: e.height
  };
  e.spriteIndex = normalizeSpriteIndex(e.spriteIndex, 1);
  e.spriteScale = clampNum(e.spriteScale, 1);
  e.spriteRotationOffset = clampNum(e.spriteRotationOffset, 0);
  e.spriteBodyU = clampNum(e.spriteBodyU, 0);
  e.spriteBodyV = clampNum(e.spriteBodyV, 0);
  e.spriteSubfolder = getComposedEntitySpriteFolderName(e, e.spriteSubfolder);
  e.spriteDebug = e.spriteDebug == null ? true : !!e.spriteDebug;
  e.spriteReferenceRadius = Math.max(2, clampNum(e.spriteReferenceRadius, Math.max(e.width, e.height) * 0.5));
  e.radius = computeComposedEntityMetrics(e).radius;
}

function ensureParticleDefaults(e) {
  if (!e || e.type !== 'Particle') return;
  e.spriteIndex = Math.min(5, normalizeSpriteIndex(e.spriteIndex, 1));
}

function ensurePlayerDefaults(e) {
  if (!e || e.type !== 'Player') return;
  e.collisionProfile = normalizePlayerCollisionProfile(e.collisionProfile);
  delete e.circles;
  delete e.bodyCircles;
}

function ensureParticleZoneDefaults(e) {
  if (!e || e.type !== 'ParticleZone') return;
  e.minSize = clampNum(e.minSize, 10);
  e.maxSize = Math.max(e.minSize, clampNum(e.maxSize, 25));
  e.spawnIntervalMs = Math.max(80, Math.round(clampNum(e.spawnIntervalMs, 1800)));
  e.growthDurationMs = Math.max(0, Math.round(clampNum(e.growthDurationMs, 1200)));
  e.spriteIndex = Math.min(5, normalizeSpriteIndex(e.spriteIndex ?? e.spriteIndexMin, 1));
  e.spawnArcCenterDeg = normalizeSignedDeg(clampNum(e.spawnArcCenterDeg, 0));
  e.spawnArcSpanDeg = Math.max(0, Math.min(360, clampNum(e.spawnArcSpanDeg, 360)));
}

function ensureCystDefaults(e) {
  if (!e || e.type !== 'Cyst') return;
  const fallbackRadius = Math.max(1, clampNum(getEntityType('Cyst')?.defaultRadius, CYST_DEFAULT_RADIUS));
  e.radius = Math.max(1, clampNum(e.radius, fallbackRadius));
  e.displayRadius = Math.max(1, clampNum(e.displayRadius, e.radius));
  e.targetRadius = Math.max(1, clampNum(e.targetRadius, e.radius));
  e.detached = e.detached !== false;
  e.isCyst = true;
  e.hatching = false;
  e.hatched = false;
  e.merged = false;
  e.spriteAlpha = Math.max(0, Math.min(1, clampNum(e.spriteAlpha, CYST_DEFAULT_ALPHA)));
}

function getEnemyMouthAngleRad(e) {
  ensureEnemyDefaults(e);
  return clampNum(e.mouthRestAngle, 0);
}

function radToDeg(rad) { return (Number(rad || 0) * 180) / Math.PI; }
function degToRad(deg) { return (Number(deg || 0) * Math.PI) / 180; }

function getEntitySpritePath(entity) {
  if (!entity) return null;

  if (entity.type === 'Enemy') {
    return getEnemySpritePath(entity);
  }

  if (entity.type === 'Macrophage') {
    return getMacrophageSpritePath(entity);
  }

  if (entity.type === 'ComposedStone') {
    return getComposedStoneSpriteCalPath(entity);
  }

  if (entity.type === 'Algae') {
    return getAlgaeSpriteCalPath(entity);
  }

  if (entity.type === 'ComposedEntity') {
    return buildComposedEntitySpritePathCandidates(entity)[0];
  }

  if (entity.type === 'Egg') {
    return buildEditorSpritePath({
      folder: 'Egg',
      family: 'egg',
      index: normalizeSpriteIndex(entity.spriteIndex, 1)
    });
  }

  return null;
}

function ensureSpriteCalState() {
  if (spriteCalState) return spriteCalState;
  spriteCalState = {
    open: false,
    entityType: 'Enemy',
    baseRadius: 25,
    baseCircles: null,
    baseChildren: null,
    objectUrl: null,
    img: new Image(),
    sourceLabel: 'source: none',
    pos: { x: 120, y: 120 },
    values: {
      radius: 25,
      spriteScale: 1.41,
      spriteRotationOffset: 0.25,
      simAngle: 0,
      spriteBodyU: 0.41,
      spriteBodyV: 0.423,
    }
  };
  return spriteCalState;
}

function buildSpriteCalControls() {
  const wrapEl = document.getElementById('sprite-cal-controls');
  if (!wrapEl || wrapEl.childElementCount) return;
  wrapEl.innerHTML = `<div class="sprite-cal-section-title">Controls</div>`;
  for (const field of SPRITE_CAL_FIELDS) {
    const row = document.createElement('div');
    row.className = 'sprite-cal-row';
    row.innerHTML = `
      <label>${field.label}</label>
      <input type="range" data-sprite-cal="${field.key}" min="${field.min}" max="${field.max}" step="${field.step}" />
      <span class="val" id="sprite-cal-val-${field.key}"></span>
    `;
    wrapEl.appendChild(row);
  }
  wrapEl.addEventListener('input', e => {
    const key = e.target?.dataset?.spriteCal;
    if (!key || !spriteCalState) return;
    spriteCalState.values[key] = Number(e.target.value);
    syncSpriteCalControlValues();
    renderSpriteCalibrator();
  });
}

function syncSpriteCalControlValues() {
  const state = ensureSpriteCalState();
  const visibleFields = (state.entityType === 'ComposedStone' || state.entityType === 'Algae' || state.entityType === 'ComposedEntity')
    ? SPRITE_CAL_FIELDS.filter(field => !['simAngle'].includes(field.key))
    : SPRITE_CAL_FIELDS;
  for (const field of SPRITE_CAL_FIELDS) {
    const input = document.querySelector(`[data-sprite-cal="${field.key}"]`);
    const val = document.getElementById(`sprite-cal-val-${field.key}`);
    const active = visibleFields.includes(field);
    if (input) {
      input.value = String(state.values[field.key]);
      input.disabled = !active;
      input.closest('.sprite-cal-row')?.style.setProperty('display', active ? 'grid' : 'none');
    }
    if (val) val.textContent = Number(state.values[field.key]).toFixed(field.decimals);
  }
  const out = document.getElementById('sprite-cal-output');
  if (out) {
    out.textContent = (state.entityType === 'ComposedStone' || state.entityType === 'Algae')
? `spriteScale: ${state.values.spriteScale.toFixed(3)}
spriteRotationOffset: ${state.values.spriteRotationOffset.toFixed(3)}
spriteBodyU: ${state.values.spriteBodyU.toFixed(3)}
spriteBodyV: ${state.values.spriteBodyV.toFixed(3)}`
: `spriteScale: ${state.values.spriteScale.toFixed(3)}
spriteRotationOffset: ${state.values.spriteRotationOffset.toFixed(3)}
spriteBodyU: ${state.values.spriteBodyU.toFixed(3)}
spriteBodyV: ${state.values.spriteBodyV.toFixed(3)}`;
  }
  const source = document.getElementById('sprite-cal-source-label');
  if (source) source.textContent = state.sourceLabel;
}

function renderSpriteCalibrator() {
  const state = ensureSpriteCalState();
  const W = spriteCalCanvas.width;
  const H = spriteCalCanvas.height;
  spriteCalCtx.clearRect(0, 0, W, H);

  const { radius, spriteScale, spriteRotationOffset, simAngle, spriteBodyU, spriteBodyV } = state.values;
  const cx = W / 2;
  const cy = H / 2;
  const baseRadius = Math.max(0.0001, clampNum(state.baseRadius, radius));
  const circleScale = radius / baseRadius;
  const sourceW = state.img.naturalWidth || 1280;
  const sourceH = state.img.naturalHeight || 1024;
  const drawW = radius * spriteScale * 2.0;
  const drawH = drawW * (sourceH / Math.max(sourceW, 1));
  const anchorX = drawW * spriteBodyU;
  const anchorY = drawH * spriteBodyV;
  const totalAngle = ((state.entityType === 'Enemy' || state.entityType === 'Macrophage') ? simAngle : 0) + spriteRotationOffset;

  spriteCalCtx.save();
  spriteCalCtx.translate(cx, cy);
  spriteCalCtx.rotate(totalAngle);
  if (state.img.complete && state.img.naturalWidth) {
    spriteCalCtx.drawImage(state.img, -anchorX, -anchorY, drawW, drawH);
  }
  spriteCalCtx.strokeStyle = 'rgba(130,230,245,0.75)';
  spriteCalCtx.lineWidth = 1.2;
  spriteCalCtx.strokeRect(-anchorX, -anchorY, drawW, drawH);
  spriteCalCtx.restore();

  spriteCalCtx.beginPath();
  spriteCalCtx.arc(cx, cy, radius, 0, Math.PI * 2);
  spriteCalCtx.strokeStyle = 'rgba(130,230,245,0.72)';
  spriteCalCtx.lineWidth = 2;
  spriteCalCtx.stroke();
  spriteCalCtx.beginPath();
  spriteCalCtx.moveTo(cx - 10, cy);
  spriteCalCtx.lineTo(cx + 10, cy);
  spriteCalCtx.moveTo(cx, cy - 10);
  spriteCalCtx.lineTo(cx, cy + 10);
  spriteCalCtx.stroke();

  if ((state.entityType === 'Enemy' || state.entityType === 'Macrophage') && Array.isArray(state.baseCircles) && state.baseCircles.length) {
    const cos = Math.cos(simAngle);
    const sin = Math.sin(simAngle);
    spriteCalCtx.save();
    spriteCalCtx.strokeStyle = state.entityType === 'Macrophage' ? 'rgba(230,205,255,0.95)' : 'rgba(255,200,80,0.95)';
    spriteCalCtx.fillStyle = state.entityType === 'Macrophage' ? 'rgba(210,140,255,0.12)' : 'rgba(255,140,0,0.10)';
    for (let i = state.baseCircles.length - 1; i >= 0; i--) {
      const circle = state.baseCircles[i];
      const localDx = clampNum(circle.dx, 0) * circleScale;
      const localDy = clampNum(circle.dy, 0) * circleScale;
      const cr = Math.max(2, clampNum(circle.r, i === 0 ? baseRadius : baseRadius * 0.65) * circleScale);
      const worldX = cx + localDx * cos - localDy * sin;
      const worldY = cy + localDx * sin + localDy * cos;
      spriteCalCtx.beginPath();
      spriteCalCtx.arc(worldX, worldY, cr, 0, Math.PI * 2);
      spriteCalCtx.lineWidth = i === 0 ? 2.4 : 1.8;
      spriteCalCtx.fill();
      spriteCalCtx.stroke();
    }
    spriteCalCtx.restore();
  }

  if ((state.entityType === 'ComposedStone' || state.entityType === 'Algae') && Array.isArray(state.baseCircles) && state.baseCircles.length) {
    spriteCalCtx.save();
    spriteCalCtx.strokeStyle = state.entityType === 'Algae' ? 'rgba(160,245,190,0.96)' : 'rgba(231,220,200,0.95)';
    spriteCalCtx.fillStyle = state.entityType === 'Algae' ? 'rgba(110,226,140,0.08)' : 'rgba(231,220,200,0.08)';
    for (let i = state.baseCircles.length - 1; i >= 0; i--) {
      const circle = state.baseCircles[i];
      const cr = Math.max(2, clampNum(circle.r, 20) * circleScale);
      const cdx = clampNum(circle.dx, 0) * circleScale;
      const cdy = clampNum(circle.dy, 0) * circleScale;
      spriteCalCtx.beginPath();
      spriteCalCtx.arc(cx + cdx, cy + cdy, cr, 0, Math.PI * 2);
      spriteCalCtx.lineWidth = i === 0 ? 2.4 : 1.8;
      spriteCalCtx.fill();
      spriteCalCtx.stroke();
    }
    spriteCalCtx.restore();
  }

  if (state.entityType === 'ComposedEntity' && Array.isArray(state.baseChildren) && state.baseChildren.length) {
    spriteCalCtx.save();
    for (const child of state.baseChildren) {
      const color = getEntityType(child.type)?.color ?? 'rgba(220,220,220,0.72)';
      const px = cx + clampNum(child.offsetX, 0) * circleScale * 2;
      const py = cy + clampNum(child.offsetY, 0) * circleScale * 2;
      const r = Math.max(3, clampNum(child.radius, 14) * 0.18 * circleScale);
      spriteCalCtx.beginPath();
      spriteCalCtx.arc(px, py, r, 0, Math.PI * 2);
      spriteCalCtx.fillStyle = color;
      spriteCalCtx.fill();
    }
    spriteCalCtx.restore();
  }

}

function openSpriteCalibrator() {
  const sel = getSelected();
  const activeComposedEntityPreset = activeTool === 'ComposedEntity'
    ? entityPresetsByType.ComposedEntity?.find(p => p.id === activeEntityPreset.ComposedEntity) ?? entityPresetsByType.ComposedEntity?.[0] ?? null
    : null;
  const target = activeComposedEntityPreset?.data ?? sel;
  if (!target || !['Enemy', 'ComposedStone', 'Algae', 'Macrophage', 'ComposedEntity'].includes(target.type)) return;
  if (target.type === 'ComposedEntity') ensureComposedEntityDefaults(target);
  if (sel?.type === 'Enemy') ensureEnemyDefaults(sel);
  if (sel?.type === 'ComposedStone') ensureComposedStoneDefaults(sel);
  if (sel?.type === 'Algae') ensureAlgaeDefaults(sel);
  if (sel?.type === 'Macrophage') ensureMacrophageDefaults(sel);
  buildSpriteCalControls();
  const state = ensureSpriteCalState();
  state.open = true;
  state.entityType = target.type;
  state.baseRadius = target.type === 'ComposedStone'
    ? getComposedStoneSpriteReferenceRadius(target)
    : target.type === 'Algae'
      ? getAlgaeSpriteReferenceRadius(target)
    : target.type === 'ComposedEntity'
      ? clampNum(target.spriteReferenceRadius, Math.max(target.width, target.height) * 0.5)
      : target.radius;
  state.baseCircles = target.type === 'ComposedStone' || target.type === 'Algae'
    ? structuredClone(target.circles ?? [])
    : structuredClone(target.bodyCircles ?? []);
  state.baseChildren = target.type === 'ComposedEntity'
    ? structuredClone(target.entities ?? [])
    : null;
  state.values = {
    radius: target.type === 'ComposedStone'
      ? getComposedStoneSpriteReferenceRadius(target)
      : target.type === 'Algae'
        ? getAlgaeSpriteReferenceRadius(target)
      : target.type === 'ComposedEntity'
        ? clampNum(target.spriteReferenceRadius, Math.max(target.width, target.height) * 0.5)
        : target.radius,
    spriteScale: target.spriteScale,
    spriteRotationOffset: target.spriteRotationOffset,
    simAngle: 0,
    spriteBodyU: target.spriteBodyU,
    spriteBodyV: target.spriteBodyV,
  };
  const spriteCalPath = target.type === 'Enemy'
    ? getEnemySpriteCalPath(target)
    : target.type === 'Macrophage'
      ? getMacrophageSpriteCalPath(target)
      : target.type === 'ComposedStone'
        ? getComposedStoneSpriteCalPath(target)
        : target.type === 'Algae'
          ? getAlgaeSpriteCalPath(target)
        : getEntitySpritePath(target);
  state.sourceLabel = `source: ${spriteCalPath}`;
  syncSpriteCalControlValues();
  const overlay = document.getElementById('sprite-cal-overlay');
  const modal = document.getElementById('sprite-cal-modal');
  overlay.style.display = 'flex';
  overlay.style.pointerEvents = 'none';
  modal.style.pointerEvents = 'auto';
  modal.style.left = `${state.pos.x}px`;
  modal.style.top = `${state.pos.y}px`;
  loadSpriteCalImage(spriteCalPath, spriteCalPath);
}

function closeSpriteCalibrator() {
  const overlay = document.getElementById('sprite-cal-overlay');
  if (overlay) overlay.style.display = 'none';
  if (spriteCalState) spriteCalState.open = false;
  spriteCalDrag = null;
}

function loadSpriteCalImage(src, label = src) {
  const state = ensureSpriteCalState();
  if (state.objectUrl && state.objectUrl !== src) {
    URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = null;
  }
  state.sourceLabel = `source: ${label}`;
  state.img = new Image();
  state.img.onload = () => {
    syncSpriteCalControlValues();
    renderSpriteCalibrator();
  };
  state.img.onerror = () => {
    // Fallback for current flat asset layout before Enemy_XX subfolders exist.
    if (typeof src === 'string' && (src.includes('/Enemy_') || src.includes('/CompoundStone_') || src.includes('/Macrophage_'))) {
      const flatSrc = src.replace(/\/(?:Enemy|CompoundStone|Macrophage)_\d{2}(?=\/)/, '');
      if (flatSrc !== src) {
        state.sourceLabel = `source: ${flatSrc}`;
        state.img = new Image();
        state.img.onload = () => {
          syncSpriteCalControlValues();
          renderSpriteCalibrator();
        };
        state.img.src = flatSrc;
        syncSpriteCalControlValues();
      }
    }
  };
  state.img.src = src;
  syncSpriteCalControlValues();
}

function loadSpriteCalFile(file) {
  if (!file) return;
  const state = ensureSpriteCalState();
  if (state.objectUrl) {
    URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = null;
  }
  const objectUrl = URL.createObjectURL(file);
  state.objectUrl = objectUrl;
  loadSpriteCalImage(objectUrl, file.name);
}

function applySpriteCalToSelected() {
  const sel = getSelected();
  const state = ensureSpriteCalState();
  const composedPreset = activeTool === 'ComposedEntity'
    ? entityPresetsByType.ComposedEntity?.find(p => p.id === activeEntityPreset.ComposedEntity) ?? entityPresetsByType.ComposedEntity?.[0] ?? null
    : null;
  if (composedPreset?.data?.type === 'ComposedEntity') {
    const presetData = composedPreset.data;
    ensureComposedEntityDefaults(presetData);
    presetData.spriteScale = state.values.spriteScale;
    presetData.spriteRotationOffset = state.values.spriteRotationOffset;
    presetData.spriteBodyU = state.values.spriteBodyU;
    presetData.spriteBodyV = state.values.spriteBodyV;
    presetData.spriteReferenceRadius = Math.max(2, clampNum(state.values.radius, presetData.spriteReferenceRadius));
    writeActiveComposedEntityPresetToSrc().catch(err => {
      if (err?.name !== 'AbortError') setEditorStatus('Failed to save ComposedEntity preset: ' + err.message, 'error');
    });
    buildPresetPanel();
    render();
    return;
  }
  if (!sel || (sel.type !== 'Enemy' && sel.type !== 'ComposedStone' && sel.type !== 'Macrophage')) return;
  const prevSpriteIndex = sel.spriteIndex;
  const prevInstanceIndex = sel.instanceIndex;

  const nextRadius = Math.max(2, clampNum(state.values.radius, sel.radius));

  if (sel.type === 'Enemy') {
    const prevRadius = Math.max(0.0001, clampNum(sel.radius, nextRadius));
    const scale = nextRadius / prevRadius;
    sel.bodyCircles = (sel.bodyCircles?.length ? sel.bodyCircles : makeDefaultEnemyBodyCircles(prevRadius)).map(circle => ({
      dx: circle.dx * scale,
      dy: circle.dy * scale,
      r: Math.max(2, circle.r * scale)
    }));
    sel.innerArtifacts = (sel.innerArtifacts ?? []).map(artifact => ({
      ...artifact,
      dx: artifact.dx * scale,
      dy: artifact.dy * scale,
      radius: Math.max(2, artifact.radius * scale)
    }));
    sel.radius = nextRadius;
  }

  if (sel.type === 'Macrophage') {
    scaleMacrophageBody(sel, sel.radius, nextRadius);
    sel.radius = nextRadius;
  }

  sel.spriteScale = state.values.spriteScale;
  sel.spriteRotationOffset = state.values.spriteRotationOffset;
  sel.spriteBodyU = state.values.spriteBodyU;
  sel.spriteBodyV = state.values.spriteBodyV;
  if (sel.type === 'Enemy') {
    ensureEnemyDefaults(sel);
  }
  if (sel.type === 'Macrophage') {
    ensureMacrophageDefaults(sel);
  }
  if (sel.type === 'ComposedStone') {
    sel.spriteReferenceRadius = nextRadius;
    syncComposedStoneSpriteSubfolder(sel, prevSpriteIndex, prevInstanceIndex);
    ensureComposedStoneDefaults(sel);
  }
  if (sel.type === 'Algae') {
    sel.spriteReferenceRadius = nextRadius;
    syncAlgaeSpriteSubfolder(sel, prevSpriteIndex, prevInstanceIndex);
    ensureAlgaeDefaults(sel);
  }
  renderProps();
  render();
}

function beginSpriteCalDrag(event) {
  if (!spriteCalState?.open) return;
  const modal = document.getElementById('sprite-cal-modal');
  const rect = modal.getBoundingClientRect();
  spriteCalDrag = {
    startX: event.clientX,
    startY: event.clientY,
    originX: rect.left,
    originY: rect.top
  };
  event.preventDefault();
}

function moveSpriteCalDrag(event) {
  if (!spriteCalDrag || !spriteCalState?.open) return;
  const modal = document.getElementById('sprite-cal-modal');
  const x = spriteCalDrag.originX + (event.clientX - spriteCalDrag.startX);
  const y = spriteCalDrag.originY + (event.clientY - spriteCalDrag.startY);
  spriteCalState.pos.x = Math.max(0, x);
  spriteCalState.pos.y = Math.max(0, y);
  modal.style.left = `${spriteCalState.pos.x}px`;
  modal.style.top = `${spriteCalState.pos.y}px`;
}

function endSpriteCalDrag() {
  spriteCalDrag = null;
}

function getEnemyGitCircle(e) {
  ensureEnemyDefaults(e);
  const angle = getEnemyMouthAngleRad(e) + clampNum(e.gitCircleOffsetAngleDeg, 0) * Math.PI / 180;
  const dist = e.radius * clampNum(e.gitCircleOffsetDistanceMul, 0);
  return {
    x: e.x + Math.cos(angle) * dist,
    y: e.y + Math.sin(angle) * dist,
    r: Math.max(3, e.radius * clampNum(e.gitCircleRadiusMul, 0.4)),
    angle
  };
}

function getEnemyMouthPoint(e) {
  ensureEnemyDefaults(e);
  const mouthAngle = getEnemyMouthAngleRad(e);
  const mouthLen = Math.max(0, clampNum(e.mouthOffsetDistance, e.radius));
  return {
    x: e.x + Math.cos(mouthAngle) * mouthLen,
    y: e.y + Math.sin(mouthAngle) * mouthLen,
    r: Math.max(3, e.mouthAbsorbRadius),
    angle: mouthAngle,
    len: mouthLen
  };
}

function getEnemyGitResizeHandle(e) {
  const git = getEnemyGitCircle(e);
  return {
    x: git.x + git.r * 0.707,
    y: git.y - git.r * 0.707
  };
}

function hitTestEnemyAnatomy(e, mx, my) {
  if (!e || e.type !== 'Enemy') return null;
  const git = getEnemyGitCircle(e);
  const mouth = getEnemyMouthPoint(e);
  const gitHandle = getEnemyGitResizeHandle(e);

  if (Math.hypot(mx - gitHandle.x, my - gitHandle.y) < 10) return { action: 'resize-git', git };
  if (Math.hypot(mx - mouth.x, my - mouth.y) <= mouth.r + 8) return { action: 'move-mouth', mouth };
  if (Math.hypot(mx - git.x, my - git.y) <= git.r) return { action: 'move-git', git };
  return null;
}

function drawBodyCircles(e) {
  if (e?.type === 'Enemy') ensureEnemyDefaults(e);
  if (e?.type === 'Macrophage') ensureMacrophageDefaults(e);
  const labels = getCircleEditorLabels(e);

  ctx.save();
  for (let i = e.bodyCircles.length - 1; i >= 0; i--) {
    const circle = getBodyCircleAbs(e, i);
    ctx.beginPath();
    ctx.arc(circle.x, circle.y, circle.r, 0, Math.PI * 2);
    ctx.fillStyle = e.type === 'Macrophage'
      ? (i === 0 ? 'rgba(210,140,255,0.10)' : 'rgba(210,140,255,0.05)')
      : (i === 0 ? 'rgba(255,200,80,0.08)' : 'rgba(255,200,80,0.04)');
    ctx.fill();
    ctx.strokeStyle = e.type === 'Macrophage'
      ? (i === 0 ? 'rgba(210,140,255,0.92)' : 'rgba(230,205,255,0.72)')
      : (i === 0 ? 'rgba(255,200,80,0.92)' : 'rgba(255,220,150,0.72)');
    ctx.lineWidth = i === 0 ? 2 : 1.2;
    ctx.stroke();
    drawBadge(
      circle.x,
      circle.y - circle.r - 10,
      labels[i] ?? `body ${i + 1}`,
      e.type === 'Macrophage'
        ? (i === 0 ? 'rgba(210,140,255,0.88)' : 'rgba(230,205,255,0.8)')
        : (i === 0 ? 'rgba(255,200,80,0.88)' : 'rgba(255,220,150,0.78)')
    );
  }
  ctx.restore();
}

function drawEnemyAnatomy(e) {
  ensureEnemyDefaults(e);
  const git = getEnemyGitCircle(e);
  const mouth = getEnemyMouthPoint(e);
  const mouthX = mouth.x;
  const mouthY = mouth.y;

  ctx.save();
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = 'rgba(255,200,80,0.32)';
  ctx.beginPath();
  ctx.moveTo(e.x, e.y);
  ctx.lineTo(git.x, git.y);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(130,230,245,0.9)';
  ctx.beginPath();
  ctx.moveTo(e.x, e.y);
  ctx.lineTo(mouthX, mouthY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.arc(git.x, git.y, git.r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(170,80,255,0.10)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(170,80,255,0.95)';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(mouthX, mouthY, Math.max(3, e.mouthAbsorbRadius), 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(130,230,245,0.16)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(130,230,245,0.95)';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  drawBadge(git.x, git.y - git.r - 11, 'GIT', 'rgba(170,80,255,0.88)');
  drawBadge(mouthX, mouthY - Math.max(14, e.mouthAbsorbRadius + 10), 'mouth', 'rgba(130,230,245,0.88)');

  const gitHandle = getEnemyGitResizeHandle(e);
  const gitHover = hoverEnemyAnatomyHandle?.action === 'resize-git';
  const gitMoveHover = hoverEnemyAnatomyHandle?.action === 'move-git';
  const mouthHover = hoverEnemyAnatomyHandle?.action === 'move-mouth';

  ctx.beginPath();
  ctx.arc(gitHandle.x, gitHandle.y, 6, 0, Math.PI * 2);
  ctx.fillStyle = gitHover ? '#fff' : 'rgba(170,80,255,0.95)';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(git.x, git.y, 7, 0, Math.PI * 2);
  ctx.fillStyle = gitMoveHover ? 'rgba(170,80,255,0.75)' : 'rgba(170,80,255,0.22)';
  ctx.strokeStyle = 'rgba(170,80,255,0.95)';
  ctx.lineWidth = 1.4;
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(mouthX, mouthY, 7, 0, Math.PI * 2);
  ctx.fillStyle = mouthHover ? 'rgba(130,230,245,0.75)' : 'rgba(130,230,245,0.22)';
  ctx.strokeStyle = 'rgba(130,230,245,0.95)';
  ctx.lineWidth = 1.4;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function normalizeSignedDeg(deg) {
  let value = Number(deg) || 0;
  while (value > 180) value -= 360;
  while (value < -180) value += 360;
  return value;
}

function getMacrophageMouthAnchor(e) {
  ensureMacrophageDefaults(e);
  return getMacrophageBodyCircleAbs(e, 0);
}

function getMacrophageMouthCenterAngleDeg(e) {
  ensureMacrophageDefaults(e);
  const min = Number(e.mouth.rotationRange[0] ?? 0) || 0;
  const max = Number(e.mouth.rotationRange[1] ?? 0) || 0;
  return (min + max) * 0.5;
}

function getMacrophageBodyBaseAngleDeg(e) {
  ensureMacrophageDefaults(e);
  return normalizeSignedDeg(clampNum(e.bodyRotation?.baseAngleDeg, 0));
}

function getMacrophageBodyBaseAngleRad(e) {
  return degToRad(getMacrophageBodyBaseAngleDeg(e));
}

function transformMacrophageLocalPoint(e, dx, dy, angleRad = getMacrophageBodyBaseAngleRad(e)) {
  ensureMacrophageDefaults(e);
  const pivotDx = Number(e.bodyRotation?.pivotDx ?? 0) || 0;
  const pivotDy = Number(e.bodyRotation?.pivotDy ?? 0) || 0;
  const rx = dx - pivotDx;
  const ry = dy - pivotDy;
  const ca = Math.cos(angleRad);
  const sa = Math.sin(angleRad);
  return {
    x: e.x + pivotDx + rx * ca - ry * sa,
    y: e.y + pivotDy + rx * sa + ry * ca
  };
}

function getMacrophageDigestPathWorldPoints(e) {
  ensureMacrophageDefaults(e);
  const project = point => transformMacrophageLocalPoint(e, point.dx, point.dy);
  return Object.fromEntries(
    getMacrophageDigestPathPointKeys(e.digestPath)
      .filter(key => e.digestPath?.[key])
      .map(key => [key, project(e.digestPath[key])])
  );
}

function getMacrophageBodyPivot(e) {
  ensureMacrophageDefaults(e);
  return {
    x: e.x + e.bodyRotation.pivotDx,
    y: e.y + e.bodyRotation.pivotDy,
    r: Math.max(4, e.bodyRotation.pivotRadius)
  };
}

function getMacrophageOrbitCenter(e) {
  ensureMacrophageDefaults(e);
  return {
    x: e.x + e.orbit.centerDx,
    y: e.y + e.orbit.centerDy
  };
}

function normalizePositiveRad(rad) {
  const twoPi = Math.PI * 2;
  let value = Number(rad) || 0;
  value %= twoPi;
  if (value < 0) value += twoPi;
  return value;
}

function orbitAngularDistance(from, to, dir = 1) {
  const a = normalizePositiveRad(from);
  const b = normalizePositiveRad(to);
  return dir >= 0
    ? (b - a + Math.PI * 2) % (Math.PI * 2)
    : (a - b + Math.PI * 2) % (Math.PI * 2);
}

function catmullRomPoint2D(p0, p1, p2, p3, t) {
  const tt = t * t;
  const ttt = tt * t;
  return {
    x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * tt + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * ttt),
    y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * tt + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * ttt)
  };
}

function sampleClosedCatmullRom2D(points, t) {
  const safePoints = Array.isArray(points) ? points.filter(Boolean) : [];
  const count = safePoints.length;
  if (count === 0) return { x: 0, y: 0 };
  if (count === 1) return { x: safePoints[0].x, y: safePoints[0].y };
  if (count === 2) {
    const clampedT = ((Number(t) || 0) % 1 + 1) % 1;
    return {
      x: safePoints[0].x + (safePoints[1].x - safePoints[0].x) * clampedT,
      y: safePoints[0].y + (safePoints[1].y - safePoints[0].y) * clampedT
    };
  }
  const wrappedT = ((Number(t) || 0) % 1 + 1) % 1;
  const scaled = wrappedT * count;
  const index = Math.floor(scaled) % count;
  const localT = scaled - Math.floor(scaled);
  return catmullRomPoint2D(
    safePoints[(index - 1 + count) % count],
    safePoints[index % count],
    safePoints[(index + 1) % count],
    safePoints[(index + 2) % count],
    localT
  );
}

function getSelectedMacrophageOrbitSplinePointIndex(e) {
  const count = Array.isArray(e?.orbit?.splinePoints) ? e.orbit.splinePoints.length : 0;
  if (count <= 0) return -1;
  selectedMacrophageOrbitSplinePointIdx = Math.max(0, Math.min(selectedMacrophageOrbitSplinePointIdx, count - 1));
  return selectedMacrophageOrbitSplinePointIdx;
}

function setSelectedMacrophageOrbitSplinePointIndex(e, idx) {
  const count = Array.isArray(e?.orbit?.splinePoints) ? e.orbit.splinePoints.length : 0;
  if (count <= 0) {
    selectedMacrophageOrbitSplinePointIdx = 0;
    return -1;
  }
  selectedMacrophageOrbitSplinePointIdx = Math.max(0, Math.min(idx, count - 1));
  return selectedMacrophageOrbitSplinePointIdx;
}

function getMacrophageOrbitSplineWorldPoints(e) {
  ensureMacrophageDefaults(e);
  if (!Array.isArray(e.orbit?.splinePoints)) return [];
  const center = getMacrophageOrbitCenter(e);
  return e.orbit.splinePoints.map((point, idx) => ({
    idx,
    x: center.x + (point?.dx ?? 0),
    y: center.y + (point?.dy ?? 0)
  }));
}

function hitTestMacrophageOrbitSpline(e, mx, my) {
  const points = getMacrophageOrbitSplineWorldPoints(e);
  if (!points.length) return null;
  const selectedIdx = getSelectedMacrophageOrbitSplinePointIndex(e);
  const ordered = [selectedIdx, ...points.map(point => point.idx).filter(idx => idx !== selectedIdx)];
  for (const idx of ordered) {
    const point = points[idx];
    if (!point) continue;
    if (Math.hypot(mx - point.x, my - point.y) <= 10) return { action: 'move-orbit-spline-point', pointIdx: idx };
  }
  const center = getMacrophageOrbitCenter(e);
  const radiusHandle = getMacrophageOrbitRadiusHandle(e);
  if (Math.hypot(mx - center.x, my - center.y) <= 10) return { action: 'move-orbit-center' };
  if (Math.hypot(mx - radiusHandle.x, my - radiusHandle.y) <= 10) return { action: 'resize-orbit-radius' };

  const samples = Math.max(48, points.length * 20);
  let prev = sampleClosedCatmullRom2D(points, 0);
  for (let i = 1; i <= samples; i++) {
    const curr = sampleClosedCatmullRom2D(points, i / samples);
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq > 0.0001) {
      const proj = Math.max(0, Math.min(1, ((mx - prev.x) * dx + (my - prev.y) * dy) / lenSq));
      const px = prev.x + dx * proj;
      const py = prev.y + dy * proj;
      if (Math.hypot(mx - px, my - py) <= 10) return { action: 'select-orbit-spline-path' };
    }
    prev = curr;
  }
  return null;
}

function getSelectedMacrophageOrbitSegmentIndex(e) {
  const count = Array.isArray(e?.orbit?.segments) ? e.orbit.segments.length : 0;
  if (count <= 0) return -1;
  selectedMacrophageOrbitSegmentIdx = Math.max(0, Math.min(selectedMacrophageOrbitSegmentIdx, count - 1));
  return selectedMacrophageOrbitSegmentIdx;
}

function setSelectedMacrophageOrbitSegmentIndex(e, idx) {
  const count = Array.isArray(e?.orbit?.segments) ? e.orbit.segments.length : 0;
  if (count <= 0) {
    selectedMacrophageOrbitSegmentIdx = 0;
    return -1;
  }
  selectedMacrophageOrbitSegmentIdx = Math.max(0, Math.min(idx, count - 1));
  return selectedMacrophageOrbitSegmentIdx;
}

function getMacrophageOrbitSegmentGeometry(e, idx) {
  ensureMacrophageDefaults(e);
  const segment = e.orbit?.segments?.[idx];
  if (!segment) return null;
  const center = {
    x: e.x + (segment.centerDx ?? 0),
    y: e.y + (segment.centerDy ?? 0)
  };
  const radius = Math.max(0, segment.radius ?? 0);
  const startRad = degToRad(segment.startDeg ?? 0);
  const endRad = degToRad(segment.endDeg ?? 0);
  const dir = (segment.speed ?? e.orbit.speed ?? 0.01) < 0 ? -1 : 1;
  const sweep = orbitAngularDistance(startRad, endRad, dir);
  const midRad = normalizePositiveRad(startRad + dir * sweep * 0.5);
  return {
    idx,
    segment,
    center,
    radius,
    startRad,
    endRad,
    dir,
    ccw: dir < 0,
    sweep,
    start: {
      x: center.x + Math.cos(startRad) * radius,
      y: center.y + Math.sin(startRad) * radius
    },
    end: {
      x: center.x + Math.cos(endRad) * radius,
      y: center.y + Math.sin(endRad) * radius
    },
    radiusHandle: {
      x: center.x + Math.cos(midRad) * radius,
      y: center.y + Math.sin(midRad) * radius,
      rad: midRad
    }
  };
}

function hitTestMacrophageOrbitSegment(e, mx, my) {
  if (!Array.isArray(e?.orbit?.segments) || e.orbit.segments.length === 0) return null;

  const selectedIdx = getSelectedMacrophageOrbitSegmentIndex(e);
  const ordered = [
    selectedIdx,
    ...e.orbit.segments.map((_, idx) => idx).filter(idx => idx !== selectedIdx)
  ];

  for (const idx of ordered) {
    const geom = getMacrophageOrbitSegmentGeometry(e, idx);
    if (!geom) continue;

    if (Math.hypot(mx - geom.center.x, my - geom.center.y) <= 9) return { action: 'move-orbit-segment-center', segmentIdx: idx };
    if (Math.hypot(mx - geom.start.x, my - geom.start.y) <= 9) return { action: 'move-orbit-segment-start', segmentIdx: idx };
    if (Math.hypot(mx - geom.end.x, my - geom.end.y) <= 9) return { action: 'move-orbit-segment-end', segmentIdx: idx };
    if (Math.hypot(mx - geom.radiusHandle.x, my - geom.radiusHandle.y) <= 9) return { action: 'resize-orbit-segment-radius', segmentIdx: idx };

    const dist = Math.hypot(mx - geom.center.x, my - geom.center.y);
    if (Math.abs(dist - geom.radius) > 10) continue;
    const pointRad = Math.atan2(my - geom.center.y, mx - geom.center.x);
    const pointSweep = orbitAngularDistance(geom.startRad, pointRad, geom.dir);
    if (pointSweep <= geom.sweep + 0.08) {
      return { action: 'select-orbit-segment', segmentIdx: idx };
    }
  }

  return null;
}

function getMacrophageOrbitRadiusHandle(e) {
  const center = getMacrophageOrbitCenter(e);
  return {
    x: center.x + Math.max(0, e.orbit.radius),
    y: center.y
  };
}

function getMacrophageFreeMoveGeometry(e) {
  ensureMacrophageDefaults(e);
  const free = makeDefaultMacrophageFreeMove(e.orbit?.freeMove ?? {});
  const center = getMacrophageBodyPivot(e);
  const dirRad = degToRad(free.directionDeg);
  const spreadHalf = degToRad(free.spreadDeg) * 0.5;
  const startRad = dirRad - spreadHalf;
  const endRad = dirRad + spreadHalf;
  const radius = free.previewRadius;
  return {
    center,
    dirRad,
    startRad,
    endRad,
    radius,
    vectorTip: {
      x: center.x + Math.cos(dirRad) * radius * 0.72,
      y: center.y + Math.sin(dirRad) * radius * 0.72
    },
    radiusHandle: {
      x: center.x + Math.cos(dirRad) * radius,
      y: center.y + Math.sin(dirRad) * radius
    },
    startHandle: {
      x: center.x + Math.cos(startRad) * radius,
      y: center.y + Math.sin(startRad) * radius
    },
    endHandle: {
      x: center.x + Math.cos(endRad) * radius,
      y: center.y + Math.sin(endRad) * radius
    }
  };
}

function getMacrophageBodyRangeHandle(e, idx) {
  ensureMacrophageDefaults(e);
  const pivot = getMacrophageBodyPivot(e);
  const deg = Number(e.bodyRotation.rotationRange[idx] ?? 0) || 0;
  const rad = getMacrophageBodyBaseAngleRad(e) + degToRad(deg);
  const len = Math.max(e.radius * 1.4, 42);
  return {
    x: pivot.x + Math.cos(rad) * len,
    y: pivot.y + Math.sin(rad) * len,
    deg,
    rad,
    len
  };
}

function macropDigestWorldToLocal(e, wx, wy) {
  const angle = getMacrophageBodyBaseAngleRad(e);
  const dx = wx - e.x;
  const dy = wy - e.y;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  return {
    dx: dx * ca + dy * sa,
    dy: -dx * sa + dy * ca
  };
}

function getMacrophageMouthHandle(e, idx) {
  ensureMacrophageDefaults(e);
  const anchor = getMacrophageMouthAnchor(e);
  const deg = Number(e.mouth.rotationRange[idx] ?? 0) || 0;
  const rad = getMacrophageBodyBaseAngleRad(e) + degToRad(deg);
  const len = Math.max(e.radius * 1.55, 48);
  return {
    x: anchor.x + Math.cos(rad) * len,
    y: anchor.y + Math.sin(rad) * len,
    deg,
    rad,
    len
  };
}

function getMacrophageMouthCircle(e) {
  ensureMacrophageDefaults(e);
  const anchor = getMacrophageMouthAnchor(e);
  const angle = getMacrophageBodyBaseAngleRad(e) + degToRad(getMacrophageMouthCenterAngleDeg(e));
  const len = Math.max(0, e.mouth.offsetDistance);
  return {
    x: anchor.x + Math.cos(angle) * len,
    y: anchor.y + Math.sin(angle) * len,
    r: Math.max(3, e.mouth.absorbRadius),
    angle,
    len
  };
}

function getMacrophageMouthCircleResizeHandle(e) {
  const mouth = getMacrophageMouthCircle(e);
  return {
    x: mouth.x + mouth.r * 0.707,
    y: mouth.y - mouth.r * 0.707,
    mouth
  };
}

function drawMacrophageMouthCiliaOverlay(e, mouthCircle) {
  const cilia = e?.mouth?.cilia ?? makeDefaultMacrophageMouthCilia();
  if (cilia.enabled === false || cilia.count <= 0 || cilia.lengthScale <= 0 || cilia.alpha <= 0) return;

  const count = Math.max(0, Math.round(clampNum(cilia.count, 22)));
  const baseLength = mouthCircle.r * Math.max(0, clampNum(cilia.lengthScale, 0.2));
  const waveAmount = Math.max(0, clampNum(cilia.waveAmount, 0.55));
  const curlAmount = clampNum(cilia.curl, 0.1);
  const phase = performance.now() * Math.max(0, clampNum(cilia.waveSpeed, 0.003));
  const alpha = Math.max(0, Math.min(1, clampNum(cilia.alpha, 1)));
  const arcEnabled = cilia.arcEnabled === true && clampNum(cilia.arcSpreadDeg, 120) < 360;
  const arcCenter = (mouthCircle.angle ?? 0) + degToRad(clampNum(cilia.arcCenterDeg, 0));
  const arcSpread = degToRad(Math.max(0, Math.min(360, clampNum(cilia.arcSpreadDeg, 120))));
  const arcStart = arcCenter - arcSpread * 0.5;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(0.1, clampNum(cilia.lineWidth, 1.3));
  for (let i = 0; i < count; i++) {
    const t = count <= 1 ? 0.5 : i / (count - 1);
    const ang = arcEnabled
      ? arcStart + arcSpread * t
      : (i / Math.max(1, count)) * Math.PI * 2;
    const wave = Math.sin(phase + i * 0.65);
    const waveStrength = Math.abs(wave);
    const len = baseLength * (0.7 + waveAmount * waveStrength);
    const curl = curlAmount * wave;
    const bx = mouthCircle.x + Math.cos(ang) * mouthCircle.r;
    const by = mouthCircle.y + Math.sin(ang) * mouthCircle.r;
    const tx = mouthCircle.x + Math.cos(ang + curl) * (mouthCircle.r + len);
    const ty = mouthCircle.y + Math.sin(ang + curl) * (mouthCircle.r + len);
    ctx.strokeStyle = `rgba(190,245,255,${((0.30 + 0.40 * waveStrength) * alpha).toFixed(2)})`;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(tx, ty);
    ctx.stroke();
  }
  ctx.restore();
}

function getMacrophageBodyCiliaSpline(e) {
  ensureMacrophageDefaults(e);
  const cilia = e.bodyCilia ?? makeDefaultMacrophageBodyCilia();
  const samples = Math.max(12, Math.round(clampNum(cilia.splineSamples, 96)));
  const offset = clampNum(cilia.splineOffset, 3);
  const circles = (e.bodyCircles ?? []).map((_, idx) => getMacrophageBodyCircleAbs(e, idx));
  const center = {
    x: circles.reduce((sum, circle) => sum + circle.x, 0) / Math.max(1, circles.length),
    y: circles.reduce((sum, circle) => sum + circle.y, 0) / Math.max(1, circles.length)
  };

  return Array.from({ length: samples }, (_, i) => {
    const angle = (i / samples) * Math.PI * 2;
    const nx = Math.cos(angle);
    const ny = Math.sin(angle);
    let support = e.radius;
    for (const circle of circles) {
      const candidate = (circle.x - center.x) * nx + (circle.y - center.y) * ny + circle.r;
      support = Math.max(support, candidate);
    }
    const distance = Math.max(0, support + offset);
    return {
      x: center.x + nx * distance,
      y: center.y + ny * distance,
      angle,
      t: i / samples
    };
  });
}

function isMacrophageBodyCiliaTEnabled(t, segments) {
  for (const segment of segments ?? []) {
    if (segment?.enabled === false) continue;
    const start = Math.max(0, Math.min(1, clampNum(segment?.start, 0)));
    const end = Math.max(0, Math.min(1, clampNum(segment?.end, 1)));
    if (Math.abs(start - end) <= 0.0001) continue;
    if (start <= end) {
      if (t >= start && t <= end) return true;
    } else if (t >= start || t <= end) {
      return true;
    }
  }
  return false;
}

function drawMacrophageBodyCiliaOverlay(e) {
  const cilia = e?.bodyCilia ?? makeDefaultMacrophageBodyCilia();
  const spline = getMacrophageBodyCiliaSpline(e);
  if (spline.length < 3) return;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(spline[0].x, spline[0].y);
  for (let i = 1; i <= spline.length; i++) {
    const point = spline[i % spline.length];
    ctx.lineTo(point.x, point.y);
  }
  ctx.closePath();
  ctx.strokeStyle = cilia.enabled ? 'rgba(120,235,190,0.76)' : 'rgba(150,170,160,0.46)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  ctx.stroke();
  ctx.setLineDash([]);

  const count = Math.max(0, Math.round(clampNum(cilia.count, 96)));
  const baseLength = Math.max(4, e.radius) * Math.max(0, clampNum(cilia.lengthScale, 0.16));
  const phase = performance.now() * Math.max(0, clampNum(cilia.waveSpeed, 0.0025));
  const waveAmount = Math.max(0, clampNum(cilia.waveAmount, 0.55));
  const curlAmount = clampNum(cilia.curl, 0.08);
  const alpha = Math.max(0, Math.min(1, clampNum(cilia.alpha, 0.82)));
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(0.1, clampNum(cilia.lineWidth, 1.1));
  for (let i = 0; i < count; i++) {
    const t = count <= 1 ? 0.5 : i / count;
    if (!isMacrophageBodyCiliaTEnabled(t, cilia.segments)) continue;
    const point = spline[Math.min(spline.length - 1, Math.floor(t * spline.length))];
    const wave = Math.sin(phase + i * 0.42);
    const waveStrength = Math.abs(wave);
    const len = baseLength * (0.7 + waveAmount * waveStrength);
    const angle = point.angle + curlAmount * wave;
    ctx.strokeStyle = `rgba(190,245,255,${((0.24 + 0.42 * waveStrength) * alpha).toFixed(2)})`;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(point.x + Math.cos(angle) * len, point.y + Math.sin(angle) * len);
    ctx.stroke();
  }

  (cilia.segments ?? []).forEach((segment, idx) => {
    const point = spline[Math.min(spline.length - 1, Math.floor(Math.max(0, Math.min(1, segment.start ?? 0)) * spline.length))];
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = segment.enabled === false ? 'rgba(150,170,160,0.85)' : 'rgba(120,235,190,0.95)';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    drawBadge(point.x, point.y - 14, `cilia ${idx + 1}`, 'rgba(120,235,190,0.82)');
  });
  ctx.restore();
}

function getMacrophageSurfaceMarkerHandle(e, settings = {}) {
  ensureMacrophageDefaults(e);
  const circleIdx = Math.max(0, Math.min(settings.bodyCircleIndex ?? 0, e.bodyCircles.length - 1));
  const circle = getMacrophageBodyCircleAbs(e, circleIdx);
  const angle = getMacrophageBodyBaseAngleRad(e) + degToRad(settings.angleDeg ?? 0);
  return {
    x: circle.x + Math.cos(angle) * circle.r,
    y: circle.y + Math.sin(angle) * circle.r,
    angle,
    circle,
    circleIdx
  };
}

function getMacrophageEggSpawnHandle(e) {
  return getMacrophageSurfaceMarkerHandle(e, e.eggSpawn ?? makeDefaultMacrophageEggSpawn());
}

function getMacrophageGerminationHandle(e) {
  return getMacrophageSurfaceMarkerHandle(e, e.germination ?? makeDefaultMacrophageGermination());
}

function getMacrophageProjectileSpawnHandle(e) {
  return getMacrophageSurfaceMarkerHandle(e, e.projectileSpawn ?? makeDefaultMacrophageProjectileSpawn());
}

function getAlgaeSurfaceMarkerHandle(e, settings = {}) {
  ensureAlgaeDefaults(e);
  const circleIdx = Math.max(0, Math.min(settings.bodyCircleIndex ?? 0, e.circles.length - 1));
  const circleDef = e.circles[circleIdx] ?? e.circles[0] ?? { dx: 0, dy: 0, r: e.radius ?? 30 };
  const circle = {
    x: e.x + circleDef.dx,
    y: e.y + circleDef.dy,
    r: Math.max(2, clampNum(circleDef.r, e.radius ?? 30))
  };
  const angle = degToRad(settings.angleDeg ?? 0);
  return {
    x: circle.x + Math.cos(angle) * circle.r,
    y: circle.y + Math.sin(angle) * circle.r,
    angle,
    circle,
    circleIdx
  };
}

function getAlgaeGerminationHandle(e) {
  return getAlgaeSurfaceMarkerHandle(e, e.germination ?? makeDefaultAlgaeGermination());
}

function hitTestAlgaeGerminationOverlay(e, mx, my) {
  if (!e || e.type !== 'Algae') return null;
  ensureAlgaeDefaults(e);
  const germination = getAlgaeGerminationHandle(e);
  if (Math.hypot(mx - germination.x, my - germination.y) <= 10) return { action: 'move-algae-germination-point' };
  return null;
}

function drawAlgaeGerminationOverlay(e) {
  ensureAlgaeDefaults(e);
  const germination = getAlgaeGerminationHandle(e);
  const enabled = e.germination?.enabled ?? false;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(germination.circle.x, germination.circle.y);
  ctx.lineTo(germination.x, germination.y);
  ctx.strokeStyle = enabled ? 'rgba(145,235,165,0.88)' : 'rgba(150,170,160,0.66)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(germination.x, germination.y, 6, 0, Math.PI * 2);
  ctx.fillStyle = hoverEnemyAnatomyHandle?.action === 'move-algae-germination-point'
    ? '#fff'
    : (enabled ? 'rgba(145,235,165,0.95)' : 'rgba(150,170,160,0.86)');
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  drawBadge(
    germination.x,
    germination.y - 14,
    `${enabled ? 'bud' : 'bud off'} x${e.germination.feedCount}`,
    enabled ? 'rgba(145,235,165,0.88)' : 'rgba(150,170,160,0.82)'
  );
  ctx.restore();
}

function getMacrophageMouthCanvasButtons(e) {
  const primary = getMacrophageBodyCircleAbs(e, 0);
  const y = primary.y - primary.r - 34;
  const toggle = { x: primary.x - 58, y, w: 52, h: 18, label: macrophageMouthOverlay ? 'ARC ON' : 'ARC OFF', action: 'toggle-mouth-overlay' };
  const dir = { x: primary.x + 8, y, w: 54, h: 18, label: e.mouth.rotationDir >= 0 ? 'CW' : 'CCW', action: 'toggle-mouth-dir' };
  return { toggle, dir };
}

function getMacrophageBodyCanvasButtons(e) {
  const primary = getMacrophageBodyCircleAbs(e, 0);
  const y = primary.y - primary.r - 58;
  const toggle = { x: primary.x - 58, y, w: 52, h: 18, label: macrophageBodyOverlay ? 'BODY ON' : 'BODY OFF', action: 'toggle-body-overlay' };
  const dir = { x: primary.x + 8, y, w: 54, h: 18, label: e.bodyRotation.rotationDir >= 0 ? 'CW' : 'CCW', action: 'toggle-body-dir' };
  return { toggle, dir };
}

function pointInRect(px, py, rect) {
  return px >= rect.x && py >= rect.y && px <= rect.x + rect.w && py <= rect.y + rect.h;
}

function drawCanvasPill(rect, label, activeColor, inactiveColor = 'rgba(24,28,36,0.88)') {
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 7);
  ctx.fillStyle = activeColor ?? inactiveColor;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#f6f8ff';
  ctx.font = 'bold 10px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, rect.x + rect.w * 0.5, rect.y + rect.h * 0.5 + 0.5);
}

function hitTestMacrophageMouthOverlay(e, mx, my) {
  if (!e || e.type !== 'Macrophage') return null;
  ensureMacrophageDefaults(e);
  const spriteGeom = getMacrophageSpriteSelectionGeometry(e);
  if (spriteGeom && Math.hypot(mx - spriteGeom.handle.x, my - spriteGeom.handle.y) <= 10) return { action: 'move-macro-sprite-handle' };
  const bodyButtons = getMacrophageBodyCanvasButtons(e);
  if (pointInRect(mx, my, bodyButtons.toggle)) return { action: bodyButtons.toggle.action };
  if (pointInRect(mx, my, bodyButtons.dir)) return { action: bodyButtons.dir.action };
  if (macrophageBodyOverlay) {
    const pivot = getMacrophageBodyPivot(e);
    if (Math.hypot(mx - pivot.x, my - pivot.y) <= pivot.r + 8) return { action: 'move-body-pivot' };
    for (let i = 0; i < 2; i++) {
      const handle = getMacrophageBodyRangeHandle(e, i);
      if (Math.hypot(mx - handle.x, my - handle.y) <= 10) return { action: 'move-body-range', rangeIdx: i };
    }
  }
  if (e.orbit?.mode === 'free') {
    const free = getMacrophageFreeMoveGeometry(e);
    if (Math.hypot(mx - free.vectorTip.x, my - free.vectorTip.y) <= 10) return { action: 'move-free-direction' };
    if (Math.hypot(mx - free.radiusHandle.x, my - free.radiusHandle.y) <= 10) return { action: 'resize-free-radius' };
    if (Math.hypot(mx - free.startHandle.x, my - free.startHandle.y) <= 10) return { action: 'move-free-start' };
    if (Math.hypot(mx - free.endHandle.x, my - free.endHandle.y) <= 10) return { action: 'move-free-end' };
  } else if (e.orbit?.mode === 'spline' && Array.isArray(e.orbit?.splinePoints) && e.orbit.splinePoints.length > 2) {
    const splineHit = hitTestMacrophageOrbitSpline(e, mx, my);
    if (splineHit) return splineHit;
  } else if (!Array.isArray(e.orbit?.segments) || e.orbit.segments.length === 0 || e.orbit?.mode === 'orbit') {
    const orbitCenter = getMacrophageOrbitCenter(e);
    const orbitRadiusHandle = getMacrophageOrbitRadiusHandle(e);
    if (Math.hypot(mx - orbitCenter.x, my - orbitCenter.y) <= 10) return { action: 'move-orbit-center' };
    if (Math.hypot(mx - orbitRadiusHandle.x, my - orbitRadiusHandle.y) <= 10) return { action: 'resize-orbit-radius' };
  } else {
    const orbitHit = hitTestMacrophageOrbitSegment(e, mx, my);
    if (orbitHit) return orbitHit;
  }
  const buttons = getMacrophageMouthCanvasButtons(e);
  if (pointInRect(mx, my, buttons.toggle)) return { action: buttons.toggle.action };
  if (pointInRect(mx, my, buttons.dir)) return { action: buttons.dir.action };
  const eggSpawn = getMacrophageEggSpawnHandle(e);
  if (Math.hypot(mx - eggSpawn.x, my - eggSpawn.y) <= 10) return { action: 'move-egg-spawn-point' };
  const germination = getMacrophageGerminationHandle(e);
  if (Math.hypot(mx - germination.x, my - germination.y) <= 10) return { action: 'move-germination-point' };
  const projectileSpawn = getMacrophageProjectileSpawnHandle(e);
  if (Math.hypot(mx - projectileSpawn.x, my - projectileSpawn.y) <= 10) return { action: 'move-projectile-spawn-point' };
  if (!macrophageMouthOverlay) return null;

  const mouthCircle = getMacrophageMouthCircle(e);
  const mouthResize = getMacrophageMouthCircleResizeHandle(e);
  const distanceHandle = {
    x: mouthCircle.x + Math.cos(mouthCircle.angle) * (mouthCircle.r + 16),
    y: mouthCircle.y + Math.sin(mouthCircle.angle) * (mouthCircle.r + 16)
  };
  if (Math.hypot(mx - distanceHandle.x, my - distanceHandle.y) <= 10) return { action: 'move-mouth-distance' };
  if (Math.hypot(mx - mouthResize.x, my - mouthResize.y) <= 10) return { action: 'resize-mouth-circle' };
  if (Math.hypot(mx - mouthCircle.x, my - mouthCircle.y) <= mouthCircle.r + 8) return { action: 'move-mouth-circle' };

  for (let i = 0; i < 2; i++) {
    const handle = getMacrophageMouthHandle(e, i);
    if (Math.hypot(mx - handle.x, my - handle.y) <= 10) return { action: 'move-mouth-range', rangeIdx: i };
  }

  const digest = getMacrophageDigestPathWorldPoints(e);
  for (const key of getMacrophageDigestPathPointKeys(e.digestPath)) {
    const point = digest[key];
    if (!point) continue;
    if (Math.hypot(mx - point.x, my - point.y) <= 10) return { action: 'move-digest-point', digestKey: key };
  }

  return null;
}

function drawMacrophageMouthOverlay(e) {
  ensureMacrophageDefaults(e);
  const pivot = getMacrophageBodyPivot(e);
  const bodyMin = getMacrophageBodyRangeHandle(e, 0);
  const bodyMax = getMacrophageBodyRangeHandle(e, 1);
  const anchor = getMacrophageMouthAnchor(e);
  const min = getMacrophageMouthHandle(e, 0);
  const max = getMacrophageMouthHandle(e, 1);
  const mouthCircle = getMacrophageMouthCircle(e);
  const mouthResize = getMacrophageMouthCircleResizeHandle(e);
  const digest = getMacrophageDigestPathWorldPoints(e);
  const digestKeys = getMacrophageDigestPathPointKeys(e.digestPath).filter(key => digest[key]);
  const digestPoints = digestKeys.map(key => digest[key]);
  const eggSpawn = getMacrophageEggSpawnHandle(e);
  const germination = getMacrophageGerminationHandle(e);
  const projectileSpawn = getMacrophageProjectileSpawnHandle(e);
  const len = Math.max(min.len, max.len);
  const bodyLen = Math.max(bodyMin.len, bodyMax.len);
  const enabled = e.mouth.enabled !== false;
  const bodyEnabled = e.bodyRotation.enabled !== false;
  const germinationEnabled = e.germination?.enabled ?? false;

  ctx.save();
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = enabled ? 'rgba(210,140,255,0.92)' : 'rgba(170,170,180,0.72)';
  ctx.beginPath();
  ctx.moveTo(anchor.x, anchor.y);
  ctx.lineTo(
    anchor.x + Math.cos(mouthCircle.angle) * len,
    anchor.y + Math.sin(mouthCircle.angle) * len
  );
  ctx.stroke();

  if (macrophageBodyOverlay) {
    ctx.strokeStyle = bodyEnabled ? 'rgba(255,184,110,0.92)' : 'rgba(170,170,180,0.72)';
    ctx.beginPath();
    ctx.moveTo(pivot.x - bodyLen, pivot.y);
    ctx.lineTo(pivot.x + bodyLen, pivot.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(pivot.x, pivot.y);
    ctx.lineTo(bodyMin.x, bodyMin.y);
    ctx.moveTo(pivot.x, pivot.y);
    ctx.lineTo(bodyMax.x, bodyMax.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(pivot.x, pivot.y, bodyLen, bodyMin.rad, bodyMax.rad);
    ctx.strokeStyle = bodyEnabled ? 'rgba(255,208,145,0.88)' : 'rgba(160,160,170,0.62)';
    ctx.stroke();
  }

  drawMacrophageBodyCiliaOverlay(e);

  if (e.orbit?.mode === 'free') {
    const free = getMacrophageFreeMoveGeometry(e);
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.moveTo(free.center.x, free.center.y);
    ctx.arc(free.center.x, free.center.y, free.radius, free.startRad, free.endRad);
    ctx.closePath();
    ctx.fillStyle = e.orbit.enabled ? 'rgba(120,235,190,0.10)' : 'rgba(150,170,160,0.08)';
    ctx.fill();
    ctx.strokeStyle = e.orbit.enabled ? 'rgba(120,235,190,0.88)' : 'rgba(150,170,160,0.58)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.moveTo(free.center.x, free.center.y);
    ctx.lineTo(free.vectorTip.x, free.vectorTip.y);
    ctx.strokeStyle = 'rgba(215,255,185,0.95)';
    ctx.lineWidth = 2;
    ctx.stroke();

    for (const handle of [free.startHandle, free.endHandle]) {
      ctx.beginPath();
      ctx.arc(handle.x, handle.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(120,235,190,0.96)';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(free.vectorTip.x, free.vectorTip.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(free.radiusHandle.x, free.radiusHandle.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,248,210,0.98)';
    ctx.fill();

    drawBadge(
      free.center.x,
      free.center.y - Math.max(18, free.radius + 14),
      `free ${Math.round(e.orbit.freeMove.impulse)} / ${Math.round(e.orbit.freeMove.intervalMs)}ms`,
      'rgba(120,235,190,0.86)'
    );
  } else if (e.orbit?.mode === 'spline' && Array.isArray(e.orbit?.splinePoints) && e.orbit.splinePoints.length > 2) {
    const center = getMacrophageOrbitCenter(e);
    const radiusHandle = getMacrophageOrbitRadiusHandle(e);
    const points = getMacrophageOrbitSplineWorldPoints(e);
    const selectedPointIdx = getSelectedMacrophageOrbitSplinePointIndex(e);
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.arc(center.x, center.y, Math.max(0, e.orbit.radius), 0, Math.PI * 2);
    ctx.strokeStyle = e.orbit.enabled ? 'rgba(120,235,190,0.34)' : 'rgba(150,170,160,0.24)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    const samples = Math.max(48, points.length * 20);
    const first = sampleClosedCatmullRom2D(points, 0);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i <= samples; i++) {
      const pos = sampleClosedCatmullRom2D(points, i / samples);
      ctx.lineTo(pos.x, pos.y);
    }
    ctx.strokeStyle = e.orbit.enabled ? 'rgba(120,235,190,0.92)' : 'rgba(150,170,160,0.58)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(center.x, center.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(120,235,190,0.22)';
    ctx.strokeStyle = 'rgba(120,235,190,0.95)';
    ctx.lineWidth = 1.4;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(radiusHandle.x, radiusHandle.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.strokeStyle = 'rgba(120,235,190,0.95)';
    ctx.lineWidth = 1.4;
    ctx.fill();
    ctx.stroke();
    points.forEach(point => {
      const isSelected = point.idx === selectedPointIdx;
      ctx.beginPath();
      ctx.arc(point.x, point.y, isSelected ? 6 : 5, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? 'rgba(215,255,185,0.98)' : 'rgba(120,235,190,0.95)';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.3;
      ctx.fill();
      ctx.stroke();
      drawBadge(point.x, point.y - 14, `p${point.idx + 1}`, isSelected ? 'rgba(190,245,155,0.9)' : 'rgba(120,235,190,0.72)');
    });
    drawBadge(center.x, center.y - Math.max(18, e.orbit.radius + 14), `spline ${points.length} / ${e.orbit.speed.toFixed(3)}`, 'rgba(120,235,190,0.86)');
  } else if (Array.isArray(e.orbit?.segments) && e.orbit.segments.length > 0) {
    const selectedSegmentIdx = getSelectedMacrophageOrbitSegmentIndex(e);
    ctx.setLineDash([7, 6]);
    for (let idx = 0; idx < e.orbit.segments.length; idx++) {
      const geom = getMacrophageOrbitSegmentGeometry(e, idx);
      if (!geom) continue;
      const isSelected = idx === selectedSegmentIdx;
      ctx.beginPath();
      ctx.arc(geom.center.x, geom.center.y, geom.radius, geom.startRad, geom.endRad, geom.ccw);
      ctx.strokeStyle = isSelected
        ? 'rgba(215,255,185,0.98)'
        : (e.orbit.enabled ? 'rgba(120,235,190,0.82)' : 'rgba(150,170,160,0.48)');
      ctx.lineWidth = isSelected ? 2.8 : 1.4;
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(geom.center.x, geom.center.y, isSelected ? 6 : 5, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? 'rgba(215,255,185,0.24)' : 'rgba(120,235,190,0.18)';
      ctx.strokeStyle = isSelected ? 'rgba(215,255,185,0.98)' : 'rgba(120,235,190,0.92)';
      ctx.stroke();
      ctx.fill();

      ctx.beginPath();
      ctx.arc(geom.start.x, geom.start.y, isSelected ? 5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.96)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(geom.end.x, geom.end.y, isSelected ? 5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? 'rgba(215,255,185,0.96)' : 'rgba(120,235,190,0.96)';
      ctx.fill();
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(geom.radiusHandle.x, geom.radiusHandle.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,248,210,0.98)';
        ctx.strokeStyle = 'rgba(215,255,185,0.98)';
        ctx.lineWidth = 1.2;
        ctx.fill();
        ctx.stroke();
      }
      drawBadge(
        geom.center.x,
        geom.center.y - Math.max(isSelected ? 18 : 14, geom.radius + (isSelected ? 14 : 10)),
        isSelected ? `arc ${idx + 1}` : String(idx + 1),
        isSelected ? 'rgba(190,245,155,0.9)' : 'rgba(120,235,190,0.72)'
      );
      ctx.setLineDash([7, 6]);
    }
    ctx.setLineDash([]);
    const selectedSegment = e.orbit.segments[selectedSegmentIdx] ?? e.orbit.segments[0];
    drawBadge(
      e.x + (selectedSegment?.centerDx ?? 0),
      e.y + (selectedSegment?.centerDy ?? 0) - Math.max(18, (selectedSegment?.radius ?? 0) + 14),
      `orbit arcs ${e.orbit.segments.length} / selected ${selectedSegmentIdx + 1}`,
      'rgba(120,235,190,0.86)'
    );
  } else {
    const orbitCenter = getMacrophageOrbitCenter(e);
    const orbitRadiusHandle = getMacrophageOrbitRadiusHandle(e);
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.arc(orbitCenter.x, orbitCenter.y, Math.max(0, e.orbit.radius), 0, Math.PI * 2);
    ctx.strokeStyle = e.orbit.enabled ? 'rgba(120,235,190,0.82)' : 'rgba(150,170,160,0.48)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(orbitCenter.x, orbitCenter.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(120,235,190,0.22)';
    ctx.strokeStyle = 'rgba(120,235,190,0.95)';
    ctx.lineWidth = 1.4;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(orbitRadiusHandle.x, orbitRadiusHandle.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.strokeStyle = 'rgba(120,235,190,0.95)';
    ctx.lineWidth = 1.4;
    ctx.fill();
    ctx.stroke();
    drawBadge(orbitCenter.x, orbitCenter.y - Math.max(18, e.orbit.radius + 14), `orbit ${Math.round(e.orbit.radius)} / ${e.orbit.speed.toFixed(3)}`, 'rgba(120,235,190,0.86)');
  }

  {
    ctx.beginPath();
    ctx.moveTo(eggSpawn.circle.x, eggSpawn.circle.y);
    ctx.lineTo(eggSpawn.x, eggSpawn.y);
    ctx.strokeStyle = 'rgba(255,165,120,0.88)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(germination.circle.x, germination.circle.y);
    ctx.lineTo(germination.x, germination.y);
    ctx.strokeStyle = germinationEnabled ? 'rgba(145,235,165,0.88)' : 'rgba(150,170,160,0.66)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(projectileSpawn.circle.x, projectileSpawn.circle.y);
    ctx.lineTo(projectileSpawn.x, projectileSpawn.y);
    ctx.strokeStyle = 'rgba(255,235,120,0.88)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  if (macrophageMouthOverlay) {
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(min.x, min.y);
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(max.x, max.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(mouthCircle.x, mouthCircle.y, mouthCircle.r, 0, Math.PI * 2);
    ctx.fillStyle = enabled ? 'rgba(130,230,245,0.12)' : 'rgba(160,160,170,0.08)';
    ctx.fill();
    ctx.strokeStyle = enabled ? 'rgba(130,230,245,0.92)' : 'rgba(160,160,170,0.72)';
    ctx.stroke();
    drawMacrophageMouthCiliaOverlay(e, mouthCircle);

    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, len, min.rad, max.rad);
    ctx.strokeStyle = enabled ? 'rgba(230,205,255,0.88)' : 'rgba(160,160,170,0.62)';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(digestPoints[0].x, digestPoints[0].y);
    const digestSteps = Math.max(24, digestPoints.length * 14);
    for (let i = 1; i <= digestSteps; i++) {
      const pos = getMacrophageDigestBezierPoint(digestPoints, i / digestSteps);
      ctx.lineTo(pos.x, pos.y);
    }
    ctx.strokeStyle = 'rgba(255,220,80,0.78)';
    ctx.lineWidth = 1.8;
    ctx.stroke();

  }
  ctx.setLineDash([]);

  const bodyButtons = getMacrophageBodyCanvasButtons(e);
  const buttons = getMacrophageMouthCanvasButtons(e);
  drawCanvasPill(bodyButtons.toggle, bodyButtons.toggle.label, macrophageBodyOverlay ? 'rgba(255,184,110,0.86)' : 'rgba(24,28,36,0.88)');
  drawCanvasPill(bodyButtons.dir, bodyButtons.dir.label, bodyEnabled ? 'rgba(255,208,145,0.86)' : 'rgba(120,120,130,0.82)');
  drawCanvasPill(buttons.toggle, buttons.toggle.label, macrophageMouthOverlay ? 'rgba(210,140,255,0.82)' : 'rgba(24,28,36,0.88)');
  drawCanvasPill(buttons.dir, buttons.dir.label, enabled ? 'rgba(130,230,245,0.82)' : 'rgba(120,120,130,0.82)');

  const spriteGeom = getMacrophageSpriteSelectionGeometry(e);
  if (spriteGeom) {
    const hovered = hoverEnemyAnatomyHandle?.action === 'move-macro-sprite-handle';
    ctx.beginPath();
    ctx.moveTo(spriteGeom.topCenter.x, spriteGeom.topCenter.y);
    ctx.lineTo(spriteGeom.handle.x, spriteGeom.handle.y);
    ctx.strokeStyle = 'rgba(255,224,190,0.92)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(spriteGeom.handle.x, spriteGeom.handle.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = hovered ? '#fff' : 'rgba(255,208,145,0.96)';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    drawBadge(spriteGeom.handle.x, spriteGeom.handle.y - 14, `move ${Math.round(e.x)}, ${Math.round(e.y)}`, 'rgba(255,184,110,0.88)');
  }

  if (macrophageBodyOverlay) {
    const pivotHover = hoverEnemyAnatomyHandle?.action === 'move-body-pivot';
    ctx.beginPath();
    ctx.arc(pivot.x, pivot.y, pivot.r, 0, Math.PI * 2);
    ctx.fillStyle = pivotHover ? 'rgba(255,184,110,0.72)' : 'rgba(255,184,110,0.22)';
    ctx.strokeStyle = 'rgba(255,224,190,0.98)';
    ctx.lineWidth = 1.4;
    ctx.fill();
    ctx.stroke();
    drawBadge(pivot.x, pivot.y - Math.max(16, pivot.r + 12), `pivot ${Math.round(e.bodyRotation.pivotDx)}, ${Math.round(e.bodyRotation.pivotDy)}`, 'rgba(255,184,110,0.88)');

    for (let i = 0; i < 2; i++) {
      const handle = i === 0 ? bodyMin : bodyMax;
      const hovered = hoverEnemyAnatomyHandle?.action === 'move-body-range' && hoverEnemyAnatomyHandle?.rangeIdx === i;
      ctx.beginPath();
      ctx.arc(handle.x, handle.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = hovered ? '#fff' : 'rgba(255,208,145,0.95)';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      drawBadge(handle.x, handle.y - 14, `${i === 0 ? 'body min' : 'body max'} ${Math.round(handle.deg)}°`, 'rgba(255,184,110,0.88)');
    }
  }

  {
    ctx.beginPath();
    ctx.arc(eggSpawn.x, eggSpawn.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = hoverEnemyAnatomyHandle?.action === 'move-egg-spawn-point' ? '#fff' : 'rgba(255,165,120,0.95)';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    drawBadge(eggSpawn.x, eggSpawn.y - 14, `egg x${e.eggSpawn.feedCount}`, 'rgba(255,165,120,0.9)');

    ctx.beginPath();
    ctx.arc(germination.x, germination.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = hoverEnemyAnatomyHandle?.action === 'move-germination-point'
      ? '#fff'
      : (germinationEnabled ? 'rgba(145,235,165,0.95)' : 'rgba(150,170,160,0.86)');
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    drawBadge(
      germination.x,
      germination.y - 14,
      `${germinationEnabled ? 'bud' : 'bud off'} x${e.germination.feedCount}`,
      germinationEnabled ? 'rgba(145,235,165,0.88)' : 'rgba(150,170,160,0.82)'
    );

    ctx.beginPath();
    ctx.arc(projectileSpawn.x, projectileSpawn.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = hoverEnemyAnatomyHandle?.action === 'move-projectile-spawn-point'
      ? '#fff'
      : 'rgba(255,235,120,0.95)';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    drawBadge(projectileSpawn.x, projectileSpawn.y - 14, 'proj', 'rgba(255,235,120,0.88)');
  }

  if (macrophageMouthOverlay) {
    const distanceHandle = {
      x: mouthCircle.x + Math.cos(mouthCircle.angle) * (mouthCircle.r + 16),
      y: mouthCircle.y + Math.sin(mouthCircle.angle) * (mouthCircle.r + 16)
    };
    const mouthHover = hoverEnemyAnatomyHandle?.action === 'move-mouth-circle';
    const mouthResizeHover = hoverEnemyAnatomyHandle?.action === 'resize-mouth-circle';
    const mouthDistanceHover = hoverEnemyAnatomyHandle?.action === 'move-mouth-distance';
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(mouthCircle.x, mouthCircle.y);
    ctx.strokeStyle = 'rgba(130,230,245,0.85)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(mouthCircle.x, mouthCircle.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = mouthHover ? 'rgba(130,230,245,0.75)' : 'rgba(130,230,245,0.22)';
    ctx.strokeStyle = 'rgba(130,230,245,0.95)';
    ctx.lineWidth = 1.4;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(distanceHandle.x, distanceHandle.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = mouthDistanceHover ? '#fff' : 'rgba(235,215,255,0.95)';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(mouthResize.x, mouthResize.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = mouthResizeHover ? '#fff' : 'rgba(130,230,245,0.95)';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    drawBadge(mouthCircle.x, mouthCircle.y - Math.max(14, mouthCircle.r + 10), `mouth r ${Math.round(mouthCircle.r)}`, 'rgba(130,230,245,0.88)');
    drawBadge((anchor.x + mouthCircle.x) * 0.5, (anchor.y + mouthCircle.y) * 0.5 - 12, `dist ${Math.round(mouthCircle.len)}`, 'rgba(235,215,255,0.88)');
    for (const key of digestKeys) {
      const point = digest[key];
      const hovered = hoverEnemyAnatomyHandle?.action === 'move-digest-point' && hoverEnemyAnatomyHandle?.digestKey === key;
      const color = key === 'start' || key === 'end' ? 'rgba(255,220,80,0.95)' : 'rgba(255,245,190,0.92)';
      ctx.beginPath();
      ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = hovered ? '#fff' : color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.3;
      ctx.stroke();
      drawBadge(point.x, point.y - 14, key, 'rgba(255,220,80,0.88)');
    }

    for (let i = 0; i < 2; i++) {
      const handle = i === 0 ? min : max;
      const hovered = hoverEnemyAnatomyHandle?.action === 'move-mouth-range' && hoverEnemyAnatomyHandle?.rangeIdx === i;
      const label = i === 0 ? 'min' : 'max';
      ctx.beginPath();
      ctx.arc(handle.x, handle.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = hovered ? '#fff' : 'rgba(210,140,255,0.92)';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      drawBadge(handle.x, handle.y - 14, `${label} ${Math.round(handle.deg)}°`, 'rgba(210,140,255,0.88)');
    }
  }

  drawBadge(anchor.x + len * 0.55, anchor.y - 12, enabled ? 'mouth active' : 'mouth off', enabled ? 'rgba(130,230,245,0.88)' : 'rgba(150,150,160,0.88)');
  if (macrophageBodyOverlay) drawBadge(pivot.x + bodyLen * 0.42, pivot.y - 12, bodyEnabled ? 'body active' : 'body off', bodyEnabled ? 'rgba(255,184,110,0.88)' : 'rgba(150,150,160,0.88)');
  ctx.restore();
}

async function downloadJson(filename, data) {
  const jsonText = JSON.stringify(data, null, 2);

  if (window.showSaveFilePicker) {
    const sceneSnapshot = captureEditorSceneState();
    pendingSaveRecoverySnapshot = sceneSnapshot;
    pendingSaveRecoveryLabel = `File save (${filename})`;
    sceneResizeLocked = true;

    try {
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: 'JSON files',
          accept: { 'application/json': ['.json'] }
        }]
      });
      if (!fileHandle) return;
      const writable = await fileHandle.createWritable();
      await writable.write(jsonText);
      await writable.close();
    } finally {
      sceneResizeLocked = false;
      restoreEditorSceneState(sceneSnapshot);
      saveEditorDraft();
      setTimeout(recoverCanvasAfterSystemDialog, 0);
      setTimeout(recoverCanvasAfterSystemDialog, 80);
      setTimeout(recoverCanvasAfterSystemDialog, 200);
      setTimeout(verifySceneAfterSave, 0);
      setTimeout(verifySceneAfterSave, 120);
      setTimeout(verifySceneAfterSave, 350);
    }
    return;
  }

  const blob = new Blob([jsonText], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 250);
}

function makeSafeFilename(name) { return name.toLowerCase().replace(/[^a-z0-9-_]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'entity'; }

function makeLevelFilename() {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `level_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.json`;
}

function openHandleDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE_NAME)) {
        db.createObjectStore(HANDLE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function setStoredHandle(key, handle) {
  const db = await openHandleDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE_NAME, 'readwrite');
    tx.objectStore(HANDLE_STORE_NAME).put(handle, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  db.close();
}

async function getStoredHandle(key) {
  const db = await openHandleDb();
  const result = await new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE_NAME, 'readonly');
    const request = tx.objectStore(HANDLE_STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}

function buildSelectedEnemyExport(enemy) {
  ensureEnemyDefaults(enemy);
  const { _id, bodyCircles, innerArtifacts, ...rest } = enemy;
  return {
    version: 1,
    type: 'Enemy',
    ...rest,
    bodyCircles: bodyCircles.map(circle => ({
      dxR: parseFloat((circle.dx / Math.max(enemy.radius, 0.0001)).toFixed(4)),
      dyR: parseFloat((circle.dy / Math.max(enemy.radius, 0.0001)).toFixed(4)),
      rR: parseFloat((circle.r / Math.max(enemy.radius, 0.0001)).toFixed(4))
    })),
    innerArtifacts: (innerArtifacts ?? []).map(artifact => ({
      dxR: parseFloat(((artifact.dx ?? 0) / enemy.radius).toFixed(4)),
      dyR: parseFloat(((artifact.dy ?? 0) / enemy.radius).toFixed(4)),
      rR: parseFloat(((artifact.radius ?? Math.max(2, enemy.radius * 0.25)) / enemy.radius).toFixed(4)),
      spriteIndex: Math.min(ENEMY_SPRITE_INDEX_MAX, normalizeSpriteIndex(artifact.spriteIndex, 1))
    })),
    xNorm: parseFloat((enemy.x / canvas.width).toFixed(5)),
    yNorm: parseFloat((enemy.y / canvas.height).toFixed(5))
  };
}

function buildSelectedComposedStoneExport(stone) {
  ensureComposedStoneDefaults(stone);
  const { _id, ...rest } = stone;
  return {
    type: 'ComposedStone',
    ...rest,
    circles: (stone.circles ?? []).map(circle => ({
      dx: Number(circle.dx ?? 0),
      dy: Number(circle.dy ?? 0),
      r: Math.max(2, Number(circle.r ?? stone.radius ?? 34))
    }))
  };
}

function buildSelectedAlgaeExport(algae) {
  ensureAlgaeDefaults(algae);
  const { _id, ...rest } = algae;
  return {
    type: 'Algae',
    ...rest,
    circles: (algae.circles ?? []).map(circle => ({
      dx: Number(circle.dx ?? 0),
      dy: Number(circle.dy ?? 0),
      r: Math.max(2, Number(circle.r ?? algae.radius ?? 30))
    }))
  };
}

function buildComposedEntityExport(selection, name = 'composed_entity') {
  const selected = Array.isArray(selection) ? selection.filter(Boolean) : [];
  if (selected.length < 2) throw new Error('Select at least two entities.');

  const minX = Math.min(...selected.map(entity => entity.x ?? 0));
  const minY = Math.min(...selected.map(entity => entity.y ?? 0));
  const maxX = Math.max(...selected.map(entity => entity.x ?? 0));
  const maxY = Math.max(...selected.map(entity => entity.y ?? 0));

  const spriteIndex = Math.max(1, (entityPresetsByType.ComposedEntity?.length ?? 0) + 1);
  const spriteSubfolder = `ComposedEntity_${formatPresetSlot(spriteIndex)}`;
  return {
    version: 1,
    type: 'ComposedEntity',
    name,
    spriteIndex,
    spriteSubfolder,
    spriteScale: 1,
    spriteRotationOffset: 0,
    spriteBodyU: 0.5,
    spriteBodyV: 0.5,
    spriteReferenceRadius: Math.max(maxX - minX, maxY - minY) * 0.5,
    spriteDebug: false,
    anchorMode: 'top-left',
    bounds: {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY
    },
    entities: selected.map(entity => {
      const child = structuredClone(stripEditorTransientEntityState(entity));
      delete child._id;
      delete child.instanceIndex;
      child.offsetX = Number((child.x - minX).toFixed(3));
      child.offsetY = Number((child.y - minY).toFixed(3));
      delete child.x;
      delete child.y;
      return child;
    })
  };
}

function getSrcPresetConfig(entityType) {
  return SRC_PRESET_CONFIGS[entityType] ?? null;
}

function getPresetSlotIndexForEntity(entity) {
  if (!entity) return 1;
  return normalizeSpriteIndex(
    entity.spriteIndex ?? entity.instanceIndex ?? activeIndex[entity.type] ?? 1,
    1
  );
}

function getSrcPresetSpecForEntity(entity) {
  if (!entity) return null;
  const config = getSrcPresetConfig(entity.type);
  if (!config) return null;

  const slot = formatPresetSlot(getPresetSlotIndexForEntity(entity), 2);

  let data = null;
  if (entity.type === 'Enemy') data = buildSelectedEnemyExport(entity);
  else if (entity.type === 'ComposedStone') data = buildSelectedComposedStoneExport(entity);
  else if (entity.type === 'Algae') data = buildSelectedAlgaeExport(entity);
  else return null;

  return {
    slot,
    folder: config.folder,
    subfolder: `${config.folderPrefix}${slot}`,
    filename: `${config.jsonPrefix}${slot}.json`,
    data
  };
}

async function saveSelectedEnemyJSON() {
  const sel = getSelected();
  if (!sel || sel.type !== 'Enemy') {
    setEditorStatus('Select an Enemy first.', 'warning');
    return;
  }
  const exported = buildSelectedEnemyExport(sel);
  const presetIndex = normalizeSpriteIndex(exported.spriteIndex ?? exported.instanceIndex, 1);
  const filename = `enemy_${formatPresetSlot(presetIndex)}.json`;
  await downloadJson(filename, exported);
  setEditorStatus(`Enemy preset saved as ${filename}.`, 'success');
}

function saveSelectedComposedStoneJSON() {
  const sel = getSelected();
  if (!sel || sel.type !== 'ComposedStone') {
    alert('Select a ComposedStone first.');
    return;
  }
  writePresetToSrcByIndex().catch(err => {
    if (err?.name !== 'AbortError') alert('Failed to save preset to src: ' + err.message);
  });
}

function saveSelectedAlgaeJSON() {
  const sel = getSelected();
  if (!sel || sel.type !== 'Algae') {
    alert('Select an Algae first.');
    return;
  }
  writePresetToSrcByIndex().catch(err => {
    if (err?.name !== 'AbortError') alert('Failed to save preset to src: ' + err.message);
  });
}

function updateProjectDisplay() {
  const el = document.getElementById('project-display');
  el.textContent = projectRootHandle
    ? `project: ${projectRootHandle.name}`
    : 'project: select microscopic.game once for direct save';
}

let statusMessageTimer = null;
function setEditorStatus(message, tone = 'info') {
  const el = document.getElementById('status-display');
  if (!el) return;
  const colors = {
    info: 'var(--info)',
    success: 'var(--success)',
    warning: 'var(--warning)',
    error: 'var(--danger)'
  };
  el.textContent = message || '';
  el.style.color = colors[tone] || colors.info;
  if (statusMessageTimer) clearTimeout(statusMessageTimer);
  if (message) {
    statusMessageTimer = setTimeout(() => {
      if (el.textContent === message) el.textContent = '';
    }, 5000);
  }
}

function scaleEntityGeometry(entity, scale, offsetX = 0, offsetY = 0) {
  if (!entity) return;

  entity.x = clampNum(entity.x, 0) * scale + offsetX;
  entity.y = clampNum(entity.y, 0) * scale + offsetY;

  if (entity.radius != null) {
    entity.radius = Math.max(2, clampNum(entity.radius, 0) * scale);
  }

  if (Array.isArray(entity.circles)) {
    entity.circles = entity.circles.map(circle => ({
      ...circle,
      dx: clampNum(circle.dx, 0) * scale,
      dy: clampNum(circle.dy, 0) * scale,
      r: Math.max(2, clampNum(circle.r, entity.radius ?? 2) * scale)
    }));
  }

  if (Array.isArray(entity.bodyCircles)) {
    entity.bodyCircles = entity.bodyCircles.map(circle => ({
      ...circle,
      dx: clampNum(circle.dx, 0) * scale,
      dy: clampNum(circle.dy, 0) * scale,
      r: Math.max(2, clampNum(circle.r, entity.radius ?? 2) * scale)
    }));
  }

  if (entity.type === 'Macrophage') {
    ensureMacrophageDefaults(entity);
    if (entity.mouth && typeof entity.mouth === 'object') {
      entity.mouth.offsetDistance = Math.max(0, clampNum(entity.mouth.offsetDistance, entity.radius ?? 0) * scale);
      entity.mouth.absorbRadius = Math.max(2, clampNum(entity.mouth.absorbRadius, 22) * scale);
      entity.mouthOffsetDistance = entity.mouth.offsetDistance;
      entity.mouthAbsorbRadius = entity.mouth.absorbRadius;
    }
    if (entity.orbit && typeof entity.orbit === 'object') {
      entity.orbit.centerDx = clampNum(entity.orbit.centerDx, 0) * scale;
      entity.orbit.centerDy = clampNum(entity.orbit.centerDy, 0) * scale;
      entity.orbit.radius = Math.max(0, clampNum(entity.orbit.radius, 0) * scale);
      if (Array.isArray(entity.orbit.segments)) {
        entity.orbit.segments = entity.orbit.segments.map(segment => ({
          ...makeDefaultMacrophageOrbitSegment(segment),
          centerDx: clampNum(segment?.centerDx, 0) * scale,
          centerDy: clampNum(segment?.centerDy, 0) * scale,
          radius: Math.max(0, clampNum(segment?.radius, 0) * scale)
        }));
      }
      if (Array.isArray(entity.orbit.splinePoints)) {
        entity.orbit.splinePoints = entity.orbit.splinePoints.map(point => ({
          dx: clampNum(point?.dx, 0) * scale,
          dy: clampNum(point?.dy, 0) * scale
        }));
      }
      if (entity.orbit.freeMove && typeof entity.orbit.freeMove === 'object') {
        entity.orbit.freeMove.previewRadius = Math.max(12, clampNum(entity.orbit.freeMove.previewRadius, 140) * scale);
      }
    }
    if (entity.digestPath && typeof entity.digestPath === 'object') {
      for (const key of getMacrophageDigestPathPointKeys(entity.digestPath)) {
        if (!entity.digestPath[key]) continue;
        entity.digestPath[key].dx = clampNum(entity.digestPath[key].dx, 0) * scale;
        entity.digestPath[key].dy = clampNum(entity.digestPath[key].dy, 0) * scale;
      }
    }
    if (entity.bodyRotation && typeof entity.bodyRotation === 'object') {
      entity.bodyRotation.pivotDx = clampNum(entity.bodyRotation.pivotDx, 0) * scale;
      entity.bodyRotation.pivotDy = clampNum(entity.bodyRotation.pivotDy, 0) * scale;
      entity.bodyRotation.pivotRadius = Math.max(4, clampNum(entity.bodyRotation.pivotRadius, 12) * scale);
    }
  }

  if (Array.isArray(entity.innerArtifacts)) {
    entity.innerArtifacts = entity.innerArtifacts.map(artifact => ({
      ...artifact,
      dx: clampNum(artifact.dx, 0) * scale,
      dy: clampNum(artifact.dy, 0) * scale,
      radius: Math.max(2, clampNum(artifact.radius, entity.radius ?? 2) * scale)
    }));
  }

  if (entity.width != null) entity.width = Math.max(2, clampNum(entity.width, 0) * scale);
  if (entity.height != null) entity.height = Math.max(2, clampNum(entity.height, 0) * scale);
}

function resizeCanvas() {
  const nextWidth = Math.max(1, wrap.clientWidth || 0);
  const nextHeight = Math.max(1, wrap.clientHeight || 0);
  const prevWidth = canvas.width;
  const prevHeight = canvas.height;

  if (sceneResizeLocked) {
    return;
  }

  if (nextWidth <= 1 || nextHeight <= 1) {
    return;
  }

  if (prevWidth === nextWidth && prevHeight === nextHeight) {
    render();
    return;
  }

  canvas.width = nextWidth;
  canvas.height = nextHeight;

  if (prevWidth > 0 && prevHeight > 0) {
    const scaleX = nextWidth / prevWidth;
    const scaleY = nextHeight / prevHeight;
    const uniformScale = Math.min(scaleX, scaleY);
    const offsetX = (nextWidth - prevWidth * uniformScale) * 0.5;
    const offsetY = (nextHeight - prevHeight * uniformScale) * 0.5;

    entities.forEach(entity => scaleEntityGeometry(entity, uniformScale, offsetX, offsetY));
    clampEditorEntitiesInsideCanvas();

    if (backgroundImage) {
      backgroundOffsetX = backgroundOffsetX * uniformScale + offsetX;
      backgroundOffsetY = backgroundOffsetY * uniformScale + offsetY;
      backgroundScale *= uniformScale;
    }
  }

  clampEditorEntitiesInsideCanvas();
  render();
}
window.addEventListener('resize', resizeCanvas);

function ensureCanvasBackingStore() {
  const expectedWidth = Math.max(1, wrap.clientWidth || 0);
  const expectedHeight = Math.max(1, wrap.clientHeight || 0);
  if (expectedWidth <= 1 || expectedHeight <= 1) return;
  if (canvas.width === expectedWidth && canvas.height === expectedHeight) return;
  canvas.width = expectedWidth;
  canvas.height = expectedHeight;
  clampEditorEntitiesInsideCanvas();
}

function updateBackgroundButtons() {
  const loadBtn = document.getElementById('btn-load-bg');
  const clearBtn = document.getElementById('btn-clear-bg');
  const editBtn = document.getElementById('btn-edit-bg');
  const resetBtn = document.getElementById('btn-reset-bg');
  if (loadBtn) loadBtn.textContent = backgroundImageName ? `Background: ${backgroundImageName}` : 'Load PNG Background';
  if (clearBtn) clearBtn.disabled = !backgroundImage;
  if (editBtn) {
    editBtn.textContent = `Edit Background: ${backgroundEditMode ? 'ON' : 'OFF'}`;
    editBtn.disabled = !backgroundImage;
  }
  if (resetBtn) resetBtn.disabled = !backgroundImage;
}

function drawBackgroundImage() {
  if (!backgroundImage) return;
  const drawW = backgroundImage.naturalWidth * backgroundScale;
  const drawH = backgroundImage.naturalHeight * backgroundScale;
  ctx.save();
  ctx.globalAlpha = backgroundImageAlpha;
  ctx.drawImage(backgroundImage, backgroundOffsetX, backgroundOffsetY, drawW, drawH);
  ctx.restore();

  if (backgroundEditMode) {
    ctx.save();
    ctx.strokeStyle = 'rgba(130,230,245,0.9)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(backgroundOffsetX, backgroundOffsetY, drawW, drawH);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(130,230,245,0.9)';
    ctx.font = 'bold 11px JetBrains Mono, monospace';
    ctx.fillText('Background edit mode: drag to move, wheel to zoom', 14, 22);
    ctx.restore();
  }
}

function drawComposedStoneSprite(e, selected, isPreview = false) {
  ensureComposedStoneDefaults(e);
  const metrics = getComposedStoneMetrics(e, e.circles);

  const spriteCandidates = buildComposedStoneSpritePathCandidates(e);
  const { img } = getLoadedEditorImage(spriteCandidates);

  if (!(img && img.complete && img.naturalWidth)) {
    return false;
  }

  const drawW = getComposedStoneSpriteReferenceRadius(e) * clampNum(e.spriteScale, 1.18) * 2.0;
  const drawH = drawW * (img.naturalHeight / Math.max(img.naturalWidth, 1));
  const flipX = !!e.spriteFlipX;
  const anchorX = drawW * clampNum(e.spriteBodyU, 0.5);
  const anchorY = drawH * clampNum(e.spriteBodyV, 0.5);

  ctx.save();
  if (selected && !isPreview) {
    ctx.shadowColor = 'rgba(231,220,200,0.55)';
    ctx.shadowBlur = 18;
  }
  ctx.translate(e.x, e.y);
  ctx.rotate(clampNum(e.spriteRotationOffset, 0));
  if (flipX) ctx.scale(-1, 1);
  ctx.drawImage(img, -anchorX, -anchorY, drawW, drawH);
  if (selected && !isPreview) {
    ctx.strokeStyle = 'rgba(231,220,200,0.78)';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(-anchorX, -anchorY, drawW, drawH);
  }

  if (e.spriteDebug) {
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0,255,255,0.9)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-anchorX, -anchorY, drawW, drawH);
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0,255,255,0.95)';
    ctx.lineWidth = 2;
    ctx.moveTo(-8, 0);
    ctx.lineTo(8, 0);
    ctx.moveTo(0, -8);
    ctx.lineTo(0, 8);
    ctx.stroke();
  }
  ctx.restore();

  if (e.spriteDebug && Array.isArray(e.circles)) {
    ctx.save();
    for (let i = e.circles.length - 1; i >= 0; i--) {
      const c = e.circles[i];
      const cx = e.x + c.dx;
      const cy = e.y + c.dy;
      ctx.beginPath();
      ctx.arc(cx, cy, c.r, 0, Math.PI * 2);
      ctx.strokeStyle = i === 0 ? 'rgba(0,255,255,0.98)' : 'rgba(0,255,255,0.75)';
      ctx.lineWidth = i === 0 ? 2.2 : 1.6;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(e.x, e.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,255,255,0.95)';
    ctx.fill();
    ctx.restore();
  }
  return true;
}

function drawAlgaeSprite(e, selected, isPreview = false) {
  ensureAlgaeDefaults(e);
  const spriteCandidates = buildAlgaeSpritePathCandidates(e);
  const { img } = getLoadedEditorImage(spriteCandidates);

  if (!(img && img.complete && img.naturalWidth)) {
    return false;
  }

  const drawW = getAlgaeSpriteReferenceRadius(e) * clampNum(e.spriteScale, 1.08) * 2.0;
  const drawH = drawW * (img.naturalHeight / Math.max(img.naturalWidth, 1));
  const flipX = !!e.spriteFlipX;
  const anchorX = drawW * clampNum(e.spriteBodyU, 0.5);
  const anchorY = drawH * clampNum(e.spriteBodyV, 0.5);

  ctx.save();
  if (selected && !isPreview) {
    ctx.shadowColor = 'rgba(120,210,150,0.42)';
    ctx.shadowBlur = 18;
  }
  ctx.translate(e.x, e.y);
  ctx.rotate(clampNum(e.spriteRotationOffset, 0));
  if (flipX) ctx.scale(-1, 1);
  ctx.drawImage(img, -anchorX, -anchorY, drawW, drawH);
  if (selected && !isPreview) {
    ctx.strokeStyle = 'rgba(170,245,196,0.74)';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(-anchorX, -anchorY, drawW, drawH);
  }

  if (e.spriteDebug) {
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0,255,255,0.9)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-anchorX, -anchorY, drawW, drawH);
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0,255,255,0.95)';
    ctx.lineWidth = 2;
    ctx.moveTo(-8, 0);
    ctx.lineTo(8, 0);
    ctx.moveTo(0, -8);
    ctx.lineTo(0, 8);
    ctx.stroke();
  }
  ctx.restore();
  return true;
}

function drawComposedEntitySprite(e, selected, isPreview = false) {
  ensureComposedEntityDefaults(e);
  const spriteCandidates = buildComposedEntitySpritePathCandidates(e);
  const img = getLoadedEditorImageSticky(
    spriteCandidates,
    isPreview ? '_editorPreviewLastRenderableSpriteImage' : '_editorLastRenderableSpriteImage',
    e
  );
  if (!(img && img.complete && img.naturalWidth)) return false;

  const drawW = Math.max(4, e.spriteReferenceRadius * clampNum(e.spriteScale, 1) * 2.0);
  const drawH = drawW * (img.naturalHeight / Math.max(img.naturalWidth, 1));
  const anchorX = drawW * clampNum(e.spriteBodyU, 0);
  const anchorY = drawH * clampNum(e.spriteBodyV, 0);

  ctx.save();
  if (selected && !isPreview) {
    ctx.shadowColor = 'rgba(120,220,200,0.5)';
    ctx.shadowBlur = 18;
  }
  ctx.translate(e.x, e.y);
  ctx.rotate(clampNum(e.spriteRotationOffset, 0));
  ctx.drawImage(img, -anchorX, -anchorY, drawW, drawH);
  if (e.spriteDebug) {
    ctx.strokeStyle = 'rgba(120,220,200,0.88)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-anchorX, -anchorY, drawW, drawH);
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(8, 0);
    ctx.moveTo(0, -8);
    ctx.lineTo(0, 8);
    ctx.stroke();
  }
  ctx.restore();
  return true;
}

function clearBackgroundImage() {
  backgroundImage = null;
  backgroundImageSrc = '';
  backgroundImageName = '';
  backgroundEditMode = false;
  backgroundOffsetX = 0;
  backgroundOffsetY = 0;
  backgroundScale = 1;
  const input = document.getElementById('bg-file-input');
  if (input) input.value = '';
  updateBackgroundButtons();
  render();
}

function loadBackgroundFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => applyBackgroundState(reader.result, file.name);
  reader.readAsDataURL(file);
}

function toggleBackgroundEditMode() {
  if (!backgroundImage) return;
  backgroundEditMode = !backgroundEditMode;
  updateBackgroundButtons();
  canvas.style.cursor = backgroundEditMode ? 'grab' : (activeTool === 'select' ? 'default' : 'crosshair');
  render();
}

function zoomBackgroundAtPoint(delta, anchorX, anchorY) {
  if (!backgroundImage) return;
  const nextScale = Math.min(12, Math.max(0.05, backgroundScale * (delta > 0 ? 0.92 : 1.08)));
  const ratio = nextScale / backgroundScale;
  backgroundOffsetX = anchorX - (anchorX - backgroundOffsetX) * ratio;
  backgroundOffsetY = anchorY - (anchorY - backgroundOffsetY) * ratio;
  backgroundScale = nextScale;
}

function drawCystShape(targetCtx, x, y, radius, selected = false, alpha = CYST_DEFAULT_ALPHA, rotation = 0) {
  const r = Math.max(1, radius);
  targetCtx.save();
  targetCtx.globalAlpha *= Math.max(0, Math.min(1, alpha));
  if (selected) {
    targetCtx.shadowColor = 'rgba(130,220,165,0.45)';
    targetCtx.shadowBlur = 12;
  }
  const gradient = targetCtx.createRadialGradient(
    x - r * 0.28,
    y - r * 0.30,
    r * 0.08,
    x,
    y,
    r
  );
  gradient.addColorStop(0, 'rgba(245,255,236,0.95)');
  gradient.addColorStop(0.38, 'rgba(160,205,176,0.86)');
  gradient.addColorStop(0.78, 'rgba(84,128,92,0.72)');
  gradient.addColorStop(1, 'rgba(66,92,72,0.72)');
  targetCtx.beginPath();
  targetCtx.ellipse(x, y, r * 1.02, r * 0.94, rotation * 0.12, 0, Math.PI * 2);
  targetCtx.fillStyle = gradient;
  targetCtx.fill();
  targetCtx.shadowBlur = 0;
  targetCtx.beginPath();
  targetCtx.ellipse(x, y, r * 0.98, r * 0.90, rotation * 0.12, 0, Math.PI * 2);
  targetCtx.strokeStyle = selected ? '#e1ffe8' : 'rgba(225,255,232,0.72)';
  targetCtx.lineWidth = selected ? Math.max(2, r * 0.08) : Math.max(1.2, r * 0.06);
  targetCtx.stroke();
  targetCtx.globalAlpha *= 0.34;
  for (let i = 0; i < 5; i++) {
    const a = rotation + i * 1.256;
    targetCtx.beginPath();
    targetCtx.ellipse(
      x + Math.cos(a) * r * 0.26,
      y + Math.sin(a) * r * 0.20,
      r * (0.13 + i * 0.01),
      r * 0.045,
      a + Math.PI * 0.5,
      0,
      Math.PI * 2
    );
    targetCtx.fillStyle = 'rgba(40,78,55,0.55)';
    targetCtx.fill();
  }
  targetCtx.restore();
}

function buildToolbar() {
  ENTITY_TYPES.forEach((et, idx) => {
    const btn = document.createElement('div');
    btn.className = 'entity-btn';
    btn.id = 'tool-' + et.id;
    btn.title = `${et.label} [${idx + 1}]`;
    btn.addEventListener('click', () => selectTool(et.id));

    const mc = document.createElement('canvas');
    mc.width = mc.height = 32;
    const gc = mc.getContext('2d');
    if (et.id === 'Stentor') {
      [[16,8,10],[16,17,7],[16,24,4]].forEach(([x,y,r]) => {
        gc.beginPath(); gc.arc(x,y,r,0,Math.PI*2); gc.fillStyle = et.color; gc.fill(); gc.strokeStyle = et.strokeColor; gc.lineWidth = 1.2; gc.stroke();
      });
    } else if (et.id === 'Algae') {
      [[16,16,9],[22,11,6],[10,22,5],[9,10,4]].forEach(([x,y,r], idx) => {
        gc.beginPath(); gc.arc(x,y,r,0,Math.PI*2);
        gc.fillStyle = idx === 0 ? 'rgba(92,175,120,0.95)' : 'rgba(120,210,150,0.9)';
        gc.fill();
        gc.strokeStyle = et.strokeColor;
        gc.lineWidth = idx === 0 ? 1.4 : 1.1;
        gc.stroke();
      });
    } else if (et.id === 'Particle') {
      const g = gc.createRadialGradient(13, 12, 2, 16, 16, 12);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(1, 'rgba(60,180,60,0.80)');
      gc.beginPath(); gc.arc(16,16,12,0,Math.PI*2); gc.fillStyle = g; gc.fill(); gc.strokeStyle = et.strokeColor; gc.lineWidth = 1.2; gc.stroke();
    } else if (et.id === 'Cyst') {
      drawCystShape(gc, 16, 16, 12.5, false, 1, -1.2);
    } else {
      gc.beginPath(); gc.arc(16,16,13,0,Math.PI*2); gc.fillStyle = et.color; gc.fill(); gc.strokeStyle = et.strokeColor; gc.lineWidth = 1.5; gc.stroke();
    }
    const lbl = document.createElement('span'); lbl.textContent = et.label;
    const kbd = document.createElement('div'); kbd.className = 'kbd'; kbd.textContent = idx + 1;
    btn.append(mc, lbl, kbd); toolBtns.appendChild(btn);
  });
}

function openStentorPanel() { document.getElementById('stentor-panel').classList.add('open'); }
function closeStentorPanel() { document.getElementById('stentor-panel').classList.remove('open'); }

function selectTool(id) {
  activeTool = id;
  document.querySelectorAll('.entity-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('tool-' + id); if (btn) btn.classList.add('active');
  canvas.style.cursor = id === 'select' ? 'default' : 'crosshair';
  document.getElementById('tool-select').classList.toggle('active', id === 'select');
  document.getElementById('index-picker').style.display = INDEXED_TYPES.includes(id) ? 'flex' : 'none';
  document.getElementById('index-picker-val').value = activeIndex[id] ?? 1;
  if (PRESET_PANEL_TYPES.includes(id)) { openStentorPanel(); buildPresetPanel(); } else closeStentorPanel();
  render();
}

function getNextInstanceIndex(type) {
  const used = entities.filter(e => e.type === type && Number.isFinite(e.instanceIndex)).map(e => e.instanceIndex);
  let n = 1; while (used.includes(n)) n++; return n;
}

function createEntity(typeId, x, y, options = {}) {
  const { preview = false } = options;
  const et = getEntityType(typeId); if (!et) return null;
  if (typeId === 'Player' && !preview && getPlayerEntity()) return null;
  const defaults = {}; (et.props || []).forEach(p => { if (p.default !== undefined) defaults[p.key] = p.default; });
  const lo = Math.min(randMin, randMax), hi = Math.max(randMin, randMax);
  const radius = randSizeEnabled ? Math.round(lo + Math.random() * (hi - lo)) : et.defaultRadius;
  const ent = { _id: preview ? -1 : idCounter++, type: typeId, x, y, radius, ...defaults };

  if (typeId === 'Stentor') {
    const preset = STENTOR_PRESETS.find(p => p.id === activeStentorPreset) ?? STENTOR_PRESETS[0];
    ent.circles = preset.circleRatios.map(cr => ({ dx: Math.round(cr.dxR * radius), dy: Math.round(cr.dyR * radius), r: Math.max(2, Math.round(cr.rR * radius)) }));
    ent._presetId = preset.id; ent._presetName = preset.name;
    ent.mouth = makeDefaultStentorMouth(); ent.bodyRotation = makeDefaultStentorBodyRotation();
  }
  if (typeId === 'ComposedStone') {
    ent.circles = makeDefaultComposedStoneCircles(radius);
  }
  if (typeId === 'Algae') {
    ent.circles = makeDefaultAlgaeCircles(radius);
    ent.name = 'Algae';
  }
  if (typeId === 'Stone') {
    ent.innerArtifacts = [];
  }
  if (typeId === 'ComposedEntity') {
    ent.width = 80;
    ent.height = 80;
    ent.bounds = { minX: 0, minY: 0, maxX: 80, maxY: 80, width: 80, height: 80 };
    ent.entities = [];
    ent.name = 'ComposedEntity';
    ent.anchorMode = 'top-left';
  }
  if (typeId === 'ParticleZone') {
    Object.assign(ent, {
      minSize: 10,
      maxSize: 25,
      spawnIntervalMs: 1800,
      growthDurationMs: 1200,
      spriteIndex: 1,
      spawnArcCenterDeg: 0,
      spawnArcSpanDeg: 360
    });
  }
  if (typeId === 'Particle') {
    ent.spriteIndex = randSizeEnabled ? randomIntInclusive(1, 5) : normalizeSpriteIndex(ent.spriteIndex, 1);
  }
  if (typeId === 'Cyst') {
    ent.displayRadius = ent.radius;
    ent.targetRadius = ent.radius;
    ent.detached = true;
    ent.isCyst = true;
  }
  if (INDEXED_TYPES.includes(typeId)) ent.instanceIndex = activeIndex[typeId] ?? 1;

  if (typeId !== 'Stentor' && INDEXED_TYPES.includes(typeId)) {
    const presetId = activeEntityPreset[typeId];
    const preset = entityPresetsByType[typeId]?.find(p => p.id === presetId) ?? entityPresetsByType[typeId]?.[0] ?? null;
    if (preset?.data) {
      Object.assign(ent, structuredClone(preset.data));
      ent.radius ??= radius;
      ent.instanceIndex = activeIndex[typeId] ?? ent.instanceIndex ?? 1;
      ent.x = x;
      ent.y = y;
      ent._presetId = preset.id;
      ent._presetName = preset.name;
    }
  }

  if (typeId === 'ComposedEntity') {
    const presetId = activeEntityPreset.ComposedEntity;
    const preset = entityPresetsByType.ComposedEntity?.find(p => p.id === presetId) ?? entityPresetsByType.ComposedEntity?.[0] ?? null;
    if (preset?.data) {
      Object.assign(ent, structuredClone(preset.data));
      ent.x = x;
      ent.y = y;
      ent._presetId = preset.id;
      ent._presetName = preset.name;
    }
  }

  if (typeId === 'ComposedStone' && !ent.circles?.length) {
    ent.circles = makeDefaultComposedStoneCircles(ent.radius);
  }
  if (typeId === 'Algae' && !ent.circles?.length) {
    ent.circles = makeDefaultAlgaeCircles(ent.radius);
  }
  if (typeId === 'Enemy' && !ent.bodyCircles?.length) {
    ent.bodyCircles = makeDefaultEnemyBodyCircles(ent.radius);
  }
  if (typeId === 'Macrophage' && !ent.bodyCircles?.length) {
    ent.bodyCircles = makeDefaultMacrophageBodyCircles(ent.radius);
  }
  if (typeId === 'Enemy' && !Array.isArray(ent.innerArtifacts)) {
    ent.innerArtifacts = [];
  }
  if (typeId === 'Stone' && !Array.isArray(ent.innerArtifacts)) {
    ent.innerArtifacts = [];
  }

  if (typeId === 'Enemy') ensureEnemyDefaults(ent);
  if (typeId === 'Macrophage') ensureMacrophageDefaults(ent);
  if (typeId === 'ComposedStone') ensureComposedStoneDefaults(ent);
  if (typeId === 'Algae') ensureAlgaeDefaults(ent);
  if (typeId === 'Particle') ensureParticleDefaults(ent);
  if (typeId === 'ParticleZone') ensureParticleZoneDefaults(ent);
  if (typeId === 'Cyst') ensureCystDefaults(ent);
  if (typeId === 'ComposedEntity') ensureComposedEntityDefaults(ent);
  if (typeId === 'Player') {
    ensurePlayerDefaults(ent);
  }
  if (!preview) clampEditorEntityInsideCanvas(ent);
  return ent;
}

function createEntitiesFromComposedPreset(x, y, options = {}) {
  const { preview = false } = options;
  const presetId = activeEntityPreset.ComposedEntity;
  const preset = entityPresetsByType.ComposedEntity?.find(p => p.id === presetId) ?? entityPresetsByType.ComposedEntity?.[0] ?? null;
  if (!preset?.data) return [];

  const composed = structuredClone(preset.data);
  const childEntities = Array.isArray(composed.entities) ? composed.entities : [];
  const created = [];
  const composedInstanceId = preview ? '__preview_composed_entity__' : `ce_${Date.now()}_${idCounter}`;

  for (const child of childEntities) {
    const typeId = child.type;
    if (!getEntityType(typeId)) continue;
    if (typeId === 'Player' && !preview && getPlayerEntity()) continue;

    const entity = {
      ...structuredClone(child),
      _id: preview ? -1 : idCounter++,
      type: typeId,
      x: snap(x + clampNum(child.offsetX, 0)),
      y: snap(y + clampNum(child.offsetY, 0)),
      _presetId: preset.id,
      _presetName: preset.name,
      _composedEntityInstanceId: composedInstanceId,
      _composedEntityPresetId: preset.id,
      _composedEntityName: preset.name,
      _composedEntitySourcePath: preset.sourcePath ?? null
    };

    delete entity.offsetX;
    delete entity.offsetY;

    if (!preview && INDEXED_TYPES.includes(typeId)) {
      entity.instanceIndex = getNextInstanceIndex(typeId);
    }

    if (typeId === 'Enemy') ensureEnemyDefaults(entity);
    if (typeId === 'Macrophage') ensureMacrophageDefaults(entity);
    if (typeId === 'ComposedStone') ensureComposedStoneDefaults(entity);
    if (typeId === 'Algae') ensureAlgaeDefaults(entity);
    if (typeId === 'Particle') ensureParticleDefaults(entity);
    if (typeId === 'ParticleZone') ensureParticleZoneDefaults(entity);
    if (typeId === 'Cyst') ensureCystDefaults(entity);
    if (typeId === 'ComposedEntity') ensureComposedEntityDefaults(entity);
    if (typeId === 'Player') ensurePlayerDefaults(entity);
    if (!preview) clampEditorEntityInsideCanvas(entity);

    created.push(entity);
  }

  return created;
}

function drawGrid() {
  ctx.save();
  const major = snapToGrid ? 'rgba(249,199,79,0.18)' : 'rgba(42,45,62,0.5)';
  const minor = snapToGrid ? 'rgba(249,199,79,0.07)' : 'rgba(42,45,62,0.35)';
  for (let x=0; x<canvas.width; x+=GRID_SIZE) { ctx.strokeStyle = (x % (GRID_SIZE*4) === 0) ? major : minor; ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke(); }
  for (let y=0; y<canvas.height; y+=GRID_SIZE) { ctx.strokeStyle = (y % (GRID_SIZE*4) === 0) ? major : minor; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke(); }
  if (snapToGrid) {
    const sx = snap(mousePos.x), sy = snap(mousePos.y);
    ctx.strokeStyle = 'rgba(249,199,79,0.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(sx,0); ctx.lineTo(sx,canvas.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,sy); ctx.lineTo(canvas.width,sy); ctx.stroke();
  }
  ctx.restore();
}

function drawInitialViewRect() {
  const rect = getInitialViewRect();
  ctx.save();
  ctx.strokeStyle = 'rgba(249,199,79,0.95)';
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 7]);
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(249,199,79,0.08)';
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

function getResizeHandle(e) { return { x: e.x + e.radius * 0.707, y: e.y - e.radius * 0.707 }; }
function hitTestResize(e,mx,my) { const h = getResizeHandle(e); return Math.hypot(mx-h.x,my-h.y) < 10; }
function getStentorCircleAbs(e,i){ const c=e.circles[i]; return { x:e.x+c.dx, y:e.y+c.dy, r:c.r }; }
function getStentorResizeHandle(e,i){ const c=getStentorCircleAbs(e,i); return { x:c.x+c.r*0.707, y:c.y-c.r*0.707 }; }
function getEnemyBodyCircleAbs(e, i) {
  ensureEnemyDefaults(e);
  const c = e.bodyCircles[i];
  const angle = getEnemyMouthAngleRad(e);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: e.x + c.dx * cos - c.dy * sin,
    y: e.y + c.dx * sin + c.dy * cos,
    r: c.r
  };
}
function getMacrophageBodyCircleAbs(e, i) {
  ensureMacrophageDefaults(e);
  const c = e.bodyCircles[i];
  const center = transformMacrophageLocalPoint(e, c.dx, c.dy);
  return { x: center.x, y: center.y, r: c.r };
}
function getBodyCircleAbs(e, i) {
  if (e?.type === 'Enemy') return getEnemyBodyCircleAbs(e, i);
  return getMacrophageBodyCircleAbs(e, i);
}
function getEnemyBodyResizeHandle(e, i) {
  const c = getEnemyBodyCircleAbs(e, i);
  return { x: c.x + c.r * 0.707, y: c.y - c.r * 0.707 };
}
function getBodyCircleResizeHandle(e, i) {
  const c = getBodyCircleAbs(e, i);
  return { x: c.x + c.r * 0.707, y: c.y - c.r * 0.707 };
}
function getStoneInnerArtifactAbs(e, i) {
  const artifact = e.innerArtifacts[i];
  return { x: e.x + artifact.dx, y: e.y + artifact.dy, r: artifact.radius };
}
function getEnemyInnerArtifactAbs(e, i) {
  const artifact = e.innerArtifacts[i];
  const angle = getEnemyMouthAngleRad(e);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: e.x + artifact.dx * cos - artifact.dy * sin,
    y: e.y + artifact.dx * sin + artifact.dy * cos,
    r: artifact.radius
  };
}
function drawStoneInnerArtifacts(e, selected) {
  if (e.type !== 'Stone' || !e.innerArtifacts?.length) return;

  ctx.save();
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
  ctx.clip();

  for (let i = 0; i < e.innerArtifacts.length; i++) {
    const artifact = e.innerArtifacts[i];
    const ax = e.x + artifact.dx;
    const ay = e.y + artifact.dy;
    const size = artifact.radius * 2;
    const img = getEditorSpriteImage({
      folder: 'Particle',
      family: 'particle',
      variant: 'green',
      index: normalizeSpriteIndex(artifact.spriteIndex, 1)
    });

    if (img.complete && img.naturalWidth) {
      ctx.globalAlpha = 0.92;
      ctx.drawImage(img, ax - size / 2, ay - size / 2, size, size);
    } else {
      const grad = ctx.createRadialGradient(ax - artifact.radius * 0.25, ay - artifact.radius * 0.25, artifact.radius * 0.08, ax, ay, artifact.radius);
      grad.addColorStop(0, 'rgba(245,255,245,0.95)');
      grad.addColorStop(1, 'rgba(95,180,95,0.82)');
      ctx.beginPath(); ctx.arc(ax, ay, artifact.radius, 0, Math.PI*2); ctx.fillStyle = grad; ctx.fill();
      if (selected) { ctx.strokeStyle = 'rgba(230,255,230,0.85)'; ctx.lineWidth = 1.2; ctx.stroke(); }
    }

    if (selected) {
      const hovered = hoverInnerArtifactHandle?.type === 'Stone' && hoverInnerArtifactHandle?.idx === i;
      ctx.beginPath();
      ctx.arc(ax, ay, 6, 0, Math.PI * 2);
      ctx.fillStyle = hovered ? 'rgba(255,255,255,0.95)' : 'rgba(95,180,95,0.82)';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  ctx.restore();
}
function drawEnemyInnerArtifacts(e, selected) {
  if (e.type !== 'Enemy' || !e.innerArtifacts?.length) return;

  const angle = getEnemyMouthAngleRad(e);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < e.bodyCircles.length; i++) {
    const circle = getEnemyBodyCircleAbs(e, i);
    ctx.moveTo(circle.x + circle.r, circle.y);
    ctx.arc(circle.x, circle.y, circle.r, 0, Math.PI * 2);
  }
  ctx.clip();

  for (let i = 0; i < e.innerArtifacts.length; i++) {
    const artifact = e.innerArtifacts[i];
    const ax = e.x + artifact.dx * cos - artifact.dy * sin;
    const ay = e.y + artifact.dx * sin + artifact.dy * cos;
    const size = artifact.radius * 2;
    const img = getEditorSpriteImage({
      folder: 'Particle',
      family: 'particle',
      variant: 'green',
      index: normalizeSpriteIndex(artifact.spriteIndex, 1)
    });

    if (img.complete && img.naturalWidth) {
      ctx.globalAlpha = 0.92;
      ctx.drawImage(img, ax - size / 2, ay - size / 2, size, size);
    } else {
      const grad = ctx.createRadialGradient(ax - artifact.radius * 0.25, ay - artifact.radius * 0.25, artifact.radius * 0.08, ax, ay, artifact.radius);
      grad.addColorStop(0, 'rgba(245,255,245,0.95)');
      grad.addColorStop(1, 'rgba(95,180,95,0.82)');
      ctx.beginPath(); ctx.arc(ax, ay, artifact.radius, 0, Math.PI*2); ctx.fillStyle = grad; ctx.fill();
      if (selected) { ctx.strokeStyle = 'rgba(230,255,230,0.85)'; ctx.lineWidth = 1.2; ctx.stroke(); }
    }

    if (selected) {
      const hovered = hoverInnerArtifactHandle?.type === 'Enemy' && hoverInnerArtifactHandle?.idx === i;
      ctx.beginPath();
      ctx.arc(ax, ay, 6, 0, Math.PI * 2);
      ctx.fillStyle = hovered ? 'rgba(255,255,255,0.95)' : 'rgba(95,180,95,0.82)';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  ctx.restore();
}
function hitTestMultiCircle(e,mx,my) {
  if (!e.circles?.length) return null;
  for (let i=e.circles.length-1;i>=0;i--) { const h = getStentorResizeHandle(e,i); if (Math.hypot(mx-h.x,my-h.y) < 10) return { action:'resize-circle', circleIdx:i }; }
  for (let i=e.circles.length-1;i>=0;i--) { const c = getStentorCircleAbs(e,i); if (Math.hypot(mx-c.x,my-c.y) <= c.r) return { action: i===0 ? 'move-entity' : 'move-circle', circleIdx:i }; }
  return null;
}
function hitTestEnemyBodyCircles(e, mx, my) {
  if (!hasBodyCircleEditor(e) || !e.bodyCircles?.length) return null;
  for (let i = e.bodyCircles.length - 1; i >= 0; i--) {
    const h = getBodyCircleResizeHandle(e, i);
    if (Math.hypot(mx - h.x, my - h.y) < 10) return { action: 'resize-circle', circleIdx: i };
  }
  for (let i = e.bodyCircles.length - 1; i >= 0; i--) {
    const c = getBodyCircleAbs(e, i);
    if (Math.hypot(mx - c.x, my - c.y) <= c.r) return { action: i === 0 ? 'move-entity' : 'move-circle', circleIdx: i };
  }
  return null;
}
function hitTestInnerArtifacts(e, mx, my) {
  if (!e?.innerArtifacts?.length) return null;

  if (e.type === 'Stone') {
    for (let i = e.innerArtifacts.length - 1; i >= 0; i--) {
      const a = getStoneInnerArtifactAbs(e, i);
      if (Math.hypot(mx - a.x, my - a.y) <= Math.max(8, a.r)) return { type: 'Stone', idx: i };
    }
  }

  if (e.type === 'Enemy') {
    for (let i = e.innerArtifacts.length - 1; i >= 0; i--) {
      const a = getEnemyInnerArtifactAbs(e, i);
      if (Math.hypot(mx - a.x, my - a.y) <= Math.max(8, a.r)) return { type: 'Enemy', idx: i };
    }
  }

  return null;
}

function drawEntity(e, selected, isPreview = false) {
  const et = getEntityType(e.type); if (!et) return;
  const interactiveSelected = selected && !isPreview && getSelectedEntities().length === 1 && selectedId === e._id;

  if (e.type === 'ComposedEntity') {
    ensureComposedEntityDefaults(e);
    const width = e.width;
    const height = e.height;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(e.x, e.y, width, height, 10);
    ctx.fillStyle = selected ? 'rgba(120,220,200,0.14)' : 'rgba(120,220,200,0.08)';
    ctx.fill();
    ctx.strokeStyle = selected ? 'rgba(120,220,200,0.95)' : 'rgba(120,220,200,0.55)';
    ctx.lineWidth = selected ? 2.4 : 1.4;
    ctx.setLineDash([8, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const child of e.entities) {
      const childType = getEntityType(child.type);
      const baseX = e.x + clampNum(child.offsetX, 0);
      const baseY = e.y + clampNum(child.offsetY, 0);
      if (Array.isArray(child.circles) && child.circles.length) {
        for (const circle of child.circles) {
          ctx.beginPath();
          ctx.arc(baseX + clampNum(circle.dx, 0), baseY + clampNum(circle.dy, 0), Math.max(3, clampNum(circle.r, 8) * 0.22), 0, Math.PI * 2);
          ctx.fillStyle = childType?.color ?? 'rgba(180,180,180,0.65)';
          ctx.fill();
        }
      } else if (Array.isArray(child.bodyCircles) && child.bodyCircles.length) {
        for (const circle of child.bodyCircles) {
          ctx.beginPath();
          ctx.arc(baseX + clampNum(circle.dx, 0), baseY + clampNum(circle.dy, 0), Math.max(3, clampNum(circle.r, 8) * 0.22), 0, Math.PI * 2);
          ctx.fillStyle = childType?.color ?? 'rgba(180,180,180,0.65)';
          ctx.fill();
        }
      } else {
        ctx.beginPath();
        ctx.arc(baseX, baseY, Math.max(3, clampNum(child.radius, 12) * 0.22), 0, Math.PI * 2);
        ctx.fillStyle = childType?.color ?? 'rgba(180,180,180,0.65)';
        ctx.fill();
      }
    }

    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.font = 'bold 11px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CE', e.x + width * 0.5, e.y + height * 0.5);
    drawBadge(e.x + width * 0.5, e.y - 12, e.name || 'ComposedEntity', 'rgba(120,220,200,0.92)');
    if (interactiveSelected) {
      const h = { x: e.x + width, y: e.y };
      ctx.beginPath();
      ctx.arc(h.x, h.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#7c6af7';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (e.type === 'Particle') {
    if (interactiveSelected) { ctx.save(); ctx.shadowColor='rgba(60,200,80,0.8)'; ctx.shadowBlur=14; }
    const grad = ctx.createRadialGradient(e.x - e.radius*0.25, e.y - e.radius*0.25, e.radius*0.05, e.x, e.y, e.radius);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)'); grad.addColorStop(1, 'rgba(60,180,60,0.80)');
    ctx.beginPath(); ctx.arc(e.x,e.y,e.radius,0,Math.PI*2); ctx.fillStyle=grad; ctx.fill(); ctx.strokeStyle = selected ? '#3cc850' : 'rgba(100,240,100,0.5)'; ctx.lineWidth = selected ? 2 : 1; ctx.stroke();
    if (interactiveSelected) ctx.restore();
  } else if (isMultiCircleEntity(e) && e.circles?.length) {
    if (e.type === 'ComposedStone') ensureComposedStoneDefaults(e);
    if (e.type === 'Algae') ensureAlgaeDefaults(e);
    const composedStoneSpriteDrawn = e.type === 'ComposedStone' && drawComposedStoneSprite(e, selected, isPreview);
    const algaeSpriteDrawn = e.type === 'Algae' && drawAlgaeSprite(e, selected, isPreview);
    const multiSpriteDrawn = composedStoneSpriteDrawn || algaeSpriteDrawn;
    const labels = e.type === 'Stentor'
      ? ['oral','mid','tail']
      : e.circles.map((_, i) => `c${i + 1}`);
    if (interactiveSelected && e.circles.length >= 2) {
      ctx.save(); ctx.setLineDash([4,4]); ctx.strokeStyle = e.type === 'Stentor' ? 'rgba(130,230,245,0.28)' : 'rgba(210,200,180,0.24)'; ctx.lineWidth=1.5; ctx.beginPath();
      ctx.moveTo(e.x + e.circles[0].dx, e.y + e.circles[0].dy);
      for (let i=1;i<e.circles.length;i++) ctx.lineTo(e.x + e.circles[i].dx, e.y + e.circles[i].dy);
      ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    }
    for (let i=e.circles.length-1;i>=0;i--) {
      const c = e.circles[i], cx = e.x + c.dx, cy = e.y + c.dy;
      if (!multiSpriteDrawn && interactiveSelected) {
        ctx.save();
        ctx.shadowColor = e.type === 'Stentor'
          ? (i===0 ? 'rgba(124,106,247,0.7)' : 'rgba(130,230,245,0.5)')
          : e.type === 'Algae'
            ? (i===0 ? 'rgba(92,175,120,0.65)' : 'rgba(170,245,196,0.42)')
            : (i===0 ? 'rgba(160,140,110,0.65)' : 'rgba(210,200,180,0.45)');
        ctx.shadowBlur = i===0 ? 18 : 10;
      }
      if (!multiSpriteDrawn) {
        ctx.beginPath(); ctx.arc(cx,cy,c.r,0,Math.PI*2); ctx.fillStyle = et.color; ctx.fill(); ctx.strokeStyle = selected ? (i===0 ? '#7c6af7' : '#82e6f5') : et.strokeColor; ctx.lineWidth = selected ? (i===0 ? 2.5 : 1.8) : 1.5; ctx.stroke();
        if (e.type === 'ComposedStone' && selected) { ctx.strokeStyle = i===0 ? '#e7dcc8' : '#d2c8b9'; ctx.lineWidth = i===0 ? 2.4 : 1.8; ctx.stroke(); }
        if (e.type === 'Algae' && selected) { ctx.strokeStyle = i===0 ? '#aaf3c2' : '#7fd29d'; ctx.lineWidth = i===0 ? 2.4 : 1.8; ctx.stroke(); }
        if (interactiveSelected) ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(cx, cy, c.r, 0, Math.PI * 2);
        ctx.strokeStyle = e.type === 'Algae'
          ? (i===0 ? 'rgba(170,245,196,0.98)' : 'rgba(127,210,157,0.92)')
          : (i===0 ? 'rgba(231,220,200,0.96)' : 'rgba(210,200,185,0.9)');
        ctx.lineWidth = i===0 ? 2.4 : 1.8;
        ctx.stroke();
        ctx.fillStyle = e.type === 'Algae' ? 'rgba(110,226,140,0.08)' : 'rgba(231,220,200,0.08)';
        ctx.fill();
      }
      ctx.fillStyle='rgba(255,255,255,0.80)'; ctx.font=`bold ${Math.max(8, Math.min(12, Math.round(c.r*0.35)))}px JetBrains Mono, monospace`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(labels[i] ?? `c${i}`, cx, cy);
      if (i===0 && e.instanceIndex != null) drawBadge(cx, cy - c.r - 12, `#${e.instanceIndex}`, 'rgba(130,230,245,0.85)');
      if (interactiveSelected) {
        const rh = getStentorResizeHandle(e, i); const hov = hoverStentorHandle?.action === 'resize-circle' && hoverStentorHandle?.circleIdx === i;
        const handleColor = e.type === 'Stentor' ? '#82e6f5' : e.type === 'Algae' ? '#aaf3c2' : '#e7dcc8';
        const moveFill = e.type === 'Stentor' ? 'rgba(130,230,245,0.25)' : e.type === 'Algae' ? 'rgba(110,226,140,0.24)' : 'rgba(231,220,200,0.24)';
        const moveFillHover = e.type === 'Stentor' ? 'rgba(130,230,245,0.75)' : e.type === 'Algae' ? 'rgba(170,245,196,0.74)' : 'rgba(231,220,200,0.72)';
        const moveStroke = e.type === 'Stentor' ? 'rgba(130,230,245,0.85)' : e.type === 'Algae' ? 'rgba(170,245,196,0.9)' : 'rgba(231,220,200,0.88)';
        ctx.beginPath(); ctx.arc(rh.x,rh.y,6,0,Math.PI*2); ctx.fillStyle = hov ? '#fff' : handleColor; ctx.fill(); ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.stroke();
        if (i>0) { const mh = hoverStentorHandle?.action==='move-circle' && hoverStentorHandle?.circleIdx===i; ctx.beginPath(); ctx.arc(cx,cy,7,0,Math.PI*2); ctx.fillStyle = mh ? moveFillHover : moveFill; ctx.strokeStyle=moveStroke; ctx.lineWidth=1.5; ctx.fill(); ctx.stroke(); }
      }
    }
    if (e.type === 'Algae' && interactiveSelected && !isPreview) {
      drawAlgaeGerminationOverlay(e);
    }
  } else {
    if (e.type === 'Enemy') ensureEnemyDefaults(e);
    if (e.type === 'Macrophage') ensureMacrophageDefaults(e);
    if (e.type === 'ComposedStone') ensureComposedStoneDefaults(e);
    if (e.type === 'Algae') ensureAlgaeDefaults(e);
    if (e.type === 'Cyst') ensureCystDefaults(e);
    if (e.type === 'Enemy') drawEnemySprite(e, selected, isPreview);
    else if (e.type === 'Macrophage' && drawMacrophageSprite(e, selected, isPreview)) {
      // Sprite draw succeeded, so skip geometric fallback.
    }
    else if (e.type === 'ComposedStone' && drawComposedStoneSprite(e, selected, isPreview)) {
      // Sprite draw succeeded, so skip geometric fallback.
    } else if (e.type === 'Algae' && drawAlgaeSprite(e, selected, isPreview)) {
      // Sprite draw succeeded, so skip geometric fallback.
    } else if (e.type === 'Macrophage' && e.bodyCircles?.length) {
      for (let i = e.bodyCircles.length - 1; i >= 0; i--) {
        const c = getMacrophageBodyCircleAbs(e, i);
        ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.fillStyle = et.color; ctx.fill(); ctx.strokeStyle = selected ? '#d28cff' : et.strokeColor; ctx.lineWidth = selected ? (i === 0 ? 2.5 : 1.8) : 1.5; ctx.stroke();
      }
    } else if (e.type === 'ParticleZone') {
      const orbitDots = 10;
      const dotRadius = Math.max(2.5, e.radius * 0.09);
      const arcSpanDeg = Math.max(0, Math.min(360, clampNum(e.spawnArcSpanDeg, 360)));
      const arcCenterDeg = normalizeSignedDeg(clampNum(e.spawnArcCenterDeg, 0));
      const arcStart = degToRad(arcCenterDeg - arcSpanDeg * 0.5);
      const arcEnd = degToRad(arcCenterDeg + arcSpanDeg * 0.5);
      ctx.save();
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(52,120,68,0.10)';
      ctx.fill();
      if (arcSpanDeg < 360) {
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.arc(e.x, e.y, e.radius, arcStart, arcEnd);
        ctx.closePath();
        ctx.fillStyle = 'rgba(95,230,120,0.20)';
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x + Math.cos(arcStart) * e.radius, e.y + Math.sin(arcStart) * e.radius);
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x + Math.cos(arcEnd) * e.radius, e.y + Math.sin(arcEnd) * e.radius);
        ctx.strokeStyle = 'rgba(180,255,190,0.72)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
      ctx.setLineDash([10, 8]);
      ctx.strokeStyle = selected ? 'rgba(194,255,206,0.95)' : et.strokeColor;
      ctx.lineWidth = selected ? 2.5 : 1.8;
      ctx.stroke();
      ctx.setLineDash([]);
      for (let i = 0; i < orbitDots; i++) {
        const sampleT = orbitDots <= 1 ? 0.5 : i / (orbitDots - 1);
        const ang = arcSpanDeg >= 360
          ? (i / orbitDots) * Math.PI * 2
          : arcStart + (arcEnd - arcStart) * sampleT;
        const px = e.x + Math.cos(ang) * e.radius;
        const py = e.y + Math.sin(ang) * e.radius;
        const pulse = 0.75 + 0.25 * Math.sin(performance.now() * 0.004 + i * 0.6);
        ctx.beginPath();
        ctx.arc(px, py, dotRadius * pulse, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(180,255,170,0.85)';
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(e.x, e.y, Math.max(4, e.radius * 0.18), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(220,255,225,0.9)';
      ctx.fill();
      ctx.restore();
    } else if (e.type === 'Cyst') {
      drawCystShape(ctx, e.x, e.y, e.displayRadius ?? e.radius, selected, e.spriteAlpha, performance.now() * 0.001);
    } else {
      if (interactiveSelected) { ctx.save(); ctx.shadowColor='rgba(124,106,247,0.8)'; ctx.shadowBlur=20; }
      ctx.beginPath(); ctx.arc(e.x,e.y,e.radius,0,Math.PI*2); ctx.fillStyle=et.color; ctx.fill(); ctx.strokeStyle=selected ? '#7c6af7' : et.strokeColor; ctx.lineWidth=selected ? 2.5 : 1.5; ctx.stroke();
    }
    drawEnemyInnerArtifacts(e, interactiveSelected);
    drawStoneInnerArtifacts(e, interactiveSelected);
    if (e.type !== 'Enemy' && e.type !== 'Macrophage' && interactiveSelected) ctx.restore();
    ctx.fillStyle='rgba(255,255,255,0.75)'; ctx.font=`bold ${Math.max(9, Math.min(13, e.radius*0.4))}px JetBrains Mono, monospace`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(e.type === 'ParticleZone' ? 'ZN' : e.type.slice(0,2).toUpperCase(), e.x, e.y);
    if (e.instanceIndex != null) drawBadge(e.x, e.y - e.radius - 12, `#${e.instanceIndex}`, badgeColor(e.type));
    if (e.type === 'Enemy' && !isPreview && (enemyAnatomyOverlay || interactiveSelected)) {
      drawEnemyAnatomy(e);
      drawBodyCircles(e);
    } else if (e.type === 'Macrophage' && !isPreview && interactiveSelected) {
      drawBodyCircles(e);
      drawMacrophageMouthOverlay(e);
    }
  }

  if (interactiveSelected && e.type !== 'ComposedEntity' && !isMultiCircleEntity(e)) {
    if (hasBodyCircleEditor(e) && e.bodyCircles?.length) {
      for (let i = e.bodyCircles.length - 1; i >= 0; i--) {
        const c = getBodyCircleAbs(e, i);
        const rh = getBodyCircleResizeHandle(e, i);
        const hov = hoverStentorHandle?.action === 'resize-circle' && hoverStentorHandle?.circleIdx === i;
        const accent = e.type === 'Macrophage' ? '#d28cff' : '#ffc850';
        const stroke = e.type === 'Macrophage' ? 'rgba(230,205,255,0.88)' : 'rgba(255,220,150,0.88)';
        const fill = e.type === 'Macrophage' ? 'rgba(210,140,255,0.24)' : 'rgba(255,200,80,0.24)';
        const fillHover = e.type === 'Macrophage' ? 'rgba(210,140,255,0.72)' : 'rgba(255,200,80,0.72)';
        ctx.beginPath(); ctx.arc(rh.x,rh.y,6,0,Math.PI*2); ctx.fillStyle = hov ? '#fff' : accent; ctx.fill(); ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.stroke();
        if (i > 0) {
          const mh = hoverStentorHandle?.action === 'move-circle' && hoverStentorHandle?.circleIdx === i;
          ctx.beginPath(); ctx.arc(c.x,c.y,7,0,Math.PI*2); ctx.fillStyle = mh ? fillHover : fill; ctx.strokeStyle=stroke; ctx.lineWidth=1.5; ctx.fill(); ctx.stroke();
        }
      }
    } else {
      const h = getResizeHandle(e); ctx.beginPath(); ctx.arc(h.x,h.y,6,0,Math.PI*2); ctx.fillStyle = hoverResize ? '#fff' : '#7c6af7'; ctx.fill(); ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.stroke();
    }
  }
}

function badgeColor(type) {
  return { Enemy:'rgba(255,200,80,0.90)', Stone:'rgba(210,200,185,0.88)', ComposedStone:'rgba(231,220,200,0.88)', Algae:'rgba(170,245,196,0.92)', Obstacle:'rgba(160,170,190,0.88)', Macrophage:'rgba(210,140,255,0.90)', Cyst:'rgba(160,205,176,0.90)', Stentor:'rgba(130,230,245,0.85)' }[type] ?? 'rgba(200,200,200,0.85)';
}
function drawBadge(cx, cy, text, color) {
  ctx.font = 'bold 10px JetBrains Mono, monospace'; const bw = ctx.measureText(text).width + 8, bh = 15, bx = cx - bw / 2, by = cy - bh / 2;
  ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 3); ctx.fill(); ctx.fillStyle='#0e0f14'; ctx.textBaseline='middle'; ctx.textAlign='center'; ctx.fillText(text, cx, by + bh/2 + 0.5);
}

function drawPlacementPreview() {
  const et = getEntityType(activeTool); if (!et) return;
  const px = snap(mousePos.x), py = snap(mousePos.y);
  if (activeTool === 'ComposedEntity') {
    const preset = entityPresetsByType.ComposedEntity?.find(p => p.id === activeEntityPreset.ComposedEntity) ?? entityPresetsByType.ComposedEntity?.[0] ?? null;
    const spritePreview = preset?.data ? { ...structuredClone(preset.data), x: px, y: py, type: 'ComposedEntity' } : null;
    const previews = createEntitiesFromComposedPreset(px, py, { preview: true });
    if (!previews.length) return;
    ctx.save();
    ctx.globalAlpha = .5;
    if (spritePreview) drawComposedEntitySprite(spritePreview, false, true);
    previews.forEach(preview => drawEntity(preview, false, true));
    ctx.restore();
    return;
  }
  const preview = createEntity(activeTool, px, py, { preview: true });
  if (!preview) return;
  ctx.save(); ctx.globalAlpha = .5; drawEntity(preview, false, true); ctx.restore();
}

function drawComposedEntityInstanceSprites() {
  const instances = getComposedEntityInstances();
  for (const instance of instances) {
    const spriteEntity = buildComposedEntityEditorSpriteEntity(instance);
    if (!spriteEntity) continue;
    drawComposedEntitySprite(
      spriteEntity,
      selectedComposedEntityInstanceId === instance.id,
      false
    );
  }
}

function drawComposedEntityInstanceOverlays() {
  const instances = getComposedEntityInstances();
  for (const instance of instances) {
    const selected = selectedComposedEntityInstanceId === instance.id;
    ctx.save();
    ctx.strokeStyle = selected ? 'rgba(120,220,200,0.98)' : 'rgba(120,220,200,0.62)';
    ctx.lineWidth = selected ? 2.2 : 1.4;
    ctx.setLineDash([10, 6]);
    ctx.strokeRect(instance.minX, instance.minY, instance.width, instance.height);
    ctx.setLineDash([]);
    drawBadge(instance.minX + instance.width * 0.5, instance.minY - 12, `${instance.name} (${instance.entities.length})`, selected ? 'rgba(120,220,200,0.96)' : 'rgba(120,220,200,0.82)');
    ctx.restore();
  }
}

function render() {
  saveEditorDraft();
  ensureCanvasBackingStore();
  ctx.clearRect(0,0,canvas.width,canvas.height);
  drawBackgroundImage();
  drawGrid();
  drawInitialViewRect();
  if (!ensureEditorSceneAssetsLoaded()) return;
  entities.forEach(e => drawEntity(e, isEntitySelected(e)));
  drawComposedEntityInstanceSprites();
  drawComposedEntityInstanceOverlays();
  if (activeTool !== 'select' && mousePos.inside && !dragState) drawPlacementPreview();
}

function hasAnimatedEnemySprites() {
  if (activeTool === 'Enemy') return true;
  return entities.some(e => e.type === 'Enemy' && e.spriteAnimationEnabled !== false);
}

function animationTick() {
  render();
  animationFrameHandle = requestAnimationFrame(animationTick);
}

function startAnimationLoop() {
  if (animationFrameHandle != null) return;
  animationFrameHandle = requestAnimationFrame(animationTick);
}

function hitTestEntity(mx,my) {
  for (let i=entities.length-1;i>=0;i--) {
    const e = entities[i];
    if (e.type === 'ComposedEntity') {
      ensureComposedEntityDefaults(e);
      if (mx >= e.x && mx <= e.x + e.width && my >= e.y && my <= e.y + e.height) return e;
      continue;
    }
    if (isMultiCircleEntity(e) && e.circles?.length) {
      for (let j=0;j<e.circles.length;j++) {
        const cx = e.x + e.circles[j].dx, cy = e.y + e.circles[j].dy;
        if (Math.hypot(mx-cx, my-cy) <= e.circles[j].r) return e;
      }
    } else if (hasBodyCircleEditor(e) && e.bodyCircles?.length) {
      for (let j = 0; j < e.bodyCircles.length; j++) {
        const c = getBodyCircleAbs(e, j);
        if (Math.hypot(mx - c.x, my - c.y) <= c.r) return e;
      }
    } else if (Math.hypot(mx - e.x, my - e.y) <= e.radius) return e;
  }
  return null;
}

function bindCanvas() {
  canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
  });

  canvas.addEventListener('mousedown', e => {
    if (e.button === 2) {
      e.preventDefault();
      if (activeTool !== 'select') {
        selectTool('select');
        renderProps();
        render();
      }
      return;
    }

    const mx = e.offsetX, my = e.offsetY;
    if (backgroundEditMode && hasBackgroundImage()) {
      dragState = { mode:'bg-pan', startX:mx, startY:my, origX:backgroundOffsetX, origY:backgroundOffsetY };
      canvas.style.cursor = 'grabbing';
      return;
    }
    if (activeTool !== 'select') {
      if (activeTool === 'ComposedEntity') {
        const created = createEntitiesFromComposedPreset(mx, my);
        if (created.length) {
          entities.push(...created);
          clearSelection();
          renderProps();
          render();
        } else {
          setEditorStatus('No ComposedEntity preset selected.', 'warning');
        }
        return;
      }
      const entity = createEntity(activeTool, snap(mx), snap(my));
      if (entity) {
        entities.push(entity); clearSelection();
        if (INDEXED_TYPES.includes(activeTool)) activeIndex[activeTool] = getNextInstanceIndex(activeTool);
        renderProps(); render();
      } else if (activeTool === 'Player') {
        setEditorStatus('Level can contain only one Player.', 'warning');
      }
      return;
    }
    const additiveSelect = e.shiftKey || e.ctrlKey || e.metaKey;
    const sel = getSelected();
    const selection = getSelectedEntities();
    const composedHit = hitTestComposedEntityInstance(mx, my);
    if (composedHit && !additiveSelect) {
      setComposedEntitySelection(composedHit);
      dragState = {
        mode: 'move-multi',
        startX: mx,
        startY: my,
        items: composedHit.entities.map(entity => ({
          id: entity._id,
          origX: entity.x,
          origY: entity.y
        }))
      };
      canvas.style.cursor = 'grabbing';
      renderProps();
      render();
      return;
    }
    const entityHit = hitTestEntity(mx, my);
    if (additiveSelect) {
      if (entityHit) {
        toggleSelection(entityHit._id);
        renderProps();
        render();
      }
      return;
    }
    if (selection.length > 1 && entityHit && isEntitySelected(entityHit)) {
      dragState = {
        mode: 'move-multi',
        startX: mx,
        startY: my,
        items: selection.map(entity => ({
          id: entity._id,
          origX: entity.x,
          origY: entity.y
        }))
      };
      selectedId = entityHit._id;
      canvas.style.cursor = 'grabbing';
      renderProps();
      render();
      return;
    }
    if (entityHit && (!sel || entityHit._id !== sel._id)) {
      setSingleSelection(entityHit._id);
      dragState = { mode:'move', startX:mx, startY:my, origX:entityHit.x, origY:entityHit.y };
      canvas.style.cursor = 'grabbing';
      renderProps();
      render();
      return;
    }
    if (selection.length > 1) {
      clearSelection();
      renderProps();
      render();
      return;
    }
    const clickedSelectedEntity = !!(sel && entityHit && entityHit._id === sel._id);
    const allowSelectedEntityHandles = !entityHit || clickedSelectedEntity;
    const innerHit = allowSelectedEntityHandles ? hitTestInnerArtifacts(sel, mx, my) : null;
    if (innerHit) {
      const source = innerHit.type === 'Enemy' ? sel.innerArtifacts[innerHit.idx] : sel.innerArtifacts[innerHit.idx];
      dragState = {
        mode: innerHit.type === 'Enemy' ? 'move-enemy-inner' : 'move-stone-inner',
        idx: innerHit.idx,
        startX: mx,
        startY: my,
        origDx: source.dx,
        origDy: source.dy
      };
      canvas.style.cursor = 'grabbing';
      return;
    }
    if (allowSelectedEntityHandles && sel?.type === 'Enemy') {
      const anatomyHit = hitTestEnemyAnatomy(sel, mx, my);
      if (anatomyHit) {
        if (anatomyHit.action === 'move-mouth') {
          dragState = { mode:'move-enemy-mouth' };
          canvas.style.cursor = 'grabbing'; return;
        }
        if (anatomyHit.action === 'move-git') {
          dragState = { mode:'move-enemy-git' };
          canvas.style.cursor = 'grabbing'; return;
        }
        if (anatomyHit.action === 'resize-git') {
          dragState = { mode:'resize-enemy-git', cx: anatomyHit.git.x, cy: anatomyHit.git.y };
          canvas.style.cursor = 'nw-resize'; return;
        }
      }
    }
    if (allowSelectedEntityHandles && sel?.type === 'Macrophage') {
      const mouthHit = hitTestMacrophageMouthOverlay(sel, mx, my);
      if (mouthHit) {
        if (mouthHit.action === 'toggle-mouth-overlay') {
          macrophageMouthOverlay = !macrophageMouthOverlay;
          renderProps(); render(); return;
        }
        if (mouthHit.action === 'toggle-body-overlay') {
          macrophageBodyOverlay = !macrophageBodyOverlay;
          renderProps(); render(); return;
        }
        if (mouthHit.action === 'toggle-mouth-dir') {
          ensureMacrophageDefaults(sel);
          sel.mouth.rotationDir = sel.mouth.rotationDir >= 0 ? -1 : 1;
          ensureMacrophageDefaults(sel);
          renderProps(); render(); return;
        }
        if (mouthHit.action === 'toggle-body-dir') {
          ensureMacrophageDefaults(sel);
          sel.bodyRotation.rotationDir = sel.bodyRotation.rotationDir >= 0 ? -1 : 1;
          ensureMacrophageDefaults(sel);
          renderProps(); render(); return;
        }
        if (mouthHit.action === 'move-body-range') {
          dragState = { mode:'move-macro-body-range', rangeIdx: mouthHit.rangeIdx };
          canvas.style.cursor = 'grabbing'; return;
        }
        if (mouthHit.action === 'move-macro-sprite-handle') {
          dragState = { mode:'move', startX:mx, startY:my, origX:sel.x, origY:sel.y };
          canvas.style.cursor = 'grabbing'; return;
        }
        if (mouthHit.action === 'move-body-pivot') {
          dragState = { mode:'move-macro-body-pivot' };
          canvas.style.cursor = 'grabbing'; return;
        }
        if (mouthHit.action === 'move-orbit-center') {
          dragState = { mode:'move-macro-orbit-center' };
          canvas.style.cursor = 'grabbing'; return;
        }
        if (mouthHit.action === 'move-orbit-spline-point') {
          setSelectedMacrophageOrbitSplinePointIndex(sel, mouthHit.pointIdx);
          dragState = {
            mode:'move-macro-orbit-spline-point',
            pointIdx: mouthHit.pointIdx,
            startX: mx,
            startY: my,
            origDx: sel.orbit?.splinePoints?.[mouthHit.pointIdx]?.dx ?? 0,
            origDy: sel.orbit?.splinePoints?.[mouthHit.pointIdx]?.dy ?? 0
          };
          canvas.style.cursor = 'grabbing';
          renderProps();
          render();
          return;
        }
        if (mouthHit.action === 'select-orbit-spline-path') {
          renderProps(); render(); return;
        }
        if (mouthHit.action === 'resize-orbit-radius') {
          dragState = { mode:'resize-macro-orbit-radius' };
          canvas.style.cursor = 'ew-resize'; return;
        }
        if (mouthHit.action === 'move-free-direction') {
          dragState = { mode:'move-macro-free-direction' };
          canvas.style.cursor = 'grabbing'; return;
        }
        if (mouthHit.action === 'resize-free-radius') {
          dragState = { mode:'resize-macro-free-radius' };
          canvas.style.cursor = 'ew-resize'; return;
        }
        if (mouthHit.action === 'move-free-start') {
          dragState = { mode:'move-macro-free-start' };
          canvas.style.cursor = 'grabbing'; return;
        }
        if (mouthHit.action === 'move-free-end') {
          dragState = { mode:'move-macro-free-end' };
          canvas.style.cursor = 'grabbing'; return;
        }
        if (mouthHit.action === 'select-orbit-segment') {
          setSelectedMacrophageOrbitSegmentIndex(sel, mouthHit.segmentIdx);
          renderProps(); render(); return;
        }
        if (mouthHit.action === 'move-orbit-segment-center') {
          setSelectedMacrophageOrbitSegmentIndex(sel, mouthHit.segmentIdx);
          dragState = { mode:'move-macro-orbit-segment-center', segmentIdx: mouthHit.segmentIdx };
          canvas.style.cursor = 'grabbing'; return;
        }
        if (mouthHit.action === 'resize-orbit-segment-radius') {
          setSelectedMacrophageOrbitSegmentIndex(sel, mouthHit.segmentIdx);
          dragState = { mode:'resize-macro-orbit-segment-radius', segmentIdx: mouthHit.segmentIdx };
          canvas.style.cursor = 'ew-resize'; return;
        }
        if (mouthHit.action === 'move-orbit-segment-start') {
          setSelectedMacrophageOrbitSegmentIndex(sel, mouthHit.segmentIdx);
          dragState = { mode:'move-macro-orbit-segment-start', segmentIdx: mouthHit.segmentIdx };
          canvas.style.cursor = 'grabbing'; return;
        }
        if (mouthHit.action === 'move-orbit-segment-end') {
          setSelectedMacrophageOrbitSegmentIndex(sel, mouthHit.segmentIdx);
          dragState = { mode:'move-macro-orbit-segment-end', segmentIdx: mouthHit.segmentIdx };
          canvas.style.cursor = 'grabbing'; return;
        }
        if (mouthHit.action === 'move-mouth-range') {
          dragState = { mode:'move-macro-mouth-range', rangeIdx: mouthHit.rangeIdx };
          canvas.style.cursor = 'grabbing'; return;
        }
        if (mouthHit.action === 'resize-mouth-circle') {
          const handle = getMacrophageMouthCircleResizeHandle(sel);
          dragState = { mode:'resize-macro-mouth-circle', cx: handle.mouth.x, cy: handle.mouth.y };
          canvas.style.cursor = 'nw-resize'; return;
        }
        if (mouthHit.action === 'move-mouth-distance') {
          dragState = { mode:'move-macro-mouth-distance' };
          canvas.style.cursor = 'grabbing'; return;
        }
        if (mouthHit.action === 'move-mouth-circle') {
          dragState = { mode:'move-macro-mouth-circle' };
          canvas.style.cursor = 'grabbing'; return;
        }
        if (mouthHit.action === 'move-egg-spawn-point') {
          const handle = getMacrophageEggSpawnHandle(sel);
          dragState = {
            mode:'move-macro-egg-spawn-point',
            circleX: handle.circle.x,
            circleY: handle.circle.y
          };
          canvas.style.cursor = 'grabbing'; return;
        }
        if (mouthHit.action === 'move-germination-point') {
          const handle = getMacrophageGerminationHandle(sel);
          dragState = {
            mode:'move-macro-germination-point',
            circleX: handle.circle.x,
            circleY: handle.circle.y
          };
          canvas.style.cursor = 'grabbing'; return;
        }
        if (mouthHit.action === 'move-projectile-spawn-point') {
          const handle = getMacrophageProjectileSpawnHandle(sel);
          dragState = {
            mode:'move-macro-projectile-spawn-point',
            circleX: handle.circle.x,
            circleY: handle.circle.y
          };
          canvas.style.cursor = 'grabbing'; return;
        }
        if (mouthHit.action === 'move-digest-point') {
          dragState = { mode:'move-macro-digest-point', digestKey: mouthHit.digestKey };
          canvas.style.cursor = 'grabbing'; return;
        }
      }
    }
    if (allowSelectedEntityHandles && sel?.type === 'Algae') {
      const algaeHit = hitTestAlgaeGerminationOverlay(sel, mx, my);
      if (algaeHit?.action === 'move-algae-germination-point') {
        const handle = getAlgaeGerminationHandle(sel);
        dragState = {
          mode:'move-algae-germination-point',
          circleX: handle.circle.x,
          circleY: handle.circle.y
        };
        canvas.style.cursor = 'grabbing';
        return;
      }
    }
    if (allowSelectedEntityHandles && isMultiCircleEntity(sel) && sel.circles?.length) {
      const stHit = hitTestMultiCircle(sel,mx,my);
      if (stHit) {
        if (stHit.action === 'resize-circle') {
          const c = getStentorCircleAbs(sel, stHit.circleIdx);
          dragState = { mode:'resize-subcircle', circleIdx:stHit.circleIdx, cx:c.x, cy:c.y };
          canvas.style.cursor = 'nw-resize'; return;
        }
        if (stHit.action === 'move-circle') {
          dragState = { mode:'move-subcircle', circleIdx:stHit.circleIdx, startX:mx, startY:my, origDx:sel.circles[stHit.circleIdx].dx, origDy:sel.circles[stHit.circleIdx].dy };
          canvas.style.cursor = 'grabbing'; return;
        }
        dragState = { mode:'move', startX:mx, startY:my, origX:sel.x, origY:sel.y }; canvas.style.cursor = 'grabbing'; return;
      }
    }
    if (allowSelectedEntityHandles && hasBodyCircleEditor(sel) && sel.bodyCircles?.length) {
      const enemyHit = hitTestEnemyBodyCircles(sel, mx, my);
      if (enemyHit) {
        if (enemyHit.action === 'resize-circle') {
          const c = getBodyCircleAbs(sel, enemyHit.circleIdx);
          dragState = { mode:'resize-enemy-body', circleIdx:enemyHit.circleIdx, cx:c.x, cy:c.y };
          canvas.style.cursor = 'nw-resize'; return;
        }
        if (enemyHit.action === 'move-circle') {
          dragState = { mode:'move-enemy-body', circleIdx:enemyHit.circleIdx, startX:mx, startY:my, origDx:sel.bodyCircles[enemyHit.circleIdx].dx, origDy:sel.bodyCircles[enemyHit.circleIdx].dy };
          canvas.style.cursor = 'grabbing'; return;
        }
        dragState = { mode:'move', startX:mx, startY:my, origX:sel.x, origY:sel.y }; canvas.style.cursor = 'grabbing'; return;
      }
    }
    if (allowSelectedEntityHandles && sel && sel.type !== 'ComposedEntity' && !isMultiCircleEntity(sel) && hitTestResize(sel,mx,my)) { dragState = { mode:'resize' }; canvas.style.cursor = 'nw-resize'; return; }
    if (entityHit) {
      setSingleSelection(entityHit._id); dragState = { mode:'move', startX:mx, startY:my, origX:entityHit.x, origY:entityHit.y }; canvas.style.cursor = 'grabbing'; renderProps(); render();
    } else { clearSelection(); renderProps(); render(); }
  });

  canvas.addEventListener('mousemove', e => {
    const mx = e.offsetX, my = e.offsetY; mousePos = { x:mx, y:my, inside:true };
    document.getElementById('coord-display').innerHTML = `px: ${mx}, ${my} &nbsp;|&nbsp; norm: ${(mx/canvas.width).toFixed(3)}, ${(my/canvas.height).toFixed(3)}`;
    const sel = getSelected();
    if (!dragState && sel?.type === 'Macrophage' && (e.buttons & 1) === 1) {
      const dragHit = hitTestMacrophageMouthOverlay(sel, mx, my);
      if (dragHit?.action === 'move-egg-spawn-point') {
        const handle = getMacrophageEggSpawnHandle(sel);
        dragState = { mode:'move-macro-egg-spawn-point', circleX: handle.circle.x, circleY: handle.circle.y };
        canvas.style.cursor = 'grabbing';
      } else if (dragHit?.action === 'move-germination-point') {
        const handle = getMacrophageGerminationHandle(sel);
        dragState = { mode:'move-macro-germination-point', circleX: handle.circle.x, circleY: handle.circle.y };
        canvas.style.cursor = 'grabbing';
      } else if (dragHit?.action === 'move-projectile-spawn-point') {
        const handle = getMacrophageProjectileSpawnHandle(sel);
        dragState = { mode:'move-macro-projectile-spawn-point', circleX: handle.circle.x, circleY: handle.circle.y };
        canvas.style.cursor = 'grabbing';
      }
    }
    if (dragState?.mode === 'bg-pan') {
      backgroundOffsetX = dragState.origX + (mx - dragState.startX);
      backgroundOffsetY = dragState.origY + (my - dragState.startY);
      render();
      return;
    }
    if (dragState?.mode === 'move-multi') {
      for (const item of dragState.items ?? []) {
        const entity = entities.find(candidate => candidate._id === item.id);
        if (!entity) continue;
        entity.x = snap(item.origX + (mx - dragState.startX));
        entity.y = snap(item.origY + (my - dragState.startY));
        clampEditorEntityInsideCanvas(entity);
      }
      renderProps();
      render();
      return;
    }
    if (dragState && sel) {
      if (dragState.mode === 'move') {
        sel.x = snap(dragState.origX + (mx-dragState.startX));
        sel.y = snap(dragState.origY + (my-dragState.startY));
        clampEditorEntityInsideCanvas(sel);
      }
      else if (dragState.mode === 'resize') sel.radius = Math.max(5, Math.round(Math.hypot(mx-sel.x, my-sel.y)));
      else if (dragState.mode === 'move-subcircle') { sel.circles[dragState.circleIdx].dx = safeRound(dragState.origDx + (mx-dragState.startX)); sel.circles[dragState.circleIdx].dy = safeRound(dragState.origDy + (my-dragState.startY)); }
      else if (dragState.mode === 'resize-subcircle') { const newR = Math.max(5, Math.round(Math.hypot(mx-dragState.cx, my-dragState.cy))); sel.circles[dragState.circleIdx].r = newR; if (dragState.circleIdx === 0) sel.radius = newR; }
      else if (dragState.mode === 'move-enemy-body') { sel.bodyCircles[dragState.circleIdx].dx = safeRound(dragState.origDx + (mx-dragState.startX)); sel.bodyCircles[dragState.circleIdx].dy = safeRound(dragState.origDy + (my-dragState.startY)); }
      else if (dragState.mode === 'resize-enemy-body') {
        const newR = Math.max(5, Math.round(Math.hypot(mx-dragState.cx, my-dragState.cy)));
        const prevRadius = Math.max(0.0001, sel.radius);
        if (dragState.circleIdx === 0) {
          if (sel.type === 'Enemy') {
            scaleEnemyBody(sel, prevRadius, newR);
          } else if (sel.type === 'Macrophage') {
            scaleMacrophageBody(sel, prevRadius, newR);
          } else {
            sel.bodyCircles[dragState.circleIdx].r = newR;
            sel.radius = newR;
          }
        } else {
          sel.bodyCircles[dragState.circleIdx].r = newR;
        }
      }
      else if (dragState.mode === 'move-macro-mouth-range') {
        ensureMacrophageDefaults(sel);
        const anchor = getMacrophageMouthAnchor(sel);
        const worldAngleDeg = normalizeSignedDeg(radToDeg(Math.atan2(my - anchor.y, mx - anchor.x)));
        const relativeAngleDeg = normalizeSignedDeg(worldAngleDeg - getMacrophageBodyBaseAngleDeg(sel));
        if (dragState.rangeIdx === 0) sel.mouth.rotationRange[0] = Math.min(relativeAngleDeg, sel.mouth.rotationRange[1]);
        else sel.mouth.rotationRange[1] = Math.max(relativeAngleDeg, sel.mouth.rotationRange[0]);
      }
      else if (dragState.mode === 'move-macro-body-range') {
        ensureMacrophageDefaults(sel);
        const pivot = getMacrophageBodyPivot(sel);
        const worldAngleDeg = normalizeSignedDeg(radToDeg(Math.atan2(my - pivot.y, mx - pivot.x)));
        const relativeAngleDeg = normalizeSignedDeg(worldAngleDeg - getMacrophageBodyBaseAngleDeg(sel));
        if (dragState.rangeIdx === 0) sel.bodyRotation.rotationRange[0] = Math.min(relativeAngleDeg, sel.bodyRotation.rotationRange[1]);
        else sel.bodyRotation.rotationRange[1] = Math.max(relativeAngleDeg, sel.bodyRotation.rotationRange[0]);
      }
      else if (dragState.mode === 'move-macro-body-pivot') {
        ensureMacrophageDefaults(sel);
        sel.bodyRotation.pivotDx = safeRound(mx - sel.x);
        sel.bodyRotation.pivotDy = safeRound(my - sel.y);
      }
      else if (dragState.mode === 'move-macro-orbit-center') {
        ensureMacrophageDefaults(sel);
        sel.orbit.centerDx = safeRound(mx - sel.x);
        sel.orbit.centerDy = safeRound(my - sel.y);
      }
      else if (dragState.mode === 'resize-macro-orbit-radius') {
        ensureMacrophageDefaults(sel);
        const center = getMacrophageOrbitCenter(sel);
        const nextRadius = Math.max(0, Math.hypot(mx - center.x, my - center.y));
        const prevRadius = Math.max(0.0001, sel.orbit.radius || nextRadius || 1);
        if (sel.orbit.mode === 'spline' && Array.isArray(sel.orbit.splinePoints) && sel.orbit.splinePoints.length > 2) {
          const scale = nextRadius / prevRadius;
          sel.orbit.splinePoints = sel.orbit.splinePoints.map(point => ({
            dx: point.dx * scale,
            dy: point.dy * scale
          }));
        }
        sel.orbit.radius = nextRadius;
      }
      else if (dragState.mode === 'move-macro-free-direction') {
        ensureMacrophageDefaults(sel);
        const center = getMacrophageFreeMoveGeometry(sel).center;
        sel.orbit.freeMove.directionDeg = normalizeSignedDeg(radToDeg(Math.atan2(my - center.y, mx - center.x)));
        sel.orbit.freeMove = makeDefaultMacrophageFreeMove(sel.orbit.freeMove);
      }
      else if (dragState.mode === 'resize-macro-free-radius') {
        ensureMacrophageDefaults(sel);
        const center = getMacrophageFreeMoveGeometry(sel).center;
        sel.orbit.freeMove.previewRadius = Math.max(12, Math.hypot(mx - center.x, my - center.y));
        sel.orbit.freeMove = makeDefaultMacrophageFreeMove(sel.orbit.freeMove);
      }
      else if (dragState.mode === 'move-macro-free-start') {
        ensureMacrophageDefaults(sel);
        const center = getMacrophageFreeMoveGeometry(sel).center;
        const currentDir = degToRad(sel.orbit.freeMove.directionDeg ?? 0);
        const angle = Math.atan2(my - center.y, mx - center.x);
        let halfSpread = Math.abs(normalizeSignedDeg(radToDeg(angle - currentDir)));
        halfSpread = Math.min(180, halfSpread);
        sel.orbit.freeMove.spreadDeg = halfSpread * 2;
        sel.orbit.freeMove = makeDefaultMacrophageFreeMove(sel.orbit.freeMove);
      }
      else if (dragState.mode === 'move-macro-free-end') {
        ensureMacrophageDefaults(sel);
        const center = getMacrophageFreeMoveGeometry(sel).center;
        const currentDir = degToRad(sel.orbit.freeMove.directionDeg ?? 0);
        const angle = Math.atan2(my - center.y, mx - center.x);
        let halfSpread = Math.abs(normalizeSignedDeg(radToDeg(angle - currentDir)));
        halfSpread = Math.min(180, halfSpread);
        sel.orbit.freeMove.spreadDeg = halfSpread * 2;
        sel.orbit.freeMove = makeDefaultMacrophageFreeMove(sel.orbit.freeMove);
      }
      else if (dragState.mode === 'move-macro-orbit-segment-center') {
        ensureMacrophageDefaults(sel);
        const segment = sel.orbit?.segments?.[dragState.segmentIdx];
        if (segment) {
          segment.centerDx = safeRound(mx - sel.x);
          segment.centerDy = safeRound(my - sel.y);
        }
      }
      else if (dragState.mode === 'move-macro-orbit-spline-point') {
        ensureMacrophageDefaults(sel);
        const point = sel.orbit?.splinePoints?.[dragState.pointIdx];
        if (point) {
          point.dx = safeRound(dragState.origDx + (mx - dragState.startX));
          point.dy = safeRound(dragState.origDy + (my - dragState.startY));
          setSelectedMacrophageOrbitSplinePointIndex(sel, dragState.pointIdx);
        }
      }
      else if (dragState.mode === 'resize-macro-orbit-segment-radius') {
        ensureMacrophageDefaults(sel);
        const geom = getMacrophageOrbitSegmentGeometry(sel, dragState.segmentIdx);
        if (geom?.segment) {
          geom.segment.radius = Math.max(0, Math.hypot(mx - geom.center.x, my - geom.center.y));
        }
      }
      else if (dragState.mode === 'move-macro-orbit-segment-start') {
        ensureMacrophageDefaults(sel);
        const geom = getMacrophageOrbitSegmentGeometry(sel, dragState.segmentIdx);
        if (geom?.segment) {
          geom.segment.startDeg = normalizeSignedDeg(radToDeg(Math.atan2(my - geom.center.y, mx - geom.center.x)));
        }
      }
      else if (dragState.mode === 'move-macro-orbit-segment-end') {
        ensureMacrophageDefaults(sel);
        const geom = getMacrophageOrbitSegmentGeometry(sel, dragState.segmentIdx);
        if (geom?.segment) {
          geom.segment.endDeg = normalizeSignedDeg(radToDeg(Math.atan2(my - geom.center.y, mx - geom.center.x)));
        }
      }
      else if (dragState.mode === 'move-macro-mouth-circle') {
        ensureMacrophageDefaults(sel);
        const mouth = getMacrophageMouthCircle(sel);
        sel.mouth.absorbRadius = Math.max(2, Math.hypot(mx - mouth.x, my - mouth.y));
      }
      else if (dragState.mode === 'move-macro-mouth-distance') {
        ensureMacrophageDefaults(sel);
        const anchor = getMacrophageMouthAnchor(sel);
        sel.mouth.offsetDistance = Math.max(0, Math.hypot(mx - anchor.x, my - anchor.y));
      }
      else if (dragState.mode === 'resize-macro-mouth-circle') {
        ensureMacrophageDefaults(sel);
        sel.mouth.absorbRadius = Math.max(2, Math.hypot(mx - dragState.cx, my - dragState.cy));
      }
      else if (dragState.mode === 'move-macro-egg-spawn-point') {
        ensureMacrophageDefaults(sel);
        sel.eggSpawn.angleDeg = normalizeSignedDeg(radToDeg(
          Math.atan2(my - dragState.circleY, mx - dragState.circleX) - getMacrophageBodyBaseAngleRad(sel)
        ));
      }
      else if (dragState.mode === 'move-macro-germination-point') {
        ensureMacrophageDefaults(sel);
        sel.germination.angleDeg = normalizeSignedDeg(radToDeg(
          Math.atan2(my - dragState.circleY, mx - dragState.circleX) - getMacrophageBodyBaseAngleRad(sel)
        ));
      }
      else if (dragState.mode === 'move-macro-projectile-spawn-point') {
        ensureMacrophageDefaults(sel);
        sel.projectileSpawn.angleDeg = normalizeSignedDeg(radToDeg(
          Math.atan2(my - dragState.circleY, mx - dragState.circleX) - getMacrophageBodyBaseAngleRad(sel)
        ));
      }
      else if (dragState.mode === 'move-algae-germination-point') {
        ensureAlgaeDefaults(sel);
        sel.germination.angleDeg = normalizeSignedDeg(radToDeg(
          Math.atan2(my - dragState.circleY, mx - dragState.circleX)
        ));
      }
      else if (dragState.mode === 'move-macro-digest-point') {
        ensureMacrophageDefaults(sel);
        const local = macropDigestWorldToLocal(sel, mx, my);
        if (sel.digestPath?.[dragState.digestKey]) {
          sel.digestPath[dragState.digestKey].dx = local.dx;
          sel.digestPath[dragState.digestKey].dy = local.dy;
        }
      }
      else if (dragState.mode === 'move-stone-inner') {
        sel.innerArtifacts[dragState.idx].dx = safeRound(dragState.origDx + (mx - dragState.startX));
        sel.innerArtifacts[dragState.idx].dy = safeRound(dragState.origDy + (my - dragState.startY));
      }
      else if (dragState.mode === 'move-enemy-inner') {
        const worldDx = mx - dragState.startX;
        const worldDy = my - dragState.startY;
        const angle = getEnemyMouthAngleRad(sel);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const localDx = worldDx * cos + worldDy * sin;
        const localDy = -worldDx * sin + worldDy * cos;
        sel.innerArtifacts[dragState.idx].dx = safeRound(dragState.origDx + localDx);
        sel.innerArtifacts[dragState.idx].dy = safeRound(dragState.origDy + localDy);
      }
      else if (dragState.mode === 'move-enemy-mouth') {
        sel.mouthRestAngle = Math.atan2(my - sel.y, mx - sel.x);
      }
      else if (dragState.mode === 'move-enemy-git') {
        const dx = mx - sel.x;
        const dy = my - sel.y;
        sel.gitCircleOffsetAngleDeg = normalizeSignedDeg(radToDeg(Math.atan2(dy, dx) - getEnemyMouthAngleRad(sel)));
        sel.gitCircleOffsetDistanceMul = Math.max(0, Math.hypot(dx, dy) / Math.max(sel.radius, 0.0001));
      }
      else if (dragState.mode === 'resize-enemy-git') {
        const newR = Math.max(3, Math.round(Math.hypot(mx - dragState.cx, my - dragState.cy)));
        sel.gitCircleRadiusMul = Math.max(0.05, newR / Math.max(sel.radius, 0.0001));
      }
      if (dragState.mode === 'move-macro-orbit-spline-point') { render(); return; }
      renderProps(); render(); return;
    }
    if (backgroundEditMode && hasBackgroundImage()) {
      canvas.style.cursor = 'grab';
      render();
      return;
    }
    if (isMultiCircleEntity(sel) && sel.circles?.length) {
      hoverInnerArtifactHandle = hitTestInnerArtifacts(sel, mx, my);
      hoverEnemyAnatomyHandle = sel.type === 'Algae' && !hoverInnerArtifactHandle
        ? hitTestAlgaeGerminationOverlay(sel, mx, my)
        : null;
      hoverStentorHandle = hoverEnemyAnatomyHandle ? null : hitTestMultiCircle(sel,mx,my);
      canvas.style.cursor = hoverInnerArtifactHandle ? 'grab' : (hoverStentorHandle?.action === 'resize-circle' ? 'nw-resize' : (hoverStentorHandle?.action || hoverEnemyAnatomyHandle?.action ? 'grab' : (hitTestEntity(mx,my) ? 'grab' : 'default')));
      render();
    } else if (hasBodyCircleEditor(sel) && sel.bodyCircles?.length) {
      hoverInnerArtifactHandle = hitTestInnerArtifacts(sel, mx, my);
      hoverStentorHandle = hitTestEnemyBodyCircles(sel, mx, my);
      hoverEnemyAnatomyHandle =
        !(hoverInnerArtifactHandle || hoverStentorHandle)
          ? (sel?.type === 'Enemy'
              ? hitTestEnemyAnatomy(sel, mx, my)
              : sel?.type === 'Macrophage'
                ? hitTestMacrophageMouthOverlay(sel, mx, my)
                : null)
          : null;
      hoverResize = false;
      canvas.style.cursor =
        hoverStentorHandle?.action === 'resize-circle' || hoverEnemyAnatomyHandle?.action === 'resize-git'
          ? 'nw-resize'
          : (hoverInnerArtifactHandle || hoverStentorHandle?.action || hoverEnemyAnatomyHandle?.action ? 'grab' : (hitTestEntity(mx,my) ? 'grab' : 'default'));
      render();
    } else if (sel) {
      hoverInnerArtifactHandle = hitTestInnerArtifacts(sel, mx, my);
      hoverEnemyAnatomyHandle = null;
      hoverResize = hitTestResize(sel,mx,my); canvas.style.cursor = hoverInnerArtifactHandle ? 'grab' : (hoverResize ? 'nw-resize' : (hitTestEntity(mx,my) ? 'grab' : 'default')); render();
    } else { hoverInnerArtifactHandle = null; hoverEnemyAnatomyHandle = null; canvas.style.cursor = activeTool === 'select' ? (hitTestComposedEntityInstance(mx,my) || hitTestEntity(mx,my) ? 'grab' : 'default') : 'crosshair'; render(); }
  });
  canvas.addEventListener('mouseup', () => {
    const finishedDrag = dragState;
    dragState = null;
    if (backgroundEditMode && hasBackgroundImage()) {
      canvas.style.cursor = 'grab';
      return;
    }
    if (finishedDrag?.mode === 'move-macro-orbit-spline-point') {
      renderProps();
      render();
    }
    canvas.style.cursor = activeTool === 'select' ? (hitTestComposedEntityInstance(mousePos.x, mousePos.y) || hitTestEntity(mousePos.x, mousePos.y) ? 'grab' : 'default') : 'crosshair';
  });
  canvas.addEventListener('mouseleave', () => {
    dragState = null;
    mousePos.inside = false;
    hoverInnerArtifactHandle = null;
    canvas.style.cursor = backgroundEditMode && hasBackgroundImage() ? 'grab' : (activeTool === 'select' ? 'default' : 'crosshair');
    render();
  });
  canvas.addEventListener('wheel', e => {
    if (backgroundEditMode && hasBackgroundImage()) {
      e.preventDefault();
      zoomBackgroundAtPoint(Math.sign(e.deltaY), e.offsetX, e.offsetY);
      render();
      return;
    }
    const sel = getSelected();
    if (!sel) return;
    e.preventDefault();
    const delta = Math.sign(e.deltaY);
    if (isMultiCircleEntity(sel) && sel.circles?.length) {
      const i = hoverStentorHandle?.action === 'resize-circle' ? hoverStentorHandle.circleIdx : 0;
      sel.circles[i].r = Math.max(5, sel.circles[i].r - delta*2);
      if (i===0) sel.radius = sel.circles[0].r;
    } else if (hasBodyCircleEditor(sel) && sel.bodyCircles?.length) {
      if (hoverEnemyAnatomyHandle?.action === 'move-git' || hoverEnemyAnatomyHandle?.action === 'resize-git') {
        const currentGitRadius = Math.max(3, sel.radius * clampNum(sel.gitCircleRadiusMul, 0.48));
        sel.gitCircleRadiusMul = Math.max(0.05, (currentGitRadius - delta * 2) / Math.max(sel.radius, 0.0001));
      } else if (hoverEnemyAnatomyHandle?.action === 'move-mouth') {
        sel.mouthAbsorbRadius = Math.max(1, sel.mouthAbsorbRadius - delta * 1);
      } else if (sel.type === 'Macrophage' && (hoverEnemyAnatomyHandle?.action === 'move-mouth-circle' || hoverEnemyAnatomyHandle?.action === 'resize-mouth-circle')) {
        setMacrophageMouthProp('absorbRadius', Math.max(2, (sel.mouth?.absorbRadius ?? 22) - delta * 2));
        return;
      } else if (sel.type === 'Macrophage' && hoverEnemyAnatomyHandle?.action === 'move-mouth-distance') {
        setMacrophageMouthProp('offsetDistance', Math.max(0, (sel.mouth?.offsetDistance ?? sel.radius) - delta * 2));
        return;
      } else if (sel.type === 'Macrophage' && hoverEnemyAnatomyHandle?.action === 'move-mouth-range') {
        const idx = hoverEnemyAnatomyHandle.rangeIdx ?? 0;
        const next = (sel.mouth?.rotationRange?.[idx] ?? 0) - delta * 2;
        setMacrophageMouthRange(idx, next);
        return;
      } else if (sel.type === 'Macrophage' && hoverEnemyAnatomyHandle?.action === 'move-body-range') {
        const idx = hoverEnemyAnatomyHandle.rangeIdx ?? 0;
        const next = (sel.bodyRotation?.rotationRange?.[idx] ?? 0) - delta * 2;
        setMacrophageBodyRotationRange(idx, next);
        return;
      } else if (sel.type === 'Macrophage' && hoverEnemyAnatomyHandle?.action === 'move-body-pivot') {
        setMacrophageBodyRotationProp('pivotRadius', Math.max(4, (sel.bodyRotation?.pivotRadius ?? 12) - delta * 2));
        return;
      } else if (sel.type === 'Macrophage' && hoverEnemyAnatomyHandle?.action === 'toggle-body-dir') {
        setMacrophageBodyRotationProp('rotationDir', (sel.bodyRotation?.rotationDir ?? 1) >= 0 ? -1 : 1);
        return;
      } else if (sel.type === 'Macrophage' && hoverEnemyAnatomyHandle?.action === 'toggle-mouth-dir') {
        setMacrophageMouthProp('rotationDir', (sel.mouth?.rotationDir ?? 1) >= 0 ? -1 : 1);
        return;
      } else {
        const i = hoverStentorHandle?.action === 'resize-circle' ? hoverStentorHandle.circleIdx : 0;
        const prevRadius = Math.max(0.0001, sel.radius);
        if (i===0) {
          const nextRadius = Math.max(5, sel.bodyCircles[0].r - delta*2);
          if (sel.type === 'Enemy') {
            scaleEnemyBody(sel, prevRadius, nextRadius);
          } else if (sel.type === 'Macrophage') {
            scaleMacrophageBody(sel, prevRadius, nextRadius);
          } else {
            sel.bodyCircles[i].r = nextRadius;
            sel.radius = sel.bodyCircles[0].r;
          }
        } else {
          sel.bodyCircles[i].r = Math.max(5, sel.bodyCircles[i].r - delta*2);
        }
      }
    } else sel.radius = Math.max(5, sel.radius - delta*2);
    clampEditorEntityInsideCanvas(sel);
    renderProps();
    render();
  }, { passive:false });
}

function deleteSelected() {
  const ids = getSelectedEntities().map(entity => entity._id);
  if (!ids.length) return;
  const selectedIdSet = new Set(ids);
  entities = entities.filter(entity => !selectedIdSet.has(entity._id));
  clearSelection();
  renderProps();
  render();
}
function clearLevel() { if (!confirm('Clear all entities?')) return; entities = []; importedLevelGeometry = null; clearSelection(); renderProps(); render(); }
function duplicateSelected() {
  const selection = getSelectedEntities();
  if (!selection.length) return;
  const duplicable = selection.filter(entity => entity.type !== 'Player');
  if (!duplicable.length) {
    setEditorStatus('Player cannot be duplicated. Level can contain only one Player.', 'warning');
    return;
  }
  const composedIdMap = new Map();
  const copies = duplicable.map(entity => {
    const copy = JSON.parse(JSON.stringify(entity));
    copy._id = idCounter++;
    copy.x = snap((copy.x ?? 0) + 25);
    copy.y = snap((copy.y ?? 0) + 25);
    clampEditorEntityInsideCanvas(copy);
    if (copy._composedEntityInstanceId) {
      if (!composedIdMap.has(copy._composedEntityInstanceId)) {
        composedIdMap.set(copy._composedEntityInstanceId, `ce_${Date.now()}_${idCounter}_${composedIdMap.size}`);
      }
      copy._composedEntityInstanceId = composedIdMap.get(copy._composedEntityInstanceId);
    }
    return copy;
  });
  entities.push(...copies);
  selectedIds = copies.map(copy => copy._id);
  selectedId = selectedIds[selectedIds.length - 1] ?? null;
  const uniqueComposedIds = [...new Set(copies.map(copy => copy._composedEntityInstanceId).filter(Boolean))];
  selectedComposedEntityInstanceId = uniqueComposedIds.length === 1 ? uniqueComposedIds[0] : null;
  renderProps();
  render();
}
function bringToFront() {
  const ids = getSelectedEntities().map(entity => entity._id);
  if (!ids.length) return;
  const selectedIdSet = new Set(ids);
  const selectedEntities = entities.filter(entity => selectedIdSet.has(entity._id));
  const others = entities.filter(entity => !selectedIdSet.has(entity._id));
  entities = [...others, ...selectedEntities];
  render();
}
function sendToBack() {
  const ids = getSelectedEntities().map(entity => entity._id);
  if (!ids.length) return;
  const selectedIdSet = new Set(ids);
  const selectedEntities = entities.filter(entity => selectedIdSet.has(entity._id));
  const others = entities.filter(entity => !selectedIdSet.has(entity._id));
  entities = [...selectedEntities, ...others];
  render();
}

function ensureStentorDefaults(sel) {
  if (!sel || sel.type !== 'Stentor') return;
  sel.mouth ??= makeDefaultStentorMouth();
  sel.bodyRotation ??= makeDefaultStentorBodyRotation();
  if (!Array.isArray(sel.mouth.rotationRange) || sel.mouth.rotationRange.length !== 2) sel.mouth.rotationRange = [-90,90];
  if (!Array.isArray(sel.bodyRotation.rotationRange) || sel.bodyRotation.rotationRange.length !== 2) sel.bodyRotation.rotationRange = [-25,25];
}
function canMirrorEntity(sel) {
  return ['Enemy', 'Macrophage', 'ComposedStone', 'Algae', 'Stentor'].includes(sel?.type);
}
function mirrorAbsDeg(value) {
  return normalizeSignedDeg(180 - (Number(value) || 0));
}
function mirrorRelativeDeg(value) {
  return normalizeSignedDeg(-(Number(value) || 0));
}
function mirrorRelativeRangeDeg(range, fallback = [-30, 30]) {
  const source = Array.isArray(range) && range.length === 2 ? range : fallback;
  const a = -(Number(source[1]) || 0);
  const b = -(Number(source[0]) || 0);
  return [Math.min(a, b), Math.max(a, b)];
}
function mirrorAbsRad(value) {
  const next = Math.PI - (Number(value) || 0);
  return Math.atan2(Math.sin(next), Math.cos(next));
}
function mirrorHorizontalOffsets(items, key = 'dx') {
  if (!Array.isArray(items)) return items;
  return items.map(item => ({ ...item, [key]: -(Number(item?.[key] ?? 0) || 0) }));
}
function mirrorVerticalOffsets(items, key = 'dy') {
  if (!Array.isArray(items)) return items;
  return items.map(item => ({ ...item, [key]: -(Number(item?.[key] ?? 0) || 0) }));
}
function mirrorOffsetsAroundPivot(items, pivotValue = 0, key = 'dy') {
  if (!Array.isArray(items)) return items;
  const pivot = Number(pivotValue) || 0;
  return items.map(item => ({
    ...item,
    [key]: safeRound(pivot * 2 - (Number(item?.[key] ?? 0) || 0))
  }));
}
function mirrorDigestPath(path, pivotDy = 0) {
  if (!path || typeof path !== 'object') return path;
  const pivot = Number(pivotDy) || 0;
  const mirrored = {};
  Object.entries(path).forEach(([key, point]) => {
    mirrored[key] = point && typeof point === 'object'
      ? { ...point, dy: safeRound(pivot * 2 - (Number(point.dy ?? 0) || 0)) }
      : point;
  });
  return mirrored;
}
function toggleSelectedEntityMirrorX() {
  const sel = getSelected();
  if (!sel || !canMirrorEntity(sel)) return;

  if (sel.type === 'Enemy') {
    ensureEnemyDefaults(sel);
    sel.spriteFlipX = !sel.spriteFlipX;
    sel.spriteRotationOffset = -clampNum(sel.spriteRotationOffset, 0);
    sel.bodyCircles = mirrorVerticalOffsets(sel.bodyCircles, 'dy');
    sel.innerArtifacts = mirrorVerticalOffsets(sel.innerArtifacts, 'dy');
    sel.mouthRestAngle = mirrorAbsRad(sel.mouthRestAngle);
    sel.gitCircleOffsetAngleDeg = mirrorRelativeDeg(sel.gitCircleOffsetAngleDeg);
    sel.spawnArcCenterDeg = mirrorAbsDeg(sel.spawnArcCenterDeg ?? 0);
  } else if (sel.type === 'Macrophage') {
    ensureMacrophageDefaults(sel);
    sel.spriteFlipX = !sel.spriteFlipX;
    sel.spriteRotationOffset = -clampNum(sel.spriteRotationOffset, 0);
    const pivotDy = Number(sel.bodyRotation?.pivotDy ?? 0) || 0;
    sel.bodyCircles = mirrorOffsetsAroundPivot(sel.bodyCircles, pivotDy, 'dy');
    if (sel.mouth && typeof sel.mouth === 'object') {
      sel.mouth.rotationDir = -Math.max(-1, Math.min(1, Number(sel.mouth.rotationDir ?? 1) || 1));
      sel.mouth.rotationRange = mirrorRelativeRangeDeg(sel.mouth.rotationRange, [-30, 30]);
    }
    if (sel.bodyRotation && typeof sel.bodyRotation === 'object') {
      sel.bodyRotation.baseAngleDeg = mirrorAbsDeg(sel.bodyRotation.baseAngleDeg ?? 0);
      sel.bodyRotation.rotationDir = -Math.max(-1, Math.min(1, Number(sel.bodyRotation.rotationDir ?? 1) || 1));
      sel.bodyRotation.rotationRange = mirrorRelativeRangeDeg(sel.bodyRotation.rotationRange, [-12, 12]);
    }
    sel.digestPath = mirrorDigestPath(sel.digestPath, pivotDy);
    if (sel.eggSpawn && typeof sel.eggSpawn === 'object') {
      sel.eggSpawn.angleDeg = mirrorRelativeDeg(sel.eggSpawn.angleDeg ?? 0);
    }
    if (sel.germination && typeof sel.germination === 'object') {
      sel.germination.angleDeg = mirrorRelativeDeg(sel.germination.angleDeg ?? 0);
    }
    if (sel.projectileSpawn && typeof sel.projectileSpawn === 'object') {
      sel.projectileSpawn.angleDeg = mirrorRelativeDeg(sel.projectileSpawn.angleDeg ?? 0);
    }
    if (sel.orbit && typeof sel.orbit === 'object') {
      sel.orbit.centerDx = -(Number(sel.orbit.centerDx ?? 0) || 0);
      if (sel.orbit.freeMove && typeof sel.orbit.freeMove === 'object') {
        sel.orbit.freeMove.directionDeg = mirrorAbsDeg(sel.orbit.freeMove.directionDeg ?? 0);
      }
      if (Array.isArray(sel.orbit.segments)) {
        sel.orbit.segments = sel.orbit.segments.map(segment => ({
          ...segment,
          centerDx: -(Number(segment?.centerDx ?? 0) || 0),
          startDeg: mirrorAbsDeg(segment?.endDeg ?? 0),
          endDeg: mirrorAbsDeg(segment?.startDeg ?? 0)
        }));
      }
      if (Array.isArray(sel.orbit.splinePoints)) {
        sel.orbit.splinePoints = mirrorHorizontalOffsets(sel.orbit.splinePoints, 'dx');
      }
    }
  } else if (sel.type === 'ComposedStone') {
    ensureComposedStoneDefaults(sel);
    sel.spriteFlipX = !sel.spriteFlipX;
    sel.spriteRotationOffset = -clampNum(sel.spriteRotationOffset, 0);
    sel.circles = mirrorHorizontalOffsets(sel.circles, 'dx');
  } else if (sel.type === 'Algae') {
    ensureAlgaeDefaults(sel);
    sel.spriteFlipX = !sel.spriteFlipX;
    sel.spriteRotationOffset = -clampNum(sel.spriteRotationOffset, 0);
    sel.circles = mirrorHorizontalOffsets(sel.circles, 'dx');
    if (sel.germination && typeof sel.germination === 'object') {
      sel.germination.angleDeg = mirrorRelativeDeg(sel.germination.angleDeg ?? 0);
    }
  } else if (sel.type === 'Stentor') {
    ensureStentorDefaults(sel);
    sel.circles = mirrorHorizontalOffsets(sel.circles, 'dx');
    if (sel.mouth && typeof sel.mouth === 'object') {
      sel.mouth.rotationDir = -Math.max(-1, Math.min(1, Number(sel.mouth.rotationDir ?? 1) || 1));
      sel.mouth.rotationRange = mirrorRelativeRangeDeg(sel.mouth.rotationRange, [-90, 90]);
    }
    if (sel.bodyRotation && typeof sel.bodyRotation === 'object') {
      sel.bodyRotation.rotationDir = -Math.max(-1, Math.min(1, Number(sel.bodyRotation.rotationDir ?? 1) || 1));
      sel.bodyRotation.rotationRange = mirrorRelativeRangeDeg(sel.bodyRotation.rotationRange, [-25, 25]);
    }
  }

  renderProps();
  render();
}
function setProp(key, value) {
  const sel = getSelected();
  if (!sel) return;
  if (value === 'true') value = true;
  else if (value === 'false') value = false;
  const prevSpriteIndex = sel.spriteIndex;
  const prevInstanceIndex = sel.instanceIndex;
  if ((sel.type === 'Enemy' || sel.type === 'Macrophage') && key === 'radius') {
    const prevRadius = Math.max(0.0001, clampNum(sel.radius, 25));
    const nextRadius = Math.max(2, clampNum(value, prevRadius));
    const scale = nextRadius / prevRadius;
    const fallback = sel.type === 'Macrophage'
      ? makeDefaultMacrophageBodyCircles(prevRadius)
      : makeDefaultEnemyBodyCircles(prevRadius);
    sel.bodyCircles = (sel.bodyCircles?.length ? sel.bodyCircles : fallback).map(circle => ({
      dx: circle.dx * scale,
      dy: circle.dy * scale,
      r: Math.max(2, circle.r * scale)
    }));
    if (sel.type === 'Enemy') {
      sel.innerArtifacts = (sel.innerArtifacts ?? []).map(artifact => ({
        dx: artifact.dx * scale,
        dy: artifact.dy * scale,
        radius: Math.max(2, artifact.radius * scale),
        spriteIndex: artifact.spriteIndex
      }));
    } else if (sel.type === 'Macrophage') {
      scaleMacrophageMouthOffset(sel, prevRadius, nextRadius);
      scaleMacrophageDigestPath(sel, prevRadius, nextRadius);
      scaleMacrophageBodyRotation(sel, prevRadius, nextRadius);
    }
    sel.radius = nextRadius;
    clampEditorEntityInsideCanvas(sel);
    renderProps();
    render();
    return;
  }
  if (sel.type === 'ComposedStone' && key === 'radius') {
    const prevRadius = Math.max(0.0001, clampNum(sel.radius, 34));
    const nextRadius = Math.max(2, clampNum(value, prevRadius));
    const scale = nextRadius / prevRadius;
    sel.circles = (sel.circles?.length ? sel.circles : makeDefaultComposedStoneCircles(prevRadius)).map(circle => ({
      dx: circle.dx * scale,
      dy: circle.dy * scale,
      r: Math.max(2, circle.r * scale)
    }));
    sel.radius = nextRadius;
    clampEditorEntityInsideCanvas(sel);
    renderProps();
    render();
    return;
  }
  if (sel.type === 'Algae' && key === 'radius') {
    const prevRadius = Math.max(0.0001, clampNum(sel.radius, 30));
    const nextRadius = Math.max(2, clampNum(value, prevRadius));
    const scale = nextRadius / prevRadius;
    sel.circles = (sel.circles?.length ? sel.circles : makeDefaultAlgaeCircles(prevRadius)).map(circle => ({
      dx: circle.dx * scale,
      dy: circle.dy * scale,
      r: Math.max(2, circle.r * scale)
    }));
    sel.radius = nextRadius;
    sel.particleRadius = Math.max(0.5, (Number(sel.particleRadius ?? 3.4) || 3.4) * scale);
    clampEditorEntityInsideCanvas(sel);
    renderProps();
    render();
    return;
  }
  sel[key] = value;
  if (sel.type === 'Enemy') ensureEnemyDefaults(sel);
  if (sel.type === 'Macrophage') ensureMacrophageDefaults(sel);
  if (sel.type === 'ComposedStone') {
    syncComposedStoneSpriteSubfolder(sel, prevSpriteIndex, prevInstanceIndex);
    ensureComposedStoneDefaults(sel);
  }
  if (sel.type === 'Algae') {
    syncAlgaeSpriteSubfolder(sel, prevSpriteIndex, prevInstanceIndex);
    ensureAlgaeDefaults(sel);
  }
  if (sel.type === 'Player') ensurePlayerDefaults(sel);
  if (sel.type === 'Particle') ensureParticleDefaults(sel);
  if (sel.type === 'ParticleZone') ensureParticleZoneDefaults(sel);
  if (sel.type === 'Cyst') ensureCystDefaults(sel);
  render();
}

function formatCollisionNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '1';
  return parseFloat(num.toFixed(3)).toString();
}

function renderPlayerCollisionField(target, field, rule) {
  if (field.kind === 'boolean') {
    const enabled = rule[field.key] !== false;
    return `<div class="prop-row"><label>${field.label}</label><select data-action="player-collision-prop" data-target="${target.key}" data-key="${field.key}"><option value="true" ${enabled ? 'selected' : ''}>On</option><option value="false" ${!enabled ? 'selected' : ''}>Off</option></select></div>`;
  }

  return `<div class="prop-row"><label>${field.label}</label><input data-action="player-collision-prop" data-target="${target.key}" data-key="${field.key}" type="number" value="${formatCollisionNumber(rule[field.key])}" min="${field.min ?? 0}" max="${field.max ?? 9999}" step="${field.step ?? 0.01}"/></div>`;
}

function renderPlayerCollisionControls(sel) {
  ensurePlayerDefaults(sel);
  let html = '<div class="circle-section-header">Collisions</div>';

  for (const target of PLAYER_COLLISION_TARGETS) {
    const rule = sel.collisionProfile.byType[target.key] ?? {};
    html += `<div class="circle-row-header">${target.label}</div>`;
    for (const field of target.fields) {
      html += renderPlayerCollisionField(target, field, rule);
    }
  }

  return html;
}

function renderPlayerPropertyControls(sel, et) {
  ensurePlayerDefaults(sel);
  let html = renderPlayerCollisionControls(sel);
  html += '<div class="circle-section-header">Player Settings</div>';
  const allProps = [{ key:'radius', label:'Radius', type:'number', min:5, max:200 }, ...(et.props || []).filter(p => p.key !== 'radius')];
  allProps.forEach(prop => {
    const val = sel[prop.key] !== undefined ? sel[prop.key] : (prop.default ?? '');
    html += `<div class="prop-row"><label>${prop.label}</label><input data-action="set-prop" data-key="${prop.key}" type="${prop.type === 'number' ? 'number' : 'text'}" value="${val}" min="${prop.min ?? 0}" max="${prop.max ?? 9999}" step="${prop.step ?? 1}" placeholder="${prop.placeholder ?? ''}"/></div>`;
  });
  return html;
}

function setPlayerCollisionProp(targetKey, key, value) {
  const sel = getSelected();
  if (!sel || sel.type !== 'Player') return;
  const target = PLAYER_COLLISION_TARGETS.find(item => item.key === targetKey);
  const field = target?.fields.find(item => item.key === key);
  if (!target || !field) return;

  ensurePlayerDefaults(sel);
  const rule = sel.collisionProfile.byType[target.key] ?? {};

  if (field.kind === 'boolean') {
    rule[field.key] = value === true || value === 'true';
  } else {
    rule[field.key] = Math.max(
      field.min ?? 0,
      Math.min(field.max ?? 9999, clampNum(value, rule[field.key] ?? 1))
    );
  }

  sel.collisionProfile.byType[target.key] = rule;
  render();
}

function setCircleProp(circleIdx, key, value) {
  const sel = getSelected();
  if (!sel?.circles) return;
  sel.circles[circleIdx][key] = +value;
  if (circleIdx===0 && key==='r') sel.radius = +value;
  clampEditorEntityInsideCanvas(sel);
  render();
}
function scaleMacrophageMouthOffset(entity, prevRadius, nextRadius) {
  if (!entity || entity.type !== 'Macrophage') return;
  ensureMacrophageDefaults(entity);
  const from = Math.max(0.0001, clampNum(prevRadius, entity.radius));
  const to = Math.max(0, clampNum(nextRadius, entity.radius));
  const scale = to / from;
  entity.mouth.offsetDistance = Math.max(0, entity.mouth.offsetDistance * scale);
  entity.mouth.absorbRadius = Math.max(2, entity.mouth.absorbRadius * scale);
  entity.mouthOffsetDistance = entity.mouth.offsetDistance;
  entity.mouthAbsorbRadius = entity.mouth.absorbRadius;
}
function scaleMacrophageBodyRotation(entity, prevRadius, nextRadius) {
  if (!entity || entity.type !== 'Macrophage') return;
  ensureMacrophageDefaults(entity);
  const from = Math.max(0.0001, clampNum(prevRadius, entity.radius));
  const to = Math.max(0, clampNum(nextRadius, entity.radius));
  const scale = to / from;
  entity.bodyRotation.pivotDx *= scale;
  entity.bodyRotation.pivotDy *= scale;
  entity.bodyRotation.pivotRadius = Math.max(4, entity.bodyRotation.pivotRadius * scale);
}
function scaleMacrophageBody(entity, prevRadius, nextRadius) {
  if (!entity || entity.type !== 'Macrophage') return;
  ensureMacrophageDefaults(entity);
  const from = Math.max(0.0001, clampNum(prevRadius, entity.radius));
  const to = Math.max(2, clampNum(nextRadius, entity.radius));
  const scale = to / from;
  entity.bodyCircles = (entity.bodyCircles ?? []).map(circle => ({
    dx: circle.dx * scale,
    dy: circle.dy * scale,
    r: Math.max(2, circle.r * scale)
  }));
  entity.radius = to;
  entity.gitParticleRadius = Math.max(0.4, (entity.gitParticleRadius ?? (from / 8)) * scale);
  scaleMacrophageMouthOffset(entity, from, to);
  scaleMacrophageDigestPath(entity, from, to);
  scaleMacrophageBodyRotation(entity, from, to);
}

function scaleEnemyBody(entity, prevRadius, nextRadius) {
  if (!entity || entity.type !== 'Enemy') return;
  ensureEnemyDefaults(entity);
  const from = Math.max(0.0001, clampNum(prevRadius, entity.radius));
  const to = Math.max(2, clampNum(nextRadius, entity.radius));
  const scale = to / from;
  entity.bodyCircles = (entity.bodyCircles ?? []).map(circle => ({
    dx: circle.dx * scale,
    dy: circle.dy * scale,
    r: Math.max(2, circle.r * scale)
  }));
  entity.innerArtifacts = (entity.innerArtifacts ?? []).map(artifact => ({
    ...artifact,
    dx: artifact.dx * scale,
    dy: artifact.dy * scale,
    radius: Math.max(2, artifact.radius * scale)
  }));
  entity.radius = to;
}
function scaleMacrophageDigestPath(entity, prevRadius, nextRadius) {
  if (!entity || entity.type !== 'Macrophage' || !entity.digestPath) return;
  const from = Math.max(0.0001, clampNum(prevRadius, entity.radius));
  const to = Math.max(0, clampNum(nextRadius, entity.radius));
  const scale = to / from;
  for (const key of getMacrophageDigestPathPointKeys(entity.digestPath)) {
    if (!entity.digestPath[key]) continue;
    entity.digestPath[key].dx *= scale;
    entity.digestPath[key].dy *= scale;
  }
}
function setMacrophageEggSpawnProp(key, value) {
  const sel = getSelected();
  if (!sel || sel.type !== 'Macrophage') return;
  ensureMacrophageDefaults(sel);
  sel.eggSpawn[key] = key === 'feedCount' || key === 'bodyCircleIndex'
    ? Math.round(+value)
    : +value;
  ensureMacrophageDefaults(sel);
  renderProps();
  render();
}

function setMacrophageGerminationProp(key, value) {
  const sel = getSelected();
  if (!sel || sel.type !== 'Macrophage') return;
  ensureMacrophageDefaults(sel);
  sel.germination[key] = key === 'enabled' || key === 'mirrorOffspringX'
    ? !!value
    : (key === 'feedCount' || key === 'bodyCircleIndex'
        ? Math.round(+value)
        : +value);
  ensureMacrophageDefaults(sel);
  renderProps();
  render();
}

function setAlgaeGerminationProp(key, value) {
  const sel = getSelected();
  if (!sel || sel.type !== 'Algae') return;
  ensureAlgaeDefaults(sel);
  sel.germination[key] = key === 'enabled' || key === 'mirrorOffspringX'
    ? !!value
    : (key === 'feedCount' || key === 'bodyCircleIndex'
        ? Math.round(+value)
        : +value);
  ensureAlgaeDefaults(sel);
  renderProps();
  render();
}

function setMacrophageProjectileSpawnProp(key, value) {
  const sel = getSelected();
  if (!sel || sel.type !== 'Macrophage') return;
  ensureMacrophageDefaults(sel);
  sel.projectileSpawn[key] = key === 'bodyCircleIndex'
    ? Math.round(+value)
    : +value;
  ensureMacrophageDefaults(sel);
  renderProps();
  render();
}

function setMacrophageGrowthProp(key, value) {
  const sel = getSelected();
  if (!sel || sel.type !== 'Macrophage') return;
  ensureMacrophageDefaults(sel);
  sel.growth[key] = key === 'enabled' ? !!value : +value;
  ensureMacrophageDefaults(sel);
  renderProps();
  render();
}

function setEnemyBodyCircleProp(circleIdx, key, value) {
  const sel = getSelected();
  if (!sel || !hasBodyCircleEditor(sel) || !sel.bodyCircles?.[circleIdx]) return;
  const prevRadius = Math.max(0.0001, sel.radius);
  if (sel.type === 'Enemy' && circleIdx === 0 && key === 'r') {
    scaleEnemyBody(sel, prevRadius, Math.max(2, +value));
    ensureEnemyDefaults(sel);
    clampEditorEntityInsideCanvas(sel);
    render();
    return;
  }
  if (sel.type === 'Macrophage' && circleIdx === 0 && key === 'r') {
    scaleMacrophageBody(sel, prevRadius, Math.max(2, +value));
    ensureMacrophageDefaults(sel);
    clampEditorEntityInsideCanvas(sel);
    render();
    return;
  }
  sel.bodyCircles[circleIdx][key] = +value;
  if (circleIdx === 0 && key === 'r') {
    sel.radius = Math.max(2, +value);
    if (sel.type === 'Macrophage') {
      scaleMacrophageMouthOffset(sel, prevRadius, sel.radius);
      scaleMacrophageDigestPath(sel, prevRadius, sel.radius);
    }
  }
  if (sel.type === 'Enemy') ensureEnemyDefaults(sel);
  if (sel.type === 'Macrophage') ensureMacrophageDefaults(sel);
  clampEditorEntityInsideCanvas(sel);
  render();
}
function addEnemyBodyCircle() {
  const sel = getSelected();
  if (!sel || !hasBodyCircleEditor(sel)) return;
  if (sel.type === 'Enemy') ensureEnemyDefaults(sel);
  if (sel.type === 'Macrophage') ensureMacrophageDefaults(sel);
  const last = sel.bodyCircles.at(-1) ?? { dx: 0, dy: 0, r: sel.radius };
  const prev = sel.bodyCircles.length >= 2 ? sel.bodyCircles.at(-2) : { dx: 0, dy: 0, r: sel.radius };
  sel.bodyCircles.push({
    dx: sel.type === 'Macrophage'
      ? Math.round(last.dx + (last.dx - prev.dx) * 0.55 + (sel.bodyCircles.length % 2 === 0 ? -sel.radius * 0.18 : sel.radius * 0.18))
      : Math.round(last.dx + (last.dx - prev.dx) * 0.65 + sel.radius * 0.2),
    dy: sel.type === 'Macrophage'
      ? Math.round(last.dy + Math.max(sel.radius * 0.18, (last.dy - prev.dy) * 0.55))
      : Math.round(last.dy + (last.dy - prev.dy) * 0.35),
    r: Math.max(5, Math.round(last.r * 0.6))
  });
  renderProps();
  render();
}
function removeEnemyBodyCircle() {
  const sel = getSelected();
  if (!sel || !hasBodyCircleEditor(sel) || !sel.bodyCircles || sel.bodyCircles.length <= 1) return;
  sel.bodyCircles.pop();
  if (sel.type === 'Enemy') ensureEnemyDefaults(sel);
  if (sel.type === 'Macrophage') ensureMacrophageDefaults(sel);
  renderProps();
  render();
}
function setInnerArtifactProp(artifactIdx, key, value) {
  const sel = getSelected();
  if (!sel || sel.type !== 'Stone' || !sel.innerArtifacts?.[artifactIdx]) return;
  sel.innerArtifacts[artifactIdx][key] = key === 'spriteIndex' ? normalizeSpriteIndex(value, 1) : +value;
  render();
}
function setEnemyInnerArtifactProp(artifactIdx, key, value) {
  const sel = getSelected();
  if (!sel || sel.type !== 'Enemy' || !sel.innerArtifacts?.[artifactIdx]) return;
  sel.innerArtifacts[artifactIdx][key] = key === 'spriteIndex'
    ? Math.min(ENEMY_SPRITE_INDEX_MAX, normalizeSpriteIndex(value, 1))
    : +value;
  render();
}
function addStoneInnerArtifact() {
  const sel = getSelected();
  if (!sel || sel.type !== 'Stone') return;
  sel.innerArtifacts ??= [];
  sel.innerArtifacts.push(makeDefaultStoneInnerArtifact(sel.radius));
  renderProps();
  render();
}
function addEnemyInnerArtifact() {
  const sel = getSelected();
  if (!sel || sel.type !== 'Enemy') return;
  sel.innerArtifacts ??= [];
  sel.innerArtifacts.push(makeDefaultEnemyInnerArtifact(sel.radius));
  renderProps();
  render();
}
function removeStoneInnerArtifact(idx) {
  const sel = getSelected();
  if (!sel || sel.type !== 'Stone' || !sel.innerArtifacts?.[idx]) return;
  sel.innerArtifacts.splice(idx, 1);
  renderProps();
  render();
}
function removeEnemyInnerArtifact(idx) {
  const sel = getSelected();
  if (!sel || sel.type !== 'Enemy' || !sel.innerArtifacts?.[idx]) return;
  sel.innerArtifacts.splice(idx, 1);
  renderProps();
  render();
}
function addStentorCircle() { const sel = getSelected(); if (!sel?.circles) return; const last = sel.circles.at(-1); const prev = sel.circles.length >= 2 ? sel.circles.at(-2) : { dx:0, dy:0, r:sel.radius }; sel.circles.push({ dx: Math.round(last.dx + (last.dx-prev.dx)*0.65), dy: Math.round(last.dy + (last.dy-prev.dy)*0.65), r: Math.max(5, Math.round(last.r*0.6)) }); renderProps(); render(); }
function getMinCircleCount(sel) { return sel?.type === 'Stentor' ? 2 : 1; }
function removeLastStentorCircle() { const sel = getSelected(); if (!sel?.circles || sel.circles.length <= getMinCircleCount(sel)) return; sel.circles.pop(); renderProps(); render(); }
function setStentorMouthProp(key, value) { const sel = getSelected(); if (!sel || sel.type !== 'Stentor') return; ensureStentorDefaults(sel); sel.mouth[key] = value; render(); }
function setStentorMouthRange(i,v) { const sel = getSelected(); if (!sel || sel.type !== 'Stentor') return; ensureStentorDefaults(sel); sel.mouth.rotationRange[i] = +v; render(); }
function setStentorBodyRotationProp(key, value) { const sel = getSelected(); if (!sel || sel.type !== 'Stentor') return; ensureStentorDefaults(sel); sel.bodyRotation[key] = value; render(); }
function setStentorBodyRotationRange(i,v) { const sel = getSelected(); if (!sel || sel.type !== 'Stentor') return; ensureStentorDefaults(sel); sel.bodyRotation.rotationRange[i] = +v; render(); }
function setMacrophageMouthProp(key, value) {
  const sel = getSelected();
  if (!sel || sel.type !== 'Macrophage') return;
  ensureMacrophageDefaults(sel);
  sel.mouth[key] = value;
  ensureMacrophageDefaults(sel);
  renderProps();
  render();
}
function setMacrophageMouthRange(i, v) {
  const sel = getSelected();
  if (!sel || sel.type !== 'Macrophage') return;
  ensureMacrophageDefaults(sel);
  const next = clampNum(v, sel.mouth.rotationRange[i]);
  if (i === 0) sel.mouth.rotationRange[0] = Math.min(next, sel.mouth.rotationRange[1]);
  else sel.mouth.rotationRange[1] = Math.max(next, sel.mouth.rotationRange[0]);
  ensureMacrophageDefaults(sel);
  renderProps();
  render();
}
function setMacrophageMouthCiliaProp(key, value) {
  const sel = getSelected();
  if (!sel || sel.type !== 'Macrophage') return;
  ensureMacrophageDefaults(sel);
  if (key === 'arcCenterDeg') value = normalizeSignedDeg(clampNum(value, 0));
  if (key === 'arcSpreadDeg') value = Math.max(0, Math.min(360, clampNum(value, 120)));
  sel.mouth.cilia[key] = value;
  ensureMacrophageDefaults(sel);
  renderProps();
  render();
}
function setMacrophageBodyCiliaProp(key, value) {
  const sel = getSelected();
  if (!sel || sel.type !== 'Macrophage') return;
  ensureMacrophageDefaults(sel);
  sel.bodyCilia[key] = value;
  ensureMacrophageDefaults(sel);
  renderProps();
  render();
}
function setMacrophageBodyCiliaSegmentProp(idx, key, value) {
  const sel = getSelected();
  if (!sel || sel.type !== 'Macrophage') return;
  ensureMacrophageDefaults(sel);
  const segment = sel.bodyCilia.segments[idx];
  if (!segment) return;
  segment[key] = key === 'enabled' ? value : Math.max(0, Math.min(1, clampNum(value, segment[key] ?? 0)));
  ensureMacrophageDefaults(sel);
  renderProps();
  render();
}
function addMacrophageBodyCiliaSegment() {
  const sel = getSelected();
  if (!sel || sel.type !== 'Macrophage') return;
  ensureMacrophageDefaults(sel);
  const count = sel.bodyCilia.segments.length;
  const start = (count * 0.18) % 1;
  sel.bodyCilia.segments.push({ enabled: true, start, end: Math.min(1, start + 0.18) });
  ensureMacrophageDefaults(sel);
  renderProps();
  render();
}
function removeMacrophageBodyCiliaSegment() {
  const sel = getSelected();
  if (!sel || sel.type !== 'Macrophage') return;
  ensureMacrophageDefaults(sel);
  if (sel.bodyCilia.segments.length <= 1) return;
  sel.bodyCilia.segments.pop();
  renderProps();
  render();
}
function setMacrophageBodyRotationProp(key, value) {
  const sel = getSelected();
  if (!sel || sel.type !== 'Macrophage') return;
  ensureMacrophageDefaults(sel);
  if (key === 'baseAngleDeg') value = normalizeSignedDeg(clampNum(value, 0));
  if (key === 'rotationMode') value = value === 'loop' ? 'loop' : 'pingpong';
  sel.bodyRotation[key] = value;
  ensureMacrophageDefaults(sel);
  renderProps();
  render();
}
function setMacrophageBodyIdleWaveProp(key, value) {
  const sel = getSelected();
  if (!sel || sel.type !== 'Macrophage') return;
  ensureMacrophageDefaults(sel);
  if (!sel.bodyRotation.idleWave || typeof sel.bodyRotation.idleWave !== 'object') {
    sel.bodyRotation.idleWave = { ...makeDefaultMacrophageBodyRotation().idleWave };
  }
  sel.bodyRotation.idleWave[key] = value;
  ensureMacrophageDefaults(sel);
  renderProps();
  render();
}
function setMacrophageBodyFollowProp(key, value) {
  const sel = getSelected();
  if (!sel || sel.type !== 'Macrophage') return;
  ensureMacrophageDefaults(sel);
  if (!sel.bodyRotation.movementFollow || typeof sel.bodyRotation.movementFollow !== 'object') {
    sel.bodyRotation.movementFollow = { ...makeDefaultMacrophageBodyRotation().movementFollow };
  }
  sel.bodyRotation.movementFollow[key] = value;
  ensureMacrophageDefaults(sel);
  renderProps();
  render();
}
function setMacrophageBodyRotationRange(i, v) {
  const sel = getSelected();
  if (!sel || sel.type !== 'Macrophage') return;
  ensureMacrophageDefaults(sel);
  const next = clampNum(v, sel.bodyRotation.rotationRange[i]);
  if (i === 0) sel.bodyRotation.rotationRange[0] = Math.min(next, sel.bodyRotation.rotationRange[1]);
  else sel.bodyRotation.rotationRange[1] = Math.max(next, sel.bodyRotation.rotationRange[0]);
  ensureMacrophageDefaults(sel);
  renderProps();
  render();
}
function setMacrophageOrbitProp(key, value) {
  const sel = getSelected();
  if (!sel || sel.type !== 'Macrophage') return;
  ensureMacrophageDefaults(sel);
  sel.orbit[key] = value;
  ensureMacrophageDefaults(sel);
  renderProps();
  render();
}

function addMacrophageOrbitSplinePoint() {
  const sel = getSelected();
  if (!sel || sel.type !== 'Macrophage') return;
  ensureMacrophageDefaults(sel);
  sel.orbit.mode = 'spline';
  const points = Array.isArray(sel.orbit.splinePoints) ? sel.orbit.splinePoints : [];
  if (points.length < 2) {
    sel.orbit.splinePoints = makeDefaultMacrophageOrbitSplinePoints(Math.max(sel.orbit.radius, sel.radius * 2.4, 80));
    setSelectedMacrophageOrbitSplinePointIndex(sel, sel.orbit.splinePoints.length - 1);
    renderProps();
    render();
    return;
  }
  const selectedIdx = getSelectedMacrophageOrbitSplinePointIndex(sel);
  const current = points[selectedIdx] ?? points[0];
  const next = points[(selectedIdx + 1) % points.length] ?? current;
  points.splice(selectedIdx + 1, 0, {
    dx: (current.dx + next.dx) * 0.5,
    dy: (current.dy + next.dy) * 0.5
  });
  setSelectedMacrophageOrbitSplinePointIndex(sel, selectedIdx + 1);
  renderProps();
  render();
}

function removeMacrophageOrbitSplinePoint() {
  const sel = getSelected();
  if (!sel || sel.type !== 'Macrophage') return;
  ensureMacrophageDefaults(sel);
  if (!Array.isArray(sel.orbit.splinePoints) || sel.orbit.splinePoints.length <= 4) return;
  const selectedIdx = getSelectedMacrophageOrbitSplinePointIndex(sel);
  sel.orbit.splinePoints.splice(selectedIdx, 1);
  setSelectedMacrophageOrbitSplinePointIndex(sel, Math.max(0, selectedIdx - 1));
  renderProps();
  render();
}

function switchMacrophageOrbitSplineMode() {
  const sel = getSelected();
  if (!sel || sel.type !== 'Macrophage') return;
  ensureMacrophageDefaults(sel);
  sel.orbit.mode = 'spline';
  sel.orbit.enabled = true;
  if (!Array.isArray(sel.orbit.splinePoints) || sel.orbit.splinePoints.length <= 2) {
    sel.orbit.splinePoints = makeDefaultMacrophageOrbitSplinePoints(Math.max(sel.orbit.radius, sel.radius * 2.4, 80));
  }
  setSelectedMacrophageOrbitSplinePointIndex(sel, 0);
  renderProps();
  render();
}

function addMacrophageDigestControlPoint() {
  const sel = getSelected();
  if (!sel || sel.type !== 'Macrophage') return;
  ensureMacrophageDefaults(sel);
  const controlKeys = getMacrophageDigestControlKeys(sel.digestPath);
  const lastControlKey = controlKeys.at(-1) ?? 'c2';
  const nextIndex = Math.max(1, ...controlKeys.map(key => Number(key.slice(1)) || 0)) + 1;
  const prevPoint = sel.digestPath[lastControlKey] ?? sel.digestPath.start;
  const endPoint = sel.digestPath.end ?? prevPoint;
  sel.digestPath[`c${nextIndex}`] = {
    dx: (prevPoint.dx + endPoint.dx) * 0.5,
    dy: (prevPoint.dy + endPoint.dy) * 0.5
  };
  ensureMacrophageDefaults(sel);
  renderProps();
  render();
}

function removeMacrophageDigestControlPoint() {
  const sel = getSelected();
  if (!sel || sel.type !== 'Macrophage') return;
  ensureMacrophageDefaults(sel);
  const controlKeys = getMacrophageDigestControlKeys(sel.digestPath);
  if (controlKeys.length <= 2) return;
  delete sel.digestPath[controlKeys.at(-1)];
  ensureMacrophageDefaults(sel);
  renderProps();
  render();
}

function setMacrophageOrbitSegmentProp(idx, key, value) {
  const sel = getSelected();
  if (!sel || sel.type !== 'Macrophage') return;
  ensureMacrophageDefaults(sel);
  if (!Array.isArray(sel.orbit.segments) || !sel.orbit.segments[idx]) return;
  setSelectedMacrophageOrbitSegmentIndex(sel, idx);
  sel.orbit.segments[idx][key] = value;
  sel.orbit.segments[idx] = makeDefaultMacrophageOrbitSegment(sel.orbit.segments[idx]);
  renderProps();
  render();
}

function setMacrophageOrbitSplinePointProp(idx, key, value) {
  const sel = getSelected();
  if (!sel || sel.type !== 'Macrophage') return;
  ensureMacrophageDefaults(sel);
  if (!Array.isArray(sel.orbit.splinePoints) || !sel.orbit.splinePoints[idx]) return;
  setSelectedMacrophageOrbitSplinePointIndex(sel, idx);
  sel.orbit.splinePoints[idx][key] = value;
  renderProps();
  render();
}

function addMacrophageOrbitSegment() {
  const sel = getSelected();
  if (!sel || sel.type !== 'Macrophage') return;
  ensureMacrophageDefaults(sel);
  const last = sel.orbit.segments[sel.orbit.segments.length - 1];
  sel.orbit.segments.push(makeDefaultMacrophageOrbitSegment(last ? {
    ...last,
    startDeg: last.endDeg,
    endDeg: last.endDeg + 120
  } : {
    centerDx: sel.orbit.centerDx,
    centerDy: sel.orbit.centerDy,
    radius: Math.max(sel.orbit.radius, sel.radius * 2.4),
    startDeg: 0,
    endDeg: 120,
    speed: sel.orbit.speed
  }));
  setSelectedMacrophageOrbitSegmentIndex(sel, sel.orbit.segments.length - 1);
  renderProps();
  render();
}

function removeMacrophageOrbitSegment() {
  const sel = getSelected();
  if (!sel || sel.type !== 'Macrophage') return;
  ensureMacrophageDefaults(sel);
  sel.orbit.segments.pop();
  setSelectedMacrophageOrbitSegmentIndex(sel, sel.orbit.segments.length - 1);
  renderProps();
  render();
}

function switchMacrophageOrbitMode(useSegments) {
  const sel = getSelected();
  if (!sel || sel.type !== 'Macrophage') return;
  ensureMacrophageDefaults(sel);
  if (useSegments) {
    sel.orbit.mode = 'segments';
    sel.orbit.enabled = true;
    if (!Array.isArray(sel.orbit.segments) || sel.orbit.segments.length === 0) {
      sel.orbit.segments = [makeDefaultMacrophageOrbitSegment({
        centerDx: sel.orbit.centerDx,
        centerDy: sel.orbit.centerDy,
        radius: sel.orbit.radius,
        startDeg: 0,
        endDeg: 180,
        speed: sel.orbit.speed
      })];
    }
    setSelectedMacrophageOrbitSegmentIndex(sel, 0);
  } else {
    sel.orbit.mode = 'orbit';
    sel.orbit.enabled = true;
    sel.orbit.segments = [];
    selectedMacrophageOrbitSegmentIdx = 0;
  }
  renderProps();
  render();
}

function buildMacrophageOvoidOrbitSegments(sel) {
  const baseRadius = Math.max(sel.orbit?.radius ?? 0, sel.radius * 2.8, 60);
  const width = baseRadius * 2.1;
  const height = baseRadius * 1.5;
  const speed = clampNum(sel.orbit?.speed, 0.01);

  return [
    makeDefaultMacrophageOrbitSegment({
      centerDx: 0,
      centerDy: -height * 0.34,
      radius: width * 0.56,
      startDeg: 202,
      endDeg: 338,
      speed
    }),
    makeDefaultMacrophageOrbitSegment({
      centerDx: width * 0.39,
      centerDy: 0,
      radius: height * 0.58,
      startDeg: -112,
      endDeg: 72,
      speed
    }),
    makeDefaultMacrophageOrbitSegment({
      centerDx: 0,
      centerDy: height * 0.28,
      radius: width * 0.7,
      startDeg: 18,
      endDeg: 162,
      speed
    }),
    makeDefaultMacrophageOrbitSegment({
      centerDx: -width * 0.36,
      centerDy: 0,
      radius: height * 0.64,
      startDeg: 108,
      endDeg: 252,
      speed
    })
  ];
}

function makeMacrophageOrbitOvoid() {
  const sel = getSelected();
  if (!sel || sel.type !== 'Macrophage') return;
  ensureMacrophageDefaults(sel);
  sel.orbit.mode = 'spline';
  sel.orbit.enabled = true;
  sel.orbit.splinePoints = [
    { dx: 0, dy: -sel.radius * 2.1 },
    { dx: sel.radius * 2.5, dy: -sel.radius * 0.6 },
    { dx: sel.radius * 2.1, dy: sel.radius * 1.3 },
    { dx: 0, dy: sel.radius * 2.2 },
    { dx: -sel.radius * 2.4, dy: sel.radius * 1.2 },
    { dx: -sel.radius * 2.0, dy: -sel.radius * 0.8 }
  ];
  sel.orbit.loop = true;
  setSelectedMacrophageOrbitSplinePointIndex(sel, 0);
  renderProps();
  render();
}

function setMacrophageFreeMoveProp(key, value) {
  const sel = getSelected();
  if (!sel || sel.type !== 'Macrophage') return;
  ensureMacrophageDefaults(sel);
  sel.orbit.freeMove[key] = value;
  sel.orbit.freeMove = makeDefaultMacrophageFreeMove(sel.orbit.freeMove);
  renderProps();
  render();
}

function setMacrophageMovementMode(mode) {
  const sel = getSelected();
  if (!sel || sel.type !== 'Macrophage') return;
  ensureMacrophageDefaults(sel);
  sel.orbit.mode = ['orbit', 'segments', 'spline', 'free'].includes(mode) ? mode : 'orbit';
  sel.orbit.enabled = true;
  if (sel.orbit.mode === 'spline' && (!Array.isArray(sel.orbit.splinePoints) || sel.orbit.splinePoints.length <= 2)) {
    switchMacrophageOrbitSplineMode();
    return;
  }
  if (sel.orbit.mode === 'segments' && (!Array.isArray(sel.orbit.segments) || sel.orbit.segments.length === 0)) {
    switchMacrophageOrbitMode(true);
    return;
  }
  renderProps();
  render();
}

function setMacrophageAbsorbTargetProp(key, value) {
  const sel = getSelected();
  if (!sel || sel.type !== 'Macrophage') return;
  ensureMacrophageDefaults(sel);
  sel.absorbTargets[key] = !!value;
  ensureMacrophageDefaults(sel);
  renderProps();
  render();
}

function getPropsFocusState() {
  const active = document.activeElement;
  if (!active || !propsPanel.contains(active)) {
    return {
      scrollTop: propsPanel.scrollTop
    };
  }

  return {
    scrollTop: propsPanel.scrollTop,
    tagName: active.tagName,
    action: active.dataset.action ?? '',
    key: active.dataset.key ?? '',
    idx: active.dataset.idx ?? '',
    inputType: active.type ?? '',
    selectionStart: typeof active.selectionStart === 'number' ? active.selectionStart : null,
    selectionEnd: typeof active.selectionEnd === 'number' ? active.selectionEnd : null
  };
}

function restorePropsFocusState(state) {
  if (!state) return;
  propsPanel.scrollTop = state.scrollTop ?? 0;
  if (!state.action) return;

  const selector = [
    state.tagName ? state.tagName.toLowerCase() : '',
    `[data-action="${state.action}"]`,
    state.key !== '' ? `[data-key="${state.key}"]` : '',
    state.idx !== '' ? `[data-idx="${state.idx}"]` : ''
  ].join('');

  const next = propsPanel.querySelector(selector);
  if (!next) return;

  next.focus({ preventScroll: true });
  if (
    typeof next.setSelectionRange === 'function' &&
    state.selectionStart != null &&
    state.selectionEnd != null &&
    (next.tagName === 'INPUT' || next.tagName === 'TEXTAREA') &&
    !['number'].includes((state.inputType || '').toLowerCase())
  ) {
    next.setSelectionRange(state.selectionStart, state.selectionEnd);
  }
}

function formatPropSliderValue(value, step) {
  const num = Number(value);
  const stepNum = Number(step);
  if (!Number.isFinite(num)) return '0';
  if (!Number.isFinite(stepNum) || stepNum >= 1) return String(Math.round(num));
  const stepText = String(step ?? '');
  const decimals = stepText.includes('.') ? stepText.split('.')[1].length : 3;
  return num.toFixed(Math.min(4, decimals));
}

function clampSliderValue(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return Number.isFinite(min) ? min : 0;
  return Math.max(min, Math.min(max, num));
}

function roundToStep(value, step) {
  const stepNum = Number(step);
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  if (!Number.isFinite(stepNum) || stepNum <= 0) return num;
  const rounded = Math.round(num / stepNum) * stepNum;
  const stepText = String(step ?? '');
  const decimals = stepText.includes('.') ? stepText.split('.')[1].length : 0;
  return Number(rounded.toFixed(Math.min(6, decimals + 1)));
}

function getWheelStep(input, event) {
  const baseStep = Number(input?.step || input?.getAttribute?.('step') || 1);
  let step = Number.isFinite(baseStep) && baseStep > 0 ? baseStep : 1;
  if (event.shiftKey) step *= 10;
  if (event.altKey || event.ctrlKey || event.metaKey) step *= 0.1;
  return step;
}

function applyNumericWheel(input, event) {
  if (!input || input.disabled) return false;
  const type = String(input.type || '').toLowerCase();
  if (type !== 'number' && type !== 'range') return false;

  const min = Number(input.min);
  const max = Number(input.max);
  const safeMin = Number.isFinite(min) ? min : -Infinity;
  const safeMax = Number.isFinite(max) ? max : Infinity;
  const current = Number(input.value || 0);
  const dir = event.deltaY < 0 ? 1 : -1;
  const step = getWheelStep(input, event);
  const next = roundToStep(clampSliderValue(current + dir * step, safeMin, safeMax), input.step || step);

  if (!Number.isFinite(next) || next === current) return false;
  event.preventDefault();
  input.value = String(next);
  input.title = formatPropSliderValue(input.value, input.step);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function inferPropSliderBounds(input, labelText = '') {
  const current = Number(input.value);
  const attrMin = input.getAttribute('min');
  const attrMax = input.getAttribute('max');
  const attrStep = input.getAttribute('step');
  const explicitMin = attrMin != null ? Number(attrMin) : null;
  const explicitMax = attrMax != null ? Number(attrMax) : null;
  const step = Number(attrStep || 1);
  const key = String(input.dataset.key || '').toLowerCase();
  const label = String(labelText || '').toLowerCase();
  let min = Number.isFinite(explicitMin) ? explicitMin : null;
  let max = Number.isFinite(explicitMax) ? explicitMax : null;

  if (min == null || max == null) {
    const axisRange = Math.max(canvas.width, canvas.height);
    if (key === 'dx' || key === 'dy' || key.endsWith('dx') || key.endsWith('dy') || label.includes('offset')) {
      const span = Math.min(
        Math.max(160, Math.ceil((Math.abs(current || 0) + 96) / 20) * 20),
        Math.max(320, axisRange)
      );
      min ??= -span;
      max ??= span;
    } else if (label.includes('angle') || label.includes('°')) {
      min ??= -360;
      max ??= 360;
    } else if (key.includes('radius') || label.includes('radius')) {
      min ??= 0;
      max ??= Math.min(Math.max(320, Math.abs(current || 0) * 3), axisRange);
    } else if (Number.isFinite(current)) {
      const span = Math.max(Math.abs(current) * 2, step < 1 ? 1 : 20);
      min ??= current - span;
      max ??= current + span;
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return null;
  if (current < min) min = current;
  if (current > max) max = current;
  const range = Math.abs(max - min);
  if (range > 5000) return null;
  return { min, max, step: Number.isFinite(step) && step > 0 ? step : 1 };
}

function updatePropRangeFill(input) {
  if (!input || input.type !== 'range') return;
  const min = Number(input.min || 0);
  const max = Number(input.max || 1);
  const value = Number(input.value || min);
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
  input.style.setProperty('--range-pct', `${Math.max(0, Math.min(100, pct))}%`);
}

function getPropSectionStateKey(sel, title) {
  const type = sel?.type || 'none';
  return `${type}::${String(title || '').trim().toLowerCase()}`;
}

function enhanceCollapsibleSections(sel) {
  const headers = Array.from(propsPanel.querySelectorAll('.circle-section-header'));
  headers.forEach((header, index) => {
    const title = header.textContent.trim();
    const sectionKey = getPropSectionStateKey(sel, title);
    let content = header.nextElementSibling;
    if (!content || !content.classList.contains('circle-section-content')) {
      content = document.createElement('div');
      content.className = 'circle-section-content';
      let sibling = header.nextSibling;
      while (sibling && !(sibling.nodeType === 1 && sibling.classList?.contains('circle-section-header'))) {
        const nextSibling = sibling.nextSibling;
        content.appendChild(sibling);
        sibling = nextSibling;
      }
      header.parentNode.insertBefore(content, sibling);
    }

    const collapsed = collapsedPropSections.has(sectionKey)
      ? collapsedPropSections.get(sectionKey)
      : (sel?.type === 'Player' ? false : index !== 0);

    header.dataset.sectionKey = sectionKey;
    header.classList.toggle('collapsed', collapsed);
    content.classList.toggle('collapsed', collapsed);
    header.addEventListener('click', () => {
      const nextState = !header.classList.contains('collapsed');
      header.classList.toggle('collapsed', nextState);
      content.classList.toggle('collapsed', nextState);
      collapsedPropSections.set(sectionKey, nextState);
    });
  });
}

function enhancePropertyControls() {
  const boolSelects = Array.from(propsPanel.querySelectorAll('select')).filter(select => {
    const values = Array.from(select.options).map(option => option.value);
    return values.length === 2 && values.includes('true') && values.includes('false');
  });

  boolSelects.forEach(select => {
    if (select.dataset.enhanced === 'true') return;
    select.dataset.enhanced = 'true';
    const current = select.value === 'true';
    const host = document.createElement('div');
    const toggle = document.createElement('div');
    toggle.className = 'prop-bool-toggle';

    const makeButton = (value, label) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `prop-bool-btn ${current === value ? 'on' : ''}`;
      btn.textContent = label;
      btn.dataset.action = select.dataset.action || '';
      if (select.dataset.key) btn.dataset.key = select.dataset.key;
      if (select.dataset.idx) btn.dataset.idx = select.dataset.idx;
      btn.dataset.value = value ? 'true' : 'false';
      btn.addEventListener('click', () => {
        select.value = value ? 'true' : 'false';
        toggle.querySelectorAll('.prop-bool-btn').forEach(el => el.classList.toggle('on', el.dataset.value === select.value));
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      return btn;
    };

    toggle.append(makeButton(true, 'ON'), makeButton(false, 'OFF'));
    select.style.display = 'none';
    select.replaceWith(host);
    host.append(toggle, select);
  });

  const numberInputs = Array.from(propsPanel.querySelectorAll('input[type="number"]'));
  numberInputs.forEach(input => {
    if (input.dataset.wheelEnhanced !== 'true') {
      input.dataset.wheelEnhanced = 'true';
      input.title = input.title || 'Mouse wheel adjusts value. Shift = coarse, Alt/Ctrl = fine.';
      input.addEventListener('wheel', e => applyNumericWheel(input, e), { passive: false });
    }

    if (input.closest('.prop-slider')) return;
    const key = String(input.dataset.key || '');
    if (['instanceIndex', 'spriteIndex', 'spriteAnimationFrames', 'spriteAnimationStart', 'bodyCircleIndex', 'feedCount'].includes(key)) return;
    const labelText = input.closest('.prop-row')?.querySelector('label')?.textContent || '';
    const bounds = inferPropSliderBounds(input, labelText);
    if (!bounds) return;
    if (Math.abs(bounds.max - bounds.min) > 20000) return;

    const range = input.cloneNode(false);
    range.type = 'range';
    range.className = 'prop-range';
    range.min = String(bounds.min);
    range.max = String(bounds.max);
    range.step = String(bounds.step);
    range.value = input.value;
    range.title = formatPropSliderValue(range.value, range.step);
    range.addEventListener('wheel', e => applyNumericWheel(range, e), { passive: false });

    input.classList.add('prop-slider-number');
    input.min = String(bounds.min);
    input.max = String(bounds.max);
    input.step = String(bounds.step);
    input.setAttribute('aria-label', labelText || key || 'value');
    input.title = `${formatPropSliderValue(input.value, input.step)} | Mouse wheel adjusts value. Shift = coarse, Alt/Ctrl = fine.`;

    const wrap = document.createElement('div');
    wrap.className = 'prop-slider';
    input.replaceWith(wrap);
    wrap.append(range, input);
    updatePropRangeFill(range);
  });
}

function renderProps() {
  const focusState = getPropsFocusState();
  const selection = getSelectedEntities();
  const selectedComposedInstance = getSelectedComposedEntityInstance();
  const selectionMatchesComposedInstance = selectedComposedInstance
    ? selection.length === selectedComposedInstance.entities.length
      && selection.every(entity => selectedComposedInstance.entityIds.includes(entity._id))
    : false;
  if (selectionMatchesComposedInstance) {
    const typeSummary = selectedComposedInstance.entities.reduce((acc, entity) => {
      acc[entity.type] = (acc[entity.type] ?? 0) + 1;
      return acc;
    }, {});
    const summary = Object.entries(typeSummary)
      .map(([type, count]) => `${type}: ${count}`)
      .join('<br>');
    propsPanel.innerHTML = `
      <div class="prop-row"><label>ComposedEntity</label><div style="font-size:13px;font-weight:700;color:var(--info)">${selectedComposedInstance.name}</div></div>
      <div class="prop-row"><label>Children</label><div style="font-size:11px;color:#a6e3a1">${selectedComposedInstance.entities.length} entities</div></div>
      <div class="prop-row"><label>Types</label><div style="font-size:11px;color:#a6e3a1;line-height:1.6">${summary}</div></div>
      <div class="prop-row"><label>Bounds</label><div style="font-size:11px;color:var(--muted);line-height:1.6">x: ${Math.round(selectedComposedInstance.minX)} - ${Math.round(selectedComposedInstance.maxX)}<br>y: ${Math.round(selectedComposedInstance.minY)} - ${Math.round(selectedComposedInstance.maxY)}</div></div>
      <div style="margin:0 14px 12px"><button class="btn info" data-action="calibrate-selected-composed-entity" style="width:100%;font-size:10px">Calibrate Sprite</button></div>
      <button class="btn danger" data-action="delete-entity" style="margin:12px 14px">Delete ComposedEntity</button>
    `;
    restorePropsFocusState(focusState);
    return;
  }
  if (selection.length > 1) {
    const typeSummary = selection.reduce((acc, entity) => {
      acc[entity.type] = (acc[entity.type] ?? 0) + 1;
      return acc;
    }, {});
    const summary = Object.entries(typeSummary)
      .map(([type, count]) => `${type}: ${count}`)
      .join('<br>');
    propsPanel.innerHTML = `
      <div class="prop-row"><label>Multi selection</label><div style="font-size:13px;font-weight:700;color:var(--info)">${selection.length} entities selected</div></div>
      <div class="prop-row"><label>Types</label><div style="font-size:11px;color:#a6e3a1;line-height:1.6">${summary}</div></div>
      <div class="prop-row"><label>How to add/remove</label><div style="font-size:11px;color:var(--muted);line-height:1.6">Use Shift/Ctrl/Cmd + click in Select mode. Drag any selected entity to move the whole group.</div></div>
      <div style="margin:0 14px 12px"><button class="btn primary" data-action="save-composed-entity" style="width:100%;font-size:10px">Save As ComposedEntity</button></div>
      <div style="margin:0 14px 12px"><button class="btn info" data-action="save-composed-entity-and-calibrate" style="width:100%;font-size:10px">Calibrate Sprite</button></div>
      <button class="btn danger" data-action="delete-entity" style="margin:12px 14px">Delete selected entities</button>
    `;
    restorePropsFocusState(focusState);
    return;
  }
  const sel = getSelected();
  if (!sel) {
    propsPanel.innerHTML = '<p class="prop-empty">Click an entity on the canvas to edit its properties.</p>';
    restorePropsFocusState(focusState);
    return;
  }
  if (sel.type === 'Macrophage') ensureMacrophageDefaults(sel);
  if (sel.type === 'Particle') ensureParticleDefaults(sel);
  if (sel.type === 'ParticleZone') ensureParticleZoneDefaults(sel);
  if (sel.type === 'Cyst') ensureCystDefaults(sel);
  if (sel.type === 'Player') ensurePlayerDefaults(sel);
  const et = getEntityType(sel.type); let html = '';
  html += `<div class="prop-row"><label>Type</label><div style="font-size:13px;font-weight:700;color:${et.strokeColor}">${sel.type}</div></div>`;
  html += `<div class="prop-row"><label>Position (normalized)</label><div style="font-size:11px;color:#a6e3a1">x: ${(sel.x / canvas.width).toFixed(4)}<br>y: ${(sel.y / canvas.height).toFixed(4)}</div></div>`;
  if (canMirrorEntity(sel)) {
    const mirrorOn = !!sel.spriteFlipX;
    html += `<div style="margin:0 14px 12px"><button class="btn" data-action="mirror-entity-x" style="width:100%;font-size:10px">Mirror X${sel.type !== 'Stentor' ? `: ${mirrorOn ? 'ON' : 'OFF'}` : ''}</button></div>`;
  }
  if (sel.type === 'Stentor' && sel.circles?.length) {
    ensureStentorDefaults(sel);
    const presetName = STENTOR_PRESETS.find(p => p.id === (sel._presetId || activeStentorPreset))?.name ?? sel._presetName ?? 'Custom';
    html += `<div class="prop-row"><label>Preset</label><div style="font-size:12px;font-weight:700;color:#82e6f5">${presetName}</div></div>`;
    html += `<div class="prop-row"><label>Instance index</label><div style="display:flex;align-items:center;gap:6px"><span style="font-size:13px;font-weight:700;color:#82e6f5">#</span><input data-action="set-prop" data-key="instanceIndex" type="number" value="${sel.instanceIndex ?? 1}" min="1" max="999" step="1" style="width:70px"/></div></div>`;
    html += `<div class="circle-section-header">◔ Mouth Behavior</div>`;
    html += `<div class="prop-row"><label>Mouth enabled</label><select data-action="mouth-prop" data-key="enabled"><option value="true" ${sel.mouth.enabled ? 'selected':''}>true</option><option value="false" ${!sel.mouth.enabled ? 'selected':''}>false</option></select></div>`;
    html += `<div class="prop-row"><label>Turn rate</label><input data-action="mouth-prop" data-key="turnRate" type="number" value="${sel.mouth.turnRate}" min="0" max="1" step="0.005"/></div>`;
    html += `<div class="prop-row"><label>Idle spin</label><input data-action="mouth-prop" data-key="idleSpin" type="number" value="${sel.mouth.idleSpin}" min="0" max="0.2" step="0.001"/></div>`;
    html += `<div class="prop-row"><label>Rotation dir</label><input data-action="mouth-prop" data-key="rotationDir" type="number" value="${sel.mouth.rotationDir}" min="-1" max="1" step="2"/></div>`;
    html += `<div class="prop-row"><label>Range min °</label><input data-action="mouth-range" data-idx="0" type="number" value="${sel.mouth.rotationRange[0]}" min="-360" max="360" step="1"/></div>`;
    html += `<div class="prop-row"><label>Range max °</label><input data-action="mouth-range" data-idx="1" type="number" value="${sel.mouth.rotationRange[1]}" min="-360" max="360" step="1"/></div>`;
    html += `<div class="circle-section-header">↻ Body Rotation</div>`;
    html += `<div class="prop-row"><label>Body rotation enabled</label><select data-action="body-prop" data-key="enabled"><option value="true" ${sel.bodyRotation.enabled ? 'selected':''}>true</option><option value="false" ${!sel.bodyRotation.enabled ? 'selected':''}>false</option></select></div>`;
    html += `<div class="prop-row"><label>Idle spin</label><input data-action="body-prop" data-key="idleSpin" type="number" value="${sel.bodyRotation.idleSpin}" min="0" max="0.05" step="0.0005"/></div>`;
    html += `<div class="prop-row"><label>Rotation dir</label><input data-action="body-prop" data-key="rotationDir" type="number" value="${sel.bodyRotation.rotationDir}" min="-1" max="1" step="2"/></div>`;
    html += `<div class="prop-row"><label>Range min °</label><input data-action="body-range" data-idx="0" type="number" value="${sel.bodyRotation.rotationRange[0]}" min="-360" max="360" step="1"/></div>`;
    html += `<div class="prop-row"><label>Range max °</label><input data-action="body-range" data-idx="1" type="number" value="${sel.bodyRotation.rotationRange[1]}" min="-360" max="360" step="1"/></div>`;
    html += `<div class="circle-section-header">Body Circles</div>`;
    const labels = getCircleEditorLabels(sel);
    sel.circles.forEach((c,i) => {
      html += `<div class="circle-row-header">◯ ${labels[i] ?? `circle ${i}`}</div>`;
      html += `<div class="prop-row"><label>Radius</label><input data-action="circle-prop" data-idx="${i}" data-key="r" type="number" value="${c.r}" min="5" max="200" step="1"/></div>`;
      if (i===0) html += `<div class="prop-row"><label>Position px (drag to move)</label><div style="font-size:10px;color:#a6e3a1">${Math.round(sel.x)}, ${Math.round(sel.y)}</div></div>`;
      else {
        html += `<div class="prop-row"><label>Offset X from oral (px)</label><input data-action="circle-prop" data-idx="${i}" data-key="dx" type="number" value="${Math.round(c.dx)}" step="1"/></div>`;
        html += `<div class="prop-row"><label>Offset Y from oral (px)</label><input data-action="circle-prop" data-idx="${i}" data-key="dy" type="number" value="${Math.round(c.dy)}" step="1"/></div>`;
      }
    });
    html += `<div class="prop-row" style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" data-action="add-circle" style="flex:1;font-size:10px">+ Circle</button>${sel.circles.length > 2 ? `<button class="btn danger" data-action="remove-circle" style="flex:1;font-size:10px">- Last</button>` : ''}</div>`;
  } else if (sel.type === 'ComposedStone' && sel.circles?.length) {
    ensureComposedStoneDefaults(sel);
    html += `<div class="prop-row"><label>Instance index</label><div style="display:flex;align-items:center;gap:6px"><span style="font-size:13px;font-weight:700;color:${badgeColor(sel.type)}">#</span><input data-action="set-prop" data-key="instanceIndex" type="number" value="${sel.instanceIndex ?? 1}" min="1" max="999" step="1" style="width:70px"/></div></div>`;
    html += `<div class="prop-row"><label>Sprite index</label><input data-action="set-prop" data-key="spriteIndex" type="number" value="${sel.spriteIndex ?? 1}" min="1" max="999" step="1" style="width:70px"/></div>`;
    html += `<div style="margin:0 14px 12px"><button class="btn info" data-action="export-preset-src" style="width:100%;font-size:10px">Save Preset -&gt; src</button></div>`;
    html += `<div class="circle-section-header">Sprite / Anchor</div>`;
    html += `<div class="prop-row"><label>Sprite subfolder</label><input data-action="set-prop" data-key="spriteSubfolder" type="text" value="${sel.spriteSubfolder ?? ''}" placeholder="CompoundStone_01"/></div>`;
    html += `<div class="prop-row"><label>Sprite scale</label><input data-action="set-prop" data-key="spriteScale" type="number" value="${sel.spriteScale}" min="0.05" max="10" step="0.01"/></div>`;
    html += `<div class="prop-row"><label>Sprite rotation offset</label><input data-action="set-prop" data-key="spriteRotationOffset" type="number" value="${sel.spriteRotationOffset}" min="-6.28" max="6.28" step="0.01"/></div>`;
    html += `<div class="prop-row"><label>Sprite body U</label><input data-action="set-prop" data-key="spriteBodyU" type="number" value="${sel.spriteBodyU}" min="-2" max="2" step="0.001"/></div>`;
    html += `<div class="prop-row"><label>Sprite body V</label><input data-action="set-prop" data-key="spriteBodyV" type="number" value="${sel.spriteBodyV}" min="-2" max="2" step="0.001"/></div>`;
    html += `<div class="prop-row"><label>Sprite debug</label><select data-action="set-prop" data-key="spriteDebug"><option value="true" ${sel.spriteDebug ? 'selected':''}>true</option><option value="false" ${!sel.spriteDebug ? 'selected':''}>false</option></select></div>`;
    html += `<div class="circle-section-header">Body Circles</div>`;
    const labels = getCircleEditorLabels(sel);
    sel.circles.forEach((c,i) => {
      html += `<div class="circle-row-header">Circle ${i + 1}: ${labels[i] ?? `circle ${i + 1}`}</div>`;
      html += `<div class="prop-row"><label>Radius</label><input data-action="circle-prop" data-idx="${i}" data-key="r" type="number" value="${c.r}" min="5" max="200" step="1"/></div>`;
      if (i===0) html += `<div class="prop-row"><label>Center px</label><div style="font-size:10px;color:#a6e3a1">${Math.round(sel.x)}, ${Math.round(sel.y)}</div></div>`;
      else {
        html += `<div class="prop-row"><label>Offset X from center</label><input data-action="circle-prop" data-idx="${i}" data-key="dx" type="number" value="${Math.round(c.dx)}" step="1"/></div>`;
        html += `<div class="prop-row"><label>Offset Y from center</label><input data-action="circle-prop" data-idx="${i}" data-key="dy" type="number" value="${Math.round(c.dy)}" step="1"/></div>`;
      }
    });
    html += `<div class="prop-row" style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" data-action="add-circle" style="flex:1;font-size:10px">+ Circle</button>${sel.circles.length > getMinCircleCount(sel) ? `<button class="btn danger" data-action="remove-circle" style="flex:1;font-size:10px">- Last</button>` : ''}</div>`;
  } else if (sel.type === 'Algae' && sel.circles?.length) {
    ensureAlgaeDefaults(sel);
    html += `<div class="prop-row"><label>Name</label><input data-action="set-prop" data-key="name" type="text" value="${sel.name ?? ''}" placeholder="Algae"/></div>`;
    html += `<div class="prop-row"><label>Instance index</label><div style="display:flex;align-items:center;gap:6px"><span style="font-size:13px;font-weight:700;color:${badgeColor(sel.type)}">#</span><input data-action="set-prop" data-key="instanceIndex" type="number" value="${sel.instanceIndex ?? 1}" min="1" max="999" step="1" style="width:70px"/></div></div>`;
    html += `<div class="prop-row"><label>Sprite index</label><input data-action="set-prop" data-key="spriteIndex" type="number" value="${sel.spriteIndex ?? 1}" min="1" max="999" step="1" style="width:70px"/></div>`;
    html += `<div style="margin:0 14px 12px"><button class="btn info" data-action="export-preset-src" style="width:100%;font-size:10px">Save Preset -&gt; src</button></div>`;
    html += `<div class="circle-section-header">Sprite / Anchor</div>`;
    html += `<div class="prop-row"><label>Sprite subfolder</label><input data-action="set-prop" data-key="spriteSubfolder" type="text" value="${sel.spriteSubfolder ?? ''}" placeholder="Algae_01"/></div>`;
    html += `<div class="prop-row"><label>Sprite scale</label><input data-action="set-prop" data-key="spriteScale" type="number" value="${sel.spriteScale}" min="0.05" max="10" step="0.01"/></div>`;
    html += `<div class="prop-row"><label>Sprite rotation offset</label><input data-action="set-prop" data-key="spriteRotationOffset" type="number" value="${sel.spriteRotationOffset}" min="-6.28" max="6.28" step="0.01"/></div>`;
    html += `<div class="prop-row"><label>Sprite body U</label><input data-action="set-prop" data-key="spriteBodyU" type="number" value="${sel.spriteBodyU}" min="-2" max="2" step="0.001"/></div>`;
    html += `<div class="prop-row"><label>Sprite body V</label><input data-action="set-prop" data-key="spriteBodyV" type="number" value="${sel.spriteBodyV}" min="-2" max="2" step="0.001"/></div>`;
    html += `<div class="prop-row"><label>Sprite debug</label><select data-action="set-prop" data-key="spriteDebug"><option value="true" ${sel.spriteDebug ? 'selected':''}>true</option><option value="false" ${!sel.spriteDebug ? 'selected':''}>false</option></select></div>`;
    html += `<div class="circle-section-header">Projectile -&gt; Particle</div>`;
    html += `<div class="prop-row"><label>Absorb impulse transfer</label><input data-action="set-prop" data-key="absorbImpulseTransfer" type="number" value="${sel.absorbImpulseTransfer}" min="0" max="5" step="0.01"/></div>`;
    html += `<div class="prop-row"><label>Max stored projectiles</label><input data-action="set-prop" data-key="maxStoredProjectiles" type="number" value="${sel.maxStoredProjectiles}" min="1" max="999" step="1"/></div>`;
    html += `<div class="prop-row"><label>Produced per projectile</label><input data-action="set-prop" data-key="productionPerProjectile" type="number" value="${sel.productionPerProjectile}" min="1" max="20" step="1"/></div>`;
    html += `<div class="prop-row"><label>Production interval ms</label><input data-action="set-prop" data-key="productionIntervalMs" type="number" value="${sel.productionIntervalMs}" min="16" max="60000" step="10"/></div>`;
    html += `<div class="prop-row"><label>Max produced / tick</label><input data-action="set-prop" data-key="maxProducedPerTick" type="number" value="${sel.maxProducedPerTick}" min="1" max="50" step="1"/></div>`;
    html += `<div class="prop-row"><label>Particle radius</label><input data-action="set-prop" data-key="particleRadius" type="number" value="${sel.particleRadius}" min="0.5" max="64" step="0.1"/></div>`;
    html += `<div class="prop-row"><label>Particle speed</label><input data-action="set-prop" data-key="particleSpeed" type="number" value="${sel.particleSpeed}" min="0" max="20" step="0.01"/></div>`;
    html += `<div class="prop-row"><label>Particle spread</label><input data-action="set-prop" data-key="particleSpread" type="number" value="${sel.particleSpread}" min="0" max="6.28" step="0.01"/></div>`;
    html += `<div class="prop-row"><label>Particle tint</label><select data-action="set-prop" data-key="particleTintGroup"><option value="green" ${sel.particleTintGroup !== 'red' ? 'selected':''}>green</option><option value="red" ${sel.particleTintGroup === 'red' ? 'selected':''}>red</option></select></div>`;
    html += `<div class="prop-row"><label>Stored now</label><input data-action="set-prop" data-key="storedProjectiles" type="number" value="${sel.storedProjectiles ?? 0}" min="0" max="999" step="1"/></div>`;
    html += `<div class="circle-section-header">Germination</div>`;
    html += `<div class="prop-row"><label>Enabled</label><select data-action="algae-germ-prop" data-key="enabled"><option value="true" ${sel.germination.enabled ? 'selected':''}>true</option><option value="false" ${!sel.germination.enabled ? 'selected':''}>false</option></select></div>`;
    html += `<div class="prop-row"><label>Mirror offspring X</label><select data-action="algae-germ-prop" data-key="mirrorOffspringX"><option value="true" ${sel.germination.mirrorOffspringX ? 'selected':''}>true</option><option value="false" ${!sel.germination.mirrorOffspringX ? 'selected':''}>false</option></select></div>`;
    html += `<div class="prop-row"><label>After absorbed count</label><input data-action="algae-germ-prop" data-key="feedCount" type="number" value="${sel.germination.feedCount}" min="1" max="999" step="1"/></div>`;
    html += `<div class="prop-row"><label>Lobe index</label><input data-action="algae-germ-prop" data-key="bodyCircleIndex" type="number" value="${sel.germination.bodyCircleIndex}" min="0" max="${Math.max(0, sel.circles.length - 1)}" step="1"/></div>`;
    html += `<div class="prop-row"><label>Point angle °</label><input data-action="algae-germ-prop" data-key="angleDeg" type="number" value="${sel.germination.angleDeg}" min="-180" max="180" step="1"/></div>`;
    html += `<div class="prop-row"><label>Start scale</label><input data-action="algae-germ-prop" data-key="startScale" type="number" value="${sel.germination.startScale}" min="0.1" max="0.95" step="0.01"/></div>`;
    html += `<div class="prop-row"><label>Growth rate</label><input data-action="algae-germ-prop" data-key="growthRate" type="number" value="${sel.germination.growthRate}" min="0.001" max="2" step="0.001"/></div>`;
    html += `<div class="prop-row"><label>Detach scale</label><input data-action="algae-germ-prop" data-key="detachScale" type="number" value="${sel.germination.detachScale}" min="${sel.germination.startScale}" max="1" step="0.01"/></div>`;
    html += `<div class="prop-row"><label>Detach impulse</label><input data-action="algae-germ-prop" data-key="launchSpeed" type="number" value="${sel.germination.launchSpeed}" min="0" max="3" step="0.01"/></div>`;
    html += `<div class="prop-row"><label>Impulse jitter</label><input data-action="algae-germ-prop" data-key="launchJitter" type="number" value="${sel.germination.launchJitter}" min="0" max="1" step="0.01"/></div>`;
    html += `<div class="prop-row"><label>Angle jitter °</label><input data-action="algae-germ-prop" data-key="initialAngleJitterDeg" type="number" value="${sel.germination.initialAngleJitterDeg}" min="0" max="180" step="0.5"/></div>`;
    html += `<div class="prop-row"><label>Germination point</label><div style="font-size:11px;color:#a6e3a1">Drag the green marker on the selected lobe circumference.</div></div>`;
    html += `<div class="circle-section-header">Body Circles</div>`;
    const labels = getCircleEditorLabels(sel);
    sel.circles.forEach((c,i) => {
      html += `<div class="circle-row-header">Circle ${i + 1}: ${labels[i] ?? `circle ${i + 1}`}</div>`;
      html += `<div class="prop-row"><label>Radius</label><input data-action="circle-prop" data-idx="${i}" data-key="r" type="number" value="${c.r}" min="5" max="200" step="1"/></div>`;
      if (i===0) html += `<div class="prop-row"><label>Center px</label><div style="font-size:10px;color:#a6e3a1">${Math.round(sel.x)}, ${Math.round(sel.y)}</div></div>`;
      else {
        html += `<div class="prop-row"><label>Offset X from center</label><input data-action="circle-prop" data-idx="${i}" data-key="dx" type="number" value="${Math.round(c.dx)}" step="1"/></div>`;
        html += `<div class="prop-row"><label>Offset Y from center</label><input data-action="circle-prop" data-idx="${i}" data-key="dy" type="number" value="${Math.round(c.dy)}" step="1"/></div>`;
      }
    });
    html += `<div class="prop-row" style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" data-action="add-circle" style="flex:1;font-size:10px">+ Circle</button>${sel.circles.length > getMinCircleCount(sel) ? `<button class="btn danger" data-action="remove-circle" style="flex:1;font-size:10px">- Last</button>` : ''}</div>`;
  } else if (sel.type === 'Macrophage') {
    ensureMacrophageDefaults(sel);
    const addNum = (key, label, min, max, step = 1) => {
      html += `<div class="prop-row"><label>${label}</label><input data-action="set-prop" data-key="${key}" type="number" value="${sel[key]}" min="${min}" max="${max}" step="${step}"/></div>`;
    };
    html += `<div class="circle-section-header">◉ Body</div>`;
    addNum('radius', 'Radius', 5, 200, 1);
    html += `<div class="prop-row"><label>Body angle °</label><input data-action="macro-body-prop" data-key="baseAngleDeg" type="number" value="${sel.bodyRotation.baseAngleDeg}" min="-180" max="180" step="1"/></div>`;
    html += `<div class="prop-row"><label>Instance index</label><input data-action="set-prop" data-key="instanceIndex" type="number" value="${sel.instanceIndex ?? 1}" min="1" max="999" step="1" style="width:70px"/></div>`;
    html += `<div class="prop-row"><label>Sprite index</label><input data-action="set-prop" data-key="spriteIndex" type="number" value="${sel.spriteIndex ?? 1}" min="1" max="999" step="1" style="width:70px"/></div>`;
    html += `<div class="circle-section-header">Body Circles</div>`;
    const labels = getCircleEditorLabels(sel);
    sel.bodyCircles.forEach((circle, i) => {
      html += `<div class="circle-row-header">${labels[i] ?? `body ${i + 1}`}</div>`;
      html += `<div class="prop-row"><label>Radius</label><input data-action="enemy-body-prop" data-idx="${i}" data-key="r" type="number" value="${circle.r}" min="2" max="200" step="1"/></div>`;
      if (i === 0) html += `<div class="prop-row"><label>Center px</label><div style="font-size:10px;color:#a6e3a1">${Math.round(sel.x)}, ${Math.round(sel.y)}</div></div>`;
      else {
        html += `<div class="prop-row"><label>Offset X</label><input data-action="enemy-body-prop" data-idx="${i}" data-key="dx" type="number" value="${Math.round(circle.dx)}" step="1"/></div>`;
        html += `<div class="prop-row"><label>Offset Y</label><input data-action="enemy-body-prop" data-idx="${i}" data-key="dy" type="number" value="${Math.round(circle.dy)}" step="1"/></div>`;
      }
    });
    html += `<div class="prop-row" style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" data-action="add-enemy-body" style="flex:1;font-size:10px">+ Body Circle</button>${sel.bodyCircles.length > 1 ? `<button class="btn danger" data-action="remove-enemy-body" style="flex:1;font-size:10px">- Last</button>` : ''}</div>`;
    html += `<div class="circle-section-header">Body Rotation</div>`;
    html += `<div class="prop-row" style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" data-action="toggle-macro-body-overlay" style="flex:1;font-size:10px">Canvas Body ${macrophageBodyOverlay ? 'ON' : 'OFF'}</button><button class="btn" data-action="toggle-macro-body-dir" style="flex:1;font-size:10px">Dir ${sel.bodyRotation.rotationDir >= 0 ? 'CW' : 'CCW'}</button></div>`;
    html += `<div class="prop-row"><label>Body rotation enabled</label><select data-action="macro-body-prop" data-key="enabled"><option value="true" ${sel.bodyRotation.enabled ? 'selected':''}>true</option><option value="false" ${!sel.bodyRotation.enabled ? 'selected':''}>false</option></select></div>`;
    html += `<div class="prop-row"><label>Idle spin</label><input data-action="macro-body-prop" data-key="idleSpin" type="number" value="${sel.bodyRotation.idleSpin}" min="0" max="0.2" step="0.001"/></div>`;
    html += `<div class="circle-row-header">Idle Wave</div>`;
    html += `<div class="prop-row"><label>Wave enabled</label><select data-action="macro-body-idle-wave-prop" data-key="enabled"><option value="true" ${sel.bodyRotation.idleWave.enabled ? 'selected':''}>true</option><option value="false" ${!sel.bodyRotation.idleWave.enabled ? 'selected':''}>false</option></select></div>`;
    html += `<div class="prop-row"><label>Wave amount</label><input data-action="macro-body-idle-wave-prop" data-key="amount" type="number" value="${sel.bodyRotation.idleWave.amount}" min="0" max="1" step="0.01"/></div>`;
    html += `<div class="prop-row"><label>Wave speed Hz</label><input data-action="macro-body-idle-wave-prop" data-key="speedHz" type="number" value="${sel.bodyRotation.idleWave.speedHz}" min="0" max="5" step="0.01"/></div>`;
    html += `<div class="prop-row"><label>Rotation mode</label><select data-action="macro-body-prop" data-key="rotationMode"><option value="pingpong" ${sel.bodyRotation.rotationMode !== 'loop' ? 'selected':''}>ping-pong</option><option value="loop" ${sel.bodyRotation.rotationMode === 'loop' ? 'selected':''}>one way</option></select></div>`;
    html += `<div class="prop-row"><label>Rotation dir</label><input data-action="macro-body-prop" data-key="rotationDir" type="number" value="${sel.bodyRotation.rotationDir}" min="-1" max="1" step="2"/></div>`;
    html += `<div class="circle-row-header">Movement Follow</div>`;
    html += `<div class="prop-row"><label>Follow movement</label><select data-action="macro-body-follow-prop" data-key="enabled"><option value="true" ${sel.bodyRotation.movementFollow.enabled ? 'selected':''}>true</option><option value="false" ${!sel.bodyRotation.movementFollow.enabled ? 'selected':''}>false</option></select></div>`;
    html += `<div class="prop-row"><label>Follow strength</label><input data-action="macro-body-follow-prop" data-key="strength" type="number" value="${sel.bodyRotation.movementFollow.strength}" min="0" max="1" step="0.01"/></div>`;
    html += `<div class="prop-row"><label>Follow smoothing</label><input data-action="macro-body-follow-prop" data-key="smoothing" type="number" value="${sel.bodyRotation.movementFollow.smoothing}" min="0" max="1" step="0.01"/></div>`;
    html += `<div class="prop-row"><label>Follow min speed</label><input data-action="macro-body-follow-prop" data-key="minSpeed" type="number" value="${sel.bodyRotation.movementFollow.minSpeed}" min="0" max="20" step="0.01"/></div>`;
    html += `<div class="prop-row"><label>Pivot offset X</label><input data-action="macro-body-prop" data-key="pivotDx" type="number" value="${sel.bodyRotation.pivotDx}" step="0.1"/></div>`;
    html += `<div class="prop-row"><label>Pivot offset Y</label><input data-action="macro-body-prop" data-key="pivotDy" type="number" value="${sel.bodyRotation.pivotDy}" step="0.1"/></div>`;
    html += `<div class="prop-row"><label>Pivot circle radius</label><input data-action="macro-body-prop" data-key="pivotRadius" type="number" value="${sel.bodyRotation.pivotRadius}" min="4" max="160" step="0.1"/></div>`;
    html += `<div class="prop-row"><label>Range min °</label><input data-action="macro-body-range" data-idx="0" type="number" value="${sel.bodyRotation.rotationRange[0]}" min="-180" max="180" step="1"/></div>`;
    html += `<div class="prop-row"><label>Range max °</label><input data-action="macro-body-range" data-idx="1" type="number" value="${sel.bodyRotation.rotationRange[1]}" min="-180" max="180" step="1"/></div>`;
    html += `<div class="circle-section-header">Orbit</div>`;
    html += `<div class="prop-row"><label>Orbit enabled</label><select data-action="macro-orbit-prop" data-key="enabled"><option value="true" ${sel.orbit.enabled ? 'selected':''}>true</option><option value="false" ${!sel.orbit.enabled ? 'selected':''}>false</option></select></div>`;
    html += `<div class="prop-row"><label>Movement mode</label><select data-action="macro-movement-mode"><option value="orbit" ${sel.orbit.mode === 'orbit' ? 'selected':''}>single circle</option><option value="spline" ${sel.orbit.mode === 'spline' ? 'selected':''}>spline path</option><option value="free" ${sel.orbit.mode === 'free' ? 'selected':''}>free drift</option></select></div>`;
    html += `<div class="prop-row"><label>Loop path</label><select data-action="macro-orbit-prop" data-key="loop"><option value="true" ${sel.orbit.loop ? 'selected':''}>true</option><option value="false" ${!sel.orbit.loop ? 'selected':''}>false</option></select></div>`;
    html += `<div class="prop-row" style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" data-action="macro-orbit-single" style="flex:1;font-size:10px">Single Circle</button><button class="btn" data-action="macro-orbit-spline" style="flex:1;font-size:10px">Spline Path</button><button class="btn" data-action="macro-orbit-free" style="flex:1;font-size:10px">Free Drift</button></div>`;
    html += `<div class="prop-row"><button class="btn" data-action="macro-orbit-ovoid" style="width:100%;font-size:10px">Generate Ovoid Spline</button></div>`;
    if (sel.orbit.mode === 'free') {
      html += `<div class="prop-row"><label>Direction °</label><input data-action="macro-free-prop" data-key="directionDeg" type="number" value="${sel.orbit.freeMove.directionDeg}" min="-180" max="180" step="1"/></div>`;
      html += `<div class="prop-row"><label>Sector span °</label><input data-action="macro-free-prop" data-key="spreadDeg" type="number" value="${sel.orbit.freeMove.spreadDeg}" min="0" max="360" step="1"/></div>`;
      html += `<div class="prop-row"><label>Sector radius</label><input data-action="macro-free-prop" data-key="previewRadius" type="number" value="${sel.orbit.freeMove.previewRadius}" min="12" max="3000" step="1"/></div>`;
      html += `<div class="prop-row"><label>Impulse</label><input data-action="macro-free-prop" data-key="impulse" type="number" value="${sel.orbit.freeMove.impulse}" min="0" max="10" step="0.01"/></div>`;
      html += `<div class="prop-row"><label>Interval ms</label><input data-action="macro-free-prop" data-key="intervalMs" type="number" value="${sel.orbit.freeMove.intervalMs}" min="0" max="60000" step="10"/></div>`;
      html += `<div class="prop-row"><label>Interval min ms</label><input data-action="macro-free-prop" data-key="intervalMinMs" type="number" value="${sel.orbit.freeMove.intervalMinMs}" min="0" max="60000" step="10"/></div>`;
      html += `<div class="prop-row"><label>Interval max ms</label><input data-action="macro-free-prop" data-key="intervalMaxMs" type="number" value="${sel.orbit.freeMove.intervalMaxMs}" min="0" max="60000" step="10"/></div>`;
      html += `<div class="prop-row"><label>Turn min °</label><input data-action="macro-free-prop" data-key="turnAngleMinDeg" type="number" value="${sel.orbit.freeMove.turnAngleMinDeg}" min="0" max="180" step="1"/></div>`;
      html += `<div class="prop-row"><label>Turn max °</label><input data-action="macro-free-prop" data-key="turnAngleMaxDeg" type="number" value="${sel.orbit.freeMove.turnAngleMaxDeg}" min="0" max="180" step="1"/></div>`;
      html += `<div class="prop-row"><label>Velocity damping</label><input data-action="macro-free-prop" data-key="velocityDamping" type="number" value="${sel.orbit.freeMove.velocityDamping}" min="0" max="0.9999" step="0.001"/></div>`;
      html += `<div class="prop-row"><label>Max speed</label><input data-action="macro-free-prop" data-key="maxSpeed" type="number" value="${sel.orbit.freeMove.maxSpeed}" min="0" max="20" step="0.01"/></div>`;
      html += `<div class="prop-row"><label>Canvas</label><div style="font-size:11px;color:#a6e3a1">Drag the white arrow for direction, green edges for sector span, and cream handle for radius.</div></div>`;
    } else if (sel.orbit.mode === 'spline' && Array.isArray(sel.orbit.splinePoints) && sel.orbit.splinePoints.length > 2) {
      const selectedPointIdx = getSelectedMacrophageOrbitSplinePointIndex(sel);
      sel.orbit.splinePoints.forEach((point, i) => {
        const isSelected = i === selectedPointIdx;
        html += `<div class="circle-row-header" style="${isSelected ? 'color:#f6fff0;background:rgba(190,245,155,0.14);' : ''}">Point ${i + 1}${isSelected ? ' (selected)' : ''}</div>`;
        html += `<div class="prop-row"><label>Offset X</label><input data-action="macro-orbit-spline-point-prop" data-idx="${i}" data-key="dx" type="number" value="${point.dx}" step="0.1"/></div>`;
        html += `<div class="prop-row"><label>Offset Y</label><input data-action="macro-orbit-spline-point-prop" data-idx="${i}" data-key="dy" type="number" value="${point.dy}" step="0.1"/></div>`;
      });
      html += `<div class="prop-row" style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" data-action="add-macro-orbit-spline-point" style="flex:1;font-size:10px">+ Point</button>${sel.orbit.splinePoints.length > 4 ? `<button class="btn danger" data-action="remove-macro-orbit-spline-point" style="flex:1;font-size:10px">- Point</button>` : ''}</div>`;
      html += `<div class="prop-row"><label>Canvas</label><div style="font-size:11px;color:#a6e3a1">Drag the spline points to bend the guide circle into a closed loop.</div></div>`;
    } else {
      html += `<div class="prop-row"><label>Center offset X</label><input data-action="macro-orbit-prop" data-key="centerDx" type="number" value="${sel.orbit.centerDx}" step="0.1"/></div>`;
      html += `<div class="prop-row"><label>Center offset Y</label><input data-action="macro-orbit-prop" data-key="centerDy" type="number" value="${sel.orbit.centerDy}" step="0.1"/></div>`;
      html += `<div class="prop-row"><label>Orbit radius</label><input data-action="macro-orbit-prop" data-key="radius" type="number" value="${sel.orbit.radius}" min="0" max="2000" step="0.1"/></div>`;
      html += `<div class="prop-row"><label>Orbit speed</label><input data-action="macro-orbit-prop" data-key="speed" type="number" value="${sel.orbit.speed}" min="-0.2" max="0.2" step="0.001"/></div>`;
      html += `<div class="prop-row"><label>Orbit on canvas</label><div style="font-size:11px;color:#a6e3a1">Drag orbit center and radius handle directly on canvas.</div></div>`;
    }
    html += `<div class="circle-section-header">Absorb</div>`;
    html += `<div class="prop-row"><label>Particle</label><select data-action="macro-absorb-prop" data-key="particle"><option value="true" ${sel.absorbTargets.particle ? 'selected':''}>true</option><option value="false" ${!sel.absorbTargets.particle ? 'selected':''}>false</option></select></div>`;
    html += `<div class="prop-row"><label>Projectile</label><select data-action="macro-absorb-prop" data-key="projectile"><option value="true" ${sel.absorbTargets.projectile ? 'selected':''}>true</option><option value="false" ${!sel.absorbTargets.projectile ? 'selected':''}>false</option></select></div>`;
    html += `<div class="prop-row"><label>Player</label><select data-action="macro-absorb-prop" data-key="player"><option value="true" ${sel.absorbTargets.player ? 'selected':''}>true</option><option value="false" ${!sel.absorbTargets.player ? 'selected':''}>false</option></select></div>`;
    html += `<div class="prop-row"><label>Enemy</label><select data-action="macro-absorb-prop" data-key="enemy"><option value="true" ${sel.absorbTargets.enemy ? 'selected':''}>true</option><option value="false" ${!sel.absorbTargets.enemy ? 'selected':''}>false</option></select></div>`;
    html += `<div class="circle-section-header">Growth</div>`;
    html += `<div class="prop-row"><label>Enabled</label><select data-action="macro-growth-prop" data-key="enabled"><option value="true" ${sel.growth.enabled ? 'selected':''}>true</option><option value="false" ${!sel.growth.enabled ? 'selected':''}>false</option></select></div>`;
    html += `<div class="prop-row"><label>Radius per absorb</label><input data-action="macro-growth-prop" data-key="perAbsorb" type="number" value="${sel.growth.perAbsorb}" min="0" max="20" step="0.05"/></div>`;
    html += `<div class="prop-row"><label>Max radius</label><input data-action="macro-growth-prop" data-key="maxRadius" type="number" value="${sel.growth.maxRadius}" min="${Math.max(2, Math.round(sel.radius))}" max="300" step="0.1"/></div>`;
    html += `<div class="prop-row"><label>Growth rate</label><input data-action="macro-growth-prop" data-key="growthRate" type="number" value="${sel.growth.growthRate}" min="0.001" max="2" step="0.001"/></div>`;
    html += `<div class="circle-section-header">Egg Spawn</div>`;
    html += `<div class="prop-row"><label>After eaten count</label><input data-action="macro-egg-prop" data-key="feedCount" type="number" value="${sel.eggSpawn.feedCount}" min="1" max="999" step="1"/></div>`;
    html += `<div class="prop-row"><label>Lobe index</label><input data-action="macro-egg-prop" data-key="bodyCircleIndex" type="number" value="${sel.eggSpawn.bodyCircleIndex}" min="0" max="${Math.max(0, sel.bodyCircles.length - 1)}" step="1"/></div>`;
    html += `<div class="prop-row"><label>Point angle °</label><input data-action="macro-egg-prop" data-key="angleDeg" type="number" value="${sel.eggSpawn.angleDeg}" min="-180" max="180" step="1"/></div>`;
    html += `<div class="prop-row"><label>Spawn point</label><div style="font-size:11px;color:#a6e3a1">Drag the orange marker on the selected lobe circumference.</div></div>`;
    html += `<div class="circle-section-header">Projectile Spawn</div>`;
    html += `<div class="prop-row"><label>Lobe index</label><input data-action="macro-projectile-prop" data-key="bodyCircleIndex" type="number" value="${sel.projectileSpawn.bodyCircleIndex}" min="0" max="${Math.max(0, sel.bodyCircles.length - 1)}" step="1"/></div>`;
    html += `<div class="prop-row"><label>Point angle °</label><input data-action="macro-projectile-prop" data-key="angleDeg" type="number" value="${sel.projectileSpawn.angleDeg}" min="-180" max="180" step="1"/></div>`;
    html += `<div class="prop-row"><label>Projectile point</label><div style="font-size:11px;color:#a6e3a1">Drag the yellow marker on the selected lobe circumference.</div></div>`;
    html += `<div class="circle-section-header">Germination</div>`;
    html += `<div class="prop-row"><label>Enabled</label><select data-action="macro-germ-prop" data-key="enabled"><option value="true" ${sel.germination.enabled ? 'selected':''}>true</option><option value="false" ${!sel.germination.enabled ? 'selected':''}>false</option></select></div>`;
    html += `<div class="prop-row"><label>Mirror offspring X</label><select data-action="macro-germ-prop" data-key="mirrorOffspringX"><option value="true" ${sel.germination.mirrorOffspringX ? 'selected':''}>true</option><option value="false" ${!sel.germination.mirrorOffspringX ? 'selected':''}>false</option></select></div>`;
    html += `<div class="prop-row"><label>After eaten count</label><input data-action="macro-germ-prop" data-key="feedCount" type="number" value="${sel.germination.feedCount}" min="1" max="999" step="1"/></div>`;
    html += `<div class="prop-row"><label>Lobe index</label><input data-action="macro-germ-prop" data-key="bodyCircleIndex" type="number" value="${sel.germination.bodyCircleIndex}" min="0" max="${Math.max(0, sel.bodyCircles.length - 1)}" step="1"/></div>`;
    html += `<div class="prop-row"><label>Point angle °</label><input data-action="macro-germ-prop" data-key="angleDeg" type="number" value="${sel.germination.angleDeg}" min="-180" max="180" step="1"/></div>`;
    html += `<div class="prop-row"><label>Start scale</label><input data-action="macro-germ-prop" data-key="startScale" type="number" value="${sel.germination.startScale}" min="0.1" max="0.95" step="0.01"/></div>`;
    html += `<div class="prop-row"><label>Growth rate</label><input data-action="macro-germ-prop" data-key="growthRate" type="number" value="${sel.germination.growthRate}" min="0.001" max="2" step="0.001"/></div>`;
    html += `<div class="prop-row"><label>Detach scale</label><input data-action="macro-germ-prop" data-key="detachScale" type="number" value="${sel.germination.detachScale}" min="${sel.germination.startScale}" max="1" step="0.01"/></div>`;
    html += `<div class="prop-row"><label>Detach impulse</label><input data-action="macro-germ-prop" data-key="launchSpeed" type="number" value="${sel.germination.launchSpeed}" min="0" max="3" step="0.01"/></div>`;
    html += `<div class="prop-row"><label>Impulse jitter</label><input data-action="macro-germ-prop" data-key="launchJitter" type="number" value="${sel.germination.launchJitter}" min="0" max="1" step="0.01"/></div>`;
    html += `<div class="prop-row"><label>Angle jitter °</label><input data-action="macro-germ-prop" data-key="initialAngleJitterDeg" type="number" value="${sel.germination.initialAngleJitterDeg}" min="0" max="180" step="0.5"/></div>`;
    html += `<div class="prop-row"><label>Mouth wake ms</label><input data-action="macro-germ-prop" data-key="mouthWakeDelayMs" type="number" value="${sel.germination.mouthWakeDelayMs}" min="0" max="5000" step="10"/></div>`;
    html += `<div class="prop-row"><label>Germination point</label><div style="font-size:11px;color:#a6e3a1">Drag the green marker on the selected lobe circumference.</div></div>`;
    html += `<div class="circle-section-header">Body Spline Cilia</div>`;
    html += `<div class="prop-row"><label>Enabled</label><select data-action="macro-body-cilia-prop" data-key="enabled"><option value="true" ${sel.bodyCilia.enabled ? 'selected':''}>true</option><option value="false" ${!sel.bodyCilia.enabled ? 'selected':''}>false</option></select></div>`;
    html += `<div class="prop-row"><label>Cilia count</label><input data-action="macro-body-cilia-prop" data-key="count" type="number" value="${sel.bodyCilia.count}" min="0" max="360" step="1"/></div>`;
    html += `<div class="prop-row"><label>Length scale</label><input data-action="macro-body-cilia-prop" data-key="lengthScale" type="number" value="${sel.bodyCilia.lengthScale}" min="0" max="1.5" step="0.01"/></div>`;
    html += `<div class="prop-row"><label>Wave amount</label><input data-action="macro-body-cilia-prop" data-key="waveAmount" type="number" value="${sel.bodyCilia.waveAmount}" min="0" max="2" step="0.01"/></div>`;
    html += `<div class="prop-row"><label>Wave speed</label><input data-action="macro-body-cilia-prop" data-key="waveSpeed" type="number" value="${sel.bodyCilia.waveSpeed}" min="0" max="0.03" step="0.0005"/></div>`;
    html += `<div class="prop-row"><label>Curl</label><input data-action="macro-body-cilia-prop" data-key="curl" type="number" value="${sel.bodyCilia.curl}" min="-1" max="1" step="0.01"/></div>`;
    html += `<div class="prop-row"><label>Line width</label><input data-action="macro-body-cilia-prop" data-key="lineWidth" type="number" value="${sel.bodyCilia.lineWidth}" min="0.1" max="8" step="0.1"/></div>`;
    html += `<div class="prop-row"><label>Alpha</label><input data-action="macro-body-cilia-prop" data-key="alpha" type="number" value="${sel.bodyCilia.alpha}" min="0" max="1" step="0.01"/></div>`;
    html += `<div class="prop-row"><label>Spline offset</label><input data-action="macro-body-cilia-prop" data-key="splineOffset" type="number" value="${sel.bodyCilia.splineOffset}" min="-40" max="80" step="0.1"/></div>`;
    html += `<div class="prop-row"><label>Spline samples</label><input data-action="macro-body-cilia-prop" data-key="splineSamples" type="number" value="${sel.bodyCilia.splineSamples}" min="12" max="360" step="1"/></div>`;
    sel.bodyCilia.segments.forEach((segment, i) => {
      html += `<div class="circle-row-header">Segment ${i + 1}</div>`;
      html += `<div class="prop-row"><label>Enabled</label><select data-action="macro-body-cilia-segment-prop" data-idx="${i}" data-key="enabled"><option value="true" ${segment.enabled ? 'selected':''}>true</option><option value="false" ${!segment.enabled ? 'selected':''}>false</option></select></div>`;
      html += `<div class="prop-row"><label>Start t</label><input data-action="macro-body-cilia-segment-prop" data-idx="${i}" data-key="start" type="number" value="${segment.start}" min="0" max="1" step="0.01"/></div>`;
      html += `<div class="prop-row"><label>End t</label><input data-action="macro-body-cilia-segment-prop" data-idx="${i}" data-key="end" type="number" value="${segment.end}" min="0" max="1" step="0.01"/></div>`;
    });
    html += `<div class="prop-row" style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" data-action="add-macro-body-cilia-segment" style="flex:1;font-size:10px">+ Segment</button>${sel.bodyCilia.segments.length > 1 ? `<button class="btn danger" data-action="remove-macro-body-cilia-segment" style="flex:1;font-size:10px">- Last</button>` : ''}</div>`;
    html += `<div class="prop-row"><label>Spline source</label><div style="font-size:11px;color:#a6e3a1">Closed outline is generated from body circles. Segment t wraps around the outline: 0=right side, 0.25=bottom, 0.5=left, 0.75=top.</div></div>`;
    html += `<div class="circle-section-header">Mouth</div>`;
    html += `<div class="prop-row" style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" data-action="toggle-macro-mouth-overlay" style="flex:1;font-size:10px">Canvas Arc ${macrophageMouthOverlay ? 'ON' : 'OFF'}</button><button class="btn" data-action="toggle-macro-mouth-dir" style="flex:1;font-size:10px">Dir ${sel.mouth.rotationDir >= 0 ? 'CW' : 'CCW'}</button></div>`;
    html += `<div class="prop-row"><label>Mouth enabled</label><select data-action="macro-mouth-prop" data-key="enabled"><option value="true" ${sel.mouth.enabled ? 'selected':''}>true</option><option value="false" ${!sel.mouth.enabled ? 'selected':''}>false</option></select></div>`;
    html += `<div class="prop-row"><label>Turn enabled</label><select data-action="macro-mouth-prop" data-key="turnEnabled"><option value="true" ${sel.mouth.turnEnabled ? 'selected':''}>true</option><option value="false" ${!sel.mouth.turnEnabled ? 'selected':''}>false</option></select></div>`;
    html += `<div class="prop-row"><label>Offset distance</label><input data-action="macro-mouth-prop" data-key="offsetDistance" type="number" value="${sel.mouth.offsetDistance}" min="0" max="240" step="0.1"/></div>`;
    html += `<div class="prop-row"><label>Absorb radius</label><input data-action="macro-mouth-prop" data-key="absorbRadius" type="number" value="${sel.mouth.absorbRadius}" min="2" max="120" step="0.1"/></div>`;
    html += `<div class="prop-row"><label>Turn rate</label><input data-action="macro-mouth-prop" data-key="turnRate" type="number" value="${sel.mouth.turnRate}" min="0" max="1" step="0.001"/></div>`;
    html += `<div class="prop-row"><label>Idle spin</label><input data-action="macro-mouth-prop" data-key="idleSpin" type="number" value="${sel.mouth.idleSpin}" min="0" max="0.2" step="0.001"/></div>`;
    html += `<div class="prop-row"><label>Rotation dir</label><input data-action="macro-mouth-prop" data-key="rotationDir" type="number" value="${sel.mouth.rotationDir}" min="-1" max="1" step="2"/></div>`;
    html += `<div class="prop-row"><label>Range min °</label><input data-action="macro-mouth-range" data-idx="0" type="number" value="${sel.mouth.rotationRange[0]}" min="-180" max="180" step="1"/></div>`;
    html += `<div class="prop-row"><label>Range max °</label><input data-action="macro-mouth-range" data-idx="1" type="number" value="${sel.mouth.rotationRange[1]}" min="-180" max="180" step="1"/></div>`;
    html += `<div class="circle-section-header">Mouth Cilia</div>`;
    html += `<div class="prop-row"><label>Cilia enabled</label><select data-action="macro-mouth-cilia-prop" data-key="enabled"><option value="true" ${sel.mouth.cilia.enabled ? 'selected':''}>true</option><option value="false" ${!sel.mouth.cilia.enabled ? 'selected':''}>false</option></select></div>`;
    html += `<div class="prop-row"><label>Cilia count</label><input data-action="macro-mouth-cilia-prop" data-key="count" type="number" value="${sel.mouth.cilia.count}" min="0" max="96" step="1"/></div>`;
    html += `<div class="prop-row"><label>Length scale</label><input data-action="macro-mouth-cilia-prop" data-key="lengthScale" type="number" value="${sel.mouth.cilia.lengthScale}" min="0" max="1.5" step="0.01"/></div>`;
    html += `<div class="prop-row"><label>Wave amount</label><input data-action="macro-mouth-cilia-prop" data-key="waveAmount" type="number" value="${sel.mouth.cilia.waveAmount}" min="0" max="2" step="0.01"/></div>`;
    html += `<div class="prop-row"><label>Wave speed</label><input data-action="macro-mouth-cilia-prop" data-key="waveSpeed" type="number" value="${sel.mouth.cilia.waveSpeed}" min="0" max="0.03" step="0.0005"/></div>`;
    html += `<div class="prop-row"><label>Curl</label><input data-action="macro-mouth-cilia-prop" data-key="curl" type="number" value="${sel.mouth.cilia.curl}" min="-1" max="1" step="0.01"/></div>`;
    html += `<div class="prop-row"><label>Line width</label><input data-action="macro-mouth-cilia-prop" data-key="lineWidth" type="number" value="${sel.mouth.cilia.lineWidth}" min="0.1" max="8" step="0.1"/></div>`;
    html += `<div class="prop-row"><label>Alpha</label><input data-action="macro-mouth-cilia-prop" data-key="alpha" type="number" value="${sel.mouth.cilia.alpha}" min="0" max="1" step="0.01"/></div>`;
    html += `<div class="prop-row"><label>Arc enabled</label><select data-action="macro-mouth-cilia-prop" data-key="arcEnabled"><option value="true" ${sel.mouth.cilia.arcEnabled ? 'selected':''}>true</option><option value="false" ${!sel.mouth.cilia.arcEnabled ? 'selected':''}>false</option></select></div>`;
    html += `<div class="prop-row"><label>Arc center (°)</label><input data-action="macro-mouth-cilia-prop" data-key="arcCenterDeg" type="number" value="${sel.mouth.cilia.arcCenterDeg}" min="-360" max="360" step="1"/></div>`;
    html += `<div class="prop-row"><label>Arc spread (°)</label><input data-action="macro-mouth-cilia-prop" data-key="arcSpreadDeg" type="number" value="${sel.mouth.cilia.arcSpreadDeg}" min="0" max="360" step="1"/></div>`;
    html += `<div class="prop-row"><label>Digest path</label><div style="font-size:11px;color:#a6e3a1">Drag points <strong>start / c1..cN / end</strong> on canvas.</div></div>`;
    html += `<div class="prop-row" style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" data-action="add-macro-digest-point" style="flex:1;font-size:10px">+ C point</button>${getMacrophageDigestControlKeys(sel.digestPath).length > 2 ? `<button class="btn danger" data-action="remove-macro-digest-point" style="flex:1;font-size:10px">- Last C point</button>` : ''}</div>`;
    html += `<div class="prop-row"><label>GIT particle radius</label><input data-action="set-prop" data-key="gitParticleRadius" type="number" value="${sel.gitParticleRadius}" min="0.4" max="80" step="0.1"/></div>`;
    html += `<div class="circle-section-header">Sprite / Anchor</div>`;
    html += `<div class="prop-row"><label>Sprite subfolder</label><input data-action="set-prop" data-key="spriteSubfolder" type="text" value="${sel.spriteSubfolder ?? ''}" placeholder="Macrophage_01"/></div>`;
    html += `<div class="prop-row"><label>Sprite scale</label><input data-action="set-prop" data-key="spriteScale" type="number" value="${sel.spriteScale}" min="0.05" max="10" step="0.01"/></div>`;
    html += `<div class="prop-row"><label>Sprite rotation offset</label><input data-action="set-prop" data-key="spriteRotationOffset" type="number" value="${sel.spriteRotationOffset}" min="-6.28" max="6.28" step="0.01"/></div>`;
    html += `<div class="prop-row"><label>Sprite body U</label><input data-action="set-prop" data-key="spriteBodyU" type="number" value="${sel.spriteBodyU}" min="-2" max="2" step="0.001"/></div>`;
    html += `<div class="prop-row"><label>Sprite body V</label><input data-action="set-prop" data-key="spriteBodyV" type="number" value="${sel.spriteBodyV}" min="-2" max="2" step="0.001"/></div>`;
    html += `<div class="prop-row"><label>Animation enabled</label><div class="pz-toggle"><button data-action="set-prop" data-key="spriteAnimationEnabled" data-value="true" class="${sel.spriteAnimationEnabled ? 'on' : ''}">On</button><button data-action="set-prop" data-key="spriteAnimationEnabled" data-value="false" class="${!sel.spriteAnimationEnabled ? 'on' : ''}">Off</button></div></div>`;
    html += `<div class="prop-row"><label>Animation subfolder</label><input data-action="set-prop" data-key="spriteAnimationSubfolder" type="text" value="${sel.spriteAnimationSubfolder ?? ''}" placeholder="Macrophage_01"/></div>`;
    html += `<div class="prop-row"><label>Frame count</label><input data-action="set-prop" data-key="spriteAnimationFrames" type="number" value="${sel.spriteAnimationFrames}" min="1" max="9999" step="1"/></div>`;
    html += `<div class="prop-row"><label>Start frame</label><input data-action="set-prop" data-key="spriteAnimationStart" type="number" value="${sel.spriteAnimationStart}" min="1" max="9999" step="1"/></div>`;
    html += `<div class="prop-row"><label>Animation mode</label><select data-action="set-prop" data-key="spriteAnimationMode"><option value="loop" ${sel.spriteAnimationMode !== 'pingpong' ? 'selected':''}>loop</option><option value="pingpong" ${sel.spriteAnimationMode === 'pingpong' ? 'selected':''}>ping-pong</option></select></div>`;
    html += `<div class="prop-row"><label>Animation FPS</label><input data-action="set-prop" data-key="spriteAnimationFps" type="number" value="${sel.spriteAnimationFps}" min="1" max="120" step="0.1"/></div>`;
    html += `<div class="prop-row"><label>Frame padding</label><input data-action="set-prop" data-key="spriteAnimationPadding" type="number" value="${sel.spriteAnimationPadding}" min="1" max="10" step="1"/></div>`;
    html += `<div style="margin:0 14px 12px"><button class="btn primary" data-action="open-sprite-cal" style="width:100%;font-size:10px">Calibrate Sprite</button></div>`;
  } else if (sel.type === 'Enemy') {
    ensureEnemyDefaults(sel);
    const addNum = (key, label, min, max, step = 1) => {
      html += `<div class="prop-row"><label>${label}</label><input data-action="set-prop" data-key="${key}" type="number" value="${sel[key]}" min="${min}" max="${max}" step="${step}"/></div>`;
    };
    html += `<div class="prop-row"><label>Instance index</label><div style="display:flex;align-items:center;gap:6px"><span style="font-size:13px;font-weight:700;color:${badgeColor(sel.type)}">#</span><input data-action="set-prop" data-key="instanceIndex" type="number" value="${sel.instanceIndex}" min="1" max="999" step="1" style="width:70px"/></div></div>`;
    html += `<div class="prop-row"><label>Sprite index</label><input data-action="set-prop" data-key="spriteIndex" type="number" value="${sel.spriteIndex ?? 1}" min="1" max="${ENEMY_SPRITE_INDEX_MAX}" step="1" style="width:70px"/></div>`;
    html += `<div style="margin:0 14px 12px"><button class="btn info" data-action="export-preset-src" style="width:100%;font-size:10px">Save Preset -&gt; src</button></div>`;
    html += `<div class="circle-section-header">◉ Body</div>`;
    addNum('radius', 'Radius', 5, 200, 1);
    addNum('speed', 'Speed override', 0, 5, 0.05);
    html += `<div class="circle-section-header">Body Circles</div>`;
    const labels = getCircleEditorLabels(sel);
    sel.bodyCircles.forEach((circle, i) => {
      html += `<div class="circle-row-header">${labels[i] ?? `body ${i + 1}`}</div>`;
      html += `<div class="prop-row"><label>Radius</label><input data-action="enemy-body-prop" data-idx="${i}" data-key="r" type="number" value="${circle.r}" min="2" max="200" step="1"/></div>`;
      if (i === 0) html += `<div class="prop-row"><label>Center px</label><div style="font-size:10px;color:#a6e3a1">${Math.round(sel.x)}, ${Math.round(sel.y)}</div></div>`;
      else {
        html += `<div class="prop-row"><label>Offset X</label><input data-action="enemy-body-prop" data-idx="${i}" data-key="dx" type="number" value="${Math.round(circle.dx)}" step="1"/></div>`;
        html += `<div class="prop-row"><label>Offset Y</label><input data-action="enemy-body-prop" data-idx="${i}" data-key="dy" type="number" value="${Math.round(circle.dy)}" step="1"/></div>`;
      }
    });
    html += `<div class="prop-row" style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" data-action="add-enemy-body" style="flex:1;font-size:10px">+ Body Circle</button>${sel.bodyCircles.length > 1 ? `<button class="btn danger" data-action="remove-enemy-body" style="flex:1;font-size:10px">- Last</button>` : ''}</div>`;
    html += `<div class="circle-section-header">↝ Swim / Scan</div>`;
    addNum('velocityDamping', 'Velocity damping', 0.8, 0.999, 0.0005);
    addNum('maxGlideSpeed', 'Max glide speed', 0.1, 10, 0.01);
    addNum('kickImpulse', 'Tracking kick impulse', 0, 10, 0.01);
    addNum('kickCooldownMs', 'Tracking kick cooldown ms', 0, 10000, 10);
    addNum('searchKickImpulse', 'Search kick impulse', 0, 10, 0.01);
    addNum('searchKickCooldownMs', 'Search kick cooldown ms', 0, 10000, 10);
    addNum('trackingFOVDeg', 'Tracking FOV °', 1, 360, 1);
    addNum('trackingKickJitterDeg', 'Tracking kick jitter °', 0, 180, 1);
    addNum('scanTurnRate', 'Scan turn rate', 0, 1, 0.001);
    addNum('scanRetargetMs', 'Scan retarget ms', 0, 10000, 10);
    addNum('scanSweepAngleDeg', 'Scan sweep °', 0, 360, 1);
    html += `<div class="circle-section-header">Inner Artifacts</div>`;
    if (!sel.innerArtifacts?.length) {
      html += `<div class="prop-row"><label>Status</label><div style="font-size:11px;color:#a6e3a1">No inner artifacts yet.</div></div>`;
    } else {
      sel.innerArtifacts.forEach((artifact, i) => {
        html += `<div class="circle-row-header">Artifact ${i + 1}</div>`;
        html += `<div class="prop-row"><label>Sprite index</label><input data-action="enemy-inner-prop" data-idx="${i}" data-key="spriteIndex" type="number" value="${artifact.spriteIndex ?? 1}" min="1" max="${ENEMY_SPRITE_INDEX_MAX}" step="1"/></div>`;
        html += `<div class="prop-row"><label>Radius</label><input data-action="enemy-inner-prop" data-idx="${i}" data-key="radius" type="number" value="${artifact.radius}" min="2" max="120" step="1"/></div>`;
        html += `<div class="prop-row"><label>Offset X</label><input data-action="enemy-inner-prop" data-idx="${i}" data-key="dx" type="number" value="${Math.round(artifact.dx)}" step="1"/></div>`;
        html += `<div class="prop-row"><label>Offset Y</label><input data-action="enemy-inner-prop" data-idx="${i}" data-key="dy" type="number" value="${Math.round(artifact.dy)}" step="1"/></div>`;
        html += `<div class="prop-row"><button class="btn danger" data-action="remove-enemy-inner" data-idx="${i}" style="width:100%;font-size:10px">Remove Artifact</button></div>`;
      });
    }
    html += `<div class="prop-row"><button class="btn" data-action="add-enemy-inner" style="width:100%;font-size:10px">+ Add Inner Artifact</button></div>`;
    html += `<div class="circle-section-header">◔ Mouth</div>`;
    html += `<div class="prop-row"><label>Rest angle (°)</label><input data-action="set-prop-deg2rad" data-key="mouthRestAngle" type="number" value="${parseFloat(radToDeg(sel.mouthRestAngle).toFixed(1))}" min="-360" max="360" step="1"/></div>`;
    addNum('mouthTurnRate', 'Turn rate', 0, 1, 0.001);
    addNum('mouthReturnRate', 'Return rate', 0, 1, 0.001);
    addNum('mouthAbsorbRadius', 'Absorb radius', 1, 80, 0.1);
    html += `<div class="circle-section-header">◎ GIT</div>`;
    addNum('gitCircleOffsetAngleDeg', 'Offset angle °', -360, 360, 1);
    addNum('gitCircleOffsetDistanceMul', 'Offset distance × radius', -2, 3, 0.01);
    addNum('gitCircleRadiusMul', 'GIT radius × body', 0.05, 2, 0.01);
    addNum('gitMaxParticles', 'Max particles before egg', 1, 999, 1);
    addNum('gitParticleRadius', 'GIT particle radius', 0.1, 50, 0.1);
    addNum('gitParticleSpeed', 'GIT particle speed', 0, 10, 0.01);
    addNum('gitParticleMinSpeed', 'GIT particle min speed', 0, 10, 0.01);
    addNum('gitParticleFriction', 'GIT particle friction', 0, 1, 0.0005);
    addNum('gitParticleWallRestitution', 'GIT wall restitution', 0, 2, 0.01);
    html += `<div class="circle-section-header">◌ Egg / Reproduction</div>`;
    addNum('eggGrowthRate', 'Egg growth rate', 0, 5, 0.001);
    addNum('eggTargetRadius', 'Egg target radius', 1, 120, 0.1);
    addNum('eggDetachSpeed', 'Egg detach speed', 0, 10, 0.01);
    addNum('eggHatchEnemyRadius', 'Hatch enemy radius', 1, 200, 0.1);
    addNum('preLaySlowdownMs', 'Lay duration ms', 0, 60000, 10);
    addNum('preLayFriction', 'Lay friction', 0, 1, 0.0005);
    html += `<div class="circle-section-header">▣ Sprite / Anchor</div>`;
    addNum('spriteScale', 'Sprite scale', 0.05, 10, 0.01);
    html += `<div class="prop-row"><label>Sprite subfolder</label><input data-action="set-prop" data-key="spriteSubfolder" type="text" value="${sel.spriteSubfolder ?? ''}" placeholder="Enemy_01"/></div>`;
    addNum('spriteRotationOffset', 'Sprite rotation offset', -6.28, 6.28, 0.01);
    addNum('spriteBodyU', 'Sprite body U', -2, 2, 0.001);
    addNum('spriteBodyV', 'Sprite body V', -2, 2, 0.001);
    addNum('spriteMouthU', 'Sprite mouth U', -2, 2, 0.001);
    addNum('spriteMouthV', 'Sprite mouth V', -2, 2, 0.001);
    html += `<div class="circle-section-header">Animation Loop</div>`;
    html += `<div class="prop-row"><label>Animation enabled</label><div class="pz-toggle"><button data-action="set-prop" data-key="spriteAnimationEnabled" data-value="true" class="${sel.spriteAnimationEnabled ? 'on' : ''}">On</button><button data-action="set-prop" data-key="spriteAnimationEnabled" data-value="false" class="${!sel.spriteAnimationEnabled ? 'on' : ''}">Off</button></div></div>`;
    html += `<div class="prop-row"><label>Animation subfolder</label><input data-action="set-prop" data-key="spriteAnimationSubfolder" type="text" value="${sel.spriteAnimationSubfolder ?? ''}" placeholder="Enemy_01"/></div>`;
    addNum('spriteAnimationFrames', 'Frame count', 1, 9999, 1);
    addNum('spriteAnimationStart', 'Start frame', 1, 9999, 1);
    addNum('spriteAnimationFps', 'Animation FPS', 1, 120, 0.1);
    addNum('spriteAnimationPadding', 'Frame padding', 1, 10, 1);
    const git = getEnemyGitCircle(sel);
    const mouthAngleDeg = (getEnemyMouthAngleRad(sel) * 180 / Math.PI).toFixed(1);
    html += `<div class="prop-row"><label>Anatomy preview</label><div style="font-size:11px;color:#82e6f5;line-height:1.55">mouth: ${mouthAngleDeg}°<br>GIT: ${git.x.toFixed(1)}, ${git.y.toFixed(1)}<br>GIT radius: ${git.r.toFixed(2)}</div></div>`;
  } else if (sel.type === 'Player') {
    html += renderPlayerPropertyControls(sel, et);
  } else if (sel.type === 'ParticleZone') {
    html += `<div class="prop-row"><label>Zone radius</label><input data-action="set-prop" data-key="radius" type="number" value="${sel.radius}" min="8" max="320" step="1"/></div>`;
    html += `<div class="prop-row"><label>Min size</label><input data-action="set-prop" data-key="minSize" type="number" value="${sel.minSize ?? 10}" min="2" max="80" step="1"/></div>`;
    html += `<div class="prop-row"><label>Max size</label><input data-action="set-prop" data-key="maxSize" type="number" value="${sel.maxSize ?? 25}" min="2" max="100" step="1"/></div>`;
    html += `<div class="prop-row"><label>Spawn every ms</label><input data-action="set-prop" data-key="spawnIntervalMs" type="number" value="${sel.spawnIntervalMs ?? 1800}" min="80" max="30000" step="10"/></div>`;
    html += `<div class="prop-row"><label>Grow duration ms</label><input data-action="set-prop" data-key="growthDurationMs" type="number" value="${sel.growthDurationMs ?? 1200}" min="0" max="10000" step="10"/></div>`;
    html += `<div class="prop-row"><label>Spawn center °</label><input data-action="set-prop" data-key="spawnArcCenterDeg" type="number" value="${sel.spawnArcCenterDeg ?? 0}" min="-180" max="180" step="1"/></div>`;
    html += `<div class="prop-row"><label>Spawn span °</label><input data-action="set-prop" data-key="spawnArcSpanDeg" type="number" value="${sel.spawnArcSpanDeg ?? 360}" min="0" max="360" step="1"/></div>`;
    html += `<div class="prop-row"><label>Status</label><div style="font-size:11px;color:#a6e3a1">Spawns particles on the zone edge and lets them grow to target size.</div></div>`;
  } else if (sel.type === 'ComposedEntity') {
    ensureComposedEntityDefaults(sel);
    html += `<div class="prop-row"><label>Name</label><input data-action="set-prop" data-key="name" type="text" value="${sel.name ?? ''}" placeholder="ComposedEntity"/></div>`;
    html += `<div class="prop-row"><label>Size</label><div style="font-size:11px;color:#a6e3a1">width: ${Math.round(sel.width)} px<br>height: ${Math.round(sel.height)} px</div></div>`;
    html += `<div class="prop-row"><label>Children</label><div style="font-size:11px;color:#a6e3a1">${sel.entities?.length ?? 0} entities</div></div>`;
    html += `<div class="prop-row"><label>Anchor</label><div style="font-size:11px;color:var(--muted)">Top-left placement anchor</div></div>`;
  } else if (sel.type === 'Stone') {
    html += `<div class="prop-row"><label>Instance index</label><div style="display:flex;align-items:center;gap:6px"><span style="font-size:13px;font-weight:700;color:${badgeColor(sel.type)}">#</span><input data-action="set-prop" data-key="instanceIndex" type="number" value="${sel.instanceIndex ?? 1}" min="1" max="999" step="1" style="width:70px"/></div></div>`;
    html += `<div class="prop-row"><label>Radius</label><input data-action="set-prop" data-key="radius" type="number" value="${sel.radius}" min="5" max="200" step="1"/></div>`;
    html += `<div class="circle-section-header">Inner Artifacts</div>`;
    if (!sel.innerArtifacts?.length) {
      html += `<div class="prop-row"><label>Status</label><div style="font-size:11px;color:#a6e3a1">No inner artifacts yet.</div></div>`;
    } else {
      sel.innerArtifacts.forEach((artifact, i) => {
        html += `<div class="circle-row-header">Artifact ${i + 1}</div>`;
        html += `<div class="prop-row"><label>Sprite index</label><input data-action="inner-prop" data-idx="${i}" data-key="spriteIndex" type="number" value="${artifact.spriteIndex ?? 1}" min="1" max="5" step="1"/></div>`;
        html += `<div class="prop-row"><label>Radius</label><input data-action="inner-prop" data-idx="${i}" data-key="radius" type="number" value="${artifact.radius}" min="2" max="120" step="1"/></div>`;
        html += `<div class="prop-row"><label>Offset X</label><input data-action="inner-prop" data-idx="${i}" data-key="dx" type="number" value="${Math.round(artifact.dx)}" step="1"/></div>`;
        html += `<div class="prop-row"><label>Offset Y</label><input data-action="inner-prop" data-idx="${i}" data-key="dy" type="number" value="${Math.round(artifact.dy)}" step="1"/></div>`;
        html += `<div class="prop-row"><button class="btn danger" data-action="remove-inner" data-idx="${i}" style="width:100%;font-size:10px">Remove Artifact</button></div>`;
      });
    }
    html += `<div class="prop-row"><button class="btn" data-action="add-inner" style="width:100%;font-size:10px">+ Add Inner Artifact</button></div>`;
  } else {
    if (INDEXED_TYPES.includes(sel.type) && sel.instanceIndex != null) {
      html += `<div class="prop-row"><label>Instance index</label><div style="display:flex;align-items:center;gap:6px"><span style="font-size:13px;font-weight:700;color:${badgeColor(sel.type)}">#</span><input data-action="set-prop" data-key="instanceIndex" type="number" value="${sel.instanceIndex}" min="1" max="999" step="1" style="width:70px"/></div></div>`;
    }
    const allProps = [{ key:'radius', label:'Radius', type:'number', min:5, max:200 }, ...(et.props || []).filter(p => p.key !== 'radius')];
    allProps.forEach(prop => {
      const val = sel[prop.key] !== undefined ? sel[prop.key] : (prop.default ?? '');
      html += `<div class="prop-row"><label>${prop.label}</label><input data-action="set-prop" data-key="${prop.key}" type="${prop.type === 'number' ? 'number' : 'text'}" value="${val}" min="${prop.min ?? 0}" max="${prop.max ?? 9999}" step="${prop.step ?? 1}" placeholder="${prop.placeholder ?? ''}"/></div>`;
    });
  }
  html += `<button class="btn danger" data-action="delete-entity" style="margin:12px 14px">Delete entity</button>`;
  if (sel.type === 'Enemy') {
    html += `<div style="display:flex;gap:6px;margin:0 14px 12px">`;
    html += `<button class="btn info" data-action="save-selected-enemy" style="flex:1;font-size:10px">Save Enemy #${sel.instanceIndex}</button>`;
    html += `<button class="btn" data-action="toggle-anatomy" style="flex:1;font-size:10px">Overlay ${enemyAnatomyOverlay ? 'ON' : 'OFF'}</button>`;
    html += `</div>`;
    html += `<div style="margin:0 14px 12px"><button class="btn primary" data-action="open-sprite-cal" style="width:100%;font-size:10px">Calibrate Sprite</button></div>`;
  } else if (sel.type === 'ComposedStone') {
    html += `<div style="display:flex;gap:6px;margin:0 14px 12px">`;
    html += `<button class="btn info" data-action="save-selected-composedstone" style="flex:1;font-size:10px">Save ComposedStone #${sel.instanceIndex}</button>`;
    html += `</div>`;
    html += `<div style="margin:0 14px 12px"><button class="btn primary" data-action="open-sprite-cal" style="width:100%;font-size:10px">Calibrate Sprite</button></div>`;
  } else if (sel.type === 'Algae') {
    html += `<div style="display:flex;gap:6px;margin:0 14px 12px">`;
    html += `<button class="btn info" data-action="save-selected-algae" style="flex:1;font-size:10px">Save Algae #${sel.instanceIndex}</button>`;
    html += `</div>`;
    html += `<div style="margin:0 14px 12px"><button class="btn primary" data-action="open-sprite-cal" style="width:100%;font-size:10px">Calibrate Sprite</button></div>`;
  }
  propsPanel.innerHTML = html;
  enhancePropertyControls();
  enhanceCollapsibleSections(sel);
  restorePropsFocusState(focusState);
}

propsPanel.addEventListener('input', e => {
  if (e.target.matches('.prop-range')) {
    const number = e.target.parentElement?.querySelector('.prop-slider-number');
    if (number) {
      number.value = e.target.value;
      number.title = `${formatPropSliderValue(number.value, number.step)} | Mouse wheel adjusts value. Shift = coarse, Alt/Ctrl = fine.`;
    }
    e.target.title = formatPropSliderValue(e.target.value, e.target.step);
    updatePropRangeFill(e.target);
  } else if (e.target.matches('.prop-slider-number')) {
    const range = e.target.parentElement?.querySelector('.prop-range');
    if (range) {
      range.value = e.target.value;
      range.title = formatPropSliderValue(range.value, range.step);
      updatePropRangeFill(range);
    }
    e.target.title = `${formatPropSliderValue(e.target.value, e.target.step)} | Mouse wheel adjusts value. Shift = coarse, Alt/Ctrl = fine.`;
  }
  const t = e.target; const action = t.dataset.action; if (!action) return;
  if (action === 'set-prop') setProp(t.dataset.key, t.type === 'number' || t.type === 'range' ? +t.value : t.value);
  if (action === 'set-prop-deg2rad') setProp(t.dataset.key, degToRad(+t.value));
  if (action === 'player-collision-prop') setPlayerCollisionProp(t.dataset.target, t.dataset.key, t.tagName === 'SELECT' ? t.value : +t.value);
  if (action === 'mouth-prop') setStentorMouthProp(t.dataset.key, t.tagName === 'SELECT' ? t.value === 'true' : +t.value);
  if (action === 'mouth-range') setStentorMouthRange(+t.dataset.idx, +t.value);
  if (action === 'body-prop') setStentorBodyRotationProp(t.dataset.key, t.tagName === 'SELECT' ? t.value === 'true' : +t.value);
  if (action === 'body-range') setStentorBodyRotationRange(+t.dataset.idx, +t.value);
  if (action === 'macro-mouth-prop') setMacrophageMouthProp(t.dataset.key, t.tagName === 'SELECT' ? t.value === 'true' : +t.value);
  if (action === 'macro-mouth-range') setMacrophageMouthRange(+t.dataset.idx, +t.value);
  if (action === 'macro-mouth-cilia-prop') setMacrophageMouthCiliaProp(t.dataset.key, t.tagName === 'SELECT' ? t.value === 'true' : +t.value);
  if (action === 'macro-body-cilia-prop') setMacrophageBodyCiliaProp(t.dataset.key, t.tagName === 'SELECT' ? t.value === 'true' : +t.value);
  if (action === 'macro-body-cilia-segment-prop') setMacrophageBodyCiliaSegmentProp(+t.dataset.idx, t.dataset.key, t.tagName === 'SELECT' ? t.value === 'true' : +t.value);
  if (action === 'macro-body-prop') setMacrophageBodyRotationProp(t.dataset.key, t.tagName === 'SELECT' ? (t.dataset.key === 'enabled' ? t.value === 'true' : t.value) : +t.value);
  if (action === 'macro-body-idle-wave-prop') setMacrophageBodyIdleWaveProp(t.dataset.key, t.tagName === 'SELECT' ? t.value === 'true' : +t.value);
  if (action === 'macro-body-follow-prop') setMacrophageBodyFollowProp(t.dataset.key, t.tagName === 'SELECT' ? t.value === 'true' : +t.value);
  if (action === 'macro-body-range') setMacrophageBodyRotationRange(+t.dataset.idx, +t.value);
  if (action === 'macro-orbit-prop') setMacrophageOrbitProp(t.dataset.key, t.tagName === 'SELECT' ? (t.dataset.key === 'loop' || t.dataset.key === 'enabled' ? t.value === 'true' : t.value) : +t.value);
  if (action === 'macro-movement-mode') setMacrophageMovementMode(t.value);
  if (action === 'macro-orbit-segment-prop') setMacrophageOrbitSegmentProp(+t.dataset.idx, t.dataset.key, +t.value);
  if (action === 'macro-orbit-spline-point-prop') setMacrophageOrbitSplinePointProp(+t.dataset.idx, t.dataset.key, +t.value);
  if (action === 'macro-free-prop') setMacrophageFreeMoveProp(t.dataset.key, +t.value);
  if (action === 'add-macro-orbit-segment') addMacrophageOrbitSegment();
  if (action === 'remove-macro-orbit-segment') removeMacrophageOrbitSegment();
  if (action === 'add-macro-orbit-spline-point') addMacrophageOrbitSplinePoint();
  if (action === 'remove-macro-orbit-spline-point') removeMacrophageOrbitSplinePoint();
  if (action === 'add-macro-digest-point') addMacrophageDigestControlPoint();
  if (action === 'remove-macro-digest-point') removeMacrophageDigestControlPoint();
  if (action === 'add-macro-body-cilia-segment') addMacrophageBodyCiliaSegment();
  if (action === 'remove-macro-body-cilia-segment') removeMacrophageBodyCiliaSegment();
  if (action === 'macro-orbit-single') switchMacrophageOrbitMode(false);
  if (action === 'macro-orbit-spline') switchMacrophageOrbitSplineMode();
  if (action === 'macro-orbit-segments') switchMacrophageOrbitMode(true);
  if (action === 'macro-absorb-prop') setMacrophageAbsorbTargetProp(t.dataset.key, t.value === 'true');
  if (action === 'macro-growth-prop') setMacrophageGrowthProp(t.dataset.key, t.tagName === 'SELECT' ? t.value === 'true' : +t.value);
  if (action === 'macro-egg-prop') setMacrophageEggSpawnProp(t.dataset.key, +t.value);
  if (action === 'macro-germ-prop') setMacrophageGerminationProp(t.dataset.key, t.tagName === 'SELECT' ? t.value === 'true' : +t.value);
  if (action === 'algae-germ-prop') setAlgaeGerminationProp(t.dataset.key, t.tagName === 'SELECT' ? t.value === 'true' : +t.value);
  if (action === 'macro-projectile-prop') setMacrophageProjectileSpawnProp(t.dataset.key, +t.value);
  if (action === 'circle-prop') setCircleProp(+t.dataset.idx, t.dataset.key, +t.value);
  if (action === 'enemy-body-prop') setEnemyBodyCircleProp(+t.dataset.idx, t.dataset.key, +t.value);
  if (action === 'enemy-inner-prop') setEnemyInnerArtifactProp(+t.dataset.idx, t.dataset.key, +t.value);
  if (action === 'inner-prop') setInnerArtifactProp(+t.dataset.idx, t.dataset.key, +t.value);
});
propsPanel.addEventListener('change', e => {
  if (e.target.matches('.prop-range')) updatePropRangeFill(e.target);
  const t = e.target; const action = t.dataset.action; if (!action) return;
  if (action === 'set-prop') setProp(t.dataset.key, t.type === 'number' || t.type === 'range' ? +t.value : t.value);
  if (action === 'set-prop-deg2rad') setProp(t.dataset.key, degToRad(+t.value));
  if (action === 'player-collision-prop') setPlayerCollisionProp(t.dataset.target, t.dataset.key, t.tagName === 'SELECT' ? t.value : +t.value);
  if (action === 'mouth-prop') setStentorMouthProp(t.dataset.key, t.tagName === 'SELECT' ? t.value === 'true' : +t.value);
  if (action === 'mouth-range') setStentorMouthRange(+t.dataset.idx, +t.value);
  if (action === 'body-prop') setStentorBodyRotationProp(t.dataset.key, t.tagName === 'SELECT' ? t.value === 'true' : +t.value);
  if (action === 'body-range') setStentorBodyRotationRange(+t.dataset.idx, +t.value);
  if (action === 'macro-mouth-prop') setMacrophageMouthProp(t.dataset.key, t.tagName === 'SELECT' ? t.value === 'true' : +t.value);
  if (action === 'macro-mouth-range') setMacrophageMouthRange(+t.dataset.idx, +t.value);
  if (action === 'macro-mouth-cilia-prop') setMacrophageMouthCiliaProp(t.dataset.key, t.tagName === 'SELECT' ? t.value === 'true' : t.type === 'number' || t.type === 'range' ? +t.value : t.value);
  if (action === 'macro-body-cilia-prop') setMacrophageBodyCiliaProp(t.dataset.key, t.tagName === 'SELECT' ? t.value === 'true' : t.type === 'number' || t.type === 'range' ? +t.value : t.value);
  if (action === 'macro-body-cilia-segment-prop') setMacrophageBodyCiliaSegmentProp(+t.dataset.idx, t.dataset.key, t.tagName === 'SELECT' ? t.value === 'true' : t.type === 'number' || t.type === 'range' ? +t.value : t.value);
  if (action === 'macro-body-prop') setMacrophageBodyRotationProp(t.dataset.key, t.tagName === 'SELECT' ? (t.dataset.key === 'enabled' ? t.value === 'true' : t.value) : t.type === 'number' || t.type === 'range' ? +t.value : t.value);
  if (action === 'macro-body-idle-wave-prop') setMacrophageBodyIdleWaveProp(t.dataset.key, t.tagName === 'SELECT' ? t.value === 'true' : t.type === 'number' || t.type === 'range' ? +t.value : t.value);
  if (action === 'macro-body-follow-prop') setMacrophageBodyFollowProp(t.dataset.key, t.tagName === 'SELECT' ? t.value === 'true' : t.type === 'number' || t.type === 'range' ? +t.value : t.value);
  if (action === 'macro-body-range') setMacrophageBodyRotationRange(+t.dataset.idx, +t.value);
  if (action === 'macro-orbit-prop') setMacrophageOrbitProp(t.dataset.key, t.tagName === 'SELECT' ? (t.dataset.key === 'loop' || t.dataset.key === 'enabled' ? t.value === 'true' : t.value) : +t.value);
  if (action === 'macro-movement-mode') setMacrophageMovementMode(t.value);
  if (action === 'macro-orbit-segment-prop') setMacrophageOrbitSegmentProp(+t.dataset.idx, t.dataset.key, +t.value);
  if (action === 'macro-orbit-spline-point-prop') setMacrophageOrbitSplinePointProp(+t.dataset.idx, t.dataset.key, +t.value);
  if (action === 'macro-free-prop') setMacrophageFreeMoveProp(t.dataset.key, +t.value);
  if (action === 'macro-absorb-prop') setMacrophageAbsorbTargetProp(t.dataset.key, t.value === 'true');
  if (action === 'macro-growth-prop') setMacrophageGrowthProp(t.dataset.key, t.tagName === 'SELECT' ? t.value === 'true' : +t.value);
  if (action === 'macro-egg-prop') setMacrophageEggSpawnProp(t.dataset.key, +t.value);
  if (action === 'macro-germ-prop') setMacrophageGerminationProp(t.dataset.key, t.tagName === 'SELECT' ? t.value === 'true' : +t.value);
  if (action === 'algae-germ-prop') setAlgaeGerminationProp(t.dataset.key, t.tagName === 'SELECT' ? t.value === 'true' : +t.value);
  if (action === 'macro-projectile-prop') setMacrophageProjectileSpawnProp(t.dataset.key, +t.value);
  if (action === 'circle-prop') setCircleProp(+t.dataset.idx, t.dataset.key, +t.value);
  if (action === 'enemy-body-prop') setEnemyBodyCircleProp(+t.dataset.idx, t.dataset.key, +t.value);
  if (action === 'enemy-inner-prop') setEnemyInnerArtifactProp(+t.dataset.idx, t.dataset.key, +t.value);
  if (action === 'inner-prop') setInnerArtifactProp(+t.dataset.idx, t.dataset.key, +t.value);
});
propsPanel.addEventListener('click', e => {
  const t = e.target; const action = t.dataset.action; if (!action) return;
  if (action === 'set-prop' && Object.prototype.hasOwnProperty.call(t.dataset, 'value')) {
    setProp(t.dataset.key, t.dataset.value === 'true' ? true : t.dataset.value === 'false' ? false : t.dataset.value);
  }
  if (action === 'add-circle') addStentorCircle();
  if (action === 'remove-circle') removeLastStentorCircle();
  if (action === 'toggle-macro-mouth-overlay') { macrophageMouthOverlay = !macrophageMouthOverlay; renderProps(); render(); }
  if (action === 'toggle-macro-body-overlay') { macrophageBodyOverlay = !macrophageBodyOverlay; renderProps(); render(); }
  if (action === 'mirror-entity-x') toggleSelectedEntityMirrorX();
  if (action === 'toggle-macro-mouth-dir') {
    const sel = getSelected();
    if (sel?.type === 'Macrophage') setMacrophageMouthProp('rotationDir', (sel.mouth?.rotationDir ?? 1) >= 0 ? -1 : 1);
  }
  if (action === 'toggle-macro-body-dir') {
    const sel = getSelected();
    if (sel?.type === 'Macrophage') setMacrophageBodyRotationProp('rotationDir', (sel.bodyRotation?.rotationDir ?? 1) >= 0 ? -1 : 1);
  }
  if (action === 'add-macro-orbit-segment') addMacrophageOrbitSegment();
  if (action === 'remove-macro-orbit-segment') removeMacrophageOrbitSegment();
  if (action === 'add-macro-orbit-spline-point') addMacrophageOrbitSplinePoint();
  if (action === 'remove-macro-orbit-spline-point') removeMacrophageOrbitSplinePoint();
  if (action === 'add-macro-digest-point') addMacrophageDigestControlPoint();
  if (action === 'remove-macro-digest-point') removeMacrophageDigestControlPoint();
  if (action === 'macro-orbit-single') switchMacrophageOrbitMode(false);
  if (action === 'macro-orbit-spline') switchMacrophageOrbitSplineMode();
  if (action === 'macro-orbit-segments') switchMacrophageOrbitMode(true);
  if (action === 'macro-orbit-free') setMacrophageMovementMode('free');
  if (action === 'macro-orbit-ovoid') makeMacrophageOrbitOvoid();
  if (action === 'add-enemy-body') addEnemyBodyCircle();
  if (action === 'remove-enemy-body') removeEnemyBodyCircle();
  if (action === 'add-enemy-inner') addEnemyInnerArtifact();
  if (action === 'remove-enemy-inner') removeEnemyInnerArtifact(+t.dataset.idx);
  if (action === 'add-inner') addStoneInnerArtifact();
  if (action === 'remove-inner') removeStoneInnerArtifact(+t.dataset.idx);
  if (action === 'save-selected-enemy') {
    saveSelectedEnemyJSON().catch(err => {
      if (err?.name !== 'AbortError') setEditorStatus('Failed to save enemy preset: ' + err.message, 'error');
    });
  }
  if (action === 'save-selected-composedstone') saveSelectedComposedStoneJSON();
  if (action === 'save-selected-algae') saveSelectedAlgaeJSON();
  if (action === 'save-composed-entity') {
    saveSelectedGroupAsComposedEntity().catch(err => {
      if (err?.name !== 'AbortError') setEditorStatus('Failed to save composed entity: ' + err.message, 'error');
    });
  }
  if (action === 'save-composed-entity-and-calibrate') {
    saveSelectedGroupAsComposedEntity({ openSpriteCalibratorAfterSave: true }).catch(err => {
      if (err?.name !== 'AbortError') setEditorStatus('Failed to prepare composed entity sprite calibration: ' + err.message, 'error');
    });
  }
  if (action === 'calibrate-selected-composed-entity') openSpriteCalibratorForSelectedComposedEntity();
  if (action === 'export-preset-src') {
    writePresetToSrcByIndex().catch(err => {
      if (err?.name !== 'AbortError') alert('Failed to save preset to src: ' + err.message);
    });
  }
  if (action === 'toggle-anatomy') { enemyAnatomyOverlay = !enemyAnatomyOverlay; const btn = document.getElementById('btn-toggle-anatomy'); if (btn) btn.textContent = `Anatomy Overlay: ${enemyAnatomyOverlay ? 'ON' : 'OFF'}`; renderProps(); render(); }
  if (action === 'open-sprite-cal') openSpriteCalibrator();
  if (action === 'delete-entity') deleteSelected();
});

function buildJSON() {
  const referenceRect = getReferenceRect();
  const exportedEntities = entities.map(e => {
    const { _id, circles: rawCircles, ...rest } = e;
    const pointNorm = normalizePointToRect(e.x, e.y, referenceRect);
    const exported = {
      ...rest,
      xNorm: parseFloat((e.x/canvas.width).toFixed(5)),
      yNorm: parseFloat((e.y/canvas.height).toFixed(5)),
      xBgNorm: pointNorm.x,
      yBgNorm: pointNorm.y
    };
    if (e.type === 'Player') {
      exported.collisionProfile = normalizePlayerCollisionProfile(e.collisionProfile);
      delete exported.circles;
      delete exported.bodyCircles;
    }
    if (isMultiCircleEntity(e) && rawCircles?.length) {
      exported.circles = rawCircles.map(c => {
        const offsetNorm = normalizeVectorToRect(c.dx, c.dy, referenceRect);
        return {
          dxNorm: parseFloat((c.dx/canvas.width).toFixed(5)),
          dyNorm: parseFloat((c.dy/canvas.height).toFixed(5)),
          dxBgNorm: offsetNorm.dx,
          dyBgNorm: offsetNorm.dy,
          r:c.r
        };
      });
    }
    if ((e.type === 'Enemy' || e.type === 'Macrophage') && Array.isArray(e.bodyCircles) && e.bodyCircles.length > 0) {
      exported.bodyCircles = e.bodyCircles.map(circle => ({
        dxR: parseFloat((circle.dx / Math.max(e.radius, 0.0001)).toFixed(4)),
        dyR: parseFloat((circle.dy / Math.max(e.radius, 0.0001)).toFixed(4)),
        rR: parseFloat((circle.r / Math.max(e.radius, 0.0001)).toFixed(4))
      }));
    }
    if (e.type === 'Macrophage' && e.digestPath && typeof e.digestPath === 'object') {
      exported.digestPath = Object.fromEntries(
        Object.entries(e.digestPath).map(([key, point]) => [
          key,
          {
            dxR: parseFloat(((point?.dx ?? 0) / Math.max(e.radius, 0.0001)).toFixed(4)),
            dyR: parseFloat(((point?.dy ?? 0) / Math.max(e.radius, 0.0001)).toFixed(4))
          }
        ])
      );
    }
    if (e.type === 'Macrophage' && e.eggSpawn && typeof e.eggSpawn === 'object') {
      exported.eggSpawn = {
        bodyCircleIndex: Math.max(0, Math.round(e.eggSpawn.bodyCircleIndex ?? 0)),
        angleDeg: parseFloat((e.eggSpawn.angleDeg ?? 0).toFixed(3)),
        feedCount: Math.max(1, Math.round(e.eggSpawn.feedCount ?? 1))
      };
    }
    if (e.type === 'Macrophage' && e.germination && typeof e.germination === 'object') {
      exported.germination = {
        enabled: e.germination.enabled ?? false,
        mirrorOffspringX: e.germination.mirrorOffspringX ?? false,
        bodyCircleIndex: Math.max(0, Math.round(e.germination.bodyCircleIndex ?? 0)),
        angleDeg: parseFloat((e.germination.angleDeg ?? 0).toFixed(3)),
        feedCount: Math.max(1, Math.round(e.germination.feedCount ?? 1)),
        startScale: parseFloat((e.germination.startScale ?? 0.34).toFixed(3)),
        growthRate: parseFloat((e.germination.growthRate ?? 0.08).toFixed(3)),
        detachScale: parseFloat((e.germination.detachScale ?? 0.6).toFixed(3)),
        launchSpeed: parseFloat((e.germination.launchSpeed ?? 0.35).toFixed(3)),
        launchJitter: parseFloat((e.germination.launchJitter ?? 0.18).toFixed(3)),
        initialAngleJitterDeg: parseFloat((e.germination.initialAngleJitterDeg ?? 8).toFixed(3)),
        mouthWakeDelayMs: Math.max(0, Math.round(e.germination.mouthWakeDelayMs ?? 260))
      };
    }
    if (e.type === 'Algae' && e.germination && typeof e.germination === 'object') {
      exported.germination = {
        enabled: e.germination.enabled ?? false,
        mirrorOffspringX: e.germination.mirrorOffspringX ?? false,
        bodyCircleIndex: Math.max(0, Math.round(e.germination.bodyCircleIndex ?? 0)),
        angleDeg: parseFloat((e.germination.angleDeg ?? 0).toFixed(3)),
        feedCount: Math.max(1, Math.round(e.germination.feedCount ?? 1)),
        startScale: parseFloat((e.germination.startScale ?? 0.34).toFixed(3)),
        growthRate: parseFloat((e.germination.growthRate ?? 0.08).toFixed(3)),
        detachScale: parseFloat((e.germination.detachScale ?? 0.6).toFixed(3)),
        launchSpeed: parseFloat((e.germination.launchSpeed ?? 0.35).toFixed(3)),
        launchJitter: parseFloat((e.germination.launchJitter ?? 0.18).toFixed(3)),
        initialAngleJitterDeg: parseFloat((e.germination.initialAngleJitterDeg ?? 8).toFixed(3))
      };
    }
    if (e.type === 'Macrophage' && e.projectileSpawn && typeof e.projectileSpawn === 'object') {
      exported.projectileSpawn = {
        bodyCircleIndex: Math.max(0, Math.round(e.projectileSpawn.bodyCircleIndex ?? 0)),
        angleDeg: parseFloat((e.projectileSpawn.angleDeg ?? 0).toFixed(3))
      };
    }
    if (e.type === 'Macrophage' && e.growth && typeof e.growth === 'object') {
      exported.growth = {
        enabled: e.growth.enabled ?? false,
        perAbsorb: parseFloat((e.growth.perAbsorb ?? 0).toFixed(3)),
        maxRadius: parseFloat((e.growth.maxRadius ?? e.radius).toFixed(3)),
        growthRate: parseFloat((e.growth.growthRate ?? 0.03).toFixed(3))
      };
    }
    if (e.type === 'Macrophage' && e.bodyRotation && typeof e.bodyRotation === 'object') {
      exported.bodyRotation = {
        ...e.bodyRotation,
        baseAngleDeg: parseFloat((Number(e.bodyRotation.baseAngleDeg ?? 0) || 0).toFixed(3)),
        pivotDxR: parseFloat(((e.bodyRotation.pivotDx ?? 0) / Math.max(e.radius, 0.0001)).toFixed(4)),
        pivotDyR: parseFloat(((e.bodyRotation.pivotDy ?? 0) / Math.max(e.radius, 0.0001)).toFixed(4)),
        pivotRadiusR: parseFloat(((e.bodyRotation.pivotRadius ?? 12) / Math.max(e.radius, 0.0001)).toFixed(4))
      };
      delete exported.bodyRotation.pivotDx;
      delete exported.bodyRotation.pivotDy;
      delete exported.bodyRotation.pivotRadius;
    }
    if (e.type === 'Macrophage' && e.orbit && typeof e.orbit === 'object') {
      const orbitNorm = normalizeVectorToRect(e.orbit.centerDx ?? 0, e.orbit.centerDy ?? 0, referenceRect);
      const centerX = e.x + (e.orbit.centerDx ?? 0);
      const centerY = e.y + (e.orbit.centerDy ?? 0);
      const phaseDeg = (e.orbit.radius ?? 0) > 0.0001
        ? normalizeSignedDeg(radToDeg(Math.atan2(e.y - centerY, e.x - centerX)))
        : 0;
      exported.orbit = {
        ...e.orbit,
        mode: e.orbit.mode ?? 'orbit',
        centerDxNorm: parseFloat(((e.orbit.centerDx ?? 0) / canvas.width).toFixed(5)),
        centerDyNorm: parseFloat(((e.orbit.centerDy ?? 0) / canvas.height).toFixed(5)),
        centerDxBgNorm: orbitNorm.dx,
        centerDyBgNorm: orbitNorm.dy,
        radiusPx: parseFloat((e.orbit.radius ?? 0).toFixed(4)),
        radiusBgNorm: normalizeScalarToRect(e.orbit.radius ?? 0, referenceRect),
        phaseDeg: parseFloat(phaseDeg.toFixed(3)),
        loop: e.orbit.loop ?? true,
        freeMove: e.orbit.freeMove && typeof e.orbit.freeMove === 'object'
          ? {
              ...e.orbit.freeMove,
              previewRadiusPx: parseFloat((e.orbit.freeMove.previewRadius ?? 0).toFixed(4)),
              previewRadiusBgNorm: normalizeScalarToRect(e.orbit.freeMove.previewRadius ?? 0, referenceRect)
            }
          : undefined,
        segments: Array.isArray(e.orbit.segments) && e.orbit.segments.length > 0
          ? e.orbit.segments.map(segment => {
              const segmentNorm = normalizeVectorToRect(segment.centerDx ?? 0, segment.centerDy ?? 0, referenceRect);
              return {
                ...segment,
                centerDxNorm: parseFloat(((segment.centerDx ?? 0) / canvas.width).toFixed(5)),
                centerDyNorm: parseFloat(((segment.centerDy ?? 0) / canvas.height).toFixed(5)),
                centerDxBgNorm: segmentNorm.dx,
                centerDyBgNorm: segmentNorm.dy,
                radiusPx: parseFloat((segment.radius ?? 0).toFixed(4)),
                radiusBgNorm: normalizeScalarToRect(segment.radius ?? 0, referenceRect)
              };
            })
          : [],
        splinePoints: Array.isArray(e.orbit.splinePoints) && e.orbit.splinePoints.length > 2
          ? e.orbit.splinePoints.map(point => {
              const pointNorm = normalizeVectorToRect(point.dx ?? 0, point.dy ?? 0, referenceRect);
              return {
                dx: point.dx ?? 0,
                dy: point.dy ?? 0,
                dxNorm: parseFloat(((point.dx ?? 0) / canvas.width).toFixed(5)),
                dyNorm: parseFloat(((point.dy ?? 0) / canvas.height).toFixed(5)),
                dxBgNorm: pointNorm.dx,
                dyBgNorm: pointNorm.dy
              };
            })
          : []
      };
    }
    if (e.type === 'Macrophage') {
      delete exported.rotationDir;
      delete exported.rotationRange;
      delete exported.mouthAbsorbRadius;
      delete exported.mouthOffsetDistance;
    }
    if (e.type === 'Enemy' && Array.isArray(e.innerArtifacts) && e.innerArtifacts.length > 0) {
      exported.innerArtifacts = e.innerArtifacts.map(artifact => ({
        dxR: parseFloat(((artifact.dx ?? 0) / e.radius).toFixed(4)),
        dyR: parseFloat(((artifact.dy ?? 0) / e.radius).toFixed(4)),
        rR: parseFloat(((artifact.radius ?? Math.max(2, e.radius * 0.25)) / e.radius).toFixed(4)),
        spriteIndex: Math.min(ENEMY_SPRITE_INDEX_MAX, normalizeSpriteIndex(artifact.spriteIndex, 1))
      }));
    }
    if (e.type === 'Stone' && Array.isArray(e.innerArtifacts) && e.innerArtifacts.length > 0) {
      exported.innerArtifacts = e.innerArtifacts.map(artifact => ({
        dxR: parseFloat(((artifact.dx ?? 0) / e.radius).toFixed(4)),
        dyR: parseFloat(((artifact.dy ?? 0) / e.radius).toFixed(4)),
        rR: parseFloat(((artifact.radius ?? Math.max(2, e.radius * 0.25)) / e.radius).toFixed(4)),
        spriteIndex: normalizeSpriteIndex(artifact.spriteIndex, 1)
      }));
    }
    if (e.type === 'ParticleZone') {
      delete exported.randomCount;
      delete exported.count;
      delete exported.countMin;
      delete exported.countMax;
      delete exported.spriteIndexMin;
      delete exported.spriteIndexMax;
    }
    return exported;
  });
  const runtimeComposedEntities = getComposedEntityInstances()
    .map(instance => buildComposedEntityRuntimeExport(instance, referenceRect))
    .filter(Boolean);
  return JSON.stringify({
    version: 1,
    canvasRef: { width: canvas.width, height: canvas.height },
    initialView: getInitialViewRect(),
    background: buildBackgroundExport(),
    entities: [...exportedEntities, ...runtimeComposedEntities]
  }, null, 2);
}

function rebuildSceneFromCurrentState() {
  try {
    const data = JSON.parse(buildJSON());
    applyLevelData(data);
  } catch (err) {
    setEditorStatus('Scene rebuild failed: ' + err.message, 'error');
  }
}

function stripEditorTransientEntityState(entity) {
  if (!entity || typeof entity !== 'object') return entity;
  const clone = { ...entity };
  delete clone._editorLastRenderableSpriteImage;
  delete clone._editorPreviewLastRenderableSpriteImage;
  return clone;
}

function captureEditorSceneState(options = {}) {
  const { includeBackgroundAsset = true } = options;
  const background = buildBackgroundExport();
  return {
    entities: structuredClone(entities.map(stripEditorTransientEntityState)),
    selectedId,
    selectedIds: structuredClone(selectedIds),
    selectedComposedEntityInstanceId,
    idCounter,
    activeIndex: structuredClone(activeIndex),
    importedLevelGeometry: importedLevelGeometry ? structuredClone(importedLevelGeometry) : null,
    background: includeBackgroundAsset ? background : background ? {
      name: background.name,
      alpha: background.alpha,
      offsetXNorm: background.offsetXNorm,
      offsetYNorm: background.offsetYNorm,
      scaleMul: background.scaleMul
    } : null,
    backgroundOffsetX,
    backgroundOffsetY,
    backgroundScale,
    backgroundAlpha: backgroundImageAlpha,
    backgroundEditMode
  };
}

function restoreEditorSceneState(snapshot) {
  if (!snapshot) return;
  entities = structuredClone(snapshot.entities);
  selectedId = snapshot.selectedId;
  selectedIds = Array.isArray(snapshot.selectedIds)
    ? structuredClone(snapshot.selectedIds)
    : (snapshot.selectedId != null ? [snapshot.selectedId] : []);
  selectedComposedEntityInstanceId = snapshot.selectedComposedEntityInstanceId ?? null;
  idCounter = snapshot.idCounter;
  Object.assign(activeIndex, snapshot.activeIndex);
  importedLevelGeometry = snapshot.importedLevelGeometry ? structuredClone(snapshot.importedLevelGeometry) : null;
  syncSelectionState();
  backgroundOffsetX = snapshot.backgroundOffsetX;
  backgroundOffsetY = snapshot.backgroundOffsetY;
  backgroundScale = snapshot.backgroundScale;
  backgroundImageAlpha = snapshot.backgroundAlpha;
  backgroundEditMode = snapshot.backgroundEditMode;
  if (snapshot.background?.src) {
    applyBackgroundState(snapshot.background.src, snapshot.background.name ?? 'background.png', {
      alpha: snapshot.background.alpha ?? snapshot.backgroundAlpha,
      offsetXNorm: snapshot.background.offsetXNorm,
      offsetYNorm: snapshot.background.offsetYNorm,
      scaleMul: snapshot.background.scaleMul,
      onLoad: () => {
        backgroundEditMode = snapshot.backgroundEditMode;
        renderProps();
        render();
      }
    });
    return;
  }

  if (!backgroundImage) clearBackgroundImage();
  backgroundEditMode = snapshot.backgroundEditMode;
  renderProps();
  render();
}

function saveEditorDraft() {
  try {
    if (!entities.length && !backgroundImage && selectedIds.length === 0) return;
    const snapshot = captureEditorSceneState({ includeBackgroundAsset: false });
    sessionStorage.setItem(EDITOR_DRAFT_STORAGE_KEY, JSON.stringify(snapshot));
  } catch (_) {}

  if (!entities.length && !backgroundImage && selectedIds.length === 0) return;
  const fullSnapshot = captureEditorSceneState({ includeBackgroundAsset: true });
  setStoredHandle(EDITOR_DRAFT_FULL_KEY, fullSnapshot).catch(() => {});
}

function loadEditorDraft() {
  try {
    const raw = sessionStorage.getItem(EDITOR_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

async function loadFullEditorDraft() {
  try {
    return await getStoredHandle(EDITOR_DRAFT_FULL_KEY);
  } catch (_) {
    return null;
  }
}

function restoreEditorDraftIfNeeded(force = false) {
  const snapshot = loadEditorDraft();
  if (!snapshot) return false;
  if (!force && entities.length) return false;
  restoreEditorSceneState(snapshot);
  return true;
}

async function restoreFullEditorDraftIfNeeded(force = false) {
  const snapshot = await loadFullEditorDraft();
  if (!snapshot) return false;
  if (!force && entities.length) return false;
  restoreEditorSceneState(snapshot);
  return true;
}

function verifySceneAfterSave() {
  if (!pendingSaveRecoverySnapshot) return;

  const snapshot = pendingSaveRecoverySnapshot;
  const label = pendingSaveRecoveryLabel || 'save';
  const entityCount = entities.length;
  const wrapWidth = Math.max(0, wrap.clientWidth || 0);
  const wrapHeight = Math.max(0, wrap.clientHeight || 0);

  if (!entityCount && snapshot.entities?.length) {
    restoreEditorSceneState(snapshot);
    setEditorStatus(
      `${label}: scene auto-restored (${snapshot.entities.length} entities). canvas ${canvas.width}x${canvas.height}, wrap ${wrapWidth}x${wrapHeight}.`,
      'warning'
    );
  } else {
    setEditorStatus(
      `${label}: entities ${entityCount}, canvas ${canvas.width}x${canvas.height}, wrap ${wrapWidth}x${wrapHeight}.`,
      'info'
    );
  }

  pendingSaveRecoverySnapshot = null;
  pendingSaveRecoveryLabel = '';
}

function recoverCanvasAfterSystemDialog() {
  restoreEditorDraftIfNeeded();
  resizeCanvas();
  renderProps();
  render();
}

function repairIndices() {
  for (const type of INDEXED_TYPES) {
    const group = entities.filter(e => e.type === type); const used = new Set(group.filter(e => e.instanceIndex != null).map(e => e.instanceIndex));
    for (const item of group) { if (item.instanceIndex != null) continue; let n = 1; while (used.has(n)) n++; item.instanceIndex = n; used.add(n); }
  }
}

function applyLevelData(data) {
  if (!data?.entities) throw new Error('JSON does not contain an entities array.');
  importedLevelGeometry = (data.canvasRef || data.initialView)
    ? {
        canvasRef: data.canvasRef ?? null,
        initialView: data.initialView ?? null
      }
    : null;

  const finishImport = () => {
    const canvasRefRect = getCanvasRefRect(data.canvasRef ?? null);
    const referenceRect = data.background?.src ? getReferenceRect() : canvasRefRect;
    const importRectOptions = { normRect: canvasRefRect };
    let playerImported = false;
    entities = data.entities.map(e => {
      if (e?.type === 'ComposedEntity' && e?.runtimeOnly) return null;
      if (e.type === 'Player') {
        if (playerImported) return null;
        playerImported = true;
      }
      const resolvedPoint = resolvePointFromRect(e, referenceRect, importRectOptions);
      const ent = { ...e, _id:idCounter++, x: resolvedPoint.x, y: resolvedPoint.y };
      if (e.type === 'Stentor') {
        if (Array.isArray(e.circles) && e.circles.length > 0) ent.circles = e.circles.map(c => ({ ...resolveVectorFromRect(c, referenceRect, importRectOptions), r:c.r }));
        else { const r = ent.radius ?? 38; ent.circles = [{ dx:0, dy:0, r }, { dx:0, dy:Math.round(r*0.90), r:Math.round(r*0.65) }, { dx:0, dy:Math.round(r*1.60), r:Math.round(r*0.38) }]; }
        ent.mouth = e.mouth ?? makeDefaultStentorMouth(); ent.bodyRotation = e.bodyRotation ?? makeDefaultStentorBodyRotation();
      }
      if (e.type === 'ComposedStone') {
        if (Array.isArray(e.circles) && e.circles.length > 0) ent.circles = e.circles.map(c => ({ ...resolveVectorFromRect(c, referenceRect, importRectOptions), r:c.r }));
        else ent.circles = makeDefaultComposedStoneCircles(ent.radius ?? 34);
      }
      if (e.type === 'Algae') {
        if (Array.isArray(e.circles) && e.circles.length > 0) ent.circles = e.circles.map(c => ({ ...resolveVectorFromRect(c, referenceRect, importRectOptions), r:c.r }));
        else ent.circles = makeDefaultAlgaeCircles(ent.radius ?? 30);
      }
      if (e.type === 'ComposedEntity') {
        ent.entities = Array.isArray(e.entities) ? e.entities.map(child => ({ ...child })) : [];
        ent.width = Math.max(12, clampNum(e.width, e.bounds?.width ?? 80));
        ent.height = Math.max(12, clampNum(e.height, e.bounds?.height ?? 80));
        ent.bounds = {
          minX: clampNum(e.bounds?.minX, 0),
          minY: clampNum(e.bounds?.minY, 0),
          maxX: clampNum(e.bounds?.maxX, ent.width),
          maxY: clampNum(e.bounds?.maxY, ent.height),
          width: ent.width,
          height: ent.height
        };
      }
      if (e.type === 'Stone') {
        ent.innerArtifacts = Array.isArray(e.innerArtifacts)
          ? e.innerArtifacts.map(artifact => ({
              dx: Math.round((artifact.dxR ?? 0) * (ent.radius ?? 28)),
              dy: Math.round((artifact.dyR ?? 0) * (ent.radius ?? 28)),
              radius: Math.max(2, Math.round((artifact.rR ?? 0.25) * (ent.radius ?? 28))),
              spriteIndex: normalizeSpriteIndex(artifact.spriteIndex, 1)
            }))
          : [];
      }
      if (e.type === 'Enemy') {
        ent.bodyCircles = Array.isArray(e.bodyCircles) && e.bodyCircles.length > 0
          ? e.bodyCircles.map(circle => ({
              dx: Math.round((circle.dxR ?? 0) * (ent.radius ?? 25)),
              dy: Math.round((circle.dyR ?? 0) * (ent.radius ?? 25)),
              r: Math.max(2, Math.round((circle.rR ?? 1) * (ent.radius ?? 25)))
            }))
          : makeDefaultEnemyBodyCircles(ent.radius ?? 25);
        ent.innerArtifacts = Array.isArray(e.innerArtifacts)
          ? e.innerArtifacts.map(artifact => ({
              dx: Math.round((artifact.dxR ?? 0) * (ent.radius ?? 25)),
              dy: Math.round((artifact.dyR ?? 0) * (ent.radius ?? 25)),
              radius: Math.max(2, Math.round((artifact.rR ?? 0.25) * (ent.radius ?? 25))),
              spriteIndex: Math.min(ENEMY_SPRITE_INDEX_MAX, normalizeSpriteIndex(artifact.spriteIndex, 1))
            }))
          : [];
      }
      if (e.type === 'Macrophage') {
        ent.bodyCircles = Array.isArray(e.bodyCircles) && e.bodyCircles.length > 0
          ? e.bodyCircles.map(circle => ({
              dx: Math.round((circle.dxR ?? 0) * (ent.radius ?? 38)),
              dy: Math.round((circle.dyR ?? 0) * (ent.radius ?? 38)),
              r: Math.max(2, Math.round((circle.rR ?? 1) * (ent.radius ?? 38)))
            }))
          : makeDefaultMacrophageBodyCircles(ent.radius ?? 38);
        if (e.digestPath && typeof e.digestPath === 'object') {
          ent.digestPath = Object.fromEntries(
            Object.entries(e.digestPath).map(([key, point]) => [
              key,
              {
                dx: Math.round((point?.dxR ?? 0) * (ent.radius ?? 38)),
                dy: Math.round((point?.dyR ?? 0) * (ent.radius ?? 38))
              }
            ])
          );
        }
        if (e.eggSpawn && typeof e.eggSpawn === 'object') {
          ent.eggSpawn = {
            ...makeDefaultMacrophageEggSpawn(),
            ...e.eggSpawn
          };
        }
        if (e.germination && typeof e.germination === 'object') {
          ent.germination = {
            ...makeDefaultMacrophageGermination(),
            ...e.germination
          };
        }
        if (e.projectileSpawn && typeof e.projectileSpawn === 'object') {
          ent.projectileSpawn = {
            ...makeDefaultMacrophageProjectileSpawn(),
            ...e.projectileSpawn
          };
        }
        if (e.growth && typeof e.growth === 'object') {
          ent.growth = {
            ...makeDefaultMacrophageGrowth(),
            ...e.growth
          };
        }
        if (e.bodyRotation && typeof e.bodyRotation === 'object') {
          const idleWave = (e.bodyRotation?.idleWave && typeof e.bodyRotation.idleWave === 'object')
            ? e.bodyRotation.idleWave
            : {};
          const movementFollow = (e.bodyRotation?.movementFollow && typeof e.bodyRotation.movementFollow === 'object')
            ? e.bodyRotation.movementFollow
            : {};
          ent.bodyRotation = {
            ...makeDefaultMacrophageBodyRotation(),
            ...e.bodyRotation,
            idleWave: {
              ...makeDefaultMacrophageBodyRotation().idleWave,
              ...idleWave,
              enabled: idleWave.enabled ?? false,
              amount: Math.max(0, Math.min(1, clampNum(idleWave.amount, 0.35))),
              speedHz: Math.max(0, clampNum(idleWave.speedHz, 0.45))
            },
            rotationMode: e.bodyRotation?.rotationMode === 'loop' ? 'loop' : 'pingpong',
            baseAngleDeg: normalizeSignedDeg(clampNum(e.bodyRotation?.baseAngleDeg, 0)),
            movementFollow: {
              ...makeDefaultMacrophageBodyRotation().movementFollow,
              ...movementFollow,
              enabled: movementFollow.enabled ?? false,
              strength: Math.max(0, Math.min(1, clampNum(movementFollow.strength, 0.35))),
              smoothing: Math.max(0, Math.min(1, clampNum(movementFollow.smoothing, 0.08))),
              minSpeed: Math.max(0, clampNum(movementFollow.minSpeed, 0.18))
            },
            pivotDx: Number.isFinite(Number(e.bodyRotation?.pivotDx))
              ? Number(e.bodyRotation.pivotDx)
              : Math.round((Number(e.bodyRotation?.pivotDxR ?? 0) || 0) * (ent.radius ?? 38)),
            pivotDy: Number.isFinite(Number(e.bodyRotation?.pivotDy))
              ? Number(e.bodyRotation.pivotDy)
              : Math.round((Number(e.bodyRotation?.pivotDyR ?? 0) || 0) * (ent.radius ?? 38)),
            pivotRadius: Math.max(
              4,
              Number.isFinite(Number(e.bodyRotation?.pivotRadius))
                ? Number(e.bodyRotation.pivotRadius)
                : Math.round((Number(e.bodyRotation?.pivotRadiusR ?? (12 / Math.max(ent.radius ?? 38, 0.0001))) || 0) * (ent.radius ?? 38))
            )
          };
        }
        if (e.orbit && typeof e.orbit === 'object') {
          const orbitVector = resolveVectorFromRect(
            {
              dx: e.orbit.centerDx,
              dy: e.orbit.centerDy,
              dxNorm: e.orbit.centerDxNorm,
              dyNorm: e.orbit.centerDyNorm,
              dxBgNorm: e.orbit.centerDxBgNorm,
              dyBgNorm: e.orbit.centerDyBgNorm
            },
            referenceRect,
            importRectOptions
          );
          const orbitSegments = Array.isArray(e.orbit.segments)
            ? e.orbit.segments.map(segment => {
                const segmentVector = resolveVectorFromRect(
                  {
                    dx: segment.centerDx,
                    dy: segment.centerDy,
                    dxNorm: segment.centerDxNorm,
                    dyNorm: segment.centerDyNorm,
                    dxBgNorm: segment.centerDxBgNorm,
                    dyBgNorm: segment.centerDyBgNorm
                  },
                  referenceRect,
                  importRectOptions
                );
                return makeDefaultMacrophageOrbitSegment({
                  ...segment,
                  centerDx: segmentVector.dx,
                  centerDy: segmentVector.dy,
                  radius: Math.max(
                    0,
                    Number.isFinite(Number(segment?.radius))
                      ? Number(segment.radius)
                      : Number(segment?.radiusPx ?? 0) || 0
                  )
                });
              })
            : [];
          const orbitSplinePoints = Array.isArray(e.orbit.splinePoints)
            ? e.orbit.splinePoints.map(point => {
                const pointVector = resolveVectorFromRect(
                  {
                    dx: point.dx,
                    dy: point.dy,
                    dxNorm: point.dxNorm,
                    dyNorm: point.dyNorm,
                    dxBgNorm: point.dxBgNorm,
                    dyBgNorm: point.dyBgNorm
                  },
                  referenceRect,
                  importRectOptions
                );
                return {
                  dx: pointVector.dx,
                  dy: pointVector.dy
                };
              })
            : [];
          ent.orbit = {
            ...makeDefaultMacrophageOrbit(),
            ...e.orbit,
            mode: ['orbit', 'segments', 'spline', 'free'].includes(e.orbit?.mode) ? e.orbit.mode : (orbitSplinePoints.length > 2 ? 'spline' : (orbitSegments.length > 0 ? 'segments' : 'orbit')),
            centerDx: orbitVector.dx,
            centerDy: orbitVector.dy,
            radius: Math.max(
              0,
              Number.isFinite(Number(e.orbit?.radius))
                ? Number(e.orbit.radius)
                : Number(e.orbit?.radiusPx ?? 0) || 0
            ),
            speed: clampNum(e.orbit?.speed, 0.01),
            loop: e.orbit?.loop ?? true,
            segments: orbitSegments,
            splinePoints: orbitSplinePoints.length > 2 ? orbitSplinePoints : makeDefaultMacrophageOrbitSplinePoints(Math.max(Number(e.orbit?.radius ?? 0) || 0, ent.radius * 2.4, 80)),
            freeMove: makeDefaultMacrophageFreeMove({
              ...e.orbit?.freeMove,
              previewRadius: Number.isFinite(Number(e.orbit?.freeMove?.previewRadius))
                ? Number(e.orbit.freeMove.previewRadius)
                : Number(e.orbit?.freeMove?.previewRadiusPx ?? 0) || 140
            })
          };
        }
        if (e.absorbTargets && typeof e.absorbTargets === 'object') {
          ent.absorbTargets = {
            ...makeDefaultMacrophageAbsorbTargets(),
            ...e.absorbTargets,
            particle: e.absorbTargets.particle !== false,
            projectile: !!e.absorbTargets.projectile,
            player: !!e.absorbTargets.player,
            enemy: !!e.absorbTargets.enemy
          };
        }
      }
      if (e.type === 'Player') {
        ensurePlayerDefaults(ent);
      }
      if (e.type === 'Macrophage') ensureMacrophageDefaults(ent);
      if (e.type === 'Particle') ensureParticleDefaults(ent);
      if (e.type === 'ParticleZone') Object.assign(ent, {
        minSize: ent.minSize ?? 10,
        maxSize: ent.maxSize ?? 25,
        spawnIntervalMs: ent.spawnIntervalMs ?? 1800,
        growthDurationMs: ent.growthDurationMs ?? 1200,
        spriteIndex: ent.spriteIndex ?? ent.spriteIndexMin ?? 1,
        spawnArcCenterDeg: ent.spawnArcCenterDeg ?? 0,
        spawnArcSpanDeg: ent.spawnArcSpanDeg ?? 360
      });
      if (e.type === 'ParticleZone') ensureParticleZoneDefaults(ent);
      if (e.type === 'Cyst') ensureCystDefaults(ent);
      if (e.type === 'Enemy') ensureEnemyDefaults(ent);
      if (e.type === 'ComposedStone') ensureComposedStoneDefaults(ent);
      if (e.type === 'Algae') ensureAlgaeDefaults(ent);
      if (e.type === 'ComposedEntity') ensureComposedEntityDefaults(ent);
      return ent;
    }).filter(Boolean);
    clampEditorEntitiesInsideCanvas();
    repairIndices(); for (const type of INDEXED_TYPES) activeIndex[type] = getNextInstanceIndex(type); clearSelection(); renderProps(); render(); closeModal();
  };

  if (data.background?.src) {
    applyBackgroundState(data.background.src, data.background.name ?? 'background.png', {
      alpha: data.background.alpha,
      offsetXNorm: data.background.offsetXNorm,
      offsetYNorm: data.background.offsetYNorm,
      scaleMul: data.background.scaleMul,
      canvasRef: data.canvasRef ?? null,
      onLoad: finishImport
    });
  } else {
    clearBackgroundImage();
    finishImport();
  }
}

async function readJsonFromFile(file) {
  return JSON.parse(await file.text());
}

async function ensureProjectRootAccess() {
  if (projectRootHandle) return projectRootHandle;
  if (!window.showDirectoryPicker) throw new Error('This browser does not support folder access.');

  try {
    const restoredHandle = await getStoredHandle(PROJECT_ROOT_HANDLE_KEY);
    if (restoredHandle) {
      const permission = await restoredHandle.queryPermission({ mode: 'readwrite' });
      if (permission === 'granted' || permission === 'prompt') {
        const requested = permission === 'granted'
          ? 'granted'
          : await restoredHandle.requestPermission({ mode: 'readwrite' });
        if (requested === 'granted') {
          projectRootHandle = restoredHandle;
          updateProjectDisplay();
          return projectRootHandle;
        }
      }
    }
  } catch (_) {}

  projectRootHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
  if (projectRootHandle?.name !== PROJECT_ROOT_LABEL) {
    alert(`Tip: pick the project root folder ${PROJECT_ROOT_LABEL} so src and LEVELS work automatically.`);
  }
  await setStoredHandle(PROJECT_ROOT_HANDLE_KEY, projectRootHandle);
  updateProjectDisplay();
  return projectRootHandle;
}

async function restoreProjectRootHandleSilently() {
  try {
    const restoredHandle = await getStoredHandle(PROJECT_ROOT_HANDLE_KEY);
    if (!restoredHandle) return;
    const permission = await restoredHandle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted') return;
    projectRootHandle = restoredHandle;
    updateProjectDisplay();
    loadEntitiesFromFolder({ silent: true }).catch(() => {});
  } catch (_) {}
}

async function ensureLevelsDirectoryAccess() {
  if (levelsDirHandle) return levelsDirHandle;
  const rootHandle = await ensureProjectRootAccess();
  levelsDirHandle = await rootHandle.getDirectoryHandle(LEVELS_DIR_LABEL, { create: true });
  return levelsDirHandle;
}

async function ensureSrcDirectoryAccess() {
  if (srcDirHandle) return srcDirHandle;
  const rootHandle = await ensureProjectRootAccess();
  srcDirHandle = await rootHandle.getDirectoryHandle('src');
  return srcDirHandle;
}

async function writePresetToSrcByIndex() {
  const sel = getSelected();
  if (!sel) throw new Error('Select an entity first.');
  const sceneSnapshot = captureEditorSceneState();
  pendingSaveRecoverySnapshot = sceneSnapshot;
  pendingSaveRecoveryLabel = 'Preset save';

  const presetSpec = getSrcPresetSpecForEntity(sel);
  if (!presetSpec) throw new Error(`Direct src export is not configured for ${sel.type}.`);

  const srcHandle = await ensureSrcDirectoryAccess();
  const typeDirHandle = await srcHandle.getDirectoryHandle(presetSpec.folder, { create: true });
  const slotDirHandle = await typeDirHandle.getDirectoryHandle(presetSpec.subfolder, { create: true });
  const fileHandle = await slotDirHandle.getFileHandle(presetSpec.filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(presetSpec.data, null, 2));
  await writable.close();

  await loadEntitiesFromFolder({ silent: true });
  restoreEditorSceneState(sceneSnapshot);
  setEditorStatus(`Saved preset to src/${presetSpec.folder}/${presetSpec.subfolder}/${presetSpec.filename}`, 'success');
  setTimeout(verifySceneAfterSave, 0);
  setTimeout(verifySceneAfterSave, 120);
  setTimeout(verifySceneAfterSave, 350);
}

async function saveSelectedGroupAsComposedEntity(options = {}) {
  const { openSpriteCalibratorAfterSave = false } = options;
  const selection = getSelectedEntities();
  if (selection.length < 2) {
    setEditorStatus('Select at least two entities first.', 'warning');
    return;
  }

  const defaultName = `composed_entity_${String(Date.now()).slice(-6)}`;
  const requestedName = prompt('ComposedEntity file name:', defaultName);
  if (!requestedName) return;

  const safeName = makeSafeFilename(requestedName);
  const exportData = buildComposedEntityExport(selection, safeName);
  const folderName = getComposedEntitySpriteFolderName(exportData, exportData.spriteSubfolder);
  const filename = getComposedEntityJsonFileName(exportData);
  const sourcePath = buildComposedEntitySourcePath(exportData, filename);

  const sceneSnapshot = captureEditorSceneState();
  pendingSaveRecoverySnapshot = sceneSnapshot;
  pendingSaveRecoveryLabel = 'ComposedEntity save';

  try {
    sceneResizeLocked = true;
    if (window.showDirectoryPicker) {
      const srcHandle = await ensureSrcDirectoryAccess();
      const composedDirHandle = await srcHandle.getDirectoryHandle('ComposedEntity', { create: true });
      const slotDirHandle = await composedDirHandle.getDirectoryHandle(folderName, { create: true });
      const fileHandle = await slotDirHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(exportData, null, 2));
      await writable.close();
      await loadEntitiesFromFolder({ silent: true });
      const savedPreset = entityPresetsByType.ComposedEntity?.find(p => p.sourcePath === sourcePath)
        ?? entityPresetsByType.ComposedEntity?.find(p => makeSafeFilename(p.name) === safeName)
        ?? null;
      if (savedPreset) {
        activeEntityPreset.ComposedEntity = savedPreset.id;
      }
      setEditorStatus(`Saved composed selection to src/ComposedEntity/${folderName}/${filename}`, 'success');
      if (openSpriteCalibratorAfterSave) {
        selectTool('ComposedEntity');
        buildPresetPanel();
        openSpriteCalibrator();
      }
    } else {
      await downloadJson(filename, exportData);
      setEditorStatus(`Downloaded composed selection as ${filename}.`, 'success');
      if (openSpriteCalibratorAfterSave) {
        setEditorStatus('Sprite calibration needs a project folder so the preset can be saved into src/ComposedEntity first.', 'warning');
      }
    }
  } finally {
    sceneResizeLocked = false;
    restoreEditorSceneState(sceneSnapshot);
    saveEditorDraft();
    setTimeout(recoverCanvasAfterSystemDialog, 0);
    setTimeout(recoverCanvasAfterSystemDialog, 80);
    setTimeout(verifySceneAfterSave, 0);
    setTimeout(verifySceneAfterSave, 120);
  }
}

async function writeActiveComposedEntityPresetToSrc() {
  const preset = entityPresetsByType.ComposedEntity?.find(p => p.id === activeEntityPreset.ComposedEntity) ?? entityPresetsByType.ComposedEntity?.[0] ?? null;
  if (!preset?.data) throw new Error('No ComposedEntity preset selected.');
  ensureComposedEntityDefaults(preset.data);
  const sourcePath = typeof preset.sourcePath === 'string' && preset.sourcePath
    ? preset.sourcePath
    : buildComposedEntitySourcePath(preset.data, getComposedEntityJsonFileName(preset.data));
  const pathParts = sourcePath.split('/').filter(Boolean);
  if (pathParts.length < 3 || pathParts[0] !== 'src' || pathParts[1] !== 'ComposedEntity') {
    throw new Error('Unsupported ComposedEntity source path.');
  }

  const srcHandle = await ensureSrcDirectoryAccess();
  let dirHandle = await srcHandle.getDirectoryHandle('ComposedEntity', { create: true });
  const folderName = getComposedEntitySpriteFolderName(preset.data, preset.data.spriteSubfolder);
  const fileName = getComposedEntityJsonFileName(preset.data);
  const normalizedParts = ['src', 'ComposedEntity', folderName, fileName];
  for (let i = 2; i < normalizedParts.length - 1; i++) {
    dirHandle = await dirHandle.getDirectoryHandle(normalizedParts[i], { create: true });
  }
  const fileHandle = await dirHandle.getFileHandle(normalizedParts[normalizedParts.length - 1], { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify({
    ...preset.data,
    id: preset.id,
    name: preset.name,
    type: 'ComposedEntity'
  }, null, 2));
  await writable.close();
  preset.sourcePath = normalizedParts.join('/');
  setEditorStatus(`Saved ComposedEntity preset to ${preset.sourcePath}`, 'success');
}

function openSpriteCalibratorForSelectedComposedEntity() {
  const instance = getSelectedComposedEntityInstance();
  if (!instance) {
    setEditorStatus('Select a ComposedEntity group first.', 'warning');
    return;
  }
  const preset = entityPresetsByType.ComposedEntity?.find(p =>
    (instance.presetId && p.id === instance.presetId) ||
    (instance.sourcePath && p.sourcePath === instance.sourcePath)
  ) ?? null;
  if (!preset) {
    setEditorStatus('ComposedEntity preset not found in loaded presets.', 'warning');
    return;
  }
  activeEntityPreset.ComposedEntity = preset.id;
  selectTool('ComposedEntity');
  buildPresetPanel();
  openSpriteCalibrator();
}

async function saveLevelToLevelsFolder() {
  const sceneSnapshot = captureEditorSceneState();
  pendingSaveRecoverySnapshot = sceneSnapshot;
  pendingSaveRecoveryLabel = 'Level save';
  const data = JSON.parse(buildJSON());
  const filename = makeLevelFilename();

  try {
    sceneResizeLocked = true;

    if (!window.showDirectoryPicker) {
      await downloadJson(filename, data);
      setEditorStatus(`Level downloaded as ${filename}.`, 'success');
      return;
    }

    const dirHandle = await ensureLevelsDirectoryAccess();
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
    setEditorStatus(`Level saved to ${LEVELS_DIR_LABEL} as ${filename}.`, 'success');
  } finally {
    sceneResizeLocked = false;
    restoreEditorSceneState(sceneSnapshot);
    saveEditorDraft();
    setTimeout(recoverCanvasAfterSystemDialog, 0);
    setTimeout(recoverCanvasAfterSystemDialog, 80);
    setTimeout(recoverCanvasAfterSystemDialog, 200);
    setTimeout(verifySceneAfterSave, 0);
    setTimeout(verifySceneAfterSave, 120);
    setTimeout(verifySceneAfterSave, 350);
  }
}

async function loadLevelFromPicker() {
  if (window.showOpenFilePicker) {
    const pickerOptions = {
      multiple: false,
      types: [{ description: 'Level JSON', accept: { 'application/json': ['.json'] } }]
    };
    if (levelsDirHandle) pickerOptions.startIn = levelsDirHandle;
    const [fileHandle] = await window.showOpenFilePicker(pickerOptions);
    if (!fileHandle) return;
    const file = await fileHandle.getFile();
    const data = await readJsonFromFile(file);
    applyLevelData(data);
    return;
  }

  document.getElementById('level-file-input').click();
}

function importJSON() {
  openModal('Import JSON', '', false, 'Load', () => {
    try {
      const data = JSON.parse(document.getElementById('modal-textarea').value);
      applyLevelData(data);
    } catch (err) { alert('Invalid JSON: ' + err.message); }
  });
}

function exportJSON() {
  saveLevelToLevelsFolder().catch(err => {
    if (err?.name !== 'AbortError') setEditorStatus('Failed to save level: ' + err.message, 'error');
  });
}

function openModal(title, text, readOnly, actionLabel, onAction) {
  document.getElementById('modal-title').textContent = title;
  const ta = document.getElementById('modal-textarea'); ta.value = text; ta.readOnly = readOnly;
  const btn = document.getElementById('modal-action-btn'); btn.textContent = actionLabel; btn.onclick = onAction;
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal() { document.getElementById('modal-overlay').classList.remove('open'); }

function drawThumbOrderBadge(tc, order) {
  if (order == null) return;
  tc.fillStyle = 'rgba(130,230,245,0.9)';
  tc.beginPath();
  tc.roundRect(6, 6, 26, 16, 4);
  tc.fill();
  tc.fillStyle = '#0e0f14';
  tc.font = 'bold 10px JetBrains Mono, monospace';
  tc.textAlign = 'center';
  tc.textBaseline = 'middle';
  tc.fillText(String(order), 19, 14);
}

function getPresetThumbSpriteCandidates(entityType, preset) {
  const data = structuredClone(preset?.data ?? {});
  if (!data || typeof data !== 'object') return [];

  if (entityType === 'Enemy') {
    return buildEnemySequencePathCandidates(data, normalizeSpriteIndex(data.spriteAnimationStart, 1));
  }

  if (entityType === 'Macrophage') {
    return buildMacrophageSequencePathCandidates(data, normalizeSpriteIndex(data.spriteAnimationStart, 1));
  }

  if (entityType === 'ComposedStone') {
    return buildComposedStoneSpritePathCandidates(data);
  }

  if (entityType === 'Algae') {
    return buildAlgaeSpritePathCandidates(data);
  }

  if (entityType === 'ComposedEntity') {
    const thumbEntity = {
      ...data,
      type: 'ComposedEntity',
      x: 0,
      y: 0
    };
    ensureComposedEntityDefaults(thumbEntity);
    return buildComposedEntitySpritePathCandidates(thumbEntity);
  }

  return [];
}

function drawPresetThumbSprite(canvasEl, entityType, preset) {
  const candidates = getPresetThumbSpriteCandidates(entityType, preset);
  if (!candidates.length) return false;

  const { img } = getLoadedEditorImage(candidates);
  if (!img || !img.complete || !img.naturalWidth) {
    Promise.allSettled(candidates.map(path => preloadEditorImage(path))).then(() => {
      if (!canvasEl.isConnected) return;
      drawSimpleEntityThumb(canvasEl, entityType, preset, canvasEl.dataset.thumbOrder ? Number(canvasEl.dataset.thumbOrder) : null);
    }).catch(() => {});
    return false;
  }

  const tc = canvasEl.getContext('2d');
  const W = canvasEl.width;
  const H = canvasEl.height;
  const data = preset?.data ?? {};
  const referenceRadius = Math.max(
    8,
    clampNum(
      data.spriteReferenceRadius,
      data.radius ?? getEntityType(entityType)?.defaultRadius ?? 24
    )
  );
  const spriteScale = Math.max(0.01, clampNum(data.spriteScale, 1));
  const sourceAspect = img.naturalHeight / Math.max(img.naturalWidth, 1);
  const baseDrawW = referenceRadius * spriteScale * 2;
  const baseDrawH = baseDrawW * sourceAspect;
  const fitScale = Math.min(
    (W - 20) / Math.max(baseDrawW, 1),
    (H - 16) / Math.max(baseDrawH, 1),
    1.55
  );
  const drawW = Math.max(16, baseDrawW * fitScale);
  const drawH = Math.max(16, baseDrawH * fitScale);
  const anchorX = drawW * clampNum(data.spriteBodyU, 0.5);
  const anchorY = drawH * clampNum(data.spriteBodyV, 0.5);

  tc.save();
  tc.translate(W * 0.5, H * 0.5);
  tc.rotate(clampNum(data.spriteRotationOffset, 0));
  if (data.spriteFlipX) tc.scale(-1, 1);
  tc.drawImage(img, -anchorX, -anchorY, drawW, drawH);
  tc.restore();
  return true;
}

function drawSimpleEntityThumb(canvasEl, entityType, preset, order = null) {
  const tc = canvasEl.getContext('2d');
  const W = canvasEl.width, H = canvasEl.height;
  tc.clearRect(0, 0, W, H);
  canvasEl.dataset.thumbOrder = order == null ? '' : String(order);
  const et = getEntityType(entityType);
  if (entityType === 'ComposedEntity') {
    const thumbEntity = {
      ...(structuredClone(preset?.data ?? {})),
      type: 'ComposedEntity',
      x: W * 0.5,
      y: H * 0.5
    };
    ensureComposedEntityDefaults(thumbEntity);
    const spriteCandidates = buildComposedEntitySpritePathCandidates(thumbEntity);
    const { img } = getLoadedEditorImage(spriteCandidates);
    if (img && img.complete && img.naturalWidth) {
      const drawW = Math.max(30, thumbEntity.spriteReferenceRadius * Math.max(0.45, clampNum(thumbEntity.spriteScale, 1) * 0.55) * 2.0);
      const drawH = drawW * (img.naturalHeight / Math.max(img.naturalWidth, 1));
      const anchorX = drawW * clampNum(thumbEntity.spriteBodyU, 0);
      const anchorY = drawH * clampNum(thumbEntity.spriteBodyV, 0);
      tc.save();
      tc.translate(W * 0.5, H * 0.5);
      tc.rotate(clampNum(thumbEntity.spriteRotationOffset, 0));
      tc.drawImage(img, -anchorX, -anchorY, drawW, drawH);
      tc.restore();
    }
    const children = Array.isArray(thumbEntity.entities) ? thumbEntity.entities.slice(0, 8) : [];
    children.forEach(child => {
      const cx = W * 0.5 + clampNum(child.offsetX, 0) * 0.25;
      const cy = H * 0.5 + clampNum(child.offsetY, 0) * 0.25;
      tc.beginPath();
      tc.arc(cx, cy, 3.5, 0, Math.PI * 2);
      tc.fillStyle = getEntityType(child.type)?.color ?? 'rgba(220,220,220,0.7)';
      tc.fill();
    });
    tc.fillStyle = 'rgba(255,255,255,0.9)';
    tc.font = 'bold 11px JetBrains Mono, monospace';
      tc.textAlign = 'center';
      tc.textBaseline = 'middle';
      tc.fillText('CE', W / 2, H / 2);
    drawThumbOrderBadge(tc, order);
    return;
  }

  if (drawPresetThumbSprite(canvasEl, entityType, preset)) {
    drawThumbOrderBadge(tc, order);
    return;
  }

  const fill = preset?.data?.color || et?.color || 'rgba(180,180,180,0.7)';
  const stroke = et?.strokeColor || 'rgba(255,255,255,0.8)';
  const r = Math.max(10, Math.min(22, preset?.data?.radius ?? et?.defaultRadius ?? 18));
  tc.beginPath(); tc.arc(W/2, H/2, r, 0, Math.PI*2); tc.fillStyle = fill; tc.fill(); tc.strokeStyle = stroke; tc.lineWidth = 2; tc.stroke();
  if (entityType === 'Enemy') {
    const ang = preset?.data?.mouthRestAngle ?? 0;
    tc.beginPath(); tc.moveTo(W/2, H/2); tc.lineTo(W/2 + Math.cos(ang) * (r + 10), H/2 + Math.sin(ang) * (r + 10)); tc.strokeStyle = 'rgba(130,230,245,0.9)'; tc.lineWidth = 2; tc.stroke();
  }
  drawThumbOrderBadge(tc, order);
}

function buildPresetPanel() {
  const list = document.getElementById('stentor-preset-list');
  if (!list) return;
  list.innerHTML = '';
  const type = activeTool;
  if (!PRESET_PANEL_TYPES.includes(type)) return;

  const titleEl = document.getElementById('stentor-panel-title');
  if (titleEl) titleEl.textContent = type === 'Stentor' ? 'Stentor Presets' : `${type} Presets`;
  const saveBtn = document.getElementById('stentor-panel-save');
  if (saveBtn) {
    saveBtn.style.display = 'block';
    saveBtn.textContent = type === 'ComposedEntity' ? 'calibrate sprite' : '+ save selected as preset';
    saveBtn.title = type === 'ComposedEntity' ? 'Open sprite calibrator for active ComposedEntity preset' : 'Save selected entity as new preset';
  }

  if (type === 'Stentor') {
    STENTOR_PRESETS.forEach((preset, idx) => {
      const card = document.createElement('div');
      card.className = 'stentor-preset-card' + (preset.id === activeStentorPreset ? ' active' : '');
      card.dataset.id = preset.id;
      card.addEventListener('click', () => selectEntityPreset('Stentor', preset.id));
      const thumb = document.createElement('canvas'); thumb.className = 'stentor-preset-thumb'; thumb.width = 160; thumb.height = 76; drawStentorThumb(thumb, preset, idx + 1);
      const label = document.createElement('div'); label.className = 'stentor-preset-name'; label.textContent = `${idx + 1}. ${preset.name}`;
      card.append(thumb, label); list.appendChild(card);
    });
    return;
  }

  const presets = entityPresetsByType[type] ?? [];
  if (!presets.length) {
    const empty = document.createElement('div');
    empty.className = 'stentor-preset-name';
    empty.style.padding = '10px';
    empty.textContent = `No saved ${type} presets yet.`;
    list.appendChild(empty);
    return;
  }
  presets.forEach((preset, idx) => {
    const card = document.createElement('div');
    card.className = 'stentor-preset-card' + (preset.id === activeEntityPreset[type] ? ' active' : '');
    card.dataset.id = preset.id;
    card.addEventListener('click', () => selectEntityPreset(type, preset.id));
    const thumb = document.createElement('canvas'); thumb.className = 'stentor-preset-thumb'; thumb.width = 160; thumb.height = 76; drawSimpleEntityThumb(thumb, type, preset, idx + 1);
    const label = document.createElement('div'); label.className = 'stentor-preset-name'; label.textContent = `${idx + 1}. ${preset.name}`;
    card.append(thumb, label); list.appendChild(card);
  });
}

function selectEntityPreset(type, id) {
  if (type === 'Stentor') {
    activeStentorPreset = id;
  } else {
    activeEntityPreset[type] = id;
  }
  buildPresetPanel();
  render();
}

function drawStentorThumb(canvasEl, preset, order = null) {
  const tc = canvasEl.getContext('2d'); const W = canvasEl.width, H = canvasEl.height; tc.clearRect(0,0,W,H); const previewR = 18;
  const maxDyR = Math.max(...preset.circleRatios.map(c => c.dyR)); const maxRR = Math.max(...preset.circleRatios.map(c => c.rR)); const totalH = (maxDyR*previewR) + (maxRR*previewR) + previewR; const startY = (H-totalH)/2 + previewR;
  for (let i=preset.circleRatios.length-1;i>=0;i--) {
    const cr = preset.circleRatios[i], cx = W/2 + cr.dxR*previewR, cy = startY + cr.dyR*previewR, r = cr.rR*previewR;
    tc.beginPath(); tc.arc(cx,cy,r,0,Math.PI*2); tc.fillStyle = i===0 ? 'rgba(170,80,255,0.82)' : 'rgba(130,80,220,0.65)'; tc.fill(); tc.strokeStyle = i===0 ? '#82e6f5' : 'rgba(130,230,245,0.5)'; tc.lineWidth = i===0 ? 1.5 : 1; tc.stroke();
  }
  drawThumbOrderBadge(tc, order);
}

async function fetchJsonMaybe(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`HTTP ${response.status} for ${path}`);
  }
  return response.json();
}

async function fetchTextMaybe(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`HTTP ${response.status} for ${path}`);
  }
  return response.text();
}

function extractDirectoryEntryNames(html) {
  if (!html) return [];
  const names = [];
  const seen = new Set();
  const hrefRe = /href=["']([^"']+)["']/gi;
  let match;
  while ((match = hrefRe.exec(html))) {
    let raw = match[1];
    if (!raw || raw.startsWith('?') || raw.startsWith('#') || raw === '../') continue;
    raw = raw.split('?')[0].split('#')[0];
    try { raw = decodeURIComponent(raw); } catch {}
    raw = raw.replace(/\/$/, '');
    if (!raw || raw.includes('/') || seen.has(raw)) continue;
    seen.add(raw);
    names.push(raw);
  }
  return names;
}

async function listDirectoryEntryNames(path) {
  const base = String(path || '').replace(/\/?$/, '/');
  const html = await fetchTextMaybe(base);
  return html ? extractDirectoryEntryNames(html) : [];
}

function normalizeEntityPresetRecord(entityType, fileData, fallback) {
  if (!fileData || typeof fileData !== 'object') return null;

  if (fileData.type === 'EntityPreset' && fileData.entityType === entityType && fileData.data) {
    return {
      id: fileData.id ?? fallback.id,
      name: fileData.name ?? fallback.name,
      data: fileData.data
    };
  }

  return {
    id: fileData.id ?? fallback.id,
    name: fileData.name ?? fallback.name,
    data: {
      ...fileData,
      type: entityType
    }
  };
}

function normalizeComposedEntityPresetDataForEditor(data) {
  const childEntities = Array.isArray(data?.entities)
    ? data.entities.map(child => ({ ...child, offsetX: clampNum(child.offsetX, 0), offsetY: clampNum(child.offsetY, 0) }))
    : [];
  const width = Math.max(12, clampNum(data?.width, data?.bounds?.width ?? 80));
  const height = Math.max(12, clampNum(data?.height, data?.bounds?.height ?? 80));
  return {
    ...data,
    type: 'ComposedEntity',
    name: typeof data?.name === 'string' && data.name.trim() ? data.name.trim() : 'ComposedEntity',
    anchorMode: 'top-left',
    spriteIndex: normalizeSpriteIndex(data?.spriteIndex, 1),
    spriteSubfolder: getComposedEntitySpriteFolderName({
      ...data,
      spriteIndex: normalizeSpriteIndex(data?.spriteIndex, 1)
    }, data?.spriteSubfolder),
    spriteScale: clampNum(data?.spriteScale, 1),
    spriteRotationOffset: clampNum(data?.spriteRotationOffset, 0),
    spriteBodyU: clampNum(data?.spriteBodyU, 0),
    spriteBodyV: clampNum(data?.spriteBodyV, 0),
    spriteDebug: data?.spriteDebug == null ? true : !!data?.spriteDebug,
    spriteReferenceRadius: Math.max(2, clampNum(data?.spriteReferenceRadius, Math.max(width, height) * 0.5)),
    width,
    height,
    bounds: {
      minX: clampNum(data?.bounds?.minX, 0),
      minY: clampNum(data?.bounds?.minY, 0),
      maxX: clampNum(data?.bounds?.maxX, width),
      maxY: clampNum(data?.bounds?.maxY, height),
      width,
      height
    },
    entities: childEntities
  };
}

function normalizeEnemyPresetDataForEditor(data, fallbackIndex = 1) {
  const radius = Math.max(2, Number(data?.radius ?? 25) || 25);

  const bodyCircles = Array.isArray(data?.bodyCircles) && data.bodyCircles.length
    ? data.bodyCircles.map((circle, index) => ({
        dx: Number.isFinite(Number(circle?.dx))
          ? Number(circle.dx)
          : Math.round((Number(circle?.dxR ?? 0) || 0) * radius),
        dy: Number.isFinite(Number(circle?.dy))
          ? Number(circle.dy)
          : Math.round((Number(circle?.dyR ?? 0) || 0) * radius),
        r: Math.max(
          2,
          Number.isFinite(Number(circle?.r))
            ? Number(circle.r)
            : Math.round((Number(circle?.rR ?? (index === 0 ? 1 : 0.65)) || 0) * radius)
        )
      }))
    : makeDefaultEnemyBodyCircles(radius);

  const innerArtifacts = Array.isArray(data?.innerArtifacts)
    ? data.innerArtifacts.map(artifact => ({
        dx: Number.isFinite(Number(artifact?.dx))
          ? Number(artifact.dx)
          : Math.round((Number(artifact?.dxR ?? 0) || 0) * radius),
        dy: Number.isFinite(Number(artifact?.dy))
          ? Number(artifact.dy)
          : Math.round((Number(artifact?.dyR ?? 0) || 0) * radius),
        radius: Math.max(
          2,
          Number.isFinite(Number(artifact?.radius))
            ? Number(artifact.radius)
            : Math.round((Number(artifact?.rR ?? 0.25) || 0) * radius)
        ),
        spriteIndex: Math.min(ENEMY_SPRITE_INDEX_MAX, normalizeSpriteIndex(artifact?.spriteIndex, 1))
      }))
    : [];

  return {
    ...data,
    radius,
    spriteIndex: normalizeSpriteIndex(data?.spriteIndex, fallbackIndex),
    bodyCircles,
    innerArtifacts
  };
}

function normalizeMacrophagePresetDataForEditor(data, fallbackIndex = 1) {
  const radius = Math.max(2, Number(data?.radius ?? 38) || 38);
  const bodyCircles = Array.isArray(data?.bodyCircles) && data.bodyCircles.length
    ? data.bodyCircles.map((circle, index) => ({
        dx: Number.isFinite(Number(circle?.dx))
          ? Number(circle.dx)
          : Math.round((Number(circle?.dxR ?? 0) || 0) * radius),
        dy: Number.isFinite(Number(circle?.dy))
          ? Number(circle.dy)
          : Math.round((Number(circle?.dyR ?? 0) || 0) * radius),
        r: Math.max(
          2,
          Number.isFinite(Number(circle?.r))
            ? Number(circle.r)
            : Math.round((Number(circle?.rR ?? (index === 0 ? 1 : 0.55)) || 0) * radius)
        )
      }))
    : makeDefaultMacrophageBodyCircles(radius);

  const digestPath = data?.digestPath && typeof data.digestPath === 'object'
    ? Object.fromEntries(
        getMacrophageDigestPathPointKeys(data.digestPath)
          .filter(key => data.digestPath?.[key])
          .map(key => [
            key,
            {
              dx: Number.isFinite(Number(data.digestPath[key]?.dx))
                ? Number(data.digestPath[key].dx)
                : Math.round((Number(data.digestPath[key]?.dxR ?? 0) || 0) * radius),
              dy: Number.isFinite(Number(data.digestPath[key]?.dy))
                ? Number(data.digestPath[key].dy)
                : Math.round((Number(data.digestPath[key]?.dyR ?? 0) || 0) * radius)
            }
          ])
      )
    : makeDefaultMacrophageDigestPath(radius, data?.mouth?.offsetDistance ?? data?.mouthOffsetDistance ?? radius);

  const bodyRotation = data?.bodyRotation && typeof data.bodyRotation === 'object'
    ? {
        ...makeDefaultMacrophageBodyRotation(),
        ...data.bodyRotation,
        idleWave: {
          ...makeDefaultMacrophageBodyRotation().idleWave,
          ...(data.bodyRotation?.idleWave && typeof data.bodyRotation.idleWave === 'object'
            ? data.bodyRotation.idleWave
            : {}),
          enabled: data.bodyRotation?.idleWave?.enabled ?? false,
          amount: Math.max(0, Math.min(1, clampNum(data.bodyRotation?.idleWave?.amount, 0.35))),
          speedHz: Math.max(0, clampNum(data.bodyRotation?.idleWave?.speedHz, 0.45))
        },
        rotationMode: data.bodyRotation?.rotationMode === 'loop' ? 'loop' : 'pingpong',
        baseAngleDeg: normalizeSignedDeg(clampNum(data.bodyRotation?.baseAngleDeg, 0)),
        movementFollow: {
          ...makeDefaultMacrophageBodyRotation().movementFollow,
          ...(data.bodyRotation?.movementFollow && typeof data.bodyRotation.movementFollow === 'object'
            ? data.bodyRotation.movementFollow
            : {}),
          enabled: data.bodyRotation?.movementFollow?.enabled ?? false,
          strength: Math.max(0, Math.min(1, clampNum(data.bodyRotation?.movementFollow?.strength, 0.35))),
          smoothing: Math.max(0, Math.min(1, clampNum(data.bodyRotation?.movementFollow?.smoothing, 0.08))),
          minSpeed: Math.max(0, clampNum(data.bodyRotation?.movementFollow?.minSpeed, 0.18))
        },
        pivotDx: Number.isFinite(Number(data.bodyRotation?.pivotDx))
          ? Number(data.bodyRotation.pivotDx)
          : Math.round((Number(data.bodyRotation?.pivotDxR ?? 0) || 0) * radius),
        pivotDy: Number.isFinite(Number(data.bodyRotation?.pivotDy))
          ? Number(data.bodyRotation.pivotDy)
          : Math.round((Number(data.bodyRotation?.pivotDyR ?? 0) || 0) * radius),
        pivotRadius: Math.max(
          4,
          Number.isFinite(Number(data.bodyRotation?.pivotRadius))
            ? Number(data.bodyRotation.pivotRadius)
            : Math.round((Number(data.bodyRotation?.pivotRadiusR ?? (12 / Math.max(radius, 0.0001))) || 0) * radius)
        )
      }
    : makeDefaultMacrophageBodyRotation();
  const orbit = data?.orbit && typeof data.orbit === 'object'
    ? {
        ...makeDefaultMacrophageOrbit(),
        ...data.orbit,
        mode: ['orbit', 'segments', 'spline', 'free'].includes(data.orbit.mode) ? data.orbit.mode : (Array.isArray(data.orbit?.splinePoints) && data.orbit.splinePoints.length > 2 ? 'spline' : (Array.isArray(data.orbit?.segments) && data.orbit.segments.length ? 'segments' : 'orbit')),
        enabled: data.orbit.enabled ?? false,
        centerDx: Number.isFinite(Number(data.orbit?.centerDx))
          ? Number(data.orbit.centerDx)
          : Math.round((Number(data.orbit?.centerDxR ?? 0) || 0) * radius),
        centerDy: Number.isFinite(Number(data.orbit?.centerDy))
          ? Number(data.orbit.centerDy)
          : Math.round((Number(data.orbit?.centerDyR ?? 0) || 0) * radius),
        radius: Math.max(
          0,
          Number.isFinite(Number(data.orbit?.radius))
            ? Number(data.orbit.radius)
            : Number(data.orbit?.radiusPx ?? 0) || 0
        ),
        speed: clampNum(data.orbit?.speed, 0.01),
        loop: data.orbit.loop ?? true,
        segments: Array.isArray(data.orbit?.segments)
          ? data.orbit.segments.map(segment => makeDefaultMacrophageOrbitSegment({
              ...segment,
              centerDx: Number.isFinite(Number(segment?.centerDx))
                ? Number(segment.centerDx)
                : Math.round((Number(segment?.centerDxR ?? 0) || 0) * radius),
              centerDy: Number.isFinite(Number(segment?.centerDy))
                ? Number(segment.centerDy)
                : Math.round((Number(segment?.centerDyR ?? 0) || 0) * radius),
              radius: Math.max(
                0,
                Number.isFinite(Number(segment?.radius))
                  ? Number(segment.radius)
                  : Number(segment?.radiusPx ?? 0) || 0
              )
            }))
          : [],
        splinePoints: Array.isArray(data.orbit?.splinePoints) && data.orbit.splinePoints.length > 2
          ? data.orbit.splinePoints.map(point => ({
              dx: Number.isFinite(Number(point?.dx))
                ? Number(point.dx)
                : Math.round((Number(point?.dxR ?? point?.dxNorm ?? 0) || 0) * radius),
              dy: Number.isFinite(Number(point?.dy))
                ? Number(point.dy)
                : Math.round((Number(point?.dyR ?? point?.dyNorm ?? 0) || 0) * radius)
            }))
          : makeDefaultMacrophageOrbitSplinePoints(Math.max(Number(data.orbit?.radius ?? 0) || 0, radius * 2.4, 80)),
        freeMove: makeDefaultMacrophageFreeMove({
          ...data.orbit?.freeMove,
          previewRadius: Math.max(
            12,
            Number.isFinite(Number(data.orbit?.freeMove?.previewRadius))
              ? Number(data.orbit.freeMove.previewRadius)
              : Number(data.orbit?.freeMove?.previewRadiusPx ?? 0) || 140
          )
        })
      }
    : makeDefaultMacrophageOrbit();
  const absorbTargets = data?.absorbTargets && typeof data.absorbTargets === 'object'
    ? {
        ...makeDefaultMacrophageAbsorbTargets(),
        ...data.absorbTargets,
        particle: data.absorbTargets.particle !== false,
        projectile: !!data.absorbTargets.projectile,
        player: !!data.absorbTargets.player,
        enemy: !!data.absorbTargets.enemy
      }
    : makeDefaultMacrophageAbsorbTargets();
  const eggSpawn = data?.eggSpawn && typeof data.eggSpawn === 'object'
    ? {
        ...makeDefaultMacrophageEggSpawn(),
        ...data.eggSpawn,
        bodyCircleIndex: Math.max(0, Math.round(Number(data.eggSpawn.bodyCircleIndex ?? 1) || 0)),
        angleDeg: normalizeSignedDeg(clampNum(data.eggSpawn.angleDeg, 25)),
        feedCount: Math.max(1, Math.round(Number(data.eggSpawn.feedCount ?? 6) || 6))
      }
    : makeDefaultMacrophageEggSpawn();
  const germinationStartScale = data?.germination && typeof data.germination === 'object'
    ? Math.max(0.1, Math.min(0.95, Number(data.germination.startScale ?? 0.34) || 0.34))
    : 0.34;
  const germination = data?.germination && typeof data.germination === 'object'
    ? {
        ...makeDefaultMacrophageGermination(),
        ...data.germination,
        enabled: data.germination.enabled ?? false,
        mirrorOffspringX: data.germination.mirrorOffspringX ?? false,
        bodyCircleIndex: Math.max(0, Math.round(Number(data.germination.bodyCircleIndex ?? 2) || 0)),
        angleDeg: normalizeSignedDeg(clampNum(data.germination.angleDeg, -30)),
        feedCount: Math.max(1, Math.round(Number(data.germination.feedCount ?? 10) || 10)),
        startScale: germinationStartScale,
        growthRate: Math.max(0.001, Number(data.germination.growthRate ?? 0.08) || 0.08),
        detachScale: Math.max(germinationStartScale, Math.min(1, Number(data.germination.detachScale ?? 0.6) || 0.6)),
        launchSpeed: Math.max(0, Number(data.germination.launchSpeed ?? 0.35) || 0.35),
        launchJitter: Math.max(0, Math.min(1, Number(data.germination.launchJitter ?? 0.18) || 0)),
        initialAngleJitterDeg: Math.max(0, Number(data.germination.initialAngleJitterDeg ?? 8) || 8),
        mouthWakeDelayMs: Math.max(0, Math.round(Number(data.germination.mouthWakeDelayMs ?? 260) || 260))
      }
    : makeDefaultMacrophageGermination();
  const projectileSpawn = data?.projectileSpawn && typeof data.projectileSpawn === 'object'
    ? {
        ...makeDefaultMacrophageProjectileSpawn(),
        ...data.projectileSpawn,
        bodyCircleIndex: Math.max(0, Math.round(Number(data.projectileSpawn.bodyCircleIndex ?? 0) || 0)),
        angleDeg: normalizeSignedDeg(clampNum(data.projectileSpawn.angleDeg, 180))
      }
    : makeDefaultMacrophageProjectileSpawn();
  const growth = data?.growth && typeof data.growth === 'object'
    ? {
        ...makeDefaultMacrophageGrowth(),
        ...data.growth,
        enabled: data.growth.enabled ?? false,
        perAbsorb: Math.max(0, Number(data.growth.perAbsorb ?? 0.6) || 0),
        maxRadius: Math.max(radius, Number(data.growth.maxRadius ?? 76) || 76),
        growthRate: Math.max(0.001, Number(data.growth.growthRate ?? 0.03) || 0.03)
      }
    : makeDefaultMacrophageGrowth();

  return {
    ...data,
    radius,
    gitParticleRadius: Math.max(0.4, Number.isFinite(Number(data?.gitParticleRadius)) ? Number(data.gitParticleRadius) : radius / 8),
    instanceIndex: Math.max(1, Math.round(Number(data?.instanceIndex ?? fallbackIndex) || fallbackIndex)),
    spriteIndex: normalizeSpriteIndex(data?.spriteIndex, fallbackIndex),
    spriteSubfolder: typeof data?.spriteSubfolder === 'string' ? data.spriteSubfolder : '',
    spriteAnimationSubfolder: data?.spriteAnimationSubfolder ?? data?.spriteSubfolder ?? '',
    spriteAnimationMode: data?.spriteAnimationMode === 'pingpong' ? 'pingpong' : 'loop',
    bodyCircles,
    digestPath,
    bodyRotation,
    orbit,
    absorbTargets,
    eggSpawn,
    germination,
    projectileSpawn,
    growth
  };
}

function normalizeSrcPresetDataForEditor(spec, data, slotNumber, slot, folderEntries = new Set()) {
  if (spec.entityType === 'Enemy') {
    const normalized = normalizeEnemyPresetDataForEditor(data, slotNumber);
    const padding = Math.max(1, Math.round(clampNum(normalized?.spriteAnimationPadding, 5)));
    const startFrame = normalizeSpriteIndex(normalized?.spriteAnimationStart, 1);
    const hasFolderSequence = folderEntries.has(`${formatSequenceFrame(startFrame, padding)}.png`);
    return {
      ...normalized,
      spriteSubfolder: hasFolderSequence ? `${spec.folderPrefix}${slot}` : (normalized?.spriteSubfolder ?? ''),
      spriteAnimationSubfolder: hasFolderSequence
        ? `${spec.folderPrefix}${slot}`
        : (normalized?.spriteAnimationSubfolder ?? normalized?.spriteSubfolder ?? '')
    };
  }

  if (spec.entityType === 'Macrophage') {
    return normalizeMacrophagePresetDataForEditor(data, slotNumber);
  }

  if (spec.entityType === 'ComposedStone') {
    const fallbackCircles = Array.isArray(data?.circles) && data.circles.length
      ? data.circles
      : makeDefaultComposedStoneCircles(data?.radius ?? 34);
    return {
      ...data,
      spriteIndex: normalizeSpriteIndex(data?.spriteIndex ?? slotNumber, slotNumber),
      instanceIndex: Math.max(1, Math.round(Number(data?.instanceIndex ?? slotNumber) || slotNumber)),
      spriteSubfolder: `${spec.folderPrefix}${slot}`,
      spriteReferenceRadius: Math.max(2, Number(data?.spriteReferenceRadius ?? fallbackCircles[0]?.r ?? data?.radius ?? 34)),
      spriteScale: clampNum(data?.spriteScale, 1.18),
      spriteRotationOffset: clampNum(data?.spriteRotationOffset, 0),
      spriteBodyU: clampNum(data?.spriteBodyU, 0.5),
      spriteBodyV: clampNum(data?.spriteBodyV, 0.5),
      spriteDebug: data?.spriteDebug == null ? true : !!data?.spriteDebug
    };
  }

  if (spec.entityType === 'Algae') {
    const fallbackCircles = Array.isArray(data?.circles) && data.circles.length
      ? data.circles
      : makeDefaultAlgaeCircles(data?.radius ?? 30);
    return {
      ...data,
      type: 'Algae',
      name: typeof data?.name === 'string' && data.name.trim() ? data.name.trim() : `Algae ${slot}`,
      spriteIndex: normalizeSpriteIndex(data?.spriteIndex ?? slotNumber, slotNumber),
      instanceIndex: Math.max(1, Math.round(Number(data?.instanceIndex ?? slotNumber) || slotNumber)),
      spriteSubfolder: `${spec.folderPrefix}${slot}`,
      spriteReferenceRadius: Math.max(2, Number(data?.spriteReferenceRadius ?? fallbackCircles[0]?.r ?? data?.radius ?? 30)),
      spriteScale: clampNum(data?.spriteScale, 1.08),
      spriteRotationOffset: clampNum(data?.spriteRotationOffset, 0),
      spriteBodyU: clampNum(data?.spriteBodyU, 0.5),
      spriteBodyV: clampNum(data?.spriteBodyV, 0.5),
      spriteDebug: data?.spriteDebug == null ? false : !!data?.spriteDebug
    };
  }

  return data;
}

function addLoadedPreset(loadedByType, entityType, preset) {
  const presets = loadedByType[entityType] ?? (loadedByType[entityType] = []);
  const existingIndex = presets.findIndex(existing =>
    (preset.sourcePath && existing.sourcePath === preset.sourcePath) ||
    (preset.id && existing.id === preset.id)
  );
  if (existingIndex >= 0) {
    presets[existingIndex] = preset;
    return;
  }
  presets.push(preset);
}

async function loadIndexedSrcPresetsFromDirectoryHandle(srcHandle, loadedByType) {
  for (const spec of Object.values(SRC_PRESET_CONFIGS)) {
    let typeDirHandle = null;
    try {
      typeDirHandle = await srcHandle.getDirectoryHandle(spec.folder);
    } catch (_) {
      continue;
    }

    const slots = [];
    for await (const entry of typeDirHandle.values()) {
      if (entry.kind !== 'directory') continue;
      const match = entry.name.match(new RegExp(`^${spec.folderPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`, 'i'));
      if (!match) continue;
      slots.push({ slotNumber: Number(match[1]), entry });
    }

    const sortedSlots = slots
      .filter(item => Number.isFinite(item.slotNumber))
      .sort((a, b) => a.slotNumber - b.slotNumber)
      .slice(0, AUTO_PRESET_SCAN_LIMIT);

    for (const item of sortedSlots) {
      const slot = formatPresetSlot(item.slotNumber);
      const folderEntries = new Set();
      const candidateNames = [
        `${spec.jsonPrefix}${slot}.json`,
        `${spec.folderPrefix}${slot}.json`
      ].map(name => name.toLowerCase());
      let jsonEntry = null;

      for await (const subEntry of item.entry.values()) {
        folderEntries.add(subEntry.name);
        if (subEntry.kind === 'file' && candidateNames.includes(subEntry.name.toLowerCase())) {
          jsonEntry = subEntry;
        }
      }
      if (!jsonEntry) continue;

      const file = await jsonEntry.getFile();
      const fileData = JSON.parse(await file.text());
      const sourcePath = `src/${spec.folder}/${spec.folderPrefix}${slot}/${jsonEntry.name}`;
      const preset = normalizeEntityPresetRecord(spec.entityType, fileData, {
        id: `${spec.entityType.toLowerCase()}_${slot}`,
        name: `${spec.entityType} ${slot}`,
        sourcePath
      });
      if (!preset) continue;

      preset.sourcePath = sourcePath;
      preset.data = normalizeSrcPresetDataForEditor(spec, preset.data, item.slotNumber, slot, folderEntries);
      addLoadedPreset(loadedByType, spec.entityType, preset);
    }
  }
}

async function loadAutoEntityPresetsFromSrc() {
  const loadedByType = { Enemy: [], Macrophage: [], Stone: [], ComposedStone: [], Obstacle: [], Algae: [], ComposedEntity: [] };

  try {
    const srcRootEntries = new Set(await listDirectoryEntryNames(`${PRESET_SOURCE_ROOT}/`));

    for (const spec of Object.values(SRC_PRESET_CONFIGS)) {
      if (!srcRootEntries.has(spec.folder)) continue;

      const rootPath = `${PRESET_SOURCE_ROOT}/${spec.folder}`;
      const rootEntries = await listDirectoryEntryNames(rootPath);
      const slots = rootEntries
        .map(name => {
          const match = name.match(new RegExp(`^${spec.folderPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`, 'i'));
          return match ? Number(match[1]) : null;
        })
        .filter(Number.isFinite)
        .sort((a, b) => a - b)
        .slice(0, AUTO_PRESET_SCAN_LIMIT);

      for (const slotNumber of slots) {
        const slot = formatPresetSlot(slotNumber);
        const basePath = `${PRESET_SOURCE_ROOT}/${spec.folder}/${spec.folderPrefix}${slot}`;
        const folderEntries = new Set(await listDirectoryEntryNames(basePath));
        const candidateNames = [
          `${spec.jsonPrefix}${slot}.json`,
          `${spec.folderPrefix}${slot}.json`
        ];
        const jsonName = candidateNames.find(name => folderEntries.has(name));
        if (!jsonName) continue;

        let fileData = null;
        const resolvedPath = `${basePath}/${jsonName}`;
        fileData = await fetchJsonMaybe(resolvedPath);
        if (!fileData) continue;

        const preset = normalizeEntityPresetRecord(spec.entityType, fileData, {
          id: `${spec.entityType.toLowerCase()}_${slot}`,
          name: `${spec.entityType} ${slot}`,
          sourcePath: resolvedPath
        });
        if (!preset) continue;

        preset.sourcePath = resolvedPath;
        preset.data = normalizeSrcPresetDataForEditor(spec, preset.data, slotNumber, slot, folderEntries);
        addLoadedPreset(loadedByType, spec.entityType, preset);
      }
    }
  } catch (err) {
    console.warn('HTTP src preset scan failed; project folder scan will be used if available.', err);
  }

  if (projectRootHandle) {
    try {
      const srcHandle = await ensureSrcDirectoryAccess();
      await loadIndexedSrcPresetsFromDirectoryHandle(srcHandle, loadedByType);

      const composedEntityDir = await srcHandle.getDirectoryHandle('ComposedEntity');
      for await (const entry of composedEntityDir.values()) {
        if (entry.kind === 'directory') {
          let jsonEntry = null;
          for await (const subEntry of entry.values()) {
            if (subEntry.kind === 'file' && subEntry.name.toLowerCase().endsWith('.json')) {
              jsonEntry = subEntry;
              break;
            }
          }
          if (!jsonEntry) continue;
          const file = await jsonEntry.getFile();
          const fileData = JSON.parse(await file.text());
          const baseName = entry.name;
          const preset = normalizeEntityPresetRecord('ComposedEntity', fileData, {
            id: `composedentity_${makeSafeFilename(baseName)}`,
            name: fileData?.name ?? baseName,
            sourcePath: `src/ComposedEntity/${entry.name}/${jsonEntry.name}`
          });
          if (!preset) continue;
          preset.sourcePath = `src/ComposedEntity/${entry.name}/${jsonEntry.name}`;
          preset.data = normalizeComposedEntityPresetDataForEditor(preset.data);
          addLoadedPreset(loadedByType, 'ComposedEntity', preset);
          continue;
        }

        if (entry.kind !== 'file' || !entry.name.toLowerCase().endsWith('.json')) continue;
        const file = await entry.getFile();
        const fileData = JSON.parse(await file.text());
        const baseName = entry.name.replace(/\.json$/i, '');
        const preset = normalizeEntityPresetRecord('ComposedEntity', fileData, {
          id: `composedentity_${makeSafeFilename(baseName)}`,
          name: fileData?.name ?? baseName,
          sourcePath: `src/ComposedEntity/${entry.name}`
        });
        if (!preset) continue;
        preset.sourcePath = `src/ComposedEntity/${entry.name}`;
        preset.data = normalizeComposedEntityPresetDataForEditor(preset.data);
        addLoadedPreset(loadedByType, 'ComposedEntity', preset);
      }
    } catch (_) {}
  }

  return loadedByType;
}

function presetToFileObject(preset, orderIndex) { return { version:1, type:'StentorPreset', entityType:'Stentor', id:preset.id, name:preset.name, orderIndex, circleRatios:preset.circleRatios }; }
function entityPresetToFileObject(entityType, preset, orderIndex) { return { version:1, type:'EntityPreset', entityType, id:preset.id, name:preset.name, orderIndex, data:preset.data }; }
async function ensureEntitiesDir() { if (!projectDirHandle) throw new Error('Project folder is not selected. Click "Pick Project Folder" first.'); entitiesDirHandle = await projectDirHandle.getDirectoryHandle('Entities', { create:true }); updateProjectDisplay(); return entitiesDirHandle; }
async function writeJsonFile(dirHandle, filename, data) { const fileHandle = await dirHandle.getFileHandle(filename, { create:true }); const writable = await fileHandle.createWritable(); await writable.write(JSON.stringify(data, null, 2)); await writable.close(); }
async function readJsonFile(dirHandle, filename) { const fileHandle = await dirHandle.getFileHandle(filename); const file = await fileHandle.getFile(); return JSON.parse(await file.text()); }
async function saveEntitiesManifest() {
  const dir = await ensureEntitiesDir();
  const items = [];
  STENTOR_PRESETS.forEach((preset, i) => items.push({ entityType:'Stentor', id:preset.id, name:preset.name, orderIndex:i+1, file:`Stentor_${String(i+1).padStart(3,'0')}_${makeSafeFilename(preset.name)}.json` }));
  for (const type of ['Enemy','Macrophage','Stone','ComposedStone','Algae','Obstacle']) {
    (entityPresetsByType[type] ?? []).forEach((preset, i) => items.push({ entityType:type, id:preset.id, name:preset.name, orderIndex:i+1, file:`${type}_${String(i+1).padStart(3,'0')}_${makeSafeFilename(preset.name)}.json` }));
  }
  await writeJsonFile(dir, 'manifest.json', { version:1, type:'EntityPresetManifest', items });
}

async function saveAllEntitiesToFolder() {
  try {
    const dir = await ensureEntitiesDir();
    for (let i=0;i<STENTOR_PRESETS.length;i++) await writeJsonFile(dir, `Stentor_${String(i+1).padStart(3,'0')}_${makeSafeFilename(STENTOR_PRESETS[i].name)}.json`, presetToFileObject(STENTOR_PRESETS[i], i+1));
    for (const type of ['Enemy','Macrophage','Stone','ComposedStone','Algae','Obstacle']) {
      const presets = entityPresetsByType[type] ?? [];
      for (let i=0;i<presets.length;i++) await writeJsonFile(dir, `${type}_${String(i+1).padStart(3,'0')}_${makeSafeFilename(presets[i].name)}.json`, entityPresetToFileObject(type, presets[i], i+1));
    }
    await saveEntitiesManifest();
    alert(`Saved entity presets to ${projectDirHandle.name}/Entities`);
  } catch (err) { alert('Failed to save preset library: ' + err.message); }
}

async function pickProjectFolder() {
  try {
    if (!window.showDirectoryPicker) return alert('This browser does not support folder access. Use Chrome or Edge.');
    projectDirHandle = await window.showDirectoryPicker({ mode:'readwrite' }); entitiesDirHandle = await projectDirHandle.getDirectoryHandle('Entities', { create:true }); updateProjectDisplay(); alert(`Project folder selected.
Using: ${projectDirHandle.name}/Entities`);
  } catch (err) { if (err?.name !== 'AbortError') alert('Failed to select project folder: ' + err.message); }
}

async function loadEntitiesFromFolder({ silent = false } = {}) {
  try {
    let loadedByType = await loadAutoEntityPresetsFromSrc();
    let total = Object.values(loadedByType).reduce((sum, presets) => sum + presets.length, 0);
    if (!silent && !total && !projectRootHandle && window.showDirectoryPicker) {
      await ensureProjectRootAccess();
      loadedByType = await loadAutoEntityPresetsFromSrc();
      total = Object.values(loadedByType).reduce((sum, presets) => sum + presets.length, 0);
    }

    entityPresetsByType = loadedByType;
    for (const type of Object.keys(activeEntityPreset)) activeEntityPreset[type] = loadedByType[type][0]?.id ?? null;
    buildPresetPanel();
    renderProps();
    render();

    if (!silent) {
      alert(total ? `Loaded ${total} entity preset(s) from src.` : 'No entity preset JSON files found in src.');
    }
  } catch (err) {
    console.warn('Failed to load entity presets from src:', err);
    if (!silent) alert('Failed to load entity presets from src: ' + err.message);
  }
}

function buildEntityPresetData(sel) {
  const data = structuredClone(sel);
  delete data._id;
  delete data.x;
  delete data.y;
  delete data.instanceIndex;
  if (sel?.type === 'Player') {
    delete data.circles;
    delete data.bodyCircles;
  }
  return data;
}

async function saveCurrentAsEntityPreset() {
  const sel = getSelected();
  if (!sel || !INDEXED_TYPES.includes(sel.type)) return setEditorStatus('Select an indexed entity first.', 'warning');
  if (sel.type === 'Stentor') {
    const r0 = sel.circles[0].r || 1; const defaultName = `Custom ${STENTOR_PRESETS.length + 1}`; const name = prompt('Preset name:', defaultName); if (!name) return;
    const newPreset = { id:'custom_' + Date.now(), name:name.trim() || defaultName, circleRatios: sel.circles.map(c => ({ dxR: parseFloat((c.dx/r0).toFixed(3)), dyR: parseFloat((c.dy/r0).toFixed(3)), rR: parseFloat((c.r/r0).toFixed(3)) })) };
    setStentorPresets([...STENTOR_PRESETS, newPreset]); activeStentorPreset = newPreset.id; buildPresetPanel(); activeIndex.Stentor = getNextInstanceIndex('Stentor'); selectTool('Stentor');
  } else {
    const presets = entityPresetsByType[sel.type] ?? [];
    const defaultName = `${sel.type} ${presets.length + 1}`;
    const name = prompt('Preset name:', defaultName); if (!name) return;
    const newPreset = { id:`${sel.type.toLowerCase()}_${Date.now()}`, name:name.trim() || defaultName, data: buildEntityPresetData(sel) };
    entityPresetsByType[sel.type] = [...presets, newPreset];
    activeEntityPreset[sel.type] = newPreset.id;
    buildPresetPanel();
    selectTool(sel.type);
  }
  if (sel.type === 'Enemy') {
    const exported = buildSelectedEnemyExport(sel);
    const slot = formatPresetSlot(exported.spriteIndex ?? exported.instanceIndex, 2);
    await downloadJson(`enemy_${slot}.json`, exported);
    setEditorStatus(`Enemy preset exported as enemy_${slot}.json.`, 'success');
  } else if (sel.type === 'ComposedStone') {
    const exported = buildSelectedComposedStoneExport(sel);
    const slot = formatPresetSlot(getPresetSlotIndexForEntity(sel), 2);
    await downloadJson(`compoundstone_${slot}.json`, exported);
    setEditorStatus(`ComposedStone preset exported as compoundstone_${slot}.json.`, 'success');
  } else if (sel.type === 'Algae') {
    const exported = buildSelectedAlgaeExport(sel);
    const slot = formatPresetSlot(getPresetSlotIndexForEntity(sel), 2);
    await downloadJson(`algae_${slot}.json`, exported);
    setEditorStatus(`Algae preset exported as algae_${slot}.json.`, 'success');
  }
  renderProps(); render();
}
function bindUI() {
  updateBackgroundButtons();
  buildSpriteCalControls();
  document.getElementById('tool-select').addEventListener('click', () => selectTool('select'));
  document.getElementById('btn-load-bg').addEventListener('click', () => document.getElementById('bg-file-input').click());
  document.getElementById('btn-clear-bg').addEventListener('click', clearBackgroundImage);
  document.getElementById('btn-edit-bg').addEventListener('click', toggleBackgroundEditMode);
  document.getElementById('btn-reset-bg').addEventListener('click', () => {
    fitBackgroundToCanvas();
    render();
  });
  document.getElementById('bg-file-input').addEventListener('change', e => loadBackgroundFile(e.target.files?.[0]));
  document.getElementById('grid-toggle').addEventListener('click', () => { snapToGrid = !snapToGrid; document.getElementById('grid-toggle').classList.toggle('on', snapToGrid); render(); });
  document.getElementById('rand-toggle').addEventListener('click', () => { randSizeEnabled = !randSizeEnabled; document.getElementById('rand-toggle').classList.toggle('on', randSizeEnabled); document.getElementById('rand-inputs').style.display = randSizeEnabled ? 'flex' : 'none'; render(); });
  document.getElementById('rand-min').addEventListener('input', e => randMin = +e.target.value);
  document.getElementById('rand-max').addEventListener('input', e => randMax = +e.target.value);
  document.getElementById('idx-prev').addEventListener('click', () => { if (INDEXED_TYPES.includes(activeTool)) { activeIndex[activeTool] = Math.max(1, (activeIndex[activeTool] ?? 1) - 1); document.getElementById('index-picker-val').value = activeIndex[activeTool]; } });
  document.getElementById('idx-next').addEventListener('click', () => { if (INDEXED_TYPES.includes(activeTool)) { activeIndex[activeTool] = Math.min(999, (activeIndex[activeTool] ?? 1) + 1); document.getElementById('index-picker-val').value = activeIndex[activeTool]; } });
  document.getElementById('index-picker-val').addEventListener('input', e => { if (INDEXED_TYPES.includes(activeTool)) activeIndex[activeTool] = Math.max(1, Math.min(999, Math.round(+e.target.value || 1))); });
  document.getElementById('btn-front').addEventListener('click', bringToFront);
  document.getElementById('btn-back').addEventListener('click', sendToBack);
  document.getElementById('btn-duplicate').addEventListener('click', duplicateSelected);
  document.getElementById('btn-delete-selected').addEventListener('click', deleteSelected);
  document.getElementById('btn-clear-level').addEventListener('click', clearLevel);
  document.getElementById('btn-import-json').addEventListener('click', () => {
    loadLevelFromPicker().catch(err => {
      if (err?.name !== 'AbortError') alert('Failed to load level: ' + err.message);
    });
  });
  document.getElementById('level-file-input').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await readJsonFromFile(file);
      applyLevelData(data);
    } catch (err) {
      alert('Failed to load level: ' + err.message);
    } finally {
      e.target.value = '';
    }
  });
  const btnSaveEnemy=document.getElementById('btn-save-enemy'); if (btnSaveEnemy) btnSaveEnemy.addEventListener('click', () => {
    saveSelectedEnemyJSON().catch(err => {
      if (err?.name !== 'AbortError') setEditorStatus('Failed to save enemy preset: ' + err.message, 'error');
    });
  });
  const btnToggleAnatomy=document.getElementById('btn-toggle-anatomy'); if (btnToggleAnatomy) btnToggleAnatomy.addEventListener('click', () => { enemyAnatomyOverlay = !enemyAnatomyOverlay; btnToggleAnatomy.textContent = `Anatomy Overlay: ${enemyAnatomyOverlay ? 'ON' : 'OFF'}`; renderProps(); render(); });
  document.getElementById('btn-export-json').addEventListener('click', exportJSON);
  document.getElementById('sprite-cal-close').addEventListener('click', closeSpriteCalibrator);
  document.getElementById('sprite-cal-overlay').addEventListener('click', e => { if (e.target.id === 'sprite-cal-overlay') closeSpriteCalibrator(); });
  document.getElementById('sprite-cal-header').addEventListener('mousedown', beginSpriteCalDrag);
  window.addEventListener('mousemove', moveSpriteCalDrag);
  window.addEventListener('mouseup', endSpriteCalDrag);
  document.getElementById('sprite-cal-load-file').addEventListener('click', () => {
    const input = document.getElementById('sprite-cal-file-input');
    input.value = '';
    input.click();
  });
  document.getElementById('sprite-cal-file-input').addEventListener('change', e => {
    loadSpriteCalFile(e.target.files?.[0]);
    e.target.value = '';
  });
  document.getElementById('sprite-cal-load-current').addEventListener('click', () => {
    const sel = getSelected();
    const composedPreset = activeTool === 'ComposedEntity'
      ? entityPresetsByType.ComposedEntity?.find(p => p.id === activeEntityPreset.ComposedEntity) ?? entityPresetsByType.ComposedEntity?.[0] ?? null
      : null;
    const target = composedPreset?.data ?? sel;
    if (!target || !['Enemy', 'ComposedStone', 'Algae', 'Macrophage', 'ComposedEntity'].includes(target.type)) return;
    const spritePath = getEntitySpritePath(target);
    loadSpriteCalImage(spritePath, spritePath);
  });
  document.getElementById('sprite-cal-apply').addEventListener('click', applySpriteCalToSelected);
  document.getElementById('sprite-cal-copy').addEventListener('click', async () => {
    const out = document.getElementById('sprite-cal-output')?.textContent ?? '';
    if (!out) return;
    await navigator.clipboard.writeText(out);
  });
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-close-2').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target === document.getElementById('modal-overlay')) closeModal(); });
  const btnPickFolder = document.getElementById('btn-pick-folder');
  if (btnPickFolder) {
    btnPickFolder.textContent = 'Pick Project Root';
    btnPickFolder.addEventListener('click', async () => {
      try {
        await ensureProjectRootAccess();
        await loadEntitiesFromFolder({ silent: true });
        setEditorStatus('Project root selected and src presets reloaded.', 'success');
      } catch (err) {
        if (err?.name !== 'AbortError') setEditorStatus('Failed to pick project root: ' + err.message, 'error');
      }
    });
  }
  const btnLoadEntities = document.getElementById('btn-load-entities') || document.getElementById('btn-load-stentors'); if (btnLoadEntities) { btnLoadEntities.textContent = 'Reload src presets'; btnLoadEntities.addEventListener('click', () => loadEntitiesFromFolder()); }
  document.getElementById('stentor-panel-close').addEventListener('click', closeStentorPanel);
  document.getElementById('stentor-panel-save').addEventListener('click', () => {
    if (activeTool === 'ComposedEntity') {
      openSpriteCalibrator();
      return;
    }
    saveCurrentAsEntityPreset().catch(err => {
      if (err?.name !== 'AbortError') setEditorStatus('Failed to save preset: ' + err.message, 'error');
    });
  });
  const btnResave = document.getElementById('stentor-panel-resave');
  if (btnResave) btnResave.style.display = 'none';
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName; const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (!isInput) {
      const num = parseInt(e.key); if (!Number.isNaN(num) && num >= 1 && num <= ENTITY_TYPES.length) { selectTool(ENTITY_TYPES[num-1].id); clearSelection(); renderProps(); render(); return; }
      if (e.key === 's' || e.key === 'S') { selectTool('select'); renderProps(); render(); return; }
      if (e.key === 'r' || e.key === 'R') { document.getElementById('rand-toggle').click(); return; }
      if (e.key === 'g' || e.key === 'G') { document.getElementById('grid-toggle').click(); return; }
      if (e.key === 'd' || e.key === 'D') { duplicateSelected(); return; }
      if (e.key === 'e' || e.key === 'E') {
        saveSelectedEnemyJSON().catch(err => {
          if (err?.name !== 'AbortError') setEditorStatus('Failed to save enemy preset: ' + err.message, 'error');
        });
        return;
      }
      if (e.key === 'a' || e.key === 'A') { enemyAnatomyOverlay = !enemyAnatomyOverlay; const btn = document.getElementById('btn-toggle-anatomy'); if (btn) btn.textContent = `Anatomy Overlay: ${enemyAnatomyOverlay ? 'ON' : 'OFF'}`; renderProps(); render(); return; }
      if (e.key === 'm' || e.key === 'M') {
        const sel = getSelected();
        if (sel?.type === 'Macrophage') {
          macrophageMouthOverlay = !macrophageMouthOverlay;
          renderProps();
          render();
          return;
        }
      }
      if (e.key === ']') { bringToFront(); return; }
      if (e.key === '[') { sendToBack(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && (document.activeElement === document.body || document.activeElement === canvas)) deleteSelected();
    }
    if (e.key === 'Escape') { selectTool('select'); clearSelection(); renderProps(); render(); }
  });
}

buildToolbar();
buildPresetPanel();
bindUI();
bindCanvas();
restoreEditorDraftIfNeeded(true);
restoreFullEditorDraftIfNeeded(true).catch(() => {});
resizeCanvas();
selectTool('select');
renderProps();
updateProjectDisplay();
restoreProjectRootHandleSilently();
window.addEventListener('focus', recoverCanvasAfterSystemDialog);
window.addEventListener('pageshow', recoverCanvasAfterSystemDialog);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) recoverCanvasAfterSystemDialog();
});
window.addEventListener('beforeunload', saveEditorDraft);
render();
loadEntitiesFromFolder({ silent: true });
startAnimationLoop();


